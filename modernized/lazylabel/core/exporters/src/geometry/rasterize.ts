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

/** `XY_SHIFT` / `XY_ONE` from drawing.cpp: the fixed-point format used for x. */
const XY_SHIFT = 16;
const XY_ONE = 1 << XY_SHIFT;

/** `PolyEdge` from drawing.cpp. `x` and `dx` are 16.16 fixed point. */
interface PolyEdge {
  y0: number;
  y1: number;
  x: number;
  dx: number;
  next: PolyEdge | null;
}

/** Arithmetic right shift by `XY_SHIFT` for values wider than 32 bits. */
function shiftDown(value: number): number {
  return Math.floor(value / XY_ONE);
}

/** Truncating integer division, exact for the full int64 range OpenCV works in. */
function truncDiv(a: number, b: number): number {
  // Double division can round a quotient that is just under an integer up to it, which
  // would shift a whole edge by one 65536th of a pixel. BigInt costs nothing here: this
  // runs once per polygon edge, not once per pixel.
  if (Number.isSafeInteger(a) && Number.isSafeInteger(b)) {
    return Number(BigInt(a) / BigInt(b));
  }
  return Math.trunc(a / b);
}

/** `cv2.fillPoly(mask, polygons, 1)` on a fresh `height` x `width` zero mask. */
export function fillPoly(
  height: number,
  width: number,
  polygons: readonly Contour[],
): BinaryMask {
  const data = new Uint8Array(Math.max(0, height) * Math.max(0, width));
  if (height <= 0 || width <= 0) return { height, width, data };

  const edges: PolyEdge[] = [];
  for (const poly of polygons) {
    if (poly.length > 0) collectPolyEdges(data, height, width, poly, edges);
  }
  fillEdgeCollection(data, height, width, edges);
  return { height, width, data };
}

/** `cv2.circle(mask, centre, radius, 1, thickness=-1)` on a fresh zero mask. */
export function fillCircle(
  height: number,
  width: number,
  centre: readonly [number, number],
  radius: number,
): BinaryMask {
  if (!(radius >= 0)) throw new RangeError("radius must be >= 0");
  const data = new Uint8Array(Math.max(0, height) * Math.max(0, width));
  if (height <= 0 || width <= 0) return { height, width, data };

  const cx = centre[0];
  const cy = centre[1];
  let err = 0;
  let dx = radius;
  let dy = 0;
  let plus = 1;
  let minus = radius * 2 - 1;
  const inside =
    cx >= radius && cx < width - radius && cy >= radius && cy < height - radius;

  while (dx >= dy) {
    const y11 = cy - dy;
    const y12 = cy + dy;
    const y21 = cy - dx;
    const y22 = cy + dx;
    let x11 = cx - dx;
    let x12 = cx + dx;
    let x21 = cx - dy;
    let x22 = cx + dy;

    if (inside) {
      hline(data, width, y11, x11, x12);
      hline(data, width, y12, x11, x12);
      hline(data, width, y21, x21, x22);
      hline(data, width, y22, x21, x22);
    } else if (x11 < width && x12 >= 0 && y21 < height && y22 >= 0) {
      x11 = Math.max(x11, 0);
      x12 = Math.min(x12, width - 1);
      if (y11 >= 0 && y11 < height) hline(data, width, y11, x11, x12);
      if (y12 >= 0 && y12 < height) hline(data, width, y12, x11, x12);
      if (x21 < width && x22 >= 0) {
        x21 = Math.max(x21, 0);
        x22 = Math.min(x22, width - 1);
        if (y21 >= 0 && y21 < height) hline(data, width, y21, x21, x22);
        if (y22 >= 0 && y22 < height) hline(data, width, y22, x21, x22);
      }
    }

    dy++;
    err += plus;
    plus += 2;
    // `mask = (err <= 0) - 1` in the C++: all-ones when err > 0, zero otherwise.
    if (err > 0) {
      err -= minus;
      dx -= 1;
      minus -= 2;
    }
  }

  return { height, width, data };
}

/** `ICV_HLINE`: set `[xl, xr]` inclusive on row `y`. Caller guarantees the bounds. */
function hline(data: Uint8Array, width: number, y: number, xl: number, xr: number): void {
  const row = y * width;
  for (let x = xl; x <= xr; x++) data[row + x] = 1;
}

