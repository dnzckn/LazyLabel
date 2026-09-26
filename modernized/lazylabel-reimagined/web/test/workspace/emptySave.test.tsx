/**
 * Saving an image with no segments deletes its annotation files, as legacy's save does -- RULE-083.
 *
 * Legacy's save of an image with no segments deletes all seven sidecar formats, whatever formats are
 * selected, and says "Deleted: a_coco.json, a.npz, a.txt", or warns "No segments to save." when
 * there was nothing to delete (save_export_manager.py:106-109, 523-542; core/exporters/__init__.py:
 * 209-215). Enter does it, and so does leaving the image with Auto-Save on Navigate on
 * (file_navigation_manager.py:157-160, 270-274). The owner's decision of 2026-09-26, "Match the
 * desktop app exactly", reversed this app's rule that a save never deletes (SEQUENCE_PARITY.md
 * SP-58). The web wrote an empty file in each selected format instead.
 *
 * What stays: an image whose annotations could not be READ is never written over or deleted
 * (ASSESSMENT.md SEC-04). Legacy deletes those too; the owner did not ask for that.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
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

const TRIANGLE = { type: "Polygon", classId: 0, vertices: [[10, 10], [50, 10], [50, 40]] };

const row = (name: string) => ({
  key: `frames/${name}`,
  name,
  sidecars: { NPZ: true },
  annotated: true,
  sharesSidecarsWith: [],
});

/** a.png's NPZ, holding one triangle, at a known revision. */
const ONE_TRIANGLE = {
  kind: "loaded",
  annotations: {
    segments: [TRIANGLE],
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
  a = ONE_TRIANGLE,
  onDisk = ["frames/a_coco.json", "frames/a.npz", "frames/a.txt"],
  answer = false,
}: { a?: AnnotationsResult; onDisk?: readonly string[]; answer?: boolean } = {}) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);

  /** What reached the server, in order. */
  const events: string[] = [];
  const saveAnnotations = vi.fn(async (_project: string, key: string, _body: Record<string, unknown>) => {
    events.push(`save ${key}`);
    return { written: { NPZ: "rev-A2" }, stale: [] as string[], skippedEmpty: [] as string[] };
  });
  // The API answers with what it removed, in legacy's order; `onDisk` is what was there.
  const deleteAnnotations = vi.fn(async (_project: string, key: string) => {
    events.push(`delete ${key}`);
    return { deleted: key === "frames/a.png" ? onDisk : [] };
  });
  const confirmNavigation = vi.fn((_summary: string) => answer);
  const listImages = vi.fn(async () => ({
    folder: "frames",
    folders: [],
    annotatedCount: 1,
    unrecognized: 0,
    columns: [{ format: "NPZ", suffix: ".npz" }],
    images: [row("a.png"), row("b.png")],
  }));

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
    listImages,
    loadAnnotations: async (_project: string, key: string) => {
      events.push(`load ${key}`);
      return key === "frames/a.png" ? a : { kind: "none" };
    },
    imageMetadata: async () => ({ width: 200, height: 100, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
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

  return { events, saveAnnotations, deleteAnnotations, confirmNavigation, listImages };
}

const status = () => screen.getByLabelText("Status").textContent ?? "";
/** Legacy's Enter: save_output. */
const enter = () => fireEvent.keyDown(document, { key: "Enter", code: "Enter" });

/** Open a.png from the file list, with its save key live. */
async function openA(): Promise<void> {
  fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
  await waitFor(() => expect(status()).toMatch(/frames\/a\.png/));
  await screen.findByRole("button", { name: /^Write \d+ format/ });
}

/** Delete a.png's one triangle, leaving it unsaved with no segments. */
async function emptyA(): Promise<void> {
  await openA();
  fireEvent.click(await screen.findByLabelText("Select Polygon 1, class 0"));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(status()).toMatch(/frames\/a\.png — 0 segments, unsaved/));
}

