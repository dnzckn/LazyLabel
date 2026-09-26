/**
 * C4, editing by hand: legacy's Edit mode, through the whole shell (`CONTROL_PARITY.md` CP-16).
 *
 * Select shapes in the segment table, press Edit, drag. What legacy does, and this app did not:
 *   - every selected polygon and circle gets handles, not only a lone one
 *     (edit_mode_manager.py:94-135);
 *   - a drag moves the vertex it grabbed, of the shape that vertex belongs to;
 *   - a press anywhere else on the picture drags the whole selection
 *     (single_view_mouse_handler.py:81-97, 183-197);
 *   - each drag is one undo step, however many pointer events it took;
 *   - a polygon over 200 vertices has no handles and a warning, while the others keep theirs;
 *   - with nothing editable selected, Edit refuses in legacy's words and the mode stays as it was
 *     (mode_manager.py:55-112).
 */

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult } from "../../src/api/client.js";
import { chooseTool, drawTriangle, lastSave, openImage, selectBoxes, writeButton } from "./harness.jsx";

afterEach(cleanup);

const surface = () => screen.getByLabelText("Edit tool");
const handle = (shape: number, vertex: number) => screen.queryByTestId(`handle-${shape}-${vertex}`);
const at = (element: Element | null) => [Number(element?.getAttribute("cx")), Number(element?.getAttribute("cy"))];
const undoButton = () => screen.getByRole("button", { name: /^Undo/ });
const point = (x: number, y: number) => ({ button: 0, pointerId: 1, clientX: x, clientY: y });

/** Two triangles, both selected in the segment table, in Edit mode. */
async function twoSelectedInEdit() {
  const handles = await openImage();
  chooseTool("Poly (2)");
  drawTriangle(10, 10);
  drawTriangle(100, 10);
  await waitFor(() => expect(selectBoxes()).toHaveLength(2));
  for (const box of selectBoxes()) fireEvent.click(box);
  chooseTool("Edit (R)");
  await waitFor(() => expect(surface()).toBeTruthy());
  return handles;
}

/** Drag a handle from where it is, the way a hand does. */
function dragHandle(shape: number, vertex: number, path: readonly (readonly [number, number])[]) {
  const [x, y] = at(handle(shape, vertex));
  fireEvent.pointerDown(handle(shape, vertex)!, point(x!, y!));
  for (const [px, py] of path) fireEvent.pointerMove(surface(), point(px, py));
  const [ex, ey] = path[path.length - 1]!;
  fireEvent.pointerUp(surface(), point(ex, ey));
}

function loaded(segments: readonly WireSegment[]): AnnotationsResult {
  return {
    kind: "loaded",
    annotations: {
      sourceFormat: "NPZ",
      sourceFile: "frames/a.npz",
      revision: "r0",
      segments,
      classAliases: {},
      rejected: 0,
      failures: [],
    },
  };
}

describe("C4: Edit mode, as legacy's", () => {
  it("puts handles on EVERY selected shape, not only when one is selected", async () => {
    await twoSelectedInEdit();

    // Three vertices each. The view mounted the editor only for exactly one selected shape.
    expect(at(handle(0, 1))).toEqual([50, 10]);
    expect(at(handle(1, 1))).toEqual([140, 10]);
    expect(screen.queryAllByTestId(/^handle-\d+-\d+$/)).toHaveLength(6);
  });

  it("drags the vertex it grabbed, of the shape it belongs to, and nothing else", async () => {
    const { saveAnnotations } = await twoSelectedInEdit();

    dragHandle(1, 2, [[145, 45], [150, 50]]);

    await waitFor(() => expect(at(handle(1, 2))).toEqual([150, 50]));
    expect(at(handle(0, 2))).toEqual([50, 40]);

    fireEvent.click(writeButton());
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    const written = lastSave(saveAnnotations)["segments"] as readonly WireSegment[];
    expect(written[0]?.vertices).toEqual([[10, 10], [50, 10], [50, 40]]);
    expect(written[1]?.vertices).toEqual([[100, 10], [140, 10], [150, 50]]);
  });

  it("records ONE undo step per drag, however many moves it took", async () => {
    await twoSelectedInEdit();

    dragHandle(0, 0, [[12, 12], [14, 14], [16, 16], [18, 18], [20, 20]]);
    await waitFor(() => expect(undoButton().textContent).toBe("Undo: Move vertex"));

    fireEvent.click(undoButton());

    // The whole drag back in one press, and the step before it is the drawing.
    await waitFor(() => expect(at(handle(0, 0))).toEqual([10, 10]));
    expect(undoButton().textContent).toBe("Undo: Add polygon");
  });

  it("drags the whole selection from anywhere else on the picture, as one undo step", async () => {
    await twoSelectedInEdit();

    fireEvent.pointerDown(surface(), point(150, 80));
    fireEvent.pointerMove(surface(), point(155, 82));
    fireEvent.pointerUp(surface(), point(160, 85));

    await waitFor(() => expect(at(handle(0, 0))).toEqual([20, 15]));
    expect(at(handle(1, 0))).toEqual([110, 15]);
    expect(undoButton().textContent).toBe("Undo: Move polygon");

    fireEvent.click(undoButton());

    await waitFor(() => expect(at(handle(0, 0))).toEqual([10, 10]));
    expect(at(handle(1, 0))).toEqual([100, 10]);
  });

  it("keeps the selection after a drag, so the next drag moves the same shapes", async () => {
    await twoSelectedInEdit();

    fireEvent.pointerDown(surface(), point(150, 80));
    fireEvent.pointerUp(surface(), point(152, 80));

    await waitFor(() => expect(at(handle(1, 0))).toEqual([102, 10]));
    expect(selectBoxes().every((box) => (box as HTMLInputElement).checked)).toBe(true);
  });

  it("gives a polygon over the limit no handles and legacy's warning, and keeps the others'", async () => {
    const big: WireSegment = {
      type: "Polygon",
      classId: 0,
      vertices: Array.from({ length: 201 }, (_, i) => [i % 200, 90] as const),
    };
    const small: WireSegment = { type: "Polygon", classId: 1, vertices: [[10, 10], [40, 10], [40, 40]] };
    await openImage(loaded([big, small]));
    await waitFor(() => expect(selectBoxes()).toHaveLength(2));
    chooseTool("Poly (2)");
    for (const box of selectBoxes()) fireEvent.click(box);

    chooseTool("Edit (R)");

    expect(
      await screen.findByText(
        "Polygon has 201 vertices (max 200 for editing). Use lower resolution setting when creating polygons.",
      ),
    ).toBeTruthy();
    expect(handle(0, 0)).toBeNull();
    expect(at(handle(1, 2))).toEqual([40, 40]);
  });

  it("refuses Edit with only a mask selected, in legacy's words, and stays in the mode it was in", async () => {
    await openImage(loaded([{ type: "AI", classId: 0 }]));
    await waitFor(() => expect(selectBoxes()).toHaveLength(1));
    fireEvent.click(selectBoxes()[0]!);
    chooseTool("Poly (2)");

    chooseTool("Edit (R)");

    expect(await screen.findByText("No editable shapes selected!")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Poly (2)" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText("Polygon tool")).toBeTruthy();
  });
});
