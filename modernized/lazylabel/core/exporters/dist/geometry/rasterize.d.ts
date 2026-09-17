/**
 * Polygon and circle rasterisation, transliterated from
 * opencv/opencv @ 4.12.0, modules/imgproc/src/drawing.cpp
 * (`cv::fillPoly`, `CollectPolyEdges`, `FillEdgeCollection`, `Line`,
 * `LineIterator::init`, `clipLine`, `Circle`).
 *
 * `cv2.fillPoly` is **not** an even-odd scanline fill. It is the union of two things:
 *
 *  1. an 8-connected Bresenham *outline* of every polygon edge, drawn first by
 *     `CollectPolyEdges` before it records the edge, and
 *  2. an even-odd scanline fill in 16.16 fixed point, which rounds each span inwards
 *     (`(x + 65535) >> 16` on the left, `x >> 16` on the right).
 *
 * A naive scanline fill loses the outline pixels: on a 2597-pixel quadrilateral the
 * outline is 108 of them, and those are exactly the pixels a re-imported annotation is
 * judged on.
 *
 * Two places where this is a faithful port rather than an identical one, neither
 * reachable from image coordinates - see the report in test/geometry:
 *
 *  - OpenCV keeps the fixed-point `x` and `dx` in `int64`; these are JavaScript doubles,
 *    exact only while every intermediate stays under 2^53. With x in 16.16 that holds
 *    for |coordinate| up to about 2^36, far past any image; beyond that OpenCV would
 *    wrap and this would round.
 *  - `drawLine` uses 32-bit bitwise operations for the Bresenham step, as the C++ does
 *    with `int`, so it needs |coordinate| under 2^30.
 */
import type { BinaryMask } from "../types.js";
import type { Contour } from "./types.js";
/** `cv2.fillPoly(mask, polygons, 1)` on a fresh `height` x `width` zero mask. */
export declare function fillPoly(height: number, width: number, polygons: readonly Contour[]): BinaryMask;
/** `cv2.circle(mask, centre, radius, 1, thickness=-1)` on a fresh zero mask. */
export declare function fillCircle(height: number, width: number, centre: readonly [number, number], radius: number): BinaryMask;
//# sourceMappingURL=rasterize.d.ts.map