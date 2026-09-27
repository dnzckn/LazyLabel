/**
 * Clicks landing on the right pixel, including the cases where they quietly would not.
 */

import { describe, expect, it } from "vitest";

import { locate, project, scale, type DisplayBox } from "../../src/canvas/coordinates.js";

const IMAGE = { width: 200, height: 100 };

/** Displayed at half size, offset on the page, so neither scale nor origin is the identity. */
const BOX: DisplayBox = { left: 30, top: 10, width: 100, height: 50 };

const at = (clientX: number, clientY: number) => ({ clientX, clientY });

describe("locating a click", () => {
  it("maps the top-left corner to the origin", () => {
    expect(locate(at(30, 10), BOX, IMAGE)).toEqual({ kind: "inside", point: { x: 0, y: 0 } });
  });

  it("maps the middle to the middle", () => {
    expect(locate(at(80, 35), BOX, IMAGE).point).toEqual({ x: 100, y: 50 });
  });

  it("scales each axis on its own", () => {
    // A canvas with a CSS width and height:auto, or inside a flex row that shrinks it, is scaled
    // differently per axis. One factor taken from the width would put every vertex progressively
    // further off as it moves down the image.
    const squashed: DisplayBox = { left: 0, top: 0, width: 200, height: 25 };

    expect(locate(at(100, 12.5), squashed, IMAGE).point).toEqual({ x: 100, y: 50 });
  });

  it("keeps fractional coordinates rather than rounding to a pixel", () => {
    // Legacy stores QPointF and truncates only at rasterization (RULE-015). Rounding here would
    // change the exported polygon, and would break the join threshold, which is measured in image
    // pixels: with both ends rounded, clicks 1.4 and 0.6 pixels away can land on the same integer.
    const point = locate(at(30.5, 10.25), BOX, IMAGE).point;

    expect(point.x).toBeCloseTo(1, 10);
    expect(point.y).toBeCloseTo(0.5, 10);
  });
});

describe("clicks outside the image", () => {
  it("reports rather than clamping", () => {
    // Clamping is the tempting one-liner, and it puts a vertex on an edge the user did not click,
    // which then rasterizes into the mask.
    const result = locate(at(10, 10), BOX, IMAGE);

    expect(result.kind).toBe("outside");
    expect(result.point.x).toBeLessThan(0);
  });

  it("still returns the number, so a caller that wants to clamp does not recompute it", () => {
    expect(locate(at(200, 100), BOX, IMAGE).point).toEqual({ x: 340, y: 180 });
  });

  it("treats the right and bottom edges as outside", () => {
    expect(locate(at(130, 35), BOX, IMAGE).kind).toBe("outside"); // x === 200 exactly
    expect(locate(at(80, 60), BOX, IMAGE).kind).toBe("outside"); // y === 100 exactly
  });

  it("is on the image where legacy's rounded press is, half a pixel left of each edge", () => {
    // `pixmap().rect().contains(pos.toPoint())` (single_view_mouse_handler.py:106-110;
    // main_window.py:5506-5509): Qt 6 rounds half away from zero, and the QRect ends at 199 and 99.
    // So x 199.4 is on the 200-wide image and 199.5 off it; -0.4 is on it, as column 0, and -0.5 off.
    const image = (x: number, y: number) => locate(at(30 + x / 2, 10 + y / 2), BOX, IMAGE).kind;

    expect(image(199.4, 50)).toBe("inside");
    expect(image(199.5, 50)).toBe("outside");
    expect(image(100, 99.4)).toBe("inside");
    expect(image(100, 99.5)).toBe("outside");
    expect(image(-0.4, 50)).toBe("inside");
    expect(image(-0.5, 50)).toBe("outside");
    expect(image(100, -0.4)).toBe("inside");
    expect(image(100, -0.5)).toBe("outside");
  });

  it("refuses to divide by an unlaid-out element", () => {
    // Before layout the rect is all zeros. Dividing gives Infinity, which would become a vertex at
    // the far corner -- a plausible-looking number rather than an obvious failure.
    const result = locate(at(5, 5), { left: 0, top: 0, width: 0, height: 0 }, IMAGE);

    expect(result.kind).toBe("outside");
    expect(Number.isNaN(result.point.x)).toBe(true);
  });
});

describe("projecting back", () => {
  it("is the inverse of locating", () => {
    // The dot the user sees has to be under the cursor they clicked with.
    for (const client of [at(30, 10), at(80, 35), at(129, 59)]) {
      const located = locate(client, BOX, IMAGE);
      const back = project(located.point, BOX, IMAGE);

      expect(back.x).toBeCloseTo(client.clientX, 10);
      expect(back.y).toBeCloseTo(client.clientY, 10);
    }
  });

  it("refuses an image with no size", () => {
    expect(Number.isNaN(project({ x: 1, y: 1 }, BOX, { width: 0, height: 0 }).x)).toBe(true);
  });
});

describe("scale", () => {
  it("says how many image pixels one client pixel covers", () => {
    // What a marker drawn at a constant SCREEN size needs. In image units it would vanish when
    // zoomed out -- and the close threshold is two image pixels, already a fraction of a screen
    // pixel at a low zoom.
    expect(scale(BOX, IMAGE)).toEqual({ x: 2, y: 2 });
  });

  it("differs per axis when the box does", () => {
    expect(scale({ left: 0, top: 0, width: 200, height: 25 }, IMAGE)).toEqual({ x: 1, y: 4 });
  });

  it("refuses an unlaid-out element rather than returning Infinity", () => {
    expect(Number.isNaN(scale({ left: 0, top: 0, width: 0, height: 0 }, IMAGE).x)).toBe(true);
  });
});
