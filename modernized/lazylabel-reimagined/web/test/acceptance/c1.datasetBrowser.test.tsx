/**
 * C1 — Open a folder of images and see which already carry annotations: the browser's share.
 *
 * The API's share is tested against a real folder on disk in the api package. What belongs here is
 * what the browser owes the capability: showing the per-format status, showing the two things
 * legacy never told anyone, and opening an image so its annotations actually load.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetListing } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import { DatasetBrowser } from "../../src/dataset/DatasetBrowser.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";

afterEach(cleanup);

const COLUMNS = [
  { format: "NPZ", suffix: ".npz" },
  { format: "YOLO_SEGMENTATION", suffix: "_seg.txt" },
  { format: "COCO_JSON", suffix: "_coco.json" },
  { format: "NPZ_CLASS_MAP", suffix: "_CM.npz" },
  { format: "PASCAL_VOC", suffix: ".xml" },
  { format: "CREATEML", suffix: "_createml.json" },
  { format: "YOLO_DETECTION", suffix: ".txt" },
];

function sidecars(...present: string[]): Record<string, boolean> {
  return Object.fromEntries(COLUMNS.map((c) => [c.format, present.includes(c.format)]));
}

function listing(overrides: Partial<WireDatasetListing> = {}): WireDatasetListing {
  return {
    folder: "frames",
    // A leaf: this folder holds images and nothing below it. Folder navigation has its own
    // tests in `test/dataset/folders.test.tsx`.
    folders: [],
    columns: COLUMNS,
    annotatedCount: 1,
    unrecognized: 0,
    images: [
      {
        key: "frames/a.png",
        name: "a.png",
        sidecars: sidecars("NPZ"),
        annotated: true,
        sharesSidecarsWith: [],
      },
      {
        key: "frames/b.png",
        name: "b.png",
        sidecars: sidecars(),
        annotated: false,
        sharesSidecarsWith: [],
      },
    ],
    ...overrides,
  };
}

function client(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listImages: async () => listing(),
    loadAnnotations: async (): Promise<AnnotationsResult> => ({ kind: "none" }),
    imageMetadata: async () => ({ width: 1920, height: 1080, sourceDepth: 8, sourceFormat: "png" }),
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    saveAnnotations: async () => ({ written: { NPZ: "r1" }, stale: [], skippedEmpty: [] }),
    pixelsUrl: () => "/api/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/api/thumbnail",
    ...overrides,
  } as unknown as ApiClient;
}

function show(overrides: Partial<ApiClient> = {}) {
  // The browser reads the export-format selection from settings, so it needs the provider the app
  // mounts it inside.
  const api = client(overrides);
  return render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        {/* The list and the opened image are two components now, one per pane. Mounting both is
            mounting what the app mounts -- the capability spans them. The hotkey provider comes
            with them because the save keys live on the opened image, and `useHotkey` throws
            without one by design: a hook that works without its provider hides a missing wire. */}
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={api} projectId="p1" confirmNavigation={() => true}>
            <DatasetBrowser client={api} projectId="p1" folder="frames" />
            <OpenImageView client={api} projectId="p1" />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

