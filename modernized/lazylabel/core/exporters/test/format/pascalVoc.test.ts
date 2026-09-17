/**
 * Pascal VOC, the parts no golden fixture reaches.
 *
 * RULE-004 (alias names and exclusive max bounds) and the VOC half of RULE-039 (import rules).
 *
 * The 12 golden cases prove the writer byte for byte, but every fixture class has an alias, so the
 * fallback to the id as text was untested, and the reader had no test of its own at all.
 *
 * ORACLE for the writer expectations: the LEGACY `PascalVocExporter.export`
 * (legacy/lazylabel/src/lazylabel/core/exporters/pascal_voc.py:22-63), run read-only under
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 * with CRLF normalized to LF per brief decision 10.
 *
 * ORACLE for the reader expectations: the LEGACY `FileManager.load_pascal_voc_xml`
 * (legacy/lazylabel/src/lazylabel/core/file_manager.py:456-493) run the same way on the same
 * document, reporting each segment's class id, set-pixel count and inclusive bounds.
 */

import { describe, expect, it } from "vitest";

import { parsePascalVoc, renderPascalVoc } from "../../src/format/pascalVoc.js";
import { MalformedAnnotationError } from "../../src/format/labels.js";
import { MalformedXmlError } from "../../src/format/xml.js";
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

/** 6x8 image, a 3x2 block of class 4 at x 1..3, y 1..2; class 9 present but empty. */
function context(alias?: string) {
  return syntheticContext({
    imageSize: [6, 8],
    classOrder: [4, 9],
    channelMasks: [maskFromRects(6, 8, [[1, 1, 4, 3]]), emptyMask(6, 8)],
    ...(alias === undefined ? {} : { classAliases: new Map([[4, alias]]) }),
  });
}

function voc(objects: string): string {
  return (
    "<annotation><filename>image.png</filename>" +
    "<size><width>200</width><height>100</height><depth>3</depth></size>" +
    objects +
    "</annotation>"
  );
}

function box(name: string | null, xmin?: string, ymin?: string, xmax?: string, ymax?: string): string {
  const parts: string[] = [];
  if (name !== null) parts.push(`<name>${name}</name>`);
  const coords = [
    ["xmin", xmin],
    ["ymin", ymin],
    ["xmax", xmax],
    ["ymax", ymax],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([tag, value]) => `<${tag}>${value}</${tag}>`)
    .join("");
  parts.push(`<bndbox>${coords}</bndbox>`);
  return `<object>${parts.join("")}</object>`;
}

describe("Pascal VOC export (RULE-004)", () => {
  // `ctx.class_labels[channel]` is the alias, or `str(class_id)` when there is none
  // (save_export_manager.py:401-403 via segment_manager.py:397-399). No golden fixture reaches it.
  it("writes the class id as the object name when the class has no alias", () => {
    expect(renderPascalVoc(context())).toBe(
      "<?xml version='1.0' encoding='utf-8'?>\n<annotation>\n  <filename>image.png</filename>\n" +
        "  <size>\n    <width>8</width>\n    <height>6</height>\n    <depth>3</depth>\n  </size>\n" +
        "  <object>\n    <name>4</name>\n    <pose>Unspecified</pose>\n    <truncated>0</truncated>\n" +
        "    <difficult>0</difficult>\n    <bndbox>\n      <xmin>1</xmin>\n      <ymin>1</ymin>\n" +
        "      <xmax>4</xmax>\n      <ymax>3</ymax>\n    </bndbox>\n  </object>\n</annotation>",
    );
  });

  // ElementTree escapes &, < and > in element text but leaves the double quote alone.
  it("escapes the three characters ElementTree escapes, and leaves the quote", () => {
    expect(renderPascalVoc(context('a<b>&"c'))).toContain('<name>a&lt;b&gt;&amp;"c</name>');
  });

  it("writes no file when no object survives, rather than an empty annotation document", () => {
    // Legacy returns None at pascal_voc.py:52-53, which writes nothing AND deletes nothing.
    const blank = syntheticContext({ imageSize: [6, 8], classOrder: [4, 9] });
    expect(renderPascalVoc(blank)).toBeNull();
  });
});

