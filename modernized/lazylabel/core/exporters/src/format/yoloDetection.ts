/**
 * YOLO Detection: one normalized centre/size box per object, in `<base>.txt`.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/yolo_detection.py:19-46.
 * Reader ported from FileManager.load_bb_txt (file_manager.py:412-454).
 *
 * Implements the rule cards "YOLO Detection export line format" and
 * "YOLO Detection import validation, rounding and clamping".
 *
 * Do NOT use FileManager.save_bb_txt (file_manager.py:74-123) as a reference: it writes the same
 * path but emits the alias NAME instead of the class id, and nothing in the app calls it.
 */

import { boundingRect } from "../geometry/contours.js";
import { assertText, MalformedAnnotationError, parseFloatLikePython, toPixel } from "./labels.js";
import { boxesToSegments, type ImportedBox } from "./boxes.js";
import { iterObjectContours } from "./objects.js";
import { pyRepr } from "./pyRepr.js";
import type { ExportContext, LoadedAnnotations , RenderOptions } from "../types.js";

/** Render the file body, or null where the legacy exporter writes no file. */
export function renderYoloDetection(ctx: ExportContext, options?: RenderOptions): string | null {
  const [height, width] = ctx.imageSize;
  if (height <= 0 || width <= 0) return null;

  const lines: string[] = [];
  for (const { channel, contour } of iterObjectContours(ctx)) {
    const { x, y, width: bw, height: bh } = boundingRect(contour);
    // Keep this arithmetic order: regrouping to (2x + bw)/(2w) changes the last bits.
    const cx = (x + bw / 2) / width;
    const cy = (y + bh / 2) / height;
    lines.push(
      `${ctx.classOrder[channel]} ${pyRepr(cx)} ${pyRepr(cy)} ${pyRepr(bw / width)} ${pyRepr(bh / height)}`,
    );
  }

  if (lines.length === 0 && options?.writeEmpty !== true) return null;
  return lines.map((line) => `${line}\n`).join("");
}

/**
 * Parse a `.txt` body into segments.
 *
 * A line must have exactly 5 whitespace-separated tokens, and its four coordinates must parse as
 * numbers; anything else is skipped. Corners are recovered as round-half-to-even of the
 * denormalized centre and size, so a tie lands on the EVEN pixel. A non-finite coordinate rejects
 * the whole file, as in legacy.
 */
export function parseYoloDetection(
  text: string,
  imageSize: readonly [number, number],
  existingAliases: ReadonlyMap<number, string> = new Map(),
): LoadedAnnotations {
  assertText(text, "YOLO Detection");
  const [height, width] = imageSize;
  const boxes: ImportedBox[] = [];
  let rejected = 0;

  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/).filter((token) => token.length > 0);
    if (parts.length === 0) continue; // a blank line is not a rejection
    if (parts.length !== 5) {
      rejected += 1;
      continue;
    }

    const numbers = parts.slice(1).map((token) => parseFloatLikePython(token));
    if (numbers.some((value) => value === null)) {
      rejected += 1;
      continue;
    }
    const [cx, cy, bw, bh] = numbers as [number, number, number, number];

    boxes.push({
      label: parts[0]!,
      x1: toPixel((cx - bw / 2) * width, "a box's left edge"),
      y1: toPixel((cy - bh / 2) * height, "a box's top edge"),
      x2: toPixel((cx + bw / 2) * width, "a box's right edge"),
      y2: toPixel((cy + bh / 2) * height, "a box's bottom edge"),
    });
  }
  const loaded = boxesToSegments(boxes, imageSize, existingAliases);
  return { ...loaded, rejected: loaded.rejected + rejected };
}

export { MalformedAnnotationError };
