/**
 * The file list's columns: legacy's ten, in legacy's order, each shown by its RULE-036 setting,
 * and legacy's date and size formats (CONTROL_PARITY.md CP-63).
 */

import { describe, expect, it } from "vitest";

import { formatModified, formatSize, listColumns, shownColumns } from "../../src/dataset/columns.js";

/** The API's formats, in its load-priority order, which is not legacy's column order. */
const API = [
  { format: "NPZ", suffix: ".npz" },
  { format: "YOLO_SEGMENTATION", suffix: "_seg.txt" },
  { format: "COCO_JSON", suffix: "_coco.json" },
  { format: "NPZ_CLASS_MAP", suffix: "_CM.npz" },
  { format: "PASCAL_VOC", suffix: ".xml" },
  { format: "CREATEML", suffix: "_createml.json" },
  { format: "YOLO_DETECTION", suffix: ".txt" },
];

const titles = (values: Record<string, unknown>) =>
  shownColumns(listColumns(API), values).map((column) => column.title);

describe("the columns, in legacy's order", () => {
  it("are Name, the seven formats as legacy orders them, then Modified and Size", () => {
    // fast_file_manager.py:277-288, whatever order the API reports its formats in.
    expect(listColumns(API).map((column) => column.title)).toEqual([
      "Name",
      "NPZ OHE",
      "NPZ CM",
      "YOLO Det",
      "YOLO Seg",
      "COCO",
      "VOC",
      "CreateML",
      "Modified",
      "Size",
    ]);
  });

  it("carry each format's id and suffix, and the setting named after the suffix", () => {
    const byTitle = new Map(listColumns(API).map((column) => [column.title, column]));

    expect(byTitle.get("NPZ CM")).toEqual({
      id: "NPZ_CLASS_MAP",
      title: "NPZ CM",
      kind: "format",
      setting: "file_manager_show_cm",
      suffix: "_CM.npz",
    });
    expect(byTitle.get("YOLO Det")?.setting).toBe("file_manager_show_txt");
    expect(byTitle.get("YOLO Seg")?.setting).toBe("file_manager_show_seg");
  });

  it("put a format legacy never had after CreateML, under its suffix and always shown", () => {
    const columns = listColumns([...API, { format: "FUTURE", suffix: ".future" }]);

    expect(columns.map((column) => column.title).slice(7, 9)).toEqual(["CreateML", ".future"]);
    expect(columns.find((column) => column.id === "FUTURE")?.setting).toBeUndefined();
    expect(
      shownColumns(columns, { file_manager_show_npz: false }).map((column) => column.title),
    ).toContain(".future");
  });
});

describe("which are shown", () => {
  it("is every column when nothing is switched off", () => {
    expect(titles({})).toHaveLength(10);
  });

  it("hides the ones set to false, telling .npz from _CM.npz and .txt from _seg.txt", () => {
    expect(titles({ file_manager_show_npz: false, file_manager_show_seg: false })).toEqual([
      "Name",
      "NPZ CM",
      "YOLO Det",
      "COCO",
      "VOC",
      "CreateML",
      "Modified",
      "Size",
    ]);
  });

  it("lets Name be hidden, as legacy's column menu does", () => {
    // fast_file_manager.py:1169, 406-414: Name is a checkable item like the rest.
    expect(titles({ file_manager_show_name: false })[0]).toBe("NPZ OHE");
  });

  it("treats a missing setting as on, and only `false` as off", () => {
    expect(titles({ file_manager_show_npz: undefined })).toContain("NPZ OHE");
    expect(titles({ file_manager_show_npz: 0 })).toContain("NPZ OHE");
  });
});

describe("a file's size, as legacy's list shows it", () => {
  it("has one decimal in every unit, bytes too", () => {
    // fast_file_manager.py:527-533.
    expect(formatSize(0)).toBe("0.0 B");
    expect(formatSize(912)).toBe("912.0 B");
    expect(formatSize(1023)).toBe("1023.0 B");
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1_468_006)).toBe("1.4 MB");
    expect(formatSize(3 * 1024 ** 3)).toBe("3.0 GB");
    expect(formatSize(5 * 1024 ** 4)).toBe("5.0 TB");
  });

  it("rounds an exact half to the even tenth, as Python's format does", () => {
    // 1280 bytes is exactly 1.25 KB: Python prints 1.2, JavaScript's toFixed 1.3.
    expect(formatSize(1280)).toBe("1.2 KB");
    expect(formatSize(1792)).toBe("1.8 KB");
    expect(formatSize(1331)).toBe("1.3 KB");
  });

  it("is blank when the listing carries no size, and '-' for one that could not be read", () => {
    expect(formatSize(undefined)).toBe("");
    expect(formatSize(-1)).toBe("-");
  });
});

describe("a file's modified time, as legacy's list shows it", () => {
  it("is the local date and time to the minute, as %Y-%m-%d %H:%M", () => {
    // fast_file_manager.py:473-479. Built from the local clock, so the test is too.
    const at = new Date(2026, 8, 6, 7, 5, 59).getTime();

    expect(formatModified(at)).toBe("2026-09-06 07:05");
  });

  it("is '-' when the time could not be read, and blank when it was not asked for", () => {
    expect(formatModified(null)).toBe("-");
    expect(formatModified(undefined)).toBe("");
  });
});
