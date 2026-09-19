/**
 * C1 — Open a folder of images and see which already carry annotations: the browser's share.
 *
 * The API's share is tested against a real folder on disk in the api package. What belongs here is
 * what the browser owes the capability: showing the per-format status, showing the two things
 * legacy never told anyone, and opening an image so its annotations actually load.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetListing } from "@lazylabel/contracts";

import { DatasetBrowser } from "../../src/dataset/DatasetBrowser.jsx";
import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";

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
    pixelsUrl: () => "/api/pixels",
    thumbnailUrl: () => "/api/thumbnail",
    ...overrides,
  } as unknown as ApiClient;
}

function show(overrides: Partial<ApiClient> = {}) {
  return render(<DatasetBrowser client={client(overrides)} projectId="p1" folder="frames" />);
}

describe("C1: the dataset browser", () => {
  it("lists the folder's images with a status column per format", async () => {
    show();

    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
    expect(screen.getByText("b.png")).toBeTruthy();

    // One column per format, in load-priority order, labelled by the suffix a user would recognize.
    for (const column of COLUMNS) {
      expect(screen.getByText(column.suffix)).toBeTruthy();
    }
  });

  it("says how many images are already annotated", async () => {
    show();
    await waitFor(() => expect(screen.getByText(/2 images, 1 already annotated/)).toBeTruthy());
  });

  it("marks present and absent sidecars so a screen reader can tell them apart", async () => {
    show();
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());

    // Seven per row, two rows: one sidecar present in total.
    expect(screen.getAllByLabelText("present")).toHaveLength(1);
    expect(screen.getAllByLabelText("absent")).toHaveLength(13);
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
    await waitFor(() => expect(screen.getByText(/18 files were not recognized/)).toBeTruthy());
    expect(screen.getByText(/no images LazyLabel can open/)).toBeTruthy();
  });

  it("reports a folder that could not be listed", async () => {
    show({
      listImages: async () => {
        throw new Error("the dataset folder is not readable");
      },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/could not be listed/),
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
      expect(screen.getByText(/3 = stop sign/)).toBeTruthy();
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

      // Never an empty canvas, and the user is told nothing was deleted.
      await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/none could be read/));
      expect(screen.getByRole("alert").textContent).toMatch(/Nothing has been deleted/);
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
        expect(screen.getByText(/higher-priority annotation file could not be read/)).toBeTruthy(),
      );
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
      await waitFor(() => expect(screen.getByText(/412 lines or objects/)).toBeTruthy());
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

  it("says when an image was converted from 16-bit, and how", async () => {
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
    await waitFor(() => expect(screen.getByText(/16-bit/)).toBeTruthy());
    expect(screen.getByText("value / 256")).toBeTruthy();
  });
});
