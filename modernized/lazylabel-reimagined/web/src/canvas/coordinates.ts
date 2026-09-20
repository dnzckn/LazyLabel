/**
 * Turning a click into an image coordinate.
 *
 * Small, and the place a drawing tool goes wrong invisibly. A vertex placed one pixel off looks
 * right on screen at any reasonable zoom, and appears in the exported polygon forever.
 *
 * THE COORDINATES STAY FRACTIONAL. Legacy stores vertices as QPointF and truncates only at
 * rasterization (RULE-015: `int(round(...))` per vertex inside `segment_manager.py:174-203`), so
 * rounding here would change what gets exported. It would also break the join threshold, which is
 * measured in image pixels against the first vertex: with both ends rounded, a click 1.4 pixels
 * away and one 0.6 pixels away can land on the same integer and both close, or neither.
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
 * The inverse: where an image point sits in client coordinates.
 *
 * Needed to draw the in-progress polygon over the image at the right place, and for the
 * close-range hint. Sharing the axes with `locate` rather than re-deriving them is what keeps the
 * dot the user sees under the cursor they clicked with.
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
 * The canvas needs this to draw a vertex marker and a close-range highlight at a constant SCREEN
 * size. Drawing them in image units makes them vanish when zoomed out and swallow the image when
 * zoomed in — and the close threshold is two image pixels, which at a low zoom is a fraction of one
 * screen pixel and impossible to aim at without a hint.
 */
export function scale(box: DisplayBox, image: ImageSize): { x: number; y: number } {
  if (box.width <= 0 || box.height <= 0) return { x: Number.NaN, y: Number.NaN };
  return { x: image.width / box.width, y: image.height / box.height };
}
