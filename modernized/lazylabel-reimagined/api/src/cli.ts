/**
 * `npm start` from `modernized/`: LazyLabel in one command, on any shell.
 *
 * DEPLOYABILITY.md R4. With no folder named it starts with none open, and the app's Open Image
 * Folder chooses one, as legacy starts: the owner's words of 2026-09-29, "why is that a part of the
 * launch? in the gui the user should be able to select a folder to load". The folder may still be
 * named, as an argument rather than an environment variable, because `VAR=value cmd` is bash and a
 * positional argument reaches the program intact from PowerShell, cmd and bash alike (measured
 * through npm, 2026-09-26). Everything else has a default, so nothing needs configuring: port 8787
 * on this computer only, settings in the user's own settings file, the web app from the workspace's
 * build, and the AI tools when they are installed. Options go through `lazylabel.cmd` or
 * `lazylabel.sh` beside `modernized/package.json`, because PowerShell's npm drops the `--` they
 * would need after `npm start`.
 *
 * THE AI TOOLS START WITH THE APP (DEPLOYABILITY.md R8) once `npm run ai:setup` has made their
 * environment and `npm run ai:models` has put a model in the per-user folder: the inference service
 * runs as this process's child, on a free port, with the same folder of images, its lines marked
 * `[ai]`, and it stops when this does. Without them the app runs with no AI, the supported "No AI"
 * state rather than an error, and says which command adds it. `--inference <url>` uses a service
 * that is already running instead, and starts none.
 *
 * THIS FILE IS ALWAYS THE PROCESS, so it has no import guard and cannot exit silently the way the
 * API's guard did through a directory junction. And nothing it imports statically may load
 * `node:sqlite` (`launcher.ts` says why): the store arrives with `main.js`, imported only once the
 * Node version is known to have it.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { startAiService, type AiService } from "./aiService.js";
import { findParts, missingParts, readBundle, unpackCommand, type Bundle } from "./bundle.js";
import { ConfigError, loadConfig, type Config } from "./config.js";
import { folderDialogs } from "./folderDialog.js";
import { createLogger } from "./http/log.js";
import { builtWebRoot } from "./http/staticWeb.js";
import {
  USAGE,
  aiLogLine,
  aiPlan,
  appUrl,
  browserCommand,
  busyPortAdvice,
  describeStartFailure,
  folderProblem,
  freePort,
  freePortNear,
  nodeVersionProblem,
  parseArguments,
  sameFolder,
  whatHoldsPort,
  type AiPlan,
} from "./launcher.js";

/** The workspace folder, `modernized/`, four levels above this file in the build (dist/src/cli.js). */
const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** The inference service's package, where `npm run ai:setup` puts its `.venv`. */
const INFERENCE = path.join(WORKSPACE, "lazylabel-reimagined", "inference");

