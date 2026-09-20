/**
 * Which shape a click selects.
 *
 * The test that matters most is the last one: the local-bounding-box rasterization must give the
 * SAME answer as rasterizing the whole image, at every pixel. That is the optimisation's entire
 * correctness argument, and it is exactly the kind of thing that holds for the shapes a hand-written
 * test happens to pick and fails on a boundary somewhere else.
 */

import { rasterizeSegment } from "@lazylabel/annotation-formats";
import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { afterRemoval, hitTest, toggle } from "../../src/tools/selection.js";

const IMAGE = { width: 60, height: 40 };

const square: WireSegment = {
  type: "Polygon",
  classId: 0,
  vertices: [[10, 10], [20, 10], [20, 20], [10, 20]],
};

const overlapping: WireSegment = {
  type: "Polygon",
  classId: 1,
  vertices: [[15, 15], [30, 15], [30, 30], [15, 30]],
};

const circle: WireSegment = { type: "Circle", classId: 2, vertices: [[40, 20], [46, 20]] };

describe("finding the shape under a click", () => {
  it("finds one that covers the point", () => {
    expect(hitTest([square], { x: 15, y: 15 }, IMAGE)).toBe(0);
  });

  it("finds nothing outside every shape", () => {
    expect(hitTest([square], { x: 50, y: 35 }, IMAGE)).toBeNull();
  });

  it("gives the click to the TOPMOST shape where they overlap", () => {
    // Legacy walks backwards, so the most recently added wins -- which is what a user expects from
    // the thing they just drew, and the opposite of what a forward loop gives.
    expect(hitTest([square, overlapping], { x: 17, y: 17 }, IMAGE)).toBe(1);
  });

  it("still finds the lower shape where only it covers the point", () => {
    expect(hitTest([square, overlapping], { x: 11, y: 11 }, IMAGE)).toBe(0);
  });

  it("truncates the click to a pixel, as legacy does", () => {
    // Rounding instead would move the hit region half a pixel up and left of the drawn one.
    expect(hitTest([square], { x: 10.9, y: 10.9 }, IMAGE)).toBe(0);
    expect(hitTest([square], { x: 9.9, y: 15 }, IMAGE)).toBeNull();
  });

  it("finds a circle by its disc, not by the box around its two vertices", () => {
    // A circle's vertices are a centre and a radius point; the extent is the centre plus the
    // radius in every direction. A box around the two points would miss the whole left half.
    expect(hitTest([circle], { x: 35, y: 20 }, IMAGE)).toBe(0);
    expect(hitTest([circle], { x: 40, y: 15 }, IMAGE)).toBe(0);
    expect(hitTest([circle], { x: 40, y: 20 }, IMAGE)).toBe(0);
  });

  it("ignores a click outside the image entirely", () => {
    expect(hitTest([square], { x: -1, y: 15 }, IMAGE)).toBeNull();
    expect(hitTest([square], { x: 15, y: 999 }, IMAGE)).toBeNull();
  });

  it("ignores a shape with no vertices rather than throwing", () => {
    expect(hitTest([{ type: "Polygon", classId: 0 }], { x: 5, y: 5 }, IMAGE)).toBeNull();
  });

  it("finds a mask segment through its bounded region", () => {
    // Masks arrive as a box plus the bytes inside it. Decoding a whole image's worth of pixels to
    // answer "is this one set" is the cost that format exists to avoid.
    const mask: WireSegment = {
      type: "AI",
      classId: 0,
      // A 2x2 region at (5,5), with only its bottom-right pixel set.
      mask: { height: 40, width: 60, box: [5, 5, 7, 7], data: btoa("\x00\x00\x00\x01") },
    };

    expect(hitTest([mask], { x: 6, y: 6 }, IMAGE)).toBe(0);
    expect(hitTest([mask], { x: 5, y: 5 }, IMAGE)).toBeNull();
    expect(hitTest([mask], { x: 9, y: 9 }, IMAGE)).toBeNull();
  });

  it("treats an undecodable mask as unselectable rather than throwing", () => {
    const broken: WireSegment = {
      type: "AI",
      classId: 0,
      mask: { height: 40, width: 60, box: [5, 5, 7, 7], data: "not base64 !!!" },
    };

    expect(hitTest([broken], { x: 6, y: 6 }, IMAGE)).toBeNull();
  });
});

describe("the local rasterization agrees with the full-image one", () => {
  it("at every pixel, for every shape", () => {
    // The optimisation's whole correctness argument. It holds because the bounding-box origin is
    // an INTEGER: truncation commutes with an integer translation, so each pixel falls the same
    // way it would in full-image coordinates. A fractional origin would move boundary pixels.
    const shapes: readonly WireSegment[] = [
      square,
      overlapping,
      circle,
      // Fractional vertices, which is where truncation could diverge.
      { type: "Polygon", classId: 3, vertices: [[3.7, 4.2], [18.9, 4.2], [11.5, 19.8]] },
      // A shape partly outside the image.
      { type: "Polygon", classId: 4, vertices: [[-5, -5], [12, -5], [12, 8], [-5, 8]] },
      { type: "Circle", classId: 5, vertices: [[8.5, 30.25], [12.75, 33.5]] },
    ];

    const disagreements: string[] = [];

    for (const [which, shape] of shapes.entries()) {
      // Every shape in this list has vertices; asserting it keeps the call honest under
      // exactOptionalPropertyTypes rather than widening the type to admit undefined.
      const vertices = shape.vertices;
      if (vertices === undefined) throw new Error(`shape ${which} has no vertices`);

      const full = rasterizeSegment(
        { type: shape.type, classId: shape.classId, vertices },
        IMAGE.height,
        IMAGE.width,
      );
      if (full === null) throw new Error(`shape ${which} rasterized to nothing`);

      for (let y = 0; y < IMAGE.height; y += 1) {
        for (let x = 0; x < IMAGE.width; x += 1) {
          const viaFull = full.data[y * IMAGE.width + x] === 1;
          const viaHit = hitTest([shape], { x, y }, IMAGE) === 0;
          if (viaFull !== viaHit) disagreements.push(`shape ${which} at (${x},${y})`);
        }
      }
    }

    expect(disagreements).toEqual([]);
  });
});

describe("toggling a selection", () => {
  it("adds one that is not selected", () => {
    expect(toggle([], 2)).toEqual([2]);
    expect(toggle([1], 2)).toEqual([1, 2]);
  });

  it("removes one that is", () => {
    // Clicking the same shape twice deselects it, which is what makes a multi-shape selection
    // possible without a modifier key.
    expect(toggle([1, 2, 3], 2)).toEqual([1, 3]);
  });
});

describe("keeping a selection valid after a removal", () => {
  it("drops the removed index and shifts the ones after it", () => {
    // The selection is a list of POSITIONS. Undoing an add removes an entry and everything after
    // moves down by one; without this, a merge or a delete would act on the wrong shapes.
    expect(afterRemoval([0, 2, 4], 2)).toEqual([0, 3]);
  });

  it("leaves earlier indices alone", () => {
    expect(afterRemoval([0, 1], 5)).toEqual([0, 1]);
  });

  it("copes with an empty selection", () => {
    expect(afterRemoval([], 0)).toEqual([]);
  });
});