describe("C1: the dataset browser", () => {
  it("lists the folder's images with a status column per format", async () => {
    show();

    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
    expect(screen.getByText("b.png")).toBeTruthy();

    // One column per format the user has left switched on, in load-priority order, under legacy's
    // column names (fast_file_manager.py:277-288), the suffix a user would recognize in each
    // header's tooltip. RULE-036's ten settings are honoured now, and five of them default to
    // FALSE in legacy -- so the default view is NPZ OHE and YOLO Det, not all seven. Showing every
    // column regardless was the deviation, not this.
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((cell) => cell.textContent)).toEqual(["Name", "NPZ OHE", "YOLO Det", "Modified", "Size"]);
    expect(headers.map((cell) => cell.title)).toEqual(["", ".npz", ".txt", "", ""]);
  });

  it("says how many images the folder holds, in legacy's words", async () => {
    // fast_file_manager.py:954-955. It said how many were already annotated until 2026-09-26; the
    // per-format totals beside it say that.
    show();
    await waitFor(() => expect(screen.getByText("2 images in frames")).toBeTruthy());
  });

  it("totals each format under the list, as legacy's footer does", async () => {
    show();
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());

    const footer = document.querySelector(".dataset tfoot tr")!;
    expect(footer.querySelector("th")?.textContent).toBe("2 images in frames");
    // .npz and .txt, then the Modified and Size columns, which have nothing to total.
    expect([...footer.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual([
      "1",
      "0",
      "",
      "",
    ]);
  });

  it("narrows the list to the names that match the search, as legacy's Search files does", async () => {
    show();
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: "B.P" } });

    expect(screen.queryByRole("button", { name: "a.png" })).toBeNull();
    expect(screen.getByRole("button", { name: "b.png" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy();
  });

  it("marks present and absent sidecars so a screen reader can tell them apart", async () => {
    show();
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());

    // Two VISIBLE columns per row at the default settings, two rows: one sidecar present in
    // total. The marks follow the columns a user has left on, not every format the API reports.
    expect(screen.getAllByLabelText("present")).toHaveLength(1);
    expect(screen.getAllByLabelText("absent")).toHaveLength(3);
  });

  it("warns that two images share annotation files (RULE-080)", async () => {
    show({
      listImages: async () =>
        listing({
          images: [
            {
              key: "frames/frame_012.png",
              name: "frame_012.png",
              sidecars: sidecars("NPZ"),
              annotated: true,
              sharesSidecarsWith: ["frames/frame_012.jpg"],
            },
          ],
          annotatedCount: 1,
        }),
    });

    // Annotating one overwrites the other's work. Legacy never mentions it, and the listing is the
    // first moment anyone could be told.
    await waitFor(() =>
      expect(screen.getByText(/shares annotation files with frames\/frame_012\.jpg/)).toBeTruthy(),
    );
  });

  it("says when files were not recognized rather than looking empty", async () => {
    show({ listImages: async () => listing({ images: [], annotatedCount: 0, unrecognized: 18 }) });

    // A folder of .avif files would otherwise just look empty, and "no images here" and "none of
    // these count as images" are different problems with different fixes.
    await waitFor(() => expect(screen.getByText("18 files not recognized")).toBeTruthy());
    expect(screen.getByText(/^No images in /)).toBeTruthy();
  });

  it("reports a folder that could not be listed, in legacy's words", async () => {
    show({
      listImages: async () => {
        throw new Error("the dataset folder is not readable");
      },
    });

    // main_window.py:7330.
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Error discovering images: the dataset folder is not readable",
      ),
    );
  });

  describe("opening an image", () => {
    it("loads its annotations and says where they came from", async () => {
      const loadAnnotations = vi.fn(
        async (): Promise<AnnotationsResult> => ({
          kind: "loaded",
          annotations: {
            sourceFormat: "YOLO_SEGMENTATION",
            sourceFile: "frames/a_seg.txt",
            revision: "r1",
            segments: [{ type: "Loaded", classId: 3 }],
            classAliases: { "3": "stop sign" },
            rejected: 0,
            failures: [],
          },
        }),
      );

      show({ loadAnnotations });
      await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
      screen.getByRole("button", { name: "a.png" }).click();

      await waitFor(() => expect(screen.getByText(/1 objects, read from/)).toBeTruthy());
      expect(screen.getByText("frames/a_seg.txt")).toBeTruthy();
      // The file's class names are the class table's aliases. A line under the image listed them
      // again ("3 = stop sign") until 2026-09-26.
      expect(screen.queryByText(/3 = stop sign/)).toBeNull();
      expect(loadAnnotations).toHaveBeenCalledWith("p1", "frames/a.png", [1080, 1920]);
    });

    it("distinguishes an image with no annotation file from one that could not be read", async () => {
      show({ loadAnnotations: async () => ({ kind: "none" }) });
      await waitFor(() => expect(screen.getByText("b.png")).toBeTruthy());
      screen.getByRole("button", { name: "b.png" }).click();

      await waitFor(() => expect(screen.getByText(/has no annotation file/)).toBeTruthy());
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("raises an alert when annotations exist but none could be read (decision 15d)", async () => {
      show({
        loadAnnotations: async () => ({
          kind: "failed",
          failures: [{ format: "NPZ", reason: "not a zip archive" }],
          message: "the NPZ annotation file could not be read",
        }),
      });

      await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
      screen.getByRole("button", { name: "a.png" }).click();

      // Never an empty canvas. That nothing was deleted, which is true of this path, was said as
      // well until the owner asked for messages as short as legacy's (2026-09-26).
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toBe(
          "Annotations for a.png could not be read: the NPZ annotation file could not be read",
        ),
      );
    });

    it("reports a recovery from a damaged higher-priority file (decision 15c)", async () => {
      show({
        loadAnnotations: async () => ({
          kind: "loaded",
          annotations: {
            sourceFormat: "YOLO_SEGMENTATION",
            sourceFile: "frames/a_seg.txt",
            revision: "r1",
            segments: [],
            classAliases: {},
            rejected: 0,
            failures: [{ format: "NPZ", reason: "not a zip archive" }],
          },
        }),
      });

      await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
      screen.getByRole("button", { name: "a.png" }).click();

      // The work was recovered, and saying so is what decision 15c requires.
      await waitFor(() =>
        expect(
          screen.getByText("Loaded from YOLO_SEGMENTATION; could not read NPZ (not a zip archive)"),
        ).toBeTruthy(),
      );
    });

    it("warns when the file's class-name table could not be read", async () => {
      show({
        loadAnnotations: async () => ({
          kind: "loaded",
          annotations: {
            sourceFormat: "NPZ",
            sourceFile: "frames/a.npz",
            revision: "r1",
            segments: [{ type: "Loaded", classId: 3 }],
            classAliases: {},
            rejected: 0,
            unreadableAliases: true,
            failures: [],
          },
        }),
      });

      await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
      screen.getByRole("button", { name: "a.png" }).click();

      // The one loss a converted file does not look like it has: the objects are right and the
      // names are gone, so a Pascal VOC export would say "3" where the original said "stop sign".
      // One line since 2026-09-26, the consequence -- what saving to those formats would write --
      // in its tooltip, because a user needs it before saving.
      const banner = await screen.findByText("Class names could not be read from this file");
      expect(banner.title).toMatch(/Pascal VOC or CreateML/);
    });

    it("says how many lines a readable file rejected", async () => {
      show({
        loadAnnotations: async () => ({
          kind: "loaded",
          annotations: {
            sourceFormat: "COCO_JSON",
            sourceFile: "frames/a_coco.json",
            revision: "r1",
            segments: [{ type: "Loaded", classId: 1 }],
            classAliases: {},
            rejected: 412,
            failures: [],
          },
        }),
      });

      await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
      screen.getByRole("button", { name: "a.png" }).click();

      // "412 unreadable lines" rather than one object and silence.
      await waitFor(() => expect(screen.getByText("412 unreadable lines or objects skipped")).toBeTruthy());
    });
  });

  it("takes the image size from the API rather than asking for it", async () => {
    const imageMetadata = vi.fn(async () => ({
      width: 1920,
      height: 1080,
      sourceDepth: 8 as const,
      sourceFormat: "png",
    }));
    const loadAnnotations = vi.fn(async (): Promise<AnnotationsResult> => ({ kind: "none" }));

    show({ imageMetadata, loadAnnotations } as never);
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
    screen.getByRole("button", { name: "a.png" }).click();

    // The size has to be right before annotations are loaded: the text formats store normalized
    // coordinates, so a wrong one silently rescales every polygon.
    await waitFor(() =>
      expect(loadAnnotations).toHaveBeenCalledWith("p1", "frames/a.png", [1080, 1920]),
    );
    expect(screen.getByText(/1920 x 1080, png/)).toBeTruthy();
  });

  it("says when an image was converted from 16-bit", async () => {
    show({
      imageMetadata: async () => ({
        width: 64,
        height: 48,
        sourceDepth: 16 as const,
        sourceFormat: "tiff",
      }),
    } as never);

    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
    screen.getByRole("button", { name: "a.png" }).click();

    // RULE-024 is invisible unless it is said: the pixels on screen are not the pixels in the file.
    // How they were converted (value / 256, truncated) was said too until 2026-09-26.
    await waitFor(() => expect(screen.getByText("64 x 48, tiff, 16-bit")).toBeTruthy());
  });
});