describe("Pascal VOC import (RULE-039)", () => {
  const SIZE = [480, 640] as const;

  it("reads xmax and ymax as exclusive, so 100,50 to 110,60 is a 10 x 10 box", () => {
    // Oracle: one segment, class 0, 100 px, x 100..109, y 50..59, alias {0: "dog"}.
    const loaded = parsePascalVoc(
      "<annotation><size><width>640</width><height>480</height></size>" +
        box("dog", "100", "50", "110", "60") +
        "</annotation>",
      SIZE,
    );
    expect(shape(loaded)).toEqual([[0, 100, [100, 50, 109, 59]]]);
    expect([...loaded.classAliases]).toEqual([[0, "dog"]]);
  });

  it("loses a pixel on each axis when a devkit file uses an inclusive xmax", () => {
    // Oracle: 81 px at x 100..108, y 50..58. Documented, not fixed (decision 15i).
    const loaded = parsePascalVoc(voc(box("dog", "100", "50", "109", "59")), SIZE);
    expect(shape(loaded)).toEqual([[0, 81, [100, 50, 108, 58]]]);
  });

  it("defaults a missing coordinate to 0, which drops the object AFTER it has claimed an id", () => {
    // Oracle: aliases {0: "ghost", 1: "dog"} but only one segment, class 1. findtext's "0" default
    // (file_manager.py:483-486) makes xmax 0, and _add_box_segments drops the collapsed box at
    // :397-398 - after _build_label_map has already handed "ghost" id 0.
    const loaded = parsePascalVoc(
      voc(box("ghost", "10", "10", undefined, "20") + box("dog", "5", "5", "15", "15")),
      [100, 200],
    );
    expect(shape(loaded)).toEqual([[1, 100, [5, 5, 14, 14]]]);
    expect([...loaded.classAliases].sort((a, b) => a[0] - b[0])).toEqual([
      [0, "ghost"],
      [1, "dog"],
    ]);
  });

  it("skips an object with no name and an object with no bndbox", () => {
    // Oracle: one segment of class 0 from "dog", aliases {0: "dog"}; "cat" never claims an id
    // because it is skipped before _build_label_map sees it.
    const loaded = parsePascalVoc(
      voc(
        box(null, "1", "1", "5", "5") +
          "<object><name>cat</name></object>" +
          box("dog", "1", "1", "5", "5"),
      ),
      [100, 200],
    );
    expect(shape(loaded)).toEqual([[0, 16, [1, 1, 4, 4]]]);
    expect([...loaded.classAliases]).toEqual([[0, "dog"]]);
  });

  it("reads an empty name as the label 0, so it becomes class 0 with no alias", () => {
    // box("") emits <name></name>, whose ElementTree .text is None, so `name_el.text or "0"` is "0".
    const loaded = parsePascalVoc(voc(box("", "1", "1", "5", "5")), [100, 200]);
    expect(shape(loaded)).toEqual([[0, 16, [1, 1, 4, 4]]]);
    expect([...loaded.classAliases]).toEqual([]);
  });

  it("skips only the object whose coordinate will not parse", () => {
    // Oracle: one segment, class 0, alias {0: "good"}. float("abc") raises ValueError INSIDE the
    // legacy try (file_manager.py:488-489), so just that object is lost and "bad" claims no id.
    const loaded = parsePascalVoc(
      voc(box("bad", "abc", "1", "5", "5") + box("good", "1", "1", "5", "5")),
      [100, 200],
    );
    expect(shape(loaded)).toEqual([[0, 16, [1, 1, 4, 4]]]);
    expect([...loaded.classAliases]).toEqual([[0, "good"]]);
  });

  it("rejects the whole document on an infinite coordinate", () => {
    // int(round(inf)) raises OverflowError OUTSIDE the except clause at file_manager.py:488-489,
    // so legacy loses every object in the file. Decision 15c requires reporting it here.
    expect(() =>
      parsePascalVoc(voc(box("a", "1", "1", "5", "5") + box("b", "inf", "1", "5", "5")), [100, 200]),
    ).toThrow(MalformedAnnotationError);
  });

  it("rounds float coordinates half to even", () => {
    // Oracle: xmin 2.5 -> 2, ymin 3.5 -> 4, xmax 10.5 -> 10, ymax 11.5 -> 12, giving 64 px at
    // x 2..9, y 4..11. Math.round would give x 3..10, y 4..11 and 56 px.
    const loaded = parsePascalVoc(voc(box("a", "2.5", "3.5", "10.5", "11.5")), [100, 200]);
    expect(shape(loaded)).toEqual([[0, 64, [2, 4, 9, 11]]]);
  });

  it("ignores an <object> that is not a direct child of the root", () => {
    // ElementTree's findall("object") matches direct children only, so the nested one is invisible.
    // Oracle: one segment of 25 px at x 10..14, y 10..14, alias {0: "top"}.
    const loaded = parsePascalVoc(
      "<annotation><outer>" + box("deep", "1", "1", "5", "5") + "</outer>" +
        box("top", "10", "10", "15", "15") + "</annotation>",
      [100, 200],
    );
    expect(shape(loaded)).toEqual([[0, 25, [10, 10, 14, 14]]]);
    expect([...loaded.classAliases]).toEqual([[0, "top"]]);
  });

  it("refuses a file that is not XML rather than reading it as no objects", () => {
    // Legacy logs the parse error and returns with nothing loaded, ending the load chain
    // (file_manager.py:466-470). Decision 15c makes that a reported failure here.
    expect(() => parsePascalVoc("this is not xml", [100, 200])).toThrow(MalformedXmlError);
  });

  // PENDING: an undocumented divergence, reported rather than fixed.
  // Oracle: legacy calls tree.getroot().findall("object") without checking the root's tag
  // (file_manager.py:472), so a third-party document rooted at anything still loads its objects -
  // one 16 px segment at x 1..4, y 1..4 with alias {0: "a"}. src/format/xml.ts:44-50 requires an
  // <annotation> root and throws instead, so such a file becomes an AnnotationLoadError.
  // Unskip if the owner decides to match legacy; otherwise record it as deviation 7 in
  // TRANSFORMATION_NOTES.md and delete this test.
  it("reads objects from a document whose root is not <annotation>", () => {
    const loaded = parsePascalVoc(
      "<notannotation>" + box("a", "1", "1", "5", "5") + "</notannotation>",
      [100, 200],
    );
    expect(shape(loaded)).toEqual([[0, 16, [1, 1, 4, 4]]]);
  });
});
