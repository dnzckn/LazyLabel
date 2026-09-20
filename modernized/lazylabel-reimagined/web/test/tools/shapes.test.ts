/**
 * RULE-043: what a box and a circle become, and what is too small to be one.
 *
 * The card's own worked example is the anchor: a circle dragged from (50,50) to (53.9,50) stores
 * vertices [[50,50],[53.9,50]] and rasterizes as a disc of radius 4.
 */

import { describe, expect, it } from "vitest";

import {
  MIN_BOX_SIDE,
  MIN_CIRCLE_RADIUS,
  boxFrom,
  circleFrom,
  radiusOf,
} from "../../src/tools/shapes.js";

const at = (x: number, y: number) => ({ x, y });

function vertices(outcome: ReturnType<typeof boxFrom>) {
  if (outcome.kind !== "shape") throw new Error(`expected a shape, got: ${outcome.reason}`);
  return outcome.vertices;
}

describe("boxes", () => {
  it("stores four corners, clockwise from the top left", () => {
    // The vertex list is what gets exported, so a different order is a different file.
    expect(vertices(boxFrom(at(10, 20), at(40, 60)))).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 60 },
      { x: 10, y: 60 },
    ]);
  });

  it("gives the same box however the drag was made", () => {
    // Without normalizing, a right-to-left drag has a negative width, fails the minimum-size test
    // and silently produces nothing -- for half the directions a user might drag.
    const expected = vertices(boxFrom(at(10, 20), at(40, 60)));

    expect(vertices(boxFrom(at(40, 60), at(10, 20)))).toEqual(expected);
    expect(vertices(boxFrom(at(40, 20), at(10, 60)))).toEqual(expected);
    expect(vertices(boxFrom(at(10, 60), at(40, 20)))).toEqual(expected);
  });

  it("accepts the smallest box legacy accepts", () => {
    expect(boxFrom(at(0, 0), at(1, 1)).kind).toBe("shape");
    expect(MIN_BOX_SIDE).toBe(1);
  });

  it("refuses a drag that is too thin in one direction", () => {
    // The card's case: 0.5 x 3 creates nothing. Legacy discards it silently.
    const outcome = boxFrom(at(0, 0), at(0.5, 3));

    expect(outcome.kind).toBe("ignored");
    if (outcome.kind !== "ignored") throw new Error("expected it to be ignored");
    // Both dimensions are named: "too small" on a 0.5 x 3 drag is baffling otherwise, because the
    // box looks perfectly large in the direction the user was watching.
    expect(outcome.reason).toContain("0.50x3");
  });

  it("refuses a click that never moved", () => {
    expect(boxFrom(at(10, 10), at(10, 10)).kind).toBe("ignored");
  });

  it("keeps fractional corners rather than snapping them", () => {
    // Rasterization rounds (RULE-015); the stored vertices do not.
    expect(vertices(boxFrom(at(1.25, 2.5), at(11.75, 12.5)))[0]).toEqual({ x: 1.25, y: 2.5 });
  });
});

describe("circles", () => {
  it("works the card's example", () => {
    const outcome = circleFrom(at(50, 50), at(53.9, 50));

    expect(vertices(outcome)).toEqual([
      { x: 50, y: 50 },
      { x: 53.9, y: 50 },
    ]);
  });

  it("stores the 3 o'clock point, not the point released on", () => {
    // THE case a horizontal-drag test cannot catch. Dragging up-left by 5 and dragging right by 5
    // are the same circle, and must store the same vertices.
    const upLeft = vertices(circleFrom(at(50, 50), at(47, 46))); // distance 5
    const right = vertices(circleFrom(at(50, 50), at(55, 50)));

    expect(upLeft).toEqual(right);
    expect(upLeft[1]).toEqual({ x: 55, y: 50 });
  });

  it("measures the radius as a straight line, not along an axis", () => {
    const outcome = circleFrom(at(0, 0), at(3, 4));

    expect(radiusOf(vertices(outcome))).toBeCloseTo(5, 10);
  });

  it("accepts the smallest radius legacy accepts", () => {
    expect(circleFrom(at(0, 0), at(1, 0)).kind).toBe("shape");
    expect(MIN_CIRCLE_RADIUS).toBe(1);
  });

  it("refuses anything smaller", () => {
    const outcome = circleFrom(at(0, 0), at(0.9, 0));

    expect(outcome.kind).toBe("ignored");
    if (outcome.kind !== "ignored") throw new Error("expected it to be ignored");
    expect(outcome.reason).toContain("0.90");
  });

  it("refuses a click that never moved", () => {
    expect(circleFrom(at(10, 10), at(10, 10)).kind).toBe("ignored");
  });
});

describe("reading a stored circle back", () => {
  it("recovers the radius from the two vertices", () => {
    expect(radiusOf([at(50, 50), at(53.9, 50)])).toBeCloseTo(3.9, 10);
  });

  it("reports nothing for a malformed circle rather than throwing", () => {
    // A file can hold anything. A reader that crashes on a one-vertex circle takes the whole image
    // down with it, when the honest answer is a circle with no size.
    expect(radiusOf([])).toBe(0);
    expect(radiusOf([at(1, 1)])).toBe(0);
  });
});
