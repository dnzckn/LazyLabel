/**
 * What the process actually builds — the line no other test was looking at.
 *
 * Every test in this suite constructs its own `AppDeps`, so not one of them ran what `main` runs.
 * That mattered twice. The inference ADAPTER was once never constructed here at all, and the AI
 * tools were unreachable in every real deployment while the whole suite passed; that was fixed,
 * and then stayed unprotected, because nothing called the wiring. And the same defect was later
 * found one layer down, in the inference service's own entry point, which never constructed its
 * service.
 *
 * So the wiring is a function with a caller now. These tests are that caller.
 */

import { describe, expect, it } from "vitest";

import { buildDeps } from "../src/main.js";
import { MemoryBlobStore } from "../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../src/adapters/sqliteMetadataStore.js";
import { silentLogger } from "../src/http/log.js";
import type { Config } from "../src/config.js";

function config(overrides: Partial<Config> = {}): Config {
  return {
    datasetRoot: "/datasets/demo",
    databasePath: ":memory:",
    port: 8787,
    host: "127.0.0.1",
    inferenceUrl: null,
    legacySettingsDir: null,
    ...overrides,
  } as Config;
}

function stores() {
  const blobStore = new MemoryBlobStore();
  return {
    blobStore,
    metadataStore: new SqliteMetadataStore(":memory:"),
    logger: silentLogger,
    datasetHealthy: async () => true,
  };
}

describe("building the app's dependencies", () => {
  it("constructs an inference client when a URL is configured", () => {
    // The assertion that was missing. One line, and the difference between a deployment whose AI
    // tools work and one that answers 503 to all of them.
    const deps = buildDeps(config({ inferenceUrl: "http://127.0.0.1:8788" }), stores());

    expect(deps.inference).toBeDefined();
  });

  it("leaves it out when no URL is configured, which is a real deployment", () => {
    // A machine with no GPU. The AI routes answer 503 with a reason and everything else works;
    // annotation is unaffected, because annotations are files in a folder.
    const deps = buildDeps(config({ inferenceUrl: null }), stores());

    expect(deps.inference).toBeUndefined();
  });

  it("passes the stores through rather than building its own", () => {
    const given = stores();

    const deps = buildDeps(config(), given);

    expect(deps.blobStore).toBe(given.blobStore);
    expect(deps.metadataStore).toBe(given.metadataStore);
  });

  it("keeps the dataset health check, which is what /health reports", async () => {
    // `healthy` belongs to the directory adapter rather than to the port, so it travels as a
    // function. A deps object without it would report a missing folder as an empty one.
    const deps = buildDeps(config(), { ...stores(), datasetHealthy: async () => false });

    expect(await deps.datasetHealthy?.()).toBe(false);
  });

  it("marks a database held in memory, so /health can say settings will not outlive the process", () => {
    expect(buildDeps(config({ databasePath: ":memory:" }), stores()).databaseInMemory).toBe(true);
    expect(buildDeps(config({ databasePath: "/data/.lazylabel/lazylabel.db" }), stores()).databaseInMemory).toBe(false);
  });
});
