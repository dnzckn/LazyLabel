/**
 * Auto-Save on Navigate: moving to another image saves the one being left, first.
 *
 * RULE-059, restored by the owner's decision of 2026-09-25: "moving should save if save on move
 * setting is turned on". Legacy saves the image being left before loading the next whenever the
 * setting is on, which is its default (file_navigation_manager.py:270-274; settings_widget.py:39-44),
 * and leaving a timeline frame does the same (main_window.py:3424-3427, SEQUENCE_PARITY.md SP-01).
 *
 * The save is the one Enter makes -- the same formats, conditional on the same revisions -- and it
 * never writes over annotations that could not be read. A save that fails keeps the image open,
 * with the reason where the save button gives it, so nothing is lost on the way out.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { ApiError, type AnnotationsResult, type ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { App } from "../../src/shell/App.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { chooseTool, drawTriangle } from "../acceptance/harness.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The canvas is 200x100 at the origin, so a click coordinate IS an image coordinate. */
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

const row = (name: string) => ({
  key: `frames/${name}`,
  name,
  sidecars: { NPZ: false },
  annotated: false,
  sharesSidecarsWith: [],
});

/** a.png's NPZ at a known revision, which is what a conditional write cites. */
const AT_REV_A: AnnotationsResult = {
  kind: "loaded",
  annotations: {
    segments: [],
    classAliases: {},
    failures: [],
    rejected: 0,
    sourceFile: "frames/a.npz",
    sourceFormat: "NPZ",
    revision: "rev-A",
  },
} as unknown as AnnotationsResult;

const UNREADABLE: AnnotationsResult = { kind: "failed", failures: [], message: "the npz is truncated" };

/** a.png's NPZ at rev-A, holding one triangle: a side a save WRITES rather than deletes. */
const TRIANGLE_AT_REV_A = {
  kind: "loaded",
  annotations: {
    ...(AT_REV_A as unknown as { annotations: Record<string, unknown> }).annotations,
    segments: [{ type: "Polygon", classId: 0, vertices: [[120, 10], [160, 10], [160, 40]] }],
  },
} as unknown as AnnotationsResult;

function mount({
  a = AT_REV_A,
  answer = true,
  names = ["a.png", "b.png"],
}: { a?: AnnotationsResult; answer?: boolean; names?: readonly string[] } = {}) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);

  /** What reached the server, in order: the proof that the save came BEFORE the next image. */
  const events: string[] = [];
  const saveAnnotations = vi.fn(async (_project: string, key: string, _body: Record<string, unknown>) => {
    events.push(`save ${key}`);
    return { written: { NPZ: "rev-A2", YOLO_DETECTION: "rev-T" }, stale: [] as string[], skippedEmpty: [] as string[] };
  });
  // A save with no segments deletes instead (RULE-083). a.png's files are there to go.
  const deleteAnnotations = vi.fn(async (_project: string, key: string) => {
    events.push(`delete ${key}`);
    return { deleted: key === "frames/a.png" ? ["frames/a.npz", "frames/a.txt"] : [] };
  });
  const confirmNavigation = vi.fn((_summary: string) => answer);
  const putSettings = vi.fn(async (settings: unknown) => settings);

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings,
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
      images: names.map(row),
    }),
    loadAnnotations: async (_project: string, key: string) => {
      events.push(`load ${key}`);
      return key === "frames/a.png" ? a : { kind: "none" };
    },
    imageMetadata: async () => ({
      width: 200,
      height: 100,
      sourceDepth: 8,
      sourceChannels: 3,
      sourceFormat: "png",
    }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
    saveAnnotations,
    deleteAnnotations,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default" confirmNavigation={confirmNavigation}>
            <App client={client} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { events, saveAnnotations, deleteAnnotations, confirmNavigation, putSettings };
}

const status = () => screen.getByLabelText("Status").textContent ?? "";
const autoSave = () => screen.getByLabelText("Auto-Save on Navigate") as HTMLInputElement;
/** Legacy's Right: load_next_image. */
const next = () => fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });

