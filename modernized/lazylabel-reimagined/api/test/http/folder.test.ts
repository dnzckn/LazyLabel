/**
 * POST /folder, the file panel's Open Image Folder on the server's side, and what /health says about
 * the folder: the owner's request of 2026-09-29, "in the gui the user should be able to select a
 * folder to load".
 *
 * Legacy's button shows the system's folder dialog, "Select Image Folder", and a folder chosen
 * replaces the file list; closing the dialog changes nothing (main_window.py:1431-1438). The dialog
 * here is a stand-in: no test opens a real one.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type App, type FolderSwitch } from "../../src/app.js";
import { FolderBlobStore } from "../../src/adapters/folderBlobStore.js";
import { HttpInferenceClient } from "../../src/adapters/httpInference.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { createLogger } from "../../src/http/log.js";
import type { FolderChoice } from "../../src/config.js";
import { get, jsonBody, post, put } from "../helpers/request.js";

/** A solid PNG of this size: the size is what says which folder's picture was served. */
function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
}

let scratch: string;
/** Two folders of images: a.png and b.png in the first, c.png in the second. */
let first: string;
let second: string;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "lazylabel-folder-"));
  first = path.join(scratch, "first set");
  second = path.join(scratch, "second set");
  await mkdir(first);
  await mkdir(second);
  await writeFile(path.join(first, "a.png"), await png(4, 3));
  await writeFile(path.join(first, "b.png"), await png(4, 3));
  await writeFile(path.join(second, "c.png"), await png(6, 5));
  await writeFile(path.join(scratch, "notes.txt"), "not a folder");
});

afterAll(() => rm(scratch, { recursive: true, force: true }));

/** The switch `main.ts` builds, over the same store. */
function switchOver(
  store: FolderBlobStore,
  choice: FolderChoice,
  choose: FolderSwitch["choose"] = async () => null,
): FolderSwitch {
  return { choice, current: () => store.root, open: (folder) => store.open(folder), choose };
}

/** A POST from the app's own page, served at 127.0.0.1:8787, as a browser sends it. */
const OWN_PAGE = { origin: "http://127.0.0.1:8787", host: "127.0.0.1:8787" };

const names = async (app: App): Promise<string[]> =>
  (jsonBody(await app.handle(get("/projects/p1/images"))).images as { name: string }[]).map((image) => image.name);

