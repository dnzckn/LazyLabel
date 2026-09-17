/**
 * Suzuki-Abe border following, transliterated from OpenCV 4.12.0.
 *
 * Sources (opencv/opencv @ 4.12.0):
 *   - modules/imgproc/src/contours_new.cpp  - `ContourScanner_`, `icvFetchContourEx`,
 *     `cv::findContours`
 *   - modules/imgproc/src/contours_common.hpp - `chainCodeDeltas`, `getDelta`,
 *     `Tree::addChild`, `TreeIterator`
 *   - modules/imgproc/src/contours_common.cpp - `contourTreeToResults`
 *
 * Three behaviours of this algorithm are observable in LazyLabel's exported files and
 * must be reproduced exactly, not approximated:
 *
 *  1. **Enumeration order.** Contours are discovered in raster order, but each new
 *     contour is *prepended* to its parent's child list (`Tree::addChild`), and
 *     `contourTreeToResults` walks that list front to back. The returned order is
 *     therefore the *reverse* of discovery order. The `split-segment-two-islands`
 *     golden proves it: the island at y=100 is written before the island at y=10.
 *  2. **Starting point and direction.** Tracing starts at the first pixel of the
 *     contour in raster order and walks the border clockwise in image coordinates
 *     (y down), beginning its neighbour search at direction 4 (west).
 *  3. **CHAIN_APPROX_SIMPLE.** A point is emitted only when the chain-code direction
 *     changes, so straight runs collapse to their end points.
 */
import type { BinaryMask } from "../types.js";
import type { Point2 } from "./types.js";
/**
 * Trace the external borders of `mask`, exactly as
 * `cv2.findContours(mask, cv2.RETR_EXTERNAL, method)`.
 *
 * @param mask   binary mask; any non-zero byte counts as foreground, matching the
 *               `threshold(image, image, 0, 1, THRESH_BINARY)` OpenCV applies first.
 * @param direct `true` reproduces `CHAIN_APPROX_NONE` (every border pixel),
 *               `false` reproduces `CHAIN_APPROX_SIMPLE` (corners only).
 */
export declare function traceExternalContours(mask: BinaryMask, direct: boolean): Point2[][];
//# sourceMappingURL=suzukiAbe.d.ts.map