/**
 * Building export contexts for tests.
 *
 * The tensor and the instance contours are built by the LIBRARY, never by hand here. A test that
 * assembles its own tensor is testing its own arithmetic; going through `createFinalMaskTensor` is
 * what makes a fixture the same thing a save would produce.
 */

import { createFinalMaskTensor, createInstanceContours } from "@lazylabel/annotation-formats";
import type { BinaryMask, ExportContext, Segment } from "@lazylabel/annotation-formats";

/** A filled square, as a Loaded segment carrying a full-image mask. */
export function squareSegment(classId: number, x: number, y: number, side: number): Segment {
  return { type: "Loaded", classId, mask: squareMask(x, y, side) };
}

export function squareMask(x: number, y: number, side: number, height = 64, width = 80): BinaryMask {
  const data = new Uint8Array(height * width);
  for (let row = y; row < Math.min(y + side, height); row += 1) {
    data.fill(1, row * width + x, row * width + Math.min(x + side, width));
  }
  return { height, width, data };
}

export function buildContext(
  imagePath: string,
  imageSize: readonly [number, number],
  segments: readonly Segment[],
  classAliases: ReadonlyMap<number, string> = new Map(),
  cropCoords: readonly [number, number, number, number] | null = null,
): ExportContext {
  const classOrder = [
    ...new Set(segments.map((segment) => segment.classId).filter((id): id is number => id !== null)),
  ].sort((a, b) => a - b);

  const maskTensor = createFinalMaskTensor(segments, imageSize, classOrder);

  return {
    imagePath,
    imageSize,
    classOrder,
    classLabels: classOrder.map((id) => classAliases.get(id) ?? String(id)),
    classAliases,
    maskTensor,
    cropCoords,
    instances: createInstanceContours(segments, imageSize, classOrder, maskTensor),
  };
}