/** `CollectPolyEdges` with `shift = 0`, `offset = (0, 0)`, `line_type = LINE_8`. */
function collectPolyEdges(
  data: Uint8Array,
  height: number,
  width: number,
  poly: Contour,
  edges: PolyEdge[],
): void {
  const count = poly.length;
  const last = poly[count - 1]!;
  // `np.array(points, dtype=np.int32)` at the legacy call sites truncates toward zero;
  // doing it here keeps fillPoly usable with the raw float vertices a Segment stores.
  let pt0x = Math.trunc(last[0]) * XY_ONE;
  let pt0y = Math.trunc(last[1]);

  for (let i = 0; i < count; i++) {
    const v = poly[i]!;
    const pt1x = Math.trunc(v[0]) * XY_ONE;
    const pt1y = Math.trunc(v[1]);

    let pt0cy = pt0y;
    let pt1cy = pt1y;

    let t0x = shiftDown(pt0x + (XY_ONE >> 1));
    let t1x = shiftDown(pt1x + (XY_ONE >> 1));
    let t0y = pt0y;
    let t1y = pt1y;

    // The outline is drawn first, and it is drawn whether or not the edge is
    // horizontal - this is the term a plain scanline fill is missing.
    drawLine(data, height, width, t0x, t0y, t1x, t1y);

    if (
      (t0x >>> 0) >= width ||
      (t1x >>> 0) >= width ||
      (t0y >>> 0) >= height ||
      (t1y >>> 0) >= height
    ) {
      const clipped = clipLine(width, height, t0x, t0y, t1x, t1y);
      t0x = clipped.x1;
      t0y = clipped.y1;
      t1x = clipped.x2;
      t1y = clipped.y2;
      if (t0y !== t1y) {
        pt0cy = t0y;
        pt1cy = t1y;
      }
    }

    const pt0cx = t0x * XY_ONE;
    const pt1cx = t1x * XY_ONE;

    if (pt0y !== pt1y) {
      const edx = truncDiv(pt1cx - pt0cx, pt1cy - pt0cy);
      if (pt0y < pt1y) {
        edges.push({
          y0: pt0y,
          y1: pt1y,
          x: pt0cx + (pt0y - pt0cy) * edx,
          dx: edx,
          next: null,
        });
      } else {
        edges.push({
          y0: pt1y,
          y1: pt0y,
          x: pt1cx + (pt1y - pt1cy) * edx,
          dx: edx,
          next: null,
        });
      }
    }

    pt0x = pt1x;
    pt0y = pt1y;
  }
}

/** `CmpEdges`: order by y0, then by fixed-point x, then by slope. */
function cmpEdges(a: PolyEdge, b: PolyEdge): number {
  if (a.y0 !== b.y0) return a.y0 - b.y0;
  if (a.x !== b.x) return a.x < b.x ? -1 : 1;
  if (a.dx !== b.dx) return a.dx < b.dx ? -1 : 1;
  return 0;
}

/** `FillEdgeCollection`: the even-odd active-edge-list fill in 16.16 fixed point. */
function fillEdgeCollection(
  data: Uint8Array,
  height: number,
  width: number,
  edges: PolyEdge[],
): void {
  const total = edges.length;
  if (total < 2) return;

  let yMax = -Infinity;
  let yMin = Infinity;
  let xMax = -1; // the C++ seeds x_max with 0xFFFF...F, i.e. -1, not INT64_MIN
  let xMin = Number.MAX_SAFE_INTEGER;
  const delta = XY_ONE - 1;

  for (const e of edges) {
    const x1 = e.x + (e.y1 - e.y0) * e.dx;
    yMin = Math.min(yMin, e.y0);
    yMax = Math.max(yMax, e.y1);
    xMin = Math.min(xMin, e.x, x1);
    xMax = Math.max(xMax, e.x, x1);
  }

  if (yMax < 0 || yMin >= height || xMax < 0 || xMin >= width * XY_ONE) return;

  // std::sort is not stable; Array.prototype.sort is. The comparator is a strict weak
  // ordering on (y0, x, dx), so the two can only disagree for edges equal in all three,
  // which differ at most in y1. See test/geometry/fill.test.ts for the coverage.
  edges.sort(cmpEdges);

  // `tmp` is the active-list head; a *separate* copy with y0 = INT_MAX is appended to
  // the edge array as the "no more edges" sentinel. The C++ relies on them being
  // distinct objects, so this does too.
  const head: PolyEdge = { y0: 0, y1: 0, x: 0, dx: 0, next: null };
  edges.push({ y0: 0x7fffffff, y1: 0, x: 0, dx: 0, next: null });

  let i = 0;
  let e: PolyEdge = edges[0]!;
  yMax = Math.min(yMax, height);

  for (let y = e.y0; y < yMax; y++) {
    let draw = 0;
    const clipline = y < 0;
    let prelast: PolyEdge = head;
    let last: PolyEdge | null = head.next;
    let keepPrelast: PolyEdge = head;
    const row = y * width;

    while (last !== null || e.y0 === y) {
      if (last !== null && last.y1 === y) {
        // exclude the edge once y reaches its lower point
        prelast.next = last.next;
        last = last.next;
        continue;
      }
      keepPrelast = prelast;
      if (last !== null && (e.y0 > y || last.x < e.x)) {
        prelast = last;
        last = last.next;
      } else if (i < total) {
        prelast.next = e;
        e.next = last;
        prelast = e;
        e = edges[++i]!;
      } else {
        break;
      }

      if (draw) {
        if (!clipline) {
          let x1: number;
          let x2: number;
          if (keepPrelast.x > prelast.x) {
            x1 = shiftDown(prelast.x + delta);
            x2 = shiftDown(keepPrelast.x);
          } else {
            x1 = shiftDown(keepPrelast.x + delta);
            x2 = shiftDown(prelast.x);
          }
          if (x1 < width && x2 >= 0) {
            if (x1 < 0) x1 = 0;
            if (x2 >= width) x2 = width - 1;
            for (let x = x1; x <= x2; x++) data[row + x] = 1;
          }
        }
        keepPrelast.x += keepPrelast.dx;
        prelast.x += prelast.dx;
      }
      draw ^= 1;
    }

    // re-sort the active list (bubble sort, exactly as the C++ does it)
    let stopAt: PolyEdge | null = null;
    for (;;) {
      prelast = head;
      last = head.next;
      let lastExchange: PolyEdge | null = null;

      while (last !== null && last !== stopAt && last.next !== null) {
        const te: PolyEdge = last.next;
        if (last.x > te.x) {
          prelast.next = te;
          last.next = te.next;
          te.next = last;
          prelast = te;
          lastExchange = prelast;
        } else {
          prelast = last;
          last = te;
        }
      }
      if (lastExchange === null) break;
      stopAt = lastExchange;
      if (stopAt === head.next || stopAt === head) break;
    }
  }
}

