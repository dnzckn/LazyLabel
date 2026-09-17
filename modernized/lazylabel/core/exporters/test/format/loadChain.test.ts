/**
 * The load-priority chain: which annotation file wins, and what a damaged file does.
 *
 * Priority order characterized from legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:73-81
 * and FileManager._LOAD_CHAIN (core/file_manager.py:128-136). The failure behavior deliberately
 * differs from legacy; see the comment at the top of src/load/chain.ts and decision 15c.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AnnotationLoadError, loadAnnotations, type AnnotationSources } from "../../src/load/chain.js";
import { LOAD_PRIORITY } from "../../src/types.js";
import { GOLDENS_DIR } from "../helpers/fixtures.js";

const CASE = "two-classes-sparse-ids";
const SIZE = [20, 30] as const;

function golden(file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(GOLDENS_DIR, CASE, file)));
}

function allSources(): AnnotationSources {
  return {
    NPZ: golden("image.npz"),
    NPZ_CLASS_MAP: golden("image_CM.npz"),
    YOLO_SEGMENTATION: golden("image_seg.txt"),
    YOLO_DETECTION: golden("image.txt"),
    COCO_JSON: golden("image_coco.json"),
    PASCAL_VOC: golden("image.xml"),
    CREATEML: golden("image_createml.json"),
  };
}

describe("annotation load chain", () => {
  it("prefers formats in the documented order", () => {
    expect([...LOAD_PRIORITY]).toEqual([
      "NPZ",
      "YOLO_SEGMENTATION",
      "COCO_JSON",
      "NPZ_CLASS_MAP",
      "PASCAL_VOC",
      "CREATEML",
      "YOLO_DETECTION",
    ]);
  });

  it("takes NPZ when every format is present", async () => {
    const outcome = await loadAnnotations(allSources(), SIZE);
    expect(outcome?.format).toBe("NPZ");
    expect(outcome?.segments.map((s) => s.classId)).toEqual([3, 7]);
  });

  it("falls to each next format as the better ones are removed", async () => {
    const expected: [keyof AnnotationSources, string][] = [
      ["NPZ", "YOLO_SEGMENTATION"],
      ["YOLO_SEGMENTATION", "COCO_JSON"],
      ["COCO_JSON", "NPZ_CLASS_MAP"],
      ["NPZ_CLASS_MAP", "PASCAL_VOC"],
      ["PASCAL_VOC", "CREATEML"],
      ["CREATEML", "YOLO_DETECTION"],
    ];
    const sources = allSources();
    for (const [remove, next] of expected) {
      delete sources[remove];
      const outcome = await loadAnnotations(sources, SIZE);
      expect(outcome?.format, `after removing ${remove}`).toBe(next);
      expect(outcome?.segments.length).toBeGreaterThan(0);
    }
  });

  it("returns null when no annotation file exists", async () => {
    expect(await loadAnnotations({}, SIZE)).toBeNull();
  });

  // The deviation from legacy that decision 15c requires: a damaged file is never silently treated
  // as "no annotations". The chain continues so the user's work is recovered from the next file,
  // and the failure travels with the outcome so the caller has to show it.
  it("recovers from a damaged winner and reports the failure", async () => {
    const sources = allSources();
    sources.NPZ = new Uint8Array([0, 1, 2, 3, 4]); // not a zip

    const outcome = await loadAnnotations(sources, SIZE);
    expect(outcome?.format).toBe("YOLO_SEGMENTATION");
    expect(outcome?.segments.map((s) => s.classId)).toEqual([3, 7]);
    expect(outcome?.failures.map((f) => f.format)).toEqual(["NPZ"]);
  });

  it("raises when the damaged file is the only one present", async () => {
    await expect(loadAnnotations({ NPZ: new Uint8Array([0, 1, 2]) }, SIZE)).rejects.toBeInstanceOf(
      AnnotationLoadError,
    );
  });

  it("keeps an empty but valid file as the winner", async () => {
    const sources: AnnotationSources = { YOLO_SEGMENTATION: "", YOLO_DETECTION: golden("image.txt") };
    const outcome = await loadAnnotations(sources, SIZE);
    expect(outcome?.format).toBe("YOLO_SEGMENTATION");
    expect(outcome?.segments).toHaveLength(0);
  });

  it("strips a byte-order mark instead of making a class named from it", async () => {
    const text = new TextDecoder().decode(golden("image_seg.txt"));
    const withBom = new TextEncoder().encode(`﻿${text}`);
    const outcome = await loadAnnotations({ YOLO_SEGMENTATION: withBom }, SIZE);
    expect(outcome?.segments.map((s) => s.classId)).toEqual([3, 7]);
  });
});
