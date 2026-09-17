/**
 * COCO JSON, the parts no golden fixture reaches.
 *
 * RULE-001 (export structure and area) and RULE-037 (import with polygon-then-box fallback).
 *
 * The 12 golden cases prove the writer byte for byte, but every one of them gives every class an
 * alias and none of them uses the "name.supercategory" dot notation, so three clauses of RULE-001
 * were unexercised: the dot split, the fallback to str(class_id), and a category written for a
 * class that contributes no annotation. Nothing at all exercised the reader.
 *
 * ORACLE for the writer expectations: the LEGACY exporter, run read-only under the project venv
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 * against `CocoExporter.export` (legacy/lazylabel/src/lazylabel/core/exporters/coco.py:40-97) with
 * the context each test names. CRLF normalized to LF per brief decision 10.
 *
 * ORACLE for the reader expectations: the LEGACY loader `FileManager.load_coco_json`
 * (legacy/lazylabel/src/lazylabel/core/file_manager.py:602-710), run the same way over the same
 * document, reporting each resulting segment's class id, set-pixel count and pixel bounds.
 */

import { describe, expect, it } from "vitest";

import { parseCoco, renderCoco } from "../../src/format/coco.js";
import type { BinaryMask } from "../../src/types.js";
import { emptyMask, maskBounds, maskFromRects, syntheticContext } from "../helpers/fixtures.js";

/** A 6x8 image whose class-4 channel holds a 3x2 block at x 1..3, y 1..2. Class 9 is empty. */
function twoClassesOneAnnotated() {
  return syntheticContext({
    imageSize: [6, 8],
    classOrder: [4, 9],
    channelMasks: [maskFromRects(6, 8, [[1, 1, 4, 3]]), emptyMask(6, 8)],
  });
}

function withAlias(alias: string) {
  return syntheticContext({
    imageSize: [6, 8],
    classOrder: [4, 9],
    channelMasks: [maskFromRects(6, 8, [[1, 1, 4, 3]]), emptyMask(6, 8)],
    classAliases: new Map([[4, alias]]),
  });
}

/** Set-pixel count of a loaded segment's mask. */
function pixels(mask: BinaryMask | undefined): number {
  if (!mask) return 0;
  let total = 0;
  for (const value of mask.data) if (value) total += 1;
  return total;
}

describe("COCO categories (RULE-001)", () => {
  // Legacy: `alias = ctx.class_aliases.get(class_id, str(class_id))` (coco.py:44). Every golden
  // fixture aliases every class, so the fallback had no test at all. A port that wrote null, or
  // omitted the category, would have passed the whole differential suite.
  it("names a class with no alias by its id, and still writes a category for a class with no annotation", () => {
    expect(renderCoco(twoClassesOneAnnotated())).toBe(
      '{\n  "images": [\n    {\n      "id": 1,\n      "file_name": "image.png",\n      "width": 8,' +
        '\n      "height": 6\n    }\n  ],\n  "annotations": [\n    {\n      "id": 1,\n      "image_id": 1,' +
        '\n      "category_id": 4,\n      "bbox": [\n        1,\n        1,\n        3,\n        2\n      ],' +
        '\n      "area": 2,\n      "segmentation": [\n        [\n          1,\n          1,\n          1,' +
        "\n          2,\n          3,\n          2,\n          3,\n          1\n        ]\n      ]," +
        '\n      "iscrowd": 0\n    }\n  ],\n  "categories": [\n    {\n      "id": 4,\n      "name": "4",' +
        '\n      "supercategory": "4"\n    },\n    {\n      "id": 9,\n      "name": "9",' +
        '\n      "supercategory": "9"\n    }\n  ]\n}',
    );
  });

  // Legacy `_parse_alias` uses rsplit(".", 1), so the split is at the LAST dot (coco.py:19-27).
  it("splits an alias into name and supercategory at the last dot", () => {
    const rendered = renderCoco(withAlias("dog.animal"));
    expect(rendered).toContain('"name": "dog",\n      "supercategory": "animal"');
    expect(rendered).toContain('"id": 9,\n      "name": "9",\n      "supercategory": "9"');
  });

  it("splits a multi-dot alias at the last dot, not the first", () => {
    // Oracle: alias "a.b.c" gives name "a.b", supercategory "c".
    expect(renderCoco(withAlias("a.b.c"))).toContain('"name": "a.b",\n      "supercategory": "c"');
  });

  it("gives an alias with no dot the same name and supercategory", () => {
    expect(renderCoco(withAlias("dog"))).toContain('"name": "dog",\n      "supercategory": "dog"');
  });
});

