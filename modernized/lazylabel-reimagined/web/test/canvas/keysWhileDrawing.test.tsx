/**
 * Keys pressed while a polygon is being drawn -- found in a real browser on 2026-09-23.
 *
 * Two listeners hear the same keystroke: the polygon layer's, and the app's hotkey dispatcher. The
 * dispatcher was registered first, so it ran first. For Enter -- legacy's "finish the polygon and
 * then save" -- that meant the SAVE ran before the finish, wrote the annotations without the shape,
 * and then marked the image saved over the shape's own "unsaved": the file on disk was empty and
 * the app said "saved". For Ctrl+Z it meant undoing the previous ANNOTATION as well as the vertex.
 *
 * jsdom has neither layout nor canvas, so this finds it the way a user did: through the real view,
 * with only the HTTP client stubbed.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";
import { defaultSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { HistoryControls } from "../../src/workspace/HistoryControls.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider, useWorkspace, type Tool } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE = { width: 200, height: 100 };
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...RECT, toJSON: () => RECT } as DOMRect);
});

const ROW: WireDatasetImage = { key: "a.png", name: "a.png", sidecars: {}, annotated: false, sharesSidecarsWith: [] };

function Harness(): React.ReactNode {
  const { openImage, segments, imageState, setActiveTool } = useWorkspace();
  const tool = (value: Tool) => (
    <button type="button" onClick={() => setActiveTool(value)}>{value} tool</button>
  );
  return (
    <>
      <button type="button" onClick={() => openImage(ROW)}>open</button>
      {tool("polygon")}
      <p data-testid="count">{segments.length}</p>
      <p data-testid="dirty">{imageState?.dirty === true ? "dirty" : "clean"}</p>
    </>
  );
}

interface Saved {
  readonly segments: readonly unknown[];
}

/** Mounts the view; `hold` makes each save wait until the test releases it. */
function mount(options: { hold?: boolean } = {}) {
  const saves: Saved[] = [];
  const releases: (() => void)[] = [];
  const api = {
    getSettings: async () => defaultSettings(),
    putSettings: async (s: unknown) => s,
    imageMetadata: async () => ({ ...IMAGE, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    saveAnnotations: async (_project: string, _key: string, body: Saved) => {
      saves.push(body);
      if (options.hold) await new Promise<void>((resolve) => releases.push(resolve));
      return { written: { NPZ: `r${saves.length}` }, stale: [], skippedEmpty: [] };
    },
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={api} projectId="p1">
            <Harness />
            {/* Where Undo's hotkey lives: without it, Ctrl+Z has only one listener to reach. */}
            <HistoryControls />
            <NotificationHost />
            <OpenImageView client={api} projectId="p1" />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
  return { saves, releases };
}

const shown = (id: string) => screen.getByTestId(id).textContent;

function click(x: number, y: number) {
  fireEvent.pointerDown(screen.getByLabelText("Polygon tool"), { button: 0, clientX: x, clientY: y });
}

async function openWithPolygonTool() {
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
  fireEvent.click(screen.getByText("polygon tool"));
  await waitFor(() => expect(screen.getByLabelText("Polygon tool")).toBeTruthy());
}

function triangle(offset = 0) {
  click(20 + offset, 20);
  click(60 + offset, 20);
  click(60 + offset, 60);
}

describe("Enter: finish the polygon, THEN save", () => {
  it("saves the polygon the same keystroke finished", async () => {
    const { saves } = mount();
    await openWithPolygonTool();
    triangle();

    fireEvent.keyDown(document, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.segments).toHaveLength(1);
    await waitFor(() => expect(shown("count")).toBe("1"));
    expect(shown("dirty")).toBe("clean");
  });
});

describe("a save that completes after an edit", () => {
  it("leaves the image unsaved, because the edit is not in the file", async () => {
    // The general form of the Enter defect: marking the image saved on return, whatever changed
    // while the write was in flight. The file holds one triangle; the screen holds two.
    const { saves, releases } = mount({ hold: true });
    await openWithPolygonTool();
    triangle();
    fireEvent.keyDown(document, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(saves).toHaveLength(1));

    triangle(100);
    fireEvent.keyDown(document, { key: " ", code: "Space" });
    await waitFor(() => expect(shown("count")).toBe("2"));
    releases.forEach((release) => release());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(saves[0]!.segments).toHaveLength(1);
    expect(shown("dirty")).toBe("dirty");
  });
});

describe("Ctrl+Z while drawing", () => {
  it("takes back the last vertex and NOT the previous annotation", async () => {
    mount();
    await openWithPolygonTool();
    triangle();
    fireEvent.keyDown(document, { key: " ", code: "Space" });
    await waitFor(() => expect(shown("count")).toBe("1"));

    click(120, 20);
    click(160, 20);
    fireEvent.keyDown(document, { key: "z", code: "KeyZ", ctrlKey: true });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shown("count")).toBe("1");
  });
});
