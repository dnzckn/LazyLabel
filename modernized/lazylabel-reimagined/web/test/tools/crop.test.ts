/**
 * RULE-018, a P0 rule, from the card's own worked example.
 *
 * A 1000x800 image with X = "-10:1200" and Y = "50:700" stores (0, 50, 999, 700): x clamps to
 * [0, 999] and y to [0, 799]. The crop then blanks everything outside it on save, which is why
 * being one pixel out deletes a row of somebody's work.

 *
 * Names RULE-045 so the rule is traceable to the test that proves it: a rule named in
 * NO test cannot be audited, because "covered by a test that does not say so" and "not
 * covered" look identical to a reviewer. Crop coordinate validation and reuse by image size.
 */

import { describe, expect, it } from "vitest";

import {
  MINIMUM_CROP_DRAG,
  cropFrom,
  cropFromDrag,
  excludedPixels,
  isWholeImage,
  parseRange,
} from "../../src/tools/crop.js";

const IMAGE = { width: 1000, height: 800 };

describe("clamping corners", () => {
  it("works the card's example", () => {
    expect(cropFrom({ x: -10, y: 50 }, { x: 1200, y: 700 }, IMAGE)).toEqual({
      x1: 0,
      y1: 50,
      x2: 999,
      y2: 700,
    });
  });

  it("clamps INCLUSIVELY to width - 1 and height - 1", () => {
    // Not to width and height. The far edge of the image is 999, not 1000, and that one is what
    // makes the last row and column unreachable by a crop.
    expect(cropFrom({ x: 0, y: 0 }, { x: 99999, y: 99999 }, IMAGE)).toEqual({
      x1: 0,
      y1: 0,
      x2: 999,
      y2: 799,
    });
  });

  it("rounds before clamping", () => {
    expect(cropFrom({ x: 10.6, y: 20.4 }, { x: 100.5, y: 200.5 }, IMAGE)).toEqual({
      x1: 11,
      y1: 20,
      x2: 101,
      y2: 201,
    });
  });

  it("puts the corners in order, whichever way they were given", () => {
    const forwards = cropFrom({ x: 10, y: 20 }, { x: 100, y: 200 }, IMAGE);

    expect(cropFrom({ x: 100, y: 200 }, { x: 10, y: 20 }, IMAGE)).toEqual(forwards);
    expect(cropFrom({ x: 100, y: 20 }, { x: 10, y: 200 }, IMAGE)).toEqual(forwards);
  });

  it("refuses to go negative", () => {
    expect(cropFrom({ x: -500, y: -500 }, { x: -1, y: -1 }, IMAGE)).toEqual({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
    });
  });
});

describe("the drag minimum", () => {
  it("refuses a drag of exactly five, and accepts six", () => {
    // Strictly MORE than five in both directions. A stray click while the tool is active would
    // otherwise make a zero-sized crop, which blanks the whole image on the next save.
    expect(cropFromDrag({ x: 0, y: 0 }, { x: 5, y: 50 }, IMAGE).kind).toBe("ignored");
    expect(cropFromDrag({ x: 0, y: 0 }, { x: 6, y: 50 }, IMAGE).kind).toBe("crop");
    expect(MINIMUM_CROP_DRAG).toBe(5);
  });

  it("needs the size in BOTH directions", () => {
    expect(cropFromDrag({ x: 0, y: 0 }, { x: 500, y: 4 }, IMAGE).kind).toBe("ignored");
  });

  it("says the size it refused", () => {
    const outcome = cropFromDrag({ x: 0, y: 0 }, { x: 500, y: 4 }, IMAGE);

    if (outcome.kind !== "ignored") throw new Error("expected it to be ignored");
    expect(outcome.reason).toContain("500x4");
  });

  it("clamps a drag that left the image, rather than refusing it", () => {
    // Dragging past the edge to enclose something AT the edge is normal; the clamp is what makes
    // it work.
    const outcome = cropFromDrag({ x: -50, y: -50 }, { x: 5000, y: 5000 }, IMAGE);

    if (outcome.kind !== "crop") throw new Error("expected a crop");
    expect(outcome.crop).toEqual({ x1: 0, y1: 0, x2: 999, y2: 799 });
  });
});

describe("the typed panel's ranges", () => {
  it("parses a plain pair", () => {
    expect(parseRange("50:700")).toEqual({ from: 50, to: 700 });
  });

  it("accepts values outside the image, because clamping happens later", () => {
    // Legacy parses each half as a plain integer with no range validation; the crop manager clamps
    // afterwards. "-10:1200" is legal input.
    expect(parseRange("-10:1200")).toEqual({ from: -10, to: 1200 });
  });

  it("swaps a reversed pair", () => {
    expect(parseRange("700:50")).toEqual({ from: 50, to: 700 });
  });

  it("tolerates spaces", () => {
    expect(parseRange(" 50 : 700 ")).toEqual({ from: 50, to: 700 });
  });

  it("refuses what is not a pair at all", () => {
    expect(parseRange("50")).toBeNull();
    expect(parseRange("50:60:70")).toBeNull();
    expect(parseRange("a:b")).toBeNull();
    expect(parseRange("")).toBeNull();
  });
});

describe("what a crop would cost", () => {
  it("recognises a crop that covers the whole image", () => {
    // The same as having none, and worth saying so rather than blanking a row for nothing.
    expect(isWholeImage({ x1: 0, y1: 0, x2: 999, y2: 799 }, IMAGE)).toBe(true);
    expect(isWholeImage({ x1: 0, y1: 0, x2: 998, y2: 799 }, IMAGE)).toBe(false);
  });

  it("counts the pixels a save would blank", () => {
    // Legacy says nothing before blanking, and the blanking cannot be undone from the file. A
    // count is the least a user needs to notice a crop they had forgotten was still applied.
    const crop = { x1: 0, y1: 0, x2: 500, y2: 400 };

    expect(excludedPixels(crop, IMAGE)).toBe(1000 * 800 - 500 * 400);
  });

  it("reports the whole image for a degenerate crop", () => {
    expect(excludedPixels({ x1: 10, y1: 10, x2: 10, y2: 10 }, IMAGE)).toBe(1000 * 800);
  });
});
