/**
 * C2 — Load an image's annotations from the best file present: the browser's share.
 *
 * Phase 1 reads the files and the API serves them; what the browser owes this capability is showing
 * what they contain. There are no tools here — clicking, drawing and editing are Phase 5 — so the
 * canvas is read-only on purpose rather than a half-built editor.
 *
 * The pixel work is tested through `segmentPixels`, which is pure. jsdom has no real 2D canvas, so
 * a component test could only assert that the element exists; the arithmetic that actually decides
 * what a user sees is held here instead.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { bytesToBase64, type WireSegment } from "@lazylabel/contracts";

import { AnnotationCanvas, segmentPixels } from "../../src/canvas/AnnotationCanvas.jsx";
import { classColor } from "../../src/canvas/classColor.js";

afterEach(cleanup);

/** A segment whose mask is a solid box of `width` x `height` at (x, y). */
function solid(classId: number | null, x: number, y: number, width: number, height: number): WireSegment {
  return {
    type: "Loaded",
    classId,
    mask: {
      height: 100,
      width: 200,
      box: [x, y, x + width, y + height],
      data: bytesToBase64(new Uint8Array(width * height).fill(1)),
    },
  };
}

function rgbaAt(painted: NonNullable<ReturnType<typeof segmentPixels>>, index: number) {
  const at = index * 4;
  return [painted.data[at], painted.data[at + 1], painted.data[at + 2], painted.data[at + 3]];
}

describe("C2: drawing an image's annotations", () => {
  it("paints a mask in its class colour", () => {
    const painted = segmentPixels(solid(3, 10, 20, 4, 5), 1)!;
    const { r, g, b } = classColor(3);

    expect(painted.width).toBe(4);
    expect(painted.height).toBe(5);
    expect(rgbaAt(painted, 0)).toEqual([r, g, b, 255]);
  });

  it("sizes the buffer to the box, not to the image", () => {
    // The mask says the image is 200x100, and the object is 4x5. An image-sized buffer would be
    // 80,000 bytes for 80 bytes of object — which is exactly what the bounded wire format exists
    // to avoid, and undoing it here would put the cost straight back.
    const painted = segmentPixels(solid(1, 0, 0, 4, 5), 1)!;
    expect(painted.data.length).toBe(4 * 5 * 4);
  });

  it("places the box where the mask says it is", () => {
    const painted = segmentPixels(solid(1, 37, 61, 2, 2), 1)!;
    expect([painted.x, painted.y]).toEqual([37, 61]);
  });

  it("leaves unset pixels fully transparent so the photo shows through", () => {
    const mask = new Uint8Array(4).fill(0);
    mask[2] = 1;
    const segment: WireSegment = {
      type: "Loaded",
      classId: 2,
      mask: { height: 10, width: 10, box: [0, 0, 2, 2], data: bytesToBase64(mask) },
    };

    const painted = segmentPixels(segment, 1)!;
    expect(rgbaAt(painted, 0)[3]).toBe(0);
    expect(rgbaAt(painted, 2)[3]).toBe(255);
  });

  it("applies the overlay opacity to set pixels", () => {
    expect(rgbaAt(segmentPixels(solid(1, 0, 0, 1, 1), 0.5)!, 0)[3]).toBe(128);
    expect(rgbaAt(segmentPixels(solid(1, 0, 0, 1, 1), 0)!, 0)[3]).toBe(0);
  });

  it("draws an unclassed segment grey rather than skipping it", () => {
    const painted = segmentPixels(solid(null, 0, 0, 1, 1), 1)!;
    expect(rgbaAt(painted, 0)).toEqual([128, 128, 128, 255]);
  });

  describe("what it refuses to draw", () => {
    it("skips an empty mask", () => {
      const segment: WireSegment = {
        type: "Loaded",
        classId: 1,
        mask: { height: 10, width: 10, box: null, data: "" },
      };
      expect(segmentPixels(segment, 1)).toBeNull();
    });

    it("skips a segment with no mask at all", () => {
      expect(segmentPixels({ type: "Polygon", classId: 1 }, 1)).toBeNull();
    });

    it("skips a box with no area", () => {
      const segment: WireSegment = {
        type: "Loaded",
        classId: 1,
        mask: { height: 10, width: 10, box: [5, 5, 5, 9], data: "" },
      };
      expect(segmentPixels(segment, 1)).toBeNull();
    });

    it("skips a mask whose bytes do not match its box, rather than drawing garbage", () => {
      const segment: WireSegment = {
        type: "Loaded",
        classId: 1,
        mask: { height: 10, width: 10, box: [0, 0, 4, 4], data: bytesToBase64(new Uint8Array(3)) },
      };
      // A truncated mask could otherwise be painted as a stripe of colour that looks like an
      // annotation the user never made.
      expect(segmentPixels(segment, 1)).toBeNull();
    });
  });

  it("renders a canvas at the image's size, labelled with what it holds", () => {
    render(
      <AnnotationCanvas
        imageUrl="/api/pixels"
        width={200}
        height={100}
        segments={[solid(1, 0, 0, 4, 4), solid(2, 10, 10, 4, 4)]}
      />,
    );

    const canvas = screen.getByRole("img", { name: "2 annotations" }) as HTMLCanvasElement;
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
  });
});
