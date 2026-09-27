/**
 * CONTROL_PARITY.md CP-31: in the Multi tab, what legacy does to both viewers is done to both images.
 *
 * The owner's decision of 2026-09-26, "Act on both, like the desktop app", which reverses decision
 * 8's active-side-only view for these. Legacy's next and previous move the pair
 * (main_window.py:6491-6557); W, A, S, D and Fit act on both viewers (viewport_manager.py:45-50,
 * 89-94); V and M take each viewer's own selection, linked or not (main_window.py:1647-1656,
 * 1693-1744); Escape clears both (keyboard_event_manager.py:44-57); Ctrl+A selects both while
 * linked (main_window.py:1658-1691). Linked, a selection or a class name made in one viewer is made
 * in the other (main_window.py:6194-6209, 6284-6319, 6392-6425).
 *
 * The whole app is mounted with only the HTTP client stubbed, and a probe beside it reads both
 * sides of the store.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";
import type { WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { App } from "../../src/shell/App.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";
import { chooseTool, drawTriangle, editClassName } from "../acceptance/harness.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The canvas is 200x100 at the origin, so a click coordinate IS an image coordinate. */
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

const triangle = (classId: number): WireSegment => ({
  type: "Polygon",
  classId,
  vertices: [
    [10, 10],
    [50, 10],
    [50, 40],
  ],
});

/** a.png calls class 0 "car"; b.png calls class 1 "car" and class 0 "tree". The rest are empty. */
const FILES: Readonly<Record<string, { segments: WireSegment[]; aliases: Record<string, string> }>> = {
  "frames/a.png": { segments: [triangle(0), triangle(1)], aliases: { "0": "car", "1": "tree" } },
  "frames/b.png": { segments: [triangle(0), triangle(1), triangle(2)], aliases: { "0": "tree", "1": "car" } },
};

function loaded(key: string): AnnotationsResult {
  const file = FILES[key];
  if (file === undefined) return { kind: "none" };
  return {
    kind: "loaded",
    annotations: {
      segments: file.segments,
      classAliases: file.aliases,
      failures: [],
      rejected: 0,
      sourceFile: `${key}.npz`,
      sourceFormat: "NPZ",
    },
  } as unknown as AnnotationsResult;
}

/** Both sides of the store, as JSON: which image, its classes, its selection, its names, its zoom. */
function Probe(): ReactNode {
  const { sides } = useWorkspace();
  return (
    <pre data-testid="pair">
      {JSON.stringify(
        sides.map((side) => ({
          key: side.open?.image.key ?? null,
          classes: side.segments.map((segment) => segment.classId),
          selected: side.selected,
          aliases: side.classAliases,
          zoom: side.zoom,
        })),
      )}
    </pre>
  );
}

interface Side {
  readonly key: string | null;
  readonly classes: readonly (number | null)[];
  readonly selected: readonly number[];
  readonly aliases: Readonly<Record<string, string>>;
  readonly zoom: number | null;
}

const pair = (): readonly [Side, Side] => JSON.parse(screen.getByTestId("pair").textContent ?? "[]");

function mount(names: readonly string[]) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: false, reason: "none", videoCapable: false, accelerator: "unknown" },
    }),
    listImages: async () => ({
      folder: "frames",
      folders: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [{ format: "NPZ", suffix: ".npz" }],
      images: names.map((name) => ({
        key: `frames/${name}`,
        name,
        sidecars: { NPZ: false },
        annotated: false,
        sharesSidecarsWith: [],
      })),
    }),
    loadAnnotations: async (_project: string, key: string) => loaded(key),
    imageMetadata: async () => ({ width: 200, height: 100, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
    saveAnnotations: async () => ({ written: { NPZ: "r1" }, stale: [] as string[], skippedEmpty: [] as string[] }),
    // Every pair move saves both sides first, and an empty one's files are deleted (CP-67, RULE-083).
    deleteAnnotations: async () => ({ deleted: [] as string[] }),
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default" confirmNavigation={() => true}>
            <App client={client} />
            <Probe />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

/** a.png opened, the Multi tab chosen, and b.png paired with it: legacy's first pair of a folder. */
async function pairUp(names: readonly string[] = ["a.png", "b.png", "c.png", "d.png"]): Promise<void> {
  mount(names);
  fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
  await waitFor(() => expect(pair()[0].classes).toEqual([0, 1]));
  fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
  fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: "frames/b.png" } });
  await waitFor(() => expect(pair()[1].classes).toEqual([0, 1, 2]));
}

const keys = () => pair().map((side) => side.key);
const press = (key: string, code: string, modifiers: { ctrlKey?: boolean } = {}) =>
  fireEvent.keyDown(document, { key, code, ...modifiers });
