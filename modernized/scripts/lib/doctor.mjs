/**
 * The checks `npm run doctor` makes, each answering OK, FAIL with the command that fixes it, or,
 * for what is optional, a note (DEPLOYABILITY.md R9).
 *
 * Standard library only, and nothing from the packages it checks: it has to run on a checkout
 * whose `npm install` failed, which is when it is wanted most. `api/src/launcher.ts` holds the same
 * Node version rule for `npm start`; `api/test/aiScripts.test.ts` holds this copy to it.
 */

import { accessSync, constants, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import * as os from "node:os";
import * as path from "node:path";

/** A finding: `ok` true, false (with `fix`), or null for a note about something optional. */
export function finding(ok, what, fix) {
  return fix === undefined ? { ok, what } : { ok, what, fix };
}

/** Node 22.13 or later (23.4 on the odd line): the first with `node:sqlite` unflagged. */
export function checkNode(version) {
  const [major = 0, minor = 0] = version.replace(/^v/, "").split(".").map(Number);
  const supported = major >= 24 || (major === 23 && minor >= 4) || (major === 22 && minor >= 13);
  return supported
    ? finding(true, `Node.js ${version.replace(/^v/, "")}`)
    : finding(
        false,
        `Node.js ${version.replace(/^v/, "")} is too old: LazyLabel needs 22.13 or later`,
        "install the current LTS from https://nodejs.org/",
      );
}

/** Whether `node:sqlite`, the settings store, loads here. */
export async function checkSqlite() {
  quietSqliteWarning();
  try {
    await import("node:sqlite");
    return finding(true, "node:sqlite, where settings are kept, loads");
  } catch (cause) {
    return finding(
      false,
      `node:sqlite does not load: ${cause instanceof Error ? cause.message : String(cause)}`,
      "use Node.js 22.13 or later, without --no-experimental-sqlite",
    );
  }
}

let quieted = false;

/**
 * Hide "SQLite is an experimental feature", as `npm start` does: it is Node's status, not a fault,
 * and it arrives after the import has returned, so the filter stays. Every other warning is printed.
 */
function quietSqliteWarning() {
  if (quieted) return;
  quieted = true;
  const printers = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning" && /SQLite/i.test(warning.message)) return;
    for (const print of printers) print(warning);
  });
}

/** What `npm install` in `modernized/` builds, by the file that shows each one was built. */
export const BUILDS = [
  ["the annotation format library", "lazylabel/core/exporters/dist/index.js"],
  ["the settings schema", "lazylabel-reimagined/settings-schema/dist/index.js"],
  ["the contracts", "lazylabel-reimagined/contracts/dist/index.js"],
  ["the API", "lazylabel-reimagined/api/dist/src/cli.js"],
  ["the web app", "lazylabel-reimagined/web/dist/index.html"],
];

export function checkBuilds(modernized) {
  const missing = BUILDS.filter(([, file]) => !existsSync(path.join(modernized, file))).map(([name]) => name);
  if (missing.length === 0) return finding(true, "all five packages are built");
  const installed = existsSync(path.join(modernized, "node_modules"));
  return finding(
    false,
    `not built: ${missing.join(", ")}`,
    installed ? `npm run build, in ${modernized}` : `npm install, in ${modernized} (it builds everything)`,
  );
}

/** Whether `port` is free; if not, whether LazyLabel holds it (then all is well) or something else. */
export async function checkPort(port, host = "127.0.0.1", platform = process.platform) {
  if (await isFree(port, host)) return finding(true, `port ${port} is free`);
  const url = `http://${host}:${port}/`;
  try {
    const response = await fetch(new URL("health", url), { signal: AbortSignal.timeout(2000) });
    const body = await response.json();
    if (typeof body?.datasetRoot === "string" && typeof body?.dataset === "string") {
      return finding(true, `LazyLabel is already running at ${url}, for ${body.datasetRoot}`);
    }
  } catch {
    // Not HTTP, not JSON, or not answering: another program.
  }
  const shim = platform === "win32" ? ".\\lazylabel.cmd" : "./lazylabel.sh";
  const other = await freePortNear(port, host);
  return finding(
    false,
    `port ${port} is in use by another program`,
    `start LazyLabel on another port, from the modernized folder: ${shim} "<folder>" --port ${other ?? "<another port>"}`,
  );
}

function isFree(port, host) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

async function freePortNear(port, host) {
  for (let candidate = port + 1; candidate <= Math.min(port + 20, 65535); candidate += 1) {
    if (candidate !== 8788 && (await isFree(candidate, host))) return candidate;
  }
  return null;
}

/** Whether LazyLabel can read the folder of images, when one is named. */
export function checkFolder(folder) {
  if (folder === undefined) {
    return finding(null, 'the folder of images was not checked: name it, npm run doctor "<folder>"');
  }
  let stats;
  try {
    stats = statSync(folder);
  } catch {
    return finding(false, `there is no folder at ${folder}`, "check the path, and put it in quotes if it has a space in it");
  }
  if (!stats.isDirectory()) return finding(false, `${folder} is a file`, "name the folder that holds your images");
  try {
    const entries = readdirSync(folder).length;
    return finding(true, `the folder ${folder} can be read (${entries} ${entries === 1 ? "entry" : "entries"})`);
  } catch (cause) {
    return finding(false, `${folder} cannot be read: ${cause.code ?? cause.message}`, "choose a folder this user can read");
  }
}

/**
 * Whether settings can be written where `npm start` keeps them: LAZYLABEL_DB, else the per-user
 * `~/.config/lazylabel/lazylabel-web.db`. What does not exist yet is created on first start, so
 * this asks the nearest folder that does exist, by making and removing a folder in it.
 */
export function checkSettings(env = process.env, home = os.homedir()) {
  const named = (env["LAZYLABEL_DB"] ?? "").trim();
  if (named === ":memory:") return finding(true, "settings are kept in memory (LAZYLABEL_DB=:memory:), and lost on exit");
  const database = named !== "" ? path.resolve(named) : path.join(home, ".config", "lazylabel", "lazylabel-web.db");
  const fix = `set LAZYLABEL_DB, or --db, to a file this user can write`;

  if (existsSync(database)) {
    try {
      accessSync(database, constants.R_OK | constants.W_OK);
      return finding(true, `settings can be written to ${database}`);
    } catch {
      return finding(false, `${database} cannot be written`, fix);
    }
  }
  let folder = path.dirname(database);
  while (!existsSync(folder) && path.dirname(folder) !== folder) folder = path.dirname(folder);
  try {
    if (!statSync(folder).isDirectory()) return finding(false, `${folder} is a file, so ${database} cannot be made`, fix);
    rmSync(mkdtempSync(path.join(folder, ".lazylabel-doctor-")), { recursive: true, force: true });
    return finding(true, `settings can be written to ${database}`);
  } catch (cause) {
    return finding(false, `${database} cannot be made: ${cause.code ?? cause.message}`, fix);
  }
}

/** The report's lines: a mark, what was found, and under each failure the fix. */
export function render(findings) {
  const lines = [];
  for (const { ok, what, fix } of findings) {
    lines.push(`  ${ok === true ? "OK  " : ok === false ? "FAIL" : "--  "}  ${what}`);
    if (ok === false && fix !== undefined) lines.push(`        fix: ${fix}`);
  }
  return lines.join("\n");
}
