/**
 * How sure propagation was, and which frames that makes you look at — RULE-060 and RULE-035.
 *
 * Step 5 of the "carry labels through a sequence" flow: after SAM 2 has filled the timeline in,
 * the user tunes one number and the set of frames they have to review changes with it. That number
 * decides what gets SAVED as well, which is why this is not a display concern.
 *
 * PURE, AND BUILDABLE BEFORE PROPAGATION IS. The scores come from the model, but nothing here
 * needs one: binning, flagging and the threshold are arithmetic over `{frame: score}`. Leaving
 * this until a checkpoint arrives would leave the UI to write on the day the data does.
 *
 * ONE LEGACY DEFECT IS DESIGNED OUT, and it is the reason `applyThreshold` returns frames rather
 * than a set. Legacy's own card records that changing Min Conf after propagation recomputes the
 * flagged set that Save All uses, but NOT the timeline's colours. So the timeline says a frame is
 * fine while the save skips it — the user reviews one set of frames and ships another. There is
 * one threshold here and one answer derived from it; the two cannot drift because there is nothing
 * to keep in step.
 */

import type { Frame } from "./timeline.js";

/** One object's propagation result in one frame. */
export interface ObjectScore {
  /**
   * Whether the propagated mask came out with no pixels at all.
   *
   * Tracked rather than inferred from a zero score, because RULE-016 gives an all-negative object
   * a score of 0 too -- and the two must be treated differently: an empty object is DROPPED from
   * the minimum, while a real object scoring 0 drags the frame down to 0 and flags it.
   */
  readonly empty: boolean;
  /** `sigmoid(mean(logits > 0))` per RULE-016, in [0, 1]. */
  readonly score: number;
}

/** Min Conf's default and bounds — RULE-060's parameters. */
export const DEFAULT_THRESHOLD = 0.99;
export const THRESHOLD_STEP = 0.05;
/** 50 bins, and 0.02 of padding below the lowest score — RULE-035's parameters. */
export const BINS = 50;
export const VIEW_PADDING = 0.02;

/**
 * A frame's confidence: the MINIMUM over the objects that produced a non-empty mask.
 *
 * Null when every object came out empty. That is not "confidence 0" and must not be flattened into
 * it: RULE-060 says such a frame is never committed and keeps its previous status, so a caller has
 * to be able to tell "propagated badly" from "propagated nothing".
 */
export function frameConfidence(objects: readonly ObjectScore[]): number | null {
  let lowest: number | null = null;
  for (const object of objects) {
    // Dropped rather than counted as 0. An object with no pixels is not a bad answer, it is no
    // answer, and letting it set the minimum would flag every frame that has one.
    if (object.empty) continue;
    if (lowest === null || object.score < lowest) lowest = object.score;
  }
  return lowest;
}

/**
 * Whether a confidence flags its frame — STRICTLY below, per RULE-060.
 *
 * The strictness is user-visible and the card says so: at the default threshold a frame scoring
 * exactly 0.99 is NOT flagged. `<=` would put every perfectly-confident frame at the default into
 * the review queue.
 */
export function isFlagged(confidence: number | null, threshold: number): boolean {
  if (confidence === null) return false;
  return confidence < threshold;
}

/**
 * Min Conf as the control may set it: clamped to [0, 1] and held to four decimals.
 *
 * Four decimals is legacy's spin box, and keeping it matters for the strict comparison above --
 * a threshold of 0.9900000000000001 arriving from a float step would flag a frame scoring exactly
 * 0.99, which is the one case the card calls out.
 */
export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THRESHOLD;
  const bounded = Math.min(1, Math.max(0, value));
  return Number(bounded.toFixed(4));
}

export interface Histogram {
  /** The low end of the view, per RULE-035. */
  readonly from: number;
  /** Always 1.0. */
  readonly to: number;
  /** `BINS` counts, left to right. */
  readonly bins: readonly number[];
  /** Scores strictly below the threshold. */
  readonly below: number;
  readonly above: number;
  /** `below / (below + above)`, or 0 when there are no scores. */
  readonly belowFraction: number;
}

/**
 * The histogram the user tunes against — RULE-035.
 *
 * The view starts at `max(0, min(threshold, lowest score) - 0.02)` rather than at 0, which is the
 * whole point of it: propagation scores cluster just under 1, and a 0-to-1 axis would draw every
 * one of them in the last bin and show the user a single spike.
 *
 * Taking the minimum against the THRESHOLD as well as the scores is what keeps the threshold line
 * on screen when it is set below everything measured -- otherwise the marker for the number being
 * dragged would leave the chart.
 */