/** `clipLine(Size2l, Point2l&, Point2l&)`. Returns the mutated points either way. */
function clipLine(
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { inside: boolean; x1: number; y1: number; x2: number; y2: number } {
  const right = width - 1;
  const bottom = height - 1;
  if (width <= 0 || height <= 0) return { inside: false, x1, y1, x2, y2 };

  let c1 =
    (x1 < 0 ? 1 : 0) + (x1 > right ? 2 : 0) + (y1 < 0 ? 4 : 0) + (y1 > bottom ? 8 : 0);
  let c2 =
    (x2 < 0 ? 1 : 0) + (x2 > right ? 2 : 0) + (y2 < 0 ? 4 : 0) + (y2 > bottom ? 8 : 0);

  if ((c1 & c2) === 0 && (c1 | c2) !== 0) {
    if (c1 & 12) {
      const a = c1 < 8 ? 0 : bottom;
      x1 += Math.trunc(((a - y1) * (x2 - x1)) / (y2 - y1));
      y1 = a;
      c1 = (x1 < 0 ? 1 : 0) + (x1 > right ? 2 : 0);
    }
    if (c2 & 12) {
      const a = c2 < 8 ? 0 : bottom;
      x2 += Math.trunc(((a - y2) * (x2 - x1)) / (y2 - y1));
      y2 = a;
      c2 = (x2 < 0 ? 1 : 0) + (x2 > right ? 2 : 0);
    }
    if ((c1 & c2) === 0 && (c1 | c2) !== 0) {
      if (c1) {
        const a = c1 === 1 ? 0 : right;
        y1 += Math.trunc(((a - x1) * (y2 - y1)) / (x2 - x1));
        x1 = a;
        c1 = 0;
      }
      if (c2) {
        const a = c2 === 1 ? 0 : right;
        y2 += Math.trunc(((a - x2) * (y2 - y1)) / (x2 - x1));
        x2 = a;
        c2 = 0;
      }
    }
  }

  return { inside: (c1 | c2) === 0, x1, y1, x2, y2 };
}

/** `Line(img, pt1, pt2, color, 8)`: 8-connected Bresenham via `LineIterator`. */
function drawLine(
  data: Uint8Array,
  height: number,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  let p1x = x1;
  let p1y = y1;
  let p2x = x2;
  let p2y = y2;

  if (
    (p1x >>> 0) >= width ||
    (p2x >>> 0) >= width ||
    (p1y >>> 0) >= height ||
    (p2y >>> 0) >= height
  ) {
    const clipped = clipLine(width, height, p1x, p1y, p2x, p2y);
    if (!clipped.inside) return;
    p1x = clipped.x1;
    p1y = clipped.y1;
    p2x = clipped.x2;
    p2y = clipped.y2;
  }

  let deltaX = 1;
  let deltaY = 1;
  let dx = p2x - p1x;
  let dy = p2y - p1y;

  if (dx < 0) {
    // LineIterator is constructed with leftToRight = true
    dx = -dx;
    dy = -dy;
    p1x = p2x;
    p1y = p2y;
  }
  if (dy < 0) {
    dy = -dy;
    deltaY = -1;
  }

  const vert = dy > dx;
  if (vert) {
    const t = dx;
    dx = dy;
    dy = t;
    const td = deltaX;
    deltaX = deltaY;
    deltaY = td;
  }

  let err = dx - (dy + dy);
  const plusDelta = dx + dx;
  const minusDelta = -(dy + dy);
  let minusShift = deltaX;
  let plusShift = 0;
  let minusStep = 0;
  let plusStep = deltaY;
  const count = dx + 1;

  if (vert) {
    const ts = plusStep;
    plusStep = plusShift;
    plusShift = ts;
    const tm = minusStep;
    minusStep = minusShift;
    minusShift = tm;
  }

  let px = p1x;
  let py = p1y;
  for (let k = 0; k < count; k++) {
    data[py * width + px] = 1;
    const m = err < 0 ? -1 : 0;
    err += minusDelta + (plusDelta & m);
    px += minusShift + (plusShift & m);
    py += minusStep + (plusStep & m);
  }
}
