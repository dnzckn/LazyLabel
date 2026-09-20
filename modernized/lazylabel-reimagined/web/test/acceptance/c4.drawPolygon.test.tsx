/**
 * C4 — draw a polygon by hand, end to end: Phase 5's pilot slice.
 *
 * The brief's pilot is "draw it, close it by the join threshold or Space, edit vertices, undo, and
 * save". This covers all of it except vertex editing, which is RULE-046's and still to come.
 *
 * The unit tests pin each rule in isolation. What this adds is that they are actually connected:
 * choosing the tool, clicking on the canvas, and the polygon arriving in the store with the right
 * class, marked unsaved, undoable.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

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

/** Drives the workspace the way the shell does, and reports what the store holds. */
function Harness(): React.ReactNode {
  const { openImage, segments, imageState, history, setActiveTool, activeTool } = useWorkspace();

  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE_ROW)}>open</button>
      <button type="button" onClick={() => setActiveTool("polygon")}>polygon tool</button>
      <button type="button" onClick={() => history.undo()}>undo</button>
      <p data-testid="tool">{activeTool}</p>
      <p data-testid="count">{segments.length}</p>
      <p data-testid="class">{segments.map((s) => s.classId).join(",")}</p>
      <p data-testid="vertices">{JSON.stringify(segments.at(-1)?.vertices ?? null)}</p>
      <p data-testid="dirty">{imageState?.dirty === true ? "dirty" : "clean"}</p>
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
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        <WorkspaceProvider client={api} projectId="p1">
          <Harness />
          <NotificationHost />
          <OpenImageView client={api} projectId="p1" />
        </WorkspaceProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

const shown = (id: string) => screen.getByTestId(id).textContent;

/** A click at an image coordinate; the display box is 1:1 here. */
function clickCanvas(x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerDown(screen.getByLabelText("Polygon tool"), {
    button: 0,
    clientX: x,
    clientY: y,
    ...init,
  });
}

async function readyToDraw() {
  mount();
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
  fireEvent.click(screen.getByText("polygon tool"));
  await waitFor(() => expect(screen.getByLabelText("Polygon tool")).toBeTruthy());
}

describe("C4: drawing a polygon by hand", () => {
  it("offers no drawing surface until a tool is chosen", async () => {
    // A canvas that starts in a drawing mode turns the first click of a session -- often a click
    // to look at something -- into an annotation.
    mount();
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());

    expect(shown("tool")).toBe("none");
    expect(screen.queryByLabelText("Polygon tool")).toBeNull();
  });

  it("draws a polygon on an image that has no annotation file at all", async () => {
    // The usual way a dataset starts. The layer sits over the plain image, not only over a canvas
    // that already has annotations to draw.
    await readyToDraw();

    clickCanvas(10, 10);
    clickCanvas(50, 10);
    clickCanvas(50, 50);
    clickCanvas(11, 11); // within the default join threshold of the first vertex

    await waitFor(() => expect(shown("count")).toBe("1"));
    expect(JSON.parse(shown("vertices") ?? "null")).toEqual([[10, 10], [50, 10], [50, 50]]);
  });

  it("gives it the next free class id", async () => {
    // No class is active and the image was empty, so legacy's next id is 0 -- which is why
    // LazyLabel datasets are zero-based.
    await readyToDraw();

    clickCanvas(10, 10);
    clickCanvas(50, 10);
    clickCanvas(50, 50);
    clickCanvas(11, 11);

    await waitFor(() => expect(shown("class")).toBe("0"));
  });

  it("marks the image unsaved, which is what the save path acts on", async () => {
    await readyToDraw();
    expect(shown("dirty")).toBe("clean");

    clickCanvas(10, 10);
    clickCanvas(50, 10);
    clickCanvas(50, 50);
    clickCanvas(11, 11);

    await waitFor(() => expect(shown("dirty")).toBe("dirty"));
  });

  it("finishes on Space as well as by clicking the first vertex", async () => {
    await readyToDraw();

    clickCanvas(10, 10);
    clickCanvas(50, 10);
    clickCanvas(50, 50);
    fireEvent.keyDown(document, { key: " " });

    await waitFor(() => expect(shown("count")).toBe("1"));
  });

  it("takes the whole polygon back with undo once it exists", async () => {
    // During drawing, undo steps back a vertex; once the polygon is a segment, undo removes it.
    await readyToDraw();

    clickCanvas(10, 10);
    clickCanvas(50, 10);
    clickCanvas(50, 50);
    fireEvent.keyDown(document, { key: " " });
    await waitFor(() => expect(shown("count")).toBe("1"));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("count")).toBe("0"));
  });

  it("says why Space did nothing on a two-point polygon", async () => {
    // Legacy is silent here, so a user concludes the key is not bound.
    await readyToDraw();

    clickCanvas(10, 10);
    clickCanvas(50, 10);
    fireEvent.keyDown(document, { key: " " });

    expect(await screen.findByText(/at least 3 points/)).toBeTruthy();
    expect(shown("count")).toBe("0");
  });

  it("does not add a second class id for a second polygon drawn straight after", async () => {
    // The next free id is max + 1, so the second polygon is class 1, not class 0 again.
    await readyToDraw();

    for (const offset of [0, 60]) {
      clickCanvas(10 + offset, 10);
      clickCanvas(50 + offset, 10);
      clickCanvas(50 + offset, 50);
      fireEvent.keyDown(document, { key: " " });
      await waitFor(() => expect(shown("count")).toBe(offset === 0 ? "1" : "2"));
    }

    expect(shown("class")).toBe("0,1");
  });
});
