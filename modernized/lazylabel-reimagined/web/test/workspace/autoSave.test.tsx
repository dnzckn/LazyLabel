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

  return { events, saveAnnotations, confirmNavigation, putSettings };
}

const status = () => screen.getByLabelText("Status").textContent ?? "";
const autoSave = () => screen.getByLabelText("Auto-Save on Navigate") as HTMLInputElement;
/** Legacy's Right: load_next_image. */
const next = () => fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });

/** Open a.png from the file list and draw one triangle on it, leaving it unsaved. */
async function openAndDraw(): Promise<void> {
  await waitFor(() => expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "a.png" }));
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

    fireEvent.click(screen.getByRole("button", { name: "b.png" }));

    await waitFor(() => expect(status()).toMatch(/frames\/b\.png/));
    expect(events).toEqual(["load frames/a.png", "save frames/a.png", "load frames/b.png"]);
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("saves the frame being left when moving along the sequence timeline (SP-01)", async () => {
    const { events, confirmNavigation } = mount();
    fireEvent.click(await screen.findByRole("tab", { name: "Sequence" }));
    // The range as legacy sets it: each end opened from the list, then Set Start and Set End (SP-41).
    fireEvent.click(await screen.findByRole("button", { name: "a.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Set Start" }));
    fireEvent.click(screen.getByRole("button", { name: "b.png" }));
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

  it("saves the side being edited when the PAIR moves, in the Multi view", async () => {
    const { events, confirmNavigation } = mount({ names: ["a.png", "b.png", "c.png", "d.png"] });
    await waitFor(() => expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "a.png" }));
    await waitFor(() => expect(status()).toMatch(/a\.png/));
    fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: "frames/b.png" } });
    fireEvent.click(await screen.findByLabelText("Edit the right image"));
    await waitFor(() => expect(status()).toMatch(/b\.png/));
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    await waitFor(() => expect(status()).toMatch(/frames\/b\.png — 1 segment, unsaved/));

    // Legacy's Right: load_next_image, which in the Multi view moves the pair to the next two
    // (main_window.py:6491-6522; CP-31). The side being left with work on it is saved first.
    next();

    await waitFor(() => expect(events).toHaveLength(5));
    expect(events.slice(0, 3)).toEqual(["load frames/a.png", "load frames/b.png", "save frames/b.png"]);
    expect(events.slice(3).sort()).toEqual(["load frames/c.png", "load frames/d.png"]);
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
