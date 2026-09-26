/**
 * Edit mode on the canvas: legacy's handles, on every selected shape, and its two drags.
 *
 * `tools/edit.test.ts` pins what moving a handle MEANS. This pins the gestures -- including the
 * things only a drag can get wrong: compounding a circle's translation across pointer events,
 * recording one history entry per event instead of one per drag, and recording a click that moved
 * nothing.
 *
 * The layer reports live positions through `onPreview` and the finished drag through `onCommit`;
 * the store behind them is tested in `test/acceptance/c4.editMode.test.tsx`.
 */

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { EditLayer, HANDLE_FILL, MOVE_SHAPES, MOVE_VERTEX } from "../../src/canvas/EditLayer.jsx";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

const IMAGE = { width: 200, height: 100 };
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

function showAt(rect: typeof RECT) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...rect,
    toJSON: () => rect,
  } as DOMRect);
}

beforeEach(() => showAt(RECT));

const triangle: WireSegment = {
  type: "Polygon",
  classId: 0,
  vertices: [[10, 10], [50, 10], [50, 50]],
};
const square: WireSegment = {
  type: "Polygon",
  classId: 1,
  vertices: [[100, 20], [140, 20], [140, 60], [100, 60]],
};
const circle: WireSegment = { type: "Circle", classId: 0, vertices: [[50, 50], [55, 50]] };
const mask: WireSegment = { type: "AI", classId: 2 };
const big: WireSegment = {
  type: "Polygon",
  classId: 3,
  vertices: Array.from({ length: 201 }, (_, i) => [i % 200, 90] as const),
};

function layer(
  segments: readonly WireSegment[],
  selected: readonly number[],
  settings: Readonly<Record<string, unknown>> = {},
) {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const onNotice = vi.fn();

  const element = (current: readonly WireSegment[], chosen: readonly number[]) => (
    <EditLayer
      width={IMAGE.width}
      height={IMAGE.height}
      segments={current}
      selected={chosen}
      onPreview={onPreview}
      onCommit={onCommit}
      onNotice={onNotice}
    />
  );
  const { rerender } = renderWithSettings(element(segments, selected), settings);

  return {
    onPreview,
    onCommit,
    onNotice,
    surface: screen.getByLabelText("Edit tool"),
    rerender: (next: readonly WireSegment[], chosen = selected) => rerender(element(next, chosen)),
  };
}

const point = (x: number, y: number) => ({ button: 0, pointerId: 1, clientX: x, clientY: y });
const handle = (shape: number, vertex: number) => screen.queryByTestId(`handle-${shape}-${vertex}`);
const handles = () => screen.queryAllByTestId(/^handle-\d+-\d+$/);
/** The shape a call to onPreview or onCommit gave for one position. */
const shapeIn = (map: unknown, index: number) => (map as ReadonlyMap<number, WireSegment>).get(index);

