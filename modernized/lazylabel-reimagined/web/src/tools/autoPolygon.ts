/**
 * Turning an AI mask into an editable polygon — legacy's "Auto-Convert".
 *
 * Two settings drive it and neither had a reader: `auto_polygon_enabled`, the toggle, and
 * `polygon_resolution`, a 1–100 slider that legacy maps to an epsilon factor for `approxPolyDP`.
 *
 * WHY IT MATTERS MORE HERE THAN THE NAME SUGGESTS. A mask is a field of pixels: you can erase into
 * it, but you cannot drag a corner. A polygon has vertices the edit tool can move. So this is the
 * difference between an AI result you accept or discard and one you can FIX — which is most of
 * what an annotator does with a model's output.
 *
 * The geometry is not reimplemented. `findExternalContours`, `arcLength` and `approxPolyDP` are
 * the Phase 1 ports of OpenCV's own, proven against goldens legacy wrote, and this is the same
 * sequence `segment_manager._mask_to_polygon_vertices` runs.
 */

import {
  approxPolyDP,
  arcLength,
  contourArea,
  findExternalContours,
  type BinaryMask,
} from "@lazylabel/annotation-formats";

/** Legacy's slider, `control_panel.py:892-899`. */
export const RESOLUTION_MIN = 1;
export const RESOLUTION_MAX = 100;
export const RESOLUTION_DEFAULT = 80;

/**
 * Slider position to the epsilon factor `approxPolyDP` takes — legacy's exact mapping.
 *
 * `0.005 * 0.02 ** (value / 100)`, which runs from 0.005 at 1 (few points, blunt) to 0.0001 at 100
 * (many points, faithful). Logarithmic, because the useful range is tiny and a linear slider would
 * spend most of its travel between "two triangles" and "two triangles".
 *
 * Note the direction: a HIGHER slider value is a SMALLER epsilon and more detail. Reading it as
 * "more simplification" would invert the control, and the user would not be able to tell from one
 * mask which way round it was.
 */
export function epsilonFactorFor(resolution: number): number {
  const raw = Number(resolution);
  const value = Number.isFinite(raw)
    ? Math.min(RESOLUTION_MAX, Math.max(RESOLUTION_MIN, raw))
    : RESOLUTION_DEFAULT;
  return 0.005 * 0.02 ** (value / 100);
}

/**
 * The polygon a mask becomes, or null when it cannot become one.
 *
 * NULL RATHER THAN A DEGENERATE SHAPE, in three cases legacy also refuses: an empty mask, a mask
 * with no contour, and an approximation that comes back with fewer than three vertices. The last
 * is the one that actually happens — a thin sliver at a blunt epsilon collapses to a line — and
 * returning it would put a two-point "polygon" in the file that every exporter has to guess about.
 *
 * THE LARGEST CONTOUR ONLY, by area, as legacy does. A mask with two islands becomes the bigger
 * island; the smaller is dropped. That is a real loss and it is legacy's behaviour, so it is kept
 * and reported rather than silently improved: the caller can say how many were discarded.
 */
export function maskToPolygon(
  mask: BinaryMask,
  epsilonFactor: number,
): { readonly vertices: readonly (readonly [number, number])[]; readonly dropped: number } | null {
  const contours = findExternalContours(mask);
  if (contours.length === 0) return null;

  let largest = contours[0]!;
  let largestArea = Math.abs(contourArea(largest));
  for (const contour of contours.slice(1)) {
    const area = Math.abs(contourArea(contour));
    if (area > largestArea) {
      largest = contour;
      largestArea = area;
    }
  }

  const epsilon = epsilonFactor * arcLength(largest, true);
  const approximated = approxPolyDP(largest, epsilon, true);

  // Legacy truncates toward zero with `int()`. Contour coordinates are non-negative integers
  // already, so this only matters if a future approximation ever returns a fraction -- and then
  // truncating is what legacy would do.
  const vertices = approximated.map(
    (point: readonly [number, number]) => [Math.trunc(point[0]), Math.trunc(point[1])] as const,
  );

  if (vertices.length < 3) return null;
  return { vertices, dropped: contours.length - 1 };
}
