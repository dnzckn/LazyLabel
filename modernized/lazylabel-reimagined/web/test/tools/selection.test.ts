/**
 * Which shape a click selects.
 *
 * The test that matters most is the last one: the local-bounding-box rasterization must give the
 * SAME answer as rasterizing the whole image, at every pixel. That is the optimisation's entire
 * correctness argument, and it is exactly the kind of thing that holds for the shapes a hand-written
 * test happens to pick and fails on a boundary somewhere else.

 *
 * Names RULE-094, so the rule is traceable to the test that proves it: a click in Selection mode toggles the most recently added segment covering that pixel.
 */

import { rasterizeSegment } from "@lazylabel/annotation-formats";
import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { hitTest, toggle } from "../../src/tools/selection.js";

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

describe("a polygon reaching past the edge", () => {
  it("is selected where legacy's clipped copy of it lies, not where it is drawn", () => {
    // main_window.py:2319-2324: the vertices as int32, `np.clip`ped to (w - 1, h - 1), then
    // `cv2.fillPoly`. Clipped, (-100, 50) is (0, 50) and (50, 100) is (50, 99): legacy's mask has
    // 2575 pixels, where the triangle drawn has 4282 inside the image.
    const image = { width: 100, height: 100 };
    const triangle: WireSegment = { type: "Polygon", classId: 0, vertices: [[-100, 50], [50, 0], [50, 100]] };

    let hits = 0;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (hitTest([triangle], { x: x + 0.5, y: y + 0.5 }, image) === 0) hits += 1;
      }
    }

    expect(hits).toBe(2575);
    expect(hitTest([triangle], { x: 5.5, y: 20.5 }, image)).toBeNull();
    expect(hitTest([triangle], { x: 10.5, y: 50.5 }, image)).toBe(0);
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
      // Shapes partly outside the image, the second one changed by the clip.
      { type: "Polygon", classId: 4, vertices: [[-5, -5], [12, -5], [12, 8], [-5, 8]] },
      { type: "Polygon", classId: 6, vertices: [[-40.5, 20.5], [30.2, -3.7], [30.2, 45.1]] },
      { type: "Circle", classId: 5, vertices: [[8.5, 30.25], [12.75, 33.5]] },
      // A circle reaching past a corner, which legacy does not clip (main_window.py:2331).
      { type: "Circle", classId: 7, vertices: [[2.5, 3.5], [9.25, 3.5]] },
    ];

    const disagreements: string[] = [];

    for (const [which, shape] of shapes.entries()) {
      // Every shape in this list has vertices; asserting it keeps the call honest under
      // exactOptionalPropertyTypes rather than widening the type to admit undefined.
      const vertices = shape.vertices;
      if (vertices === undefined) throw new Error(`shape ${which} has no vertices`);

      // A polygon as legacy's hit test takes it: truncated, then clipped into the image
      // (main_window.py:2320-2322).
      const clip = (value: number, top: number) => Math.min(Math.max(Math.trunc(value), 0), top);
      const tested =
        shape.type === "Polygon"
          ? vertices.map(([x, y]) => [clip(x, IMAGE.width - 1), clip(y, IMAGE.height - 1)] as const)
          : vertices;
      const full = rasterizeSegment(
        { type: shape.type, classId: shape.classId, vertices: tested },
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

