/**
 * Configuration, from the environment.
 *
 * The two storage settings are the ports of `REIMAGINED_ARCHITECTURE.md` section 3.1. Today each
 * names the default adapter's location; when an adapter for object storage or a SQL server exists,
 * this is where the choice between them is made, and nothing above it changes.
 */

import * as path from "node:path";

export interface Config {
  /** Absolute path of the mounted dataset directory: the blob store's location. */
  readonly datasetRoot: string;
  /** SQLite file for the metadata store, or ":memory:". */
  readonly databasePath: string;
  readonly port: number;
  readonly host: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const datasetRoot = env["LAZYLABEL_DATASET_ROOT"];
  if (datasetRoot === undefined || datasetRoot.trim() === "") {
    // Refuse to start rather than default to the working directory. "Dataset folder unreadable"
    // is a blocking error in the failure-mode table precisely because the alternative — an empty
    // file list that looks like an empty folder — is indistinguishable from having no work.
    throw new ConfigError(
      "LAZYLABEL_DATASET_ROOT must name the folder holding your images; the API will not guess",
    );
  }

  const port = Number(env["LAZYLABEL_PORT"] ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`LAZYLABEL_PORT must be a port number, got ${JSON.stringify(env["LAZYLABEL_PORT"])}`);
  }

  return {
    datasetRoot: path.resolve(datasetRoot),
    databasePath: env["LAZYLABEL_DB"] ?? path.join(path.resolve(datasetRoot), ".lazylabel", "lazylabel.db"),
    port,
    // Loopback by default. Decision 3 is one trusted user per deployment, so binding every
    // interface is a choice an operator makes on purpose, behind the reverse proxy that terminates
    // TLS and authenticates, not a default that quietly exposes someone's images to their network.
    host: env["LAZYLABEL_HOST"] ?? "127.0.0.1",
  };
}
