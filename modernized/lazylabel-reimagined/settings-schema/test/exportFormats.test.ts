/**
 * RULE-088's export-format clauses.
 *
 * These decide which files a save writes, so an empty or garbled list is not a cosmetic problem: it
 * is a save that reports success and writes nothing.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_EXPORT_FORMATS } from "../src/schema.js";
import { canRemoveExportFormat, normalizeExportFormats } from "../src/exportFormats.js";

describe("normalizeExportFormats", () => {
  it("passes a valid list through unchanged, in the order the user chose", () => {
    const result = normalizeExportFormats(["YOLO_SEGMENTATION", "NPZ"]);
    expect(result.formats).toEqual(["YOLO_SEGMENTATION", "NPZ"]);
    expect(result.warnings).toEqual([]);
  });

  it("drops a format name it does not recognize", () => {
    const result = normalizeExportFormats(["NPZ", "PARQUET", "COCO_JSON"]);
    expect(result.formats).toEqual(["NPZ", "COCO_JSON"]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/PARQUET/);
  });

  it("falls back to the defaults when nothing usable remains", () => {
    const result = normalizeExportFormats(["PARQUET", "ARROW"]);
    expect(result.formats).toEqual([...DEFAULT_EXPORT_FORMATS]);
    expect(result.warnings.at(-1)).toMatch(/no usable export formats/);
  });

  it("never returns an empty list", () => {
    // The clause that matters. An empty list makes a save write no files while reporting success,
    // and the user finds out when they reopen the image.
    for (const input of [[], ["PARQUET"], [null], [123], ["", "  "]]) {
      expect(normalizeExportFormats(input).formats.length, JSON.stringify(input)).toBeGreaterThan(0);
    }
  });

  it("falls back when the stored value is not a list at all", () => {
    for (const input of [undefined, null, "NPZ", 42, { NPZ: true }]) {
      const result = normalizeExportFormats(input);
      expect(result.formats, JSON.stringify(input) ?? "undefined").toEqual([...DEFAULT_EXPORT_FORMATS]);
      expect(result.warnings).toHaveLength(1);
    }
  });

  it("collapses duplicates without complaining about them", () => {
    const result = normalizeExportFormats(["NPZ", "NPZ", "COCO_JSON"]);
    expect(result.formats).toEqual(["NPZ", "COCO_JSON"]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts all seven formats", () => {
    const all = [
      "NPZ",
      "NPZ_CLASS_MAP",
      "YOLO_DETECTION",
      "YOLO_SEGMENTATION",
      "COCO_JSON",
      "PASCAL_VOC",
      "CREATEML",
    ];
    expect(normalizeExportFormats(all)).toEqual({ formats: all, warnings: [] });
  });
});

describe("canRemoveExportFormat", () => {
  it("refuses to remove the last remaining format", () => {
    expect(canRemoveExportFormat(["NPZ"], "NPZ")).toBe(false);
    expect(canRemoveExportFormat(["NPZ", "COCO_JSON"], "NPZ")).toBe(true);
  });

  it("is false for a format that is not selected", () => {
    expect(canRemoveExportFormat(["NPZ", "COCO_JSON"], "PASCAL_VOC")).toBe(false);
  });
});
