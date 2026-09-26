/**
 * `startApi`, which both entry points run: `main.js` for a deployment, `cli.js` for a person.
 *
 * It is the function a user's first minute depends on, so it is run here for real -- a folder on
 * disk, a socket, the web app's build -- rather than trusted because its parts are tested.
 */

import { createServer as createNetServer, type Server } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { silentLogger } from "../src/http/log.js";
import { startApi } from "../src/main.js";
import type { Config } from "../src/config.js";

let scratch: string;
let images: string;
let site: string;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "lazylabel-start-"));
  images = path.join(scratch, "my images");
  site = path.join(scratch, "dist");
  await mkdir(images);
  await mkdir(site);
  await writeFile(path.join(site, "index.html"), "<!doctype html><title>LazyLabel</title>");
});

afterAll(() => rm(scratch, { recursive: true, force: true }));

function config(overrides: Partial<Config> = {}): Config {
  return {
    datasetRoot: images,
    databasePath: ":memory:",
    port: 0,
    host: "127.0.0.1",
    inferenceUrl: null,
    legacySettingsDir: null,
    webRoot: site,
    ...overrides,
  };
}

describe("starting the API", () => {
  it("serves the web app and the API on one port, at the address it reports", async () => {
    const api = await startApi(config(), silentLogger);
    try {
      expect(api.url).toBe(`http://127.0.0.1:${api.port}/`);
      expect(api.webRoot).toBe(site);

      const page = await fetch(api.url);
      expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");

      const health = await fetch(new URL("api/health", api.url));
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ datasetRoot: images, databaseInMemory: true });
    } finally {
      await api.close();
    }
  });

  it("serves the routes alone when the web app has not been built, and says so by its webRoot", async () => {
    const api = await startApi(config({ webRoot: path.join(scratch, "never-built") }), silentLogger);
    try {
      expect(api.webRoot).toBeNull();
      expect((await fetch(new URL("health", api.url))).status).toBe(200);
    } finally {
      await api.close();
    }
  });

  it("rejects with the listen error itself when the port is taken, so an entry point can explain it", async () => {
    const holder: Server = createNetServer();
    await new Promise<void>((resolve) => holder.listen(0, "127.0.0.1", resolve));
    const port = (holder.address() as AddressInfo).port;
    try {
      await expect(startApi(config({ port }), silentLogger)).rejects.toMatchObject({ code: "EADDRINUSE", port });
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });

  it("refuses a folder that is not there, naming it, before it listens", async () => {
    const missing = path.join(scratch, "not here");

    await expect(startApi(config({ datasetRoot: missing }), silentLogger)).rejects.toThrow(missing);
  });
});
