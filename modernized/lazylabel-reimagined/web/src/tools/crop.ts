/**
 * Defining a crop — RULE-018, a P0 rule.
 *
 * A crop does not cut the image down. On save it BLANKS every mask pixel outside it (the blanking
 * itself is `applyCrop` in the format library, proven in Phase 1), so the exported files keep the
 * full image size and lose the annotations outside the rectangle. That is why this is P0 and why
 * the numbers have to be exact: a crop one pixel out deletes a row of somebody's work.
 *
 * THE CLAMP AND THE KEPT REGION DISAGREE BY ONE, AND THAT IS LEGACY'S BEHAVIOUR. Corners are
 * clamped INCLUSIVELY to `width - 1` and `height - 1`, but the region kept on save is
 * `x1..x2 - 1` and `y1..y2 - 1` — exclusive of the far edge. So a crop dragged to the very corner
 * of a 1000x800 image stores (…, 999, 799) and blanks column 999 and row 799: the last row and
 * column of the image can never be inside a crop. The rule card's title says so out loud, which is
 * how deliberate it is.
 *
 * Reproduced rather than corrected because Phase 5's exit criterion is that crop changes exports
 * exactly as in legacy, and because a correction would silently ADD a row of annotations to every
 * export a user had already made with a full-image crop.
 */

import { wholePixel } from "../canvas/coordinates.js";

/** A drag smaller than this in either direction is not a crop (`single_view_mouse_handler.py:539`). */
export const MINIMUM_CROP_DRAG = 5;

export interface Crop {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export type CropOutcome =
  | { readonly kind: "crop"; readonly crop: Crop }
  | { readonly kind: "ignored"; readonly reason: string };

/**
 * A crop from two corners: rounded, clamped, and put in order.
 *
 * Ordering happens AFTER clamping, so a rectangle dragged right-to-left or bottom-to-top gives the
 * same crop as one dragged the other way. Legacy's text panel swaps a reversed pair too.
 */
export function cropFrom(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  image: ImageSize,
): Crop {
  const xs = [clamp(Math.round(from.x), image.width), clamp(Math.round(to.x), image.width)];
  const ys = [clamp(Math.round(from.y), image.height), clamp(Math.round(to.y), image.height)];

  return {
    x1: Math.min(xs[0]!, xs[1]!),
    y1: Math.min(ys[0]!, ys[1]!),
    x2: Math.max(xs[0]!, xs[1]!),
    y2: Math.max(ys[0]!, ys[1]!),
  };
}

/**
 * A crop from a DRAG, which has a minimum size the typed panel does not.
 *
 * Strictly more than five image pixels in BOTH directions, so a stray click while the tool is
 * active cannot blank the whole image — which is what a zero-sized crop would do on the next save.
 *
 * The size is judged on the drag as it was, and the corners are then TRUNCATED, not rounded:
 * legacy crops to `int(rect.left())`, `int(rect.top())`, `int(rect.right())` and
 * `int(rect.bottom())` (single_view_mouse_handler.py:553-556), and its `round()` after that has
 * whole numbers to round (crop_manager.py:127). Rounding here cropped a pixel further out.
 */
export function cropFromDrag(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  image: ImageSize,
): CropOutcome {
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);

  if (width <= MINIMUM_CROP_DRAG || height <= MINIMUM_CROP_DRAG) {
    return {
      kind: "ignored",
      reason:
        `a crop must be more than ${MINIMUM_CROP_DRAG} pixels in both directions; `
        + `this one is ${Math.round(width)}x${Math.round(height)}`,
    };
  }

  return { kind: "crop", crop: cropFrom(wholePixel(from), wholePixel(to), image) };
}

/**
 * Parse one of the panel's ranges, e.g. "-10:1200".
 *
 * Legacy parses each half as a plain integer with NO range validation and swaps a reversed pair
 * (`border_crop_widget.py:115-135`); the clamping happens afterwards, in the crop manager. So
 * "-10:1200" on a 1000-wide image is legal input and becomes 0..999.
 */
export function parseRange(text: string): { readonly from: number; readonly to: number } | null {
  const halves = text.split(":");
  if (halves.length !== 2) return null;

  const from = Number.parseInt(halves[0]!.trim(), 10);
  const to = Number.parseInt(halves[1]!.trim(), 10);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  return from <= to ? { from, to } : { from: to, to: from };
}

function clamp(value: number, size: number): number {
  return Math.min(Math.max(0, size - 1), Math.max(0, value));
}
