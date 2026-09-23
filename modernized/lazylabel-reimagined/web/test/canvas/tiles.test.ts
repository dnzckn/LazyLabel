/**
 * Which tiles a view asks for — C8's browser half, as arithmetic.
 *
 * jsdom has no canvas, so the drawing is proven in a real browser; this holds what decides the
 * requests: the level for how large the image is drawn, only the tiles in view, and where each lands.
 */

import { describe, expect, it } from "vitest";

import { tileRect, tilesInView, topLevel, visibleRegion, type ScreenRect } from "../../src/canvas/tiles.js";

function rect(left: number, top: number, width: number, height: number): ScreenRect {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

// The spec's supported working size, 50 megapixels.
const W = 8660;
const H = 5773;

describe("what part of the image is on screen", () => {
  it("is all of it when the image is fitted inside the pane", () => {
    expect(visibleRegion(rect(10, 10, 866, 577.3), rect(0, 0, 1000, 800), W, H)).toEqual({
      left: 0,
      top: 0,
      right: W,
      bottom: H,
    });
  });

  it("is the part under the pane when the image is zoomed in and scrolled", () => {
    // Drawn at 1:1, scrolled so the pane's corner sits 4000 image pixels right and 2000 down.
    const view = visibleRegion(rect(-4000, -2000, W, H), rect(0, 0, 1000, 800), W, H);

    expect(view).toEqual({ left: 4000, top: 2000, right: 5000, bottom: 2800 });
  });

  it("is nothing when the image is scrolled out of the pane", () => {
    expect(visibleRegion(rect(0, 900, 866, 577), rect(0, 0, 1000, 800), W, H)).toBeNull();
  });
});

describe("which tiles a view asks for", () => {
  it("fitted, asks for a coarse level and every tile of it -- a handful, not the whole image", () => {
    // 866 CSS pixels across 8660 image pixels at a device pixel ratio of 1: one device pixel covers
    // ten image pixels, so level 3 (each pixel eight) is the coarsest that still resolves them.
    const tiles = tilesInView(W, H, { left: 0, top: 0, right: W, bottom: H }, 0.1);

    expect(new Set(tiles.map((tile) => tile.z))).toEqual(new Set([3]));
    // Level 3 is 1083 x 722: three columns, two rows.
    expect(tiles).toHaveLength(6);
  });

  it("zoomed in, asks for full resolution and only the tiles in view, with a one-tile margin", () => {
    const tiles = tilesInView(W, H, { left: 4000, top: 2000, right: 5000, bottom: 2800 }, 1);

    expect(new Set(tiles.map((tile) => tile.z))).toEqual(new Set([0]));
    // In view: columns 7-9, rows 3-5 (512-pixel tiles); the margin adds one on every side.
    const columns = new Set(tiles.map((tile) => tile.x));
    const rows = new Set(tiles.map((tile) => tile.y));
    expect([...columns].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10]);
    expect([...rows].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6]);
  });

  it("asks for the centre of the view first, where the user is looking", () => {
    const tiles = tilesInView(W, H, { left: 4000, top: 2000, right: 5000, bottom: 2800 }, 1, 0);

    // The view's centre, (4500, 2400), is in tile (8, 4).
    expect(tiles[0]).toEqual({ z: 0, x: 8, y: 4 });
  });

  it("never asks for a tile past the edge of the image", () => {
    const tiles = tilesInView(W, H, { left: W - 100, top: H - 100, right: W, bottom: H }, 1);

    // Level 0 has 17 columns (0-16) and 12 rows (0-11).
    expect(Math.max(...tiles.map((tile) => tile.x))).toBe(16);
    expect(Math.max(...tiles.map((tile) => tile.y))).toBe(11);
  });

  it("starts from one tile holding the whole image", () => {
    expect(topLevel(W, H)).toBe(5);
    expect(topLevel(300, 200)).toBe(0);
  });
});

describe("where a tile lands", () => {
  it("is its place in the image, each level pixel covering 2^z image pixels", () => {
    expect(tileRect({ z: 0, x: 2, y: 1 }, 512, 512)).toEqual({ x: 1024, y: 512, width: 512, height: 512 });
    expect(tileRect({ z: 3, x: 1, y: 0 }, 512, 512)).toEqual({ x: 4096, y: 0, width: 4096, height: 4096 });
  });

  it("is smaller along the right and bottom edges, where the tile itself is", () => {
    // Level 3's last column is 1083 - 1024 = 59 pixels wide.
    expect(tileRect({ z: 3, x: 2, y: 1 }, 59, 210)).toEqual({ x: 8192, y: 4096, width: 472, height: 1680 });
  });
});
