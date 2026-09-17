/** Barrel for the OpenCV-compatible geometry primitives. */
export {
  approxPolyDP,
  arcLength,
  boundingRect,
  contourArea,
  fillCircle,
  fillPoly,
  findExternalContours,
  findExternalContoursDense,
} from "./contours.js";
export type { Contour, Point2, Rect } from "./types.js";