describe("opening a folder of images from the app", () => {
  let metadata: SqliteMetadataStore;

  beforeEach(() => {
    metadata = new SqliteMetadataStore(":memory:");
  });
  afterEach(() => metadata.close());

  function appOver(store: FolderBlobStore, folder: FolderSwitch): App {
    return createApp({ blobStore: store, metadataStore: metadata, datasetHealthy: () => store.healthy(), folder });
  }

  it("opens the folder named by its path, and the list is that folder's", async () => {
    const store = new FolderBlobStore(first);
    const app = appOver(store, switchOver(store, "path"));
    expect(await names(app)).toEqual(["a.png", "b.png"]);

    const response = await app.handle(post("/folder", { path: second }, OWN_PAGE));

    expect(response.status).toBe(200);
    expect(jsonBody(response)).toEqual({ datasetRoot: second, cancelled: false });
    expect(await names(app)).toEqual(["c.png"]);
    expect(jsonBody(await app.handle(get("/health"))).datasetRoot).toBe(second);
  });

  it("shows the system's folder dialog for { choose: true }, and opens the folder chosen", async () => {
    const store = new FolderBlobStore(first);
    const choose = vi.fn(async () => second);
    const app = appOver(store, switchOver(store, "dialog", choose));

    const response = await app.handle(post("/folder", { choose: true }, OWN_PAGE));

    expect(choose).toHaveBeenCalledTimes(1);
    expect(jsonBody(response)).toEqual({ datasetRoot: second, cancelled: false });
    expect(await names(app)).toEqual(["c.png"]);
  });

  it("changes nothing when the dialog is closed, as legacy's does", async () => {
    const store = new FolderBlobStore(first);
    const app = appOver(store, switchOver(store, "dialog", async () => null));

    const response = await app.handle(post("/folder", { choose: true }, OWN_PAGE));

    expect(response.status).toBe(200);
    expect(jsonBody(response)).toEqual({ datasetRoot: first, cancelled: true });
    expect(await names(app)).toEqual(["a.png", "b.png"]);
  });

  it("says so when the dialog was closed with no folder open, which stays none", async () => {
    const store = new FolderBlobStore(null);
    const app = appOver(store, switchOver(store, "dialog", async () => null));

    expect(jsonBody(await app.handle(post("/folder", { choose: true }, OWN_PAGE)))).toEqual({
      datasetRoot: null,
      cancelled: true,
    });
  });

  it("says 503 when this computer has no dialog to show, and 400 where the server shows none", async () => {
    // zenity and kdialog both missing on a Linux desktop: the app then asks for the path instead.
    const store = new FolderBlobStore(first);
    const missing = appOver(store, switchOver(store, "dialog", async () => "missing"));
    const typed = appOver(store, switchOver(store, "path", async () => second));

    const none = await missing.handle(post("/folder", { choose: true }, OWN_PAGE));
    const refused = await typed.handle(post("/folder", { choose: true }, OWN_PAGE));

    expect(none.status).toBe(503);
    expect(jsonBody(none).code).toBe("no_folder_dialog");
    expect(refused.status).toBe(400);
    expect(store.root).toBe(first);
  });

  it("refuses a body that is not JSON (415): the POST another site's page could send unasked", async () => {
    const store = new FolderBlobStore(first);
    const app = appOver(store, switchOver(store, "path"));

    const response = await app.handle(post("/folder", { path: second }, { "content-type": "text/plain" }));

    expect(response.status).toBe(415);
    expect(store.root).toBe(first);
  });

  it("refuses a request from another site's page (403), and takes one from its own", async () => {
    const store = new FolderBlobStore(first);
    const app = appOver(store, switchOver(store, "path"));

    const foreign = await app.handle(post("/folder", { path: second }, { origin: "https://example.com", host: "127.0.0.1:8787" }));
    const sandboxed = await app.handle(post("/folder", { path: second }, { origin: "null", host: "127.0.0.1:8787" }));
    const otherPort = await app.handle(post("/folder", { path: second }, { origin: "http://127.0.0.1:9999", host: "127.0.0.1:8787" }));

    expect([foreign.status, sandboxed.status, otherPort.status]).toEqual([403, 403, 403]);
    expect(store.root).toBe(first);

    expect((await app.handle(post("/folder", { path: second }, OWN_PAGE))).status).toBe(200);
    expect(store.root).toBe(second);
  });

  it("refuses every request where the folder is fixed (403), as a deployment's is", async () => {
    const store = new FolderBlobStore(first);
    const fixed = appOver(store, switchOver(store, "fixed", async () => second));
    const unswitchable = createApp({ blobStore: store, metadataStore: metadata });

    const byPath = await fixed.handle(post("/folder", { path: second }, OWN_PAGE));
    const byDialog = await fixed.handle(post("/folder", { choose: true }, OWN_PAGE));
    const without = await unswitchable.handle(post("/folder", { path: second }, OWN_PAGE));

    expect([byPath.status, byDialog.status, without.status]).toEqual([403, 403, 403]);
    expect(jsonBody(byPath).code).toBe("folder_fixed");
    expect(store.root).toBe(first);
  });

  it("refuses what is not a folder it can open (400), saying why, and keeps the one open", async () => {
    const store = new FolderBlobStore(first);
    const app = appOver(store, switchOver(store, "path"));

    const missing = await app.handle(post("/folder", { path: path.join(scratch, "not here") }, OWN_PAGE));
    const file = await app.handle(post("/folder", { path: path.join(scratch, "notes.txt") }, OWN_PAGE));
    const relative = await app.handle(post("/folder", { path: "second set" }, OWN_PAGE));
    const unnamed = await app.handle(post("/folder", {}, OWN_PAGE));

    expect([missing.status, file.status, relative.status, unnamed.status]).toEqual([400, 400, 400, 400]);
    expect(jsonBody(missing).message).toMatch(/there is no folder at .*not here/);
    expect(jsonBody(file).message).toMatch(/is a file, not a folder/);
    expect(jsonBody(relative).message).toMatch(/not a full path/);
    expect(store.root).toBe(first);
    expect(await names(app)).toEqual(["a.png", "b.png"]);
  });

  it("serves the new folder's picture under the same name: nothing rendered from the old one answers", async () => {
    // Stores whose revisions coincide across folders, as two copies of one set can: a render cache
    // that outlived the switch would answer b's a.png with a's picture, from its first request on.
    const pictures = new Map([
      [first, new MemoryBlobStore({ "a.png": await png(4, 3) })],
      [second, new MemoryBlobStore({ "a.png": await png(6, 5) })],
    ]);
    const store = new FolderBlobStore(first, (root) => pictures.get(root)!);
    const app = appOver(store, switchOver(store, "path"));
    const pixels = () => app.handle(get("/projects/p1/images/a.png/pixels"));
    const tile = () => app.handle(get("/projects/p1/images/a.png/tiles/0/0/0"));
    expect((await pictures.get(first)!.stat("a.png"))!.revision).toBe((await pictures.get(second)!.stat("a.png"))!.revision);

    expect((await pixels()).headers["x-image-width"]).toBe("4");
    expect((await pixels()).headers["x-image-cached"]).toBe("hit");
    expect((await tile()).headers["x-image-width"]).toBe("4");

    await app.handle(post("/folder", { path: second }, OWN_PAGE));

    const after = await pixels();
    expect(after.headers["x-image-width"]).toBe("6");
    expect(after.headers["x-image-cached"]).toBe("miss");
    expect((await tile()).headers["x-image-width"]).toBe("6");
  });

  it("points the inference service at the folder opened, which reads images itself", async () => {
    const calls: { path: string; body: unknown; origin: string | null }[] = [];
    const inference = new HttpInferenceClient({
      baseUrl: "http://inference.test",
      fetch: (async (...args: Parameters<typeof globalThis.fetch>) => {
        const [input, init] = args;
        const headers = new Headers(init?.headers);
        calls.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)), origin: headers.get("origin") });
        return new Response(JSON.stringify({ datasetRoot: second }), { status: 200 });
      }) as typeof globalThis.fetch,
    });
    const store = new FolderBlobStore(first);
    const app = createApp({ blobStore: store, metadataStore: metadata, inference, folder: switchOver(store, "path") });

    await app.handle(post("/folder", { path: second }, OWN_PAGE));

    // No Origin: the service refuses any request that carries one, and only the API calls it.
    expect(calls).toEqual([{ path: "/dataset-root", body: { path: second }, origin: null }]);
  });

  it("opens the folder all the same when the inference service cannot be told, with a warning logged", async () => {
    const lines: string[] = [];
    const inference = new HttpInferenceClient({
      baseUrl: "http://inference.test",
      fetch: (async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8788");
      }) as unknown as typeof globalThis.fetch,
    });
    const store = new FolderBlobStore(first);
    const app = createApp({
      blobStore: store,
      metadataStore: metadata,
      inference,
      logger: createLogger((line) => lines.push(line)),
      folder: switchOver(store, "path"),
    });

    const response = await app.handle(post("/folder", { path: second }, OWN_PAGE));

    expect(jsonBody(response)).toEqual({ datasetRoot: second, cancelled: false });
    const warning = lines.map((line) => JSON.parse(line)).find((record) => record.level === "warn");
    expect(warning).toMatchObject({ message: "the AI tools could not be pointed at the folder opened", datasetRoot: second });
    expect(warning.reason).toMatch(/ECONNREFUSED/);
  });

  it("refuses to write with no folder open (409), where there is nowhere to put the file", async () => {
    const store = new FolderBlobStore(null);
    const app = appOver(store, switchOver(store, "dialog"));

    const response = await app.handle(
      put("/projects/p1/images/a.png/annotations", { imageSize: [3, 4], formats: ["YOLO_DETECTION"], segments: [] }),
    );

    expect(response.status).toBe(409);
    expect(jsonBody(response).code).toBe("no_folder");
  });
});