/** Where the AI bundle's `bundle.json` is: the folder holding `app/`, which is the workspace there. */
const BUNDLE_ROOT = path.dirname(WORKSPACE);

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

  /*
   * WHO CHOOSES THE FOLDER (`config.ts`): the app's Open Image Folder, which shows the system's
   * folder dialog where this computer has a desktop to show it on, and takes a typed path where it
   * has none, as over SSH. A choice made in the environment stands.
   */
  const folderChoice =
    (process.env["LAZYLABEL_FOLDER_CHOICE"] ?? "").trim() !== ""
      ? {}
      : {
          LAZYLABEL_FOLDER_CHOICE:
            folderDialogs(process.platform, process.env, os.homedir()).length > 0 ? "dialog" : "path",
        };

  let config: Config;
  try {
    config = loadConfig({ ...process.env, ...folderChoice, ...env });
  } catch (cause) {
    if (cause instanceof ConfigError) return fail(cause.message, 2);
    throw cause;
  }

  const badFolder = config.datasetRoot === null ? null : folderProblem(config.datasetRoot);
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

  // The AI tools first, so the API starts knowing where they are, or that there are none.
  const bundle = openBundle();
  if (bundle !== null) unpackParts(bundle);
  const plan = aiPlan({
    env: { ...process.env, ...env },
    platform: process.platform,
    home: os.homedir(),
    inference: INFERENCE,
    exists: existsSync,
    bundle,
  });
  let ai: AiService | null = null;
  let aiState: string;
  if (plan.kind === "start") {
    const started = await startAi(plan, config, verbose);
    if (typeof started === "string") {
      aiState = `off: ${started}`;
    } else {
      ai = started;
      config = { ...config, inferenceUrl: ai.url };
      aiState = `on, from the inference service at ${ai.url}, with the models in ${plan.modelDir}`;
    }
  } else {
    aiState = plan.kind === "off" ? `off: ${plan.reason}` : `from the inference service at ${config.inferenceUrl}`;
  }

  let api: Awaited<ReturnType<typeof startApi>>;
  try {
    api = await startApi(config, logger);
  } catch (cause) {
    await ai?.stop();
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    if (code === "EADDRINUSE") return portTaken(config, open);
    if (code === "EACCES") return portReserved(config);
    return fail(`LazyLabel could not start: ${describeStartFailure(cause)}`, 1);
  }

  const settings = config.databasePath === ":memory:" ? "in memory, lost when LazyLabel stops" : config.databasePath;
  console.log(
    `\nLazyLabel is running at ${api.url}  (Ctrl+C to stop)\n`
      + `  images:   ${config.datasetRoot ?? "none yet: choose a folder in the app (Open Image Folder)"}\n`
      + `  settings: ${settings}\n`
      + `  AI tools: ${aiState}\n`,
  );
  if (open) openBrowser(api.url);

  let stopping = false;
  void ai?.exited.then((code) => {
    if (!stopping) {
      console.error(
        `[ai] The inference service stopped (exit code ${code}); the AI tools are off until LazyLabel restarts.`,
      );
    }
  });
  const stop = (): void => {
    stopping = true;
    void Promise.all([api.close(), ai?.stop()]).then(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return null;
}

/** The AI bundle this runs from (`bundle.ts`), or null; a damaged `bundle.json` is said and ignored. */
function openBundle(): Bundle | null {
  try {
    return readBundle(BUNDLE_ROOT, (file) => (existsSync(file) ? readFileSync(file, "utf8") : null));
  } catch (cause) {
    console.error(`${cause instanceof Error ? cause.message : String(cause)}: unzip part 1 again. The AI tools are off.`);
    return null;
  }
}

/**
 * The AI bundle's other parts, unpacked by its own Python from where they are found. The first start
 * only, since an unpacked part leaves its mark; one not found is named by `aiPlan` instead.
 */
function unpackParts(bundle: Bundle): void {
  const found = findParts(bundle, missingParts(bundle, existsSync), os.homedir(), existsSync);
  if (found.size === 0 || !existsSync(bundle.python)) return;
  console.log(
    `Unpacking the AI tools from ${found.size === 1 ? "one more part" : `${found.size} more parts`} of the download. `
      + "The first start only; it takes a minute or two.",
  );
  const { command, args } = unpackCommand(bundle, [...found.values()]);
  const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true });
  if (result.error !== undefined || result.status !== 0) {
    console.error(
      `Unpacking stopped${result.status === null ? "" : ` (exit code ${result.status})`}; `
        + "LazyLabel starts without the AI tools and tries again next time.",
    );
  }
}

/**
 * The inference service `npm run ai:setup` installed, started with the app on a free port and the
 * API's own folder of images, once it says it is listening; or why it is not, in a few words. With
 * no folder open it starts with none, and the API points it at the one the app opens.
 */
async function startAi(
  plan: Extract<AiPlan, { kind: "start" }>,
  config: Config,
  verbose: boolean,
): Promise<AiService | string> {
  const port = await freePort(INFERENCE_PORT, "127.0.0.1", [config.port]);
  if (port === null) return `no port near ${INFERENCE_PORT} was free for the inference service`;
  console.log(`Starting the AI tools with ${plan.python}`);
  // The bundle's Python is whole in itself: a PYTHONHOME or PYTHONPATH set for another Python, or
  // packages in the user's own site folder, would put someone else's files in front of its own.
  const own = { ...process.env };
  if (plan.bundled) {
    delete own["PYTHONHOME"];
    delete own["PYTHONPATH"];
    own["PYTHONNOUSERSITE"] = "1";
  }
  delete own["LAZYLABEL_DATASET_ROOT"];
  try {
    return await startAiService({
      command: plan.python,
      args: ["-m", "lazylabel_inference.server"],
      cwd: plan.cwd,
      env: {
        ...own,
        ...(config.datasetRoot === null ? {} : { LAZYLABEL_DATASET_ROOT: config.datasetRoot }),
        LAZYLABEL_MODEL_DIR: plan.modelDir,
      },
      // A bundle's first start reads every library of its Python for the first time, and a virus
      // scanner reads them before that.
      ...(plan.bundled ? { readyTimeoutMs: 180_000 } : {}),
      host: "127.0.0.1",
      port,
      onLine: (line) => {
        const shown = aiLogLine(line, verbose);
        if (shown !== null) process.stdout.write(`${shown}\n`);
      },
    });
  } catch (cause) {
    return `the inference service did not start (${cause instanceof Error ? cause.message : String(cause)}); `
      + "npm run doctor says why";
  }
}

/**
 * The port is taken. LazyLabel for this same folder is a second start, so the answer is the first
 * one, and so it is for a start that names no folder, since that one opens folders itself; anything
 * else gets the command that starts this one on a free port.
 */
async function portTaken(config: Config, open: boolean): Promise<number> {
  const url = appUrl(config.host, config.port);
  const holder = await whatHoldsPort(url);
  const named = config.datasetRoot;
  if (holder.kind === "lazylabel" && named === null) {
    console.log(`LazyLabel is already running, at ${url}`);
    if (open) openBrowser(url);
    return 0;
  }
  if (holder.kind === "lazylabel" && holder.datasetRoot !== null && named !== null
    && sameFolder(holder.datasetRoot, named, process.platform)) {
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
