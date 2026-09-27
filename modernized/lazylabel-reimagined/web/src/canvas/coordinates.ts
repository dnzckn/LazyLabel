/**
 * Turning a click into an image coordinate.
 *
 * Small, and the place a drawing tool goes wrong invisibly. A vertex placed one pixel off looks
 * right on screen at any reasonable zoom, and appears in the exported polygon forever.
 *
 * THE POINT COMES BACK EXACT, AND EACH TOOL CONVERTS IT AS LEGACY'S DOES. Legacy's scene position
 * is a QPointF, and what it makes of one differs by tool, so no one rounding here could be right.
 * `wholePixel` is legacy's `int()`, and `tools/` applies it where legacy does:
 *
 *  - The AI tool's points and box are ASKED in whole pixels, in both views: `int()` of each
 *    coordinate (coordinate_transformer.py:47-50, whose scale factor is always 1.0,
 *    sam_update_worker.py:42-43; main_window.py:2236-2242, 6694, 6726-6739). The single view draws
 *    its dot where the click was (ai_segment_manager.py:457-462), the Multi tab at the whole pixel
 *    (main_window.py:6760-6762). Whether a gesture is a click or a box is decided on the exact
 *    points first (5553-5566; single_view_mouse_handler.py:340-356).
 *  - The single view's polygon keeps the QPointF (polygon_drawing_manager.py:93, 202), truncated
 *    only when rasterized (segment_manager.py:174-185). Rounding it here would break the join
 *    threshold too, which is measured in image pixels against the first vertex: with both ends
 *    rounded, a click 1.4 pixels away and one 0.6 pixels away can land on the same integer.
 *
 * A CLICK OUTSIDE THE IMAGE IS REPORTED, NOT CLAMPED. Clamping is the tempting one-liner and it
 * silently places a vertex on the edge the user did not click, which then rasterizes into the
 * mask. Saying "outside" lets the caller ignore the click instead, which is what a user who
 * overshot the canvas meant.
 */

export interface ImagePoint {
  readonly x: number;
  readonly y: number;
}

/** Where the image is drawn, in client coordinates — what `getBoundingClientRect` returns. */
export interface DisplayBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export type Located =
  | { readonly kind: "inside"; readonly point: ImagePoint }
  | { readonly kind: "outside"; readonly point: ImagePoint };

/**
 * The image pixel under a client point.
 *
 * Both axes are scaled independently. That is not over-generality: a canvas given a CSS width and
 * `height: auto`, or one inside a flex row that shrinks it, is scaled differently in each axis, and
 * a single scale factor derived from the width alone would put every vertex progressively further
 * off as it moves down the image.
 *
 * `kind` is the caller's to act on. `point` is filled in either way, because a tool that wants to
 * clamp deliberately — dragging a box out past the edge, say — needs the number, and computing it
 * twice in two places is how the two disagree.
 */
export function locate(
  client: { readonly clientX: number; readonly clientY: number },
  box: DisplayBox,
  image: ImageSize,
): Located {
  // A zero-width box means the element is not laid out yet. Dividing gives Infinity, which would
  // silently become a vertex at the far corner rather than an obvious failure.
  if (box.width <= 0 || box.height <= 0) {
    return { kind: "outside", point: { x: Number.NaN, y: Number.NaN } };
  }

  const point: ImagePoint = {
    x: ((client.clientX - box.left) / box.width) * image.width,
    y: ((client.clientY - box.top) / box.height) * image.height,
  };

  // The right and bottom edges are exclusive: an image 100 wide has pixels 0..99, so x === 100 is
  // the first point past it. Half-open here matches how the mask is indexed.
  const inside =
    point.x >= 0 && point.y >= 0 && point.x < image.width && point.y < image.height;

  return inside ? { kind: "inside", point } : { kind: "outside", point };
}

/**
 * Legacy's `int()` of a point: each coordinate truncated toward zero, to the pixel it lies in.
 *
 * Toward zero, as Python's `int()` is, not down: `int(-0.3)` is 0. The `+ 0` makes the -0 that
 * `Math.trunc` gives there a plain 0, which the wire prints the same and a comparison does not.
 */
export function wholePixel(point: ImagePoint): ImagePoint {
  return { x: Math.trunc(point.x) + 0, y: Math.trunc(point.y) + 0 };
}

/**
 * The inverse: where an image point sits in client coordinates.
 *
 * Needed to draw over the image at the right place. Sharing the axes with `locate` rather than
 * re-deriving them is what keeps the dot the user sees under the cursor they clicked with.
 */
export function project(point: ImagePoint, box: DisplayBox, image: ImageSize): ImagePoint {
  if (image.width <= 0 || image.height <= 0) return { x: Number.NaN, y: Number.NaN };

  return {
    x: box.left + (point.x / image.width) * box.width,
    y: box.top + (point.y / image.height) * box.height,
  };
}

/**
 * How many image pixels one client pixel covers, per axis.
 *
 * The layers need this to draw an outline or a mark at a constant SCREEN size. The marks drawn while
 * a shape is being made are legacy's image-pixel sizes instead (`sizing.ts`).
 */
export function scale(box: DisplayBox, image: ImageSize): { x: number; y: number } {
  if (box.width <= 0 || box.height <= 0) return { x: Number.NaN, y: Number.NaN };
  return { x: image.width / box.width, y: image.height / box.height };
}
