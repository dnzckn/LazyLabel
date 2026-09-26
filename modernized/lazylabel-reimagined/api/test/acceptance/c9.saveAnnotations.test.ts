/**
 * C9 — Save annotations in any of the seven formats, choosing which are written.
 *
 * Run against a real folder on disk, because the properties that matter here are about files: that
 * a save lands atomically, that clearing an image survives a reload, and that a write removes
 * nothing.
 *
 * Decision 7 is the spine of the WRITE, and it is a list of things that must NOT happen:
 *
 *   - a write deletes no annotation file;
 *   - a write with zero segments does not leave the old file behind to be read back;
 *   - a sidecar in a format the user did not select is reported, never quietly removed;
 *   - a save that cannot be made safely writes nothing at all, rather than part of a set.
 *
 * Deleting is its own request: legacy's `delete_all_outputs`, all seven sidecars of one image,
 * which the app sends where legacy's save finds no segments -- the owner's decision of 2026-09-26,
 * "Match the desktop app exactly", reversing RULE-083's "never delete" (SEQUENCE_PARITY.md SP-58).
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, put, jsonBody, request } from "../helpers/request.js";
import type { WireLoadResponse } from "../../src/http/wire.js";

const IMAGE = "frames/frame_012.png";
const SIZE: [number, number] = [64, 80];

/** A filled square as the wire encodes it: a bounding box plus its bytes. */
function square(x: number, y: number, side: number) {
  return {
    height: SIZE[0],
    width: SIZE[1],
    box: [x, y, x + side, y + side] as [number, number, number, number],
    data: Buffer.from(new Uint8Array(side * side).fill(1)).toString("base64"),
  };
}

