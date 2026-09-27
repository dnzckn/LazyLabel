/**
 * A selected segment on the open image looks as legacy's does: one highlight, and no outline.
 *
 * The owner, 2026-09-27: "the border on selected segment ... has a thick border looks like, check
 * pyqt6 styling on this try to mimic". Legacy lays one yellow copy of a selected shape over it at
 * alpha 180 with a transparent pen, or in Edit mode the shape's own colour at 170
 * (segment_display_manager.py:508-529). The Select tool drew a second yellow fill and a thick yellow
 * outline over the canvas's highlight until then. This drives the real view.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { classColor } from "../../src/canvas/classColor.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const RECT = { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20, x: 0, y: 0 };
const TRIANGLE: WireSegment = { type: "Polygon", classId: 2, vertices: [[10, 5], [30, 5], [20, 18]] };

let fills: string[] = [];
let strokes = 0;

beforeEach(() => {
  fills = [];
  strokes = 0;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...RECT, toJSON: () => RECT } as DOMRect);
  const noop = () => undefined;
  const context = {
    fillStyle: "",
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    arc: noop,
    clearRect: noop,
    drawImage: noop,
    fill() {
      fills.push(context.fillStyle);
    },
    stroke() {
      strokes += 1;
    },
    strokeRect() {
      strokes += 1;
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
});

function imageRow(key: string): WireDatasetImage {
  return { key, name: key, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

function Harness(): React.ReactNode {
  const { openImage, addSegment, toggleSelected, setActiveTool } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(imageRow("a.png"))}>open a</button>
      <button type="button" onClick={() => addSegment(TRIANGLE, "Add polygon")}>add</button>
      <button type="button" onClick={() => toggleSelected(0)}>select it</button>
      <button type="button" onClick={() => setActiveTool("select")}>select tool</button>
      <button type="button" onClick={() => setActiveTool("none")}>edit tool</button>
    </>
  );
}

function mount() {
  const api = {
    getSettings: async () => defaultSettings(),
    putSettings: async (s: unknown) => s,
    imageMetadata: async () => ({ width: 40, height: 20, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    models: async () => [],
  } as unknown as ApiClient;

  return render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={api} projectId="p1" confirmNavigation={() => true}>
            <Harness />
            <OpenImageView client={api} projectId="p1" />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

const rgba = (classId: number, alpha: number) => {
  const { r, g, b } = classColor(classId);
  return `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
};
const YELLOW_180 = `rgba(255, 255, 0, ${180 / 255})`;

/** Open the image, add the triangle and select it, with `tool` chosen. */
async function selectedWith(tool: "select tool" | "edit tool") {
  const view = mount();
  fireEvent.click(screen.getByText("open a"));
  await waitFor(() => expect(view.container.querySelector(".canvas-stack")).not.toBeNull());
  fireEvent.click(screen.getByText("add"));
  fireEvent.click(screen.getByText(tool));
  fireEvent.click(screen.getByText("select it"));
  return view;
}

describe("a selected segment on the open image", () => {
  it("in Select mode is one yellow overlay at 180 over its own fill, with no outline", async () => {
    await selectedWith("select tool");

    await waitFor(() => expect(fills.slice(-2)).toEqual([rgba(2, 70), YELLOW_180]));
    expect(strokes).toBe(0);
    // Nothing over the canvas: the tool's surface only takes the clicks.
    const surface = screen.getByLabelText("Selection tool");
    expect(surface.children).toHaveLength(0);
    expect(surface.querySelector("[stroke], [fill]")).toBeNull();
  });

  it("in Edit mode is its own colour at 170, with no outline", async () => {
    await selectedWith("edit tool");

    await waitFor(() => expect(fills.slice(-2)).toEqual([rgba(2, 70), rgba(2, 170)]));
    expect(strokes).toBe(0);
    // Legacy's handles have a transparent pen too (editable_vertex.py:20).
    const handles = screen.getByLabelText("Edit tool").querySelectorAll("ellipse");
    expect(handles).toHaveLength(3);
    for (const handle of handles) expect(handle.getAttribute("stroke")).toBe("none");
  });
});
