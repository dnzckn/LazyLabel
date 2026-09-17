/**
 * Characterization tests for the YOLO Segmentation READER.
 *
 * Legacy under test:
 *   legacy/lazylabel/src/lazylabel/core/file_manager.py:542-600  (FileManager.load_yolo_seg_txt)
 *   legacy/lazylabel/src/lazylabel/core/file_manager.py:345-379  (FileManager._build_label_map)
 *
 * Cards: RULE-041 (YOLO Segmentation import validation), RULE-007 (label text to class id),
 * RULE-006 (the writer this reader must round-trip with).
 *
 * Every expected value below was derived from the legacy source and confirmed by a read-only run
 * of that same logic against the lazylabel venv (cv2 4.12.0, numpy 2.2.6). None of it came from
 * running a TypeScript implementation.
 *
 * Two intentional divergences from the legacy are marked inline, both from
 * MODERNIZATION_BRIEF.md decision 15: (b) a leading byte-order mark is stripped, and (c) a file
 * that fails to parse is reported rather than silently falling through to another format.
 */

import { describe, expect, it } from "vitest";

import { parseYoloSegmentation } from "../../src/index.js";
import type { BinaryMask, LoadedAnnotations, Segment } from "../../src/types.js";
import {
  CASE_IDS,
  buildExportContext,
  channelOf,
  countSetPixels,
  emptyMask,
  fixtureCase,
  goldenSegText,
  maskBounds,
  maskPixelAt,
} from "../helpers/fixtures.js";

const NO_ALIASES: ReadonlyMap<number, string> = new Map<number, string>();

/** `image_size` is (height, width) throughout the legacy loader (file_manager.py:551). */
function parse(
  text: string,
  height: number,
  width: number,
  existingAliases: ReadonlyMap<number, string> = NO_ALIASES,
): LoadedAnnotations {
  return parseYoloSegmentation(text, [height, width], existingAliases);
}

function requireMask(segment: Segment): BinaryMask {
  if (!segment.mask) throw new Error("a Loaded segment must carry a rasterized mask");
  return segment.mask;
}

interface MaskDifference {
  readonly x: number;
  readonly y: number;
  readonly actual: number;
  readonly expected: number;
}

/** First differing pixel, or null. Reported this way so a failure names a coordinate. */
function firstMaskDifference(actual: BinaryMask, expected: BinaryMask): MaskDifference | null {
  for (let y = 0; y < expected.height; y += 1) {
    for (let x = 0; x < expected.width; x += 1) {
      const a = actual.data[y * actual.width + x] ?? 0;
      const e = expected.data[y * expected.width + x] ?? 0;
      if ((a === 0) !== (e === 0)) return { x, y, actual: a, expected: e };
    }
  }
  return null;
}

function unionOfClass(
  annotations: LoadedAnnotations,
  classId: number,
  height: number,
  width: number,
): BinaryMask {
  const union = emptyMask(height, width);
  for (const segment of annotations.segments) {
    if (segment.classId !== classId) continue;
    const mask = requireMask(segment);
    for (let i = 0; i < union.data.length; i += 1) {
      if (mask.data[i] !== 0) union.data[i] = 1;
    }
  }
  return union;
}

const CASES = [...CASE_IDS];