/** Open a.png from the file list and draw one triangle on it, leaving it unsaved. */
async function openAndDraw(): Promise<void> {
  await waitFor(() => expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy());
  fireEvent.doubleClick(screen.getByRole("button", { name: "a.png" }));
  await waitFor(() => expect(status()).toMatch(/a\.png/));
  chooseTool("Poly (2)");
  drawTriangle(10, 10);
  await waitFor(() => expect(screen.getByLabelText(/^Select Polygon 1/)).toBeTruthy());
}

describe("with Auto-Save on Navigate on, legacy's default", () => {
  it("saves the image being left BEFORE opening the next, as Enter saves it", async () => {
    const { events, saveAnnotations, confirmNavigation } = mount();
    await openAndDraw();

    next();

    await waitFor(() => expect(status()).toMatch(/frames\/b\.png/));
    expect(events).toEqual(["load frames/a.png", "save frames/a.png", "load frames/b.png"]);
    expect(confirmNavigation).not.toHaveBeenCalled();

    // Enter's save: the selected formats, conditional on the revision a.png was read at.
    const body = saveAnnotations.mock.calls[0]![2];
    expect(body["formats"]).toEqual(["NPZ", "YOLO_DETECTION"]);
    expect(body["expectedRevisions"]).toEqual({ NPZ: "rev-A" });
    expect((body["segments"] as unknown[]).length).toBe(1);
  });

  it("saves first when another image is opened from the file list, too", async () => {
    const { events, confirmNavigation } = mount();
    await openAndDraw();

    fireEvent.doubleClick(screen.getByRole("button", { name: "b.png" }));

    await waitFor(() => expect(status()).toMatch(/frames\/b\.png/));
    expect(events).toEqual(["load frames/a.png", "save frames/a.png", "load frames/b.png"]);
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("saves the frame being left when moving along the sequence timeline (SP-01)", async () => {
    const { events, confirmNavigation } = mount();
    fireEvent.click(await screen.findByRole("tab", { name: "Sequence" }));
    // The range as legacy sets it: each end opened from the list, then Set Start and Set End (SP-41).
    fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Set Start" }));
    fireEvent.doubleClick(screen.getByRole("button", { name: "b.png" }));
    await waitFor(() => expect(status()).toMatch(/b\.png/));
    fireEvent.click(screen.getByRole("button", { name: "Set End" }));
    fireEvent.click(screen.getByRole("button", { name: "Build Timeline" }));
    const cells = () => screen.getByLabelText("Timeline").querySelectorAll("button");
    await waitFor(() => expect(cells()).toHaveLength(2));
    // Build opens the first frame, as legacy's does (SP-18). The two opens that set the range go.
    await waitFor(() => expect(events).toEqual(["load frames/a.png", "load frames/b.png", "load frames/a.png"]));
    events.splice(0, 2);
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    await waitFor(() => expect(screen.getByLabelText(/^Select Polygon 1/)).toBeTruthy());

    fireEvent.click(cells()[1]!);

    await waitFor(() => expect(status()).toMatch(/frames\/b\.png/));
    expect(events).toEqual(["load frames/a.png", "save frames/a.png", "load frames/b.png"]);
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("KEEPS the image open when the save is refused, and says why where the save button does", async () => {
    const { events, saveAnnotations, confirmNavigation } = mount();
    saveAnnotations.mockRejectedValue(
      new ApiError(
        409,
        "revision_conflict",
        "frames/a.npz changed since it was read (expected aaa, found bbb); nothing was written",
        { key: "frames/a.npz" },
      ),
    );
    await openAndDraw();

    next();

    const shown = await screen.findByText(/Nothing was written/);
    expect(shown.textContent).toMatch(/frames\/a\.npz changed since you loaded it/);
    expect(screen.getByRole("button", { name: /Save anyway/ })).toBeTruthy();
    expect(status()).toMatch(/frames\/a\.png — 1 segment, unsaved/);
    expect(events).not.toContain("load frames/b.png");
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("never saves an image whose annotations could not be read: it asks, naming the risk", async () => {
    // Provenance before the setting (saveState.ts): writing this back would put the drawing over a
    // damaged file that might still be recoverable, which Enter refuses too.
    const { saveAnnotations, confirmNavigation } = mount({ a: UNREADABLE, answer: false });
    await openAndDraw();
    expect(autoSave().checked).toBe(true);

    next();

    expect(confirmNavigation).toHaveBeenCalledTimes(1);
    expect(confirmNavigation.mock.calls[0]![0]).toMatch(
      /cannot be saved automatically: its annotations could not be read/,
    );
    expect(saveAnnotations).not.toHaveBeenCalled();
    expect(status()).toMatch(/frames\/a\.png could not be read/);
  });
});

describe("in the Multi view, every move saves BOTH sides first (CP-67)", () => {
  /*
   * Legacy's next and previous in the Multi view save both viewers and then move the pair two rows
   * (main_window.py:6491-6557; CP-31). The save comes first, whatever Auto-Save on Navigate says,
   * changed or not, even where nothing then moves, and an empty viewer's files are deleted with no
   * message (main_window.py:6496-6497, 6529-6530, 6559-6636; file_navigation_manager.py:401-403).
   * The owner's decision of 2026-09-26: "Match the desktop app exactly". The web saved only the
   * side being edited, only with the setting on, and asked about the other.
   */
  const FOUR = ["a.png", "b.png", "c.png", "d.png"];

  /** a.png on the left, b.png chosen as its partner, and the right side made the one edited. */
  async function pairUp(): Promise<void> {
    fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
    await waitFor(() => expect(status()).toMatch(/a\.png/));
    fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: "frames/b.png" } });
    fireEvent.click(await screen.findByLabelText("Edit the right image"));
    await waitFor(() => expect(status()).toMatch(/frames\/b\.png/));
    await screen.findByRole("button", { name: /^Write \d+ format/ });
  }

  /** Draw on the right side, b.png, leaving it unsaved. */
  async function drawOnRight(): Promise<void> {
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    await waitFor(() => expect(status()).toMatch(/frames\/b\.png — 1 segment, unsaved/));
  }

  /** Legacy's Left: load_previous_image. */
  const previous = () => fireEvent.keyDown(document, { key: "ArrowLeft", code: "ArrowLeft" });

  it("saves both, the side not edited too, then moves the pair two rows", async () => {
    const { events, confirmNavigation } = mount({ a: TRIANGLE_AT_REV_A, names: FOUR });
    await pairUp();
    await drawOnRight();
    events.length = 0;

    next();

    await waitFor(() => expect(events).toHaveLength(4));
    expect(events.slice(0, 2)).toEqual(["save frames/a.png", "save frames/b.png"]);
    expect(events.slice(2).sort()).toEqual(["load frames/c.png", "load frames/d.png"]);
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("saves both with Auto-Save on Navigate OFF, and asks nothing", async () => {
    const { events, confirmNavigation } = mount({ a: TRIANGLE_AT_REV_A, names: FOUR });
    await pairUp();
    fireEvent.click(autoSave());
    await waitFor(() => expect(autoSave().checked).toBe(false));
    await drawOnRight();
    events.length = 0;

    next();

    await waitFor(() => expect(events).toHaveLength(4));
    expect(events.slice(0, 2)).toEqual(["save frames/a.png", "save frames/b.png"]);
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("saves them as Enter would: the selected formats, each side's own annotations and revision", async () => {
    const { saveAnnotations } = mount({ a: TRIANGLE_AT_REV_A, names: FOUR });
    await pairUp();
    await drawOnRight();
    saveAnnotations.mockClear();

    next();

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(2));
    const [first, second] = saveAnnotations.mock.calls;
    expect(first![1]).toBe("frames/a.png");
    expect(first![2]["formats"]).toEqual(["NPZ", "YOLO_DETECTION"]);
    // Conditional on what the save when the pair was made wrote, not on the load's rev-A.
    expect(first![2]["expectedRevisions"]).toEqual({ NPZ: "rev-A2", YOLO_DETECTION: "rev-T" });
    expect((first![2]["segments"] as unknown[]).length).toBe(1);
    expect(second![1]).toBe("frames/b.png");
    expect(second![2]["expectedRevisions"]).toEqual({});
    expect((second![2]["segments"] as unknown[]).length).toBe(1);
  });

  it("deletes an empty side's files, silently, and writes the other", async () => {
    // a.png is open with no segments: legacy's multi-view save deletes its files and says nothing,
    // not even "No segments to save." (main_window.py:6588-6594).
    const { events, deleteAnnotations } = mount({ names: FOUR });
    await pairUp();
    await drawOnRight();
    events.length = 0;

    next();

    await waitFor(() => expect(events).toHaveLength(4));
    expect(events.slice(0, 2)).toEqual(["delete frames/a.png", "save frames/b.png"]);
    expect(deleteAnnotations.mock.calls.at(-1)!.slice(0, 2)).toEqual(["default", "frames/a.png"]);
    expect(screen.queryByText(/^Deleted:/)).toBeNull();
    expect(screen.queryByText("No segments to save.")).toBeNull();
  });

  it("saves both at either end of the list too, before legacy's words, and moves nothing", async () => {
    // Legacy saves before it looks for the next pair, and only then finds the end of the list
    // (main_window.py:6497-6512, 6530-6547).
    const { events } = mount({ a: TRIANGLE_AT_REV_A });
    await pairUp();
    await drawOnRight();
    events.length = 0;

    next();

    expect(await screen.findByText("Reached end of image list")).toBeTruthy();
    expect(events).toEqual(["save frames/a.png", "save frames/b.png"]);

    previous();

    expect(await screen.findByText("Reached beginning of image list")).toBeTruthy();
    expect(events).toEqual(["save frames/a.png", "save frames/b.png", "save frames/a.png", "save frames/b.png"]);
  });

  it("empties the right side, just saved, without asking, when the list has only one more", async () => {
    // Legacy saves both, then loads nothing into viewer 2 (main_window.py:6497, 6516).
    const { events, confirmNavigation } = mount({ a: TRIANGLE_AT_REV_A, names: ["a.png", "b.png", "c.png"] });
    await pairUp();
    await drawOnRight();
    events.length = 0;

    next();

    await waitFor(() => expect(document.querySelector(".split__pane--empty")?.textContent).toBe("No image loaded"));
    expect(events).toEqual(["save frames/a.png", "save frames/b.png", "load frames/c.png"]);
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("saves both when the partner is changed, the Multi view's own move", async () => {
    const { events, confirmNavigation } = mount({ a: TRIANGLE_AT_REV_A });
    fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
    await waitFor(() => expect(status()).toMatch(/a\.png/));
    fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    await screen.findByRole("button", { name: /^Write \d+ format/ });

    fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: "frames/b.png" } });

    await waitFor(() => expect(events).toEqual(["load frames/a.png", "save frames/a.png", "load frames/b.png"]));
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("never writes over or deletes a side whose annotations could not be read (SEC-04)", async () => {
    // Legacy deletes such a viewer's files like any empty one's. The owner did not ask for that.
    const { events, deleteAnnotations } = mount({ a: UNREADABLE, names: FOUR });
    await pairUp();
    await drawOnRight();
    events.length = 0;

    next();

    await waitFor(() => expect(events).toHaveLength(3));
    expect(events[0]).toBe("save frames/b.png");
    expect(deleteAnnotations).not.toHaveBeenCalled();
  });

  it("keeps the pair where it is when a save fails, and says why", async () => {
    const { events, saveAnnotations } = mount({ a: TRIANGLE_AT_REV_A, names: FOUR });
    await pairUp();
    await drawOnRight();
    saveAnnotations.mockClear();
    saveAnnotations.mockRejectedValue(new Error("the disk is full"));
    events.length = 0;

    next();

    // One notice for each side it could not save, each naming its image.
    expect(await screen.findAllByText("Error saving: the disk is full")).toHaveLength(2);
    const named = [...document.querySelectorAll(".notifications__detail")].map((each) => each.textContent);
    expect(named).toEqual(expect.arrayContaining(["a.png", "b.png"]));
    // Both were tried, as legacy's loop tries each viewer, and nothing moved.
    expect(saveAnnotations.mock.calls.map((call) => call[1])).toEqual(["frames/a.png", "frames/b.png"]);
    expect(events).toEqual([]);
    expect(status()).toMatch(/frames\/b\.png — 1 segment, unsaved/);
  });

  it("saves only the image moved on the Single tab, though a second side is still open", async () => {
    // Legacy's Single view has one image, and saves that one, with Auto-Save on (RULE-059).
    const { events } = mount({ a: TRIANGLE_AT_REV_A, names: FOUR });
    await pairUp();
    fireEvent.click(screen.getByRole("tab", { name: "Single" }));
    await drawOnRight();
    events.length = 0;

    next();

    await waitFor(() => expect(events).toEqual(["save frames/b.png", "load frames/c.png"]));
  });
});

describe("leaving the Sequence tab (SP-15)", () => {
  it("reloads the open image from its file, dropping its unsaved work UNASKED and UNSAVED", async () => {
    // Legacy tears the timeline down and loads the image from disk when the Sequence tab is left
    // (main_window.py:3043-3056, 7242-7272), whatever Auto-Save on Navigate says: changing tabs is
    // not moving to another image. The owner's decision of 2026-09-26: "Match the desktop app
    // exactly". The web kept the image as it was.
    const { events, saveAnnotations, confirmNavigation } = mount();
    await openAndDraw();
    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));
    await screen.findByRole("button", { name: "Set Start" });
    expect(status()).toMatch(/frames\/a\.png — 1 segment, unsaved/);

    fireEvent.click(screen.getByRole("tab", { name: "Single" }));

    await waitFor(() => expect(status()).toMatch(/frames\/a\.png — 0 segments, saved/));
    expect(events).toEqual(["load frames/a.png", "load frames/a.png"]);
    expect(saveAnnotations).not.toHaveBeenCalled();
    expect(confirmNavigation).not.toHaveBeenCalled();
    expect(await screen.findByText("Timeline cleared. Set new start/end frames.")).toBeTruthy();
  });

  it("leaves the image alone on the other tabs' changes", async () => {
    // Only leaving the Sequence tab reloads: Single to Multi and back keeps the side as it is.
    const { events } = mount();
    await openAndDraw();

    fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    fireEvent.click(screen.getByRole("tab", { name: "Single" }));

    expect(status()).toMatch(/frames\/a\.png — 1 segment, unsaved/);
    expect(events).toEqual(["load frames/a.png"]);
  });
});

describe("with Auto-Save on Navigate turned off", () => {
  it("asks before discarding, as before, and writes nothing", async () => {
    const { saveAnnotations, confirmNavigation, putSettings } = mount({ answer: false });
    await openAndDraw();

    fireEvent.click(autoSave());
    await waitFor(() => expect(autoSave().checked).toBe(false));
    expect(putSettings.mock.calls.at(-1)![0]).toMatchObject({ values: { auto_save: false } });

    next();

    expect(confirmNavigation).toHaveBeenCalledTimes(1);
    expect(confirmNavigation.mock.calls[0]![0]).toMatch(/frames\/a\.png has 1 segment/);
    expect(status()).toMatch(/frames\/a\.png — 1 segment, unsaved/);
    expect(saveAnnotations).not.toHaveBeenCalled();
  });
});
