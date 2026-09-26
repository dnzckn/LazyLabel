/**
 * RULE-046 and RULE-069: what can be edited, and what dragging a handle means.
 *
 * The card's worked example is the anchor: an AI mask and a 350-vertex polygon selected, press R,
 * and edit mode opens with no handles and a message; with only the AI mask selected it refuses.

 *
 * Names RULE-061 so the rule is traceable to the test that proves it: a rule named in
 * NO test cannot be audited, because "covered by a test that does not say so" and "not
 * covered" look identical to a reviewer. Undoing a circle centre drag changes its radius.
 */

import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import {
  MAX_EDITABLE_VERTICES,
  editSelection,
  enterEditMode,
  handlesFor,
  isEditableType,
  moveVertex,
  translateSegment,
} from "../../src/tools/edit.js";

const polygon = (count: number): WireSegment => ({
  type: "Polygon",
  classId: 0,
  vertices: Array.from({ length: count }, (_, i) => [i, i] as const),
});

const circle: WireSegment = { type: "Circle", classId: 0, vertices: [[50, 50], [55, 50]] };
const aiMask: WireSegment = { type: "AI", classId: 0 };
const loaded: WireSegment = { type: "Loaded", classId: 0, vertices: [[1, 1], [5, 1], [5, 5]] };

describe("what can be edited", () => {
  it("accepts the two types stored as vertices", () => {
    expect(isEditableType(polygon(3))).toBe(true);
    expect(isEditableType(circle)).toBe(true);
  });

  it("refuses a mask, which has nothing to drag", () => {
    expect(isEditableType(aiMask)).toBe(false);
  });

  it("refuses a LOADED polygon even though it has vertices", () => {
    // The trap. A polygon read back from YOLO-seg or COCO looks identical on screen to one the
    // user drew -- same outline, same class, same colour -- but the reader rasterized it on the
    // way in, so its vertices are derived rather than authoritative. Offering handles would let a
    // user drag points that are discarded on save.
    expect(isEditableType(loaded)).toBe(false);
  });
});

describe("entering edit mode", () => {
  it("opens when at least one selected shape is editable", () => {
    // The card's case: an AI mask and a big polygon. The mode opens; the handles are a separate
    // question, which is what keeps the other selected shapes editable.
    const outcome = enterEditMode([aiMask, polygon(350)], [0, 1]);

    expect(outcome.kind).toBe("enter");
    if (outcome.kind !== "enter") throw new Error("expected it to open");
    expect(outcome.editable).toEqual([1]);
  });

  it("refuses in legacy's own words when nothing selected can be edited", () => {
    // That message is the only thing distinguishing "the hotkey is not bound" from "this shape
    // cannot be edited", and a user whose selection is a mask will otherwise press R repeatedly.
    const outcome = enterEditMode([aiMask], [0]);

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") throw new Error("expected a refusal");
    expect(outcome.reason).toBe("No editable shapes selected!");
  });

  it("refuses an empty selection", () => {
    expect(enterEditMode([polygon(3)], []).kind).toBe("refused");
  });

  it("ignores a selected index that is not there", () => {
    // A stale selection after an undo removed a segment. Indexing past the end must not throw.
    expect(enterEditMode([polygon(3)], [0, 99]).kind).toBe("enter");
  });
});

describe("handles", () => {
  it("shows one per vertex", () => {
    const outcome = handlesFor(polygon(4));

    if (outcome.kind !== "handles") throw new Error("expected handles");
    expect(outcome.vertices).toHaveLength(4);
    expect(outcome.vertices[0]).toEqual({ x: 0, y: 0 });
  });

  it("shows none above the limit, and says why in legacy's words, both sentences", () => {
    // edit_mode_manager.py:112-117. The second sentence is the advice, and it was missing here.
    const outcome = handlesFor(polygon(350));

    expect(outcome.kind).toBe("too-many");
    if (outcome.kind !== "too-many") throw new Error("expected too many");
    expect(outcome.reason).toBe(
      "Polygon has 350 vertices (max 200 for editing). "
        + "Use lower resolution setting when creating polygons.",
    );
  });

  it("shows them at exactly the limit", () => {
    // The limit is a maximum, not a threshold to be under.
    expect(handlesFor(polygon(MAX_EDITABLE_VERTICES)).kind).toBe("handles");
    expect(handlesFor(polygon(MAX_EDITABLE_VERTICES + 1)).kind).toBe("too-many");
  });

  it("shows a circle's two handles regardless of the limit", () => {
    // The limit exists to stop hundreds of overlapping hit targets on one outline. A circle has
    // two, so it can never be the problem the limit is for.
    const outcome = handlesFor(circle);

    if (outcome.kind !== "handles") throw new Error("expected handles");
    expect(outcome.vertices).toEqual([{ x: 50, y: 50 }, { x: 55, y: 50 }]);
  });

  it("passes over a mask without a word, as legacy's handles do", () => {
    // A selected mask in Edit mode simply has no handles (edit_mode_manager.py:108). The one thing
    // legacy says about masks is the refusal to ENTER the mode when nothing else is selected.
    expect(handlesFor(aiMask)).toEqual({ kind: "none" });
    expect(handlesFor(loaded)).toEqual({ kind: "none" });
  });
});

