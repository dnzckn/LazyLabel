/**
 * Boxes and circles — RULE-043.
 *
 * Both are drags rather than click sequences, and both are stored as VERTICES rather than as the
 * rectangle or the centre-and-radius they were drawn as. That storage choice is legacy's and it
 * matters for a port in two different ways.
 *
 * A BOX BECOMES A FOUR-CORNER POLYGON, type "Polygon". Nothing downstream knows it was drawn as a
 * box: it exports, rasterizes and erases exactly as a hand-drawn quadrilateral would. A port that
 * kept a box as a box would have to teach every one of those paths a second shape.
 *
 * A CIRCLE KEEPS ITS TYPE AND STORES TWO POINTS: the centre, and the point at the same radius
 * directly to its RIGHT. Not the point the user released on. Dragging up-left and dragging right
 * by the same distance produce identical vertices, and a port that stored the release point would
 * round-trip a different circle on every drag that was not horizontal -- while looking correct in
 * any test whose drag happens to be horizontal, which is most of them.
 */

import type { Point } from "./polygon.js";

export type ShapeOutcome =
  | { readonly kind: "shape"; readonly vertices: readonly Point[] }
  /** Too small to be a deliberate drag. Legacy discards these silently. */
  | { readonly kind: "ignored"; readonly reason: string };

/** Legacy's minimums (`single_view_mouse_handler.py:383, 476`). */
export const MIN_BOX_SIDE = 1;
export const MIN_CIRCLE_RADIUS = 1;

/**
 * A box from the two corners of a drag, as four vertices.
 *
 * The drag is normalized first, because a user may drag in any direction and legacy reads the
 * rubber band's rect, which is already normalized by Qt. Without it, a right-to-left drag gives a
 * negative width, fails the minimum-size test, and silently produces nothing -- for half the
 * directions a user might drag.
 *
 * Corner order is legacy's: top-left, top-right, bottom-right, bottom-left. Clockwise, and worth
 * keeping because the vertex list is what gets exported, so a different order is a different file.
 */
export function boxFrom(start: Point, end: Point): ShapeOutcome {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  const width = right - left;
  const height = bottom - top;

  if (width < MIN_BOX_SIDE || height < MIN_BOX_SIDE) {
    // Both dimensions are named, because "too small" on a 0.5 x 30 drag is otherwise baffling: the
    // box looks perfectly large in the direction the user was paying attention to.
    return {
      kind: "ignored",
      reason:
        `a box must be at least ${MIN_BOX_SIDE}x${MIN_BOX_SIDE} pixels; this one is `
        + `${round(width)}x${round(height)}`,
    };
  }

  return {
    kind: "shape",
    vertices: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  };
}

/**
 * A circle from a centre and the point dragged to.
 *
 * The radius is the straight-line distance, and the stored second vertex is the 3 o'clock point at
 * that radius — so what is saved is the circle, not the gesture that drew it.
 */
export function circleFrom(centre: Point, end: Point): ShapeOutcome {
  const radius = Math.hypot(end.x - centre.x, end.y - centre.y);

  if (radius < MIN_CIRCLE_RADIUS) {
    return {
      kind: "ignored",
      reason: `a circle needs a radius of at least ${MIN_CIRCLE_RADIUS} pixel; this one is ${round(radius)}`,
    };
  }

  return {
    kind: "shape",
    vertices: [centre, { x: centre.x + radius, y: centre.y }],
  };
}

/** The radius a stored circle describes: the distance between its two vertices. */
export function radiusOf(vertices: readonly Point[]): number {
  if (vertices.length < 2) return 0;
  const [centre, edge] = vertices as [Point, Point];
  return Math.hypot(edge.x - centre.x, edge.y - centre.y);
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
