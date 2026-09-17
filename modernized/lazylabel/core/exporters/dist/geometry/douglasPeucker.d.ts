/**
 * OpenCV's Douglas-Peucker variant, transliterated from
 * opencv/opencv @ 4.12.0, modules/imgproc/src/approx.cpp (`approxPolyDP_<int>` and
 * the `cv::approxPolyDP` wrapper).
 *
 * This is deliberately *not* textbook Douglas-Peucker. OpenCV's version has three
 * quirks that change the output, all of which the annotation files record:
 *
 *  - For a closed curve it first runs three passes of a "farthest point" search to
 *    pick the two seed vertices, so the result depends on where that search lands,
 *    not just on the shape.
 *  - Its recursion is an explicit stack pushed as (right, left), so the output points
 *    come out in a specific rotation of the ring rather than sorted by index.
 *  - A final clean-up pass removes points that are nearly collinear with their
 *    neighbours, gated on `dx != 0 && dy != 0` - so it never touches an axis-aligned
 *    run, which is exactly what traced pixel borders are made of.
 *
 * One deliberate omission: OpenCV asserts `dx != 0 || dy != 0` before measuring a slice,
 * and throws if it fails. That is unreachable - a slice is only pushed when its two
 * endpoints are a positive distance apart - so the assert is not reproduced here rather
 * than turned into a JavaScript throw that could never fire.
 */
import type { Contour, Point2 } from "./types.js";
/**
 * `cv2.approxPolyDP(curve, epsilon, closed)` for integer curves.
 *
 * @throws RangeError for the same epsilon values OpenCV rejects with
 *         `Error::StsOutOfRange` (negative, NaN, or >= 1e30).
 */
export declare function approxPolyDP(curve: Contour, epsilon: number, closed: boolean): Point2[];
//# sourceMappingURL=douglasPeucker.d.ts.map