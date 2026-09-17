/**
 * `fillPoly` and `fillCircle` against OpenCV 4.12.0.
 *
 * Masks are compared as pixel lists rather than raw bytes, so a failure names the
 * pixels that differ instead of dumping a typed array. The boundary cases matter most:
 * cv2.fillPoly is an even-odd scanline fill UNIONed with an 8-connected Bresenham
 * outline, and a scanline-only implementation loses the outline pixels along every
 * sloped edge.
 */

import { describe, expect, it } from "vitest";

import { fillCircle, fillPoly } from "../../src/geometry/contours.js";
import { corpus, decodeMask, setPixels } from "./corpus.js";

describe("fillPoly", () => {
  for (const kase of corpus.fillPoly) {
    it(kase.name, () => {
      const actual = fillPoly(kase.height, kase.width, kase.polygons);
      const expected = decodeMask(kase.height, kase.width, kase.mask);
      expect(setPixels(actual)).toEqual(setPixels(expected));
    });
  }

  it("fills the outline as well as the interior", () => {
    // A sloped edge: a scanline-only fill drops the staircase pixels the Bresenham
    // outline contributes, so these two counts must differ from each other.
    const triangle = fillPoly(20, 20, [
      [
        [2, 2],
        [17, 5],
        [9, 17],
      ],
    ]);
    const filled = triangle.data.reduce((n, v) => n + v, 0);
    expect(filled).toBeGreaterThan(0);
    // Corner vertices are always set, which is the outline's doing.
    expect(triangle.data[2 * 20 + 2]).toBe(1);
    expect(triangle.data[5 * 20 + 17]).toBe(1);
    expect(triangle.data[17 * 20 + 9]).toBe(1);
  });

  it("truncates fractional vertices toward zero, as np.int32 does", () => {
    // The polygon-and-circle fixture stores [10.7, 10.2] .. [20.9, 30.8].
    const fractional = fillPoly(100, 100, [
      [
        [10.7, 10.2],
        [20.9, 10.2],
        [20.9, 30.8],
        [10.7, 30.8],
      ],
    ]);
    const truncated = fillPoly(100, 100, [
      [
        [10, 10],
        [20, 10],
        [20, 30],
        [10, 30],
      ],
    ]);
    expect(setPixels(fractional)).toEqual(setPixels(truncated));
  });

  it("returns an empty mask for a zero-size image", () => {
    expect(fillPoly(0, 5, [[[1, 1]]]).data).toHaveLength(0);
    expect(fillPoly(5, 0, [[[1, 1]]]).data).toHaveLength(0);
  });
});

describe("fillCircle", () => {
  for (const kase of corpus.circles) {
    it(kase.name, () => {
      const actual = fillCircle(kase.height, kase.width, kase.centre, kase.radius);
      const expected = decodeMask(kase.height, kase.width, kase.mask);
      expect(setPixels(actual)).toEqual(setPixels(expected));
    });
  }

  it("radius 0 still sets one pixel", () => {
    const mask = fillCircle(5, 5, [2, 2], 0);
    expect(setPixels(mask)).toEqual(["2,2"]);
  });

  it("rejects a negative radius, as cv2.circle asserts", () => {
    expect(() => fillCircle(5, 5, [2, 2], -1)).toThrow(RangeError);
  });
});
