/**
 * What the launcher decides, kept apart from the process that acts on it (`cli.ts`).
 *
 * DEPLOYABILITY.md R4, for F4, F8 and F9. Starting the app took environment variables in bash-only
 * syntax, which PowerShell and cmd both refuse; an older Node 22 died with
 * `ERR_UNKNOWN_BUILTIN_MODULE`; a busy port printed a stack trace; and started through a directory
 * junction the API exited 0 without a word. Each of those is answered here, where a test can reach
 * it.
 *
 * NOTHING HERE MAY IMPORT `node:sqlite`, directly or through another module: `cli.ts` imports this
 * file before it has checked the Node version, and on a Node without `node:sqlite` that import
 * would fail before the check could say why.
 */

import { realpathSync, statSync } from "node:fs";
import { createServer } from "node:net";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const USAGE = `Usage: npm start "<folder of images>"
   or: lazylabel.cmd "<folder>" [options]      (Windows: PowerShell or cmd, in modernized/)
   or: ./lazylabel.sh "<folder>" [options]     (macOS, Linux, Git Bash, in modernized/)

Options:
  --port <number>      the port to serve on (default 8787)
  --host <address>     the address to listen on (default 127.0.0.1, this computer only)
  --db <file>          where settings and hotkeys are kept, or :memory: to keep them nowhere
  --inference <url>    the AI inference service, such as http://127.0.0.1:8788 (default: none)
  --no-open            do not open the browser (BROWSER=none does the same)
  --verbose            log every request
  -h, --help           show this

The folder may also come from LAZYLABEL_DATASET_ROOT, and every option from the variable the
API's README names. In PowerShell, "npm start" drops the "--" that options after it need, so use
lazylabel.cmd for options there.`;

/** Node's first release line with `node:sqlite` unflagged: 22.13, and 23.4 on the odd line. */
export function nodeVersionProblem(version: string): string | null {
  const [major = 0, minor = 0] = version.replace(/^v/, "").split(".").map((part) => Number(part));
  const supported = major >= 24 || (major === 23 && minor >= 4) || (major === 22 && minor >= 13);
  if (supported) return null;
  return (
    `LazyLabel needs Node.js 22.13 or later, and this is Node.js ${version.replace(/^v/, "")}. `
    + "Install the current LTS from https://nodejs.org/ and start LazyLabel again."
  );
}

export interface LaunchOptions {
  /** The variables the command line sets. They win over the process's own. */
  readonly env: Readonly<Record<string, string>>;
  readonly open: boolean;
  readonly verbose: boolean;
}

export type Parsed =
  | { readonly kind: "launch"; readonly options: LaunchOptions }
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string };

const VALUED: Readonly<Record<string, string>> = {
  "--port": "LAZYLABEL_PORT",
  "--host": "LAZYLABEL_HOST",
  "--db": "LAZYLABEL_DB",
  "--inference": "LAZYLABEL_INFERENCE_URL",
};

/**
 * The command line, as `lazylabel [folder] [options]`.
 *
 * Relative paths are resolved against `cwd`, which `cli.ts` takes from npm's INIT_CWD: `npm start`
 * runs its script in the package's folder, not the one the user typed the command in.
 */
export function parseArguments(
  args: readonly string[],
  context: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly platform: NodeJS.Platform },
): Parsed {
  const env: Record<string, string> = {};
  const folders: string[] = [];
  let open = true;
  let verbose = false;
  let optionsEnded = false;

  const words = context.platform === "win32" ? repairWindowsQuoting(args) : [...args];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    if (optionsEnded || !word.startsWith("-") || word === "-") {
      folders.push(word);
      continue;
    }
    if (word === "--") {
      optionsEnded = true;
      continue;
    }
    if (word === "-h" || word === "--help") return { kind: "help" };
    if (word === "--no-open") {
      open = false;
      continue;
    }
    if (word === "--verbose") {
      verbose = true;
      continue;
    }

    const equals = word.indexOf("=");
    const name = equals === -1 ? word : word.slice(0, equals);
    const variable = VALUED[name];
    if (variable === undefined) return { kind: "error", message: `There is no option ${name}.` };
    let value: string | undefined;
    if (equals === -1) {
      index += 1;
      value = words[index];
    } else {
      value = word.slice(equals + 1);
    }
    if (value === undefined || value === "" || (equals === -1 && value.startsWith("--"))) {
      return { kind: "error", message: `${name} needs a value, as in ${name} ${example(name)}.` };
    }
    if (name === "--port" && !isPort(value)) {
      return { kind: "error", message: `--port needs a port number from 1 to 65535, not "${value}".` };
    }
    env[variable] = name === "--db" && value !== ":memory:" ? path.resolve(context.cwd, value) : value;
  }

  if (folders.length > 1) return { kind: "error", message: tooManyFolders(folders, context.platform) };
  const [folder] = folders;
  if (folder !== undefined) {
    env["LAZYLABEL_DATASET_ROOT"] = path.resolve(context.cwd, folder);
  } else if ((context.env["LAZYLABEL_DATASET_ROOT"] ?? "").trim() === "") {
    return {
      kind: "error",
      message: "Which folder of images? Name it after npm start, in quotes if it has a space in it.",
    };
  }

  return { kind: "launch", options: { env, open, verbose } };
}

