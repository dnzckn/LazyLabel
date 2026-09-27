/**
 * The class table, worked as legacy's is: a click on a row makes its class active, a double-click on
 * a name edits it, and a row is dragged to reorder (right_panel.py:172-251,
 * reorderable_class_table.py).
 *
 * What makes the order more than a list is Reassign Class IDs: RULE-013 renumbers 0..N-1 in the
 * order shown, and class ids are an NPZ's channel order and a COCO file's category ids. A drag alone
 * changes nothing that is saved, in legacy either, so the tests check both halves: the drag moves
 * the row and nothing else, and Reassign is what renumbers.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { ClassTable } from "../../src/workspace/ClassTable.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const imageRow = (key: string): WireDatasetImage => ({
  key,
  name: key,
  sidecars: {},
  annotated: true,
  sharesSidecarsWith: [],
});

const of = (...ids: number[]): WireSegment[] =>
  ids.map((classId) => ({ type: "Polygon", classId, vertices: [[0, 0], [1, 0], [1, 1]] }) as WireSegment);

function Probe(): React.ReactNode {
  const { openImage, open, segments, classAliases, history, activeClassId } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(imageRow("a.png"))}>open</button>
      <button type="button" onClick={() => openImage(imageRow("b.png"))}>open another</button>
      <button type="button" onClick={() => history.undo()}>undo</button>
      <p data-testid="image">{open?.image.key ?? ""}</p>
      <p data-testid="classes">{segments.map((s) => s.classId).join(",")}</p>
      <p data-testid="aliases">{JSON.stringify(classAliases)}</p>
      <p data-testid="active">{String(activeClassId)}</p>
    </>
  );
}

/** Every image this test opens holds the same annotations. */
async function mount(segments: readonly WireSegment[], aliases: Record<string, string> = {}) {
  const api = {
    imageMetadata: async () => ({ width: 10, height: 10, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> =>
      ({
        kind: "loaded",
        annotations: {
          segments,
          classAliases: aliases,
          failures: [],
          rejected: 0,
          sourceFile: "a.npz",
          sourceFormat: "NPZ",
        },
      }) as unknown as AnnotationsResult,
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <NotificationHost />
      <WorkspaceProvider client={api} projectId="p1">
        <Probe />
        {/* The right-hand pane the table sits in. */}
        <div data-testid="pane">
          <ClassTable />
        </div>
      </WorkspaceProvider>
    </NotificationProvider>,
  );

  fireEvent.click(screen.getByText("open"));
  await waitFor(() =>
    expect(screen.getByTestId("classes").textContent).toBe(segments.map((s) => s.classId).join(",")),
  );
}

const shown = (id: string) => screen.getByTestId(id).textContent;
const idButton = (classId: number) =>
  screen.getByRole("button", { name: `Draw new annotations as class ${classId}` });
const rowOf = (classId: number) => idButton(classId).closest("tr") as HTMLTableRowElement;
/** The row's Alias cell. The Class ID cell is a row header, so this is the row's only plain cell. */
const nameCell = (classId: number) => within(rowOf(classId)).getByRole("cell");
const editor = (classId: number) =>
  screen.getByRole("textbox", { name: `Name for class ${classId}` }) as HTMLInputElement;
/** The classes, in the order the table lists them. */
const order = () =>
  screen.getAllByRole("button", { name: /^Draw new annotations as class / }).map((button) => Number(button.textContent));
const reassign = () => screen.getByRole("button", { name: "Reassign Class IDs" }) as HTMLButtonElement;

/* jsdom lays nothing out, so the rows are given the places a browser would give them: 20px each,
   from the top of the viewport, in a table 200px wide that ends under the last one. The pane, when
   a test names it, is given its own box. */
const ROW = 20;

function layOut(pane?: { readonly element: HTMLElement; readonly top: number; readonly bottom: number }): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    let top = 0;
    let height = 0;
    if (this instanceof HTMLTableRowElement && this.parentElement?.tagName === "TBODY") {
      top = this.sectionRowIndex * ROW;
      height = ROW;
    } else if (this instanceof HTMLTableElement) {
      height = (this.tBodies[0]?.rows.length ?? 0) * ROW;
    } else if (pane !== undefined && this === pane.element) {
      top = pane.top;
      height = pane.bottom - pane.top;
    }
    return { top, height, bottom: top + height, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
}

/* A mouse drag as a browser sends it: a press on the row, moves with the button held, a release. */
function press(classId: number): void {
  const y = rowOf(classId).sectionRowIndex * ROW + ROW / 2;
  fireEvent.pointerDown(rowOf(classId), { button: 0, buttons: 1, clientX: 50, clientY: y });
}

function moveTo(y: number, x = 50): void {
  fireEvent.pointerMove(document.body, { buttons: 1, clientX: x, clientY: y });
}

function releaseAt(y: number, x = 50): void {
  fireEvent.pointerUp(document.body, { button: 0, buttons: 0, clientX: x, clientY: y });
}

function drag(classId: number, y: number): void {
  press(classId);
  moveTo(y);
  releaseAt(y);
}

const LEGACY_TABLE_TOOLTIP =
  "Double-click to set class aliases and drag to reorder channels for saving.\n"
  + "Click once to toggle as active class for new segments.";

describe("the table legacy shows (right_panel.py:172-201)", () => {
  it("is the label, the two columns and Reassign Class IDs, even before there are classes", async () => {
    await mount([]);

    const pane = screen.getByTestId("pane");
    expect(within(pane).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Alias",
      "Class ID",
    ]);
    // Nothing else: no paragraph saying the image has no classes.
    expect(pane.textContent).toBe("Class Order:AliasClass IDReassign Class IDs");
    expect(reassign().disabled).toBe(true);
  });

  it("says nothing more than legacy's does once it has classes: no paragraphs of explanation", async () => {
    await mount(of(3, 7), { "3": "car" });

    expect(screen.getByTestId("pane").textContent).toBe("Class Order:AliasClass IDcar377Reassign Class IDs");
  });

  it("explains itself in legacy's own tooltips instead", async () => {
    await mount(of(0));

    expect(screen.getByRole("table").getAttribute("title")).toBe(LEGACY_TABLE_TOOLTIP);
    expect(reassign().getAttribute("title")).toBe("Re-index class channels based on the current order in this table");
  });

  it("lists each class once, however many annotations use it", async () => {
    await mount(of(2, 2, 5));

    expect(order()).toEqual([2, 5]);
  });

  it("shows an unnamed class's id in the Alias column, as legacy does", async () => {
    await mount(of(3, 7), { "7": "car" });

    expect(nameCell(3).textContent).toBe("3");
    expect(nameCell(7).textContent).toBe("car");
  });

  it("has no arrow buttons: a row is dragged", async () => {
    await mount(of(2, 5));

    expect(screen.queryByRole("button", { name: /Move class/ })).toBeNull();
    expect(screen.queryByText(/[↑↓]/)).toBeNull();
  });
});

describe("naming a class: a double-click on the name, as legacy's EditTrigger.DoubleClicked", () => {
  it("shows the name as text until it is double-clicked, then edits it with the name selected", async () => {
    await mount(of(3), { "3": "car" });
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.doubleClick(nameCell(3));

    const field = editor(3);
    expect(field.value).toBe("car");
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
  });

  it("stores the name on Enter and closes the editor, leaving the keyboard on the row", async () => {
    await mount(of(3), { "3": "car" });
    fireEvent.doubleClick(nameCell(3));

    fireEvent.change(editor(3), { target: { value: "lorry" } });
    fireEvent.keyDown(editor(3), { key: "Enter" });

    await waitFor(() => expect(shown("aliases")).toBe('{"3":"lorry"}'));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(nameCell(3).textContent).toBe("lorry");
    expect(document.activeElement).toBe(idButton(3));
  });

  it("stores the name when the editor loses focus", async () => {
    await mount(of(3));
    fireEvent.doubleClick(nameCell(3));

    fireEvent.change(editor(3), { target: { value: "car" } });
    fireEvent.blur(editor(3));

    await waitFor(() => expect(shown("aliases")).toBe('{"3":"car"}'));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("puts the name back on Escape, storing nothing", async () => {
    await mount(of(3), { "3": "car" });
    fireEvent.doubleClick(nameCell(3));

    fireEvent.change(editor(3), { target: { value: "lorry" } });
    fireEvent.keyDown(editor(3), { key: "Escape" });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(nameCell(3).textContent).toBe("car");
    expect(shown("aliases")).toBe('{"3":"car"}');
    expect(document.activeElement).toBe(idButton(3));
  });

  it("keeps a space typed between two words", async () => {
    // Typed a keystroke at a time. It used to commit and trim at every keystroke, so the space
    // after "stop" was trimmed away and the field reverted: "stop sign" could only be pasted.
    await mount(of(3));
    fireEvent.doubleClick(nameCell(3));

    let typed = "";
    for (const character of "stop sign") {
      typed += character;
      fireEvent.change(editor(3), { target: { value: typed } });
      expect(editor(3).value).toBe(typed);
    }
    fireEvent.keyDown(editor(3), { key: "Enter" });

    await waitFor(() => expect(shown("aliases")).toBe('{"3":"stop sign"}'));
  });

  it("is one undo step however many keystrokes it took", async () => {
    await mount(of(3), { "3": "car" });
    fireEvent.doubleClick(nameCell(3));

    for (const typed of ["l", "lo", "lor", "lorr", "lorry"]) fireEvent.change(editor(3), { target: { value: typed } });
    fireEvent.keyDown(editor(3), { key: "Enter" });
    await waitFor(() => expect(shown("aliases")).toBe('{"3":"lorry"}'));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("aliases")).toBe('{"3":"car"}'));
  });

  it("trims the name, and CLEARS it when it is blank rather than storing an empty one (RULE-042)", async () => {
    // A blank alias would export as a class literally named nothing, which is worse than falling
    // back to the id. Legacy stores whatever was typed.
    await mount(of(3), { "3": "car" });

    fireEvent.doubleClick(nameCell(3));
    fireEvent.change(editor(3), { target: { value: "  lorry  " } });
    fireEvent.keyDown(editor(3), { key: "Enter" });
    await waitFor(() => expect(shown("aliases")).toBe('{"3":"lorry"}'));

    fireEvent.doubleClick(nameCell(3));
    fireEvent.change(editor(3), { target: { value: "   " } });
    fireEvent.keyDown(editor(3), { key: "Enter" });
    await waitFor(() => expect(shown("aliases")).toBe("{}"));
    expect(nameCell(3).textContent).toBe("3");
  });

  it("starts from what the cell shows, an unnamed class's id, and stores nothing when that is left as it was", async () => {
    // Qt reports an edit only when the text changed, so Enter on the untouched id names nothing.
    await mount(of(3));
    fireEvent.doubleClick(nameCell(3));

    expect(editor(3).value).toBe("3");
    expect([editor(3).selectionStart, editor(3).selectionEnd]).toEqual([0, 1]);
    fireEvent.keyDown(editor(3), { key: "Enter" });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(shown("aliases")).toBe("{}");
  });

  it("edits only the name: the id is not editable, as legacy's id cell is not", async () => {
    await mount(of(3));

    fireEvent.doubleClick(idButton(3));

    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens from the keyboard too: F2 on the row", async () => {
    await mount(of(3), { "3": "car" });
    idButton(3).focus();

    fireEvent.keyDown(idButton(3), { key: "F2" });

    expect(editor(3).value).toBe("car");
    expect(document.activeElement).toBe(editor(3));
  });
});

/* Legacy sets the class new annotations get by clicking it in this table, and shows it in bold with
   a marker. Until 2026-09-25 nothing on screen could set it; only the X key toggled it. */
describe("the active class", () => {
  it("is chosen by clicking a class, and marked", async () => {
    await mount(of(2, 5));

    fireEvent.click(idButton(5));

    expect(shown("active")).toBe("5");
    expect(idButton(5).getAttribute("aria-pressed")).toBe("true");
    expect(rowOf(5).className).toContain("classes__row--active");
    expect(idButton(2).getAttribute("aria-pressed")).toBe("false");
  });

  it("goes back to the next free id when the active class is clicked again", async () => {
    await mount(of(2, 5));
    fireEvent.click(idButton(5));

    fireEvent.click(idButton(5));

    expect(shown("active")).toBe("null");
  });

  it("is chosen by a click on the name too, as a click anywhere on legacy's row is", async () => {
    await mount(of(2, 5));

    fireEvent.click(nameCell(5));

    expect(shown("active")).toBe("5");
  });

  it("says so, in legacy's words (main_window.py:2697-2710)", async () => {
    await mount(of(2, 5));

    fireEvent.click(nameCell(5));
    expect(await screen.findByText("Class 5 activated for new segments")).toBeTruthy();

    fireEvent.click(nameCell(5));
    expect(await screen.findByText("No active class - new segments will create new classes")).toBeTruthy();
  });

  it("is toggled ONCE by a double-click, which also opens the editor, as legacy's is", async () => {
    // Legacy's first release is a click and the release ending the double-click is not. A browser
    // sends a click for each, then the dblclick.
    await mount(of(2, 5));

    fireEvent.click(nameCell(5), { detail: 1 });
    fireEvent.click(nameCell(5), { detail: 2 });
    fireEvent.doubleClick(nameCell(5), { detail: 2 });

    expect(shown("active")).toBe("5");
    expect(editor(5)).toBeTruthy();
  });

  it("is not toggled by clicks inside the name editor", async () => {
    await mount(of(5));
    fireEvent.doubleClick(nameCell(5));

    fireEvent.click(editor(5));

    expect(shown("active")).toBe("null");
    expect(editor(5)).toBeTruthy();
  });
});

describe("reordering: a row is dragged, as legacy's InternalMove table is", () => {
  it("moves the row to where it is dropped, and changes no class id and no name", async () => {
    // Legacy's drop rearranges its table and nothing else (reorderable_class_table.py:26-60); the
    // file is numbered by ascending id until Reassign Class IDs is pressed.
    await mount(of(7, 2, 5), { "7": "car" });
    layOut();
    expect(order()).toEqual([2, 5, 7]);

    drag(7, 5);

    expect(order()).toEqual([7, 2, 5]);
    expect(shown("classes")).toBe("7,2,5");
    expect(shown("aliases")).toBe('{"7":"car"}');
    expect(reassign().disabled).toBe(false);
  });

  it("lands in the gap nearest the pointer: under a row when released on its lower half, last below the last", async () => {
    await mount(of(2, 5, 7));
    layOut();

    drag(2, 35);
    expect(order()).toEqual([5, 2, 7]);

    drag(5, 55);
    expect(order()).toEqual([2, 7, 5]);
  });

  it("shows where the row will land while it is dragged", async () => {
    await mount(of(2, 5, 7));
    layOut();

    press(7);
    moveTo(25);
    expect(rowOf(5).className).toContain("classes__row--drop-before");
    expect(rowOf(7).className).toContain("classes__row--dragged");

    moveTo(55);
    expect(rowOf(5).className).not.toContain("classes__row--drop-before");
    expect(rowOf(7).className).toContain("classes__row--drop-after");

    releaseAt(55);
    expect(document.querySelector(".classes__row--drop-before, .classes__row--drop-after, .classes__row--dragged")).toBeNull();
  });

  it("is not a click: the class it ends on is not toggled", async () => {
    await mount(of(2, 5));
    layOut();

    press(5);
    moveTo(5);
    releaseAt(5);
    // What a browser sends when a drag ends on the row it began on.
    fireEvent.click(rowOf(5));

    expect(order()).toEqual([5, 2]);
    expect(shown("active")).toBe("null");

    // The next click is a click.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(rowOf(5));
    expect(shown("active")).toBe("5");
  });

  it("does not start for a press that barely travels, which stays a click", async () => {
    await mount(of(2, 5));
    layOut();

    press(5);
    moveTo(32);
    releaseAt(32);
    fireEvent.click(rowOf(5));

    expect(order()).toEqual([2, 5]);
    expect(shown("active")).toBe("5");
  });

  it("puts the row back when it is released outside the table, where legacy refuses the drop", async () => {
    await mount(of(2, 5));
    layOut();

    press(5);
    moveTo(5);
    expect(rowOf(2).className).toContain("classes__row--drop-before");

    // Off the side of the table, over the canvas say: no line, and nowhere to land.
    moveTo(5, 400);
    expect(document.querySelector(".classes__row--drop-before, .classes__row--drop-after")).toBeNull();
    releaseAt(5, 400);
    fireEvent.click(rowOf(5));

    expect(order()).toEqual([2, 5]);
    expect(shown("active")).toBe("null");
  });

  it("is cancelled by Escape, which puts the row back", async () => {
    await mount(of(2, 5));
    layOut();

    press(5);
    moveTo(5);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelector(".classes__row--drop-before")).toBeNull();
    releaseAt(5);
    fireEvent.click(rowOf(5));

    expect(order()).toEqual([2, 5]);
    expect(shown("active")).toBe("null");
  });

  it("scrolls the pane when the drag nears its edge, as legacy's table does", async () => {
    await mount(of(1, 2, 3));
    const pane = screen.getByTestId("pane");
    pane.style.overflowY = "auto";
    Object.defineProperty(pane, "scrollHeight", { value: 600, configurable: true });
    Object.defineProperty(pane, "clientHeight", { value: 60, configurable: true });
    Object.defineProperty(pane, "scrollTop", { value: 0, writable: true, configurable: true });
    layOut({ element: pane, top: 0, bottom: 60 });

    press(1);
    moveTo(55);

    expect(pane.scrollTop).toBeGreaterThan(0);
    releaseAt(55);
  });

  it("moves a focused row with Alt+Down and Alt+Up, and keeps the keyboard on it", async () => {
    await mount(of(2, 5, 7));
    idButton(2).focus();

    fireEvent.keyDown(idButton(2), { key: "ArrowDown", altKey: true });
    expect(order()).toEqual([5, 2, 7]);
    expect(document.activeElement).toBe(idButton(2));

    fireEvent.keyDown(idButton(2), { key: "ArrowUp", altKey: true });
    expect(order()).toEqual([2, 5, 7]);
    expect(document.activeElement).toBe(idButton(2));
  });

  it("does not move a row past either end", async () => {
    await mount(of(2, 5));

    fireEvent.keyDown(idButton(2), { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(idButton(5), { key: "ArrowDown", altKey: true });

    expect(order()).toEqual([2, 5]);
  });

  it("belongs to its image: another image starts in id order, so Reassign cannot use an arrangement made elsewhere", async () => {
    // Legacy rebuilds its table in id order for every image (segment_table_manager.py:338-368).
    await mount(of(0, 1));
    fireEvent.keyDown(idButton(1), { key: "ArrowUp", altKey: true });
    expect(order()).toEqual([1, 0]);
    expect(reassign().disabled).toBe(false);

    fireEvent.click(screen.getByText("open another"));
    await waitFor(() => expect(shown("image")).toBe("b.png"));
    await waitFor(() => expect(shown("classes")).toBe("0,1"));

    expect(order()).toEqual([0, 1]);
    expect(reassign().disabled).toBe(true);
  });
});

describe("Reassign Class IDs", () => {
  it("is offered only when the order differs from the ids", async () => {
    await mount(of(0, 1));

    expect(reassign().disabled).toBe(true);
  });

  it("renumbers in the order shown and carries the names", async () => {
    await mount(of(7, 2, 5), { "7": "car", "2": "person" });
    layOut();

    drag(7, 5);
    fireEvent.click(reassign());

    // 7 -> 0, 2 -> 1, 5 -> 2, and the names follow their classes.
    await waitFor(() => expect(shown("classes")).toBe("0,1,2"));
    expect(shown("aliases")).toBe('{"0":"car","1":"person"}');
    expect(order()).toEqual([0, 1, 2]);
    expect(reassign().disabled).toBe(true);
  });

  it("can be undone, which legacy cannot", async () => {
    await mount(of(3, 7), { "3": "car" });
    layOut();

    drag(3, 35);
    fireEvent.click(reassign());
    await waitFor(() => expect(shown("classes")).toBe("1,0"));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("classes")).toBe("3,7"));
    expect(shown("aliases")).toBe('{"3":"car"}');
  });

  it("names a class that now means two things", async () => {
    // Legacy's silent defect, made sayable. With one class the table can only produce id 0, so
    // give class 0 an annotation that the table does not list -- impossible here, since the table
    // lists every class present. The reachable case is the reported one: nothing collides.
    await mount(of(3, 7));
    layOut();

    drag(3, 35);
    fireEvent.click(reassign());

    await waitFor(() => expect(shown("classes")).toBe("1,0"));
    expect(screen.queryByText(/more than one meaning/)).toBeNull();
  });

  it("says in one line which names it dropped because no annotation used them", async () => {
    await mount(of(3, 7), { "3": "car", "9": "bike" });

    fireEvent.click(reassign());

    expect(await screen.findByText("Warning: Dropped unused class name: bike")).toBeTruthy();
    expect(document.querySelector(".notifications__detail")).toBeNull();
  });
});
