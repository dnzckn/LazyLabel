/**
 * Auto-Convert: an AI mask becoming an editable polygon.
 *
 * Two settings that had no reader, and the feature behind them is worth more than its name. A mask
 * is a field of pixels — you can erase into it, but you cannot drag a corner. A polygon has
 * vertices the edit tool can move, so this is the difference between an AI result you accept or
 * discard and one you can FIX.
 *
 * The geometry is not retested here: `findExternalContours`, `arcLength` and `approxPolyDP` are
 * Phase 1's OpenCV ports with their own goldens. What is tested is the sequence legacy runs
 * (`segment_manager._mask_to_polygon_vertices`), its slider mapping, and each case it refuses.

 *
 * Names RULE-021 so the rule is traceable to the test that proves it: a rule named in
 * NO test cannot be audited, because "covered by a test that does not say so" and "not
 * covered" look identical to a reviewer. Auto-convert AI masks to polygons.
 */

import { describe, expect, it } from "vitest";
import type { BinaryMask } from "@lazylabel/annotation-formats";

import {
  RESOLUTION_DEFAULT,
  epsilonFactorFor,
  maskToPolygon,
} from "../../src/tools/autoPolygon.js";

/** A mask with the given rectangles filled. */
function mask(width: number, height: number, rects: readonly (readonly number[])[]): BinaryMask {
  const data = new Uint8Array(width * height);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0!; y < y1!; y += 1) for (let x = x0!; x < x1!; x += 1) data[y * width + x] = 1;
  }
  return { width, height, data } as unknown as BinaryMask;
}

describe("the resolution slider (control_panel.py:892-899)", () => {
  it("maps 1 to the bluntest epsilon and 100 to the finest", () => {
    // 0.005 * 0.02 ** (value / 100): 0.005 at 1, 0.0001 at 100.
    expect(epsilonFactorFor(1)).toBeCloseTo(0.005 * 0.02 ** 0.01, 12);
    expect(epsilonFactorFor(100)).toBeCloseTo(0.0001, 12);
  });

  it("runs the RIGHT WAY ROUND: a higher slider means more detail", () => {
    // A higher value is a SMALLER epsilon. Inverting it would leave a user unable to tell from one
    // mask which way the control went.
    expect(epsilonFactorFor(90)).toBeLessThan(epsilonFactorFor(10));
  });

  it("clamps outside its range and falls back on a non-number", () => {
    expect(epsilonFactorFor(0)).toBe(epsilonFactorFor(1));
    expect(epsilonFactorFor(500)).toBe(epsilonFactorFor(100));
    expect(epsilonFactorFor(Number.NaN)).toBe(epsilonFactorFor(RESOLUTION_DEFAULT));
  });
});

describe("converting a mask", () => {
  it("turns a rectangle into a polygon with corners", () => {
    const result = maskToPolygon(mask(40, 40, [[5, 5, 30, 25]]), epsilonFactorFor(RESOLUTION_DEFAULT));

    expect(result).not.toBeNull();
    expect(result!.vertices.length).toBeGreaterThanOrEqual(3);
    // The corners of the filled region, inclusive, which is what a contour traces.
    const xs = result!.vertices.map(([x]) => x);
    const ys = result!.vertices.map(([, y]) => y);
    expect(Math.min(...xs)).toBe(5);
    expect(Math.max(...xs)).toBe(29);
    expect(Math.min(...ys)).toBe(5);
    expect(Math.max(...ys)).toBe(24);
  });

  it("gives whole-pixel vertices, as legacy's int() does", () => {
    const result = maskToPolygon(mask(40, 40, [[5, 5, 30, 25]]), epsilonFactorFor(50));

    for (const [x, y] of result!.vertices) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
    }
  });

  it("keeps only the LARGEST piece, and says how many it dropped", () => {
    // Legacy's behaviour, kept rather than silently improved: it converts the largest contour
    // only. A user whose mask had two islands gets one polygon and should be told.
    const two = mask(60, 60, [
      [2, 2, 8, 8],
      [20, 20, 50, 50],
    ]);

    const result = maskToPolygon(two, epsilonFactorFor(RESOLUTION_DEFAULT));

    expect(result!.dropped).toBe(1);
    // The big island, not the small one.
    expect(Math.max(...result!.vertices.map(([x]) => x))).toBeGreaterThan(40);
  });

  it("reports nothing dropped for a single piece", () => {
    expect(maskToPolygon(mask(40, 40, [[5, 5, 30, 25]]), epsilonFactorFor(80))!.dropped).toBe(0);
  });

  it("refuses an EMPTY mask", () => {
    expect(maskToPolygon(mask(20, 20, []), epsilonFactorFor(80))).toBeNull();
  });

  it("refuses a shape that approximates to fewer than three corners", () => {
    // The case that actually happens: a thin sliver at a blunt epsilon collapses to a line.
    // Returning it would put a two-point "polygon" in the file that every exporter has to guess
    // about.
    const sliver = mask(200, 4, [[0, 1, 200, 2]]);

    expect(maskToPolygon(sliver, epsilonFactorFor(1))).toBeNull();
  });

  it("keeps more corners at a higher resolution than a lower one", () => {
    // The slider doing its job, on a shape with something to lose: a diagonal staircase.
    const steps: number[][] = [];
    for (let i = 0; i < 20; i += 1) steps.push([i * 3, i * 3, i * 3 + 6, i * 3 + 6]);
    const staircase = mask(70, 70, steps);

    const coarse = maskToPolygon(staircase, epsilonFactorFor(5))!;
    const fine = maskToPolygon(staircase, epsilonFactorFor(100))!;

    expect(fine.vertices.length).toBeGreaterThan(coarse.vertices.length);
  });
});
