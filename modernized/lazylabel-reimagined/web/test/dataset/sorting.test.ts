/**
 * How the file list sorts: by any column's header, the format columns too, compared as legacy's
 * proxy compares them (fast_file_manager.py:817-882; CONTROL_PARITY.md CP-48).
 */

import { describe, expect, it } from "vitest";

import { clickedSort, sortNeedsDetails, sortRows, storedSort } from "../../src/dataset/sorting.js";

const row = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra });
const names = (rows: readonly { name: string }[]) => rows.map((each) => each.name);

describe("the order the list opens in", () => {
  it("is legacy's six stored orders by index", () => {
    // fast_file_manager.py:1252-1259.
    expect([0, 1, 2, 3, 4, 5].map(storedSort)).toEqual([
      { column: "name", descending: false },
      { column: "name", descending: true },
      { column: "modified", descending: false },
      { column: "modified", descending: true },
      { column: "size", descending: false },
      { column: "size", descending: true },
    ]);
  });

  it("is Name ascending for anything else, as legacy's default is", () => {
    expect(storedSort(99)).toEqual({ column: "name", descending: false });
    expect(storedSort(undefined)).toEqual({ column: "name", descending: false });
    expect(storedSort("2")).toEqual({ column: "name", descending: false });
  });

  it("needs the listing's details only to sort by date or size", () => {
    expect(sortNeedsDetails({ column: "modified", descending: false })).toBe(true);
    expect(sortNeedsDetails({ column: "size", descending: true })).toBe(true);
    expect(sortNeedsDetails({ column: "name", descending: false })).toBe(false);
    expect(sortNeedsDetails({ column: "NPZ", descending: false })).toBe(false);
  });
});

describe("a header click", () => {
  it("turns the sorted column around, and sorts another ascending, as Qt's header does", () => {
    expect(clickedSort({ column: "name", descending: false }, "name")).toEqual({ column: "name", descending: true });
    expect(clickedSort({ column: "name", descending: true }, "name")).toEqual({ column: "name", descending: false });
    expect(clickedSort({ column: "name", descending: true }, "NPZ")).toEqual({ column: "NPZ", descending: false });
  });
});

describe("sorting the rows", () => {
  it("compares names lowercased and plainly, so frame_10 comes before frame_2", () => {
    const rows = [row("frame_2.png"), row("Frame_10.png"), row("frame_1.png")];

    expect(names(sortRows(rows, { column: "name", descending: false }))).toEqual([
      "frame_1.png",
      "Frame_10.png",
      "frame_2.png",
    ]);
    expect(names(sortRows(rows, { column: "name", descending: true }))).toEqual([
      "frame_2.png",
      "Frame_10.png",
      "frame_1.png",
    ]);
  });

  it("sorts a format column by whether the file is there, those without it first", () => {
    const rows = [
      row("a.png", { sidecars: { NPZ: true } }),
      row("b.png", { sidecars: { NPZ: false } }),
      row("c.png", { sidecars: { NPZ: true } }),
      row("d.png", { sidecars: {} }),
    ];

    expect(names(sortRows(rows, { column: "NPZ", descending: false }))).toEqual(["b.png", "d.png", "a.png", "c.png"]);
  });

  it("keeps tied rows in the order given, descending too, as Qt's stable sort does", () => {
    // Descending is not the ascending order reversed: a.png stays above c.png.
    const rows = [
      row("a.png", { sidecars: { NPZ: true } }),
      row("b.png", { sidecars: { NPZ: false } }),
      row("c.png", { sidecars: { NPZ: true } }),
    ];

    expect(names(sortRows(rows, { column: "NPZ", descending: true }))).toEqual(["a.png", "c.png", "b.png"]);
  });

  it("sorts by size and date as numbers, one that could not be read counting as -1", () => {
    const rows = [
      row("b.png", { size: 30, modified: 300 }),
      row("a.png", { size: 10, modified: null }),
      row("c.png", { size: 20, modified: 200 }),
    ];

    expect(names(sortRows(rows, { column: "size", descending: false }))).toEqual(["a.png", "c.png", "b.png"]);
    expect(names(sortRows(rows, { column: "size", descending: true }))).toEqual(["b.png", "c.png", "a.png"]);
    // fast_file_manager.py:859-866: an unreadable time is -1, the oldest.
    expect(names(sortRows(rows, { column: "modified", descending: false }))).toEqual(["a.png", "c.png", "b.png"]);
  });

  it("leaves rows with no size or date in the order given, and the input alone", () => {
    const rows = [row("c.png"), row("a.png"), row("b.png")];

    expect(names(sortRows(rows, { column: "size", descending: true }))).toEqual(["c.png", "a.png", "b.png"]);
    expect(names(rows)).toEqual(["c.png", "a.png", "b.png"]);
  });
});
