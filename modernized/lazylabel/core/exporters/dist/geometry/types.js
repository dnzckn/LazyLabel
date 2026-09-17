/**
 * Shared types for the geometry primitives.
 *
 * Points are `[x, y]`, matching `cv::Point` and the `vertices` field of `Segment`
 * in `../types.ts`. Everything here works in integer pixel coordinates: OpenCV's
 * contour pipeline is `CV_32SC2` end to end, and the annotation writers depend on
 * that, so no function in `./contours.ts` ever produces a fractional coordinate.
 */
export {};
//# sourceMappingURL=types.js.map