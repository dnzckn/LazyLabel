/**
 * YOLO Detection import: validation, half-to-even rounding and the asymmetric clamp.
 *
 * RULE-040, plus the box half of RULE-007 (label text to class id) which the YOLO Segmentation
 * parse suite only proves for the polygon path. The load-chain suite exercised this reader but
 * asserted nothing beyond "some segments came back", so none of the rounding, clamping or
 * label-ordering clauses were covered.
 *
 * ORACLE: the LEGACY loader `FileManager.load_bb_txt` with `_add_box_segments` and
 * `_build_label_map` (legacy/lazylabel/src/lazylabel/core/file_manager.py:381-454, :345-379), run
 * read-only under the project venv
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 * on exactly the text each test passes, reporting each segment's class id, set-pixel count and
 * inclusive pixel bounds, plus the resulting alias table.
 */

import { describe, expect, it } from "vitest";

import { parseYoloDetection } from "../../src/format/yoloDetection.js";
import { MalformedAnnotationError } from "../../src/format/labels.js";
import type { BinaryMask, LoadedAnnotations } from "../../src/types.js";
import { maskBounds } from "../helpers/fixtures.js";

function pixels(mask: BinaryMask | undefined): number {
  if (!mask) return 0;
  let total = 0;
  for (const value of mask.data) if (value) total += 1;
  return total;
}

/** [classId, pixelCount, [xMin, yMin, xMax, yMax]] per segment, as the oracle reports them. */
function shape(loaded: LoadedAnnotations) {
  return loaded.segments.map((segment) => [
    segment.classId,
    pixels(segment.mask),
    segment.mask ? maskBounds(segment.mask) : null,
  ]);
}

describe("YOLO Detection import: rounding (RULE-040)", () => {
  // The case the rule card's answer names: on a 1024-wide image a half-UP port keeps a box that
  // legacy drops entirely, so the divergence is a whole object, not one pixel.
  // (cx - bw/2) * 1024 = 2.0 and (cx + bw/2) * 1024 = 2.5; Python's round sends the tie to the
  // even 2, so x2 == x1 and the box collapses at file_manager.py:397-398.
  it("drops a box whose right edge is an exact tie that rounds down to the even pixel", () => {
    const loaded = parseYoloDetection("0 0.002197265625 0.5 0.00048828125 0.5\n", [1024, 1024]);
    expect(loaded.segments).toHaveLength(0); // Math.round would have kept a 1 x 512 box
  });

  it("keeps the neighbouring box that is genuinely one pixel wider", () => {
    // Oracle: one class-0 segment, 1024 px, spanning x 2..3 and y 256..767.
    const loaded = parseYoloDetection("0 0.002685546875 0.5 0.00146484375 0.5\n", [1024, 1024]);
    expect(shape(loaded)).toEqual([[0, 1024, [2, 256, 3, 767]]]);
  });

  it("halves the size before multiplying by the image dimension", () => {
    // Oracle: 800 px at x 80..119, y 40..59 for a 100 x 200 image (height, width).
    expect(shape(parseYoloDetection("1 0.5 0.5 0.2 0.2\n", [100, 200]))).toEqual([[1, 800, [80, 40, 119, 59]]]);
  });
});

describe("YOLO Detection import: line validation (RULE-040)", () => {
  it("skips any line that does not have exactly five tokens", () => {
    // Oracle: only the final 5-token line survives; the 4-token, 6-token and non-numeric lines and
    // the blank lines contribute nothing.
    const text = "0 0.5 0.5 0.2\n0 0.5 0.5 0.2 0.2 0.1\n0 0.5 0.5 0.2 abc\n\n   \n1 0.5 0.5 0.2 0.2\n";
    const loaded = parseYoloDetection(text, [100, 200]);
    expect(shape(loaded)).toEqual([[1, 800, [80, 40, 119, 59]]]);
    expect(loaded.rejected).toBe(3); // the two wrong token counts and the unparseable coordinate
  });

  it("splits on tabs and runs of whitespace, as line.strip().split() does", () => {
    expect(shape(parseYoloDetection("0\t0.5\t0.5\t0.2\t0.2\n", [100, 200]))).toEqual([
      [0, 800, [80, 40, 119, 59]],
    ]);
  });

  it("accepts an underscore-grouped literal and rejects a hexadecimal one, as Python float() does", () => {
    // Oracle: the 0x10 line is skipped, so only the first line loads.
    const loaded = parseYoloDetection("0 0.5 0.5 0.2 0.2\n1 0x10 0.5 0.2 0.2\n", [100, 200]);
    expect(shape(loaded)).toEqual([[0, 800, [80, 40, 119, 59]]]);
  });

  it("rejects the whole file on a nan coordinate, discarding the valid lines", () => {
    // Legacy: float("nan") passes the try, then int(round(...)) raises OUTSIDE it
    // (file_manager.py:446-449), so every valid box in the file is lost too.
    expect(() =>
      parseYoloDetection("0 0.5 0.5 0.2 0.2\n0 nan 0.5 0.2 0.2\n0 0.25 0.25 0.1 0.1\n", [100, 200]),
    ).toThrow(MalformedAnnotationError);
  });

  it("rejects the whole file on an infinite coordinate", () => {
    expect(() => parseYoloDetection("0 0.5 0.5 0.2 0.2\n0 inf 0.5 0.2 0.2\n", [100, 200])).toThrow(
      MalformedAnnotationError,
    );
  });
});

