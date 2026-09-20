/**
 * Dragging a vertex handle.
 *
 * `tools/edit.test.ts` pins what moving a handle MEANS. This pins the gesture — including the two
 * things only a drag can get wrong: compounding a circle's translation across pointermoves, and
 * recording one history entry per frame instead of one per drag.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { EditLayer } from "../../src/canvas/EditLayer.jsx";

afterEach(cleanup);

const IMAGE = { width: 200, height: 100 };
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

const triangle: WireSegment = {
  type: "Polygon",
  classId: 0,
  vertices: [[10, 10], [50, 10], [50, 50]],
};

const circle: WireSegment = { type: "Circle", classId: 0, vertices: [[50, 50], [55, 50]] };

function layer(segment: WireSegment) {
  const onChange = vi.fn();
  const onNoHandles = vi.fn();

  render(
    <EditLayer
      width={IMAGE.width}
      height={IMAGE.height}
      index={3}
      segment={segment}
      onChange={onChange}
      onNoHandles={onNoHandles}
    />,
  );

  return { onChange, onNoHandles, surface: screen.getByLabelText("Edit tool") };
}

const point = (x: number, y: number) => ({ button: 0, pointerId: 1, clientX: x, clientY: y });
const handle = (index: number) => screen.queryByTestId(`handle-${index}`);

describe("showing handles", () => {
  it("draws one per vertex, where the vertex is", () => {
    layer(triangle);

    expect(handle(0)?.getAttribute("cx")).toBe("10");
    expect(handle(2)?.getAttribute("cy")).toBe("50");
    expect(handle(3)).toBeNull();
  });

  it("reports a shape with no handles rather than showing an empty canvas", () => {
    const { onNoHandles } = layer({
      type: "Polygon",
      classId: 0,
      vertices: Array.from({ length: 350 }, (_, i) => [i, i] as const),
    });

    expect(onNoHandles.mock.calls[0]?.[0]).toBe("Polygon has 350 vertices (max 200 for editing)");
    expect(handle(0)).toBeNull();
  });

  it("reports a mask, which has nothing to drag", () => {
    const { onNoHandles } = layer({ type: "AI", classId: 0 });

    expect(onNoHandles.mock.calls[0]?.[0]).toContain("is a mask");
  });
});

describe("dragging a polygon vertex", () => {
  it("commits the moved shape on release, with the index it belongs to", () => {
    const { onChange, surface } = layer(triangle);

    fireEvent.pointerDown(handle(1)!, point(50, 10));
    fireEvent.pointerMove(surface, point(80, 30));
    fireEvent.pointerUp(surface, point(80, 30));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe(3);
    expect(onChange.mock.calls[0]?.[1].vertices).toEqual([[10, 10], [80, 30], [50, 50]]);
  });

  it("records ONE change for a drag, not one per frame", () => {
    // A drag delivers dozens of pointermoves. Recording each would fill the undo stack with a
    // frame-by-frame replay of one gesture, and undo would make the vertex crawl back.
    const { onChange, surface } = layer(triangle);

    fireEvent.pointerDown(handle(1)!, point(50, 10));
    for (let x = 52; x <= 80; x += 2) fireEvent.pointerMove(surface, point(x, 10));
    fireEvent.pointerUp(surface, point(80, 10));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("follows the cursor while dragging, because the preview is the point", () => {
    const { surface } = layer(triangle);

    fireEvent.pointerDown(handle(1)!, point(50, 10));
    fireEvent.pointerMove(surface, point(80, 30));

    expect(handle(1)?.getAttribute("cx")).toBe("80");
  });

  it("uses the RELEASE position, so a drag with no intervening move still lands", () => {
    const { onChange } = layer(triangle);
    const surface = screen.getByLabelText("Edit tool");

    fireEvent.pointerDown(handle(1)!, point(50, 10));
    fireEvent.pointerUp(surface, point(80, 30));

    expect(onChange.mock.calls[0]?.[1].vertices).toEqual([[10, 10], [80, 30], [50, 50]]);
  });
});

describe("dragging a circle handle", () => {
  it("does NOT compound the translation across pointermoves", () => {
    // The bug a preview-chained implementation has. Applying each move to the PREVIOUS preview
    // shifts the circle again by the full offset every event, so a slow drag flings it off screen
    // while a fast one behaves -- which makes it look like a rendering glitch rather than a bug.
    const { onChange, surface } = layer(circle);

    fireEvent.pointerDown(handle(0)!, point(50, 50));
    fireEvent.pointerMove(surface, point(60, 50));
    fireEvent.pointerMove(surface, point(70, 50));
    fireEvent.pointerUp(surface, point(70, 50));

    // Centre at 70, radius point 5 to its right. Not 90, which is where chaining would put it.
    expect(onChange.mock.calls[0]?.[1].vertices).toEqual([[70, 50], [75, 50]]);
  });

  it("resizes when the radius handle is dragged", () => {
    const { onChange, surface } = layer(circle);

    fireEvent.pointerDown(handle(1)!, point(55, 50));
    fireEvent.pointerUp(surface, point(50, 70));

    expect(onChange.mock.calls[0]?.[1].vertices).toEqual([[50, 50], [50, 70]]);
  });
});

describe("abandoning a drag", () => {
  it("puts the shape back and commits nothing on Escape", () => {
    const { onChange, surface } = layer(triangle);

    fireEvent.pointerDown(handle(1)!, point(50, 10));
    fireEvent.pointerMove(surface, point(80, 30));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(handle(1)?.getAttribute("cx")).toBe("50");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a release that never had a press", () => {
    const { onChange, surface } = layer(triangle);
    fireEvent.pointerUp(surface, point(80, 30));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a right-click on a handle", () => {
    const { onChange, surface } = layer(triangle);

    fireEvent.pointerDown(handle(1)!, { ...point(50, 10), button: 2 });
    fireEvent.pointerUp(surface, point(80, 30));

    expect(onChange).not.toHaveBeenCalled();
  });
});
