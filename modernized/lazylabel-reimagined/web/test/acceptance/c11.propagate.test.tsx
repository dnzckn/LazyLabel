/**
 * C11 — propagate labels through a sequence and review them by confidence.
 *
 * Through the SHELL, not through the control, because what this capability claims is that a person
 * can reach it: open the app, find the sequence panel, build a timeline, and propagate from a frame
 * they have annotated. `test/sequence/propagation.test.tsx` drives the component; this drives the
 * app.
 *
 * The distinction has earned its place repeatedly here — vertex editing, the adjustment sliders and
 * undo/redo were each implemented, tested and unreachable, with every component test passing.
 *
 * That the results match legacy's is `c11.goldens.test.tsx`'s claim, against legacy's own sequence
 * mode, and the panel says on screen how far it reaches rather than leaving silence to be read as
 * confidence.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import type { ApiClient } from "../../src/api/client.js";

afterEach(cleanup);

const FRAMES = [
  { name: "f01.png", annotated: true },
  { name: "f02.png", annotated: false },
  { name: "f03.png", annotated: false },
  { name: "f04.png", annotated: false },
];

/** A square the user drew on the reference frame. */
const SQUARE = {
  type: "Polygon",
  classId: 3,
  vertices: [
    [2, 2],
    [12, 2],
    [12, 12],
    [2, 12],
  ],
};

/** A 10x10 propagated region, as the wire carries one. */
const MASK = {
  height: 16,
  width: 16,
  box: [2, 2, 12, 12],
  data: btoa(String.fromCharCode(1).repeat(100)),
};

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    state: "completed",
    completed: 3,
    total: 3,
    cursor: 3,
    cancelling: false,
    error: null,
    results: [],
    ...overrides,
  };
}

function mount() {
  const started: unknown[] = [];
  const saved: string[] = [];
  /** The images whose sidecars were deleted: a save with no segments (RULE-083). */
  const deleted: string[] = [];

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: true, reason: null, videoCapable: true, accelerator: "test" },
    }),
    listImages: async () => ({
      folder: "frames",
      folders: [],
      annotatedCount: 1,
      unrecognized: 0,
      columns: [{ format: "NPZ", suffix: ".npz" }],
      images: FRAMES.map(({ name, annotated }) => ({
        key: `frames/${name}`,
        name,
        sidecars: { NPZ: annotated },
        annotated,
        sharesSidecarsWith: [],
      })),
    }),
    imageMetadata: async () => ({
      width: 16,
      height: 16,
      sourceDepth: 8,
      sourceChannels: 3,
      sourceFormat: "png",
    }),
    loadAnnotations: async (_project: string, key: string) => ({
      kind: "loaded",
      annotations: {
        sourceFormat: "NPZ",
        sourceFile: key,
        revision: "r1",
        segments: key.endsWith("f01.png") ? [SQUARE] : [],
        classAliases: {},
        failures: [],
      },
    }),
    startPropagation: vi.fn(async (request: unknown) => {
      started.push(request);
      return job({ state: "running", completed: 0 });
    }),
    propagationState: async () =>
      job({
        results: [
          { source: "frames/f02.png", objectId: 1, mask: MASK, confidence: 0.995 },
          { source: "frames/f03.png", objectId: 1, mask: MASK, confidence: 0.4 },
        ],
      }),
    saveAnnotations: async (_project: string, key: string) => {
      saved.push(key);
      return { written: [], stale: [], skippedEmpty: [] };
    },
    // Only f01 has a sidecar; a frame the run produced a mask for has none to delete.
    deleteAnnotations: async (_project: string, key: string) => {
      deleted.push(key);
      return { deleted: key.endsWith("f01.png") ? ["frames/f01.npz"] : [] };
    },
    models: async () => [],
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default">
            <App client={client} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { started, saved, deleted, client };
}

async function openTimeline() {
  fireEvent.click(await screen.findByRole("tab", { name: "Sequence" }));
  // The whole folder, as a user sets it: each end opened from the list, then Set Start and Set End.
  fireEvent.doubleClick(await screen.findByRole("button", { name: "f01.png" }));
  fireEvent.click(screen.getByRole("button", { name: "Set Start" }));
  fireEvent.doubleClick(screen.getByRole("button", { name: "f04.png" }));
  fireEvent.click(screen.getByRole("button", { name: "Set End" }));
  fireEvent.click(screen.getByRole("button", { name: "Build Timeline" }));
  // Building marks nothing since 2026-09-23, as in legacy: the reference is marked as a user marks it.
  fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Timeline").querySelectorAll("button")).toHaveLength(4),
  );
}