describe("round trip: what the writer exported is what the reader loads", () => {
  // RULE-006 edge case "axis-aligned shapes round-trip to the exact pixel set on reload";
  // RULE-041. legacy file_manager.py:571-575 + :580-586 invert yolo_segmentation.py:39-42.
  // All 12 fixtures round-trip pixel-exactly, including the rasterized circle and both pixel
  // priority variants, which is the exit criterion for the Phase 1 pilot slice.
  it.each(CASES)(
    "%s reloads the exact pixel set of every exported class channel",
    (id) => {
      const fixture = fixtureCase(id);
      const height = fixture.imageSize[0];
      const width = fixture.imageSize[1];
      const { context } = buildExportContext(id);
      const loaded = parse(goldenSegText(id), height, width);

      context.classOrder.forEach((classId, channel) => {
        const expected = channelOf(context.maskTensor, channel);
        const actual = unionOfClass(loaded, classId, height, width);
        expect(firstMaskDifference(actual, expected)).toBeNull();
      });
    },
    30_000,
  );

  // RULE-041; RULE-005 Answer (2026-09-17) on sparse ids. legacy file_manager.py:571-575, :589-598.
  // The golden's two lines carry the tokens 3 and 7; both come back as those class ids, as
  // "Loaded" segments with the rounded integer vertices kept for potential editing.
  it("reloads sparse class ids, vertices and type from the two-class golden", () => {
    const loaded = parse(goldenSegText("two-classes-sparse-ids"), 20, 30);

    expect(loaded.segments.map((s) => s.classId)).toEqual([3, 7]);
    expect(loaded.segments.map((s) => s.type)).toEqual(["Loaded", "Loaded"]);
    expect(loaded.segments[0]?.vertices).toEqual([
      [4, 5],
      [4, 9],
      [13, 9],
      [13, 5],
    ]);
    expect(loaded.segments[1]?.vertices).toEqual([
      [20, 12],
      [20, 17],
      [27, 17],
      [27, 12],
    ]);
    expect(countSetPixels(requireMask(loaded.segments[0]!))).toBe(50);
    expect(countSetPixels(requireMask(loaded.segments[1]!))).toBe(48);
  });

  // RULE-006 edge case "a 1-pixel object is written as the same point repeated 4 times";
  // RULE-041. legacy exporters/__init__.py:156-157 writes it, file_manager.py:580-586 fills it.
  // cv2.fillPoly on four identical points sets exactly that one pixel.
  it("reloads a four-times-repeated point as a single pixel", () => {
    const loaded = parse(goldenSegText("single-pixel-objects"), 16, 16);

    expect(loaded.segments).toHaveLength(2);
    expect(loaded.segments.map((s) => s.classId)).toEqual([9, 9]);
    const first = requireMask(loaded.segments[0]!);
    expect(countSetPixels(first)).toBe(1);
    expect(maskPixelAt(first, 12, 9)).toBe(1);
    const second = requireMask(loaded.segments[1]!);
    expect(countSetPixels(second)).toBe(1);
    expect(maskPixelAt(second, 3, 3)).toBe(1);
  });
});

describe("line validation", () => {
  // RULE-041 "min tokens 7; token count must be odd". legacy file_manager.py:563-565.
  // The card's own worked example: label plus exactly 3 pairs on a 640x480 image.
  it("accepts a 7-token line as label plus three points", () => {
    const loaded = parse("0 0.1 0.1 0.2 0.1 0.2 0.2", 480, 640);

    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]?.classId).toBe(0);
    expect(loaded.segments[0]?.vertices).toEqual([
      [64, 48],
      [128, 48],
      [128, 96],
    ]);
    expect(countSetPixels(requireMask(loaded.segments[0]!))).toBe(1617);
  });

  // RULE-041 edge case "a 5-token YOLO Detection file with a colliding _seg.txt name loads
  // nothing". legacy file_manager.py:564: `len(parts) < 7` skips it before any float parse.
  it("skips a 5-token detection line", () => {
    expect(parse("3 0.5 0.5 0.25 0.5", 480, 640).segments).toEqual([]);
  });

  // RULE-041 edge case "an 8-token line is skipped entirely". legacy file_manager.py:564:
  // `len(parts) % 2 == 0`. An even count means a dangling coordinate, and the WHOLE line goes,
  // not just the odd value.
  it("skips an even-token line rather than dropping the dangling coordinate", () => {
    expect(parse("0 0.1 0.1 0.2 0.1 0.2 0.2 0.3", 480, 640).segments).toEqual([]);
  });

  // RULE-041 "A polygon needs at least 3 coordinate pairs". legacy file_manager.py:576.
  // The `len(points) >= 3` guard is DEAD CODE: 7-or-more tokens with an odd count always leaves
  // at least 6 coordinates, so a short polygon can only arrive as a short line, which :564
  // already rejected. Pinned here so a port that drops the guard stays equivalent.
  it("rejects a two-point line at the token guard, never at the point guard", () => {
    // 5 tokens = label + 2 points: fails `len(parts) < 7`.
    expect(parse("0 0.1 0.1 0.2 0.2", 480, 640).segments).toEqual([]);
    // 7 tokens = label + 3 points: the smallest line that can survive.
    expect(parse("0 0.1 0.1 0.2 0.1 0.2 0.2", 480, 640).segments).toHaveLength(1);
  });

  // RULE-041. legacy file_manager.py:562 uses `line.strip().split()`, which splits on ANY run of
  // whitespace, so tabs and doubled spaces are separators and a trailing newline is stripped.
  it("treats tabs and repeated spaces as separators", () => {
    const loaded = parse("0\t0.1  0.1\t0.2 0.1 0.2 0.2\n", 480, 640);
    expect(loaded.segments[0]?.vertices).toEqual([
      [64, 48],
      [128, 48],
      [128, 96],
    ]);
  });

  // RULE-041. legacy file_manager.py:562-565: an empty or whitespace-only line splits to fewer
  // than 7 tokens and is skipped, so trailing newlines never produce a segment.
  it("skips blank and whitespace-only lines", () => {
    const loaded = parse("\n   \n0 0.1 0.1 0.2 0.1 0.2 0.2\n\n", 480, 640);
    expect(loaded.segments).toHaveLength(1);
  });

  // NOT IN ANY CARD. legacy file_manager.py:562-566 has no comment syntax: a '#' line with an odd
  // token count parses, and '#' becomes a CLASS NAME through _build_label_map (:365-377).
  // A port that skips '#' lines would silently drop a class the legacy created.
  it("treats a leading # as a class label, not a comment", () => {
    const loaded = parse("# 0.1 0.1 0.2 0.1 0.2 0.2", 480, 640);

    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]?.classId).toBe(0);
    expect(loaded.classAliases.get(0)).toBe("#");
  });

  // RULE-041. legacy file_manager.py:555-560 reads the file; an empty file yields no lines.
  it("returns nothing for empty text", () => {
    const loaded = parse("", 480, 640);
    expect(loaded.segments).toEqual([]);
    expect([...loaded.classAliases]).toEqual([]);
  });
});