const editRight = () => fireEvent.click(screen.getByLabelText("Edit the right image"));
const editLeft = () => fireEvent.click(screen.getByLabelText("Edit the left image"));
const link = () => fireEvent.click(screen.getByLabelText("Link the two images"));
/** A row's checkbox in the segment table, which shows the image being edited. */
const tick = (row: number) => fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`^Select Polygon ${row},`) }));

describe("next and previous move the pair, as legacy's do", () => {
  it("moves both images two rows on, counted from the left, whichever side is being edited", async () => {
    // _load_next_multi_batch: the next pair starts two rows after viewer 1's image
    // (main_window.py:6491-6522; fast_file_manager.py:1465-1503).
    await pairUp();
    editRight();

    press("ArrowRight", "ArrowRight");

    await waitFor(() => expect(keys()).toEqual(["frames/c.png", "frames/d.png"]));
  });

  it("moves both back two rows on Left", async () => {
    await pairUp();
    press("ArrowRight", "ArrowRight");
    await waitFor(() => expect(keys()).toEqual(["frames/c.png", "frames/d.png"]));

    press("ArrowLeft", "ArrowLeft");

    await waitFor(() => expect(keys()).toEqual(["frames/a.png", "frames/b.png"]));
  });

  it("empties the right image when the list has only one more, as legacy's viewer 2 goes empty", async () => {
    await pairUp(["a.png", "b.png", "c.png"]);

    press("ArrowRight", "ArrowRight");

    await waitFor(() => expect(keys()).toEqual(["frames/c.png", null]));
    expect(document.querySelector(".split__pane--empty")?.textContent).toBe("No image loaded");
  });

  it("says legacy's words at either end, and moves nothing", async () => {
    await pairUp(["a.png", "b.png"]);

    press("ArrowLeft", "ArrowLeft");
    expect(await screen.findByText("Reached beginning of image list")).toBeTruthy();
    press("ArrowRight", "ArrowRight");
    expect(await screen.findByText("Reached end of image list")).toBeTruthy();

    expect(keys()).toEqual(["frames/a.png", "frames/b.png"]);
  });
});

