/**
 * Shared types for the geometry primitives.
 *
 * Points are `[x, y]`, matching `cv::Point` and the `vertices` field of `Segment`
 * in `../types.ts`. Everything here works in integer pixel coordinates: OpenCV's
 * contour pipeline is `CV_32SC2` end to end, and the annotation writers depend on
 * that, so no function in `./contours.ts` ever produces a fractional coordinate.
 */

/** One point in pixel coordinates, `[x, y]`. */
export type Point2 = readonly [number, number];

/** A traced outline or an input polygon, in OpenCV's traversal order. */
export type Contour = readonly Point2[];

/** As `cv::Rect`: `x`/`y` is the top-left pixel, `width`/`height` the inclusive span. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