const cellLabels = () =>
  [...screen.getByLabelText("Timeline").querySelectorAll("button")].map((cell) =>
    cell.getAttribute("aria-label"),
  );

describe("C11: propagate labels through a sequence", () => {
  it("is reachable from the shell", async () => {
    mount();
    await openTimeline();

    expect(screen.getByRole("button", { name: /^Propagate/ })).toBeTruthy();
  });

  it("carries the user's OWN annotation from the reference frame", async () => {
    // Legacy seeds with `add_new_mask`, not with clicks. Re-deriving a prompt from someone's
    // polygon and clicking it again gives a mask close to theirs and not theirs.
    const { started } = mount();
    await openTimeline();

    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));

    await waitFor(() => expect(started).toHaveLength(1));
    const request = started[0] as { sequence: string[]; objects: { frame: number }[] };
    expect(request.sequence).toEqual(FRAMES.map((each) => `frames/${each.name}`));
    expect(request.objects[0]!.frame).toBe(0);
  });

  it("colours the timeline by confidence as the results arrive", async () => {
    // RULE-060: the frame at 0.4 is flagged for review, the one at 0.995 is not. That is the
    // review half of this capability, and it is what the confidence is FOR.
    mount();
    await openTimeline();

    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));

    await waitFor(() => expect(cellLabels()[2]).toContain("flagged"), { timeout: 3000 });
  });

  it("shows a propagated frame's MASKS when you open it — RULE-090", async () => {
    /*
     * The review half of this capability, and it was missing. A propagation put colours on the
     * timeline and a Save button on screen, and opening one of the frames it had just produced a
     * mask for showed whatever the sidecar held -- nothing, for a frame never annotated. The masks
     * could be saved without ever being looked at.
     */
    mount();
    await openTimeline();
    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    await waitFor(() => expect(cellLabels()[1]).toContain("propagated"), { timeout: 3000 });

    // Frame 2 (index 1) is the one the propagation returned a mask for.
    fireEvent.click(screen.getByLabelText("Timeline").querySelectorAll("button")[1]!);

    /*
     * THE SEGMENT ITSELF, not merely that the image is dirty. An earlier version of this test
     * asserted only "unsaved", and a mutation that removed the segment override still passed --
     * because the dirty flag is set on a different line. A test that survives the removal of the
     * thing it is named after is not testing that thing.
     *
     * f02 has no sidecar of its own, so any segment on screen came from the propagation. The
     * class is 3, carried from the polygon that seeded the run, which is what makes it saveable.
     * "Loaded", because legacy merges a visited frame's masks into one Loaded segment per class
     * (main_window.py:3597-3606, SEQUENCE_PARITY.md SP-07).
     */
    await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/f02\.png/));
    await waitFor(() => expect(screen.getByLabelText("Select Loaded 1, class 3")).toBeTruthy());
  });

  it("does NOT replace a reference frame's own drawing", async () => {
    // The one substitution propagation must not make. A reference is the user's work; showing the
    // model's reconstruction of it in its place is the same mistake Save All refuses to make.
    mount();
    await openTimeline();
    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    await waitFor(() => expect(cellLabels()[1]).toContain("propagated"), { timeout: 3000 });

    fireEvent.click(screen.getByLabelText("Timeline").querySelectorAll("button")[0]!);

    await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/f01\.png/));
    // Its OWN polygon, from its own file -- not the propagation's mask of the same object.
    await waitFor(() => expect(screen.getByLabelText("Select Polygon 1, class 3")).toBeTruthy());
    expect(screen.queryByLabelText(/Select (AI|Loaded)/)).toBeNull();
  });

  it("says when the run is complete, in legacy's words", async () => {
    // main_window.py:4631-4634. How far agreement with legacy has been shown is recorded in
    // SEQUENCE_PARITY.md, and no longer printed on screen: the owner wants no paragraphs.
    mount();
    await openTimeline();

    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));

    expect(
      await screen.findByText(
        // f02 stored; f03, at 0.4 with Keep Flagged Masks off, flagged and not stored.
        "Propagation complete: 1 frames, 1 flagged. Scrub timeline or click 'Save All' to save.",
        undefined,
        { timeout: 3000 },
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/agrees with legacy frame for frame/)).toBeNull();
  });
});