describe("COCO area for a degenerate contour (RULE-001)", () => {
  // len(contour) >= 3 counts contour POINTS, not pixels (coco.py:73-77). A 5-pixel diagonal traces
  // to a 2-point contour, so the area is the bounding-box product 5 * 5 = 25, not 5 and not 0.
  it("uses the bounding-box product for a contour of fewer than three points", () => {
    const diagonal = emptyMask(8, 8);
    for (let i = 0; i < 5; i += 1) diagonal.data[i * 8 + i] = 1;

    expect(renderCoco(syntheticContext({ imageSize: [8, 8], classOrder: [0], channelMasks: [diagonal] }))).toBe(
      '{\n  "images": [\n    {\n      "id": 1,\n      "file_name": "image.png",\n      "width": 8,' +
        '\n      "height": 8\n    }\n  ],\n  "annotations": [\n    {\n      "id": 1,\n      "image_id": 1,' +
        '\n      "category_id": 0,\n      "bbox": [\n        0,\n        0,\n        5,\n        5\n      ],' +
        '\n      "area": 25,\n      "segmentation": [\n        [\n          0,\n          0,\n          4,' +
        "\n          4,\n          4,\n          4,\n          0,\n          0\n        ]\n      ]," +
        '\n      "iscrowd": 0\n    }\n  ],\n  "categories": [\n    {\n      "id": 0,\n      "name": "0",' +
        '\n      "supercategory": "0"\n    }\n  ]\n}',
    );
  });
});