describe("a selection in Edit mode", () => {
  const triangle = (at: number): WireSegment => ({
    type: "Polygon",
    classId: 0,
    vertices: [[at, at], [at + 10, at], [at + 10, at + 10]],
  });

  it("gives EVERY selected polygon and circle its handles, not only a lone one", () => {
    // CP-16. Legacy walks every selected row (edit_mode_manager.py:105-135); this app offered
    // handles only when exactly one shape was selected.
    const selection = editSelection([triangle(0), circle, triangle(50)], [2, 0, 1]);

    expect(selection.handles.map((shape) => shape.index)).toEqual([0, 1, 2]);
    expect(selection.handles[2]?.vertices[1]).toEqual({ x: 60, y: 50 });
    expect(selection.warnings).toEqual([]);
  });

  it("lays them down lowest position first, whatever order they were clicked in", () => {
    // Legacy reads the selected ROWS, which run in segment order (right_panel.py:351-359) -- and
    // the handle added last is the one on top where two overlap.
    const selection = editSelection([triangle(0), triangle(5), triangle(9)], [2, 0, 2]);

    expect(selection.handles.map((shape) => shape.index)).toEqual([0, 2]);
  });

  it("applies the limit to each polygon on its own", () => {
    // The card's example: the big polygon gets no handles and a warning, and the small one next to
    // it keeps its own. The big one still moves with the selection.
    const selection = editSelection([polygon(350), triangle(0), aiMask], [0, 1, 2]);

    expect(selection.handles.map((shape) => shape.index)).toEqual([1]);
    expect(selection.warnings).toEqual([
      "Polygon has 350 vertices (max 200 for editing). "
        + "Use lower resolution setting when creating polygons.",
    ]);
    expect(selection.movable).toEqual([0, 1]);
  });

  it("neither shows handles for a mask nor moves it", () => {
    // single_view_mouse_handler.py:93-94: a drag of the selection takes Polygons and Circles only.
    const selection = editSelection([aiMask, loaded], [0, 1]);

    expect(selection).toEqual({ handles: [], warnings: [], movable: [] });
  });

  it("ignores a selected position that is not there", () => {
    expect(editSelection([triangle(0)], [0, 7]).handles.map((shape) => shape.index)).toEqual([0]);
  });
});

describe("moving a whole shape", () => {
  it("moves every vertex by the offset", () => {
    expect(translateSegment(polygon(3), 10, -1).vertices).toEqual([[10, -1], [11, 0], [12, 1]]);
  });

  it("moves a circle without resizing it", () => {
    expect(translateSegment(circle, 5, 5).vertices).toEqual([[55, 55], [60, 55]]);
  });

  it("does not clamp to the image", () => {
    // Legacy lets the selection be dragged past the edge; saving keeps only what falls inside.
    expect(translateSegment(polygon(1), -40, -40).vertices).toEqual([[-40, -40]]);
  });

  it("hands back the same shape for no offset, so nothing is recorded", () => {
    const original = polygon(3);
    expect(translateSegment(original, 0, 0)).toBe(original);
  });
});

describe("moving a polygon vertex", () => {
  it("moves only the one dragged", () => {
    const moved = moveVertex(polygon(3), 1, { x: 90, y: 80 });

    expect(moved.vertices).toEqual([[0, 0], [90, 80], [2, 2]]);
  });

  it("leaves the original alone", () => {
    const original = polygon(3);
    moveVertex(original, 1, { x: 90, y: 80 });

    expect(original.vertices?.[1]).toEqual([1, 1]);
  });

  it("ignores an index that is not there", () => {
    const original = polygon(3);
    expect(moveVertex(original, 9, { x: 1, y: 1 })).toBe(original);
    expect(moveVertex(original, -1, { x: 1, y: 1 })).toBe(original);
  });
});

describe("moving a circle handle", () => {
  it("TRANSLATES the circle when the centre is dragged", () => {
    // The radius point comes along by the same offset. Treating the two as independent points --
    // which a shared polygon path would -- turns dragging the centre into a resize as a side effect.
    const moved = moveVertex(circle, 0, { x: 60, y: 70 });

    expect(moved.vertices).toEqual([[60, 70], [65, 70]]);
  });

  it("keeps the radius unchanged when the centre moves", () => {
    const moved = moveVertex(circle, 0, { x: -30, y: 12 });
    const [centre, edge] = moved.vertices as [readonly [number, number], readonly [number, number]];

    expect(Math.hypot(edge[0] - centre[0], edge[1] - centre[1])).toBeCloseTo(5, 10);
  });

  it("RESIZES when the radius point is dragged, leaving the centre alone", () => {
    const moved = moveVertex(circle, 1, { x: 50, y: 70 });

    expect(moved.vertices).toEqual([[50, 50], [50, 70]]);
  });

  it("does NOT re-normalize the radius point back to 3 o'clock", () => {
    // Looks like a bug and is not. A drawn circle stores 3 o'clock; an edited one stores wherever
    // the handle was dragged. The radius is the distance either way, so it rasterizes identically
    // -- and re-normalizing would make the handle jump out from under the cursor mid-drag.
    const moved = moveVertex(circle, 1, { x: 50, y: 70 });

    expect(moved.vertices?.[1]).toEqual([50, 70]);
  });

  it("ignores a third handle on a circle, which should not exist", () => {
    const malformed: WireSegment = { type: "Circle", classId: 0, vertices: [[0, 0], [5, 0], [9, 9]] };
    expect(moveVertex(malformed, 2, { x: 1, y: 1 })).toBe(malformed);
  });

  it("leaves a circle with too few vertices alone rather than throwing", () => {
    // A file can hold anything, and a reader that crashes takes the whole image with it.
    const malformed: WireSegment = { type: "Circle", classId: 0, vertices: [[0, 0]] };
    expect(moveVertex(malformed, 0, { x: 1, y: 1 })).toBe(malformed);
  });
});
