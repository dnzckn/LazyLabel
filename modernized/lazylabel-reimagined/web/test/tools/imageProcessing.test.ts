/**
 * RULE-032 and RULE-029, from the cards' own worked examples.
 *
 * Rescale with min 50 and max 200 turns [30, 50, 125, 200, 250] into [0, 0, 127, 255, 255].
 * Posterizing with markers [50, 150] turns [10, 49, 50, 100, 149, 150, 255] into
 * [0, 0, 127, 127, 127, 255, 255] — where 49 and 50 land in different bands, and so do 149 and 150.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_16_BIT,
  MIN_MARKER_SPACING,
  markersAreLegal,
  posterize,
  posterizeAll,
  rescale,
  rescaleAll,
} from "../../src/tools/imageProcessing.js";

describe("rescaling", () => {
  it("works the card's example", () => {
    const out = [30, 50, 125, 200, 250].map((v) => rescale(v, 50, 200));

    expect(out).toEqual([0, 0, 127, 255, 255]);
  });

  it("truncates rather than rounding", () => {
    // (125-50)/150 x 255 is 127.5, and legacy's int() gives 127. Math.round would give 128 and
    // shift every mid-tone by one.
    expect(rescale(125, 50, 200)).toBe(127);
  });

  it("discards what falls outside the window rather than compressing it", () => {
    // Everything at or below min is 0 and everything at or above max is the maximum. That is a
    // contrast stretch, and the loss is the point of it.
    expect(rescale(0, 50, 200)).toBe(0);
    expect(rescale(49, 50, 200)).toBe(0);
    expect(rescale(255, 50, 200)).toBe(255);
  });

  it("leaves the image ALONE when the handles cross", () => {
    // A user dragging one handle past the other should see nothing happen, not divide by zero and
    // not lose their image.
    expect(rescale(123, 200, 50)).toBe(123);
    expect(rescale(123, 100, 100)).toBe(123);
  });

  it("uses the 16-bit range when asked", () => {
    // Doing the arithmetic in 8 bits and widening afterwards would quantise a 16-bit image to 256
    // levels before anything had a chance to use the rest.
    expect(rescale(32768, 0, MAX_16_BIT, MAX_16_BIT)).toBe(32768);
    expect(rescale(40000, 30000, 50000, MAX_16_BIT)).toBe(32767);
  });

  it("applies across a buffer", () => {
    const values = new Uint8Array([30, 50, 125, 200, 250]);
    rescaleAll(values, 50, 200);

    expect([...values]).toEqual([0, 0, 127, 255, 255]);
  });

  it("leaves a buffer untouched when the handles cross", () => {
    const values = new Uint8Array([1, 2, 3]);
    rescaleAll(values, 200, 50);

    expect([...values]).toEqual([1, 2, 3]);
  });
});

describe("posterizing", () => {
  it("works the card's example", () => {
    const out = [10, 49, 50, 100, 149, 150, 255].map((v) => posterize(v, [50, 150]));

    expect(out).toEqual([0, 0, 127, 127, 127, 255, 255]);
  });

  it("puts the marker value itself in the UPPER band", () => {
    // Lower bound inclusive, upper exclusive. 49 and 50 land in different bands, and so do 149 and
    // 150 -- which is the whole of what the card's example turns on.
    expect(posterize(49, [50, 150])).toBe(0);
    expect(posterize(50, [50, 150])).toBe(127);
    expect(posterize(149, [50, 150])).toBe(127);
    expect(posterize(150, [50, 150])).toBe(255);
  });

  it("makes N+1 bands from N markers", () => {
    // Three markers: 0, trunc(1/3 x 255) = 85, trunc(2/3 x 255) = 170, then 255.
    const out = [0, 30, 60, 90].map((v) => posterize(v, [25, 55, 85]));

    expect(out).toEqual([0, 85, 170, 255]);
  });

  it("is a two-level threshold with one marker", () => {
    expect([0, 127, 128, 255].map((v) => posterize(v, [128]))).toEqual([0, 0, 255, 255]);
  });

  it("leaves the value alone when there are no markers", () => {
    // No markers means the channel is not being thresholded, which is different from thresholding
    // it into one band.
    expect(posterize(123, [])).toBe(123);
  });

  it("does not care what order the markers arrive in", () => {
    expect(posterize(100, [150, 50])).toBe(posterize(100, [50, 150]));
  });

  it("uses the 16-bit maximum when asked", () => {
    expect(posterize(40000, [20000, 50000], MAX_16_BIT)).toBe(32767);
    expect(posterize(60000, [20000, 50000], MAX_16_BIT)).toBe(MAX_16_BIT);
  });

  it("applies across a buffer", () => {
    const values = new Uint8Array([10, 49, 50, 150, 255]);
    posterizeAll(values, [50, 150]);

    expect([...values]).toEqual([0, 0, 127, 255, 255]);
  });
});

describe("marker spacing", () => {
  it("refuses markers closer together than the minimum", () => {
    expect(markersAreLegal([50, 59])).toBe(false);
    expect(markersAreLegal([50, 60])).toBe(true);
    expect(MIN_MARKER_SPACING).toBe(10);
  });

  it("checks the sorted order, not the given one", () => {
    expect(markersAreLegal([60, 50])).toBe(true);
    expect(markersAreLegal([59, 50])).toBe(false);
  });

  it("accepts a single marker and none at all", () => {
    expect(markersAreLegal([128])).toBe(true);
    expect(markersAreLegal([])).toBe(true);
  });
});