describe("coordinate denormalization", () => {
  // RULE-041 "rounding Python round()" — round HALF TO EVEN, which the card's Parameters line
  // leaves unspecified and both P0 judges flagged. legacy file_manager.py:571-575.
  // Image (h=50, w=200): 0.125*200 = 25.0, 0.25*50 = 12.5 -> 12 (JS Math.round gives 13),
  // 0.5*50 = 25.0, 0.5*200 = 100.0. A width/height swap would give (6, 50) instead of (25, 12).
  it("rounds an exact half down to even and scales x by width, y by height", () => {
    const loaded = parse("0 0.125 0.25 0.125 0.5 0.5 0.5", 50, 200);

    expect(loaded.segments[0]?.vertices).toEqual([
      [25, 12],
      [25, 25],
      [100, 25],
    ]);
    expect(countSetPixels(requireMask(loaded.segments[0]!))).toBe(570);
  });

  // RULE-041. legacy file_manager.py:573. Four ties in one line on a 5x10 image:
  // 0.5*5 = 2.5 -> 2, 0.25*10 = 2.5 -> 2, 0.75*10 = 7.5 -> 8, 0.9*5 = 4.5 -> 4.
  // Math.round would give 3, 3, 8 and 5; only the 7.5 case agrees.
  it("rounds every exact half toward the even neighbour", () => {
    const loaded = parse("0 0.5 0.25 0.5 0.75 0.9 0.75", 10, 5);

    expect(loaded.segments[0]?.vertices).toEqual([
      [2, 2],
      [2, 8],
      [4, 8],
    ]);
    expect(countSetPixels(requireMask(loaded.segments[0]!))).toBe(14);
  });

  // RULE-041; the fidelity judge's point (5). legacy file_manager.py:571-575 does NOT clamp, and
  // :595 stores the unclamped vertices while cv2.fillPoly (:584) clips the raster to the image.
  it("stores off-image vertices unclamped and clips only the mask", () => {
    const loaded = parse("0 -0.5 -0.5 0.1 0.1 0.2 0.2", 480, 640);

    expect(loaded.segments[0]?.vertices).toEqual([
      [-320, -240],
      [64, 48],
      [128, 96],
    ]);
    const mask = requireMask(loaded.segments[0]!);
    expect(countSetPixels(mask)).toBe(129);
    expect(maskBounds(mask)).toEqual([0, 0, 128, 96]);
  });

  // RULE-041 "dropped if no pixel is set", read precisely. legacy file_manager.py:587-588.
  // A flat polygon at x = 1.0 maps to column 640 on a 640-wide image, which is off the grid, so
  // it fills nothing and is dropped. Coordinates are NOT clamped to width-1 first.
  it("drops a polygon that lands entirely off the image", () => {
    expect(parse("0 1.0 0.1 1.0 0.2 1.0 0.3", 480, 640).segments).toEqual([]);
  });

  // RULE-041; the fidelity judge's point (5). legacy file_manager.py:584-588.
  // Zero-area polygons are KEPT, not dropped: the same flat shape at x = 0.0 rasterizes to a
  // 97-pixel vertical line, and three identical points rasterize to a single pixel.
  it("keeps a zero-area polygon that still covers pixels", () => {
    const flat = parse("0 0.0 0.1 0.0 0.2 0.0 0.3", 480, 640);
    const flatMask = requireMask(flat.segments[0]!);
    expect(countSetPixels(flatMask)).toBe(97);
    expect(maskBounds(flatMask)).toEqual([0, 48, 0, 144]);

    const dot = parse("0 0.1 0.1 0.1 0.1 0.1 0.1", 480, 640);
    const dotMask = requireMask(dot.segments[0]!);
    expect(countSetPixels(dotMask)).toBe(1);
    expect(maskPixelAt(dotMask, 64, 48)).toBe(1);
  });
});

