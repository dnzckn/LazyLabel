/**
 * How sure propagation was — RULE-060's flagging and RULE-035's histogram.
 *
 * Both rule cards carry a worked example and the exact edge cases that make them behave; those are
 * the tests here, plus the legacy defect the design removes. None of it needs a model: the scores
 * come from one, but the arithmetic over them does not.
 */

import { describe, expect, it } from "vitest";

import {
  BINS,
  DEFAULT_THRESHOLD,
  applyThreshold,
  clampThreshold,
  frameConfidence,
  histogram,
  isFlagged,
  saveableFrames,
  thresholdPosition,
} from "../../src/sequence/confidence.js";
import type { Frame, FrameState } from "../../src/sequence/timeline.js";

function frame(index: number, state: FrameState, isReference = false): Frame {
  return { index, key: `f${index}.png`, state, isReference };
}

describe("a frame's confidence (RULE-060)", () => {
  it("is the minimum over the objects that produced a mask", () => {
    expect(
      frameConfidence([
        { empty: false, score: 0.99 },
        { empty: false, score: 0.97 },
        { empty: false, score: 1 },
      ]),
    ).toBe(0.97);
  });

  it("DROPS an empty object rather than counting it as zero", () => {
    // The card's own example: an object whose propagated mask has no pixels does not lower the
    // minimum. Counting it as 0 would flag every frame where one object left the view.
    expect(
      frameConfidence([
        { empty: false, score: 0.97 },
        { empty: true, score: 0 },
      ]),
    ).toBe(0.97);
  });

  it("distinguishes a REAL zero from an empty one", () => {
    // RULE-016 gives an all-negative object a score of 0 with a mask that exists. That is a bad
    // answer and must drag the frame down; an empty mask is no answer at all.
    expect(frameConfidence([{ empty: false, score: 0 }])).toBe(0);
  });

  it("reports NOTHING when every object came out empty", () => {
    // Not zero. RULE-060 says such a frame is never committed and keeps its previous status, so
    // the caller has to be able to tell the two apart.
    expect(frameConfidence([{ empty: true, score: 0 }, { empty: true, score: 0.5 }])).toBeNull();
    expect(frameConfidence([])).toBeNull();
  });
});

describe("flagging (RULE-060)", () => {
  it("flags STRICTLY below the threshold", () => {
    expect(isFlagged(0.98, 0.99)).toBe(true);
    expect(isFlagged(0.99, 0.99)).toBe(false);
  });

  it("does not flag a frame that propagated nothing", () => {
    expect(isFlagged(null, 0.99)).toBe(false);
  });

  it("defaults Min Conf to 0.99", () => {
    expect(DEFAULT_THRESHOLD).toBe(0.99);
  });
});

describe("the threshold control's value", () => {
  it("clamps into [0, 1]", () => {
    expect(clampThreshold(-1)).toBe(0);
    expect(clampThreshold(3)).toBe(1);
  });

  it("holds four decimals, so a float step cannot flag an exactly-equal frame", () => {
    // 0.99 + a few 0.05 steps back and forth lands on 0.9900000000000001, which is strictly
    // greater than 0.99 -- and would flag the one frame the card says is not flagged.
    const drifted = 0.99 + 0.05 - 0.05 + 0.0000000000000001;
    expect(isFlagged(0.99, clampThreshold(drifted))).toBe(false);
  });

  it("falls back to the default rather than accepting a non-number", () => {
    expect(clampThreshold(Number.NaN)).toBe(DEFAULT_THRESHOLD);
  });
});

