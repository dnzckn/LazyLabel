/**
 * C8's tiles: `/images/{imagePath}/tiles/{z}/{x}/{y}`, held to `/pixels` pixel for pixel.
 *
 * The claim is that a tile is not an approximation of the image but a piece of it: tile (x, y) of
 * level 0 is exactly that region of `/pixels`, and every level above is the one below averaged in
 * 2x2 blocks, which a reference written out longhand here recomputes. The image is 1100 x 700, so
 * it has three levels (1100 -> 550 -> 275), ragged edges on both axes, and a partial tile in every
 * corner that could be off by one.
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TILE_SIZE } from "@lazylabel/contracts";

import { createApp, type App } from "../../src/app.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, jsonBody, request } from "../helpers/request.js";

const WIDTH = 1100;
const HEIGHT = 700;
const KEY = "frames/big.png";

/** A picture with no two neighbours alike, so a region taken from the wrong place cannot match. */
function picture(seed: number): Uint8Array {
  const data = new Uint8Array(WIDTH * HEIGHT * 3);
  let state = seed;
  for (let i = 0; i < data.length; i += 1) {
    state = (state * 1103515245 + 12345) >>> 0;
    data[i] = state >>> 24;
  }
  return data;
}

async function png(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp(Buffer.from(data), { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toBuffer(),
  );
}

async function raster(body: unknown): Promise<{ width: number; height: number; data: Uint8Array }> {
  const { data, info } = await sharp(Buffer.from(body as Uint8Array)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(3);
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

function region(
  image: { width: number; data: Uint8Array },
  left: number,
  top: number,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    const from = ((top + row) * image.width + left) * 3;
    out.set(image.data.subarray(from, from + width * 3), row * width * 3);
  }
  return out;
}

/** The reference: each output pixel the rounded-half-up mean of the 2x2 block, or what exists of it. */
function halveLonghand(image: { width: number; height: number; data: Uint8Array }) {
  const width = Math.ceil(image.width / 2);
  const height = Math.ceil(image.height / 2);
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        const values: number[] = [];
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const sx = 2 * x + dx;
          const sy = 2 * y + dy;
          if (sx < image.width && sy < image.height) values.push(image.data[(sy * image.width + sx) * 3 + c]!);
        }
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        data[(y * width + x) * 3 + c] = Math.floor(mean + 0.5);
      }
    }
  }
  return { width, height, data };
}

/** Each test encodes and decodes 1100 x 700 PNGs several times over: seconds, not vitest's five. */
const HEAVY = 30_000;

describe("C8: image tiles", () => {
  let app: App;
  let store: MemoryBlobStore;
  let metadata: SqliteMetadataStore;
  let reads: string[];

  beforeEach(async () => {
    store = new MemoryBlobStore();
    reads = [];
    const read = store.read.bind(store);
    store.read = async (key: string) => {
      reads.push(key);
      return read(key);
    };
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: store, metadataStore: metadata });
    await store.writeAtomic(KEY, await png(picture(1)));
  });

  afterEach(() => metadata.close());

  const tile = (z: number, x: number, y: number, query: Record<string, string> = {}) =>
    app.handle(request("GET", `/projects/p1/images/${KEY}/tiles/${z}/${x}/${y}`, { query }));
  const pixels = async (query: Record<string, string> = {}) =>
    raster((await app.handle(request("GET", `/projects/p1/images/${KEY}/pixels`, { query }))).body);

  it("gives, for every tile of level 0, exactly that region of /pixels", { timeout: HEAVY }, async () => {
    const whole = await pixels();

    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const response = await tile(0, x, y);
        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toBe("image/png");
        const piece = await raster(response.body);
        const width = Math.min(TILE_SIZE, WIDTH - x * TILE_SIZE);
        const height = Math.min(TILE_SIZE, HEIGHT - y * TILE_SIZE);
        expect([piece.width, piece.height]).toEqual([width, height]);
        expect(piece.data).toEqual(region(whole, x * TILE_SIZE, y * TILE_SIZE, width, height));
      }
    }
  });

  it("makes each level above from the one below, averaged in 2x2 blocks", { timeout: HEAVY }, async () => {
    const level1 = halveLonghand(await pixels());
    const level2 = halveLonghand(level1);

    // Level 1 is 550 x 350: two tiles, the second 38 wide.
    const left = await raster((await tile(1, 0, 0)).body);
    const right = await raster((await tile(1, 1, 0)).body);
    expect(left.data).toEqual(region(level1, 0, 0, TILE_SIZE, 350));
    expect([right.width, right.height]).toEqual([38, 350]);
    expect(right.data).toEqual(region(level1, TILE_SIZE, 0, 38, 350));

    // Level 2, 275 x 175, is the whole image in one tile -- the one a fitted view asks for first.
    const top = await raster((await tile(2, 0, 0)).body);
    expect([top.width, top.height]).toEqual([275, 175]);
    expect(top.data).toEqual(level2.data);
  });

  it("carries the image's size and how many levels it has", async () => {
    const response = await tile(1, 0, 0);

    expect(response.headers["x-image-width"]).toBe(String(WIDTH));
    expect(response.headers["x-image-height"]).toBe(String(HEIGHT));
    expect(response.headers["x-tile-levels"]).toBe("3");
  });

  it("answers a tile outside the image with 404, saying how many levels there are", async () => {
    for (const [z, x, y] of [[0, 3, 0], [0, 0, 2], [3, 0, 0]] as const) {
      const response = await tile(z, x, y);
      expect(response.status).toBe(404);
      expect(JSON.stringify(jsonBody(response))).toMatch(/it has 3 levels/);
    }
  });

  it("refuses a tile named any way but digits", async () => {
    // `Number` accepts all of these, and a tile named three ways is a tile cached three times.
    for (const name of ["1e3", "-1", "0x1", "1.0", "01a"]) {
      const response = await app.handle(get(`/projects/p1/images/${KEY}/tiles/0/${name}/0`));
      expect(response.status, name).toBe(400);
    }
  });

  it("puts the processing chain in the tiles, as it is in /pixels", { timeout: HEAVY }, async () => {
    // RULE-032's chain runs before the conversion to 8 bits, so a tile cannot be processed after
    // the fact: it has to come from the processed view.
    const query = { markers_r: "128" };
    const whole = await pixels(query);
    const piece = await raster((await tile(0, 1, 1, query)).body);

    expect(piece.data).toEqual(region(whole, TILE_SIZE, TILE_SIZE, 512, 188));
    expect(piece.data).not.toEqual(region(await pixels(), TILE_SIZE, TILE_SIZE, 512, 188));
  });

  it("decodes the image ONCE for every tile of a view, however many are asked for at once", { timeout: HEAVY }, async () => {
    // A view is dozens of requests arriving together. Decoding a 50-megapixel TIFF for each is the
    // one outcome worse than not tiling.
    const responses = await Promise.all(
      [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 0, 1], [0, 1, 1], [0, 2, 1], [1, 0, 0], [2, 0, 0]].map(
        ([z, x, y]) => tile(z!, x!, y!),
      ),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(reads.filter((key) => key === KEY)).toHaveLength(1);
  });

  it("builds new tiles when the file changes, rather than serving the old picture's", { timeout: HEAVY }, async () => {
    const before = await raster((await tile(2, 0, 0)).body);
    await store.writeAtomic(KEY, await png(picture(2)));
    const after = await raster((await tile(2, 0, 0)).body);

    expect(after.data).not.toEqual(before.data);
  });
});
