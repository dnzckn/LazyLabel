/**
 * C9 — Save annotations in any of the seven formats, choosing which are written.
 *
 * Run against a real folder on disk, because the properties that matter here are about files: that
 * a save lands atomically, that clearing an image survives a reload, and that nothing is removed
 * without the user asking.
 *
 * Decision 7 is the spine of this capability, and it is a list of things that must NOT happen:
 *
 *   - no annotation file is deleted without explicit user action;
 *   - a save with zero segments does not leave the old file behind to be read back;
 *   - a sidecar in a format the user did not select is reported, never quietly removed;
 *   - a save that cannot be made safely writes nothing at all, rather than part of a set.
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, put } from "../helpers/request.js";
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

    expect(Object.keys(JSON.parse(response.body).written)).toHaveLength(7);
    expect(await readdir(path.join(root, "frames"))).toHaveLength(7);
  });

  it("round-trips through the load chain", async () => {
    await save({ formats: ["YOLO_SEGMENTATION"], ...oneObject });

    const loaded = JSON.parse((await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE))).body) as WireLoadResponse;
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
      const loaded = JSON.parse(response.body) as WireLoadResponse;
      expect(loaded.segments).toEqual([]);
    });

    it("does not delete the file, because decision 7 forbids it", async () => {
      await save({ formats: ["YOLO_SEGMENTATION"], ...oneObject });
      await save({ formats: ["YOLO_SEGMENTATION"], segments: [] });

      // Deleting would also be a correct-looking answer and it is the one decision 7 rules out:
      // no annotation file disappears without the user asking for it.
      expect(await readdir(path.join(root, "frames"))).toEqual(["frame_012_seg.txt"]);
    });

    it("writes an empty form of every selected format, each readable", async () => {
      const response = await save({
        formats: ["NPZ", "COCO_JSON", "PASCAL_VOC", "CREATEML", "YOLO_DETECTION"],
        segments: [],
      });

      const body = JSON.parse(response.body);
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
      expect((JSON.parse(loaded.body) as WireLoadResponse).segments).toEqual([]);
    });
  });

  describe("what a save must never do", () => {
    it("reports a sidecar in an unselected format without touching it", async () => {
      await writeFile(path.join(root, "frames", "frame_012_coco.json"), "{}");

      const response = await save({ formats: ["YOLO_SEGMENTATION"], ...oneObject });

      // Decision 15f: warn and offer removal. The client decides; the user acts.
      expect(JSON.parse(response.body).stale).toEqual(["COCO_JSON"]);
      expect(await store.read("frames/frame_012_coco.json")).not.toBeNull();
    });

    it("writes nothing at all when one selected format conflicts", async () => {
      const first = await save({ formats: ["YOLO_SEGMENTATION", "COCO_JSON"], ...oneObject });
      const revision = JSON.parse(first.body).written["COCO_JSON"] as string;
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
});