describe("the pan keys and Fit act on both halves", () => {
  it("pans the other half too, a tenth of its own size", async () => {
    // viewport_manager.py:45-50 pans every multi viewer; _pan_viewer measures each (52-79).
    await pairUp();
    const scrolled = (element: HTMLElement, width: number, height: number) => {
      Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
      Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
      const by = vi.fn();
      element.scrollBy = by as unknown as typeof element.scrollBy;
      return by;
    };
    const view = scrolled(document.querySelector(".split__view .canvas-scroll") as HTMLElement, 900, 600);
    const other = scrolled(document.querySelector(".split__picture") as HTMLElement, 400, 300);

    press("d", "KeyD");

    expect(view).toHaveBeenCalledWith({ left: 90, top: 0, behavior: "auto" });
    expect(other).toHaveBeenCalledWith({ left: 40, top: 0, behavior: "auto" });
  });

  it("fits both images on Fit, the one not being edited too", async () => {
    // viewport_manager.py:89-94: fitInView on every multi viewer.
    await pairUp();
    fireEvent.click(screen.getByRole("tab", { name: "Image" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    editRight();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => expect(pair().every((side) => side.zoom !== null)).toBe(true));
    // The left image is not being edited, and is drawn at the zoom it was left at.
    expect(document.querySelector(".split__picture")?.classList.contains("split__picture--zoomed")).toBe(true);

    press(".", "Period");

    await waitFor(() => expect(pair().map((side) => side.zoom)).toEqual([null, null]));
    expect(document.querySelector(".split__picture")?.classList.contains("split__picture--zoomed")).toBe(false);
  });
});

describe("V, M, Escape and Ctrl+A act on both images", () => {
  it("deletes each image's own selection on V, unlinked too, in one undo step", async () => {
    await pairUp();
    tick(1);
    editRight();
    tick(2);

    press("v", "KeyV");

    await waitFor(() => expect(pair().map((side) => side.classes)).toEqual([[1], [0, 2]]));
    // Legacy's words, with the count across both viewers (main_window.py:1736-1738).
    expect(screen.getByText("Deleted 2 segment(s)")).toBeTruthy();

    press("z", "KeyZ", { ctrlKey: true });

    await waitFor(() => expect(pair().map((side) => side.classes)).toEqual([[0, 1], [0, 1, 2]]));
  });

  it("merges each image's own selection on M, each to its lowest selected class", async () => {
    // _assign_selected_to_class merges every viewer with a selection (main_window.py:1647-1656);
    // assign_segments_to_class takes the lowest selected class (segment_manager.py:65-85).
    await pairUp();
    tick(1);
    tick(2);
    editRight();
    tick(2);
    tick(3);

    press("m", "KeyM");

    await waitFor(() => expect(pair().map((side) => side.classes)).toEqual([[0, 0], [0, 1, 1]]));
    expect(screen.getByText("Merged 2 segment(s)")).toBeTruthy();
    expect(pair().map((side) => side.selected)).toEqual([[], []]);
  });

  it("clears both selections on Escape", async () => {
    await pairUp();
    tick(1);
    editRight();
    tick(3);
    expect(pair().map((side) => side.selected)).toEqual([[0], [2]]);

    press("Escape", "Escape");

    await waitFor(() => expect(pair().map((side) => side.selected)).toEqual([[], []]));
  });

  it("selects every annotation of both images on Ctrl+A while linked", async () => {
    await pairUp();
    link();

    press("a", "KeyA", { ctrlKey: true });

    await waitFor(() => expect(pair().map((side) => side.selected)).toEqual([[0, 1], [0, 1, 2]]));
  });

  it("selects only the image being edited on Ctrl+A while unlinked, as legacy's does", async () => {
    await pairUp();
    editRight();

    press("a", "KeyA", { ctrlKey: true });

    await waitFor(() => expect(pair()[1].selected).toEqual([0, 1, 2]));
    expect(pair()[0].selected).toEqual([]);
  });
});

describe("R looks at both images' selections", () => {
  it("enters Edit when the image NOT being edited has a polygon selected, as legacy's does", async () => {
    // mode_manager.py:60-86: in the multi view R checks every viewer's selected rows.
    await pairUp();
    tick(1);
    editRight();

    press("r", "KeyR");

    await waitFor(() =>
      expect((screen.getByRole("radio", { name: "Edit (R)" }) as HTMLInputElement).checked).toBe(true),
    );
    expect(screen.queryByText("No editable shapes selected!")).toBeNull();
  });
});

describe("a linked pair shares its selection and its class names", () => {
  it("selects the same rows in the other image, those it has", async () => {
    // _sync_multi_view_selection replaces the other table's selection with this one's rows,
    // skipping rows past its end (main_window.py:6284-6319).
    await pairUp();
    link();
    editRight();

    tick(1);
    tick(3);

    await waitFor(() => expect(pair().map((side) => side.selected)).toEqual([[0], [0, 2]]));
  });

  it("leaves the other image's selection alone while unlinked", async () => {
    await pairUp();

    tick(2);

    expect(pair().map((side) => side.selected)).toEqual([[1], []]);
  });

  it("renames the class of the same NAME in the other image, and one undo takes both back", async () => {
    // Legacy mirrors a rename to the other viewer by id (main_window.py:6392-6425). The pair here
    // agrees on names with ids of its own (RULE-092), so b.png's "car" is its class 1, and its
    // class 0, "tree", keeps its name.
    await pairUp();
    link();

    const name = await editClassName(0);
    fireEvent.change(name, { target: { value: "auto" } });
    fireEvent.keyDown(name, { key: "Enter" });

    await waitFor(() => expect(pair()[1].aliases).toEqual({ "0": "tree", "1": "auto" }));
    expect(pair()[0].aliases).toEqual({ "0": "auto", "1": "tree" });

    press("z", "KeyZ", { ctrlKey: true });

    await waitFor(() => expect(pair().map((side) => side.aliases["0"])).toEqual(["car", "tree"]));
    expect(pair()[1].aliases["1"]).toBe("car");
  });

  it("renames only the image being edited while unlinked", async () => {
    await pairUp();

    const name = await editClassName(0);
    fireEvent.change(name, { target: { value: "auto" } });
    fireEvent.keyDown(name, { key: "Enter" });

    await waitFor(() => expect(pair()[0].aliases["0"]).toBe("auto"));
    expect(pair()[1].aliases).toEqual({ "0": "tree", "1": "car" });
  });
});

describe("Space finishes what is drawn in both images while linked", () => {
  it("puts a polygon closed with Space into both", async () => {
    // Legacy's linked polygon has its points in both viewers, and Space finishes both
    // (main_window.py:5680-5700; keyboard_event_manager.py:99-123). Here the shape is drawn once
    // and the store puts it in both (RULE-092), which is the same pair of annotations.
    await pairUp();
    link();
    chooseTool("Poly (2)");

    drawTriangle(60, 20);

    await waitFor(() => expect(pair().map((side) => side.classes.length)).toEqual([3, 4]));
  });
});

describe("outside the Multi tab", () => {
  it("steps the image being edited by one row, and leaves the other alone, as the single view does", async () => {
    // Pairing leaves the left image being edited.
    await pairUp();
    fireEvent.click(screen.getByRole("tab", { name: "Single" }));

    press("ArrowRight", "ArrowRight");

    await waitFor(() => expect(keys()).toEqual(["frames/b.png", "frames/b.png"]));
  });

  it("clears only the selection of the image being edited on Escape", async () => {
    await pairUp();
    editRight();
    tick(1);
    editLeft();
    tick(1);
    fireEvent.click(screen.getByRole("tab", { name: "Single" }));

    press("Escape", "Escape");

    await waitFor(() => expect(pair().map((side) => side.selected)).toEqual([[], [0]]));
  });
});