describe("YOLO Detection import: clamping and dropping (RULE-040)", () => {
  it("clamps a box that hangs off the top-left corner", () => {
    // Oracle: 1250 px spanning x 0..49, y 0..24.
    expect(shape(parseYoloDetection("0 0.05 0.05 0.4 0.4\n", [100, 200]))).toEqual([
      [0, 1250, [0, 0, 49, 24]],
    ]);
  });

  it("drops a box with a negative width, because the clamp never reorders the corners", () => {
    expect(parseYoloDetection("0 0.5 0.5 -0.2 0.2\n", [100, 200]).segments).toHaveLength(0);
  });

  it("drops a box that lies entirely beyond the right edge", () => {
    // x1 is clamped up from below only, and x2 down from above only, so a box at cx = 2.0 leaves
    // x2 = width <= x1 and collapses.
    expect(parseYoloDetection("0 2.0 0.5 0.2 0.2\n", [100, 200]).segments).toHaveLength(0);
  });
});

describe("YOLO Detection import: label to class id (RULE-007, RULE-040)", () => {
  it("assigns ids over every parsed box, before the clamp drops any of them", () => {
    // Oracle: aliases {0: "gone", 1: "dog"}; segments are class 1 (800 px) and class 3 (200 px).
    // "gone" is off the image and contributes no segment, yet it still burns id 0, which pushes
    // "dog" to 1 and is visible in the next export.
    const text = "gone -5.0 -5.0 0.1 0.1\ndog 0.5 0.5 0.2 0.2\n3 0.25 0.25 0.1 0.1\n";
    const loaded = parseYoloDetection(text, [100, 200]);

    expect(shape(loaded)).toEqual([
      [1, 800, [80, 40, 119, 59]],
      [3, 200, [40, 20, 59, 29]],
    ]);
    expect([...loaded.classAliases].sort((a, b) => a[0] - b[0])).toEqual([
      [0, "gone"],
      [1, "dog"],
    ]);
  });

  it("lets an existing alias literally named 0 beat the integer reading of 0", () => {
    // Oracle: class 4, because the alias table already maps 4 -> "0" (file_manager.py:362-364).
    const loaded = parseYoloDetection("0 0.5 0.5 0.2 0.2\n", [100, 200], new Map([[4, "0"]]));
    expect(shape(loaded)).toEqual([[4, 800, [80, 40, 119, 59]]]);
    expect([...loaded.classAliases]).toEqual([]); // the file established no new name
  });

  it("gives every line with the same name one id", () => {
    // Oracle: two class-0 segments and aliases {0: "dog"}.
    const loaded = parseYoloDetection("dog 0.25 0.25 0.1 0.1\ndog 0.75 0.75 0.1 0.1\n", [100, 200]);
    expect(shape(loaded)).toEqual([
      [0, 200, [40, 20, 59, 29]],
      [0, 200, [140, 70, 159, 79]],
    ]);
    expect([...loaded.classAliases]).toEqual([[0, "dog"]]);
  });

  it("reads the label 07 as class 7 and registers no alias", () => {
    const loaded = parseYoloDetection("07 0.5 0.5 0.2 0.2\n", [100, 200]);
    expect(shape(loaded)).toEqual([[7, 800, [80, 40, 119, 59]]]);
    expect([...loaded.classAliases]).toEqual([]);
  });
});
