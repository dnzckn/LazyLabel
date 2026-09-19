/**
 * Process entry point: build the adapters the configuration names, and listen.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { createApp } from "./app.js";
import { DirectoryBlobStore } from "./adapters/directoryBlobStore.js";
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

  const app = createApp({
    blobStore,
    metadataStore,
    logger,
    datasetHealthy: () => blobStore.healthy(),
  });

  const server = createServer(app);
  server.listen(config.port, config.host, () => {
    logger.log("info", "listening", {
      host: config.host,
      port: config.port,
      datasetRoot: config.datasetRoot,
      database: config.databasePath,
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
