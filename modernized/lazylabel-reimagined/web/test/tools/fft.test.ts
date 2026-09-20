/**
 * RULE-030's frequency banding, checked against numbers taken from numpy.
 *
 * The reference values were computed with the same expressions legacy uses, so the odd-sized cases
 * catch the thing a careless port gets wrong: the CENTRE uses integer division while the SCALE uses
 * true division, and on an odd-sized image the two disagree.
 */

import { describe, expect, it } from "vitest";

import {
  FREQUENCY_SLIDER_MAX,
  bandWeights,
  frequencyDistance,
  normalizeToByte,
} from "../../src/tools/fft.js";

const at = (d: Float64Array, width: number, y: number, x: number) => d[y * width + x]!;

describe("the frequency map", () => {
  it("is zero at the centre", () => {
    const d = frequencyDistance(16, 16);
    expect(at(d, 16, 8, 8)).toBe(0);
  });

  it("puts the centre at height // 2, which is past the middle on an even size", () => {
    // Integer division, so a 16-tall image centres on row 8 rather than 7.5. Choosing 7 instead
    // shifts every band boundary by a pixel.
    const d = frequencyDistance(16, 16);
    expect(at(d, 16, 7, 7)).toBeGreaterThan(0);
    expect(at(d, 16, 8, 8)).toBe(0);
  });

  it("reaches exactly 1 at the corner of an even-sized image", () => {
    // sqrt(8^2 + 8^2) / sqrt(8^2 + 8^2) is 1, so the clip is doing nothing here -- which is what
    // makes the odd case below the interesting one.
    expect(at(frequencyDistance(16, 16), 16, 0, 0)).toBeCloseTo(1, 12);
  });

  it("falls SHORT of 1 on an odd-sized image", () => {
    // The centre is 7 (integer division) but the scale is sqrt(7.5^2 + 7.5^2) (true division), so
    // the furthest pixel is 0.9333 rather than 1. A port using 7.5 for both would get 1 here and
    // every band boundary would move.
    expect(at(frequencyDistance(15, 15), 15, 0, 0)).toBeCloseTo(0.9333333333, 9);
  });

  it("handles a rectangular odd image", () => {
    expect(at(frequencyDistance(15, 21), 21, 0, 0)).toBeCloseTo(0.9459887, 6);
  });

  it("never exceeds 1", () => {
    const d = frequencyDistance(16, 24);
    expect(Math.max(...d)).toBeLessThanOrEqual(1);
  });
});

describe("band weights", () => {
  it("keeps everything when there are no thresholds", () => {
    const weights = bandWeights(frequencyDistance(8, 8), []);
    expect([...weights].every((w) => w === 1)).toBe(true);
  });

  it("is a high-pass with one threshold: the low band is multiplied by zero", () => {
    // Band 0 is weighted 0 and the last 1, so the LOWEST frequencies are removed. That is what
    // makes a single threshold a high-pass rather than a low-pass.
    const distance = frequencyDistance(16, 16);
    const weights = bandWeights(distance, [1000]); // 10% of the half-diagonal

    expect(at(weights, 16, 8, 8)).toBe(0); // the centre, the lowest frequency of all
    expect(at(weights, 16, 0, 0)).toBe(1); // the corner, the highest
  });

  it("puts a pixel exactly on a threshold in the LOWER band", () => {
    // `<=` for the first band and `>` for the rest. The centre pixel's distance is exactly 0, so
    // it is always in band 0 -- and band 0 is the one that gets removed.
    const distance = Float64Array.from([0, 0.1, 0.100001, 0.5]);
    const weights = bandWeights(distance, [1000]); // threshold 0.1

    expect([...weights]).toEqual([0, 0, 1, 1]);
  });

  it("spreads weights evenly across three bands", () => {
    const distance = Float64Array.from([0.05, 0.2, 0.8]);
    const weights = bandWeights(distance, [1000, 4000]); // 0.1 and 0.4

    expect([...weights]).toEqual([0, 0.5, 1]);
  });

  it("reads the slider's own range", () => {
    expect(FREQUENCY_SLIDER_MAX).toBe(10000);
    // 2500 is a quarter of the half-diagonal.
    const weights = bandWeights(Float64Array.from([0.24, 0.26]), [2500]);
    expect([...weights]).toEqual([0, 1]);
  });

  it("does not care what order the thresholds arrive in", () => {
    const distance = Float64Array.from([0.05, 0.2, 0.8]);

    expect([...bandWeights(distance, [4000, 1000])]).toEqual([...bandWeights(distance, [1000, 4000])]);
  });
});

describe("coming back to 8 bits", () => {
  it("stretches the range to 0..255", () => {
    expect([...normalizeToByte(Float64Array.from([10, 20, 30]))]).toEqual([0, 127, 255]);
  });

  it("TRUNCATES rather than rounding", () => {
    // astype(np.uint8) drops the fraction, and after this normalization almost every value is
    // fractional -- so rounding would differ on most pixels of most images. 20 of 10..30 maps to
    // 127.5 and must become 127.
    expect(normalizeToByte(Float64Array.from([10, 20, 30]))[1]).toBe(127);
  });

  it("handles negative values, which a filtered plane has plenty of", () => {
    expect([...normalizeToByte(Float64Array.from([-30, 0, 30]))]).toEqual([0, 127, 255]);
  });

  it("leaves a flat plane at zero rather than dividing by nothing", () => {
    // Legacy's `if np.max(...) > 0` guard. Without it this is 0/0 on every pixel.
    expect([...normalizeToByte(Float64Array.from([5, 5, 5]))]).toEqual([0, 0, 0]);
  });

  it("copes with an empty plane", () => {
    expect(normalizeToByte(new Float64Array()).length).toBe(0);
  });
});