describe("health, with a folder open and with none", () => {
  let metadata: SqliteMetadataStore;

  beforeEach(() => {
    metadata = new SqliteMetadataStore(":memory:");
  });
  afterEach(() => metadata.close());

  it("says none, not an error, before any folder is open, with an empty list and the choice", async () => {
    const store = new FolderBlobStore(null);
    const app = createApp({
      blobStore: store,
      metadataStore: metadata,
      datasetHealthy: () => store.healthy(),
      folder: switchOver(store, "dialog"),
    });

    const response = await app.handle(get("/health"));

    expect(response.status).toBe(200);
    expect(jsonBody(response)).toMatchObject({ status: "ok", dataset: "none", datasetRoot: null, folderChoice: "dialog" });
    expect(await names(app)).toEqual([]);
  });

  it("names the folder open, and how another is chosen", async () => {
    const store = new FolderBlobStore(first);
    const app = createApp({
      blobStore: store,
      metadataStore: metadata,
      datasetHealthy: () => store.healthy(),
      folder: switchOver(store, "path"),
    });

    expect(jsonBody(await app.handle(get("/health")))).toMatchObject({
      status: "ok",
      dataset: "ok",
      datasetRoot: first,
      folderChoice: "path",
    });
  });

  it("says fixed where nothing can open another folder", async () => {
    const app = createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata, datasetRoot: "/datasets/cells" });

    expect(jsonBody(await app.handle(get("/health")))).toMatchObject({
      dataset: "ok",
      datasetRoot: "/datasets/cells",
      folderChoice: "fixed",
    });
  });
});
