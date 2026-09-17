/**
 * `arcLength`, `approxPolyDP`, `boundingRect` and `contourArea` against OpenCV 4.12.0.
 *
 * Two sets of inputs: every contour OpenCV traced out of the mask corpus (so the curves
 * are exactly the shapes the exporters actually see) and a set of free-standing curves
 * that reach shapes border following never produces - self-intersections, duplicate
 * points, negative and large coordinates.
 *
 * Floating point is compared exactly. `arcLength` sums single-precision square roots
 * into a double, and its result is multiplied by 0.001 and handed to `approxPolyDP`, so
 * a one-ulp difference is a different polygon, not a rounding detail.
 */

import { describe, expect, it } from "vitest";

import {
  approxPolyDP,
  arcLength,
  boundingRect,
  contourArea,
} from "../../src/geometry/contours.js";
import type { ContourCase } from "./corpus.js";
import { corpus, normalizeZero } from "./corpus.js";

function checkCurve(kase: ContourCase): void {
  const points = kase.points;

  expect(normalizeZero(arcLength(points, true))).toBe(normalizeZero(kase.arcLengthClosed));
  expect(normalizeZero(arcLength(points, false))).toBe(normalizeZero(kase.arcLengthOpen));
  expect(boundingRect(points)).toEqual(kase.boundingRect);
  expect(normalizeZero(contourArea(points))).toBe(normalizeZero(kase.area));
  expect(normalizeZero(contourArea(points, true))).toBe(normalizeZero(kase.areaOriented));

  for (const approx of kase.approx) {
    expect(
      approxPolyDP(points, approx.eps, approx.closed),
      `eps=${approx.eps} closed=${approx.closed}`,
    ).toEqual(approx.out);
  }
}

describe("curves traced out of the mask corpus", () => {
  for (const mask of corpus.masks) {
    if (mask.contours.length === 0) continue;
    it(mask.name, () => {
      for (const contour of mask.contours) checkCurve(contour);
    });
  }
});

describe("free-standing curves", () => {
  for (const kase of corpus.curves) {
    it(kase.name, () => {
      checkCurve(kase);
    });
  }
});

describe("approxPolyDP epsilon validation", () => {
  const square: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];

  it("rejects a negative epsilon, as OpenCV does", () => {
    expect(() => approxPolyDP(square, -1, true)).toThrow(RangeError);
  });

  it("rejects NaN and 1e30, as OpenCV does", () => {
    expect(() => approxPolyDP(square, Number.NaN, true)).toThrow(RangeError);
    expect(() => approxPolyDP(square, 1e30, true)).toThrow(RangeError);
  });

  it("accepts an empty curve and returns nothing", () => {
    expect(approxPolyDP([], 1, true)).toEqual([]);
  });
});

describe("degenerate inputs", () => {
  it("arcLength of a single point is 0", () => {
    expect(arcLength([[3, 4]], true)).toBe(0);
    expect(arcLength([], true)).toBe(0);
  });

  it("boundingRect of nothing is cv::Rect()", () => {
    expect(boundingRect([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("boundingRect of one pixel spans one pixel", () => {
    expect(boundingRect([[3, 4]])).toEqual({ x: 3, y: 4, width: 1, height: 1 });
  });

  it("contourArea of nothing is 0", () => {
    expect(contourArea([])).toBe(0);
  });
});
