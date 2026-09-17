/**
 * CreateML, the parts no golden fixture reaches.
 *
 * RULE-002 (pixel centre boxes, export and import) and the CreateML half of RULE-039.
 *
 * The 12 golden cases prove the writer byte for byte, including the ".5" centre an odd-width box
 * produces and the "20.0" a whole one does. What they never touched is the label fallback for a
 * class with no alias, and the reader, whose asymmetric reconstruction (the corner rounds first,
 * then the size is ADDED) is the clause most likely to be "simplified" into round(cx + w/2).
 *
 * ORACLE for the writer expectation: the LEGACY `CreateMlExporter.export`
 * (legacy/lazylabel/src/lazylabel/core/exporters/createml.py:33-67), run read-only under
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 * with CRLF normalized to LF per brief decision 10.
 *
 * ORACLE for the reader expectations: the LEGACY `FileManager.load_createml_json`
 * (legacy/lazylabel/src/lazylabel/core/file_manager.py:495-540) run the same way.
 */

import { describe, expect, it } from "vitest";

import { parseCreateMl, renderCreateMl } from "../../src/format/createMl.js";
import { MalformedAnnotationError } from "../../src/format/labels.js";
import type { BinaryMask, LoadedAnnotations } from "../../src/types.js";
import { emptyMask, maskBounds, maskFromRects, syntheticContext } from "../helpers/fixtures.js";

function pixels(mask: BinaryMask | undefined): number {
  if (!mask) return 0;
  let total = 0;
  for (const value of mask.data) if (value) total += 1;
  return total;
}

function shape(loaded: LoadedAnnotations) {
  return loaded.segments.map((segment) => [
    segment.classId,
    pixels(segment.mask),
    segment.mask ? maskBounds(segment.mask) : null,
  ]);
}

function document(annotations: unknown[], image = "image.png"): string {
  return JSON.stringify([{ image, annotations }]);
}

describe("CreateML export (RULE-002)", () => {
  it("labels a class that has no alias with its id, and writes the centre as a float", () => {
    // Oracle: a 3 x 2 block at x 1..3, y 1..2 gives x 2.5 (odd width) and y 2.0 (even height),
    // and Python writes the whole centre as "2.0", not "2".
    const context = syntheticContext({
      imageSize: [6, 8],
      classOrder: [4, 9],
      channelMasks: [maskFromRects(6, 8, [[1, 1, 4, 3]]), emptyMask(6, 8)],
    });

    expect(renderCreateMl(context)).toBe(
      '[\n  {\n    "image": "image.png",\n    "annotations": [\n      {\n        "label": "4",\n' +
        '        "coordinates": {\n          "x": 2.5,\n          "y": 2.0,\n          "width": 3,\n' +
        '          "height": 2\n        }\n      }\n    ]\n  }\n]',
    );
  });

  it("writes no file when no object survives", () => {
    expect(renderCreateMl(syntheticContext({ imageSize: [6, 8], classOrder: [4, 9] }))).toBeNull();
  });
});

