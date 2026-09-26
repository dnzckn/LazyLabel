/**
 * What a propagated frame BECOMES once its objects are in — RULE-060's commit and RULE-081's skip.
 *
 * The job reports every object on every frame, including frames a user would never see a mask on:
 * the reference, which is their own drawing; a frame Skip Labeled protects; a frame whose objects
 * all left the picture. Legacy decides each of those when it commits a frame
 * (`main_window.py:4459-4594`), and this is that decision as one pure function, so the timeline,
 * the review and Save All all read the same answer.
 *
 * KEEP FLAGGED MASKS IS DECIDED AT COMMIT, AND IT STAYS DECIDED. With it off, a frame where any
 * object scores below Min Conf keeps NO masks, the passing objects' included -- and RULE-060 says
 * lowering the threshold afterwards "cannot recover them". So the caller freezes this result per
 * frame when the frame completes. What is NOT frozen is the flag itself: the timeline re-flags as
 * Min Conf moves (`applyThreshold`), which is the legacy defect this app has already designed out.
 *
 * BY IMAGE KEY, NOT POSITION, for RULE-017's reason: Trim moves every position after the cut, and
 * a policy recorded by position would then protect the wrong pictures.
 *
 * All four cases are held against legacy's own sequence mode by the synthetic-shapes golden, in
 * `test/acceptance/c11.goldens.test.tsx`.
 */

import type { WirePropagationFrame } from "../api/client.js";
import { frameConfidence, isFlagged, type ObjectScore } from "./confidence.js";

export interface CommitPolicy {
  /** Keep a flagged frame's masks for review. Legacy's default is off (`sequence_widget.py:334`). */
  readonly keepFlagged: boolean;
  /**
   * Image keys Skip Labeled protects in THIS run: the frames that had a sidecar when it started,
   * references excluded. Empty when Skip Labeled is off. A snapshot, as legacy's is
   * (`main_window.py:4219-4231`): a sidecar written during the run does not join it.
   */
  readonly skip: ReadonlySet<string>;
  /** Image keys of the references this run was seeded from. */
  readonly references: ReadonlySet<string>;
}

export type Committed =
  /** The user's own drawing. The run's reconstruction of it is never shown or saved. */
  | { readonly kind: "reference" }
  /**
   * RULE-081: the frame keeps its existing labels. `painted` is whether the model produced a mask
   * for it at all, which is the only case legacy paints it brown; a frame every object left stays
   * grey there, labels preserved either way.
   */
  | { readonly kind: "skipped"; readonly painted: boolean }
  /** Every object came back empty. Never committed, and the frame keeps its status (RULE-060). */
  | { readonly kind: "empty" }
  | {
      readonly kind: "scored";
      /** The minimum over the objects with a non-empty mask. */
      readonly score: number;
      /** Flagged at the threshold in force when the frame was committed. */
      readonly flagged: boolean;
      /** The masks a user reviews and Save All may write. Empty when Keep Flagged discarded them. */
      readonly kept: readonly WirePropagationFrame[];
    };

/**
 * One propagated object as RULE-016 scores it.
 *
 * `empty` is read from the mask's own box rather than from a zero confidence, because RULE-016
 * gives an all-negative object a score of 0 too and the two mean opposite things: an empty object
 * is dropped from the frame's minimum, a real object scoring 0 drags the frame to 0 and flags it.
 */
export function scoreOf(result: WirePropagationFrame): ObjectScore {
  // The contract's empty mask is `box: null`. Reading its length threw inside the poll until
  // 2026-09-23, and the poll's error path stopped polling: an object that vanished for a frame
  // ended the whole timeline at that frame, under "Propagated N frames".
  const box = result.mask.box;
  const empty = box === null || box[2] < box[0] || box[3] < box[1];
  return { empty, score: result.confidence };
}

/**
 * What legacy's engine counts, for its notices: the frames it stored a mask for, and the frames
 * with an object below Min Conf (`propagation_manager.py:763-806, 1087-1126`). With Keep Flagged
 * Masks off it stores no object below Min Conf. An object with no pixels is neither; a reference
 * is never reported; a frame not in `among` (trimmed off) is not counted. Skip Labeled is the
 * view's, not the engine's, so its frames count, as they do in legacy's
 * "Propagation complete: N frames, M flagged" (`main_window.py:4621-4634`).
 */
export function engineCounts(
  masks: ReadonlyMap<string, readonly WirePropagationFrame[]>,
  among: ReadonlySet<string>,
  references: ReadonlySet<string>,
  threshold: number,
  keepFlagged: boolean,
): { readonly propagated: ReadonlySet<string>; readonly flagged: ReadonlySet<string> } {
  const propagated = new Set<string>();
  const flagged = new Set<string>();
  for (const [key, results] of masks) {
    if (!among.has(key) || references.has(key)) continue;
    for (const result of results) {
      if (scoreOf(result).empty) continue;
      const low = isFlagged(result.confidence, threshold);
      if (low) flagged.add(key);
      if (!low || keepFlagged) propagated.add(key);
    }
  }
  return { propagated, flagged };
}

export function commitFrame(
  key: string,
  results: readonly WirePropagationFrame[],
  policy: CommitPolicy,
  threshold: number,
): Committed {
  if (policy.references.has(key)) return { kind: "reference" };

  const withPixels = results.filter((result) => !scoreOf(result).empty);
  if (policy.skip.has(key)) return { kind: "skipped", painted: withPixels.length > 0 };

  const score = frameConfidence(results.map(scoreOf));
  if (score === null) return { kind: "empty" };

  const flagged = isFlagged(score, threshold);
  return {
    kind: "scored",
    score,
    flagged,
    // Every object with pixels, a failing one included, when Keep Flagged is on: legacy stores the
    // failing object's mask too, for the user to look at. Off, a flagged frame keeps nothing.
    kept: flagged && !policy.keepFlagged ? [] : withPixels,
  };
}
