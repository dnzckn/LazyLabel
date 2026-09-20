/**
 * Process entry point: build the adapters the configuration names, and listen.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { createApp } from "./app.js";
import { DirectoryBlobStore } from "./adapters/directoryBlobStore.js";
import { HttpInferenceClient } from "./adapters/httpInference.js";
import { SqliteMetadataStore } from "./adapters/sqliteMetadataStore.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./http/log.js";
import { createServer } from "./server.js";

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

  /*
   * THE INFERENCE ADAPTER WAS NEVER CONSTRUCTED HERE, and until this line existed the AI tools
   * were unreachable in every real deployment however the service was run. The adapter was
   * written and tested, `AppDeps` accepted it, and no entry point ever passed one -- the same
   * built-but-unreachable shape this project has found repeatedly, at the process level rather
   * than the component level.
   *
   * Absent stays supported: no URL means the AI routes answer 503 with a reason and everything
   * else works, which is what a machine with no GPU should do.
   */
  const inference =
    config.inferenceUrl === null
      ? undefined
      : new HttpInferenceClient({ baseUrl: config.inferenceUrl });

  const app = createApp({
    blobStore,
    metadataStore,
    logger,
    datasetHealthy: () => blobStore.healthy(),
    ...(inference === undefined ? {} : { inference }),
  });

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

main().catch((cause: unknown) => {
  createLogger().log("error", "the API could not start", {
    reason: cause instanceof Error ? cause.message : String(cause),
  });
  process.exit(1);
});
