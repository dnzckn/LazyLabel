/**
 * YOLO Segmentation: normalized polygon vertices, one line per object, in `<base>_seg.txt`.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/yolo_segmentation.py:25-56.
 * Reader ported from legacy/lazylabel/src/lazylabel/core/file_manager.py:542-600 and the label
 * resolution at :345-379.
 *
 * Implements the rule cards "YOLO Segmentation export polygon simplification",
 * "YOLO Segmentation import validation" and "Label text to class ID resolution on import".
 */

import { approxPolyDP, arcLength, fillPoly } from "../geometry/contours.js";
import { buildLabelMap, parseFloatLikePython, toPixel } from "./labels.js";
import type { LoadedAnnotations, ExportContext, Segment } from "../types.js";
import { contourToPolygon, iterObjectContours } from "./objects.js";
import { pyRepr } from "./pyRepr.js";

/** Polygon simplification tolerance: 0.1% of the contour's perimeter. */
const EPSILON_FRACTION = 0.001;

/**
 * Render the file body, or null where the legacy exporter writes no file.
 *
 * Null means "write nothing", which is NOT the same as "delete": a stale `_seg.txt` from an earlier
 * save survives, because exporting never removes files (decision 15f covers warning about that).
 */
export function renderYoloSegmentation(ctx: ExportContext): string | null {
  const [height, width] = ctx.imageSize;
  if (height <= 0 || width <= 0) return null; // guard is <= 0, not == 0

  const lines: string[] = [];
  for (const { channel, contour } of iterObjectContours(ctx)) {
    const epsilon = EPSILON_FRACTION * arcLength(contour, true);
    const polygon = contourToPolygon(approxPolyDP(contour, epsilon, true));
    const coords: string[] = [];
    for (let i = 0; i < polygon.length; i += 2) {
      coords.push(`${pyRepr(polygon[i]! / width)} ${pyRepr(polygon[i + 1]! / height)}`);
    }
    lines.push(`${ctx.classOrder[channel]} ${coords.join(" ")}`);
  }

  if (lines.length === 0) return null;
  return lines.map((line) => `${line}\n`).join("");
}

/**
 * Parse a `_seg.txt` body into segments.
 *
 * Validation matches the legacy loader exactly: a line needs at least 7 whitespace-separated tokens
 * and an odd token count, coordinates must all parse as numbers, and fewer than 3 points is
 * dropped. Coordinates denormalize with round-half-to-even, so a tie moves to the EVEN pixel.
 * A polygon that rasterizes to no pixels is dropped rather than stored empty.
 *
 * The label token is never parsed as a number here, so a line beginning "dog" loads fine. A
 * non-finite coordinate rejects the entire file rather than one line, because that is what the
 * legacy loader does and skipping the line would draw polygons legacy never draws.
 */
export function parseYoloSegmentation(
  text: string,
  imageSize: readonly [number, number],
  existingAliases: ReadonlyMap<number, string> = new Map(),
): LoadedAnnotations {
  const [height, width] = imageSize;
  const polygons: { label: string; points: [number, number][] }[] = [];

  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/).filter((token) => token.length > 0);
    if (parts.length < 7 || parts.length % 2 === 0) continue;

    const coords = parts.slice(1).map((token) => parseFloatLikePython(token));
    if (coords.some((value) => value === null)) continue;

    const points: [number, number][] = [];
    for (let i = 0; i < coords.length; i += 2) {
      points.push([
        toPixel(coords[i]! * width, "a polygon x coordinate"),
        toPixel(coords[i + 1]! * height, "a polygon y coordinate"),
      ]);
    }
    if (points.length >= 3) polygons.push({ label: parts[0]!, points });
  }

  const { labelMap, aliases: newAliases } = buildLabelMap(polygons.map((p) => p.label), existingAliases);
  const segments: Segment[] = [];
  for (const { label, points } of polygons) {
    const mask = fillPoly(height, width, [points]);
    if (!mask.data.some((v) => v !== 0)) continue; // a polygon that covers nothing is dropped
    segments.push({
      type: "Loaded",
      classId: labelMap.get(label)!,
      mask,
      vertices: points.map(([x, y]) => [x, y] as const),
    });
  }
  return { segments, classAliases: newAliases };
}
