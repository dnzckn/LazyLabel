/**
 * The order the dataset browser lists images in — RULE-036's `file_manager_sort_order`.
 *
 * Six orders in legacy; two of them can be performed here, because `WireDatasetImage` carries no
 * `modified` and no `size` and `listing.ts` deliberately does not stat. The interesting part is
 * what happens to the other four.
 */

import { describe, expect, it } from "vitest";

import { needsDetails, sortImages } from "../../src/dataset/sorting.js";

const IMAGES = [{ name: "a.png" }, { name: "B.png" }, { name: "c.png" }];
const names = (order: number) => sortImages(IMAGES, order).map((image) => image.name);

describe("the orders that work", () => {
  it("leaves order 0 exactly as it arrived", () => {
    // The API already sorts by lowercased name when it builds the listing, so a second sort here
    // could only disagree with the server's -- on case, most likely.
    expect(sortImages(IMAGES, 0)).toBe(IMAGES);
  });

  it("reverses for order 1, case-insensitively", () => {
    expect(names(1)).toEqual(["c.png", "B.png", "a.png"]);
  });

  it("never mutates the input", () => {
    sortImages(IMAGES, 1);

    expect(IMAGES.map((image) => image.name)).toEqual(["a.png", "B.png", "c.png"]);
  });
});

describe("the four that sort by a file's date or size", () => {
  const dated = [
    { name: "b.png", modified: 300, size: 30 },
    { name: "a.png", modified: 100, size: 10 },
    { name: "c.png", modified: 200, size: 20 },
  ];
  const by = (order: number) => sortImages(dated, order).map((image) => image.name);

  it("sorts oldest and newest first", () => {
    expect(by(2)).toEqual(["a.png", "c.png", "b.png"]);
    expect(by(3)).toEqual(["b.png", "c.png", "a.png"]);
  });

  it("sorts smallest and largest first", () => {
    expect(by(4)).toEqual(["a.png", "c.png", "b.png"]);
    expect(by(5)).toEqual(["b.png", "c.png", "a.png"]);
  });

  it("breaks ties by NAME, so a folder written in one second is still ordered", () => {
    const sameSecond = [{ name: "c.png", modified: 5 }, { name: "a.png", modified: 5 }, { name: "b.png", modified: 5 }];

    expect(sortImages(sameSecond, 2).map((i) => i.name)).toEqual(["a.png", "b.png", "c.png"]);
  });

  it("sorts an UNKNOWN date last, whichever way the order runs", () => {
    // A gap in what is known, not a very old or very small file. The port allows a store that
    // cannot report a modified time at all.
    const partial = [{ name: "a.png", modified: null }, { name: "b.png", modified: 10 }];

    expect(sortImages(partial, 2).map((i) => i.name)).toEqual(["b.png", "a.png"]);
    expect(sortImages(partial, 3).map((i) => i.name)).toEqual(["b.png", "a.png"]);
  });

  it("falls back to the order it was given when NOTHING carries the field", () => {
    // One render after the order changes, before the listing has been refetched with details --
    // and forever for a store that cannot report one. Better than putting every file it cannot
    // measure at one end.
    expect(sortImages(IMAGES, 3)).toBe(IMAGES);
    expect(sortImages(IMAGES, 5)).toBe(IMAGES);
  });

  it("says which orders need the listing to carry details", () => {
    for (const order of [2, 3, 4, 5]) expect(needsDetails(order), String(order)).toBe(true);
    expect(needsDetails(0)).toBe(false);
    expect(needsDetails(1)).toBe(false);
  });

  it("falls back for a value outside the six", () => {
    expect(sortImages(IMAGES, 99)).toBe(IMAGES);
  });
});
