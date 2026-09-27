/**
 * Which shape a click selects, and what clicking it does.
 *
 * HIT-TESTING GOES THROUGH THE RASTERIZER, not a point-in-polygon test. Legacy does the same
 * (`main_window.py:2306-2339`), and the reason is worth keeping: the shape you can CLICK is then
 * exactly the shape that gets SAVED, down to the boundary pixel. A geometric test and
 * `cv2.fillPoly` disagree about the edges of a polygon, so a user could click a pixel that is
 * visibly inside the outline and select nothing, or the reverse.
 *
 * Rasterizing the whole image per segment per click, which legacy does, is what makes selection
 * slow on a large image: a 50-megapixel frame is a 50 MB allocation per shape. This rasterizes
 * only the shape's own bounding box instead, and the answer is identical — but only because the
 * box origin is an EVEN integer, which is subtler than it looks.
 *
 * A polygon's vertices are TRUNCATED before rasterizing, and truncation commutes with any integer
 * shift. A circle's centre and radius are ROUNDED HALF TO EVEN, and that does NOT: `RHE(8.5)` is
 * 8, and so is `RHE(7.5)`, so shifting by 1 loses a pixel and the local answer disagrees with the
 * full-image one along part of the rim. Shifting by an even number preserves the parity the rule
 * depends on, so both round the same way. `selection.test.ts` checks the two agree at every pixel
 * of every shape, which is how this was found rather than reasoned about.
 *
 * THE TOPMOST SHAPE WINS. Legacy walks the list backwards, so the most recently added shape takes
 * a click where several overlap. That is what a user expects from the thing they just drew, and it
 * is the opposite of what a forward loop gives.
 *
 * A POLYGON IS CLIPPED TO THE IMAGE FIRST, where the save does not clip it. Legacy's hit test
 * truncates the vertices and then `np.clip`s each into the image before `cv2.fillPoly`
 * (main_window.py:2320-2324, and 2380-2383 in the Multi tab), so a polygon reaching past an edge
 * is selected where its clipped copy lies, which is less than what is drawn and saved. A circle is
 * rasterized as it is saved (2331, 2390).
 */

import { rasterizeSegment, type Segment } from "@lazylabel/annotation-formats";
import { maskRegion, type WireSegment } from "@lazylabel/contracts";

import type { Point } from "./polygon.js";

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The index of the shape under this point, or null.
 *
 * The point is truncated to a pixel first, as legacy's `int(pos.x()), int(pos.y())` does. Rounding
 * instead would move the hit region half a pixel up and left of the drawn one.
 */
export function hitTest(
  segments: readonly WireSegment[],
  at: Point,
  image: ImageSize,
): number | null {
  const x = Math.trunc(at.x);
  const y = Math.trunc(at.y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (covers(segments[index]!, x, y, image)) return index;
  }
  return null;
}

function covers(segment: WireSegment, x: number, y: number, image: ImageSize): boolean {
  // A mask arrives BOUNDED -- a box plus the bytes inside it -- so the point is tested against
  // the box first and only then against the region. Decoding the whole image's worth of pixels to
  // answer "is this one pixel set" is the cost the bounded format exists to avoid.
  if (segment.type === "AI" || segment.type === "Loaded") {
    const mask = segment.mask;
    if (mask?.box == null) return false;

    const [x0, y0, x1, y1] = mask.box;
    if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;

    const regionWidth = x1 - x0;
    const regionHeight = y1 - y0;
    if (regionWidth <= 0 || regionHeight <= 0) return false;

    let region: Uint8Array;
    try {
      region = maskRegion(mask);
    } catch {
      // A mask that cannot be decoded is not selectable, and that is better than a click that
      // throws: the canvas has already declined to draw it for the same reason.
      return false;
    }
    if (region.length !== regionWidth * regionHeight) return false;

    return region[(y - y0) * regionWidth + (x - x0)] !== 0;
  }

  if (segment.vertices === undefined || segment.vertices.length === 0) return false;
  // A polygon's vertices truncated and clipped into the image, as legacy's hit test takes them.
  const vertices =
    segment.type === "Polygon"
      ? segment.vertices.map(
          ([vx, vy]) => [clip(Math.trunc(vx), image.width - 1), clip(Math.trunc(vy), image.height - 1)] as const,
        )
      : segment.vertices;

  // The box is in whole pixels, which is what makes the local rasterization exact.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [vx, vy] of vertices) {
    if (vx < minX) minX = vx;
    if (vy < minY) minY = vy;
    if (vx > maxX) maxX = vx;
    if (vy > maxY) maxY = vy;
  }

  if (segment.type === "Circle") {
    // A circle's vertices are a centre and a radius point, so its extent is the centre plus the
    // radius in every direction -- not the box around the two points.
    const [cx, cy] = vertices[0]!;
    const edge = vertices[1];
    if (edge === undefined) return false;
    const radius = Math.hypot(edge[0] - cx, edge[1] - cy);
    minX = cx - radius - 1;
    maxX = cx + radius + 1;
    minY = cy - radius - 1;
    maxY = cy + radius + 1;
  }

  // EVEN, so that round-half-to-even gives the same answer here as in full-image coordinates.
  const originX = even(Math.floor(minX) - 1);
  const originY = even(Math.floor(minY) - 1);
  if (x < originX || y < originY) return false;

  const width = Math.ceil(maxX) - originX + 2;
  const height = Math.ceil(maxY) - originY + 2;
  if (width <= 0 || height <= 0) return false;
  if (x >= originX + width || y >= originY + height) return false;

  const local: Segment = {
    type: segment.type,
    classId: segment.classId,
    vertices: vertices.map(([vx, vy]) => [vx - originX, vy - originY] as const),
  };

  const mask = rasterizeSegment(local, height, width);
  if (mask === null) return false;

  return mask.data[(y - originY) * width + (x - originX)] === 1;
}

/**
 * Add or remove one index. Legacy toggles, which is what makes a multi-shape selection possible
 * without a modifier key — and what makes clicking the same shape twice deselect it.
 */
export function toggle(selected: readonly number[], index: number): readonly number[] {
  return selected.includes(index)
    ? selected.filter((entry) => entry !== index)
    : [...selected, index];
}

/**
 * Drop indices that no longer exist, and shift the ones after a removal.
 *
 * Needed because the selection is a list of POSITIONS. Undoing an add removes an entry and every
 * index after it moves down by one; without this, a selection made before the undo would point at
 * the wrong shapes afterwards, and a merge or a delete would act on them.
 */
function even(value: number): number {
  return 2 * Math.floor(value / 2);
}

/** `np.clip(value, 0, top)`, for a whole number. */
function clip(value: number, top: number): number {
  return Math.min(Math.max(value, 0), top);
}

