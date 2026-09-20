/**
 * RULE-034: the colour a class is drawn in.
 *
 * A user who has been labelling a dataset for a month knows their classes by colour, so getting
 * this wrong makes every image they open look wrong — without anything being reported.
 */

import { describe, expect, it } from "vitest";

import { UNCLASSED, classColor, hsvToRgb } from "../../src/canvas/classColor.js";

/** The hue the rule produces, recovered from the RGB the function returns. */
function hueOf(rgb: { r: number; g: number; b: number }): number {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;

  const d = max - min;
  const hue =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const degrees = hue * 60;
  return Math.round(degrees < 0 ? degrees + 360 : degrees);
}

describe("classColor", () => {
  it("produces the hues the rule card records", () => {
    // 0, 222, 84, 307 — the card's own worked example.
    expect([0, 1, 2, 3].map((id) => hueOf(classColor(id)))).toEqual([0, 222, 84, 307]);
  });

  it("agrees with the legacy expression, whichever way the order is read", () => {
    // The rule card says "int(class_id x 222.4922359) mod 360"; the code says
    // "int((class_id * 222.4922359) % 360)". Those look like different orders, and for a
    // NON-NEGATIVE id they are provably the same: x = 360k + f, so trunc(x) % 360 = trunc(f).
    // Checked exhaustively in Python over 0..200000 with no disagreement. Asserting both here means
    // a future rewrite of this function cannot quietly pick the wrong one.
    for (const id of [0, 1, 2, 13, 34, 97, 255, 1000, 10_000]) {
      const truncateFirst = Math.trunc(id * 222.4922359) % 360;
      const moduloFirst = Math.trunc((id * 222.4922359) % 360);
      expect(truncateFirst, `class ${id}`).toBe(moduloFirst);
      expect(hueOf(classColor(id)), `class ${id}`).toBe(moduloFirst);
    }
  });

  it("gives every class a distinct colour over a realistic range", () => {
    // The step is roughly the golden angle precisely so that neighbouring ids do not look alike.
    const seen = new Set([...Array(40).keys()].map((id) => JSON.stringify(classColor(id))));
    expect(seen.size).toBeGreaterThan(35);
  });

  it("does not put two adjacent classes at nearly the same hue", () => {
    for (let id = 0; id < 20; id += 1) {
      const gap = Math.abs(hueOf(classColor(id)) - hueOf(classColor(id + 1)));
      expect(Math.min(gap, 360 - gap), `classes ${id} and ${id + 1}`).toBeGreaterThan(30);
    }
  });

  it("uses grey for a segment with no class", () => {
    expect(classColor(null)).toEqual(UNCLASSED);
    expect(UNCLASSED).toEqual({ r: 128, g: 128, b: 128 });
  });

  it("handles class 0, which is a real class rather than an absent one", () => {
    // Legacy lets a user draw class 0, so it must not come back grey.
    expect(classColor(0)).not.toEqual(UNCLASSED);
    expect(hueOf(classColor(0))).toBe(0);
  });

  it("stays inside the byte range for large and negative ids", () => {
    for (const id of [0, 1, 255, 10_000, -1, -7]) {
      const { r, g, b } = classColor(id);
      for (const channel of [r, g, b]) {
        expect(Number.isInteger(channel), `class ${id}`).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it("reads saturation and value as 0..255, not 0..1", () => {
    // The trap: most implementations take 0..1, and treating 220 as 220.0 gives white for
    // everything. Saturation 220 of 255 is strong but not full, so no channel reaches 0.
    const red = hsvToRgb(0, 220, 220);
    expect(red).toEqual({ r: 220, g: 30, b: 30 });
  });

  it("gives black for value 0 and grey for saturation 0", () => {
    expect(hsvToRgb(123, 220, 0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(hsvToRgb(123, 0, 128)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it("wraps at 360", () => {
    expect(hsvToRgb(0, 220, 220)).toEqual(hsvToRgb(360, 220, 220));
  });
});
