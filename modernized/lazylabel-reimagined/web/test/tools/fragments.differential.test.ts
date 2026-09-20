/**
 * RULE-027 against legacy's own output — Phase 5 exit criterion 3.
 *
 * The criterion is that accepted AI masks match legacy after fragment filtering. The mask itself
 * is proven in Phase 3, against the real checkpoints, and this is the other half: what the accept
 * path does to it on the way in.
 *
 * `fragments.test.ts` works the rule card's examples. This works the bytes OpenCV produces, which
 * is a different question — the card gives the SHAPE of the filter and OpenCV supplies everything
 * it leaves out: what counts as one region, what a contour's area is, and exactly which pixels a
 * kept outline covers when it is redrawn. A port can satisfy every sentence of the card and still
 * disagree on all three.
 *
 * THE CASES ARE CHOSEN TO SEPARATE CONTOUR AREA FROM A PIXEL COUNT, because that is the mistake
 * available here and it is invisible on round numbers:
 *
 *   - `thirty-percent`: the middling region is 121 pixels against the largest's 400, which is
 *     30.25% and would be KEPT by a pixel count. Its contour area is 100 against 361, which is
 *     27.7% and is dropped. One region's worth of difference, from one wrong formula.
 *   - `hairline-always-dropped`: a 45-pixel region one pixel wide has contour area ZERO, so it
 *     goes at any threshold above nothing. A pixel count keeps it at 1%.
 *   - `one-percent-fills-holes` against `off-keeps-holes`: the same mask at thresholds 1 and 0,
 *     differing by 81 pixels. Filtering redraws kept pieces as FILLED outer contours, so a ring
 *     becomes a disc — legacy's recorded defect, reproduced deliberately.
 *
 * Regenerate with `test/fixtures/generate_fragment_goldens.py`.
 */

import { describe, expect, it } from "vitest";

import type { BinaryMask } from "@lazylabel/annotation-formats";

import { filterFragments } from "../../src/tools/fragments.js";
import goldens from "../fixtures/legacy-fragments.json" with { type: "json" };

interface Case {
  readonly label: string;
  readonly height: number;
  readonly width: number;
  readonly threshold: number;
  readonly input: readonly number[];
  /** Null where legacy returns None: no mask at all, rather than an empty one. */
  readonly expected: readonly number[] | null;
  readonly inputPixels: number;
  readonly expectedPixels: number | null;
}

const CASES = goldens.cases as readonly Case[];

function maskOf(one: Case): BinaryMask {
  return { height: one.height, width: one.width, data: Uint8Array.from(one.input) };
}

/** Where the two first disagree, as a coordinate rather than an index. */
function firstDifference(
  actual: Uint8Array,
  expected: readonly number[],
  width: number,
): string | null {
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      return `(${i % width}, ${Math.floor(i / width)}): got ${actual[i]}, legacy has ${expected[i]}`;
    }
  }
  return actual.length === expected.length ? null : `length ${actual.length} vs ${expected.length}`;
}

describe("the fragment filter, byte for byte", () => {
  it.each(CASES.map((one) => [one.label, one] as const))("%s", (_label, one) => {
    const result = filterFragments(maskOf(one), one.threshold);

    if (one.expected === null) {
      // Legacy returns None here, which is "there is no mask" rather than "the mask is empty".
      // The port carries the same outcome as a mask with nothing set, and the accept path treats
      // that as nothing to accept -- so what has to agree is that NOTHING SURVIVES.
      expect(sum(result.mask.data)).toBe(0);
      return;
    }

    expect(firstDifference(result.mask.data, one.expected, one.width)).toBeNull();
  });
});

describe("what the goldens prove that the rule card cannot", () => {
  const find = (label: string): Case => {
    const one = CASES.find((entry) => entry.label === label);
    if (one === undefined) throw new Error(`the fixture has no case called ${label}`);
    return one;
  };

  it("uses CONTOUR AREA, not a pixel count, to judge a region", () => {
    // The middling region is 30.25% of the largest by pixels and 27.7% by contour area. At a
    // threshold of 30 those answers differ, and the fixture records the contour-area one.
    const one = find("thirty-percent");
    const result = filterFragments(maskOf(one), one.threshold);

    expect(sum(result.mask.data)).toBe(one.expectedPixels);
    // Only the largest survives. A pixel-count filter would have kept two regions.
    expect(result.kept).toBe(1);
    expect(result.dropped).toBe(2);
  });

  it("drops a one-pixel-wide region however long it is", () => {
    // Contour area zero, because the polygon through the pixel centres of a 1xN region is a line.
    const one = find("hairline-always-dropped");
    const result = filterFragments(maskOf(one), one.threshold);

    expect(sum(result.mask.data)).toBe(400);
    expect(one.inputPixels).toBe(445);
  });

  it("keeps that same region when filtering is OFF", () => {
    // Threshold 0 is not "keep everything by a threshold of zero", it is the filter not running.
    // The distinction matters because running it would also redraw, and redrawing fills holes.
    const one = find("hairline-kept-when-off");
    const result = filterFragments(maskOf(one), 0);

    expect(sum(result.mask.data)).toBe(445);
  });

  it("fills interior holes at threshold 1 and leaves them at 0", () => {
    // Legacy's recorded defect: kept pieces are redrawn as FILLED outer contours. The difference
    // between one percent and none is 81 pixels of hole, not one percent of anything.
    const off = find("off-keeps-holes");
    const on = find("one-percent-fills-holes");

    expect(sum(filterFragments(maskOf(off), 0).mask.data)).toBe(360);

    const filled = filterFragments(maskOf(on), 1);
    expect(sum(filled.mask.data)).toBe(441);
    // And it is REPORTED, which legacy does not do. A user whose ring became a disc should not
    // have to find that out from an export.
    expect(filled.holesFilled).toBe(true);
  });

  it("drops a mask whose largest region has no area, rather than keeping it on a tie", () => {
    // This is the case the fixture CORRECTED. Reading the rule card alone suggests the minimum is
    // 0, `area >= 0` holds, and a single pixel survives -- which is what the first version of the
    // generator produced, disagreeing with the port. Legacy has an explicit `if max_area == 0:
    // return None` above the comparison, so the whole mask goes. The port was right and the
    // transcription was wrong, which is the argument for transcribing rather than paraphrasing.
    const one = find("single-pixel-dropped-entirely");
    const result = filterFragments(maskOf(one), one.threshold);

    expect(one.inputPixels).toBe(1);
    expect(one.expected).toBeNull();
    expect(sum(result.mask.data)).toBe(0);
  });

  it("drops a mask made only of hairlines, all of whose areas are zero", () => {
    // The same guard, reached with 44 pixels rather than one -- so it cannot be mistaken for an
    // empty-input shortcut.
    const one = find("only-hairlines-dropped-entirely");
    const result = filterFragments(maskOf(one), one.threshold);

    expect(one.inputPixels).toBe(44);
    expect(sum(result.mask.data)).toBe(0);
  });

  it("leaves an empty mask empty rather than failing on no contours", () => {
    const one = find("empty-mask");
    const result = filterFragments(maskOf(one), one.threshold);

    expect(sum(result.mask.data)).toBe(0);
    expect(result.kept).toBe(0);
  });
});

function sum(data: Uint8Array): number {
  let total = 0;
  for (const value of data) total += value;
  return total;
}
