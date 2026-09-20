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
 * A BOX PREVIEW BEATS A POINT PREVIEW. Both can be pending at once, because placing points does
 * not clear a box. Legacy resolves it in favour of the box (RULE-066), and that is the right way
 * round: the box is the more recent, more deliberate gesture.
 *
 * NEGATIVE POINTS ALONE PREDICT NOTHING. They say what the object is not, and SAM has nothing to
 * grow from — the same rule the inference service enforces on its own side, where a prompt of only
 * negative points is refused rather than run.
 */

import type { Point } from "./polygon.js";

/** `single_view_mouse_handler.py:130-139` — the move that turns a click into a drag. */
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

export type Release =
  /** A point was added; the caller should ask for a new prediction. */
  | { readonly kind: "point"; readonly prompt: AiPrompt }
  /** A box was drawn and is big enough; the caller should ask for a prediction. */
  | { readonly kind: "box"; readonly prompt: AiPrompt }
  /** Nothing to do, and why. */
  | { readonly kind: "ignored"; readonly reason: string };

export interface ReleaseOptions {
  /** Right button, or ctrl-click on a trackpad: a negative point. */
  readonly negative?: boolean;
}

/**
 * What a press-then-release means.
 *
 * `from` is where the pointer went down and `to` where it came up, both in image pixels. The
 * distance between them is the whole decision.
 */
export function release(
  prompt: AiPrompt,
  from: Point,
  to: Point,
  options: ReleaseOptions = {},
): Release {
  const moved = Math.hypot(to.x - from.x, to.y - from.y);

  if (moved <= DRAG_THRESHOLD) {
    const point: AiPoint = { x: to.x, y: to.y, positive: options.negative !== true };
    const next: AiPrompt = { ...prompt, points: [...prompt.points, point] };

    // A prompt of only negative points has nothing to segment. Adding the point is still right --
    // the user placed it, and a positive one may follow -- but asking for a prediction is not.
    if (!next.points.some((p) => p.positive)) {
      return {
        kind: "ignored",
        reason: "a negative point says what the object is not; add a positive one to segment it",
      };
    }

    return { kind: "point", prompt: next };
  }

  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);

  if (width <= MINIMUM_BOX_SIDE || height <= MINIMUM_BOX_SIDE) {
    // Legacy discards this silently, which is how a 40x8 drag reads as the tool being broken.
    return {
      kind: "ignored",
      reason:
        `a box must be more than ${MINIMUM_BOX_SIDE} pixels in both directions; `
        + `this one is ${Math.round(width)}x${Math.round(height)}`,
    };
  }

  return { kind: "box", prompt: { ...prompt, box: [from, to] } };
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
