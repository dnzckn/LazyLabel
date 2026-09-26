/**
 * Persona flow 3, end to end — Phase 5 exit criterion 1.
 *
 * "An annotator traces object outlines point by point, drags vertices to fix them, sets the class,
 * and undoes mistakes." The six steps `topology.json` records, walked in order, through the real
 * components with only the HTTP client stubbed.
 *
 * WHY THIS IS NOT THE SAME AS c4. `c4.drawPolygon` covers drawing: choose the tool, click, close,
 * land in the store. This covers the whole persona — drawing, then EDITING what was drawn, then
 * naming its class, then undoing — and the value is in the joins between them. Each of those works
 * in isolation and is tested in isolation; what a flow test catches is the edit that takes the
 * wrong index after a selection, or the rename that is dropped because the class table wrote to
 * the file's aliases instead of the live ones. Both of those are mistakes this codebase has
 * actually made.
 *
 * Vertex dragging goes through the edit layer's real pointer handling rather than calling
 * `moveVertex` directly, because the thing worth proving is that the drag reaches it at all.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { ClassTable } from "../../src/workspace/ClassTable.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider, useWorkspace, type Tool } from "../../src/workspace/WorkspaceProvider.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";

afterEach(cleanup);

const IMAGE = { width: 200, height: 100 };
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

const IMAGE_ROW: WireDatasetImage = {
  key: "frames/a.png",
  name: "a.png",
  sidecars: {},
  annotated: false,
  sharesSidecarsWith: [],
};

/** The shell's controls, reduced to what this flow uses, plus a readout of the store. */
function Harness(): React.ReactNode {
  const { openImage, segments, imageState, history, setActiveTool, classAliases, selected } =
    useWorkspace();

  const tool = (value: Tool) => (
    <button type="button" onClick={() => setActiveTool(value)}>
      {value} tool
    </button>
  );

  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE_ROW)}>open</button>
      {tool("polygon")}
      {tool("select")}
      {tool("none")}
      <button type="button" onClick={() => history.undo()}>undo</button>
      <p data-testid="count">{segments.length}</p>
      <p data-testid="class">{segments.map((s) => s.classId).join(",")}</p>
      <p data-testid="vertices">{JSON.stringify(segments.at(-1)?.vertices ?? null)}</p>
      <p data-testid="aliases">{JSON.stringify(classAliases)}</p>
      <p data-testid="selected">{selected.join(",")}</p>
      <p data-testid="dirty">{imageState?.dirty === true ? "dirty" : "clean"}</p>
      <p data-testid="undoable">{history.state.canUndo ? "yes" : "no"}</p>
    </>
  );
}

function mount() {
  const api = {
    getSettings: async () => defaultSettings(),
    putSettings: async (s: unknown) => s,
    imageMetadata: async () => ({ ...IMAGE, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        {/* `useHotkey` throws without a provider by design -- a hook that quietly works without
            one hides a missing wire, which is this project's longest-running defect family. The
            save and selection keys live in these components, so the tests supply it. */}
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={api} projectId="p1">
          <Harness />
          <ClassTable />
          <NotificationHost />
          <OpenImageView client={api} projectId="p1" />
        </WorkspaceProvider>
      </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

const shown = (id: string) => screen.getByTestId(id).textContent;
const vertices = () => JSON.parse(shown("vertices") ?? "null") as number[][] | null;

function click(label: string, x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerDown(screen.getByLabelText(label), { button: 0, clientX: x, clientY: y, ...init });
}

/**
 * Drag one vertex handle to a new place.
 *
 * The press lands on the HANDLE and the move and release on the surface, which is how a browser
 * delivers a drag once the handle has captured the pointer. Pressing the surface instead does
 * nothing at all -- which is how this test found that the edit layer was never wired into the view.
 */
function dragHandle(handle: number, toX: number, toY: number) {
  const surface = screen.getByLabelText("Edit tool");
  fireEvent.pointerDown(screen.getByTestId(`handle-${handle}`), { button: 0, pointerId: 1 });
  fireEvent.pointerMove(surface, { clientX: toX, clientY: toY, pointerId: 1 });
  fireEvent.pointerUp(surface, { clientX: toX, clientY: toY, pointerId: 1 });
}

/** Step 1: switch to polygon mode. */
async function openAndDraw() {
  mount();
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
  fireEvent.click(screen.getByText("polygon tool"));
  await waitFor(() => expect(screen.getByLabelText("Polygon tool")).toBeTruthy());

  // Step 2: click points around the object, then close it on Space.
  click("Polygon tool", 20, 20);
  click("Polygon tool", 80, 20);
  click("Polygon tool", 80, 70);
  fireEvent.keyDown(document, { key: " ", code: "Space" });

  // Step 3: the outline is a labelled object.
  await waitFor(() => expect(shown("count")).toBe("1"));
}

describe("flow 3, step by step", () => {
  it("traces an outline and it becomes a labelled object", async () => {
    await openAndDraw();

    expect(vertices()).toEqual([[20, 20], [80, 20], [80, 70]]);
    // The next free id on an empty image is 0, which is why LazyLabel datasets are zero-based.
    expect(shown("class")).toBe("0");
    expect(shown("dirty")).toBe("dirty");
  });

  it("drags a vertex to fix the outline", async () => {
    await openAndDraw();

    // Selecting is how a shape is chosen for editing, and it is the join this test exists for:
    // the edit layer works on the SELECTED annotation, by position in the list.
    fireEvent.click(screen.getByText("select tool"));
    click("Selection tool", 40, 30);
    await waitFor(() => expect(shown("selected")).toBe("0"));

    fireEvent.click(screen.getByText("none tool"));
    await waitFor(() => expect(screen.getByLabelText("Edit tool")).toBeTruthy());

    dragHandle(1, 95, 35);

    await waitFor(() => expect(vertices()).toEqual([[20, 20], [95, 35], [80, 70]]));
  });

  it("renames the class, and the rename is what a save would write", async () => {
    // The live aliases, not the file's. A rename that only reached the loaded response would be
    // dropped on the next save -- which is a mistake this codebase has made.
    await openAndDraw();

    // A double-click on the class's name opens its editor, as in legacy (right_panel.py:192).
    const id = await screen.findByRole("button", { name: "Draw new annotations as class 0" });
    fireEvent.doubleClick(within(id.closest("tr") as HTMLElement).getByRole("cell"));
    const field = screen.getByRole("textbox", { name: "Name for class 0" });
    fireEvent.change(field, { target: { value: "stop sign" } });
    fireEvent.blur(field);

    await waitFor(() => expect(JSON.parse(shown("aliases") ?? "{}")).toEqual({ "0": "stop sign" }));
  });

  it("undoes a mistake, and the outline goes back to what it was", async () => {
    await openAndDraw();
    expect(shown("undoable")).toBe("yes");

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("count")).toBe("0"));
  });

  it("undoes a vertex drag by putting the vertex BACK, not by deleting the shape", async () => {
    // The distinction `updateSegment` exists for. An edit recorded as an add would undo by
    // removing the annotation, which loses the whole outline to fix one corner.
    await openAndDraw();

    fireEvent.click(screen.getByText("select tool"));
    click("Selection tool", 40, 30);
    await waitFor(() => expect(shown("selected")).toBe("0"));
    fireEvent.click(screen.getByText("none tool"));

    await screen.findByLabelText("Edit tool");
    dragHandle(1, 95, 35);
    await waitFor(() => expect(vertices()).toEqual([[20, 20], [95, 35], [80, 70]]));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(vertices()).toEqual([[20, 20], [80, 20], [80, 70]]));
    expect(shown("count")).toBe("1");
  });
});