function isPort(value: string): boolean {
  const port = Number(value);
  return /^\d+$/.test(value) && port >= 1 && port <= 65535;
}

function example(option: string): string {
  switch (option) {
    case "--port":
      return "8790";
    case "--host":
      return "127.0.0.1";
    case "--db":
      return ":memory:";
    default:
      return "http://127.0.0.1:8788";
  }
}

function tooManyFolders(folders: readonly string[], platform: NodeJS.Platform): string {
  const listed = folders.map((folder) => `"${folder}"`).join(", ");
  // A bare number is an option's value whose option never arrived: PowerShell's npm drops the `--`
  // after `npm start`, and npm then keeps `--port` for itself and passes 9000 on.
  if (folders.slice(1).some((word) => /^\d+$/.test(word))) {
    return (
      `LazyLabel takes one folder, and got ${listed}. An option's name went missing before its value, `
      + (platform === "win32"
        ? 'which is what PowerShell\'s npm does to options after "npm start": use '
          + '.\\lazylabel.cmd "<folder>" --port 8790 instead.'
        : 'so put "--" between npm start and the folder: npm start -- "<folder>" --port 8790.')
    );
  }
  return `LazyLabel takes one folder, and got ${listed}. Put the folder in quotes if it has a space in it.`;
}

/**
 * Undo Windows PowerShell 5.1's quoting of a path that ends in a backslash.
 *
 * It passes `"C:\my images\"` on as written, and the program then reads `\"` as an escaped quote:
 * the folder arrives as `C:\my images"`, with every option after it swallowed into the same
 * argument (measured through npm and through lazylabel.cmd, 2026-09-26). A Windows path cannot
 * contain a quote, so on Windows one is always this, and what follows it is the lost options.
 */
function repairWindowsQuoting(args: readonly string[]): string[] {
  const repaired: string[] = [];
  for (const arg of args) {
    const quote = arg.indexOf('"');
    if (quote === -1) {
      repaired.push(arg);
      continue;
    }
    repaired.push(arg.slice(0, quote));
    repaired.push(...arg.slice(quote + 1).split(/\s+/).filter((word) => word !== ""));
  }
  return repaired;
}

/**
 * What is wrong with the folder of images, in words for the person who typed it, or null. The API
 * checks it again and refuses in its own words; this is the launcher's version of the same no.
 */
export function folderProblem(folder: string): string | null {
  let isFolder: boolean;
  try {
    isFolder = statSync(folder).isDirectory();
  } catch {
    return `There is no folder at ${folder}. Check the path, and put it in quotes if it has a space in it.`;
  }
  return isFolder ? null : `${folder} is a file. Name the folder that holds your images.`;
}

/** Where a browser on this computer reaches a server listening on `host` and `port`. */
export function appUrl(host: string, port: number): string {
  // A server on every interface is still reached through loopback from here.
  const reachable = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  return `http://${reachable.includes(":") ? `[${reachable}]` : reachable}:${port}/`;
}

/** The command that opens `url` in the default browser. */
export function browserCommand(platform: NodeJS.Platform, url: string): { command: string; args: string[] } {
  // `start`'s first quoted argument is a window title, hence the empty one. `cli.ts` passes these
  // verbatim, and the URL is this program's own: digits, dots, colons, slashes, brackets.
  if (platform === "win32") return { command: "cmd.exe", args: ["/d", "/c", "start", '""', url] };
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}