describe("COCO import: polygon then box (RULE-037)", () => {
  const SIZE = [480, 640] as const;

  it("ignores an RLE segmentation and falls back to the box, clamped to the image", () => {
    // Oracle: one class-2 segment of 100 px spanning x 630..639, y 470..479, alias 2 = "dog.animal".
    const document = JSON.stringify({
      annotations: [
        {
          category_id: 2,
          segmentation: { counts: "abc", size: [480, 640] },
          bbox: [630, 470, 20, 20],
        },
      ],
      categories: [{ id: 2, name: "dog", supercategory: "animal" }],
    });

    const loaded = parseCoco(document, SIZE);
    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]?.classId).toBe(2);
    expect(pixels(loaded.segments[0]?.mask)).toBe(100);
    expect(maskBounds(loaded.segments[0]!.mask!)).toEqual([630, 470, 639, 479]);
    expect(loaded.classAliases.get(2)).toBe("dog.animal");
  });

  it("makes one segment per polygon, skips a polygon under six numbers and drops an odd trailing value", () => {
    // Oracle: two segments of class 1, 64 px at (1,1)-(8,8) and 45 px at (20,2)-(28,6); the
    // three-number polygon is skipped and the 9-number polygon loses its trailing 99.
    const document = JSON.stringify({
      annotations: [
        {
          category_id: 1,
          segmentation: [
            [1, 1, 8, 1, 8, 8, 1, 8],
            [12, 12, 12],
            [20, 2, 28, 2, 28, 6, 20, 6, 99],
          ],
          bbox: [0, 0, 3, 3],
        },
      ],
      categories: [{ id: 1, name: "cell", supercategory: "cell" }],
    });

    const loaded = parseCoco(document, [20, 30]);
    expect(loaded.segments.map((segment) => segment.classId)).toEqual([1, 1]);
    expect(loaded.segments.map((segment) => pixels(segment.mask))).toEqual([64, 45]);
    expect(maskBounds(loaded.segments[1]!.mask!)).toEqual([20, 2, 28, 6]);
    // The box is never used once a polygon produced pixels.
    expect(loaded.segments).toHaveLength(2);
  });

  it("falls back to the box when the polygon rasterizes to nothing", () => {
    // Oracle: a polygon entirely off the image yields no pixels, so the [2,2,3,3] box is used: 9 px.
    const document = JSON.stringify({
      annotations: [
        { category_id: 3, segmentation: [[-50, -50, -40, -50, -40, -40, -50, -40]], bbox: [2, 2, 3, 3] },
      ],
    });

    const loaded = parseCoco(document, [20, 30]);
    expect(loaded.segments).toHaveLength(1);
    expect(pixels(loaded.segments[0]?.mask)).toBe(9);
    expect(maskBounds(loaded.segments[0]!.mask!)).toEqual([2, 2, 4, 4]);
  });

  it("drops an annotation whose polygon and box are both unusable", () => {
    // Oracle: zero segments. The empty box collapses at the x2 <= x1 test, and the second
    // annotation has neither key.
    const document = JSON.stringify({
      annotations: [{ category_id: 4, segmentation: [], bbox: [0, 0, 0, 0] }, { category_id: 5 }],
    });

    const loaded = parseCoco(document, [20, 30]);
    expect(loaded.segments).toHaveLength(0);
    expect(loaded.rejected).toBe(2);
  });

  it("treats a missing category_id as class 0", () => {
    // Oracle: `int(ann.get("category_id", 0))` (file_manager.py:628).
    const document = JSON.stringify({ annotations: [{ bbox: [10, 10, 5, 5] }] });
    const loaded = parseCoco(document, [20, 30]);
    expect(loaded.segments.map((segment) => segment.classId)).toEqual([0]);
    expect(pixels(loaded.segments[0]?.mask)).toBe(25);
  });

  it("returns only the names this file establishes, never the caller's table echoed back", () => {
    // The legacy loader merges into the shared store (file_manager.py:634-638); this library
    // returns the file's own contribution and the caller merges. Oracle for the VALUE: legacy
    // produced aliases {9: "keepme", 5: "x.y"} from a store that already held 9.
    const document = JSON.stringify({ annotations: [], categories: [{ id: 5, name: "x", supercategory: "y" }] });
    const loaded = parseCoco(document, [20, 30], new Map([[9, "keepme"]]));
    expect([...loaded.classAliases]).toEqual([[5, "x.y"]]);
  });

  it("names a category with no name by its id", () => {
    // Oracle: `str(cat.get("name", cat_id))` (file_manager.py:632) gives alias 7 = "7".
    const document = JSON.stringify({ annotations: [], categories: [{ id: 7 }] });
    expect(parseCoco(document, [20, 30]).classAliases.get(7)).toBe("7");
  });

  it("refuses a document whose root is not an object", () => {
    // Legacy logs "COCO JSON is not an object" and returns with nothing loaded, which ENDS the
    // load chain and shows an empty canvas (file_manager.py:620-623). Decision 15c requires this
    // library to report it instead, so the caller can tell "unreadable" from "no annotations".
    expect(() => parseCoco("[1, 2, 3]", [20, 30])).toThrow(TypeError);
  });

  // PENDING: implementation gap, reported rather than fixed (this task may not edit src/).
  // Oracle: legacy `int(ann["category_id"])` raises ValueError on "dog" and the except clause at
  // file_manager.py:629-630 SKIPS that annotation. src/format/coco.ts:110 instead falls back to 0
  // via `asInt(...) ?? 0`, so the object is loaded as class 0 and a class the user never drew
  // appears in the next export. Unskip once the reader skips the annotation.
  it("skips an annotation whose category_id is not a number", () => {
    const document = JSON.stringify({
      annotations: [
        { category_id: "dog", bbox: [1, 2, 4, 3] },
        { bbox: [10, 10, 5, 5] },
      ],
      categories: [{ id: 0, name: "zero", supercategory: "zero" }],
    });

    const loaded = parseCoco(document, [20, 30]);
    // Legacy loads ONE segment, from the second annotation only.
    expect(loaded.segments).toHaveLength(1);
    expect(pixels(loaded.segments[0]?.mask)).toBe(25);
  });
});
