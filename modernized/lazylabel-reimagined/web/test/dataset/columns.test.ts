/**
 * Which of the dataset browser's format columns are shown — RULE-036's ten settings.
 *
 * All ten were stored and read by nothing, so the table showed a column for every format the API
 * reported and a user could not hide one. On a folder whose images carry two of the seven formats,
 * five of the columns are a field of dots.
 */

import { describe, expect, it } from "vitest";

import { columnName, hideableColumns, visibleColumns } from "../../src/dataset/columns.js";

const ALL = [
  { format: "NPZ", suffix: ".npz" },
  { format: "NPZ_CLASS_MAP", suffix: "_CM.npz" },
  { format: "YOLO_DETECTION", suffix: ".txt" },
  { format: "YOLO_SEGMENTATION", suffix: "_seg.txt" },
  { format: "COCO_JSON", suffix: "_coco.json" },
  { format: "PASCAL_VOC", suffix: ".xml" },
  { format: "CREATEML", suffix: "_createml.json" },
];

const suffixes = (values: Record<string, unknown>) =>
  visibleColumns(ALL, values).map((column) => column.suffix);

describe("choosing the columns", () => {
  it("shows every column when nothing is switched off", () => {
    expect(suffixes({})).toEqual(ALL.map((column) => column.suffix));
  });

  it("hides the ones set to false, by SUFFIX", () => {
    // The settings are named after the suffix, which is what legacy named them after and what the
    // API's column list carries. A rename of the FORMAT would not change which column a user hid.
    expect(suffixes({ file_manager_show_seg: false, file_manager_show_voc: false })).toEqual([
      ".npz",
      "_CM.npz",
      ".txt",
      "_coco.json",
      "_createml.json",
    ]);
  });

  it("distinguishes .npz from _CM.npz and .txt from _seg.txt", () => {
    // The pairs that share an extension. Matching on the extension rather than the whole suffix
    // would hide both halves of each pair together.
    expect(suffixes({ file_manager_show_npz: false })).toContain("_CM.npz");
    expect(suffixes({ file_manager_show_txt: false })).toContain("_seg.txt");
  });

  it("SHOWS a column no setting maps to", () => {
    // A format added to the API without a setting should appear rather than vanish: a user who
    // cannot see a column does not know to look for the switch that hides it.
    const withNew = [...ALL, { format: "FUTURE", suffix: ".future" }];

    expect(visibleColumns(withNew, {}).map((c) => c.suffix)).toContain(".future");
  });

  it("treats a missing setting as ON, and only `false` as off", () => {
    expect(suffixes({ file_manager_show_npz: undefined })).toContain(".npz");
    expect(suffixes({ file_manager_show_npz: 0 })).toContain(".npz");
  });
});

describe("the switches offered", () => {
  it("names one per hideable column, with its setting", () => {
    const hideable = hideableColumns(ALL);

    expect(hideable).toHaveLength(7);
    expect(hideable[0]).toEqual({ format: "NPZ", suffix: ".npz", setting: "file_manager_show_npz" });
  });

  it("offers nothing for a column it cannot hide", () => {
    expect(hideableColumns([{ format: "FUTURE", suffix: ".future" }])).toEqual([]);
  });
});

describe("what a column is called", () => {
  it("is legacy's name for each of the seven formats", () => {
    // fast_file_manager.py:277-288.
    expect(ALL.map(columnName)).toEqual(["NPZ OHE", "NPZ CM", "YOLO Det", "YOLO Seg", "COCO", "VOC", "CreateML"]);
  });

  it("is the suffix for a format legacy never had", () => {
    expect(columnName({ format: "FUTURE", suffix: ".future" })).toBe(".future");
  });
});
