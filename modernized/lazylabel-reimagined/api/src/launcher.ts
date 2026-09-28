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

import { missingParts, missingPartsReason, type Bundle } from "./bundle.js";

export const USAGE = `Usage: npm start "<folder of images>"
   or: lazylabel.cmd "<folder>" [options]      (Windows: PowerShell or cmd, in modernized/)
   or: ./lazylabel.sh "<folder>" [options]     (macOS, Linux, Git Bash, in modernized/)

Options:
  --port <number>      the port to serve on (default 8787)
  --host <address>     the address to listen on (default 127.0.0.1, this computer only)
  --db <file>          where settings and hotkeys are kept, or :memory: to keep them nowhere
  --inference <url>    an AI inference service already running, such as http://127.0.0.1:8788
                       (default: start the one npm run ai:setup installed, when there is one)
  --no-open            do not open the browser (BROWSER=none does the same)
  --verbose            log every request
  --choose-folder      with no folder named, ask for one: the system's folder dialog, or a
                       question in this window where there is none (the release zip's launchers)
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
  /** `--choose-folder` and no folder named anywhere: `cli.ts` asks for one (`folderDialogs`). */
  readonly askForFolder: boolean;
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
  let chooseFolder = false;
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
    if (word === "--choose-folder") {
      chooseFolder = true;
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
  let askForFolder = false;
  if (folder !== undefined) {
    env["LAZYLABEL_DATASET_ROOT"] = path.resolve(context.cwd, folder);
  } else if ((context.env["LAZYLABEL_DATASET_ROOT"] ?? "").trim() === "") {
    if (!chooseFolder) {
      return {
        kind: "error",
        message: "Which folder of images? Name it after npm start, in quotes if it has a space in it.",
      };
    }
    askForFolder = true;
  }

  return { kind: "launch", options: { env, open, verbose, askForFolder } };
}

/** A program that shows the system's own folder dialog and prints the folder chosen. */
export interface FolderDialog {
  readonly command: string;
  readonly args: readonly string[];
}

const DIALOG_TITLE = "Choose the folder of images for LazyLabel";

/**
 * Windows PowerShell 5.1, in every Windows since 10: the Windows Forms folder dialog. Its owner is
 * a form kept on top, or the dialog can open behind the launcher's window. The path goes out as
 * UTF-8 bytes, because the console's own code page would mangle a name outside it.
 */
const WINDOWS_DIALOG = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  `$dialog.Description = '${DIALOG_TITLE}'`,
  "$dialog.ShowNewFolderButton = $false",
  "$dialog.SelectedPath = [Environment]::GetFolderPath('MyPictures')",
  "if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {",
  "  $bytes = [System.Text.Encoding]::UTF8.GetBytes($dialog.SelectedPath)",
  "  $out = [Console]::OpenStandardOutput()",
  "  $out.Write($bytes, 0, $bytes.Length)",
  "  $out.Flush()",
  "}",
].join("\n");

/**
 * The system's own folder dialogs, in the order to try them, for `--choose-folder` (DEPLOYABILITY.md
 * R11): the release zip's launchers pass it, so nobody has to type a path. The folder is chosen on
 * the user's own desktop BEFORE the server starts, so nothing new listens on the network and the
 * trust model is decision 3's unchanged: one trusted user, the API on loopback. Each dialog prints
 * the folder chosen, and nothing when it is closed. Where there is no desktop there are none, and
 * `cli.ts` asks in its window instead.
 */
export function folderDialogs(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): FolderDialog[] {
  if (platform === "win32") {
    // The full path, so a powershell.exe earlier on the PATH is never the one run.
    const system = (env["SystemRoot"] ?? env["SYSTEMROOT"] ?? "").trim() || "C:\\Windows";
    return [
      {
        command: path.win32.join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-STA",
          "-EncodedCommand",
          Buffer.from(WINDOWS_DIALOG, "utf16le").toString("base64"),
        ],
      },
    ];
  }
  if (platform === "darwin") {
    return [{ command: "/usr/bin/osascript", args: ["-e", `POSIX path of (choose folder with prompt "${DIALOG_TITLE}")`] }];
  }
  if ((env["DISPLAY"] ?? "").trim() === "" && (env["WAYLAND_DISPLAY"] ?? "").trim() === "") return [];
  return [
    { command: "zenity", args: ["--file-selection", "--directory", `--title=${DIALOG_TITLE}`] },
    { command: "kdialog", args: ["--getexistingdirectory", home, "--title", DIALOG_TITLE] },
  ];
}

/** The folder a dialog printed, or null when it printed none because it was closed. */
export function dialogFolder(output: string): string | null {
  const folder = output.replace(/[\r\n]+$/, "");
  return folder === "" ? null : folder;
}

/**
 * The folder someone typed, pasted or dragged into the launcher's window, or null for none. A
 * dragged folder arrives quoted when its path has a space in it (cmd, most Linux terminals) or with
 * each space escaped by a backslash (macOS Terminal); both are undone, and a leading ~ is the home
 * folder, as a shell would have it.
 */
export function typedFolder(line: string, platform: NodeJS.Platform, home: string): string | null {
  let folder = line.trim();
  const quote = folder[0];
  if (folder.length >= 2 && (quote === '"' || quote === "'") && folder.endsWith(quote)) {
    folder = folder.slice(1, -1);
  } else if (platform !== "win32") {
    folder = folder.replace(/\\(.)/g, "$1");
  }
  if (platform !== "win32" && (folder === "~" || folder.startsWith("~/"))) folder = `${home}${folder.slice(1)}`;
  return folder === "" ? null : folder;
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

/** `port` when it is free on `host` and not in `avoid`, else a free one near it, or null. */
export async function freePort(port: number, host: string, avoid: readonly number[]): Promise<number | null> {
  if (!avoid.includes(port) && (await isFree(port, host))) return port;
  return freePortNear(port, host, avoid);
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

/**
 * Where checkpoints go when nobody says: per user, outside the repository and every dataset.
 * `%LOCALAPPDATA%\LazyLabel\models` on Windows, `~/Library/Application Support/LazyLabel/models`
 * on macOS, `${XDG_DATA_HOME:-~/.local/share}/lazylabel/models` elsewhere. `npm run ai:models`
 * fetches into the same folder (`lazylabel_inference/fetch.py`, `scripts/lib/ai.mjs`), and
 * `test/aiScripts.test.ts` holds the three copies to one table.
 */
export function defaultModelDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string {
  if (platform === "win32") {
    const local = (env["LOCALAPPDATA"] ?? "").trim();
    return path.win32.join(local !== "" ? local : path.win32.join(home, "AppData", "Local"), "LazyLabel", "models");
  }
  if (platform === "darwin") return path.posix.join(home, "Library", "Application Support", "LazyLabel", "models");
  // The XDG spec says a relative XDG_DATA_HOME is invalid and is to be ignored.
  const data = (env["XDG_DATA_HOME"] ?? "").trim();
  return path.posix.join(data.startsWith("/") ? data : path.posix.join(home, ".local", "share"), "lazylabel", "models");
}

/** What `npm start` does about the AI tools. */
export type AiPlan =
  /** An inference service was named (--inference, LAZYLABEL_INFERENCE_URL): use it, start nothing. */
  | { readonly kind: "external"; readonly url: string }
  /** Installed, with models: start the service with the app. */
  | {
      readonly kind: "start";
      readonly python: string;
      readonly modelDir: string;
      /** Its source folder, so an environment without the package installed still runs this copy. */
      readonly cwd: string;
      /** The AI bundle's own Python (`bundle.ts`), which no one else's Python settings may reach. */
      readonly bundled?: true;
    }
  /** Not installed, or no models yet: the app runs without AI, and `reason` says what to run. */
  | { readonly kind: "off"; readonly reason: string };

/**
 * Whether `npm start` starts the inference service, from what is installed (DEPLOYABILITY.md R8).
 *
 * It does when there is a Python for it -- LAZYLABEL_PYTHON, else the `.venv` that
 * `npm run ai:setup` makes -- and a manifest -- LAZYLABEL_MODEL_MANIFEST, else `manifest.json` in
 * LAZYLABEL_MODEL_DIR or the per-user folder `npm run ai:models` fills. Without them the app runs
 * as it always has, with no AI, and says which command adds it -- or, in the release zip, which has
 * no inference package and no npm to run a command with, that the AI tools are not in it.
 *
 * THE AI BUNDLE (DEPLOYABILITY.md R12) brings both: its own Python and its model folder, used once
 * every part is unpacked (`bundle.ts`). LAZYLABEL_PYTHON, LAZYLABEL_MODEL_DIR and
 * LAZYLABEL_MODEL_MANIFEST still win over it, as they win over the `.venv`.
 */
export function aiPlan(context: {
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly home: string;
  /** `lazylabel-reimagined/inference`, where `npm run ai:setup` puts `.venv`. */
  readonly inference: string;
  readonly exists: (file: string) => boolean;
  /** The AI bundle this runs from, or null (`readBundle`). */
  readonly bundle?: Bundle | null;
}): AiPlan {
  const { env, platform, home, inference, exists } = context;
  const bundle = context.bundle ?? null;
  const join = platform === "win32" ? path.win32.join : path.posix.join;

  const url = (env["LAZYLABEL_INFERENCE_URL"] ?? "").trim();
  if (url !== "") return { kind: "external", url };

  const named = (env["LAZYLABEL_PYTHON"] ?? "").trim();
  const bundled = named === "" && bundle !== null;
  let python: string;
  if (named !== "") {
    python = path.resolve(named);
    if (!exists(python)) return { kind: "off", reason: `LAZYLABEL_PYTHON names ${python}, which is not there` };
  } else if (bundle !== null) {
    const missing = missingParts(bundle, exists);
    if (missing.length > 0) return { kind: "off", reason: missingPartsReason(bundle, missing) };
    python = bundle.python;
    if (!exists(python)) return { kind: "off", reason: `${python} is missing: unzip part 1 again` };
  } else {
    python = platform === "win32" ? join(inference, ".venv", "Scripts", "python.exe") : join(inference, ".venv", "bin", "python");
    if (!exists(python)) {
      if (!exists(join(inference, "pyproject.toml"))) {
        return { kind: "off", reason: "not in this download (README.txt says how to add them)" };
      }
      return { kind: "off", reason: "run npm run ai:setup" };
    }
  }

  const namedDir = (env["LAZYLABEL_MODEL_DIR"] ?? "").trim();
  const modelDir =
    namedDir !== "" ? path.resolve(namedDir) : bundled ? bundle.models : defaultModelDir(env, platform, home);
  const namedManifest = (env["LAZYLABEL_MODEL_MANIFEST"] ?? "").trim();
  const manifest = namedManifest !== "" ? path.resolve(namedManifest) : join(modelDir, "manifest.json");
  if (!exists(manifest)) {
    return {
      kind: "off",
      reason: bundled
        ? `${manifest} is missing: unzip the parts again`
        : `no models in ${modelDir} yet: run npm run ai:models sam2.1-large`,
    };
  }
  return { kind: "start", python, modelDir, cwd: join(inference, "src"), ...(bundled ? { bundled: true as const } : {}) };
}

/**
 * One line of the inference service's output as `npm start` shows it, marked as the service's, or
 * null to leave it out. Like the API's own, a line per request is left out unless --verbose; its
 * warnings, errors and anything that is not a log record, such as a traceback, always show.
 */
export function aiLogLine(line: string, verbose: boolean): string | null {
  if (line.trim() === "") return null;
  if (!verbose) {
    try {
      const record = JSON.parse(line) as { readonly level?: unknown; readonly message?: unknown } | null;
      if (record?.level === "info" && record.message === "request handled") return null;
    } catch {
      // Not a log record: shown as it is.
    }
  }
  return `[ai] ${line}`;
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
