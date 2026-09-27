/**
 * The AI tool's interaction — RULE-062 and RULE-066.
 *
 * A click, a drag and a keypress all mean different things here depending on how far the pointer
 * moved and what is already pending, so the decisions are a state machine rather than a set of
 * event handlers. The prediction itself is the inference service's, proven against legacy in
 * Phase 3; what this owns is everything around it.
 *
 * THE FIVE-PIXEL THRESHOLD IS WHAT MAKES A CLICK A CLICK. A press and release at the same spot is
 * a point prompt; moving more than five pixels in between makes it a box. Without a threshold,
 * every click with a shaky hand becomes a one-pixel box, and a one-pixel box predicts nothing --
 * so the tool would appear to ignore clicks at random.
 *
 * A RIGHT PRESS IS A NEGATIVE POINT AT ONCE, where it was pressed, in legacy's single view
 * (`single_view_mouse_handler.py:137-139`), which its Sequence tab uses too. It never becomes a
 * box and its release does nothing: only a LEFT press is remembered for its release to decide
 * (`:131-136`, `:326-368`). Shift and Ctrl change nothing here; legacy reads no modifier in AI mode.
 *
 * LEGACY'S MULTI VIEW IS ANOTHER HANDLER, AND IT DIFFERS (`main_window.py:5498-5572`). Every press
 * waits for its release. A drag with EITHER button is a box when it is big enough, and anything
 * else is a point where the pointer went DOWN -- positive for the left button, negative otherwise --
 * so a thin drag there is a point, not nothing. Its box is asked ALONE, the points placed before it
 * left out, and a click after it asks the points alone, the box forgotten (`asked`).
 *
 * A BOX PREVIEW BEATS A POINT PREVIEW. Both can be pending at once, because placing points does
 * not clear a box. Legacy resolves it in favour of the box (RULE-066), and that is the right way
 * round: the box is the more recent, more deliberate gesture.
 *
 * NEGATIVE POINTS ALONE PREDICT NOTHING. They say what the object is not, and SAM has nothing to
 * grow from — the same rule the inference service enforces on its own side, where a prompt of only
 * negative points is refused rather than run. The point is still placed, as legacy's single view
 * places it (`ai_segment_manager.py:447-466, 492-493`). Legacy's multi view asks its model even so
 * (`main_window.py:6791-6797`); with the service refusing, the multi view here waits too.
 */

import type { Point } from "./polygon.js";

/**
 * The move that turns a click into a drag: more than this many image pixels from the press
 * (`single_view_mouse_handler.py:237, 348`; the multi view's `main_window.py:5444, 5566`).
 */
export const DRAG_THRESHOLD = 5;

/** A box smaller than this in EITHER direction is not predicted (`RULE-062`). */
export const MINIMUM_BOX_SIDE = 10;

export interface AiPoint {
  readonly x: number;
  readonly y: number;
  readonly positive: boolean;
}

export interface AiPrompt {
  readonly points: readonly AiPoint[];
  /** The box drawn most recently, if any. Cleared when the preview is accepted or discarded. */
  readonly box: readonly [Point, Point] | null;
}

export const EMPTY_PROMPT: AiPrompt = { points: [], box: null };

/** Which of legacy's mouse handlers a gesture follows: the single view's or the Multi tab's. */
export type AiView = "single" | "multi";

/** The button a press is, as legacy's Qt reads it (a Mac's Control-click is the right one). */
export type AiButton = "left" | "right";

export type Release =
  /** A point was added; the caller should ask for a new prediction. */
  | { readonly kind: "point"; readonly prompt: AiPrompt }
  /** A box was drawn and is big enough; the caller should ask for a prediction. */
  | { readonly kind: "box"; readonly prompt: AiPrompt }
  /**
   * A point was added, but there is nothing to predict from: negative points alone. The caller
   * shows it and asks for nothing.
   */
  | { readonly kind: "placed"; readonly prompt: AiPrompt; readonly reason: string }
  /** Nothing to do, and why. */
  | { readonly kind: "ignored"; readonly reason: string };

export interface ReleaseOptions {
  /**
   * The press was the right button: a negative point. Only the multi view's releases carry one; in
   * the single view a right press is settled by `press`, and its release is nothing.
   */
  readonly negative?: boolean;
  /** Which of legacy's handlers to follow. The single view's when absent. */
  readonly view?: AiView;
}

/**
 * Said when a point is placed and nothing positive is there to segment from: a negative point says
 * what the object is not. The message says what to do, and no more.
 */
export const NEGATIVE_ALONE = "add a positive point to segment";

/**
 * What a press means, before the pointer moves.
 *
 * In legacy's single view a RIGHT press is a negative point at once, where it was pressed
 * (`single_view_mouse_handler.py:137-139`). Everything else -- a left press, and any press in the
 * multi view -- only remembers where it went down, and the release decides: null says so.
 */
