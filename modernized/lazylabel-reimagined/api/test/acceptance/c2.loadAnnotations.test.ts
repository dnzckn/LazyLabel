/**
 * C2 — Load an image's annotations from the best file present.
 *
 * The Phase 2 pilot acceptance test: one capability from the behavior contract, taken end to end
 * over a REAL directory on disk, through the blob store port, into the Phase 1 format library, and
 * back out as an HTTP response. If the seams this scaffold exists to establish are wrong, they are
 * wrong here.
 *
 * Rules exercised, from `AI_NATIVE_SPEC.md` C2:
 *   RULE-078  the load-priority chain, and what happens when a file in it cannot be read
 *   RULE-037  YOLO segmentation import
 *   RULE-039  COCO import
 *   RULE-007  class aliases travel with the annotations
 * plus decisions 15c (the chain continues past a failure and reports it) and 15d (a failed load is
 * never presented as an empty canvas).
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { renderCoco, renderYoloSegmentation } from "@lazylabel/annotation-formats";
import type { ExportContext, Segment } from "@lazylabel/annotation-formats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { buildContext, squareSegment } from "../helpers/context.js";
import { get, put } from "../helpers/request.js";
import type { WireLoadResponse } from "../../src/http/wire.js";

const IMAGE = "frames/frame_012.png";
const SIZE: [number, number] = [64, 80]; // height, width

describe("C2: load an image's annotations from the best file present", () => {
  let root: string;
  let app: App;
  let metadata: SqliteMetadataStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-c2-"));
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: new DirectoryBlobStore(root), metadataStore: metadata });
  });

  afterEach(async () => {
    await metadata.close();
    await rm(root, { recursive: true, force: true });
  });

  /** Write a sidecar into the temporary dataset, creating the folder as needed. */
  async function writeSidecar(relative: string, content: string): Promise<void> {
    const full = path.join(root, relative);
    await rm(full, { force: true });
    await writeFile(full, content, "utf-8");
  }

  async function seedFolder(): Promise<void> {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(root, "frames"), { recursive: true });
  }

  function contextFor(segments: readonly Segment[], aliases: ReadonlyMap<number, string>): ExportContext {
    return buildContext(IMAGE, SIZE, segments, aliases);
  }

  it("returns 204 when the image has no annotation file at all", async () => {
    await seedFolder();
    const response = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));

    // 204, not an empty 200: "no file" and "an empty file" are different facts about the user's
    // work, and a client that cannot tell them apart cannot warn about either.
    expect(response.status).toBe(204);
    expect(response.body).toBe("");
  });

  it("reads the highest-priority file present, not merely the first one found", async () => {
    await seedFolder();
    const aliases = new Map([[3, "stop sign"]]);
    const segments = [squareSegment(3, 10, 12, 20)];
    const context = contextFor(segments, aliases);

    // Both formats describe the same object. YOLO segmentation outranks COCO in LOAD_PRIORITY, so
    // it must be the one that answers, and the response must say so.
    await writeSidecar("frames/frame_012_seg.txt", renderYoloSegmentation(context)!);
    await writeSidecar("frames/frame_012_coco.json", renderCoco(context)!);

    const response = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));
    expect(response.status).toBe(200);

    const loaded = JSON.parse(response.body) as WireLoadResponse;
    expect(loaded.sourceFormat).toBe("YOLO_SEGMENTATION");
    expect(loaded.sourceFile).toBe("frames/frame_012_seg.txt");
    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]!.classId).toBe(3);
    expect(loaded.failures).toEqual([]);
  });

  it("carries the class names the file established, and the count it rejected", async () => {
    await seedFolder();
    // COCO stores names; two objects, one of them with a category the file does not define, so the
    // reader has something to reject.
    const context = contextFor([squareSegment(3, 10, 12, 20)], new Map([[3, "stop sign"]]));
    const coco = JSON.parse(renderCoco(context)!) as {
      annotations: Record<string, unknown>[];
      categories: unknown[];
    };
    coco.annotations.push({ ...coco.annotations[0]!, id: 99, category_id: "not a number" });
    await writeSidecar("frames/frame_012_coco.json", JSON.stringify(coco));

    const response = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));
    expect(response.status).toBe(200);

    const loaded = JSON.parse(response.body) as WireLoadResponse;
    expect(loaded.sourceFormat).toBe("COCO_JSON");
    expect(loaded.classAliases).toEqual({ "3": "stop sign" });
    // The non-numeric category is skipped and COUNTED. Without the count the client shows one
    // object and says nothing, which is how a half-read file passes for a complete one.
    expect(loaded.rejected).toBe(1);
    expect(loaded.segments).toHaveLength(1);
  });

  it("recovers from a damaged higher-priority file and reports that it did (decision 15c)", async () => {
    await seedFolder();
    const context = contextFor([squareSegment(3, 10, 12, 20)], new Map([[3, "stop sign"]]));

    // The NPZ is the highest-priority file and it is corrupt. The healthy _seg.txt beside it was
    // written by the same save, so the user's work is recoverable — and recovering it silently is
    // what decision 15c forbids.
    await writeSidecar("frames/frame_012.npz", "this is not a zip archive");
    await writeSidecar("frames/frame_012_seg.txt", renderYoloSegmentation(context)!);

    const response = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));
    expect(response.status).toBe(200);

    const loaded = JSON.parse(response.body) as WireLoadResponse;
    expect(loaded.sourceFormat).toBe("YOLO_SEGMENTATION");
    expect(loaded.segments).toHaveLength(1);

    expect(loaded.failures).toHaveLength(1);
    expect(loaded.failures[0]!.format).toBe("NPZ");
    expect(loaded.failures[0]!.reason).toBeTruthy();
  });

  it("answers 409 when every file present is unreadable, never an empty canvas (decision 15d)", async () => {
    await seedFolder();
    await writeSidecar("frames/frame_012.npz", "this is not a zip archive");
    await writeSidecar("frames/frame_012_coco.json", "{ not json");

    const response = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));

    // The single most important status code in this suite. 200-with-nothing here is the bug that
    // let the legacy app show an empty canvas and then, with auto-save on, overwrite the user's
    // healthy sidecars with it.
    expect(response.status).toBe(409);

    const problem = JSON.parse(response.body) as { code: string; detail: { failures: { format: string }[] } };
    expect(problem.code).toBe("annotations_unreadable");
    expect(problem.detail.failures.map((failure) => failure.format).sort()).toEqual(["COCO_JSON", "NPZ"]);
  });

  it("leaves every file on disk when a load fails", async () => {
    await seedFolder();
    await writeSidecar("frames/frame_012.npz", "this is not a zip archive");

    await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));

    // Nothing is deleted on the failure path. The legacy combination of a silent empty load and
    // auto-save is what turned an unreadable file into lost work.
    const store = new DirectoryBlobStore(root);
    expect(await store.stat("frames/frame_012.npz")).not.toBeNull();
  });

  it("round-trips a save and a load through the real files on disk", async () => {
    await seedFolder();

    const written = await app.handle(
      put(`/projects/p1/images/${IMAGE}/annotations`, {
        imageSize: SIZE,
        formats: ["YOLO_SEGMENTATION", "COCO_JSON"],
        classAliases: { "3": "stop sign" },
        segments: [
          {
            type: "Loaded",
            classId: 3,
            mask: maskWire(SIZE, 10, 12, 20),
          },
        ],
      }),
    );
    expect(written.status).toBe(200);
    expect(Object.keys(JSON.parse(written.body).written).sort()).toEqual(["COCO_JSON", "YOLO_SEGMENTATION"]);

    const response = await app.handle(get(`/projects/p1/images/${IMAGE}/annotations`, SIZE));
    expect(response.status).toBe(200);

    const loaded = JSON.parse(response.body) as WireLoadResponse;
    expect(loaded.sourceFormat).toBe("YOLO_SEGMENTATION");
    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]!.classId).toBe(3);
    // The mask survives the whole round trip: polygon written, polygon read, rasterized back.
    expect(loaded.segments[0]!.mask?.box).not.toBeNull();
  });
});

/** A filled square as the wire encodes it: a bounding box plus its bytes. */
function maskWire(
  [height, width]: [number, number],
  x: number,
  y: number,
  side: number,
): { height: number; width: number; box: [number, number, number, number]; data: string } {
  const region = new Uint8Array(side * side).fill(1);
  return {
    height,
    width,
    box: [x, y, x + side, y + side],
    data: Buffer.from(region).toString("base64"),
  };
}
