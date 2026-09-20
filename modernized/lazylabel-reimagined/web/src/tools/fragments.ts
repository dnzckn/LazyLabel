/**
 * The fragment filter — RULE-027.
 *
 * Before an AI mask is accepted, each separate outer region is kept only if its CONTOUR AREA is at
 * least `threshold`% of the largest region's. It removes the specks SAM leaves around an object.
 *
 * AREA IS THE CONTOUR POLYGON'S, NOT A PIXEL COUNT, and the difference is not academic. A contour
 * runs through pixel CENTRES, so a region of n pixels has an area of roughly n minus its
 * perimeter — which undercounts small pieces far more than large ones, and makes the filter
 * harsher on exactly the fragments it is deciding about. A one-pixel-wide region has contour area
 * ZERO and is therefore always dropped once filtering is on, however long it is.
 *
 * A THRESHOLD ABOVE ZERO FILLS INTERIOR HOLES. This is legacy's behaviour and a recorded defect
 * (RULE-027's suspected defect), reproduced rather than fixed: the kept pieces are redrawn as
 * filled OUTER contours, so a ring becomes a disc. Fixing it here would make a mask accepted in
 * the rewrite differ from the same mask accepted in the desktop app, which is the equivalence
 * Phase 5's exit criteria are about. It is reported instead — `holesFilled` says when the shape
 * changed beyond fragment removal, so the app can tell the user rather than letting them find out
 * from an export.
 *
 * At threshold 0 the filter is OFF: the mask is returned untouched, holes and all. That is not an
 * optimisation, it is the rule — the redraw only happens when filtering does.
 */

import {
  contourArea,
  fillPoly,
  findExternalContours,
  type BinaryMask,
} from "@lazylabel/annotation-formats";

export const MIN_THRESHOLD = 0;
export const MAX_THRESHOLD = 100;
/** `fragment_threshold_widget.py`: what Z toggles to when the saved value is 0. */
export const TOGGLE_DEFAULT = 100;

export interface FilterResult {
  readonly mask: BinaryMask;
  readonly kept: number;
  readonly dropped: number;
  /**
   * True when the redraw closed holes that were in the original.
   *
   * Legacy changes the shape here without saying so. Reporting it is the difference between a
   * user who knows their ring became a disc and one who finds out when they look at the export.
   */
  readonly holesFilled: boolean;
}

/**
 * Apply the filter.
 *
 * `threshold` is a percentage, clamped to 0..100 as the widget's range is — a settings file edited
 * by hand could hold anything, and a negative threshold would keep everything while a 200 would
 * drop all but an exact tie with the largest.
 */
export function filterFragments(mask: BinaryMask, threshold: number): FilterResult {
  const percent = clamp(threshold);

  // Off. The mask is returned as it is, holes intact -- which is the rule, not a shortcut.
  if (percent <= MIN_THRESHOLD) {
    return { mask, kept: countRegions(mask), dropped: 0, holesFilled: false };
  }

  const contours = findExternalContours(mask);
  if (contours.length === 0) {
    return { mask, kept: 0, dropped: 0, holesFilled: false };
  }

  const areas = contours.map((contour) => contourArea(contour));
  const largest = Math.max(...areas);

  // A one-pixel-wide largest region has area 0, so nothing can reach the minimum and everything
  // goes. Legacy does this, and the card names it: "if the largest region has area 0, everything
  // is dropped."
  const minimum = (percent / 100) * largest;

  const keep = contours.filter((_, index) => areas[index]! >= minimum && areas[index]! > 0);

  const redrawn = fillPoly(mask.height, mask.width, keep);

  return {
    mask: redrawn,
    kept: keep.length,
    dropped: contours.length - keep.length,
    // Every pixel the original had that the redraw also has, plus more, means holes were filled.
    holesFilled: keep.length > 0 && hasMorePixels(redrawn, mask),
  };
}

/**
 * What Z toggles to: off, or back to the last value that was on.
 *
 * Starting from 0 the memory is 100, so the first press turns the filter fully on rather than
 * doing nothing — which is what a toggle with no memory would do.
 */
export function toggleThreshold(
  current: number,
  remembered: number,
): { readonly threshold: number; readonly remembered: number } {
  if (clamp(current) > MIN_THRESHOLD) {
    return { threshold: MIN_THRESHOLD, remembered: clamp(current) };
  }
  const restored = clamp(remembered) > MIN_THRESHOLD ? clamp(remembered) : TOGGLE_DEFAULT;
  return { threshold: restored, remembered: restored };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return MIN_THRESHOLD;
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, value));
}

function countRegions(mask: BinaryMask): number {
  return findExternalContours(mask).length;
}

function hasMorePixels(after: BinaryMask, before: BinaryMask): boolean {
  let gained = false;
  for (let i = 0; i < after.data.length; i += 1) {
    if (after.data[i] !== 0 && before.data[i] === 0) {
      gained = true;
      break;
    }
  }
  return gained;
}
