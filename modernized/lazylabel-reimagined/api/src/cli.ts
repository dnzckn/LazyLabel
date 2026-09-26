/**
 * `npm start "<folder>"` from `modernized/`: LazyLabel in one command, on any shell.
 *
 * DEPLOYABILITY.md R4. The folder is an argument rather than an environment variable, because
 * `VAR=value cmd` is bash and a positional argument reaches the program intact from PowerShell,
 * cmd and bash alike (measured through npm, 2026-09-26). Everything else has a default, so nothing
 * needs configuring: port 8787 on this computer only, settings in the user's own settings file,
 * the web app from the workspace's build, and no AI until an inference service is named, which is
 * the supported "No AI" state rather than an error. Options go through `lazylabel.cmd` or
 * `lazylabel.sh` beside `modernized/package.json`, because PowerShell's npm drops the `--` they
 * would need after `npm start`.
 *
 * THIS FILE IS ALWAYS THE PROCESS, so it has no import guard and cannot exit silently the way the
 * API's guard did through a directory junction. And nothing it imports statically may load
 * `node:sqlite` (`launcher.ts` says why): the store arrives with `main.js`, imported only once the
 * Node version is known to have it.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ConfigError, loadConfig, type Config } from "./config.js";
import { createLogger } from "./http/log.js";
import { builtWebRoot } from "./http/staticWeb.js";
import {
  USAGE,
  appUrl,
  browserCommand,
  busyPortAdvice,
  describeStartFailure,
  folderProblem,
  freePortNear,
  nodeVersionProblem,
  parseArguments,
  sameFolder,
  whatHoldsPort,
} from "./launcher.js";

/** The workspace folder, `modernized/`, four levels above this file in the build (dist/src/cli.js). */
const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** The inference service's default port: never offered as a free one, since AI would want it. */
const INFERENCE_PORT = 8788;

quietSqliteWarning();
const exitCode = await run();
if (exitCode !== null) process.exit(exitCode);

/** Null when LazyLabel is running and the process should stay up. */
async function run(): Promise<number | null> {
  const tooOld = nodeVersionProblem(process.versions.node);
  if (tooOld !== null) return fail(tooOld, 1);

  const parsed = parseArguments(process.argv.slice(2), {
    cwd: process.env["INIT_CWD"] || process.cwd(),
    env: process.env,
    platform: process.platform,
  });
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") return fail(`${parsed.message}\n\n${USAGE}`, 2);
  const { env, verbose } = parsed.options;
  // BROWSER=none is the convention other development servers honour, for a machine with no screen.
  const open = parsed.options.open && process.env["BROWSER"] !== "none";

  let config: Config;
  try {
    config = loadConfig({ ...process.env, ...env });
  } catch (cause) {
    if (cause instanceof ConfigError) return fail(cause.message, 2);
    throw cause;
  }

  const badFolder = folderProblem(config.datasetRoot);
  if (badFolder !== null) return fail(badFolder, 1);

  if (config.webRoot !== null && builtWebRoot(config.webRoot) === null) {
    return fail(
      `The web app has not been built: ${config.webRoot} has no index.html. `
        + `Run "npm install" in ${WORKSPACE}, which builds everything, and start LazyLabel again.`,
      1,
    );
  }

  // Every request logs a line, which is a stream of JSON for someone who only wanted the app.
  // Warnings and errors still show; --verbose shows the rest.
  const logger = createLogger((line) => {
    if (verbose || !line.startsWith('{"level":"info","message":"request handled"')) {
      process.stdout.write(`${line}\n`);
    }
  });

  let startApi: typeof import("./main.js").startApi;
  try {
    ({ startApi } = await import("./main.js"));
  } catch (cause) {
    // A Node that passed the version check and still has no node:sqlite, started with
    // --no-experimental-sqlite, say: the one failure left that the check cannot see.
    return fail(`LazyLabel could not load its settings store: ${describeStartFailure(cause)}`, 1);
  }
  let api: Awaited<ReturnType<typeof startApi>>;
  try {
    api = await startApi(config, logger);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    if (code === "EADDRINUSE") return portTaken(config, open);
    if (code === "EACCES") return portReserved(config);
    return fail(`LazyLabel could not start: ${describeStartFailure(cause)}`, 1);
  }

  const settings = config.databasePath === ":memory:" ? "in memory, lost when LazyLabel stops" : config.databasePath;
  const ai =
    config.inferenceUrl === null
      ? "off: no inference service is set (see lazylabel-reimagined/inference/README.md)"
      : `from the inference service at ${config.inferenceUrl}`;
  console.log(
    `\nLazyLabel is running at ${api.url}  (Ctrl+C to stop)\n`
      + `  images:   ${config.datasetRoot}\n`
      + `  settings: ${settings}\n`
      + `  AI tools: ${ai}\n`,
  );
  if (open) openBrowser(api.url);

  const stop = (): void => {
    void api.close().then(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return null;
}

/**
 * The port is taken. LazyLabel for this same folder is a second start, so the answer is the first
 * one; anything else gets the command that starts this one on a free port.
 */
async function portTaken(config: Config, open: boolean): Promise<number> {
  const url = appUrl(config.host, config.port);
  const holder = await whatHoldsPort(url);
  if (holder.kind === "lazylabel" && sameFolder(holder.datasetRoot, config.datasetRoot, process.platform)) {
    console.log(`LazyLabel is already running for this folder, at ${url}`);
    if (open) openBrowser(url);
    return 0;
  }
  const freePort = await freePortNear(config.port, config.host, [INFERENCE_PORT]);
  return fail(
    busyPortAdvice({ port: config.port, folder: config.datasetRoot, holder, freePort, platform: process.platform }),
    1,
  );
}

/** The port cannot be used at all by this user: below 1024 on Linux, or in a range Windows keeps. */
async function portReserved(config: Config): Promise<number> {
  const freePort = await freePortNear(config.port, config.host, [INFERENCE_PORT]);
  return fail(
    busyPortAdvice({
      port: config.port,
      folder: config.datasetRoot,
      holder: { kind: "reserved" },
      freePort,
      platform: process.platform,
    }),
    1,
  );
}

function openBrowser(url: string): void {
  const { command, args } = browserCommand(process.platform, url);
  const fallback = (): void => console.log(`Open ${url} in your browser.`);
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: process.platform === "win32",
    });
    child.once("error", fallback);
    child.unref();
  } catch {
    fallback();
  }
}

function fail(message: string, code: number): number {
  console.error(message);
  return code;
}

/**
 * Hide the one warning every start printed: "SQLite is an experimental feature". It reads as a
 * fault to someone who only wanted the app, and it is the standard library's status, not this
 * app's. The flag for this, --disable-warning, is itself unknown to the older Node the version
 * check exists to explain, which would then fail before saying anything. Every other warning still
 * reaches Node's own printer.
 */
function quietSqliteWarning(): void {
  const printers = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning" && /SQLite/i.test(warning.message)) return;
    for (const print of printers) print(warning);
  });
}