describe("CreateML import (RULE-002, RULE-039)", () => {
  it("round trips the rule card's box back onto exactly the same pixels", () => {
    // Oracle: centre 201.0 / 100.0 with width 200, height 100 refills columns 101..300 and
    // rows 50..149, 20000 px, class 0 with alias {0: "cat"}.
    const loaded = parseCreateMl(
      document([{ label: "cat", coordinates: { x: 201.0, y: 100.0, width: 200, height: 100 } }]),
      [200, 400],
    );
    expect(shape(loaded)).toEqual([[0, 20000, [101, 50, 300, 149]]]);
    expect([...loaded.classAliases]).toEqual([[0, "cat"]]);
  });

  it("round trips an odd-width box whose centre lands on a half pixel", () => {
    // Oracle: centre 200.5, width 201 -> columns 100..300, 20100 px.
    const loaded = parseCreateMl(
      document([{ label: "cat", coordinates: { x: 200.5, y: 100.0, width: 201, height: 100 } }]),
      [200, 400],
    );
    expect(shape(loaded)).toEqual([[0, 20100, [100, 50, 300, 149]]]);
  });

  it("rounds the corner first and then ADDS the size, which is not round(cx + w/2)", () => {
    // Oracle: centre 10, width 3 gives x1 = round(8.5) = 8 (half to even) and x2 = 8 + 3 = 11,
    // so the box spans x 8..10 and holds 9 px. Computing x2 as round(10 + 1.5) = 12 would span
    // x 8..11 and hold 12 px, and Math.round on the corner would span x 9..11.
    const loaded = parseCreateMl(
      document([{ label: "a", coordinates: { x: 10, y: 10, width: 3, height: 3 } }]),
      [100, 200],
    );
    expect(shape(loaded)).toEqual([[0, 9, [8, 8, 10, 10]]]);
  });

  it("rounds each corner half to even", () => {
    // Oracle: centre 3 width 5 -> x1 = round(0.5) = 0, columns 0..4; centre 4 width 5 ->
    // x1 = round(1.5) = 2, columns 2..6. Both 25 px.
    const loaded = parseCreateMl(
      document([
        { label: "a", coordinates: { x: 3, y: 3, width: 5, height: 5 } },
        { label: "b", coordinates: { x: 4, y: 4, width: 5, height: 5 } },
      ]),
      [100, 200],
    );
    expect(shape(loaded)).toEqual([
      [0, 25, [0, 0, 4, 4]],
      [1, 25, [2, 2, 6, 6]],
    ]);
  });

  it("reads only the first image entry", () => {
    // Oracle: one segment from a.png; the b.png entry is never read.
    const text = JSON.stringify([
      { image: "a.png", annotations: [{ label: "a", coordinates: { x: 5, y: 5, width: 4, height: 4 } }] },
      { image: "b.png", annotations: [{ label: "b", coordinates: { x: 50, y: 50, width: 4, height: 4 } }] },
    ]);
    const loaded = parseCreateMl(text, [100, 200]);
    expect(shape(loaded)).toEqual([[0, 16, [3, 3, 6, 6]]]);
    expect([...loaded.classAliases]).toEqual([[0, "a"]]);
  });

  it("loads nothing when the first entry has no annotations, even if a later one does", () => {
    const text = JSON.stringify([
      { image: "a.png" },
      { image: "b.png", annotations: [{ label: "b", coordinates: { x: 50, y: 50, width: 4, height: 4 } }] },
    ]);
    expect(parseCreateMl(text, [100, 200]).segments).toHaveLength(0);
  });

  it("treats a missing label as '0' and skips an annotation with no coordinates", () => {
    // Oracle: one class-0 segment of 16 px and no aliases, because "0" reads as the integer 0.
    const loaded = parseCreateMl(
      document([{ coordinates: { x: 5, y: 5, width: 4, height: 4 } }, { label: "nocoords" }]),
      [100, 200],
    );
    expect(shape(loaded)).toEqual([[0, 16, [3, 3, 6, 6]]]);
    expect([...loaded.classAliases]).toEqual([]);
    expect(loaded.rejected).toBe(1);
  });

  it("defaults a missing coordinate key to 0, collapsing the box but keeping its alias", () => {
    // Oracle: zero segments and aliases {0: "a"} - `float(coords.get(key, 0))` gives width 0, so
    // x2 == x1 and _add_box_segments drops it after the label already claimed id 0.
    const loaded = parseCreateMl(document([{ label: "a", coordinates: { x: 5 } }]), [100, 200]);
    expect(loaded.segments).toHaveLength(0);
    expect([...loaded.classAliases]).toEqual([[0, "a"]]);
  });

  it("reads string coordinates through Python's float grammar", () => {
    // Oracle: 16 px at x 8..11, y 8..11.
    const loaded = parseCreateMl(
      document([{ label: "a", coordinates: { x: "10", y: "10", width: "4", height: "4" } }]),
      [100, 200],
    );
    expect(shape(loaded)).toEqual([[0, 16, [8, 8, 11, 11]]]);
  });

  it("rejects the whole file on a nan coordinate", () => {
    // Legacy: float("nan") passes, then int(round(...)) raises outside the per-annotation try
    // (file_manager.py:526-534), discarding the valid annotation too.
    expect(() =>
      parseCreateMl(
        document([
          { label: "a", coordinates: { x: 5, y: 5, width: 4, height: 4 } },
          { label: "b", coordinates: { x: "nan", y: 5, width: 4, height: 4 } },
        ]),
        [100, 200],
      ),
    ).toThrow(MalformedAnnotationError);
  });

  it("loads nothing from a root that is not a non-empty list of objects", () => {
    // Legacy returns at file_manager.py:509-510 without raising, so this is EMPTY, not FAILED:
    // the file still wins the load chain rather than falling through to a lower-priority sidecar.
    expect(parseCreateMl(JSON.stringify({ image: "i.png" }), [100, 200]).segments).toHaveLength(0);
    expect(parseCreateMl("[]", [100, 200]).segments).toHaveLength(0);
  });
});
