/**
 * Configuration, from the environment.
 *
 * The two storage settings are the ports of `REIMAGINED_ARCHITECTURE.md` section 3.1. Today each
 * names the default adapter's location; when an adapter for object storage or a SQL server exists,
 * this is where the choice between them is made, and nothing above it changes.
 */

import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Who chooses the folder of images, from LAZYLABEL_FOLDER_CHOICE: the file panel's Open Image Folder
 * (`app.ts`, POST /folder), by the owner's request of 2026-09-29, "in the gui the user should be able
 * to select a folder to load".
 *
 *   dialog  the server shows the system's folder dialog, on the computer it runs on, as legacy's
 *           button does (main_window.py:1431-1438): what the launcher sets on a desktop (`cli.ts`).
 *   path    the folder's path is typed in the app: what the launcher sets where there is no desktop
 *           to show a dialog on, such as over SSH.
 *   fixed   LAZYLABEL_DATASET_ROOT's folder, which cannot change: the default, for a deployment such
 *           as the Docker image, whose user is not at the server's desk and must not be handed a
 *           way through its disks.
 */
export type FolderChoice = "dialog" | "path" | "fixed";

export interface Config {
  /**
   * Absolute path of the folder of images open at start: the blob store's location. Null for none
   * yet, which only a folder that can be chosen in the app allows (`folderChoice`).
   */
  readonly datasetRoot: string | null;
  readonly folderChoice: FolderChoice;
  /**
   * SQLite file for the metadata store, or ":memory:". Per user by default, beside the desktop
   * app's own settings (`~/.config/lazylabel/lazylabel-web.db`), so settings follow the user from
   * folder to folder and nothing but annotations is written into a dataset.
   */
  readonly databasePath: string;
  readonly port: number;
  readonly host: string;
  /**
   * Where the inference service listens, or null when there is none.
   *
   * ABSENT IS A SUPPORTED DEPLOYMENT, not a broken one. The failure-mode table says everything
   * except SAM prompts and propagation works without it, so the AI routes answer 503 with a reason
   * and nothing else changes — which is what a machine with no GPU should do rather than refusing
   * to start.
   */
  readonly inferenceUrl: string | null;
  /**
   * Where the desktop app kept `settings.json` and `hotkeys.json`, read once while nothing is
   * stored (Phase 4 exit criterion 3), or null when that import is turned off.
   */
  readonly legacySettingsDir: string | null;
  /**
   * The web app's build folder, which the API serves at `/` beside its routes, or null to serve
   * the routes alone. Whether anything has been built there is checked where it is served.
   */
  readonly webRoot: string | null;
}

/**
 * The inference service's address, validated here rather than on the first AI request.
 *
 * A typo in this variable used to be discoverable only by clicking an object and getting a
 * connection error three layers down. Refusing at startup with the value quoted is the whole
 * difference between "the AI tools are broken" and "this is not a URL".
 */
function inferenceUrlFrom(env: NodeJS.ProcessEnv): string | null {
  const raw = env["LAZYLABEL_INFERENCE_URL"]?.trim();
  if (raw === undefined || raw === "") return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigError(
      `LAZYLABEL_INFERENCE_URL must be a URL like http://127.0.0.1:8788, got ${JSON.stringify(raw)}`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(
      `LAZYLABEL_INFERENCE_URL must be http or https, got ${JSON.stringify(parsed.protocol)}`,
    );
  }
  // Trailing slashes removed here so every caller does not have to think about them.
  return raw.replace(/\/+$/, "");
}

/**
 * The desktop app's config directory, for the one-time settings import.
 *
 * Legacy's own location by default (`config/paths.py`: `~/.config/lazylabel`), so a user moving to
 * the web app on the same machine brings their preferences without configuring anything. This is
 * not the kind of guess the dataset root refuses to make: a wrong one finds no files and imports
 * nothing, which is exactly what not importing would have done. Empty turns the import off.
 */
function legacySettingsDirFrom(env: NodeJS.ProcessEnv): string | null {
  const raw = env["LAZYLABEL_LEGACY_SETTINGS_DIR"];
  if (raw === undefined) return path.join(os.homedir(), ".config", "lazylabel");
  if (raw.trim() === "") return null;
  return path.resolve(raw);
}

/**
 * The web app's build: `web/dist` beside this package, which is where the workspace's
 * `npm install` puts it, so serving the app needs no configuration (DEPLOYABILITY.md R3).
 * `LAZYLABEL_WEB_DIST` names another folder; empty turns serving it off.
 */
function webRootFrom(env: NodeJS.ProcessEnv): string | null {
  const raw = env["LAZYLABEL_WEB_DIST"];
  if (raw === undefined) return path.join(apiPackageRoot(), "..", "web", "dist");
  if (raw.trim() === "") return null;
  return path.resolve(raw);
}

/**
 * This package's folder, found by walking up from this file to its `package.json`, because the file
 * runs from `src/` under the tests and from `dist/src/` when built, one level apart.
 */
function apiPackageRoot(): string {
  let folder = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(folder, "package.json"))) return folder;
    const parent = path.dirname(folder);
    if (parent === folder) return folder;
    folder = parent;
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** LAZYLABEL_FOLDER_CHOICE, fixed when unset; anything else is refused at startup, quoted. */
function folderChoiceFrom(env: NodeJS.ProcessEnv): FolderChoice {
  const raw = (env["LAZYLABEL_FOLDER_CHOICE"] ?? "").trim();
  if (raw === "") return "fixed";
  if (raw === "dialog" || raw === "path" || raw === "fixed") return raw;
  throw new ConfigError(`LAZYLABEL_FOLDER_CHOICE must be dialog, path or fixed, got ${JSON.stringify(raw)}`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const folderChoice = folderChoiceFrom(env);
  const named = env["LAZYLABEL_DATASET_ROOT"];
  const datasetRoot = named === undefined || named.trim() === "" ? null : path.resolve(named);
  if (datasetRoot === null && folderChoice === "fixed") {
    // Refuse to start rather than default to the working directory. "Dataset folder unreadable"
    // is a blocking error in the failure-mode table precisely because the alternative — an empty
    // file list that looks like an empty folder — is indistinguishable from having no work. A
    // folder the app can choose starts with none open instead, and says so: /health's "none".
    throw new ConfigError(
      "LAZYLABEL_DATASET_ROOT must name the folder holding your images; the API will not guess",
    );
  }

  const port = Number(env["LAZYLABEL_PORT"] ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`LAZYLABEL_PORT must be a port number, got ${JSON.stringify(env["LAZYLABEL_PORT"])}`);
  }

  return {
    datasetRoot,
    folderChoice,
    // DEPLOYABILITY.md R5. It was `<datasetRoot>/.lazylabel/lazylabel.db`; config.test.ts records
    // why it was and why it changed, and `settings/folderDatabaseImport.ts` brings such a file's
    // settings across once.
    databasePath: env["LAZYLABEL_DB"] ?? path.join(os.homedir(), ".config", "lazylabel", "lazylabel-web.db"),
    port,
    // Loopback by default. Decision 3 is one trusted user per deployment, so binding every
    // interface is a choice an operator makes on purpose, behind the reverse proxy that terminates
    // TLS and authenticates, not a default that quietly exposes someone's images to their network.
    host: env["LAZYLABEL_HOST"] ?? "127.0.0.1",
    inferenceUrl: inferenceUrlFrom(env),
    legacySettingsDir: legacySettingsDirFrom(env),
    webRoot: webRootFrom(env),
  };
}
