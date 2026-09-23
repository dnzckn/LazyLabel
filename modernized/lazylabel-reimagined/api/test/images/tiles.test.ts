/**
 * The tile pyramid's parts: halving, cutting, and the cache that keeps one decode per view.
 *
 * `acceptance/c8.tiles.test.ts` holds the route to `/pixels` pixel for pixel; these pin the edges
 * that a 1100 x 700 picture happens not to reach.
 */

import { describe, expect, it } from "vitest";

import { PyramidCache, halve, pyramidOf, tileOf, type Level } from "../../src/images/tiles.js";

function flat(width: number, height: number, value: number): Level {
  return { width, height, data: new Uint8Array(width * height * 3).fill(value) };
}

describe("halving a level", () => {
  it("rounds a mean of .5 UP, the same on every machine", () => {
    // Four pixels 0, 1, 0, 1 average to 0.5: rounded half up, 1.
    const level: Level = { width: 2, height: 2, data: new Uint8Array([0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1]) };

    expect([...halve(level).data]).toEqual([1, 1, 1]);
  });

  it("averages only what exists at a ragged edge", () => {
    // 3 x 1: the second output pixel covers the third input pixel alone, not it and a zero.
    const level: Level = { width: 3, height: 1, data: new Uint8Array([10, 10, 10, 20, 20, 20, 200, 200, 200]) };

    const half = halve(level);
    expect([half.width, half.height]).toEqual([2, 1]);
    expect([...half.data]).toEqual([15, 15, 15, 200, 200, 200]);
  });

  it("keeps a single pixel a single pixel", () => {
    expect(halve(flat(1, 1, 7))).toEqual(flat(1, 1, 7));
  });
});

describe("the pyramid", () => {
  it("stops at the first level that fits in one tile", () => {
    const levels = pyramidOf(flat(1100, 700, 3));

    expect(levels.map((level) => [level.width, level.height])).toEqual([[1100, 700], [550, 350], [275, 175]]);
  });

  it("is a single level for an image that is already one tile", () => {
    expect(pyramidOf(flat(40, 30, 1))).toHaveLength(1);
  });
});

describe("cutting a tile", () => {
  it("returns null past the right or bottom edge rather than an empty tile", () => {
    const level = flat(600, 100, 1);

    expect(tileOf(level, 1, 0)?.width).toBe(88);
    expect(tileOf(level, 2, 0)).toBeNull();
    expect(tileOf(level, 0, 1)).toBeNull();
  });
});

describe("the pyramid cache", () => {
  it("builds a view once, however many ask at the same time", async () => {
    const cache = new PyramidCache();
    let builds = 0;
    const build = async () => {
      builds += 1;
      return flat(10, 10, 1);
    };

    await Promise.all([cache.get("a", build), cache.get("a", build), cache.get("a", build)]);

    expect(builds).toBe(1);
  });

  it("drops the least recently used view once the budget is spent", async () => {
    // Each 10 x 10 view is 300 bytes; a 700-byte budget holds two.
    const cache = new PyramidCache(700);
    const view = (value: number) => async () => flat(10, 10, value);

    await cache.get("a", view(1));
    await cache.get("b", view(2));
    await cache.get("a", view(1)); // "a" is now the most recently used
    await cache.get("c", view(3));

    let rebuilt = 0;
    await cache.get("b", async () => {
      rebuilt += 1;
      return flat(10, 10, 2);
    });
    expect(rebuilt).toBe(1); // "b" was the one dropped
    expect(cache.size).toBe(2);
  });

  it("serves, but does not keep, a view bigger than the whole budget", async () => {
    const cache = new PyramidCache(100);

    const levels = await cache.get("huge", async () => flat(10, 10, 1));

    expect(levels).toHaveLength(1);
    expect(cache.size).toBe(0);
  });

  it("does not keep a failed build, so the next request tries again", async () => {
    const cache = new PyramidCache();

    await expect(cache.get("a", async () => Promise.reject(new Error("unreadable")))).rejects.toThrow(
      "unreadable",
    );
    const levels = await cache.get("a", async () => flat(4, 4, 1));

    expect(levels).toHaveLength(1);
  });
});
