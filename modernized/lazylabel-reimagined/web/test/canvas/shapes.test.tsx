/**
 * Polygons, boxes and circles are drawn on the image, as legacy draws them.
 *
 * The owner, 2026-09-26: "when i add a segment, it dissapears ... even tho it still adds it to the
 * segment list and class list", and "i can select them, but there hidden basically". The canvas
 * drew masks only, so every shape segment -- a drawn polygon, a box (a four-corner polygon), a
 * circle, and an AI mask the auto-polygon setting had converted -- was in the store, in the tables
 * and under the select layer, and never painted.
 *
 * Legacy fills a polygon or circle in its class colour at alpha 70, with no outline
 * (segment_display_manager.py:333-376), and draws masks at the same 70.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import {
  AnnotationCanvas,
  OVERLAY_OPACITY,
  fillShape,
  segmentAt,
  segmentShape,
} from "../../src/canvas/AnnotationCanvas.jsx";
import { classColor } from "../../src/canvas/classColor.js";

afterEach(cleanup);

/** A 2D context that records what was drawn, for the calls the canvas makes. */
function recorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  const fills: string[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push([name, ...args]);
  };
  const context = {
    fillStyle: "" as string,
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    closePath: record("closePath"),
    arc: record("arc"),
    fill: (...args: unknown[]) => {
      calls.push(["fill", ...args]);
      fills.push(context.fillStyle);
    },
    clearRect: record("clearRect"),
    drawImage: record("drawImage"),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: record("putImageData"),
    getImageData: record("getImageData"),
  };
  return { context, calls, fills };
}

const TRIANGLE: WireSegment = { type: "Polygon", classId: 2, vertices: [[10, 10], [30, 10], [20, 25]] };
const CIRCLE: WireSegment = { type: "Circle", classId: 5, vertices: [[40, 20], [43, 24]] };

describe("which segments are drawn as shapes", () => {
  it("draws a Polygon with vertices as its outline", () => {
    expect(segmentShape(TRIANGLE)).toEqual({ kind: "polygon", points: TRIANGLE.vertices });
  });

  it("draws a Circle around its first vertex, through its second", () => {
    expect(segmentShape(CIRCLE)).toEqual({ kind: "circle", cx: 40, cy: 20, radius: 5 });
  });

  it("draws a one-vertex Circle as nothing, as legacy's empty rectangle does", () => {
    expect(segmentShape({ type: "Circle", classId: 1, vertices: [[4, 4]] })).toEqual({
      kind: "circle",
      cx: 4,
      cy: 4,
      radius: 0,
    });
  });

  it("leaves masks to the mask path", () => {
    expect(segmentShape({ type: "AI", classId: 1 })).toBeNull();
    expect(segmentShape({ type: "Polygon", classId: 1 })).toBeNull();
    expect(segmentShape({ type: "Polygon", classId: 1, vertices: [] })).toBeNull();
  });
});

describe("how a shape is filled", () => {
  it("fills a polygon even-odd, in its class colour at legacy's alpha, with no outline", () => {
    const { context, calls, fills } = recorder();

    fillShape(context as unknown as CanvasRenderingContext2D, segmentShape(TRIANGLE)!, classColor(2), OVERLAY_OPACITY);

    const { r, g, b } = classColor(2);
    expect(fills).toEqual([`rgba(${r}, ${g}, ${b}, ${70 / 255})`]);
    expect(calls.filter(([name]) => ["moveTo", "lineTo", "closePath", "fill"].includes(name))).toEqual([
      ["moveTo", 10, 10],
      ["lineTo", 30, 10],
      ["lineTo", 20, 25],
      ["closePath"],
      ["fill", "evenodd"],
    ]);
    expect(calls.some(([name]) => name === "stroke")).toBe(false);
  });

  it("fills a circle as an arc around its centre", () => {
    const { context, calls } = recorder();

    fillShape(context as unknown as CanvasRenderingContext2D, segmentShape(CIRCLE)!, classColor(5), OVERLAY_OPACITY);

    expect(calls.find(([name]) => name === "arc")).toEqual(["arc", 40, 20, 5, 0, 2 * Math.PI]);
  });

  it("uses legacy's 70 of 255 for the overlay", () => {
    expect(Math.round(OVERLAY_OPACITY * 255)).toBe(70);
  });
});

