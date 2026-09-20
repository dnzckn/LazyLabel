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
  equalizeLut,
  posterize,
  rescale,
  stretchWindow,
} from "../../src/images/imageProcessing.js";

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

});

describe("the contrast stretch preset", () => {
  it("sacrifices the tails, which is the point of it", () => {
    // A gradient from 100 to 149, plus one dead pixel and one hot one. Without the stretch those
    // two outliers hold the whole range hostage and every real value sits in a fifth of it.
    const values = new Uint8Array([0, ...Array.from({ length: 98 }, (_, i) => 100 + (i % 50)), 255]);

    const { min, max } = stretchWindow(values, 1);

    expect(min).toBe(100);
    expect(max).toBe(149);
  });

  it("counts PIXELS rather than indexing by a fraction of the length", () => {
    // The question the preset answers is "how many pixels am I willing to sacrifice", so on a
    // hundred-pixel image 1% has to mean one pixel. Indexing by fraction x (length - 1) rounds
    // that to none, and the outlier survives.
    const values = new Uint8Array([0, ...Array(99).fill(200)]);

    expect(stretchWindow(values, 1).min).toBe(200);
  });

  it("uses the actual data range at 0%", () => {
    const values = new Uint8Array([10, 50, 250]);

    expect(stretchWindow(values, 0)).toEqual({ min: 10, max: 250 });
  });

  it("never returns a window the image does not occupy", () => {
    // Clamped to the data range, so a percentile landing outside it cannot widen the window past
    // the pixels that are actually there.
    const values = new Uint8Array([100, 100, 100]);

    expect(stretchWindow(values, 0.4)).toEqual({ min: 100, max: 100 });
  });

  it("copes with an empty buffer", () => {
    expect(stretchWindow(new Uint8Array(), 0.4)).toEqual({ min: 0, max: 0 });
  });

  it("caps the saturation at 50% per tail", () => {
    // Beyond that the two tails would cross, and legacy's slider stops there.
    const values = new Uint8Array([0, 50, 100, 150, 200]);

    expect(() => stretchWindow(values, 90)).not.toThrow();
  });
});

describe("the equalization preset", () => {
  it("maps the darkest occupied level to black", () => {
    // cdfMin is the FIRST NON-ZERO cumulative count, not the count at level zero. Using the latter
    // leaves the darkest level somewhere above black on any image with no true black pixel -- the
    // result is washed out, subtly, and only on some images.
    const values = new Uint8Array([100, 100, 150, 200]);
    const lut = equalizeLut(values);

    expect(lut[100]).toBe(0);
  });

  it("maps the brightest occupied level to the maximum", () => {
    const values = new Uint8Array([100, 150, 200]);
    const lut = equalizeLut(values);

    expect(lut[200]).toBe(255);
  });

  it("spreads clustered values apart", () => {
    // Three tight clusters become three widely separated ones, which is what the preset is for.
    const values = new Uint8Array([...Array(10).fill(10), ...Array(10).fill(11), ...Array(10).fill(12)]);
    const lut = equalizeLut(values);

    expect(lut[12]! - lut[10]!).toBeGreaterThan(200);
  });

  it("does not divide by zero on a single-valued image", () => {
    // N equals cdfMin here, so legacy's max(1, ...) is what keeps the denominator positive.
    const lut = equalizeLut(new Uint8Array([42, 42, 42]));

    expect(Number.isFinite(lut[42])).toBe(true);
  });

  it("returns an empty table for an empty buffer", () => {
    expect(equalizeLut(new Uint8Array()).every((v) => v === 0)).toBe(true);
  });

});