describe("the histogram (RULE-035)", () => {
  it("matches the card's worked example", () => {
    // Given scores [0.95, 0.97, 0.995, 1.0] and threshold 0.99, the card says: view 0.93 to 1.0,
    // Below 2 (50%), Above 2 (50%).
    const view = histogram([0.95, 0.97, 0.995, 1], 0.99);

    expect(view.from).toBeCloseTo(0.93, 10);
    expect(view.to).toBe(1);
    expect(view.below).toBe(2);
    expect(view.above).toBe(2);
    expect(view.belowFraction).toBe(0.5);
  });

  it("uses 50 bins, and puts every score in one", () => {
    const view = histogram([0.95, 0.97, 0.995, 1], 0.99);

    expect(view.bins).toHaveLength(BINS);
    expect(view.bins.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("starts the view below the LOWEST score, not at zero", () => {
    // The point of the rule. Propagation scores cluster just under 1, and a 0-to-1 axis draws
    // every one of them in the last bin -- a single spike that tells the user nothing.
    expect(histogram([0.4, 0.99], 0.99).from).toBeCloseTo(0.38, 10);
  });

  it("keeps the threshold in view when it is set below every score", () => {
    // Otherwise the marker for the number being dragged leaves the chart.
    const view = histogram([0.9, 0.95], 0.5);
    expect(view.from).toBeCloseTo(0.48, 10);
    expect(thresholdPosition(view, 0.5)).toBeGreaterThanOrEqual(0);
    expect(thresholdPosition(view, 0.5)).toBeLessThanOrEqual(1);
  });

  it("never starts below zero", () => {
    expect(histogram([0.01], 0.01).from).toBe(0);
  });

  it("survives every score being exactly 1 with the threshold there too", () => {
    // A zero-width view. One bin is the honest picture; dividing by the span would lose them all
    // to a NaN index.
    const view = histogram([1, 1], 1);
    expect(view.bins.reduce((a, b) => a + b, 0)).toBe(2);
    expect(view.below).toBe(0);
  });

  it("reports no scores as an empty view rather than a division by zero", () => {
    const view = histogram([], 0.99);
    expect(view.belowFraction).toBe(0);
    expect(view.bins.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("re-flagging the timeline (the legacy defect, designed out)", () => {
  const FRAMES = [
    frame(0, "saved", true),
    frame(1, "propagated"),
    frame(2, "propagated"),
    frame(3, "pending"),
    frame(4, "skipped"),
  ];
  const SCORES = { 0: 0.5, 1: 0.97, 2: 1, 4: 0.1 };

  it("moves the TIMELINE, not only the set the save uses", () => {
    // Legacy recomputes the flagged set Save All reads and leaves the colours alone, so the user
    // reviews the frames the timeline points at and ships the ones the save skipped.
    const next = applyThreshold(FRAMES, SCORES, 0.99);

    expect(next.map((f) => f.state)).toEqual(["saved", "flagged", "propagated", "pending", "skipped"]);
  });

  it("UNFLAGS again when the threshold comes back down", () => {
    // A one-way flag makes the control feel broken the first time someone overshoots and corrects.
    const raised = applyThreshold(FRAMES, SCORES, 0.99);
    const lowered = applyThreshold(raised, SCORES, 0.9);

    expect(lowered.map((f) => f.state)).toEqual([
      "saved",
      "propagated",
      "propagated",
      "pending",
      "skipped",
    ]);
  });

  it("leaves a reference frame alone, however low its score", () => {
    // Ground truth the user drew. A number changing must not turn their own work into something
    // the app says needs review.
    expect(applyThreshold(FRAMES, SCORES, 1)[0]!.state).toBe("saved");
    expect(applyThreshold(FRAMES, SCORES, 1)[0]!.isReference).toBe(true);
  });

  it("leaves a skipped frame alone", () => {
    // RULE-048 skips a frame whose size does not match the reference; it never took part, so its
    // score is not a judgement about it.
    expect(applyThreshold(FRAMES, SCORES, 1)[4]!.state).toBe("skipped");
  });

  it("leaves a frame with no score alone", () => {
    expect(applyThreshold(FRAMES, SCORES, 1)[3]!.state).toBe("pending");
  });

  it("returns the SAME array when nothing moved", () => {
    // So a threshold nudged within one bin does not re-render the timeline.
    const next = applyThreshold(FRAMES, SCORES, 0.9);
    expect(applyThreshold(next, SCORES, 0.91)).toBe(next);
  });
});

describe("what Save All writes (RULE-060)", () => {
  it("never writes a flagged frame", () => {
    // Including one whose masks Keep Flagged Masks held on to: those are for REVIEW, and writing
    // them would put the model's unsure guesses on disk under the user's name.
    const frames = [frame(0, "flagged"), frame(1, "propagated"), frame(2, "saved")];

    expect(saveableFrames(frames).map((f) => f.index)).toEqual([1, 2]);
  });

  it("writes neither a pending nor a skipped frame", () => {
    const frames = [frame(0, "pending"), frame(1, "skipped"), frame(2, "propagated")];

    expect(saveableFrames(frames).map((f) => f.index)).toEqual([2]);
  });
});