describe("unparseable numbers", () => {
  // RULE-041 "all numeric". legacy file_manager.py:567-570: only parts[1:] goes through float(),
  // and a ValueError skips THAT LINE ONLY. The next line still loads, and because the label map
  // is built from the surviving lines (:579), the survivor's own token decides its class.
  it("skips only the line whose coordinate will not parse", () => {
    const loaded = parse(
      ["0 0.1 0.1 abc 0.1 0.2 0.2", "1 0.1 0.1 0.2 0.1 0.2 0.2"].join("\n"),
      480,
      640,
    );

    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]?.classId).toBe(1);
  });

  // NOT IN ANY CARD. legacy file_manager.py:568 uses Python float(), which REJECTS "0x10"
  // (ValueError) while JavaScript's Number("0x10") returns 16. A port built on Number() would
  // load a polygon the legacy skipped.
  it("skips a hexadecimal literal that JavaScript Number() would accept", () => {
    expect(parse("0 0x10 0.1 0.2 0.1 0.2 0.2", 480, 640).segments).toEqual([]);
  });

  // NOT IN ANY CARD. legacy file_manager.py:568: Python float() ACCEPTS digit-group underscores,
  // so "1_0" is 10.0, while JavaScript's Number("1_0") is NaN. The line loads, and the vertex
  // keeps the unclamped 6400.
  it("accepts an underscore-grouped literal that JavaScript Number() would reject", () => {
    const loaded = parse("0 1_0 0.1 0.2 0.1 0.2 0.2", 480, 640);

    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]?.vertices).toEqual([
      [6400, 48],
      [128, 48],
      [128, 96],
    ]);
  });

  // RULE-041; both judges' headline defect, absent from the card. legacy file_manager.py:567-570
  // wraps only float(), so "nan" passes and then int(round(nan)) at :573 raises ValueError
  // OUTSIDE the try. The whole file is abandoned: the valid first line never becomes a segment.
  // MODERNIZATION_BRIEF.md decision 15(c) keeps the all-or-nothing outcome but requires the
  // failure to be REPORTED instead of falling through to a lower-priority format. Throwing is
  // the only reporting channel this signature has; if the implementation adds a result type,
  // update this expectation rather than deleting it.
  it("fails the whole file on a nan coordinate, discarding valid lines", () => {
    const text = ["0 0.1 0.1 0.2 0.1 0.2 0.2", "1 nan 0.1 0.2 0.1 0.2 0.2"].join("\n");
    expect(() => parse(text, 480, 640)).toThrow();
  });

  // RULE-041. legacy file_manager.py:573: int(round(inf)) raises OverflowError, likewise outside
  // the try. "1e999" overflows to inf on the way in and behaves identically.
  it("fails the whole file on an infinite coordinate", () => {
    expect(() => parse("0 inf 0.1 0.2 0.1 0.2 0.2", 480, 640)).toThrow();
    expect(() => parse("0 1e999 0.1 0.2 0.1 0.2 0.2", 480, 640)).toThrow();
  });

  // RULE-041; the fidelity judge's "partial load" defect. legacy file_manager.py:584 raises
  // OverflowError converting a coordinate beyond int32 AFTER earlier polygons were already added
  // to the store. MODERNIZATION_BRIEF.md decision 15(c) makes the rewrite all-or-nothing, which
  // this signature gets for free: a throw returns nothing at all.
  it("fails on a coordinate beyond int32 and keeps no partial result", () => {
    const text = ["0 0.1 0.1 0.2 0.1 0.2 0.2", "1 1e12 0.1 0.2 0.1 0.2 0.2"].join("\n");
    expect(() => parse(text, 480, 640)).toThrow();
  });
});

