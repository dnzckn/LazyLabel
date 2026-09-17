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
import { roundHalfToEven } from "../util/pyNumbers.js";
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
        roundHalfToEven(coords[i]! * width),
        roundHalfToEven(coords[i + 1]! * height),
      ]);
    }
    if (points.length >= 3) polygons.push({ label: parts[0]!, points });
  }

  const { labelMap, newAliases } = buildLabelMap(polygons.map((p) => p.label), existingAliases);
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

/**
 * Python's float() accepts more spellings than Number(): "nan", "inf", "infinity", a leading "+",
 * and surrounding whitespace, while rejecting "" and JavaScript's "0x10" and "1_0".
 * Returns null where float() would raise ValueError, which makes the caller skip the line.
 */
function parseFloatLikePython(token: string): number | null {
  const text = token.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) {
    if (/^[+-]?(nan|inf|infinity)$/i.test(text)) {
      const negative = text.startsWith("-");
      if (/nan$/i.test(text)) return Number.NaN;
      return negative ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    }
    return null;
  }
  return Number(text);
}

/**
 * Resolve every label in one file to a class id.
 *
 * Order per label: an existing alias, then a plain integer, then a freshly assigned id. Assignment
 * happens only after every numeric label has claimed its id, so a file mixing "dog" with "0" does
 * not hand both the same id and merge two classes. Newly assigned ids are registered as aliases so
 * the name survives.
 */
function buildLabelMap(
  labels: readonly string[],
  existingAliases: ReadonlyMap<number, string>,
): { labelMap: Map<string, number>; newAliases: Map<number, string> } {
  const reverse = new Map<string, number>();
  for (const [id, alias] of existingAliases) reverse.set(alias, id);

  const labelMap = new Map<string, number>();
  const unnamed: string[] = [];
  for (const label of labels) {
    if (labelMap.has(label) || unnamed.includes(label)) continue;
    const aliased = reverse.get(label);
    if (aliased !== undefined) {
      labelMap.set(label, aliased);
      continue;
    }
    const asInt = parseIntLikePython(label);
    if (asInt !== null) labelMap.set(label, asInt);
    else unnamed.push(label);
  }

  const taken = new Set<number>([...existingAliases.keys(), ...labelMap.values()]);
  const newAliases = new Map<number, string>(existingAliases);
  let nextId = 0;
  for (const label of unnamed) {
    while (taken.has(nextId)) nextId += 1;
    labelMap.set(label, nextId);
    taken.add(nextId);
    newAliases.set(nextId, label);
  }
  return { labelMap, newAliases };
}

/** Python's int(): optional sign, digits only. Number() would accept "1.5" and "0x10". */
function parseIntLikePython(token: string): number | null {
  const text = token.trim();
  return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}