export function press(
  prompt: AiPrompt,
  at: Point,
  button: AiButton,
  view: AiView = "single",
): Release | null {
  if (view === "single" && button === "right") return withPoint(prompt, at, false);
  return null;
}

/**
 * What a press-then-release means.
 *
 * `from` is where the pointer went down and `to` where it came up, both in image pixels. The
 * distance between them is the whole decision. In the single view only a left press gets here.
 */
export function release(
  prompt: AiPrompt,
  from: Point,
  to: Point,
  options: ReleaseOptions = {},
): Release {
  const moved = Math.hypot(to.x - from.x, to.y - from.y);
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  const positive = options.negative !== true;

  if (options.view === "multi") {
    // `main_window.py:5552-5572`: a box when the drag went past the threshold AND is big enough,
    // with either button. Anything else is a point where the pointer went DOWN, so a thin drag is
    // a point there, where the single view discards it.
    if (moved > DRAG_THRESHOLD && width > MINIMUM_BOX_SIDE && height > MINIMUM_BOX_SIDE) {
      return { kind: "box", prompt: { ...prompt, box: [from, to] } };
    }
    // A click asks the points alone, so the box is forgotten once it does: legacy predicts from
    // every point placed, before the box too, and never from the box again (main_window.py:
    // 6667-6675, 6788-6797). A point with nothing positive to ask from asks nothing there, and the
    // box's preview stays the one Space accepts, so the box stays with it.
    const outcome = withPoint(prompt, from, positive);
    return outcome.kind === "point" ? { kind: "point", prompt: { ...outcome.prompt, box: null } } : outcome;
  }

  // The single view puts a click's point where the pointer came UP
  // (`single_view_mouse_handler.py:358-365`).
  if (moved <= DRAG_THRESHOLD) return withPoint(prompt, to, positive);

  if (width <= MINIMUM_BOX_SIDE || height <= MINIMUM_BOX_SIDE) {
    // Legacy discards this silently (`:356-357`), which is how a 40x8 drag reads as the tool being
    // broken.
    return {
      kind: "ignored",
      reason:
        `a box must be more than ${MINIMUM_BOX_SIDE} pixels in both directions; `
        + `this one is ${Math.round(width)}x${Math.round(height)}`,
    };
  }

  return { kind: "box", prompt: { ...prompt, box: [from, to] } };
}

/**
 * The prompt with one more point.
 *
 * A prompt of only negative points has nothing to segment. The point is still PLACED, as legacy
 * places it (`ai_segment_manager.py:447-466`): the user put it there, and a positive one may follow.
 * Asking for a prediction is what waits. It used to be dropped instead, the comment here saying it
 * was placed.
 */
function withPoint(prompt: AiPrompt, at: Point, positive: boolean): Release {
  const point: AiPoint = { x: at.x, y: at.y, positive };
  const next: AiPrompt = { ...prompt, points: [...prompt.points, point] };

  if (!next.points.some((p) => p.positive)) {
    return { kind: "placed", prompt: next, reason: NEGATIVE_ALONE };
  }

  return { kind: "point", prompt: next };
}

/**
 * What the model is asked for a prompt.
 *
 * In the Multi tab a box is asked ALONE: legacy's `predict_from_box(target_idx, box)` takes the box
 * and nothing else, whatever points are on the image (main_window.py:6693-6704;
 * sam_multi_view_manager.py:289-328). The points stay placed and drawn, and the next click asks
 * them without the box (`release`). The single view, which the Sequence tab shares, asks the box
 * with the points (RULE-066).
 */
export function asked(prompt: AiPrompt, view: AiView = "single"): AiPrompt {
  return view === "multi" && prompt.box !== null ? { points: [], box: prompt.box } : prompt;
}

export type Pending = "box" | "points" | "nothing";

/**
 * Which prediction Space would accept.
 *
 * Both a box and a set of points can be pending, because placing points does not clear a box.
 * Legacy resolves that in favour of the box, and this is the one place that decision lives.
 */
export function pending(prompt: AiPrompt): Pending {
  if (prompt.box !== null) return "box";
  if (prompt.points.some((point) => point.positive)) return "points";
  return "nothing";
}

/** Legacy's message when Space is pressed with no prediction waiting. */
export const NOTHING_TO_ACCEPT = "No AI segment preview to accept";

/** Start again: accepted, discarded, or the image changed. */
export function clear(): AiPrompt {
  return EMPTY_PROMPT;
}

/**
 * Take back the last thing placed.
 *
 * The box first when there is one, because it was the most recent gesture — the same precedence
 * `pending` uses, so undo removes what Space would have accepted.
 */
export function undoLast(prompt: AiPrompt): AiPrompt {
  if (prompt.box !== null) return { ...prompt, box: null };
  if (prompt.points.length === 0) return prompt;
  return { ...prompt, points: prompt.points.slice(0, -1) };
}
