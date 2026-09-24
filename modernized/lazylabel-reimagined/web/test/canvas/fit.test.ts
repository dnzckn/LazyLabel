/**
 * The fit scale: the whole image, as large as the pane allows, as legacy's `fitInView` draws it.
 */

import { describe, expect, it } from "vitest";

import { fitScale } from "../../src/canvas/fit.js";

describe("fitting the image to the pane", () => {
  it("enlarges a small image, as legacy does, rather than leaving it in a corner", () => {
    // Legacy draws a 400x300 frame at 892x669 in its default window.
    expect(fitScale({ width: 928, height: 834 }, { width: 400, height: 300 })).toBeCloseTo(2.32);
  });

  it("shrinks a large one", () => {
    expect(fitScale({ width: 800, height: 600 }, { width: 8000, height: 6000 })).toBeCloseTo(0.1);
  });

  it("is limited by whichever side runs out first", () => {
    // A tall image in a wide pane fits its height, and the width follows.
    expect(fitScale({ width: 928, height: 834 }, { width: 300, height: 600 })).toBeCloseTo(1.39);
    expect(fitScale({ width: 500, height: 900 }, { width: 1000, height: 1000 })).toBeCloseTo(0.5);
  });

  it("has no answer until both sizes are known", () => {
    // A pane that has not been laid out measures 0; fitting to that would draw nothing.
    expect(fitScale({ width: 0, height: 834 }, { width: 400, height: 300 })).toBeNull();
    expect(fitScale({ width: 928, height: 834 }, { width: 0, height: 0 })).toBeNull();
  });
});
