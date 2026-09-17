/**
 * Building the one-hot mask tensor and the per-object contours every writer consumes.
 *
 * Ported clause by clause from the legacy implementation:
 * - SegmentManager.rasterize_polygon / rasterize_circle (segment_manager.py:174-203)
 * - SegmentManager.create_final_mask_tensor (segment_manager.py:212-252)
 * - SegmentManager._apply_pixel_priority (segment_manager.py:317-373)
 * - FileManager._apply_crop_to_mask (file_manager.py:712-739)
 * - SegmentManager.create_instance_contours (segment_manager.py:254-315)
 *
 * Implements RULE-005 (final per-class mask composition), RULE-014 (pixel priority),
 * RULE-016 (crop) and the shape rasterization rule. See analysis/lazylabel/BUSINESS_RULES.md.
 */

import { fillCircle, fillPoly, findExternalContours } from "../geometry/contours.js";
import { roundHalfToEven, truncToward0 } from "../util/pyNumbers.js";
import type { BinaryMask, InstanceContour, MaskTensor, Segment } from "../types.js";

/** Rasterize one segment to a full-image mask, or null when it contributes nothing. */
export function rasterizeSegment(segment: Segment, height: number, width: number): BinaryMask | null {
  if (segment.type === "Polygon") {
    if (!segment.vertices || segment.vertices.length === 0) return null;
    // np.array(..., dtype=np.int32) truncates toward zero before fillPoly sees the points.
    const points = segment.vertices.map(([x, y]) => [truncToward0(x), truncToward0(y)] as [number, number]);
    return fillPoly(height, width, [points]);
  }
  if (segment.type === "Circle") {
    if (!segment.vertices || segment.vertices.length < 2) return null;
    const [cx, cy] = segment.vertices[0]!;
    const [rx, ry] = segment.vertices[1]!;
    const radius = roundHalfToEven(Math.sqrt((rx - cx) ** 2 + (ry - cy) ** 2));
    if (radius <= 0) return null; // a zero or negative radius draws nothing
    return fillCircle(height, width, [roundHalfToEven(cx), roundHalfToEven(cy)], radius);
  }
  return segment.mask ?? null;
}

/**
 * One binary channel per entry of classOrder, the union of every segment carrying that class.
 *
 * A segment whose class is not in classOrder is skipped, exactly as the legacy id_map lookup does.
 */
export function createFinalMaskTensor(
  segments: readonly Segment[],
  imageSize: readonly [number, number],
  classOrder: readonly number[],
  pixelPriority: { enabled: boolean; ascending: boolean } = { enabled: false, ascending: true },
): MaskTensor {
  const [height, width] = imageSize;
  const channels = classOrder.length;
  const data = new Uint8Array(height * width * channels);
  const channelOf = new Map<number, number>(classOrder.map((id, index) => [id, index]));

  for (const segment of segments) {
    const channel = segment.classId === null ? undefined : channelOf.get(segment.classId);
    if (channel === undefined) continue;
    const mask = rasterizeSegment(segment, height, width);
    if (!mask) continue;
    for (let pixel = 0; pixel < height * width; pixel += 1) {
      if (mask.data[pixel]) data[pixel * channels + channel] = 1;
    }
  }

  const tensor: MaskTensor = { height, width, classOrder: [...classOrder], data };
  return pixelPriority.enabled ? applyPixelPriority(tensor, pixelPriority.ascending) : tensor;
}

/**
 * Where several classes claim one pixel, keep a single class: the lowest channel when ascending,
 * the highest when descending. Pixels claimed by one class are untouched.
 */
export function applyPixelPriority(tensor: MaskTensor, ascending: boolean): MaskTensor {
  const { height, width } = tensor;
  const channels = tensor.classOrder.length;
  const data = Uint8Array.from(tensor.data);

  for (let pixel = 0; pixel < height * width; pixel += 1) {
    const base = pixel * channels;
    let count = 0;
    let winner = -1;
    for (let c = 0; c < channels; c += 1) {
      if (!data[base + c]) continue;
      count += 1;
      if (winner < 0 || !ascending) winner = c; // ascending keeps the first, descending the last
    }
    if (count <= 1) continue;
    for (let c = 0; c < channels; c += 1) data[base + c] = 0;
    data[base + winner] = 1;
  }
  return { height, width, classOrder: tensor.classOrder, data };
}

/**
 * Clear every pixel outside the crop rectangle.
 *
 * The crop is stored clamped INCLUSIVELY (x2 and y2 are valid pixel indices, at most width-1 and
 * height-1) but applied EXCLUSIVELY, so column x2 and row y2 are cleared. Because the clamp caps x2
 * at width-1, the image's last column and last row never survive a crop. That off-by-one is legacy
 * behavior the rewrite preserves (RULE-016, decision 15h).
 */
export function applyCrop(tensor: MaskTensor, crop: readonly [number, number, number, number]): MaskTensor {
  const [x1, y1, x2, y2] = crop;
  const { height, width } = tensor;
  const channels = tensor.classOrder.length;
  const data = Uint8Array.from(tensor.data);

  const clearRow = (y: number) => data.fill(0, y * width * channels, (y + 1) * width * channels);
  const clearSpan = (y: number, from: number, to: number) =>
    data.fill(0, (y * width + from) * channels, (y * width + to) * channels);

  for (let y = 0; y < Math.min(y1, height); y += 1) clearRow(y);
  for (let y = Math.max(y2, 0); y < height; y += 1) clearRow(y);
  for (let y = Math.max(y1, 0); y < Math.min(y2, height); y += 1) {
    if (x1 > 0) clearSpan(y, 0, Math.min(x1, width));
    if (x2 < width) clearSpan(y, Math.max(x2, 0), width);
  }
  return { height, width, classOrder: tensor.classOrder, data };
}

/**
 * One record per contour-bearing segment, so detection formats keep same-class objects apart.
 *
 * Each segment is rasterized alone and intersected with its channel of the final tensor, which
 * carries whatever crop and pixel-priority decisions already applied. Segments whose mask does not
 * match the image size are skipped, as are segments left with no pixels. The returned order is
 * segment order, then OpenCV's contour order within a segment, and that order is visible in the
 * exported file, so it is part of the contract (RULE-005).
 */
export function createInstanceContours(
  segments: readonly Segment[],
  imageSize: readonly [number, number],
  classOrder: readonly number[],
  tensor: MaskTensor,
): InstanceContour[] {
  const [height, width] = imageSize;
  const channels = classOrder.length;
  const channelOf = new Map<number, number>(classOrder.map((id, index) => [id, index]));
  const out: InstanceContour[] = [];

  for (const segment of segments) {
    const channel = segment.classId === null ? undefined : channelOf.get(segment.classId);
    if (channel === undefined) continue;
    const mask = rasterizeSegment(segment, height, width);
    if (!mask || mask.height !== height || mask.width !== width) continue;

    const single = new Uint8Array(height * width);
    let any = false;
    for (let pixel = 0; pixel < height * width; pixel += 1) {
      if (mask.data[pixel] && tensor.data[pixel * channels + channel]) {
        single[pixel] = 1;
        any = true;
      }
    }
    if (!any) continue;

    for (const contour of findExternalContours({ height, width, data: single })) {
      out.push({ channel, contour });
    }
  }
  return out;
}
