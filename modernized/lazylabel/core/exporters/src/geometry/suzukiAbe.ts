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
 * Neighbour offsets by chain code, from `chainCodeDeltas` in contours_common.hpp:
 * 0 E, 1 NE, 2 N, 3 NW, 4 W, 5 SW, 6 S, 7 SE (y grows downwards).
 */
const DELTA_X = [1, 1, 0, -1, -1, -1, 0, 1] as const;
const DELTA_Y = [0, -1, -1, -1, 0, 1, 1, 1] as const;

/** `MAX_SIZE` in contours_common.hpp: the neighbour scan runs on a 16-entry wrap. */
const MAX_SIZE = 16;

/** `MASK8_NEW` ('\x02'): the mark written onto an already-traced border pixel. */
const MASK8_NEW = 2;
/** `MASK8_RIGHT` ('\x80') as a signed byte: marks the right-hand bound of a border. */
const MASK8_RIGHT = -128;
/** `MASK8_FLAGS` ('\xFE') as a signed int: non-zero for any value other than 0 and 1. */
const MASK8_FLAGS = -2;

/** `MASK8_NEW | MASK8_RIGHT` stored as a signed byte, i.e. -126. */
const MARK_RIGHT = MASK8_NEW | MASK8_RIGHT;

/**
 * Trace the external borders of `mask`, exactly as
 * `cv2.findContours(mask, cv2.RETR_EXTERNAL, method)`.
 *
 * @param mask   binary mask; any non-zero byte counts as foreground, matching the
 *               `threshold(image, image, 0, 1, THRESH_BINARY)` OpenCV applies first.
 * @param direct `true` reproduces `CHAIN_APPROX_NONE` (every border pixel),
 *               `false` reproduces `CHAIN_APPROX_SIMPLE` (corners only).
 */
export function traceExternalContours(mask: BinaryMask, direct: boolean): Point2[][] {
  const { height, width } = mask;
  if (height <= 0 || width <= 0) return [];

  // cv::findContours copies the image into a 1px zero border and compensates with
  // offset (-1, -1), so padded coordinates minus one are the caller's coordinates.
  const padW = width + 2;
  const padH = height + 2;
  const img = new Int8Array(padW * padH);
  const src = mask.data;
  for (let y = 0; y < height; y++) {
    const srcRow = y * width;
    const dstRow = (y + 1) * padW + 1;
    for (let x = 0; x < width; x++) {
      img[dstRow + x] = src[srcRow + x]! !== 0 ? 1 : 0;
    }
  }

  const scanW = padW - 1; // ContourScanner_::findNext, `width`
  const scanH = padH - 1; // ContourScanner_::findNext, `height`

  /** Contours in discovery order; reversed on return (see note 1 in the file header). */
  const found: Point2[][] = [];

  // Scanner state, mirroring ContourScanner_ fields `pt` and `lnbd`.
  let ptX = 1;
  let ptY = 1;
  let lnbdX = 0;
  let lnbdY = 1;

  for (;;) {
    // --- ContourScanner_::findNext -------------------------------------------------
    let x = ptX;
    let y = ptY;
    let lastX = lnbdX;
    let lastY = lnbdY;
    let prev = img[y * padW + (x - 1)]!;
    let hit = false;

    scan: for (; y < scanH; y++) {
      const row = y * padW;
      let p = 0;
      for (; x < scanW; x++) {
        // ContourScanner_::findNextX - skip the run of pixels equal to `prev`.
        for (; x < scanW && (p = img[row + x]!) === prev; x++);
        if (x >= scanW) break;

        // --- ContourScanner_::contourScan (schar / RETR_EXTERNAL) ------------------
        let isHole = false;
        let start = true;
        if (!(prev === 0 && p === 1)) {
          if (p !== 0 || prev < 1) {
            start = false;
          } else {
            if ((prev & MASK8_FLAGS) !== 0) lastX = x - 1;
            isHole = true;
          }
        }
        if (start && (isHole || img[lastY * padW + lastX]! > 0)) start = false;

        if (start) {
          // RETR_EXTERNAL reaches here only for non-holes, so start = (x, y).
          lastX = x;
          found.push(fetchContour(img, padW, x, y, direct));
          ptX = x + 1;
          ptY = y;
          lnbdX = lastX;
          lnbdY = lastY;
          hit = true;
          break scan;
        }

        prev = p;
        if ((prev & MASK8_FLAGS) !== 0) lastX = x;
      }
      lastX = 0;
      lastY = y + 1;
      x = 1;
      prev = 0;
    }

    if (!hit) break;
  }

  found.reverse();
  return found;
}

/**
 * `icvFetchContourEx<schar>` with `nbd = MASK8_NEW` and `isHole = false`.
 *
 * `startX`/`startY` are padded coordinates; emitted points are shifted by (-1, -1)
 * to undo the border, which is what `cv::findContours` does via its offset.
 */
function fetchContour(
  img: Int8Array,
  step: number,
  startX: number,
  startY: number,
  direct: boolean,
): Point2[] {
  const out: Point2[] = [];
  const i0 = startY * step + startX;
  let x = startX - 1;
  let y = startY - 1;

  // Search counter-clockwise from direction 4 (west) for the first set neighbour.
  const sEnd0 = 4; // `res_contour.isHole ? 0 : 4`
  let s = sEnd0;
  let i1 = 0;
  do {
    s = (s - 1) & 7;
    i1 = i0 + DELTA_X[s]! + DELTA_Y[s]! * step;
  } while (img[i1] === 0 && s !== sEnd0);

  if (s === sEnd0) {
    // Single-pixel domain: one point, and the pixel is marked as a right bound.
    img[i0] = MARK_RIGHT;
    out.push([x, y]);
    return out;
  }

  let i3 = i0;
  let i4 = 0;
  let prevS = s ^ 4;

  for (;;) {
    const sStart = s; // `s_end` in the C++, reused as the right-bound comparison value
    if (s > MAX_SIZE - 1) s = MAX_SIZE - 1; // clamp_direction
    while (s < MAX_SIZE - 1) {
      ++s;
      const d = s & 7;
      i4 = i3 + DELTA_X[d]! + DELTA_Y[d]! * step;
      if (img[i4] !== 0) break;
    }
    s &= 7;

    // "check right bound": (unsigned)(s - 1) < (unsigned)s_end
    if ((s - 1) >>> 0 < sStart >>> 0) {
      img[i3] = MARK_RIGHT;
    } else if (img[i3] === 1) {
      img[i3] = MASK8_NEW;
    }

    if (s !== prevS || direct) out.push([x, y]);
    prevS = s;
    x += DELTA_X[s]!;
    y += DELTA_Y[s]!;

    if (i4 === i0 && i3 === i1) break;

    i3 = i4;
    s = (s + 4) & 7;
  }

  return out;
}
