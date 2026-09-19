/**
 * C1 — Open a folder of images and see which already carry annotations.
 *
 * The Phase 4 pilot slice, run against a real folder on disk: import a folder of images with
 * existing annotation files, list them with per-format status, and open one with its annotations
 * loaded through the Phase 1 library.
 *
 * Rules:
 *   RULE-051  which files are images, and that only the folder's DIRECT children are listed
 *   RULE-036  which annotation file each image has, by base name and exact suffix
 *   RULE-080  sidecar naming, and the collision it allows (P0)
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { renderYoloSegmentation } from "@lazylabel/annotation-formats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { buildContext, squareSegment } from "../helpers/context.js";
import { get } from "../helpers/request.js";
import type { WireLoadResponse } from "../../src/http/wire.js";

const SIZE: [number, number] = [64, 80];

interface Listing {
  folder: string;
  images: {
    key: string;
    name: string;
    annotated: boolean;
    sidecars: Record<string, boolean>;
    sharesSidecarsWith: string[];
  }[];
  annotatedCount: number;
  unrecognized: number;
  columns: { format: string; suffix: string }[];
}

describe("C1: open a folder of images and see which already carry annotations", () => {
  let root: string;
  let app: App;
  let metadata: SqliteMetadataStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-c1-"));
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: new DirectoryBlobStore(root), metadataStore: metadata });
  });

  afterEach(async () => {
    await metadata.close();
    await rm(root, { recursive: true, force: true });
  });

  async function put(relative: string, content: string | Uint8Array): Promise<void> {
    const full = path.join(root, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }

  async function list(folder = "frames"): Promise<Listing> {
    const response = await app.handle({
      method: "GET",
      path: "/projects/p1/images",
      query: new URLSearchParams({ folder }),
      headers: {},
      body: new Uint8Array(0),
    });
    expect(response.status).toBe(200);
    return JSON.parse(response.body) as Listing;
  }

  it("lists the images in a folder and says which are already annotated", async () => {
    await put("frames/frame_001.png", "x");
    await put("frames/frame_002.png", "x");
    await put("frames/frame_003.png", "x");
    await put("frames/frame_001.npz", "x");
    await put("frames/frame_002_seg.txt", "x");

    const listing = await list();

    expect(listing.images.map((image) => image.name)).toEqual([
      "frame_001.png",
      "frame_002.png",
      "frame_003.png",
    ]);
    expect(listing.images.map((image) => image.annotated)).toEqual([true, true, false]);
    expect(listing.annotatedCount).toBe(2);
  });

  it("marks each format separately, and does not confuse suffixes that share an extension", async () => {
    await put("frames/a.png", "x");
    await put("frames/a.npz", "x"); // NPZ, not NPZ_CLASS_MAP
    await put("frames/a_seg.txt", "x"); // YOLO segmentation, not detection

    const [image] = (await list()).images;

    // RULE-036 matches on the exact suffix. `a.npz` must not light up `_CM.npz`, and `a_seg.txt`
    // must not light up `.txt` -- the two pairs differ only by an infix.
    expect(image!.sidecars).toEqual({
      NPZ: true,
      NPZ_CLASS_MAP: false,
      YOLO_SEGMENTATION: true,
      YOLO_DETECTION: false,
      COCO_JSON: false,
      PASCAL_VOC: false,
      CREATEML: false,
    });
  });

  it("recognizes every image extension decision 9 settles on", async () => {
    for (const extension of [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif", ".webp"]) {
      await put(`frames/image${extension}`, "x");
    }
    // Case-insensitive, as legacy is.
    await put("frames/shouting.PNG", "x");

    expect((await list()).images).toHaveLength(9);
  });

  it("lists only the folder's direct children, not its subfolders (RULE-051)", async () => {
    await put("frames/top.png", "x");
    await put("frames/nested/deeper.png", "x");

    const listing = await list();
    expect(listing.images.map((image) => image.name)).toEqual(["top.png"]);
  });

  it("counts files it does not recognize rather than looking empty", async () => {
    await put("frames/a.png", "x");
    await put("frames/notes.md", "x");
    await put("frames/thumbnail.avif", "x");

    const listing = await list();

    // A folder whose images are all .avif should say so, not appear to have nothing in it.
    expect(listing.images).toHaveLength(1);
    expect(listing.unrecognized).toBe(2);
  });

  it("does not count sidecars as unrecognized files", async () => {
    await put("frames/a.png", "x");
    for (const suffix of [".npz", "_CM.npz", ".txt", "_seg.txt", "_coco.json", ".xml", "_createml.json"]) {
      await put(`frames/a${suffix}`, "x");
    }

    expect((await list()).unrecognized).toBe(0);
  });

  it("names the images that would share sidecars with each other (RULE-080)", async () => {
    await put("frames/frame_012.png", "x");
    await put("frames/frame_012.jpg", "x");
    await put("frames/frame_013.png", "x");

    const listing = await list();
    const byName = Object.fromEntries(listing.images.map((image) => [image.name, image]));

    // Annotating one overwrites the other's work, and legacy never mentions it. The listing is the
    // first moment a user could possibly be told.
    expect(byName["frame_012.png"]!.sharesSidecarsWith).toEqual(["frames/frame_012.jpg"]);
    expect(byName["frame_012.jpg"]!.sharesSidecarsWith).toEqual(["frames/frame_012.png"]);
    expect(byName["frame_013.png"]!.sharesSidecarsWith).toEqual([]);
  });

  it("sorts by lowercased name, exactly as legacy does", async () => {
    for (const name of ["frame_2.png", "frame_10.png", "Frame_1.png", "apple.png"]) {
      await put(`frames/${name}`, "x");
    }

    const listing = await list();

    // fast_file_manager.py:840 compares name.lower() lexicographically, so frame_10 precedes
    // frame_2. This order is navigation order, so reproducing it is not pedantry -- a natural sort
    // would change which image "next" goes to.
    expect(listing.images.map((image) => image.name)).toEqual([
      "apple.png",
      "Frame_1.png",
      "frame_10.png",
      "frame_2.png",
    ]);
  });

  it("answers an empty folder with an empty listing rather than an error", async () => {
    await mkdir(path.join(root, "frames"), { recursive: true });
    const listing = await list();

    expect(listing.images).toEqual([]);
    expect(listing.annotatedCount).toBe(0);
  });

  it("answers a folder that does not exist with an empty listing", async () => {
    // The dataset root being unreadable is a blocking error reported by /health; one missing
    // subfolder is not, and it should not look different from an empty one.
    expect((await list("no/such/folder")).images).toEqual([]);
  });

  it("tells the client which formats the status columns represent, in load-priority order", async () => {
    await put("frames/a.png", "x");
    const listing = await list();

    expect(listing.columns.map((column) => column.format)).toEqual([
      "NPZ",
      "YOLO_SEGMENTATION",
      "COCO_JSON",
      "NPZ_CLASS_MAP",
      "PASCAL_VOC",
      "CREATEML",
      "YOLO_DETECTION",
    ]);
    expect(listing.columns[0]!.suffix).toBe(".npz");
  });

  it("opens an image from the listing with its annotations, through the Phase 1 library", async () => {
    // The pilot slice's whole sentence: import a folder, list it, and open one WITH its
    // annotations loaded. The two halves are only worth anything joined.
    const context = buildContext("frames/frame_012.png", SIZE, [squareSegment(3, 10, 12, 20)], new Map([[3, "stop sign"]]));
    await put("frames/frame_012.png", "x");
    await put("frames/frame_012_seg.txt", renderYoloSegmentation(context)!);
    await put("frames/frame_013.png", "x");

    const listing = await list();
    const annotated = listing.images.find((image) => image.annotated);
    expect(annotated?.key).toBe("frames/frame_012.png");

    const response = await app.handle(get(`/projects/p1/images/${annotated!.key}/annotations`, SIZE));
    expect(response.status).toBe(200);

    const loaded = JSON.parse(response.body) as WireLoadResponse;
    expect(loaded.sourceFormat).toBe("YOLO_SEGMENTATION");
    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]!.classId).toBe(3);

    // And the one the listing says is unannotated really has nothing.
    const empty = await app.handle(get("/projects/p1/images/frames/frame_013.png/annotations", SIZE));
    expect(empty.status).toBe(204);
  });
});
