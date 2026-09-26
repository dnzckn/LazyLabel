/**
 * The file list's own logic: selecting as Qt's table selects, where dragged rows land, the
 * timeline's order over a range, and what Copy writes (CONTROL_PARITY.md CP-48).
 */

import { describe, expect, it } from "vitest";

import {
  NO_SELECTION,
  clickRow,
  copiedNames,
  filePath,
  keepShown,
  moveKeys,
  placeInOrder,
  reconcile,
  selectOnly,
  selectedKeys,
} from "../../src/dataset/fileList.js";

const ORDER = ["a", "b", "c", "d", "e"];
const plain = { shift: false, toggle: false };
const ctrl = { shift: false, toggle: true };
const shift = { shift: true, toggle: false };

describe("selecting rows, as Qt's ExtendedSelection does", () => {
  it("selects a clicked row alone and makes it current", () => {
    const selection = clickRow(selectOnly("a"), "c", plain, ORDER);

    expect(selectedKeys(selection)).toEqual(["c"]);
    expect(selection.cursor).toBe("c");
  });

  it("adds and removes rows with Ctrl, in the order they were chosen", () => {
    let selection = clickRow(NO_SELECTION, "d", plain, ORDER);
    selection = clickRow(selection, "a", ctrl, ORDER);
    selection = clickRow(selection, "c", ctrl, ORDER);

    expect(selectedKeys(selection)).toEqual(["d", "a", "c"]);

    selection = clickRow(selection, "a", ctrl, ORDER);
    expect(selectedKeys(selection)).toEqual(["d", "c"]);
    expect(selection.cursor).toBe("a");
  });

  it("selects the run from the anchor with Shift, and a second Shift click replaces the run", () => {
    let selection = clickRow(NO_SELECTION, "b", plain, ORDER);
    selection = clickRow(selection, "d", shift, ORDER);
    expect(selectedKeys(selection)).toEqual(["b", "c", "d"]);

    selection = clickRow(selection, "a", shift, ORDER);
    expect(selectedKeys(selection)).toEqual(["b", "a"]);
    expect(selection.cursor).toBe("a");
  });

  it("keeps rows chosen with Ctrl when Shift adds a run, as Qt's committed ranges stay", () => {
    let selection = clickRow(NO_SELECTION, "a", plain, ORDER);
    selection = clickRow(selection, "c", ctrl, ORDER);
    selection = clickRow(selection, "e", shift, ORDER);

    expect(selectedKeys(selection)).toEqual(["a", "c", "d", "e"]);
  });

  it("drops rows the list stops showing, the current row with them", () => {
    const selection = clickRow(clickRow(NO_SELECTION, "b", plain, ORDER), "c", ctrl, ORDER);
    const kept = keepShown(selection, new Set(["a", "b", "d"]));

    expect(selectedKeys(kept)).toEqual(["b"]);
    expect(kept.cursor).toBeNull();
    expect(keepShown(kept, new Set(ORDER))).toBe(kept);
  });
});

describe("where dragged rows land, as legacy's moveFileRows puts them", () => {
  // fast_file_manager.py:337-358.
  it("puts the moved rows before the row dropped on, keeping their own order", () => {
    expect(moveKeys(ORDER, new Set(["d", "b"]), "a")).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("puts them at the end when dropped below the last row", () => {
    expect(moveKeys(ORDER, new Set(["a", "c"]), null)).toEqual(["b", "d", "e", "a", "c"]);
  });

  it("leaves the order as it was when they are dropped on one of themselves", () => {
    expect(moveKeys(ORDER, new Set(["b", "c"]), "c")).toEqual(ORDER);
  });
});

describe("the timeline's order over the range, as legacy's reorderRows puts it", () => {
  it("puts the range's rows in the timeline's order, in the places they held", () => {
    // fast_file_manager.py:360-373.
    const { order, placed } = placeInOrder(["a", "x", "b", "y", "c"], ["a", "b", "c"], ["c", "a", "b"]);

    expect(order).toEqual(["c", "x", "a", "y", "b"]);
    expect(placed).toBe(true);
  });

  it("says when no row of the range is in the list", () => {
    expect(placeInOrder(["x", "y"], ["a"], ["a"]).placed).toBe(false);
  });
});

it("brings a kept order up to date with the listing", () => {
  expect(reconcile(["c", "a", "gone"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  expect(reconcile(null, ["a", "b"])).toEqual(["a", "b"]);
});

describe("what Copy writes, as legacy's does", () => {
  it("writes one name as it is, and several as Python's json.dumps writes a list", () => {
    // fast_file_manager.py:1692-1698.
    expect(copiedNames(["a.png"])).toBe("a.png");
    expect(copiedNames(["a.png", 'b "2".png'])).toBe('["a.png", "b \\"2\\".png"]');
  });

  it("escapes what is not printable ASCII, as json.dumps does by default", () => {
    expect(copiedNames(["é.png", "a\u007f.png"])).toBe('["\\u00e9.png", "a\\u007f.png"]');
    expect(copiedNames(["\u{1F600}.png", "b.png"])).toBe('["\\ud83d\\ude00.png", "b.png"]');
  });

  it("writes a file's path on the server, in the separator the server's path uses", () => {
    expect(filePath("E:\\data\\set", "frames/a.png")).toBe("E:\\data\\set\\frames\\a.png");
    expect(filePath("/srv/data/", "frames/a.png")).toBe("/srv/data/frames/a.png");
    expect(filePath(undefined, "frames/a.png")).toBe("frames/a.png");
  });
});
