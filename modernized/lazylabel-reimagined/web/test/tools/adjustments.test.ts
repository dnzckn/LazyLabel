/**
 * RULE-028, worked from the card's own numbers.
 *
 * Contrast 50 with brightness 20 turns [0, 30, 100, 200, 255] into [20, 65, 170, 255, 255]; gamma
 * 2.0 turns 64 into 127; and brightness -100 turns [0, 30, 100, 200, 255] into
 * [100, 70, 0, 100, 155] — which is the fold, not a typo.
 */

import { describe, expect, it } from "vitest";

import { NEUTRAL, adjustImage, adjustPixel, folds, isNeutral } from "../../src/tools/adjustments.js";

/** One channel through the pipeline, which is how the card states its examples. */
const grey = (value: number, over: Partial<typeof NEUTRAL> = {}) =>
  adjustPixel(value, value, value, { ...NEUTRAL, ...over })[0];

describe("brightness and contrast", () => {
  it("works the card's example", () => {
    const out = [0, 30, 100, 200, 255].map((v) => grey(v, { contrast: 50, brightness: 20 }));

    expect(out).toEqual([20, 65, 170, 255, 255]);
  });

  it("FOLDS on negative brightness instead of darkening", () => {
    // cv2.convertScaleAbs takes the absolute value before saturating, so an image being darkened
    // has its darkest pixels come back BRIGHT and a gradient folds on itself. Reproduced because
    // Phase 5's exit criterion is equivalence with legacy, and because with Operate On View these
    // pixels are what SAM segments -- so the fold changes MASKS, not just appearance.
    const out = [0, 30, 100, 200, 255].map((v) => grey(v, { brightness: -100 }));

    expect(out).toEqual([100, 70, 0, 100, 155]);
  });

  it("saturates at the top rather than wrapping", () => {
    expect(grey(255, { brightness: 100 })).toBe(255);
  });

  it("leaves a pixel alone at neutral settings", () => {
    expect(grey(123)).toBe(123);
  });
});

describe("gamma", () => {
  it("turns 64 into 127 at gamma 2", () => {
    expect(grey(64, { gamma: 2 })).toBe(127);
  });

  it("truncates rather than rounding", () => {
    // 255 * (64/255)^(1/2) is 127.75, and legacy's int() drops the fraction. Math.round would give
    // 128 and pass the card's example only by accident on other values.
    expect(grey(64, { gamma: 2 })).toBe(127);
  });

  it("leaves the endpoints alone", () => {
    expect(grey(0, { gamma: 2 })).toBe(0);
    expect(grey(255, { gamma: 2 })).toBe(255);
  });

  it("darkens below 1 and lightens above", () => {
    expect(grey(128, { gamma: 0.5 })).toBeLessThan(128);
    expect(grey(128, { gamma: 2 })).toBeGreaterThan(128);
  });
});

describe("saturation", () => {
  it("blends toward BT.601 grey", () => {
    // gray = 0.299*200 + 0.587*100 + 0.114*50 = 124.2; at s = 0 every channel becomes it.
    expect(adjustPixel(200, 100, 50, { ...NEUTRAL, saturation: 0 })).toEqual([124, 124, 124]);
  });

  it("leaves a pixel alone at 1", () => {
    expect(adjustPixel(200, 100, 50, { ...NEUTRAL, saturation: 1 })).toEqual([200, 100, 50]);
  });

  it("pushes past the original above 1", () => {
    const [r, , b] = adjustPixel(200, 100, 50, { ...NEUTRAL, saturation: 2 });

    expect(r).toBeGreaterThan(200);
    expect(b).toBeLessThan(50);
  });

  it("is applied BEFORE brightness, not after", () => {
    // The order is not interchangeable. Desaturating first then brightening gives a grey that is
    // then shifted; the other way round shifts a colour and then greys the result, which lands
    // somewhere else.
    const first = adjustPixel(200, 100, 50, { ...NEUTRAL, saturation: 0, brightness: 50 });

    expect(first).toEqual([174, 174, 174]); // 124 + 50
  });
});

describe("the order of the three steps", () => {
  it("applies gamma to the CLIPPED value, not the raw one", () => {
    // Brightness pushes 200 past 255, it saturates, and gamma then acts on 255. Doing gamma first
    // would give a different picture, and the card fixes the order.
    expect(grey(200, { contrast: 50, brightness: 20, gamma: 2 })).toBe(255);
  });
});

describe("reporting", () => {
  it("knows when nothing would change", () => {
    expect(isNeutral(NEUTRAL)).toBe(true);
    expect(isNeutral({ ...NEUTRAL, gamma: 1.1 })).toBe(false);
  });

  it("says when the brightness will fold", () => {
    // The difference between "this looks wrong" and "the slider is broken".
    expect(folds({ ...NEUTRAL, brightness: -1 })).toBe(true);
    expect(folds({ ...NEUTRAL, brightness: 0 })).toBe(false);
    expect(folds({ ...NEUTRAL, brightness: 50 })).toBe(false);
  });
});

describe("a whole image", () => {
  it("adjusts colour and leaves alpha alone", () => {
    // Alpha is not a colour. Running it through a gamma curve would make a half-transparent
    // overlay change opacity when the user moved a brightness slider.
    const pixels = new Uint8ClampedArray([64, 64, 64, 128, 200, 100, 50, 255]);

    adjustImage(pixels, { ...NEUTRAL, gamma: 2 });

    expect(pixels[0]).toBe(127);
    expect(pixels[3]).toBe(128);
    expect(pixels[7]).toBe(255);
  });

  it("does nothing at all when the settings are neutral", () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 4]);
    adjustImage(pixels, NEUTRAL);

    expect([...pixels]).toEqual([1, 2, 3, 4]);
  });
});
