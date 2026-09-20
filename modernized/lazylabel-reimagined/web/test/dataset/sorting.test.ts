/**
 * The order the dataset browser lists images in — RULE-036's `file_manager_sort_order`.
 *
 * Six orders in legacy; two of them can be performed here, because `WireDatasetImage` carries no
 * `modified` and no `size` and `listing.ts` deliberately does not stat. The interesting part is
 * what happens to the other four.
 */

import { describe, expect, it } from "vitest";

import { isSupported, labelFor, sortImages } from "../../src/dataset/sorting.js";

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

describe("the four that cannot be performed", () => {
  it("says so rather than pretending", () => {
    for (const order of [2, 3, 4, 5]) expect(isSupported(order), String(order)).toBe(false);
    expect(isSupported(0)).toBe(true);
    expect(isSupported(1)).toBe(true);
  });

  it("falls back to the order that arrived, not to some other one", () => {
    // A user whose imported legacy settings say "size, largest first" must not be shown a list
    // sorted by name that claims to be sorted by size. The browser names the fallback.
    for (const order of [2, 3, 4, 5]) expect(sortImages(IMAGES, order)).toBe(IMAGES);
  });

  it("still names them, so the message can say which one", () => {
    expect(labelFor(5)).toMatch(/Size/);
    expect(labelFor(3)).toMatch(/Modified/);
  });

  it("falls back for a value outside the six", () => {
    expect(isSupported(99)).toBe(false);
    expect(labelFor(99)).toMatch(/Name/);
  });
});