describe("the canvas paints them", () => {
  let recorded: ReturnType<typeof recorder>;

  beforeEach(() => {
    recorded = recorder();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => recorded.context as unknown as CanvasRenderingContext2D,
    );
  });

  it("draws a polygon and a circle added to the image", () => {
    // The annotations have a canvas of their own, painted at once: jsdom never loads the picture.
    render(
      <AnnotationCanvas imageUrl="/pixels" width={64} height={48} segments={[TRIANGLE, CIRCLE]} />,
    );

    expect(recorded.calls).toContainEqual(["moveTo", 10, 10]);
    expect(recorded.calls).toContainEqual(["arc", 40, 20, 5, 0, 2 * Math.PI]);
    const { r, g, b } = classColor(5);
    expect(recorded.fills).toContain(`rgba(${r}, ${g}, ${b}, ${70 / 255})`);
  });

  it("puts the annotations on a second canvas over the picture, hidden from assistive tech", () => {
    const { container } = render(
      <AnnotationCanvas imageUrl="/pixels" width={64} height={48} segments={[TRIANGLE]} />,
    );

    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(2);
    expect(canvases[1]!.className).toBe("annotation-canvas__overlay");
    expect(canvases[1]!.getAttribute("aria-hidden")).toBe("true");
    expect([canvases[1]!.width, canvases[1]!.height]).toEqual([64, 48]);
  });
});

describe("hover and selection, as legacy draws them", () => {
  let recorded: ReturnType<typeof recorder>;

  beforeEach(() => {
    recorded = recorder();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => recorded.context as unknown as CanvasRenderingContext2D,
    );
  });

  const rgba = (rgb: { r: number; g: number; b: number }, alpha: number) =>
    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha / 255})`;

  it("draws the hovered segment at 170 and the rest at 70", () => {
    render(
      <AnnotationCanvas imageUrl="/pixels" width={64} height={48} segments={[TRIANGLE, CIRCLE]} hovered={CIRCLE} />,
    );

    expect(recorded.fills).toEqual([rgba(classColor(2), 70), rgba(classColor(5), 170)]);
  });

  it("lays a yellow copy at 180 over everything for a selected segment", () => {
    render(
      <AnnotationCanvas imageUrl="/pixels" width={64} height={48} segments={[TRIANGLE, CIRCLE]} selected={[0]} />,
    );

    // Both segments first, then the highlight over them: legacy's z 999.
    expect(recorded.fills).toEqual([
      rgba(classColor(2), 70),
      rgba(classColor(5), 70),
      rgba({ r: 255, g: 255, b: 0 }, 180),
    ]);
  });

  it("highlights a selected shape in its own colour at 170 in Edit mode", () => {
    render(
      <AnnotationCanvas
        imageUrl="/pixels"
        width={64}
        height={48}
        segments={[TRIANGLE]}
        selected={[0]}
        editing
      />,
    );

    expect(recorded.fills).toEqual([rgba(classColor(2), 70), rgba(classColor(2), 170)]);
  });
});

describe("which segment the pointer is over", () => {
  /** A 4x4 mask at (2,2) with only its top-left pixel set. */
  const DOT: WireSegment = {
    type: "AI",
    classId: 1,
    mask: { height: 48, width: 64, box: [2, 2, 6, 6], data: btoa(String.fromCharCode(1) + "\0".repeat(15)) },
  };

  it("finds the topmost: the later of two overlapping segments", () => {
    const under: WireSegment = { type: "Polygon", classId: 1, vertices: [[0, 0], [40, 0], [40, 40], [0, 40]] };
    expect(segmentAt([under, TRIANGLE], 20, 15)).toBe(1);
    expect(segmentAt([under, TRIANGLE], 5, 35)).toBe(0);
  });

  it("finds a circle within its radius", () => {
    expect(segmentAt([CIRCLE], 43, 23)).toBe(0);
    expect(segmentAt([CIRCLE], 46, 20)).toBe(-1);
  });

  it("finds a mask only where its pixels are set, as Qt's pixmap items do", () => {
    expect(segmentAt([DOT], 2.5, 2.5)).toBe(0);
    expect(segmentAt([DOT], 3.5, 2.5)).toBe(-1);
    expect(segmentAt([DOT], 30, 30)).toBe(-1);
  });
});
