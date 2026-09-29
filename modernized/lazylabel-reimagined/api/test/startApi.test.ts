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

import { defaultSettings } from "@lazylabel/settings-schema";
import { SqliteMetadataStore } from "../src/adapters/sqliteMetadataStore.js";
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
    folderChoice: "fixed",
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

describe("starting with no folder, which the app then opens (the owner, 2026-09-29)", () => {
  /** POST /api/folder as the app's own page sends it: JSON, from the address the API is served at. */
  const openFolder = (url: string, body: unknown) =>
    fetch(new URL("api/folder", url), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(url).origin },
      body: JSON.stringify(body),
    });

  it("starts with none open, then opens the folder named from the app's own page", async () => {
    await writeFile(path.join(images, "frame.png"), "");
    const api = await startApi(config({ datasetRoot: null, folderChoice: "path" }), silentLogger);
    try {
      const before = await fetch(new URL("api/health", api.url));
      expect(before.status).toBe(200);
      expect(await before.json()).toMatchObject({ dataset: "none", datasetRoot: null, folderChoice: "path" });

      const opened = await openFolder(api.url, { path: images });
      expect(opened.status).toBe(200);
      expect(await opened.json()).toEqual({ datasetRoot: images, cancelled: false });

      expect(await (await fetch(new URL("api/health", api.url))).json()).toMatchObject({ dataset: "ok", datasetRoot: images });
      const listing = (await (await fetch(new URL("api/projects/default/images", api.url))).json()) as {
        images: { name: string }[];
      };
      expect(listing.images.map((image) => image.name)).toEqual(["frame.png"]);
    } finally {
      await api.close();
    }
  });

  it("shows the dialog it was given for { choose: true }, and never a real one in a test", async () => {
    const api = await startApi(config({ datasetRoot: null, folderChoice: "dialog" }), silentLogger, {
      chooseFolder: async () => images,
    });
    try {
      const opened = await openFolder(api.url, { choose: true });
      expect(await opened.json()).toEqual({ datasetRoot: images, cancelled: false });
    } finally {
      await api.close();
    }
  });

  it("keeps a deployment's folder fixed", async () => {
    const api = await startApi(config(), silentLogger);
    try {
      expect((await openFolder(api.url, { path: scratch })).status).toBe(403);
      expect(await (await fetch(new URL("api/health", api.url))).json()).toMatchObject({
        datasetRoot: images,
        folderChoice: "fixed",
      });
    } finally {
      await api.close();
    }
  });
});

describe("the settings a user already had (DEPLOYABILITY.md R5)", () => {
  it("takes a folder's old database before the desktop app's files, and keeps them in the per-user file", async () => {
    // A folder an earlier version kept settings in, and desktop settings that say something else.
    const dataset = path.join(scratch, "settled");
    await mkdir(dataset);
    const earlier = new SqliteMetadataStore(path.join(await mkdirp(dataset, ".lazylabel"), "lazylabel.db"));
    const defaults = defaultSettings();
    await earlier.putSettings("me", { ...defaults, values: { ...defaults.values, window_width: 1111 } });
    await earlier.close();
    const desktop = await mkdirp(scratch, "desktop-config");
    await writeFile(path.join(desktop, "settings.json"), JSON.stringify({ window_width: 2222 }));
    const perUser = path.join(scratch, "home", ".config", "lazylabel", "lazylabel-web.db");

    const api = await startApi(
      config({ datasetRoot: dataset, databasePath: perUser, legacySettingsDir: desktop }),
      silentLogger,
    );
    try {
      const settings = (await (await fetch(new URL("api/users/me/settings", api.url))).json()) as {
        values: Record<string, unknown>;
      };
      // The folder's database is the web app's own record, newer than the desktop files it took in.
      expect(settings.values["window_width"]).toBe(1111);
    } finally {
      await api.close();
    }

    const stored = new SqliteMetadataStore(perUser);
    try {
      expect((await stored.getSettings("me"))!.values["window_width"]).toBe(1111);
    } finally {
      await stored.close();
    }
  });
});

async function mkdirp(...parts: string[]): Promise<string> {
  const folder = path.join(...parts);
  await mkdir(folder, { recursive: true });
  return folder;
}