describe("which shapes have handles", () => {
  it("puts them on EVERY selected polygon and circle, each at its vertices", () => {
    // CP-16: legacy lays handles on each selected shape (edit_mode_manager.py:105-135). This layer
    // took a single segment, and the view showed it only with exactly one selected.
    layer([triangle, square, circle], [0, 1, 2]);

    expect(handles()).toHaveLength(3 + 4 + 2);
    expect(handle(1, 2)?.getAttribute("cx")).toBe("140");
    expect(handle(1, 2)?.getAttribute("cy")).toBe("60");
    expect(handle(2, 1)?.getAttribute("cx")).toBe("55");
  });

  it("puts none on a shape that is not selected", () => {
    layer([triangle, square], [1]);

    expect(handle(0, 0)).toBeNull();
    expect(handle(1, 0)).not.toBeNull();
  });

  it("passes over a selected mask without a word, as legacy does", () => {
    const { onNotice } = layer([mask, triangle], [0, 1]);

    expect(handles()).toHaveLength(3);
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("gives a polygon over the limit none, says so in legacy's words, and keeps the others", () => {
    const { onNotice } = layer([big, triangle], [0, 1]);

    expect(handle(0, 0)).toBeNull();
    expect(handle(1, 0)).not.toBeNull();
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith(
      "Polygon has 201 vertices (max 200 for editing). Use lower resolution setting when creating polygons.",
    );
  });

  it("says it once, not again on every render while the polygon stays selected", () => {
    const { onNotice, rerender } = layer([big, triangle], [0, 1]);
    rerender([big, triangle], [0, 1]);
    rerender([big, { ...triangle }], [0, 1]);

    expect(onNotice).toHaveBeenCalledTimes(1);
  });

  it("says it again when the polygon is selected again", () => {
    const { onNotice, rerender } = layer([big, triangle], [0, 1]);
    rerender([big, triangle], [1]);
    rerender([big, triangle], [0, 1]);

    expect(onNotice).toHaveBeenCalledTimes(2);
  });
});

describe("what a handle looks like", () => {
  it("is legacy's: cyan at alpha 180, with no outline", () => {
    // editable_vertex.py:16-20. It was a hollow ring in the class colour.
    layer([triangle], [0]);

    expect(HANDLE_FILL).toBe(`rgba(0, 255, 255, ${180 / 255})`);
    expect(handle(0, 0)?.getAttribute("fill")).toBe(HANDLE_FILL);
    expect(handle(0, 0)?.getAttribute("stroke")).toBe("none");
  });

  it("is point_radius x annotation_size_multiplier IMAGE pixels, as legacy's scene item is", async () => {
    // `mw.point_radius` (main_window.py:516-523): 0.3 by default, 0.3 x 4.7 at the owner's size.
    layer([triangle], [0], { point_radius: 0.3, annotation_size_multiplier: 4.7 });

    // Awaited: the settings arrive from the client, so the first paint is still the defaults.
    await waitFor(() => expect(Number(handle(0, 0)?.getAttribute("rx"))).toBeCloseTo(1.41, 10));
    expect(Number(handle(0, 0)?.getAttribute("ry"))).toBeCloseTo(1.41, 10);
  });

  it("grows with the zoom, because its size is in image pixels, not screen pixels", () => {
    // A Qt scene item scales with the view. Shown at a quarter of its size, the image keeps the
    // same handle radius in image units -- a quarter the size on screen -- where a screen-sized
    // handle would have been four times larger in image units.
    layer([triangle], [0]);
    const atOwnSize = Number(handle(0, 0)?.getAttribute("rx"));
    cleanup();

    showAt({ ...RECT, width: 50, height: 25, right: 50, bottom: 25 });
    layer([triangle], [0]);

    expect(Number(handle(0, 0)?.getAttribute("rx"))).toBe(atOwnSize);
    expect(atOwnSize).toBeCloseTo(0.3, 10);
  });

  it("takes a press on the whole disc", () => {
    layer([triangle], [0]);

    expect(handle(0, 0)?.getAttribute("pointer-events")).toBe("all");
  });

  it("shows legacy's Edit cursor, the four-way move arrow", () => {
    // mode_manager.py:138, SizeAllCursor, over the handles as well: they set no cursor of their own.
    const { surface } = layer([triangle], [0]);

    expect(surface.style.cursor).toBe("move");
  });
});

describe("dragging a vertex", () => {
  it("moves the shape LIVE, as legacy writes each position into the segment", () => {
    const { onPreview, onCommit, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerMove(surface, point(80, 30));

    expect(shapeIn(onPreview.mock.calls.at(-1)?.[0], 0)?.vertices).toEqual([[10, 10], [80, 30], [50, 50]]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("records the drag ONCE, at release, with the shape as it was before it", () => {
    // A drag delivers dozens of pointer events. Recording each would fill the undo stack with a
    // replay of one gesture; legacy records one move on release (editable_vertex.py:50-61).
    const { onCommit, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    for (let x = 52; x <= 80; x += 2) fireEvent.pointerMove(surface, point(x, 10));
    fireEvent.pointerUp(surface, point(80, 10));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [before, after, label] = onCommit.mock.calls[0]!;
    expect(shapeIn(before, 0)).toBe(triangle);
    expect(shapeIn(after, 0)?.vertices).toEqual([[10, 10], [80, 10], [50, 50]]);
    expect(label).toBe(MOVE_VERTEX);
  });

  it("moves the vertex that was grabbed, of the shape it belongs to", () => {
    const { onCommit, surface } = layer([triangle, square], [0, 1]);

    fireEvent.pointerDown(handle(1, 2)!, point(140, 60));
    fireEvent.pointerUp(surface, point(150, 70));

    const [before, after] = onCommit.mock.calls[0]!;
    expect([...(after as ReadonlyMap<number, WireSegment>).keys()]).toEqual([1]);
    expect(shapeIn(before, 1)).toBe(square);
    expect(shapeIn(after, 1)?.vertices).toEqual([[100, 20], [140, 20], [150, 70], [100, 60]]);
  });

  it("keeps the grab offset, as a Qt movable item does, rather than jumping to the pointer", () => {
    // Pressed two pixels right of the vertex and moved ten right: the vertex moves ten, to 60.
    const { onCommit, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(52, 10));
    fireEvent.pointerUp(surface, point(62, 10));

    expect(shapeIn(onCommit.mock.calls[0]?.[1], 0)?.vertices).toEqual([[10, 10], [60, 10], [50, 50]]);
  });

  it("records NOTHING for a click on a handle that moved nothing", () => {
    // Legacy records only if the handle moved (editable_vertex.py:52). This one recorded every
    // click, and undo then appeared to do nothing.
    const { onCommit, onPreview, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerUp(surface, point(50, 10));

    expect(onCommit).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("puts the shape back exactly, and records nothing, for a drag that returns to its start", () => {
    const { onCommit, onPreview, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerMove(surface, point(70, 10));
    fireEvent.pointerUp(surface, point(50, 10));

    expect(onCommit).not.toHaveBeenCalled();
    expect(shapeIn(onPreview.mock.calls.at(-1)?.[0], 0)).toBe(triangle);
  });

  it("does not clamp to the image, as legacy does not", () => {
    const { onCommit, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 0)!, point(10, 10));
    fireEvent.pointerUp(surface, point(-15, 120));

    expect(shapeIn(onCommit.mock.calls[0]?.[1], 0)?.vertices?.[0]).toEqual([-15, 120]);
  });

  it("uses the RELEASE position, so a drag with no move in between still lands", () => {
    const { onCommit, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerUp(surface, point(80, 30));

    expect(shapeIn(onCommit.mock.calls[0]?.[1], 0)?.vertices).toEqual([[10, 10], [80, 30], [50, 50]]);
  });

  it("is not also a drag of the whole selection", () => {
    const { onCommit, surface } = layer([triangle, square], [0, 1]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerUp(surface, point(60, 10));

    expect([...(onCommit.mock.calls[0]?.[1] as ReadonlyMap<number, WireSegment>).keys()]).toEqual([0]);
  });
});

describe("dragging a circle handle", () => {
  it("does NOT compound the translation across pointer events", () => {
    // The bug a chained implementation has: applying each move to the PREVIOUS result shifts the
    // circle again by the full offset every event.
    const { onCommit, surface } = layer([circle], [0]);

    fireEvent.pointerDown(handle(0, 0)!, point(50, 50));
    fireEvent.pointerMove(surface, point(60, 50));
    fireEvent.pointerMove(surface, point(70, 50));
    fireEvent.pointerUp(surface, point(70, 50));

    // Centre at 70, radius point 5 to its right. Not 90, which is where chaining would put it.
    expect(shapeIn(onCommit.mock.calls[0]?.[1], 0)?.vertices).toEqual([[70, 50], [75, 50]]);
  });

  it("resizes when the radius handle is dragged", () => {
    const { onCommit, surface } = layer([circle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(55, 50));
    fireEvent.pointerUp(surface, point(50, 70));

    // Close rather than equal: the move is the pointer's offset from the press, and 55/200*200 is
    // not exactly 55 in floating point.
    const [centre, rim] = shapeIn(onCommit.mock.calls[0]?.[1], 0)!.vertices!;
    expect(centre).toEqual([50, 50]);
    expect(rim![0]).toBeCloseTo(50, 10);
    expect(rim![1]).toBeCloseTo(70, 10);
  });
});

describe("dragging the whole selection", () => {
  it("moves every selected polygon and circle by the drag, as legacy's Edit mode does", () => {
    // single_view_mouse_handler.py:81-97, 183-197: a press on the image that misses the handles.
    const { onPreview, onCommit, surface } = layer([triangle, mask, circle, square], [0, 1, 2]);

    fireEvent.pointerDown(surface, point(120, 80));
    fireEvent.pointerMove(surface, point(125, 82));
    expect(shapeIn(onPreview.mock.calls.at(-1)?.[0], 0)?.vertices?.[0]).toEqual([15, 12]);

    fireEvent.pointerUp(surface, point(130, 85));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [before, after, label] = onCommit.mock.calls[0]!;
    expect([...(after as ReadonlyMap<number, WireSegment>).keys()]).toEqual([0, 2]);
    expect(shapeIn(before, 0)).toBe(triangle);
    expect(shapeIn(after, 0)?.vertices).toEqual([[20, 15], [60, 15], [60, 55]]);
    expect(shapeIn(after, 2)?.vertices).toEqual([[60, 55], [65, 55]]);
    expect(label).toBe(MOVE_SHAPES);
  });

  it("takes a polygon too big for handles along with the rest", () => {
    const { onCommit, surface } = layer([big, triangle], [0, 1]);

    fireEvent.pointerDown(surface, point(150, 40));
    fireEvent.pointerUp(surface, point(150, 45));

    expect([...(onCommit.mock.calls[0]?.[1] as ReadonlyMap<number, WireSegment>).keys()]).toEqual([0, 1]);
  });

  it("does nothing with nothing movable selected", () => {
    const { onPreview, onCommit, surface } = layer([triangle, mask], [1]);

    fireEvent.pointerDown(surface, point(120, 80));
    fireEvent.pointerMove(surface, point(130, 90));
    fireEvent.pointerUp(surface, point(130, 90));

    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("starts only on the picture, as legacy's does", () => {
    const { onCommit, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(surface, point(205, 40));
    fireEvent.pointerUp(surface, point(150, 40));

    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("the handle last pressed", () => {
  const mark = () => screen.queryByTestId("handle-selected");

  it("carries Qt's selection mark, a dashed square on the handle, as legacy's selectable items do", () => {
    const { surface } = layer([triangle], [0]);
    expect(mark()).toBeNull();

    fireEvent.pointerDown(handle(0, 2)!, point(50, 50));
    fireEvent.pointerUp(surface, point(50, 50));

    const rects = mark()!.querySelectorAll("rect");
    expect(rects).toHaveLength(2);
    expect(Number(rects[1]!.getAttribute("x"))).toBeCloseTo(50 - 0.3, 10);
    expect(rects[1]!.getAttribute("stroke-dasharray")).not.toBeNull();
  });

  it("keeps it once the vertex has been dragged, on the shape as it now stands", () => {
    const { onCommit, surface, rerender } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerUp(surface, point(70, 10));
    rerender([shapeIn(onCommit.mock.calls[0]?.[1], 0)!]);

    expect(mark()).not.toBeNull();
  });

  it("loses it when the shape is replaced from outside -- an undo, say", () => {
    const { onCommit, surface, rerender } = layer([triangle], [0]);
    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerUp(surface, point(70, 10));
    rerender([shapeIn(onCommit.mock.calls[0]?.[1], 0)!]);

    rerender([triangle]);

    expect(mark()).toBeNull();
  });

  it("loses it when the whole selection is dragged, as legacy lays the handles down again", () => {
    const { surface } = layer([triangle], [0]);
    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerUp(surface, point(50, 10));

    fireEvent.pointerDown(surface, point(120, 80));
    fireEvent.pointerMove(surface, point(125, 80));

    expect(mark()).toBeNull();
  });
});

describe("abandoning a drag", () => {
  it("puts the shapes back and records nothing on Escape", () => {
    const { onPreview, onCommit, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerMove(surface, point(80, 30));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerUp(surface, point(80, 30));

    expect(shapeIn(onPreview.mock.calls.at(-1)?.[0], 0)).toBe(triangle);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("puts them back when the layer goes away mid-drag -- another tool, another image", () => {
    const { onPreview, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerMove(surface, point(80, 30));
    cleanup();

    expect(shapeIn(onPreview.mock.calls.at(-1)?.[0], 0)).toBe(triangle);
  });

  it("gives way to a change made by something else mid-drag, writing nothing over it", () => {
    // An undo or a delete under a held pointer. Writing the drag back would overwrite the undo --
    // or, after a delete, whatever shape now has that position.
    const { onPreview, onCommit, surface, rerender } = layer([triangle, square], [0, 1]);

    fireEvent.pointerDown(handle(0, 1)!, point(50, 10));
    fireEvent.pointerMove(surface, point(60, 10));
    rerender([square], [0]);
    fireEvent.pointerMove(surface, point(70, 10));
    fireEvent.pointerUp(surface, point(70, 10));

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ignores a release that never had a press", () => {
    const { onCommit, surface } = layer([triangle], [0]);
    fireEvent.pointerUp(surface, point(80, 30));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ignores a right-click, on a handle or off one", () => {
    const { onCommit, surface } = layer([triangle], [0]);

    fireEvent.pointerDown(handle(0, 1)!, { ...point(50, 10), button: 2 });
    fireEvent.pointerUp(surface, point(80, 30));
    fireEvent.pointerDown(surface, { ...point(120, 80), button: 2 });
    fireEvent.pointerUp(surface, point(130, 90));

    expect(onCommit).not.toHaveBeenCalled();
  });
});
