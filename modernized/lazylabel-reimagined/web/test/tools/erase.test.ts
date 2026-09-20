/**
 * RULE-009, the only P0 rule among the drawing tools.
 *
 * The card's worked example is the anchor: a class-2 polygon cut into a 500-pixel piece and an
 * 8-pixel sliver leaves one 500-pixel class-2 mask segment appended at the end, and the sliver is
 * discarded.
 */

import { bytesToBase64, decodeMask } from "@lazylabel/contracts";
import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { MINIMUM_PIECE_PIXELS, erase } from "../../src/tools/erase.js";

const IMAGE = { width: 40, height: 20 };

/** A full-image mask with the given half-open rectangle set. */
function rect(x0: number, y0: number, x1: number, y1: number) {
  const data = new Uint8Array(IMAGE.width * IMAGE.height);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) data[y * IMAGE.width + x] = 1;
  }
  return { height: IMAGE.height, width: IMAGE.width, data };
}

/**
 * A rectangular polygon. Its vertices are inclusive corners, so fillPoly covers x0..x1 and y0..y1 —
 * `polygon(0, 0, 0, 10)` is one pixel wide and eleven tall.
 */
const polygon = (x0: number, y0: number, x1: number, y1: number, classId = 2): WireSegment => ({
  type: "Polygon",
  classId,
  vertices: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
});

const pixelsOf = (segment: WireSegment): number =>
  segment.mask === undefined
    ? 0
    : decodeMask(segment.mask).data.reduce((n: number, v: number) => n + (v === 0 ? 0 : 1), 0);

/** A mask segment painted by hand, encoded the way the wire format stores one. */
function maskSegment(paint: (data: Uint8Array) => void, classId = 0): WireSegment {
  const data = new Uint8Array(IMAGE.width * IMAGE.height);
  paint(data);

  let x0 = IMAGE.width;
  let y0 = IMAGE.height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < IMAGE.height; y += 1) {
    for (let x = 0; x < IMAGE.width; x += 1) {
      if (data[y * IMAGE.width + x] === 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x >= x1) x1 = x + 1;
      if (y >= y1) y1 = y + 1;
    }
  }

  const region = new Uint8Array((x1 - x0) * (y1 - y0));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      region[(y - y0) * (x1 - x0) + (x - x0)] = data[y * IMAGE.width + x]!;
    }
  }

  return {
    type: "AI",
    classId,
    mask: { height: IMAGE.height, width: IMAGE.width, box: [x0, y0, x1, y1], data: bytesToBase64(region) },
  };
}

describe("erasing part of an annotation", () => {
  it("removes the original and appends what is left as a mask", () => {
    const result = erase([polygon(5, 5, 25, 15)], rect(0, 0, 10, 20), IMAGE);

    expect(result.erased).toEqual([0]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.type).toBe("AI");
  });

  it("makes the remainder no longer editable", () => {
    // Its vertices are gone, so a user who erases a corner off a polygon cannot then adjust its
    // points. That is the rule, not an oversight.
    const result = erase([polygon(5, 5, 25, 15)], rect(0, 0, 10, 20), IMAGE);

    expect(result.segments[0]?.vertices).toBeUndefined();
  });

  it("keeps the class", () => {
    const result = erase([polygon(5, 5, 25, 15, 7)], rect(0, 0, 10, 20), IMAGE);

    expect(result.segments[0]?.classId).toBe(7);
  });

  it("leaves an annotation it does not touch alone, by identity", () => {
    const before = [polygon(5, 5, 15, 15)];
    const result = erase(before, rect(30, 0, 40, 20), IMAGE);

    expect(result.erased).toEqual([]);
    expect(result.segments[0]).toBe(before[0]);
  });
});

describe("splitting into pieces", () => {
  it("makes one segment per surviving piece", () => {
    // A wide bar cut down the middle leaves two pieces, each well over the threshold.
    const result = erase([polygon(2, 5, 37, 15)], rect(18, 0, 22, 20), IMAGE);

    expect(result.segments).toHaveLength(2);
    expect(result.segments.every((s) => s.type === "AI")).toBe(true);
  });

  it("drops a remainder of exactly ten pixels", () => {
    // Strictly MORE than ten survives. Off by one here silently deletes small annotations.
    expect(MINIMUM_PIECE_PIXELS).toBe(10);

    // Eleven pixels tall, one erased, ten left.
    const result = erase([polygon(0, 0, 0, 10)], rect(0, 10, 1, 11), IMAGE);

    expect(result.vanished).toEqual([0]);
    expect(result.segments).toHaveLength(0);
  });

  it("keeps a remainder of eleven", () => {
    const result = erase([polygon(0, 0, 0, 11)], rect(0, 11, 1, 12), IMAGE);

    expect(result.vanished).toEqual([]);
    expect(pixelsOf(result.segments[0]!)).toBe(11);
  });

  it("treats blocks touching at a corner as ONE piece, because connectivity is 8", () => {
    // Two 4x4 blocks meeting diagonally are one component under 8-connectivity and two under 4.
    // Under 4 they would be 16 pixels each and both survive; the difference is whether the user
    // ends up with one annotation or two.
    const blocks = maskSegment((data) => {
      for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) data[y * IMAGE.width + x] = 1;
      for (let y = 4; y < 8; y += 1) for (let x = 4; x < 8; x += 1) data[y * IMAGE.width + x] = 1;
    });

    const result = erase([blocks], rect(0, 0, 1, 1), IMAGE);

    expect(result.segments).toHaveLength(1);
    expect(pixelsOf(result.segments[0]!)).toBe(31); // 32 painted, one erased
  });
});

describe("when nothing survives", () => {
  it("removes an annotation that was erased completely", () => {
    const result = erase([polygon(5, 5, 15, 15)], rect(0, 0, 40, 20), IMAGE);

    expect(result.segments).toHaveLength(0);
    expect(result.vanished).toEqual([0]);
  });

  it("reports a remainder that was all slivers rather than letting a count quietly drop", () => {
    // Real data loss with a ten-pixel threshold behind it: the original is removed and nothing
    // replaces it. `vanished` is what lets a caller say so.
    const result = erase([polygon(0, 0, 0, 10)], rect(0, 5, 1, 6), IMAGE);

    expect(result.vanished).toEqual([0]);
    expect(result.segments).toHaveLength(0);
  });
});

describe("the order of what is left", () => {
  it("appends survivors after the untouched annotations", () => {
    // Selection is by POSITION, so an erase moving an annotation to the end changes what a
    // selection made beforehand refers to.
    const cut = polygon(2, 5, 16, 15, 3);
    const untouched = polygon(30, 2, 38, 18, 9);

    const result = erase([cut, untouched], rect(0, 0, 6, 20), IMAGE);

    expect(result.segments[0]?.classId).toBe(9);
    expect(result.segments[0]?.type).toBe("Polygon");
    expect(result.segments[1]?.classId).toBe(3);
    expect(result.segments[1]?.type).toBe("AI");
  });
});
