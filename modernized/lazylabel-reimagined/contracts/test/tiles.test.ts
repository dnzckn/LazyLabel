/**
 * The tile pyramid's arithmetic — the part both sides must agree on to the pixel.
 */

import { describe, expect, it } from "vitest";

import { TILE_SIZE, levelCount, levelFor, levelSize, tileGrid } from "../src/index.js";

describe("the levels", () => {
  it("start at the image's own size", () => {
    expect(levelSize(1100, 700, 0)).toEqual({ width: 1100, height: 700 });
  });

  it("halve rounding UP, so a ragged edge keeps its last pixel", () => {
    expect(levelSize(1101, 701, 1)).toEqual({ width: 551, height: 351 });
  });

  it("agree with halving one level at a time, which is how the server builds them", () => {
    // ceil(ceil(n / 2) / 2) === ceil(n / 4): the browser asks for level z directly and the server
    // halves z times, and a disagreement would be a 404 for a tile the picture needs.
    for (const side of [1, 511, 512, 513, 1023, 1025, 7777, 8193]) {
      let halved = side;
      for (let z = 0; z < 8; z += 1) {
        expect(levelSize(side, side, z).width).toBe(halved);
        halved = Math.ceil(halved / 2);
      }
    }
  });

  it("stop at the first level that fits in one tile", () => {
    expect(levelCount(TILE_SIZE, TILE_SIZE)).toBe(1);
    expect(levelCount(TILE_SIZE + 1, 10)).toBe(2);
    // 1100 -> 550 -> 275: three levels, the last one a single tile.
    expect(levelCount(1100, 700)).toBe(3);
    // The spec's supported working size, 50 megapixels: 8660 x 5773 -> ... -> 542 x 361 -> 271 x 181.
    expect(levelCount(8660, 5773)).toBe(6);
  });
});

describe("the grid", () => {
  it("counts partial tiles along the right and bottom edges", () => {
    expect(tileGrid(1100, 700, 0)).toEqual({ columns: 3, rows: 2 });
    expect(tileGrid(1100, 700, 1)).toEqual({ columns: 2, rows: 1 });
    expect(tileGrid(1100, 700, 2)).toEqual({ columns: 1, rows: 1 });
  });
});

describe("choosing a level for how the image is drawn", () => {
  it("uses full resolution at 1:1 and beyond", () => {
    expect(levelFor(8660, 5773, 1)).toBe(0);
    expect(levelFor(8660, 5773, 3)).toBe(0);
  });

  it("uses the coarsest level that still gives each device pixel a pixel of its own", () => {
    // A quarter-size drawing needs level 2 (each of its pixels covers 4x4 image pixels), and just
    // under a quarter still does not need level 3.
    expect(levelFor(8660, 5773, 0.25)).toBe(2);
    expect(levelFor(8660, 5773, 0.2)).toBe(2);
    expect(levelFor(8660, 5773, 0.125)).toBe(3);
  });

  it("never asks for a level the image does not have", () => {
    expect(levelFor(1100, 700, 0.0001)).toBe(2);
    expect(levelFor(1100, 700, 0)).toBe(2);
  });
});
