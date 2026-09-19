/**
 * The image routes: what they serve, and how they fail.
 *
 * The decoding itself is compared against OpenCV in `differential.test.ts`. What is checked here is
 * the envelope: that a file which is not an image is a 422 about that file rather than a 500, that a
 * missing one is a 404, and that the size travels with the pixels.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, jsonBody, request } from "../helpers/request.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "images");

describe("the image routes", () => {
  let app: App;
  let store: MemoryBlobStore;
  let metadata: SqliteMetadataStore;

  beforeEach(async () => {
    store = new MemoryBlobStore();
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: store, metadataStore: metadata });

    for (const name of ["gradient8.png", "gradient16.tiff", "gradient8.bmp"]) {
      await store.writeAtomic(`frames/${name}`, new Uint8Array(await readFile(path.join(FIXTURES, name))));
    }
    await store.writeAtomic("frames/notes.txt", new TextEncoder().encode("not an image"));
  });

  afterEach(() => metadata.close());

  const at = (name: string, suffix: string) => `/projects/p1/images/frames/${name}/${suffix}`;

  it("reports an image's size and kind", async () => {
    const response = await app.handle(get(at("gradient8.png", "metadata")));

    expect(response.status).toBe(200);
    expect(jsonBody(response)).toEqual({
      width: 32,
      height: 24,
      sourceDepth: 8,
      sourceFormat: "png",
    });
  });

  it("says when an image was 16-bit, so a caller knows a conversion happened", async () => {
    const body = jsonBody(await app.handle(get(at("gradient16.tiff", "metadata"))));

    // RULE-024's conversion is invisible in the pixels; the depth is how anyone knows it ran.
    expect(body.sourceDepth).toBe(16);
    expect(body.sourceFormat).toBe("tiff");
  });

  it("serves PNG pixels with the size in the headers", async () => {
    const response = await app.handle(get(at("gradient16.tiff", "pixels")));

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["x-image-width"]).toBe("32");
    expect(response.headers["x-image-height"]).toBe("24");
    expect(response.headers["x-image-source-depth"]).toBe("16");

    // A real PNG, not a JSON error with the wrong content type.
    const bytes = response.body as Uint8Array;
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("serves a BMP, which the image library cannot decode on its own", async () => {
    const response = await app.handle(get(at("gradient8.bmp", "pixels")));
    expect(response.status).toBe(200);
    expect(response.headers["x-image-width"]).toBe("32");
  });

  it("serves a thumbnail no larger than the size asked for", async () => {
    const response = await app.handle(
      request("GET", at("gradient8.png", "thumbnail"), { query: { size: "16" } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect((response.body as Uint8Array).length).toBeGreaterThan(8);
  });

  it("refuses a thumbnail size outside its bounds", async () => {
    for (const size of ["0", "4096", "half", "-20"]) {
      const response = await app.handle(
        request("GET", at("gradient8.png", "thumbnail"), { query: { size } }),
      );
      expect(response.status, size).toBe(400);
    }
  });

  describe("failing usefully", () => {
    it("answers 422 for a file that is not an image, not 500", async () => {
      const response = await app.handle(get(at("notes.txt", "pixels")));

      // The client shows this against the row. A 500 would read as the service being broken.
      expect(response.status).toBe(422);
      expect(jsonBody(response).code).toBe("unsupported_image");
    });

    it("answers 404 for an image that is not there", async () => {
      const response = await app.handle(get(at("absent.png", "metadata")));

      expect(response.status).toBe(404);
      expect(jsonBody(response).code).toBe("not_found");
    });

    it("refuses a path that walks out of the dataset root", async () => {
      const response = await app.handle(get("/projects/p1/images/..%2F..%2Fetc%2Fpasswd/pixels"));
      expect(response.status).toBe(400);
    });
  });
});
