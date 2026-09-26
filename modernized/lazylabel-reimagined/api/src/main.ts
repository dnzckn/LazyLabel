/**
 * Starting the API: build the adapters the configuration names, and listen.
 *
 * `startApi` is shared by two entry points. This file is the one a deployment runs,
 * `node dist/src/main.js` with its configuration in the environment, as the Docker image does.
 * `cli.ts` is the one a person runs, `npm start "<folder>"`, and it reaches this file only after it
 * has checked the Node version, because importing this file loads `node:sqlite`.
 */

import * as fs from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as path from "node:path";

import { createApp } from "./app.js";
import { DirectoryBlobStore } from "./adapters/directoryBlobStore.js";
import { HttpInferenceClient } from "./adapters/httpInference.js";
import { SqliteMetadataStore } from "./adapters/sqliteMetadataStore.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./http/log.js";
import { builtWebRoot } from "./http/staticWeb.js";
import { appUrl, describeStartFailure, isEntryPoint } from "./launcher.js";
import { createServer } from "./server.js";
import { importFolderSettingsOnce } from "./settings/folderDatabaseImport.js";
import { importDesktopSettingsOnce } from "./settings/legacyImport.js";
import type { AppDeps } from "./app.js";
import type { Config } from "./config.js";
import type { BlobStore } from "./ports/blobStore.js";
import type { MetadataStore } from "./ports/metadataStore.js";
import type { Logger } from "./http/log.js";

/**
 * Which adapters a configuration asks for — extracted so a test can ask the same question.
 *
 * It was inline until the inference service was found with the identical defect one layer down:
 * its entry point never constructed its service, so every AI route answered 503 in production
 * while its whole suite passed. The fix HERE was made earlier and was equally unprotected — no
 * test called `main`, so nothing would have noticed the line going away again.
 *
 * The stores are passed in rather than built here because building them touches the disk, and a
 * test of "does a configured URL produce a client" should not need a dataset on disk to ask it.
 */
export function buildDeps(
  config: Config,
  stores: {
    blobStore: BlobStore;
    metadataStore: MetadataStore;
    logger: Logger;
    /** Passed in because `healthy` belongs to the DIRECTORY adapter, not to the port. */
    datasetHealthy: () => Promise<boolean>;
  },
): AppDeps {
  /*
   * THE INFERENCE ADAPTER WAS NEVER CONSTRUCTED, and until this existed the AI tools were
   * unreachable in every real deployment however the service was run. The adapter was written and
   * tested, `AppDeps` accepted it, and no entry point ever passed one -- the built-but-unreachable
   * shape this project keeps finding, at the process level rather than the component level.
   *
   * Absent stays supported: no URL means the AI routes answer 503 with a reason and everything
   * else works, which is what a machine with no GPU should do.
   */
  const inference =
    config.inferenceUrl === null
      ? undefined
      : new HttpInferenceClient({ baseUrl: config.inferenceUrl });

  return {
    blobStore: stores.blobStore,
    metadataStore: stores.metadataStore,
    logger: stores.logger,
    datasetHealthy: stores.datasetHealthy,
    // So a blocking failure can name the folder the operator configured, not just describe it.
    datasetRoot: config.datasetRoot,
    // So the browser can say that settings will not outlive this process.
    databaseInMemory: config.databasePath === ":memory:",
    ...(inference === undefined ? {} : { inference }),
  };
}

export interface RunningApi {
  /** Where a browser on this computer reaches it. */
  readonly url: string;
  /** The port it listens on: the configured one, or the one the system chose for port 0. */
  readonly port: number;
  /** The web app's build it serves at `/`, or null when it serves only its routes. */
  readonly webRoot: string | null;
  /** Stop listening, then close the settings store. */
  close(): Promise<void>;
}

/**
 * Build everything the configuration names and listen. Rejects with the listen error itself, so an
 * entry point can tell a busy port (`EADDRINUSE`) from everything else, and closes what it opened.
 */
