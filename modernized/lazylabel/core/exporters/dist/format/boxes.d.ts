/**
 * Turning imported boxes into segments, shared by the YOLO detection, Pascal VOC and CreateML readers.
 *
 * Ported from FileManager._add_box_segments (legacy/lazylabel/src/lazylabel/core/file_manager.py:381-410).
 */
import type { LoadedAnnotations } from "../types.js";
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
export declare function boxesToSegments(boxes: readonly ImportedBox[], imageSize: readonly [number, number], existingAliases?: ReadonlyMap<number, string>): LoadedAnnotations;
//# sourceMappingURL=boxes.d.ts.map