describe("label text to class id", () => {
  // RULE-007 Specification: objects in order 'dog', '0', 'cat' give dog 1, 0 -> 0, cat 2, with
  // aliases {1: 'dog', 2: 'cat'}. legacy file_manager.py:345-379.
  // Numeric labels claim their ids FIRST (:359-368), then names take the lowest free id in
  // first-appearance order (:370-377), so 'dog' cannot collide with the literal '0'.
  it("gives numeric labels their id and names the lowest id left over", () => {
    const text = [
      "dog 0.1 0.1 0.2 0.1 0.2 0.2",
      "0 0.1 0.1 0.2 0.1 0.2 0.2",
      "cat 0.1 0.1 0.2 0.1 0.2 0.2",
    ].join("\n");

    const loaded = parse(text, 480, 640);

    expect(loaded.segments.map((s) => s.classId)).toEqual([1, 0, 2]);
    expect(loaded.classAliases.get(1)).toBe("dog");
    expect(loaded.classAliases.get(2)).toBe("cat");
    expect(loaded.classAliases.has(0)).toBe(false);
  });

  // RULE-007 "a label equal to an existing alias uses that class".
  // legacy file_manager.py:355, :362-364: the reverse alias map is consulted BEFORE int().
  it("resolves a label that matches an existing alias to that alias's id", () => {
    const loaded = parse(
      "dog 0.1 0.1 0.2 0.1 0.2 0.2",
      480,
      640,
      new Map([[5, "dog"]]),
    );

    expect(loaded.segments[0]?.classId).toBe(5);
  });

  // RULE-007; the compliance judge's caveat "unless an existing alias is named '0'".
  // legacy file_manager.py:362-366: the alias lookup wins over int(label), so a numeric-looking
  // label can resolve to a completely different id.
  it("lets an alias literally named 0 beat the integer reading of 0", () => {
    const loaded = parse("0 0.1 0.1 0.2 0.1 0.2 0.2", 480, 640, new Map([[5, "0"]]));

    expect(loaded.segments[0]?.classId).toBe(5);
  });

  // RULE-007 edge case "label '07' becomes class 7". legacy file_manager.py:366 uses int(),
  // which ignores leading zeros. parseInt-style JS behaves the same here, but a port that keys
  // classes by the raw token would split 7 and 07 into two classes.
  it("reads the label 07 as class 7", () => {
    expect(parse("07 0.1 0.1 0.2 0.1 0.2 0.2", 480, 640).segments[0]?.classId).toBe(7);
  });

  // NOT IN ANY CARD. legacy file_manager.py:366 uses Python int(), which accepts PEP 515 digit
  // group underscores: int("1_0") is 10, so the label is NUMERIC and no alias is registered.
  // Confirmed read-only against the venv. The same applies to float() on the coordinates, so a
  // port that rejects underscores splits one class into two on this input.
  it("reads the underscore-grouped label 1_0 as class 10, not as a name", () => {
    const loaded = parse("1_0 0.1 0.1 0.2 0.1 0.2 0.2", 480, 640);

    expect(loaded.segments[0]?.classId).toBe(10);
    expect([...loaded.classAliases]).toEqual([]);
  });

  // RULE-007 "any other name gets the lowest ID not taken". legacy file_manager.py:370-376:
  // `taken` seeds from the EXISTING aliases as well as this file's numeric labels, so an unused
  // alias id is skipped even when no line in the file uses it.
  it("skips ids already held by unrelated aliases when naming a new class", () => {
    const loaded = parse(
      "cat 0.1 0.1 0.2 0.1 0.2 0.2",
      480,
      640,
      new Map([
        [0, "bird"],
        [1, "fish"],
      ]),
    );

    expect(loaded.segments[0]?.classId).toBe(2);
    expect(loaded.classAliases.get(2)).toBe("cat");
  });

  // RULE-007; the fidelity judge's point (6), absent from the card. legacy file_manager.py:579
  // builds the label map BEFORE the empty-mask drop at :587-588, so a name whose only polygon is
  // dropped still consumes an id and still registers an alias.
  it("lets a dropped polygon consume an id and register its alias", () => {
    const text = [
      "cat 1.0 0.1 1.0 0.2 1.0 0.3", // off-image: rasterizes to nothing and is dropped
      "dog 0.1 0.1 0.2 0.1 0.2 0.2",
    ].join("\n");

    const loaded = parse(text, 480, 640);

    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]?.classId).toBe(1);
    expect(loaded.classAliases.get(0)).toBe("cat");
    expect(loaded.classAliases.get(1)).toBe("dog");
  });

  // RULE-007. legacy file_manager.py:359-361 skips a label it has already resolved, so repeats
  // share one id rather than taking a new one per line.
  it("gives every line with the same name the same id", () => {
    const text = [
      "cat 0.1 0.1 0.2 0.1 0.2 0.2",
      "cat 0.3 0.3 0.4 0.3 0.4 0.4",
      "dog 0.1 0.1 0.2 0.1 0.2 0.2",
    ].join("\n");

    const loaded = parse(text, 480, 640);

    expect(loaded.segments.map((s) => s.classId)).toEqual([0, 0, 1]);
    expect(loaded.classAliases.get(0)).toBe("cat");
    expect(loaded.classAliases.get(1)).toBe("dog");
  });

  // RULE-007. legacy file_manager.py:365-368 only reaches the alias branch for non-numeric
  // labels, so a purely numeric file registers no aliases at all.
  it("registers no aliases for a file of numeric labels", () => {
    const loaded = parse(goldenSegText("two-classes-sparse-ids"), 20, 30);
    expect([...loaded.classAliases]).toEqual([]);
  });

  // API AMBIGUITY, flagged rather than guessed. The legacy MUTATES
  // segment_manager.class_aliases in place (file_manager.py:377), so "what the file carried" and
  // "the store's aliases afterwards" are the same object there and distinct here. The tests above
  // assert the NEW registrations only; if the library instead returns existingAliases merged with
  // the new ones, this is the test that has to start passing and the ones above that must change.
  it.skip("pending API decision: does classAliases echo the aliases passed in?", () => {
    const loaded = parse(
      "cat 0.1 0.1 0.2 0.1 0.2 0.2",
      480,
      640,
      new Map([[5, "dog"]]),
    );
    expect([...loaded.classAliases].sort()).toEqual([
      [0, "cat"],
      [5, "dog"],
    ]);
  });
});

