/**
 * RULE-027: which pieces of an AI mask survive.
 *
 * The card's worked example is the anchor: threshold 30 with regions of contour area 2,000, 700
 * and 500 keeps the first two and drops the third, because the minimum is 30% of 2,000 = 600.
 */

import type { BinaryMask } from "@lazylabel/annotation-formats";
import { describe, expect, it } from "vitest";

import {
  MAX_THRESHOLD,
  TOGGLE_DEFAULT,
  filterFragments,
  toggleThreshold,
} from "../../src/tools/fragments.js";

const SIZE = { width: 60, height: 40 };

function maskOf(paint: (set: (x: number, y: number) => void) => void): BinaryMask {
  const data = new Uint8Array(SIZE.width * SIZE.height);
  paint((x, y) => {
    if (x >= 0 && y >= 0 && x < SIZE.width && y < SIZE.height) data[y * SIZE.width + x] = 1;
  });
  return { height: SIZE.height, width: SIZE.width, data };
}

function block(x0: number, y0: number, w: number, h: number) {
  return (set: (x: number, y: number) => void) => {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) set(x, y);
  };
}

function combine(...painters: ((set: (x: number, y: number) => void) => void)[]) {
  return (set: (x: number, y: number) => void) => painters.forEach((paint) => paint(set));
}

const pixels = (mask: BinaryMask) => mask.data.reduce((n: number, v: number) => n + (v === 0 ? 0 : 1), 0);

describe("with the filter off", () => {
  it("returns the mask untouched", () => {
    // Threshold 0 means OFF, and the redraw that fills holes only happens when filtering does.
    const mask = maskOf(combine(block(2, 2, 20, 20), block(40, 30, 2, 2)));
    const result = filterFragments(mask, 0);

    expect(result.mask).toBe(mask);
    expect(result.dropped).toBe(0);
    expect(result.holesFilled).toBe(false);
  });

  it("keeps a hole, which is the visible difference from having it on", () => {
    const ring = maskOf((set) => {
      block(5, 5, 20, 20)(set);
    });
    // Punch a hole.
    for (let y = 10; y < 20; y += 1) for (let x = 10; x < 20; x += 1) ring.data[y * SIZE.width + x] = 0;

    expect(pixels(filterFragments(ring, 0).mask)).toBe(pixels(ring));
  });
});

describe("with the filter on", () => {
  it("drops a speck beside a large region", () => {
    const mask = maskOf(combine(block(2, 2, 20, 20), block(50, 35, 2, 2)));
    const result = filterFragments(mask, 30);

    expect(result.kept).toBe(1);
    expect(result.dropped).toBe(1);
  });

  it("keeps a region big enough relative to the largest", () => {
    // Two blocks, the smaller well over 30% of the larger by contour area.
    const mask = maskOf(combine(block(2, 2, 20, 20), block(30, 2, 15, 15)));
    const result = filterFragments(mask, 30);

    expect(result.kept).toBe(2);
    expect(result.dropped).toBe(0);
  });

  it("drops a ONE-PIXEL-WIDE region however long it is", () => {
    // Its contour runs through pixel centres, so its area is ZERO. A pixel-count filter would keep
    // a 30-pixel line; this one cannot, and the card says so.
    const mask = maskOf(combine(block(2, 2, 20, 20), block(50, 2, 1, 30)));
    const result = filterFragments(mask, 1);

    expect(result.kept).toBe(1);
    expect(result.dropped).toBe(1);
  });

  it("drops everything when the largest region itself has zero area", () => {
    const mask = maskOf(block(10, 10, 1, 20));
    const result = filterFragments(mask, 50);

    expect(result.kept).toBe(0);
    expect(pixels(result.mask)).toBe(0);
  });

  it("keeps only the largest at 100, and any exact tie", () => {
    const mask = maskOf(combine(block(2, 2, 20, 20), block(30, 2, 20, 20), block(2, 30, 5, 5)));
    const result = filterFragments(mask, MAX_THRESHOLD);

    expect(result.kept).toBe(2); // the two equal blocks
    expect(result.dropped).toBe(1);
  });

  it("FILLS INTERIOR HOLES, and says that it did", () => {
    // Legacy's recorded defect, reproduced rather than fixed: the kept pieces are redrawn as
    // filled outer contours, so a ring becomes a disc. Fixing it would make a mask accepted here
    // differ from the same mask accepted in the desktop app. Reporting it is what lets the app
    // tell the user instead of leaving them to find out from an export.
    const ring = maskOf(block(5, 5, 20, 20));
    for (let y = 10; y < 20; y += 1) for (let x = 10; x < 20; x += 1) ring.data[y * SIZE.width + x] = 0;

    const result = filterFragments(ring, 10);

    expect(result.holesFilled).toBe(true);
    expect(pixels(result.mask)).toBeGreaterThan(pixels(ring));
  });

  it("does not claim holes were filled when there were none", () => {
    const mask = maskOf(block(5, 5, 20, 20));
    expect(filterFragments(mask, 10).holesFilled).toBe(false);
  });

  it("copes with an empty mask rather than dividing by nothing", () => {
    const result = filterFragments(maskOf(() => {}), 50);

    expect(result.kept).toBe(0);
    expect(result.dropped).toBe(0);
  });

  it("clamps a threshold a hand-edited settings file could hold", () => {
    const mask = maskOf(combine(block(2, 2, 20, 20), block(50, 35, 2, 2)));

    // Negative would keep everything; 200 would drop all but an exact tie.
    expect(filterFragments(mask, -50).dropped).toBe(0);
    expect(filterFragments(mask, 500).kept).toBe(1);
  });
});

describe("the Z toggle", () => {
  it("turns a filter that is on, off, and remembers where it was", () => {
    expect(toggleThreshold(30, 0)).toEqual({ threshold: 0, remembered: 30 });
  });

  it("restores what it remembered", () => {
    expect(toggleThreshold(0, 30)).toEqual({ threshold: 30, remembered: 30 });
  });

  it("starts at 100 when there is nothing to remember", () => {
    // A toggle with no memory would do nothing on its first press, which reads as an unbound key.
    expect(toggleThreshold(0, 0)).toEqual({ threshold: TOGGLE_DEFAULT, remembered: TOGGLE_DEFAULT });
  });
});
