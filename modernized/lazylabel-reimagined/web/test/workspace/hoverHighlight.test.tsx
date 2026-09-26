/**
 * Hovering a segment on the open image brightens it, as legacy's does.
 *
 * The owner, 2026-09-26: "the transparency of segments should adjust when mousing over the
 * segments (match how its done in pyqt6 version)". Legacy's items switch from alpha 70 to 170 while
 * the pointer is over them (hoverable_polygon_item.py:28-30). This drives the real view: the
 * pointer moves over the drawing stack, and the overlay canvas repaints the segment under it.
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

beforeEach(() => {
  fills = [];
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
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
});

function imageRow(key: string): WireDatasetImage {
  return { key, name: key, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

function Harness(): React.ReactNode {
  const { openImage, addSegment } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(imageRow("a.png"))}>open a</button>
      <button type="button" onClick={() => addSegment(TRIANGLE, "Add polygon")}>add</button>
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

describe("hovering a segment on the open image", () => {
  it("brightens the segment under the pointer to 170, and back to 70 when it leaves", async () => {
    const { container } = mount();
    fireEvent.click(screen.getByText("open a"));
    await waitFor(() => expect(container.querySelector(".canvas-stack")).not.toBeNull());
    fireEvent.click(screen.getByText("add"));
    await waitFor(() => expect(fills.at(-1)).toBe(rgba(2, 70)));

    const stack = container.querySelector(".canvas-stack")!;
    fireEvent.pointerMove(stack, { clientX: 20, clientY: 10 });
    await waitFor(() => expect(fills.at(-1)).toBe(rgba(2, 170)));

    fireEvent.pointerMove(stack, { clientX: 2, clientY: 2 });
    await waitFor(() => expect(fills.at(-1)).toBe(rgba(2, 70)));

    fireEvent.pointerMove(stack, { clientX: 20, clientY: 10 });
    await waitFor(() => expect(fills.at(-1)).toBe(rgba(2, 170)));
    fireEvent.pointerLeave(stack);
    await waitFor(() => expect(fills.at(-1)).toBe(rgba(2, 70)));
  });
});
