/**
 * C12 — Convert a dataset from one annotation format to another: the browser's share.
 *
 * Persona flow 4, steps two and four: choose the formats the pipeline needs, and write them beside
 * the image. The API's share — that the bytes match legacy's exactly — is proven against the Phase 1
 * goldens in the api package; what belongs here is that the user can choose, that the choice
 * persists, and that a save which is less than it looks says so.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";
import type { WireDatasetListing } from "@lazylabel/contracts";

import { DatasetBrowser } from "../../src/dataset/DatasetBrowser.jsx";
import { ExportFormats } from "../../src/dataset/ExportFormats.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";

afterEach(cleanup);

const LISTING: WireDatasetListing = {
  folder: "frames",
  // A leaf: this folder holds images and nothing below it. Folder navigation has its own
  // tests in `test/dataset/folders.test.tsx`.
  folders: [],
  columns: [{ format: "NPZ", suffix: ".npz" }],
  annotatedCount: 1,
  unrecognized: 0,
  images: [
    {
      key: "frames/a.png",
      name: "a.png",
      sidecars: { NPZ: true },
      annotated: true,
      sharesSidecarsWith: [],
    },
  ],
};

const LOADED: AnnotationsResult = {
  kind: "loaded",
  annotations: {
    sourceFormat: "NPZ",
    sourceFile: "frames/a.npz",
    revision: "r1",
    segments: [{ type: "Loaded", classId: 3 }],
    classAliases: { "3": "stop sign" },
    rejected: 0,
    failures: [],
  },
};

function show(overrides: Record<string, unknown> = {}) {
  const api = {
    listImages: async () => LISTING,
    loadAnnotations: async () => LOADED,
    imageMetadata: async () => ({ width: 1920, height: 1080, sourceDepth: 8, sourceFormat: "png" }),
    pixelsUrl: () => "/api/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/api/thumbnail",
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    saveAnnotations: async () => ({ written: { NPZ: "r1", YOLO_DETECTION: "r2" }, stale: [], skippedEmpty: [] }),
    ...overrides,
  } as unknown as ApiClient;

  return render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        {/* The list and the opened image are two components now, one per pane. Mounting both is
            mounting what the app mounts -- the capability spans them. */}
        {/* `useHotkey` throws without a provider by design -- a hook that quietly works without
            one hides a missing wire, which is this project's longest-running defect family. The
            save and selection keys live in these components, so the tests supply it. */}
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={api} projectId="p1">
          <DatasetBrowser client={api} projectId="p1" folder="frames" />
          {/* In Application Settings in the app, where legacy's Export Formats is. */}
          <ExportFormats />
          <OpenImageView client={api} projectId="p1" />
        </WorkspaceProvider>
      </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

/** Open the one image in the listing and wait for its annotations. */
async function openImage(): Promise<void> {
  await waitFor(() => expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy());
  screen.getByRole("button", { name: "a.png" }).click();
  await waitFor(() => expect(screen.getByText(/1 objects, read from/)).toBeTruthy());
}

