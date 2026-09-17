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
import type { BinaryMask, InstanceContour, MaskTensor, Segment } from "../types.js";
/** Rasterize one segment to a full-image mask, or null when it contributes nothing. */
export declare function rasterizeSegment(segment: Segment, height: number, width: number): BinaryMask | null;
/**
 * One binary channel per entry of classOrder, the union of every segment carrying that class.
 *
 * A segment whose class is not in classOrder is skipped, exactly as the legacy id_map lookup does.
 */
export declare function createFinalMaskTensor(segments: readonly Segment[], imageSize: readonly [number, number], classOrder: readonly number[], pixelPriority?: {
    enabled: boolean;
    ascending: boolean;
}): MaskTensor;
/**
 * Where several classes claim one pixel, keep a single class: the lowest channel when ascending,
 * the highest when descending. Pixels claimed by one class are untouched.
 */
export declare function applyPixelPriority(tensor: MaskTensor, ascending: boolean): MaskTensor;
/**
 * Clear every pixel outside the crop rectangle.
 *
 * The crop is stored clamped INCLUSIVELY (x2 and y2 are valid pixel indices, at most width-1 and
 * height-1) but applied EXCLUSIVELY, so column x2 and row y2 are cleared. Because the clamp caps x2
 * at width-1, the image's last column and last row never survive a crop. That off-by-one is legacy
 * behavior the rewrite preserves (RULE-016, decision 15h).
 */
export declare function applyCrop(tensor: MaskTensor, crop: readonly [number, number, number, number]): MaskTensor;
/**
 * One record per contour-bearing segment, so detection formats keep same-class objects apart.
 *
 * Each segment is rasterized alone and intersected with its channel of the final tensor, which
 * carries whatever crop and pixel-priority decisions already applied. Segments whose mask does not
 * match the image size are skipped, as are segments left with no pixels. The returned order is
 * segment order, then OpenCV's contour order within a segment, and that order is visible in the
 * exported file, so it is part of the contract (RULE-005).
 */
export declare function createInstanceContours(segments: readonly Segment[], imageSize: readonly [number, number], classOrder: readonly number[], tensor: MaskTensor): InstanceContour[];
//# sourceMappingURL=tensor.d.ts.map