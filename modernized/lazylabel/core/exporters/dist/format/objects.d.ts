/**
 * Shared object enumeration for the instance-aware writers.
 *
 * Ported from iter_object_contours and contour_to_polygon
 * (legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:114-156).
 */
import type { ExportContext } from "../types.js";
export interface ObjectContour {
    /** Index into ctx.classOrder. */
    readonly channel: number;
    readonly contour: readonly (readonly [number, number])[];
}
/**
 * Every object to write, in file order.
 *
 * With instances present each segment contributes its own contours, so same-class objects that
 * touch stay separate. With none, the merged per-class channels are contoured instead, which fuses
 * touching same-class objects and orders output by ascending class instead of by segment. An EMPTY
 * instances array selects that fallback, which happens in production when a segment's mask does not
 * match the image size (RULE-005).
 */
export declare function iterObjectContours(ctx: ExportContext): Generator<ObjectContour>;
/**
 * Flatten a contour to [x1, y1, x2, y2, ...] pixel coordinates.
 *
 * One-pixel-wide objects collapse to a one- or two-point contour, which is not a polygon. The
 * points are repeated into a closed ring that rasterizes back to exactly the same pixels: a
 * doubled point for a single pixel, a there-and-back pair for a line. Using the bounding box
 * instead would fill the whole square for a diagonal.
 */
export declare function contourToPolygon(contour: readonly (readonly [number, number])[]): number[];
//# sourceMappingURL=objects.d.ts.map