describe("C12: converting a dataset in the browser", () => {
  it("offers all seven formats, with the defaults already chosen", async () => {
    show();
    await waitFor(() => expect(screen.getByText("Export Formats")).toBeTruthy());

    // Scoped to the format chooser: the browser's column switches are checkboxes too, and an
    // unscoped query counts both. They are told apart by their labels -- a column switch says
    // "Show the NPZ OHE column" -- rather than by their order, which nothing guarantees.
    const boxes = (screen.getAllByRole("checkbox") as HTMLInputElement[]).filter(
      (box) => !(box.getAttribute("aria-label") ?? "").startsWith("Show the "),
    );
    expect(boxes).toHaveLength(7);

    // The shipped defaults, from the settings schema.
    const checked = boxes.filter((box) => box.checked);
    expect(checked).toHaveLength(2);
  });

  it("persists the choice, so it is there on the next visit", async () => {
    const putSettings = vi.fn(async (settings: unknown) => settings);
    show({ putSettings });

    await waitFor(() => expect(screen.getByText("Export Formats")).toBeTruthy());
    screen.getByRole("checkbox", { name: /PASCAL_VOC/ }).click();

    // Persona flow 4 says the choice is saved to settings. Decision 7 saves it when it changes
    // rather than on exit, which is the behaviour that lost the last image's work.
    await waitFor(() => expect(putSettings).toHaveBeenCalled());
    const saved = putSettings.mock.calls[0]![0] as { values: { export_formats: string[] } };
    expect(saved.values.export_formats).toContain("PASCAL_VOC");
  });

  it("refuses to clear the last format, and says why (RULE-088)", async () => {
    show({
      getSettings: async () => {
        const base = defaultSettings();
        return { ...base, values: { ...base.values, export_formats: ["NPZ"] } };
      },
    });

    await waitFor(() => expect(screen.getByText("Export Formats")).toBeTruthy());
    screen.getByRole("checkbox", { name: /NPZ \.npz/ }).click();

    // An empty selection makes a save write no files and still report success. Legacy silently
    // re-checks the box; this refuses, in the words of legacy's own tooltip, and keeps the box on.
    await waitFor(() => expect(screen.getByText("At least one format must be selected.")).toBeTruthy());
    expect((screen.getByRole("checkbox", { name: /NPZ \.npz/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("writes the chosen formats beside the image and says which", async () => {
    const saveAnnotations = vi.fn(async () => ({
      written: { NPZ: "r1", YOLO_DETECTION: "r2" },
      stale: [],
      skippedEmpty: [],
    }));
    show({ saveAnnotations });

    await openImage();
    screen.getByRole("button", { name: /Write 2 formats/ }).click();

    await waitFor(() => expect(screen.getByText(/Wrote NPZ, YOLO_DETECTION beside a\.png/)).toBeTruthy());

    // The size comes from the image metadata, and the annotations are the ones just loaded.
    // `cropCoords: null` is sent EXPLICITLY rather than left out. RULE-018 blanks what falls
    // outside a crop, so "there is no crop" and "this client never mentioned one" have to be
    // distinguishable on the wire -- a field the server has to guess at is a field that can be
    // guessed wrong in the direction that deletes annotations.
    expect(saveAnnotations).toHaveBeenCalledWith("p1", "frames/a.png", {
      imageSize: [1080, 1920],
      formats: ["NPZ", "YOLO_DETECTION"],
      cropCoords: null,
      // The revision of the file these annotations came FROM, so the write is conditional on it.
      // Every save was an unconditional overwrite until this shipped, which matters most in the
      // arrangement the cutover plan describes: the desktop app stays installed and reads the same
      // folder, so whichever wrote last used to win silently.
      expectedRevisions: { NPZ: "r1" },
      // RULE-012, and it is sent EXPLICITLY for the same reason the crop is: the server has a
      // default, and a field the client omits is a decision the client has silently handed over.
      // Both settings ship off, which matches the server's own default -- but the point is that
      // they now travel at all, because for a while they did not and the settings did nothing.
      pixelPriority: { enabled: false, ascending: true },
      segments: LOADED.kind === "loaded" ? LOADED.annotations.segments : [],
      classAliases: { "3": "stop sign" },
    });
  });

  it("reports sidecars it did not rewrite, which may now disagree (decision 15f)", async () => {
    show({
      saveAnnotations: async () => ({
        written: { NPZ: "r1" },
        stale: ["COCO_JSON", "PASCAL_VOC"],
        skippedEmpty: [],
      }),
    });

    await openImage();
    screen.getByRole("button", { name: /Write/ }).click();

    // Reported, never deleted. A converted dataset with an old COCO file beside a new NPZ is a
    // trap for whatever reads it next.
    await waitFor(() => expect(screen.getByText(/still\s+on disk/)).toBeTruthy());
    expect(screen.getByText(/Nothing has been deleted/)).toBeTruthy();
  });

  it("says nothing was written when the save fails, rather than looking done", async () => {
    show({
      saveAnnotations: async () => {
        throw new Error("the dataset folder is read-only");
      },
    });

    await openImage();
    screen.getByRole("button", { name: /Write/ }).click();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Nothing was written/));
  });
});