/**
 * True when this module is the one the process was started with.
 *
 * `import.meta.url` is the module's REAL path, links resolved, while `process.argv[1]` is the path
 * as typed. Compared directly, as the API's entry guard did, the two differ whenever the path runs
 * through a directory junction, a symbolic link or, likely, a `subst` drive, and the API then
 * exited 0 without a word: DEPLOYABILITY.md walkthrough step 22.
 */
export function isEntryPoint(moduleUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    return realpathSync(argv1) === realpathSync(modulePath);
  } catch {
    return path.resolve(argv1) === modulePath;
  }
}

/**
 * What a running server at `url` says it is: this app, for which folder, or something else. It asks
 * `/health` rather than `/api/health`, which an API from before it served the app did not answer.
 */
export async function whatHoldsPort(
  url: string,
): Promise<{ readonly kind: "lazylabel"; readonly datasetRoot: string } | { readonly kind: "other" }> {
  try {
    const response = await fetch(new URL("health", url), { signal: AbortSignal.timeout(2000) });
    const body = (await response.json()) as { readonly datasetRoot?: unknown; readonly dataset?: unknown };
    if (typeof body.datasetRoot === "string" && typeof body.dataset === "string") {
      return { kind: "lazylabel", datasetRoot: body.datasetRoot };
    }
  } catch {
    // Not HTTP, not JSON, or not answering: something else holds the port.
  }
  return { kind: "other" };
}

/**
 * A port near `port` that is free on `host` now, or null. `avoid` holds ports taken by design even
 * while nothing listens on them yet, such as the inference service's default.
 */
export async function freePortNear(port: number, host: string, avoid: readonly number[]): Promise<number | null> {
  for (let candidate = port + 1; candidate <= Math.min(port + 20, 65535); candidate += 1) {
    if (avoid.includes(candidate)) continue;
    if (await isFree(candidate, host)) return candidate;
  }
  return null;
}

function isFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

/** Two folder paths naming the same folder, in the way the platform compares names. */
export function sameFolder(a: string, b: string, platform: NodeJS.Platform): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return platform === "win32" || platform === "darwin" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** What to tell someone whose port is taken, and the command that starts LazyLabel elsewhere. */
export function busyPortAdvice(options: {
  readonly port: number;
  readonly folder: string;
  /** Who holds it: LazyLabel for another folder, another program, or the system (EACCES). */
  readonly holder:
    | { readonly kind: "lazylabel"; readonly datasetRoot: string }
    | { readonly kind: "other" }
    | { readonly kind: "reserved" };
  readonly freePort: number | null;
  readonly platform: NodeJS.Platform;
}): string {
  const { port, folder, holder, freePort, platform } = options;
  const shim = platform === "win32" ? ".\\lazylabel.cmd" : "./lazylabel.sh";
  const why =
    holder.kind === "lazylabel"
      ? `Port ${port} is in use by another LazyLabel, for ${holder.datasetRoot}. Stop that one with `
        + "Ctrl+C in its window, or start this one on another port"
      : holder.kind === "reserved"
        ? `Port ${port} cannot be used by this user`
          + (platform === "win32"
            ? " (Windows reserves some ranges: netsh interface ipv4 show excludedportrange protocol=tcp)"
            : "")
          + ". Start LazyLabel on another port"
        : `Port ${port} is in use by another program. Start LazyLabel on another port`;
  return `${why}, from the modernized folder:\n  ${shim} "${folder}" --port ${freePort ?? "<another port>"}`;
}

/** A start-up failure as one sentence, with what to do when there is something to do. */
export function describeStartFailure(cause: unknown): string {
  const error = cause as NodeJS.ErrnoException & { readonly port?: number; readonly address?: string };
  if (error?.code === "EADDRINUSE") {
    return `port ${error.port} on ${error.address} is already in use: is LazyLabel already running? `
      + "Choose another port with LAZYLABEL_PORT.";
  }
  if (error?.code === "EACCES" && error.syscall === "listen") {
    return `port ${error.port} on ${error.address} cannot be used by this user; Windows reserves some `
      + "ranges (netsh interface ipv4 show excludedportrange protocol=tcp). Choose another port with "
      + "LAZYLABEL_PORT.";
  }
  return cause instanceof Error ? cause.message : String(cause);
}
