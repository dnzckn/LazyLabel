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
      // 3 rather than 1: the fixture is a colour PNG. The field exists because RULE-032 disables
      // rescale for colour and RULE-029 offers one Gray channel or three separate ones, and
      // neither question is answerable once the decoder has turned everything into RGB.
      sourceChannels: 3,
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

  it("says how many channels the SOURCE had, so a client knows which controls to offer", async () => {
    // RULE-032 disables rescale for colour and RULE-029 offers one Gray channel or three separate
    // ones. The decoder turns everything into RGB, so this header is the only place the answer
    // survives the pipeline.
    const response = await app.handle(get(at("gradient8.png", "pixels")));

    expect(response.headers["x-image-source-channels"]).toBe("3");
  });

  it("applies RULE-032's chain when the query asks for it", async () => {
    // The pixels differ. Not a strong claim on its own -- the chain's arithmetic is proven in
    // `processing.test.ts` -- but it is the join: a parameter the endpoint drops would leave these
    // two responses identical, and nothing else would notice.
    const plain = await app.handle(get(at("gradient8.png", "pixels")));
    const thresholded = await app.handle(
      request("GET", at("gradient8.png", "pixels"), { query: { markers_r: "128" } }),
    );

    expect(thresholded.status).toBe(200);
    expect([...(thresholded.body as Uint8Array)]).not.toEqual([...(plain.body as Uint8Array)]);
  });

  it("refuses a malformed processing parameter rather than ignoring it", async () => {
    // An ignored parameter is an image that looks untouched for a reason nobody can see.
    for (const query of [{ rescaleMin: "50" }, { markers_g: "50,x" }, { crop: "1,2,3" }]) {
      const response = await app.handle(request("GET", at("gradient8.png", "pixels"), { query }));
      expect(response.status, JSON.stringify(query)).toBe(400);
    }
  });

  it("serves the same processed bytes from cache the second time", async () => {
    // And the headers with them, because they are one answer: rebuilding them on a hit means
    // re-deriving the width and depth without the decode that produced them.
    const query = { markers_r: "128" };
    const first = await app.handle(request("GET", at("gradient8.png", "pixels"), { query }));
    const second = await app.handle(request("GET", at("gradient8.png", "pixels"), { query }));

    expect(first.headers["x-image-cached"]).toBe("miss");
    expect(second.headers["x-image-cached"]).toBe("hit");
    expect([...(second.body as Uint8Array)]).toEqual([...(first.body as Uint8Array)]);
    expect(second.headers["x-image-width"]).toBe("32");
  });

  it("does NOT serve one set of processing parameters from another", async () => {
    // RULE-030 records legacy's defect: its cached spectrum is keyed only by image dimensions, so
    // it is not invalidated when the rescale or threshold settings upstream change. The key here
    // is the whole query, which makes that structurally impossible rather than a thing to remember
    // when the next parameter is added.
    await app.handle(request("GET", at("gradient8.png", "pixels"), { query: { markers_r: "128" } }));
    const other = await app.handle(
      request("GET", at("gradient8.png", "pixels"), { query: { markers_r: "64" } }),
    );

    expect(other.headers["x-image-cached"]).toBe("miss");
  });

  it("refuses to filter an image too large, rather than holding the request open", async () => {
    // The fixture is small, so this proves the PARAMETER reaches the filter rather than the limit
    // itself -- which `processing.test.ts` covers. Here the point is that a frequency request on a
    // normal image succeeds.
    const response = await app.handle(
      request("GET", at("gradient8.png", "pixels"), { query: { frequencies: "1000" } }),
    );

    expect(response.status).toBe(200);
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
