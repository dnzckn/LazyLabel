/**
 * Dragging a box or a circle.
 *
 * `tools/shapes.test.ts` pins what a drag becomes. This pins the drag itself — including the two
 * cases that only exist once a pointer is involved: a drag that leaves the canvas, and a release
 * that decides the shape rather than the moves along the way.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShapeLayer, type ShapeKind } from "../../src/canvas/ShapeLayer.jsx";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

const IMAGE = { width: 200, height: 100 };
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

function layer(kind: ShapeKind, props: Partial<Parameters<typeof ShapeLayer>[0]> = {}) {
  const onComplete = vi.fn(props.onComplete);
  const onErase = vi.fn(props.onErase);
  const onRefused = vi.fn(props.onRefused);

  renderWithSettings(
    <ShapeLayer
      kind={kind}
      width={IMAGE.width}
      height={IMAGE.height}
      classId={props.classId ?? 1}
      onComplete={onComplete}
      onErase={onErase}
      onRefused={onRefused}
    />,
  );

  const surface = screen.getByLabelText(kind === "box" ? "Box tool" : "Circle tool");
  return { onComplete, onErase, onRefused, surface };
}

const point = (x: number, y: number, init: Record<string, unknown> = {}) => ({
  button: 0,
  pointerId: 1,
  clientX: x,
  clientY: y,
  ...init,
});

const preview = () => screen.queryByTestId("shape-preview");

describe("dragging a box", () => {
  it("previews while the pointer is down and commits on release", () => {
    const { surface, onComplete } = layer("box");

    fireEvent.pointerDown(surface, point(10, 20));
    fireEvent.pointerMove(surface, point(40, 60));
    expect(preview()?.getAttribute("width")).toBe("30");

    fireEvent.pointerUp(surface, point(40, 60));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 60 },
      { x: 10, y: 60 },
    ]);
  });

  it("clears the preview once the shape is committed", () => {
    const { surface } = layer("box");
    fireEvent.pointerDown(surface, point(10, 20));
    fireEvent.pointerMove(surface, point(40, 60));
    fireEvent.pointerUp(surface, point(40, 60));

    expect(preview()).toBeNull();
  });

  it("captures the pointer, so a drag that leaves the canvas still completes", () => {
    // Drawing a box around an object near the edge ALWAYS leaves the canvas. Without capture the
    // release never arrives and the shape is lost after the user has done the work.
    const capture = vi.spyOn(Element.prototype, "setPointerCapture");
    const { surface } = layer("box");

    fireEvent.pointerDown(surface, point(10, 20));

    expect(capture).toHaveBeenCalledWith(1);
    capture.mockRestore();
  });

  it("follows the pointer outside the image rather than refusing to", () => {
    // What a user dragging past the edge to enclose something at the edge expects. The mask clamps
    // it when it rasterizes.
    const { surface, onComplete } = layer("box");

    fireEvent.pointerDown(surface, point(10, 20));
    fireEvent.pointerMove(surface, point(400, 300));
    fireEvent.pointerUp(surface, point(400, 300));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("refuses a drag too small to be deliberate, and says why", () => {
    const { surface, onComplete, onRefused } = layer("box");

    fireEvent.pointerDown(surface, point(10, 20));
    fireEvent.pointerUp(surface, point(10.4, 23));

    expect(onComplete).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0]?.[0]).toContain("at least 1x1");
  });

  it("erases when shift is held at RELEASE", () => {
    // At release, not at press: legacy reads the modifier when the shape is finished, so a user
    // can decide to erase after drawing the region.
    const { surface, onErase, onComplete } = layer("box");

    fireEvent.pointerDown(surface, point(10, 20));
    fireEvent.pointerMove(surface, point(40, 60));
    fireEvent.pointerUp(surface, point(40, 60, { shiftKey: true }));

    expect(onErase).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("uses the RELEASE position, so a drag with no intervening move still works", () => {
    // Found by a test that forgot the move, and it is a real case: the browser may coalesce a
    // fast drag into a press and a release with nothing between. Measuring from the last move
    // would call that a zero-sized box and refuse a drag the user plainly made.
    const { surface, onComplete, onRefused } = layer("box");

    fireEvent.pointerDown(surface, point(10, 20));
    fireEvent.pointerUp(surface, point(40, 60));

    expect(onRefused).not.toHaveBeenCalled();
    expect(onComplete.mock.calls[0]?.[0]).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 60 },
      { x: 10, y: 60 },
    ]);
  });

  it("ignores a right-click drag", () => {
    const { surface, onComplete } = layer("box");

    fireEvent.pointerDown(surface, point(10, 20, { button: 2 }));
    fireEvent.pointerUp(surface, point(40, 60));

    expect(onComplete).not.toHaveBeenCalled();
    expect(preview()).toBeNull();
  });
});

describe("dragging a circle", () => {
  it("previews a disc from the centre and commits on release", () => {
    const { surface, onComplete } = layer("circle");

    fireEvent.pointerDown(surface, point(50, 50));
    fireEvent.pointerMove(surface, point(53, 54)); // distance 5
    expect(preview()?.getAttribute("r")).toBe("5");

    fireEvent.pointerUp(surface, point(53, 54));

    // The 3 o'clock point, not the point released on.
    expect(onComplete.mock.calls[0]?.[0]).toEqual([
      { x: 50, y: 50 },
      { x: 55, y: 50 },
    ]);
  });

  it("refuses a radius under one pixel", () => {
    const { surface, onComplete, onRefused } = layer("circle");

    fireEvent.pointerDown(surface, point(50, 50));
    fireEvent.pointerUp(surface, point(50.5, 50));

    expect(onComplete).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0]?.[0]).toContain("radius of at least 1");
  });
});

describe("abandoning a drag", () => {
  it("drops it on Escape without committing anything", () => {
    const { surface, onComplete } = layer("box");

    fireEvent.pointerDown(surface, point(10, 20));
    fireEvent.pointerMove(surface, point(40, 60));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(preview()).toBeNull();

    // And a release afterwards does not resurrect it.
    fireEvent.pointerUp(surface, point(40, 60));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("drops it on C, legacy's clear-points key, which clears a drag in every tool", () => {
    // It was the AI tool's alone (CONTROL_PARITY.md CP-20).
    const { surface, onComplete } = layer("circle");

    fireEvent.pointerDown(surface, point(10, 20));
    fireEvent.pointerMove(surface, point(40, 60));
    fireEvent.keyDown(document, { key: "c", code: "KeyC" });

    expect(preview()).toBeNull();
    fireEvent.pointerUp(surface, point(40, 60));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does nothing on a release that never had a press", () => {
    const { surface, onComplete, onRefused } = layer("box");
    fireEvent.pointerUp(surface, point(40, 60));

    expect(onComplete).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
  });
});
