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
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";

afterEach(cleanup);

const LISTING: WireDatasetListing = {
  folder: "frames",
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
    thumbnailUrl: () => "/api/thumbnail",
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    saveAnnotations: async () => ({ written: { NPZ: "r1", YOLO_DETECTION: "r2" }, stale: [], skippedEmpty: [] }),
    ...overrides,
  } as unknown as ApiClient;

  return render(
    <SettingsProvider client={api}>
      <DatasetBrowser client={api} projectId="p1" folder="frames" />
    </SettingsProvider>,
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
    await waitFor(() => expect(screen.getByText("Formats to write")).toBeTruthy());

    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(7);

    // The shipped defaults, from the settings schema.
    const checked = boxes.filter((box) => box.checked);
    expect(checked).toHaveLength(2);
  });

  it("persists the choice, so it is there on the next visit", async () => {
    const putSettings = vi.fn(async (settings: unknown) => settings);
    show({ putSettings });

    await waitFor(() => expect(screen.getByText("Formats to write")).toBeTruthy());
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

    await waitFor(() => expect(screen.getByText("Formats to write")).toBeTruthy());
    screen.getByRole("checkbox", { name: /NPZ \.npz/ }).click();

    // An empty selection makes a save write no files and still report success. Legacy silently
    // re-checks the box; this refuses and explains, which is the same rule without the sleight.
    await waitFor(() => expect(screen.getByText(/only selected format/)).toBeTruthy());
    expect(screen.getByText(/writes no files at all/)).toBeTruthy();
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
    expect(saveAnnotations).toHaveBeenCalledWith("p1", "frames/a.png", {
      imageSize: [1080, 1920],
      formats: ["NPZ", "YOLO_DETECTION"],
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
