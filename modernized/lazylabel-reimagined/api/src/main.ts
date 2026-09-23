/**
 * Process entry point: build the adapters the configuration names, and listen.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { createApp } from "./app.js";
import { DirectoryBlobStore } from "./adapters/directoryBlobStore.js";
import { HttpInferenceClient } from "./adapters/httpInference.js";
import { SqliteMetadataStore } from "./adapters/sqliteMetadataStore.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./http/log.js";
import { createServer } from "./server.js";
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
    ...(inference === undefined ? {} : { inference }),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger();

  const blobStore = new DirectoryBlobStore(config.datasetRoot);
  if (!(await blobStore.healthy())) {
    // Fail at startup, not on the first request. A running API pointed at a folder that is not
    // there answers every listing with "empty", which reads as "you have no images".
    throw new Error(`the dataset root ${config.datasetRoot} is not a readable directory`);
  }

  if (config.databasePath !== ":memory:") {
    await fs.mkdir(path.dirname(config.databasePath), { recursive: true });
  }
  const metadataStore = new SqliteMetadataStore(config.databasePath);

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

  const server = createServer(app);
  server.listen(config.port, config.host, () => {
    logger.log("info", "listening", {
      host: config.host,
      port: config.port,
      datasetRoot: config.datasetRoot,
      database: config.databasePath,
      // Logged either way: "inference: none" at startup is how an operator learns the AI tools
      // will be unavailable before a user clicks an object and finds out.
      inference: config.inferenceUrl ?? "none",
    });
  });

  const shutdown = (signal: string): void => {
    logger.log("info", "shutting down", { signal });
    server.close(() => {
      void metadataStore.close().then(() => process.exit(0));
    });
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
 */
const isEntryPoint =
  process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((cause: unknown) => {
    createLogger().log("error", "the API could not start", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    process.exit(1);
  });
}