describe("C9: save annotations in the formats the user chose", () => {
  let root: string;
  let app: App;
  let metadata: SqliteMetadataStore;
  let store: DirectoryBlobStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-c9-"));
    await mkdir(path.join(root, "frames"), { recursive: true });
    metadata = new SqliteMetadataStore(":memory:");
    store = new DirectoryBlobStore(root);
    app = createApp({ blobStore: store, metadataStore: metadata });
  });

  afterEach(async () => {
    await metadata.close();
    await rm(root, { recursive: true, force: true });
  });

  function save(body: Record<string, unknown>) {
    return app.handle(put(`/projects/p1/images/${IMAGE}/annotations`, { imageSize: SIZE, ...body }));
  }

  const oneObject = {
    segments: [{ type: "Loaded", classId: 3, mask: square(10, 12, 20) }],
    classAliases: { "3": "stop sign" },
  };

  it("writes exactly the formats the user selected", async () => {
    const response = await save({ formats: ["YOLO_SEGMENTATION", "COCO_JSON"], ...oneObject });
    expect(response.status).toBe(200);

    expect((await readdir(path.join(root, "frames"))).sort()).toEqual([
      "frame_012_coco.json",
      "frame_012_seg.txt",
    ]);
  });

  it("writes all seven when all seven are selected", async () => {
    const response = await save({
      formats: [
        "NPZ",
        "NPZ_CLASS_MAP",
        "YOLO_DETECTION",
        "YOLO_SEGMENTATION",
        "COCO_JSON",
        "PASCAL_VOC",
        "CREATEML",
      ],
      ...oneObject,
    });

    expect(Object.keys(jsonBody(response).written)).toHaveLength(7);
    expect(await readdir(path.join(root, "frames"))).toHaveLength(7);
  });

  it("round-trips through the load chain", async () => {
    await save({ formats: ["YOLO_SEGMENTATION"], ...oneObject });

    const loaded = jsonBody((await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE)))) as WireLoadResponse;
    expect(loaded.sourceFormat).toBe("YOLO_SEGMENTATION");
    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]!.classId).toBe(3);
  });

  describe("clearing an image", () => {
    it("writes an empty file rather than leaving the old one to be read back", async () => {
      await save({ formats: ["YOLO_SEGMENTATION"], ...oneObject });
      await save({ formats: ["YOLO_SEGMENTATION"], segments: [] });

      // The architecture review's finding: "a save with zero segments writes nothing" means the
      // stale sidecar is still there on the next load, and the user's deletion is undone.
      const response = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));
      expect(response.status).toBe(200);
      const loaded = jsonBody(response) as WireLoadResponse;
      expect(loaded.segments).toEqual([]);
    });

    it("does not delete the file: a write never deletes", async () => {
      await save({ formats: ["YOLO_SEGMENTATION"], ...oneObject });
      await save({ formats: ["YOLO_SEGMENTATION"], segments: [] });

      // A write of nothing is not a deletion. The app asks for one separately, where legacy's save
      // finds no segments (the DELETE cases below).
      expect(await readdir(path.join(root, "frames"))).toEqual(["frame_012_seg.txt"]);
    });

    it("writes an empty form of every selected format, each readable", async () => {
      const response = await save({
        formats: ["NPZ", "COCO_JSON", "PASCAL_VOC", "CREATEML", "YOLO_DETECTION"],
        segments: [],
      });

      const body = jsonBody(response);
      expect(Object.keys(body.written).sort()).toEqual([
        "COCO_JSON",
        "CREATEML",
        "NPZ",
        "PASCAL_VOC",
        "YOLO_DETECTION",
      ]);
      expect(body.skippedEmpty).toEqual([]);

      // And the highest-priority one reads back as an empty set, not as a failure.
      const loaded = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));
      expect(loaded.status).toBe(200);
      expect((jsonBody(loaded) as WireLoadResponse).segments).toEqual([]);
    });
  });

  describe("what a save must never do", () => {
    it("reports a sidecar in an unselected format without touching it", async () => {
      await writeFile(path.join(root, "frames", "frame_012_coco.json"), "{}");

      const response = await save({ formats: ["YOLO_SEGMENTATION"], ...oneObject });

      // Decision 15f: warn and offer removal. The client decides; the user acts.
      expect(jsonBody(response).stale).toEqual(["COCO_JSON"]);
      expect(await store.read("frames/frame_012_coco.json")).not.toBeNull();
    });

    it("writes nothing at all when one selected format conflicts", async () => {
      const first = await save({ formats: ["YOLO_SEGMENTATION", "COCO_JSON"], ...oneObject });
      const revision = jsonBody(first).written["COCO_JSON"] as string;
      const segBefore = await store.read("frames/frame_012_seg.txt");

      // Somebody else edits the COCO file in between.
      await writeFile(path.join(root, "frames", "frame_012_coco.json"), "{}");

      const response = await save({
        formats: ["YOLO_SEGMENTATION", "COCO_JSON"],
        expectedRevisions: { COCO_JSON: revision },
        segments: [{ type: "Loaded", classId: 9, mask: square(30, 30, 10) }],
      });

      expect(response.status).toBe(409);
      // The partner file must not have moved either: a half-applied save leaves an image whose
      // sidecars disagree with each other, which is worse than no save.
      expect(await store.read("frames/frame_012_seg.txt")).toEqual(segBefore);
    });

    it("leaves no temporary files behind", async () => {
      await save({ formats: ["NPZ", "COCO_JSON"], ...oneObject });

      const entries = await readdir(path.join(root, "frames"));
      expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
      expect(entries.sort()).toEqual(["frame_012.npz", "frame_012_coco.json"]);
    });

    it("refuses a format that is not one of the seven, writing nothing", async () => {
      const response = await save({ formats: ["PARQUET"], ...oneObject });

      expect(response.status).toBe(422);
      expect(await readdir(path.join(root, "frames"))).toEqual([]);
    });
  });

  describe("deleting an image's annotations, as legacy's empty save does (RULE-083)", () => {
    /*
     * Legacy's save of an image with no segments deletes all seven sidecar formats, whatever formats
     * are selected (save_export_manager.py:106-109, 523-542), through delete_all_outputs, which walks
     * its exporters in registration order (core/exporters/__init__.py:209-215, 224-230) and removes
     * each one's file if it exists (coco.py:102-107 and the six like it). The owner's decision of
     * 2026-09-26: "Match the desktop app exactly".
     */
    function remove(image = IMAGE) {
      return app.handle(request("DELETE", `/projects/p1/images/${image}/annotations`));
    }
    const listed = async () => (await readdir(path.join(root, "frames"))).sort();

    beforeEach(async () => {
      await writeFile(path.join(root, "frames", "frame_012.png"), "an image");
    });

    it("removes all seven, whatever was selected, and names them in legacy's order", async () => {
      await save({
        formats: ["NPZ", "NPZ_CLASS_MAP", "YOLO_DETECTION", "YOLO_SEGMENTATION", "COCO_JSON", "PASCAL_VOC", "CREATEML"],
        ...oneObject,
      });

      const response = await remove();

      expect(response.status).toBe(200);
      expect(jsonBody(response).deleted).toEqual([
        "frames/frame_012_coco.json",
        "frames/frame_012_createml.json",
        "frames/frame_012.npz",
        "frames/frame_012_CM.npz",
        "frames/frame_012.xml",
        "frames/frame_012.txt",
        "frames/frame_012_seg.txt",
      ]);
      expect(await listed()).toEqual(["frame_012.png"]);
    });

    it("removes only what exists, in the order of legacy's notice: coco, npz, txt", async () => {
      // RULE-083's example: cat.npz, cat.txt and cat_coco.json beside the image give
      // "Deleted: cat_coco.json, cat.npz, cat.txt" (save_export_manager.py:536-538).
      await save({ formats: ["NPZ", "YOLO_DETECTION", "COCO_JSON"], ...oneObject });

      const response = await remove();

      expect(jsonBody(response).deleted).toEqual([
        "frames/frame_012_coco.json",
        "frames/frame_012.npz",
        "frames/frame_012.txt",
      ]);
    });

    it("touches nothing but the seven: not the class-name file, not another image's files", async () => {
      // Legacy's <base>.json is deleted on no live path (RULE-083's edge cases).
      await save({ formats: ["NPZ"], ...oneObject });
      await writeFile(path.join(root, "frames", "frame_012.json"), "{}");
      await writeFile(path.join(root, "frames", "frame_013.npz"), "another image's");

      await remove();

      expect(await listed()).toEqual(["frame_012.json", "frame_012.png", "frame_013.npz"]);
    });

    it("answers an empty list when there was nothing to delete, which the app says as legacy does", async () => {
      // Legacy then warns "No segments to save." (save_export_manager.py:541-542).
      const response = await remove();

      expect(response.status).toBe(200);
      expect(jsonBody(response).deleted).toEqual([]);
    });

    it("leaves an image with no annotation file, which is what a later load finds", async () => {
      await save({ formats: ["YOLO_SEGMENTATION", "NPZ"], ...oneObject });

      await remove();

      const loaded = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));
      expect(loaded.status).toBe(204);
    });

    it("refuses an image that is not in the dataset, deleting nothing", async () => {
      await writeFile(path.join(root, "frames", "frame_099.npz"), "left alone");

      const response = await remove("frames/frame_099.png");

      expect(response.status).toBe(404);
      expect(await listed()).toContain("frame_099.npz");
    });

    it("refuses a key that is not an image, rather than deleting by its base name", async () => {
      await save({ formats: ["NPZ"], ...oneObject });

      const response = await remove("frames/frame_012.npz");

      expect(response.status).toBe(400);
      expect(await listed()).toContain("frame_012.npz");
    });
  });
});