export async function startApi(config: Config, logger: Logger): Promise<RunningApi> {
  const blobStore = new DirectoryBlobStore(config.datasetRoot);
  if (!(await blobStore.healthy())) {
    // Fail at startup, not on the first request. A running API pointed at a folder that is not
    // there answers every listing with "empty", which reads as "you have no images".
    throw new Error(`the dataset root ${config.datasetRoot} is not a readable directory`);
  }

  if (config.databasePath !== ":memory:") {
    await fs.mkdir(path.dirname(config.databasePath), { recursive: true });
  } else {
    // Said at startup, and on /health for the browser: every save will succeed and none will last.
    logger.log("warn", "settings and hotkeys are held in memory and will be lost when the API stops", {
      database: config.databasePath,
    });
  }
  const metadataStore = new SqliteMetadataStore(config.databasePath);

  // The per-folder database earlier versions kept, imported once, and first: it is this app's own
  // record, and it already took in the desktop settings on its own first start. Never fatal.
  try {
    await importFolderSettingsOnce({
      store: metadataStore,
      databasePath: config.databasePath,
      datasetRoot: config.datasetRoot,
      logger,
    });
  } catch (cause) {
    logger.log("error", "the settings kept in this folder could not be imported", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }

  // Phase 4 exit criterion 3: the desktop app's settings, imported once. Never fatal -- someone
  // whose old settings cannot be read should still get a working app, with the reason logged.
  try {
    await importDesktopSettingsOnce({
      store: metadataStore,
      directory: config.legacySettingsDir,
      logger,
    });
  } catch (cause) {
    logger.log("error", "the desktop app's settings could not be imported", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const app = createApp(
    buildDeps(config, {
      blobStore,
      metadataStore,
      logger,
      datasetHealthy: () => blobStore.healthy(),
    }),
  );

  // The web app is served from here when it has been built, which `npm install` in `modernized/`
  // does: then this one process on this one port is the whole app (DEPLOYABILITY.md R3).
  const webRoot = builtWebRoot(config.webRoot);
  const server = createServer(app, { webRoot });
  try {
    await listen(server, config.port, config.host);
  } catch (cause) {
    await metadataStore.close();
    throw cause;
  }

  const port = (server.address() as AddressInfo).port;
  const url = appUrl(config.host, port);
  logger.log("info", "listening", {
    url,
    web:
      webRoot
      ?? (config.webRoot === null
        ? "not served (LAZYLABEL_WEB_DIST is empty)"
        : `not built, so only the API's routes are served: ${config.webRoot} has no index.html`),
    host: config.host,
    port,
    datasetRoot: config.datasetRoot,
    database: config.databasePath,
    // Logged either way: "inference: none" at startup is how an operator learns the AI tools
    // will be unavailable before a user clicks an object and finds out.
    inference: config.inferenceUrl ?? "none",
  });

  return {
    url,
    port,
    webRoot,
    close: () =>
      new Promise<void>((resolve) => {
        // Idle keep-alive connections would hold `close` open until they time out.
        server.closeIdleConnections();
        server.close(() => resolve());
      }).then(() => metadataStore.close()),
  };
}

/** `server.listen`, as a promise that rejects with the listen error rather than throwing it later. */
function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (cause: Error): void => {
      server.off("listening", listening);
      reject(cause);
    };
    const listening = (): void => {
      server.off("error", failed);
      resolve();
    };
    server.once("error", failed);
    server.once("listening", listening);
    server.listen(port, host);
  });
}

async function main(): Promise<void> {
  const logger = createLogger();
  const api = await startApi(loadConfig(), logger);

  const shutdown = (signal: string): void => {
    logger.log("info", "shutting down", { signal });
    void api.close().then(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

/*
 * Run only when this module IS the process, not when something imports it.
 *
 * Without the guard, importing `buildDeps` from a test starts a server, reads the real
 * environment, and exits the process when the configuration is absent -- so the wiring could not
 * be tested at all, which is how it came to be untested in the first place. A module that cannot
 * be imported without side effects is a module whose contents cannot be checked.
 *
 * The comparison resolves links on both sides (`isEntryPoint` says why): comparing the module's URL
 * with the path as typed made the API exit 0 without a word when started through a junction.
 */
if (isEntryPoint(import.meta.url, process.argv[1])) {
  main().catch((cause: unknown) => {
    createLogger().log("error", "the API could not start", { reason: describeStartFailure(cause) });
    process.exit(1);
  });
}