describe("encoding", () => {
  // MODERNIZATION_BRIEF.md decision 15(b): read label files as UTF-8 and STRIP a leading
  // byte-order mark. This is a deliberate divergence. Legacy file_manager.py:556 opens the file
  // with the locale default and never strips the BOM, so "﻿0" is not numeric
  // (int() raises) and _build_label_map registers it as a NEW CLASS NAME (:365-377) with id 0 —
  // the "BOM becomes a class" bug decision 15(b) names.
  it("strips a leading byte-order mark instead of making it part of the class name", () => {
    const loaded = parse("﻿0 0.1 0.1 0.2 0.1 0.2 0.2", 480, 640);

    expect(loaded.segments[0]?.classId).toBe(0);
    expect([...loaded.classAliases]).toEqual([]);
  });

  // RULE-041. legacy file_manager.py:555-565 is terminator-agnostic because :562 strips the line,
  // so a file written on Windows (CRLF, which is how the goldens were captured) loads the same as
  // one written on Linux. MODERNIZATION_BRIEF.md decision 10 only governs writing.
  it("reads CRLF and LF files identically", () => {
    const lf = "0 0.1 0.1 0.2 0.1 0.2 0.2\n1 0.3 0.3 0.4 0.3 0.4 0.4\n";
    const crlf = lf.replace(/\n/g, "\r\n");

    const fromLf = parse(lf, 480, 640);
    const fromCrlf = parse(crlf, 480, 640);

    expect(fromCrlf.segments.map((s) => s.classId)).toEqual(fromLf.segments.map((s) => s.classId));
    expect(fromCrlf.segments.map((s) => s.vertices)).toEqual(
      fromLf.segments.map((s) => s.vertices),
    );
  });

  // RULE-041. legacy file_manager.py:555-560 reads the raw golden, which has no final-line
  // special case: the last line loads whether or not the file ends with a terminator.
  it("loads a final line that has no terminator", () => {
    const withTerminator = parse("0 0.1 0.1 0.2 0.1 0.2 0.2\n", 480, 640);
    const without = parse("0 0.1 0.1 0.2 0.1 0.2 0.2", 480, 640);

    expect(without.segments).toHaveLength(1);
    expect(without.segments[0]?.vertices).toEqual(withTerminator.segments[0]?.vertices);
  });
});
