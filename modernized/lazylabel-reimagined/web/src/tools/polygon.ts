/**
 * The polygon tool — RULE-047, and Phase 5's pilot slice.
 *
 * Every rule here is about WHEN a click adds a vertex and when it finishes the shape, so it is a
 * pure function of the draft and the click rather than logic inside a canvas component. A mouse
 * event is a bad place to keep a rule: it cannot be tested without a DOM, and the one case that
 * matters most — a click that is nearly, but not quite, on the first vertex — is the one hardest to
 * produce by hand.
 *
 * THE THRESHOLD IS IN IMAGE PIXELS, NOT SCREEN PIXELS. Legacy compares the click against the first
 * vertex in the scene's own coordinates (`polygon_drawing_manager.py:78-83`), so zooming in does
 * not make a polygon easier to close. That is worth preserving and worth stating: a threshold that
 * followed the zoom would close polygons the user was still drawing whenever they zoomed out, and
 * the default is 2 pixels, which at a low zoom is a fraction of one screen pixel.
 *
 * The comparison is on SQUARED distance against the SQUARED threshold, strictly less than. Kept in
 * squared form deliberately: with integer coordinates it is exact, so the boundary case — a click
 * at distance exactly equal to the threshold, which must NOT close — cannot be decided differently
 * by a square root's last bit.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A polygon being drawn. Empty means the tool is idle. */
export interface PolygonDraft {
  readonly vertices: readonly Point[];
}

export const EMPTY_DRAFT: PolygonDraft = { vertices: [] };

/** Legacy's default and its allowed range (`config/settings.py:26`). */
export const DEFAULT_JOIN_THRESHOLD = 2;
export const MIN_JOIN_THRESHOLD = 1;
export const MAX_JOIN_THRESHOLD = 10;

/** Legacy's minimum. Two points are a line, and a line has no area to rasterize. */
export const MINIMUM_VERTICES = 3;

export type Outcome =
  /** A vertex was added. The draft grows; nothing is committed. */
  | { readonly kind: "vertex"; readonly draft: PolygonDraft }
  /** The polygon closed. These vertices become a segment. */
  | { readonly kind: "close"; readonly vertices: readonly Point[] }
  /** The polygon closed with shift held: erase whatever it overlaps instead of adding it. */
  | { readonly kind: "erase"; readonly vertices: readonly Point[] }
  /**
   * Nothing happened, and why.
   *
   * Legacy does nothing SILENTLY here (`polygon_drawing_manager.py:173-174`), so a user who presses
   * Space expecting to finish a two-point polygon gets no shape and no explanation, and reasonably
   * concludes the key is not bound. The reason travels out so a caller can say it; whether it does
   * is the caller's choice, but it can no longer be unable to.
   */
  | { readonly kind: "ignored"; readonly reason: string };

export interface ClickOptions {
  /** In IMAGE pixels. Clamped to legacy's 1..10 range. */
  readonly joinThreshold?: number;
  /** Shift held: closing the polygon erases instead of creating. */
  readonly shift?: boolean;
}

/**
 * A click in polygon mode.
 *
 * The order of the checks is legacy's and matters: the close test runs FIRST, so the click that
 * closes a polygon does not also become a vertex. A port that appended first and closed afterwards
 * would add a duplicate point on top of the start vertex — invisible on screen, and a difference in
 * every exported polygon.
 */
export function click(draft: PolygonDraft, at: Point, options: ClickOptions = {}): Outcome {
  const threshold = clampThreshold(options.joinThreshold ?? DEFAULT_JOIN_THRESHOLD);

  // Strictly MORE than two, so a two-point draft cannot close onto itself.
  if (draft.vertices.length > 2) {
    const first = draft.vertices[0]!;
    const dx = at.x - first.x;
    const dy = at.y - first.y;
    if (dx * dx + dy * dy < threshold * threshold) {
      return options.shift === true
        ? { kind: "erase", vertices: draft.vertices }
        : { kind: "close", vertices: draft.vertices };
    }
  }

  return { kind: "vertex", draft: { vertices: [...draft.vertices, at] } };
}

/**
 * Space, or Enter: finish what is drawn without clicking near the start.
 *
 * Same minimum as closing by click, because it produces the same thing. Legacy reaches this through
 * a different method and applies the check in `finalize_polygon`, which is why both paths agree.
 */
export function finish(draft: PolygonDraft, options: { readonly shift?: boolean } = {}): Outcome {
  if (draft.vertices.length < MINIMUM_VERTICES) {
    return {
      kind: "ignored",
      reason:
        `a polygon needs at least ${MINIMUM_VERTICES} points; this one has `
        + `${draft.vertices.length === 1 ? "1 point" : `${draft.vertices.length} points`}`,
    };
  }

  return options.shift === true
    ? { kind: "erase", vertices: draft.vertices }
    : { kind: "close", vertices: draft.vertices };
}

/**
 * Take back the last vertex.
 *
 * Every vertex click is separately undoable in legacy (`polygon_drawing_manager.py:112-119` records
 * an `add_polygon_point` action per click), so undo during drawing steps back through the polygon
 * rather than discarding it. Undoing the first point leaves an empty draft, which is the idle
 * state — not an error.
 */
export function undoVertex(draft: PolygonDraft): PolygonDraft {
  if (draft.vertices.length === 0) return draft;
  return { vertices: draft.vertices.slice(0, -1) };
}

/** Abandon the whole draft, as switching tools or loading another image does. */
export function cancel(): PolygonDraft {
  return EMPTY_DRAFT;
}

/**
 * Whether a click at this point would close the polygon.
 *
 * Exported so the canvas can show the first vertex highlighted as the cursor comes into range.
 * Legacy shows no such feedback, which is why its 2-pixel default is hard to hit deliberately: the
 * user discovers the threshold by overshooting it. Sharing the predicate rather than
 * re-implementing it is what keeps the highlight and the behaviour from disagreeing.
 */
export function wouldClose(draft: PolygonDraft, at: Point, joinThreshold?: number): boolean {
  // Spread rather than passing `{ joinThreshold }` directly: under exactOptionalPropertyTypes an
  // explicit `undefined` is not the same as an absent key, and `click` reads an absent key as
  // "use the default".
  return click(draft, at, joinThreshold === undefined ? {} : { joinThreshold }).kind === "close";
}

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_JOIN_THRESHOLD;
  return Math.min(MAX_JOIN_THRESHOLD, Math.max(MIN_JOIN_THRESHOLD, value));
}
