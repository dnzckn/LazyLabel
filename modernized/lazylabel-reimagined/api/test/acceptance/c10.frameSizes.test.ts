/**
 * C10 through the API: the size of every frame, which RULE-048 decides by.
 *
 * "Reference frames must match the first reference's image size": SAM 2 stages one video at one
 * size, so a frame of another size is skipped. The browser learns each frame's size from the
 * metadata route, and until 2026-09-23 no test had ever called that route -- the function behind
 * it was proven, the route in front of it was not.
 *
 * Also what makes normalized coordinates loadable (C2's text formats), so a wrong size here is a
 * misplaced annotation as well as a wrongly skipped frame.
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, jsonBody } from "../helpers/request.js";

async function png(width: number, height: number, channels: 1 | 3 = 3): Promise<Uint8Array> {
  const background = channels === 1 ? { r: 90, g: 90, b: 90 } : { r: 120, g: 130, b: 140 };
  const image = sharp({ create: { width, height, channels: 3, background } });
  return channels === 1 ? image.toColourspace("b-w").png().toBuffer() : image.png().toBuffer();
}

describe("C10: each frame's size, for RULE-048", () => {
  let metadata: SqliteMetadataStore;
  let store: MemoryBlobStore;
  let app: App;

  beforeEach(() => {
    metadata = new SqliteMetadataStore(":memory:");
    store = new MemoryBlobStore();
    app = createApp({ blobStore: store, metadataStore: metadata });
  });

  afterEach(() => {
    metadata.close();
  });

  const sizeOf = (key: string) => app.handle(get(`/projects/p1/images/${key}/metadata`));

  it("answers each frame's own size, so a frame of another size can be told apart", async () => {
    await store.writeAtomic("run/frame_000.png", await png(80, 64));
    await store.writeAtomic("run/frame_001.png", await png(96, 64));

    const first = await sizeOf("run/frame_000.png");
    const second = await sizeOf("run/frame_001.png");

    expect(first.status).toBe(200);
    expect(jsonBody(first)).toMatchObject({ width: 80, height: 64, sourceFormat: "png" });
    expect(jsonBody(second)).toMatchObject({ width: 96, height: 64 });
  });

  it("says whether a frame is grayscale, which the display pipeline needs as well", async () => {
    await store.writeAtomic("run/gray.png", await png(8, 8, 1));

    expect(jsonBody(await sizeOf("run/gray.png"))).toMatchObject({ sourceChannels: 1, sourceDepth: 8 });
  });

  it("answers 404 for a frame that is not in the folder", async () => {
    const response = await sizeOf("run/missing.png");

    expect(response.status).toBe(404);
  });

  it("answers 422 for a file the pipeline cannot read, not a server error", async () => {
    await store.writeAtomic("run/broken.png", new TextEncoder().encode("not an image"));

    const response = await sizeOf("run/broken.png");

    expect(response.status).toBe(422);
  });
});