describe("SP-58: a propagated frame emptied by hand", () => {
  /*
   * Legacy's save of a frame with no segments deletes its seven sidecar formats and does NOT mark it
   * saved, so the frame keeps its status and its propagated masks, and Save All writes them back
   * (main_window.py:3499-3515; save_export_manager.py:106-109, 523-542). The owner's decision of
   * 2026-09-26: "Match the desktop app exactly". The web wrote an empty file in each selected format,
   * counted it as the user's correction, showed the frame saved and dropped its masks.
   */
  const status = () => screen.getByLabelText("Status").textContent ?? "";

  /** Propagate, open the frame the run produced a mask for, and delete what it shows. */
  async function emptyThePropagatedFrame() {
    const handles = mount();
    await openTimeline();
    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    await waitFor(() => expect(cellLabels()[1]).toContain("propagated"), { timeout: 3000 });
    fireEvent.click(screen.getByLabelText("Timeline").querySelectorAll("button")[1]!);
    fireEvent.click(await screen.findByLabelText("Select Loaded 1, class 3"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(status()).toMatch(/frames\/f02\.png — 0 segments, unsaved/));
    await screen.findByRole("button", { name: /^Write \d+ format/ });
    return handles;
  }

  it("deletes on Enter, writes nothing, and keeps the frame's status and masks for Save All", async () => {
    const { saved, deleted } = await emptyThePropagatedFrame();

    fireEvent.keyDown(document, { key: "Enter", code: "Enter" });

    // It had no file, so legacy's words for nothing deleted.
    expect(await screen.findByText("Warning: No segments to save.")).toBeTruthy();
    expect(deleted).toEqual(["frames/f02.png"]);
    expect(saved).not.toContain("frames/f02.png");
    await waitFor(() => expect(status()).toMatch(/frames\/f02\.png — 0 segments, saved/));
    expect(cellLabels()[1]).toContain("propagated");

    fireEvent.click(screen.getByRole("button", { name: "Save All" }));
    await waitFor(() => expect(saved).toContain("frames/f02.png"));
  });

  it("deletes the same way when the frame is left, and reopens it with the run's masks", async () => {
    const { saved, deleted } = await emptyThePropagatedFrame();

    fireEvent.click(screen.getByLabelText("Timeline").querySelectorAll("button")[3]!);
    await waitFor(() => expect(status()).toMatch(/frames\/f04\.png/));

    expect(deleted).toEqual(["frames/f02.png"]);
    expect(saved).not.toContain("frames/f02.png");
    expect(cellLabels()[1]).toContain("propagated");

    fireEvent.click(screen.getByLabelText("Timeline").querySelectorAll("button")[1]!);
    await waitFor(() => expect(status()).toMatch(/frames\/f02\.png/));
    expect(await screen.findByLabelText("Select Loaded 1, class 3")).toBeTruthy();
  });
});

describe("RULE-058: the open frame keeps its unsaved work through finish, Save All and Trim", () => {
  /*
   * Legacy clears and reloads the current frame after a propagation finishes, after Save All and
   * after a trim, so unsaved annotations on it are lost -- even on the reference the run was just
   * seeded from (P0, a recorded defect). This app reloads nothing behind the user's back: the open
   * frame stays exactly as it was, still marked unsaved, for the user to save or discard.
   *
   * Until 2026-09-23 the only mention of RULE-058 in any test was the P0 guard's own header, which
   * the guard counted as coverage.
   */
  const status = () => screen.getByLabelText("Status").textContent ?? "";
  const UNSAVED = /frames\/f01\.png — 0 segments, unsaved/;

  it("leaves a deleted polygon deleted, and unsaved, through all three", async () => {
    const { saved } = mount();
    await openTimeline();

    // The reference frame, open, with its polygon deleted and not saved.
    fireEvent.click(screen.getByLabelText("Timeline").querySelectorAll("button")[0]!);
    fireEvent.click(await screen.findByLabelText("Select Polygon 1, class 3"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(status()).toMatch(UNSAVED));

    // 1. A propagation finishes.
    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    await waitFor(() => expect(cellLabels()[1]).toContain("propagated"), { timeout: 3000 });
    expect(status()).toMatch(UNSAVED);

    // 2. Save All writes the propagated frames -- and not the open one.
    fireEvent.click(await screen.findByRole("button", { name: "Save All" }));
    await waitFor(() => expect(saved).toContain("frames/f02.png"));
    expect(saved).not.toContain("frames/f01.png");
    expect(status()).toMatch(UNSAVED);

    // 3. A trim that keeps only the open frame.
    fireEvent.click(screen.getByRole("button", { name: "Set Left" }));
    fireEvent.click(screen.getByRole("button", { name: "Set Right" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await screen.findByText("Removed 3 frames from timeline");
    expect(status()).toMatch(UNSAVED);
    expect(screen.queryByLabelText("Select Polygon 1, class 3")).toBeNull();
  });
});