export function histogram(scores: readonly number[], threshold: number): Histogram {
  const lowest = scores.length === 0 ? threshold : Math.min(...scores);
  const from = Math.max(0, Math.min(threshold, lowest) - VIEW_PADDING);
  const to = 1;
  const span = to - from;

  const bins = new Array<number>(BINS).fill(0);
  for (const score of scores) {
    // A degenerate span means every score sits at 1.0 with the threshold there too. One bin is the
    // honest picture; dividing by zero would put them all in a NaN index and lose them.
    const at =
      span <= 0 ? BINS - 1 : Math.min(BINS - 1, Math.max(0, Math.floor(((score - from) / span) * BINS)));
    bins[at] = (bins[at] ?? 0) + 1;
  }

  const below = scores.filter((score) => score < threshold).length;
  const above = scores.length - below;
  return {
    from,
    to,
    bins,
    below,
    above,
    belowFraction: scores.length === 0 ? 0 : below / scores.length,
  };
}

/**
 * Legacy's axis ticks (`confidence_histogram_dialog.py:93-116`): about `maxTicks` values at a step
 * of 1, 2 or 5 times a power of ten, from the first multiple of the step at or above `lo` to `hi`.
 * The same float arithmetic, so the same ticks.
 */
export function niceTicks(lo: number, hi: number, maxTicks = 6): readonly number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const raw = span / maxTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const step =
    residual <= 1.5 ? magnitude : residual <= 3.5 ? 2 * magnitude : residual <= 7.5 ? 5 * magnitude : 10 * magnitude;
  const ticks: number[] = [];
  for (let at = Math.ceil(lo / step) * step; at <= hi + step * 0.001; at += step) {
    ticks.push(Math.round(at * 1e10) / 1e10);
  }
  return ticks;
}

/**
 * Where the threshold sits across the histogram's width, as a fraction in [0, 1].
 *
 * Its own function because the chart and any marker over it must agree, and computing it twice is
 * how a line ends up drawn somewhere other than where the number is.
 */
export function thresholdPosition(view: Histogram, threshold: number): number {
  const span = view.to - view.from;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (threshold - view.from) / span));
}

/**
 * Re-flag the whole timeline against a threshold — the legacy defect, designed out.
 *
 * Legacy's card records that changing Min Conf after propagation recomputes the flagged set Save
 * All uses but NOT the timeline's statuses. The user then reviews the frames the colours point at
 * and ships the ones the save skipped, and nothing anywhere says the two disagree. Here there is
 * one threshold and one derivation from it, so there is nothing to keep in step.
 *
 * ONLY FRAMES WITH A SCORE MOVE. A frame that was never propagated has no confidence to judge, and
 * a reference frame is ground truth the user drew -- neither becomes flagged because a number
 * changed. `saved` is left alone for the same reason: it is already on disk, and re-flagging it
 * would claim a file needs review that the save has finished with.
 *
 * `held` names the frames whose masks were DISCARDED when they were flagged, with Keep Flagged
 * Masks off: they stay flagged whatever the threshold, since lowering it cannot bring the masks
 * back and Save All will not write them. Turned green, they promised a save that never came
 * (SEQUENCE_PARITY.md SP-33); legacy's stay red, as its timeline keeps its colours
 * (`main_window.py:4718-4723`).
 */
export function applyThreshold(
  frames: readonly Frame[],
  scores: Readonly<Record<number, number>>,
  threshold: number,
  held: ReadonlySet<string> = new Set(),
): readonly Frame[] {
  let changed = false;
  const next = frames.map((frame) => {
    const confidence = scores[frame.index];
    if (confidence === undefined) return frame;
    if (frame.isReference || frame.state === "saved" || frame.state === "skipped") return frame;

    // "propagated" is the un-flagged resting state of a frame that has a score: raising the
    // threshold flags it, lowering it back must let it go again. A one-way flag would make the
    // control feel broken the first time someone overshot and corrected.
    const state = held.has(frame.key) || isFlagged(confidence, threshold) ? "flagged" : "propagated";
    if (state === frame.state) return frame;
    changed = true;
    return { ...frame, state } as Frame;
  });

  // The same array back when nothing moved, so a threshold nudged within one bin does not
  // re-render the timeline or mark anything dirty.
  return changed ? next : frames;
}

/**
 * The frames Save All would write — RULE-060's last clause.
 *
 * "Save All never writes a flagged frame", including the ones Keep Flagged Masks held on to: those
 * masks are for REVIEW, and writing them would put the model's unsure guesses on disk under the
 * user's name. A reference frame is the user's own work and is written.
 */
export function saveableFrames(frames: readonly Frame[]): readonly Frame[] {
  return frames.filter(
    (frame) => frame.state !== "flagged" && frame.state !== "skipped" && frame.state !== "pending",
  );
}