describe("RULE-083: a save with no segments deletes, as legacy's does", () => {
  it("deletes all seven formats on Enter, whatever is selected, and names them in legacy's words", async () => {
    const { deleteAnnotations, saveAnnotations } = mount();
    await emptyA();

    enter();

    expect(await screen.findByText("Deleted: a_coco.json, a.npz, a.txt")).toBeTruthy();
    expect(deleteAnnotations).toHaveBeenCalledTimes(1);
    expect(deleteAnnotations.mock.calls[0]!.slice(0, 2)).toEqual(["default", "frames/a.png"]);
    // No empty file in any format: nothing is written.
    expect(saveAnnotations).not.toHaveBeenCalled();
    // As its files are now, so nothing is unsaved.
    await waitFor(() => expect(status()).toMatch(/frames\/a\.png — 0 segments, saved/));
  });

  it("reads the folder again after deleting, so the file list's format columns follow", async () => {
    // The list re-reads after a save (saveCounts), but a deletion is not counted as a save there,
    // since the timeline reads that as "saved" (SP-58). Without its own count the ticks went stale.
    const { listImages } = mount();
    await emptyA();
    const before = listImages.mock.calls.length;

    enter();

    expect(await screen.findByText("Deleted: a_coco.json, a.npz, a.txt")).toBeTruthy();
    await waitFor(() => expect(listImages.mock.calls.length).toBeGreaterThan(before));
  });

  it("says legacy's \"No segments to save.\" when there was nothing to delete", async () => {
    const { deleteAnnotations } = mount({ a: { kind: "none" }, onDisk: [] });
    await openA();

    enter();

    expect(await screen.findByText("No segments to save.")).toBeTruthy();
    expect(deleteAnnotations).toHaveBeenCalledTimes(1);
  });

  it("deletes the same way on leaving the image with Auto-Save on, before the next one opens", async () => {
    // Legacy's leaving save is Enter's save (file_navigation_manager.py:270-274).
    const { events, confirmNavigation } = mount();
    await emptyA();

    fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });

    await waitFor(() => expect(status()).toMatch(/frames\/b\.png/));
    expect(events).toEqual(["load frames/a.png", "delete frames/a.png", "load frames/b.png"]);
    expect(confirmNavigation).not.toHaveBeenCalled();
    expect(await screen.findByText("Deleted: a_coco.json, a.npz, a.txt")).toBeTruthy();
  });

  it("writes the next save unconditionally: the file it was read from is gone", async () => {
    // Conditional on the deleted NPZ's revision, the next write would be refused as a conflict with
    // the app's own deletion.
    const { saveAnnotations } = mount();
    await emptyA();
    enter();
    await waitFor(() => expect(status()).toMatch(/0 segments, saved/));

    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    await waitFor(() => expect(status()).toMatch(/1 segment, unsaved/));
    enter();

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(1));
    expect(saveAnnotations.mock.calls[0]![2]["expectedRevisions"]).toEqual({});
  });
});

describe("SEC-04: an image whose annotations could not be read is never deleted", () => {
  it("deletes nothing on Enter, though it has no segments, and says why", async () => {
    // Its segment list is empty because the read failed, which legacy's save reads as "delete".
    const { deleteAnnotations, saveAnnotations } = mount({ a: UNREADABLE });
    await openA();
    expect(status()).toMatch(/frames\/a\.png could not be read/);

    enter();

    expect(await screen.findByText(/this image's annotations could not be read/)).toBeTruthy();
    expect(deleteAnnotations).not.toHaveBeenCalled();
    expect(saveAnnotations).not.toHaveBeenCalled();
  });

  it("asks on leaving it emptied, instead of deleting, whatever Auto-Save says", async () => {
    const { deleteAnnotations, confirmNavigation } = mount({ a: UNREADABLE, answer: false });
    await openA();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    fireEvent.click(await screen.findByLabelText("Select Polygon 1, class 0"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByLabelText("Select Polygon 1, class 0")).toBeNull());

    fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });

    expect(confirmNavigation).toHaveBeenCalledTimes(1);
    expect(confirmNavigation.mock.calls[0]![0]).toMatch(/cannot be saved automatically/);
    expect(deleteAnnotations).not.toHaveBeenCalled();
  });
});
