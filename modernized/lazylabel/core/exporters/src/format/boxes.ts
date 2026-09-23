/**
 * Turning imported boxes into segments, shared by the YOLO detection, Pascal VOC and CreateML readers.
 *
 * Ported from FileManager._add_box_segments (legacy/lazylabel/src/lazylabel/core/file_manager.py:381-410).
 */

import { assertMaskBudget } from "../limits.js";
import { buildLabelMap } from "./labels.js";
import type { LoadedAnnotations, Segment } from "../types.js";

export interface ImportedBox {
  readonly label: string;
  /** Pixel bounds with x2 and y2 EXCLUSIVE, before clamping. */
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * Clamp each box to the image and fill it as a rectangular mask.
 *
 * A box that collapses to nothing after clamping is dropped, but its label has already claimed a
 * class id, so the id stays burned for the rest of the file. That is legacy behavior the rewrite
 * keeps, because the ids it burns are visible in exports.
 */
export function boxesToSegments(
  boxes: readonly ImportedBox[],
  imageSize: readonly [number, number],
  existingAliases: ReadonlyMap<number, string> = new Map(),
): LoadedAnnotations {
  const [height, width] = imageSize;
  // SEC-06, once for all three box formats: every box below becomes a full-image mask.
  assertMaskBudget(boxes.length, height, width);
  const { labelMap, aliases } = buildLabelMap(boxes.map((box) => box.label), existingAliases);
  const segments: Segment[] = [];

  let rejected = 0;
  for (const box of boxes) {
    const x1 = Math.max(0, box.x1);
    const y1 = Math.max(0, box.y1);
    const x2 = Math.min(width, box.x2);
    const y2 = Math.min(height, box.y2);
    if (x2 <= x1 || y2 <= y1) {
      rejected += 1; // collapsed entirely against the image edge
      continue;
    }

    const data = new Uint8Array(height * width);
    for (let y = y1; y < y2; y += 1) data.fill(1, y * width + x1, y * width + x2);
    segments.push({ type: "Loaded", classId: labelMap.get(box.label)!, mask: { height, width, data } });
  }
  return { segments, classAliases: aliases, rejected };
}
