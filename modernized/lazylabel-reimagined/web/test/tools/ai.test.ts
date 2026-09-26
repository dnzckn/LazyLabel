/**
 * RULE-062 and RULE-066: what a click, a drag and Space mean in AI mode.
 *
 * The card's worked example is the anchor: a 40x8 drag produces no prediction, a 60x60 one does,
 * and Space accepts the box preview even when points are also pending.
 */

import { describe, expect, it } from "vitest";

import {
  DRAG_THRESHOLD,
  EMPTY_PROMPT,
  MINIMUM_BOX_SIDE,
  clear,
  pending,
  release,
  undoLast,
  type AiPrompt,
} from "../../src/tools/ai.js";

const at = (x: number, y: number) => ({ x, y });

function promptOf(outcome: ReturnType<typeof release>): AiPrompt {
  if (outcome.kind === "ignored") throw new Error(`expected a prompt, got: ${outcome.reason}`);
  return outcome.prompt;
}

describe("a click adds a point", () => {
  it("adds a positive point when the pointer did not move", () => {
    const outcome = release(EMPTY_PROMPT, at(30, 40), at(30, 40));

    expect(outcome.kind).toBe("point");
    expect(promptOf(outcome).points).toEqual([{ x: 30, y: 40, positive: true }]);
  });

  it("still counts as a click at exactly the threshold", () => {
    // The move that turns a click into a drag is MORE than five pixels. Without a threshold,
    // every click with a shaky hand becomes a one-pixel box, which predicts nothing -- so the
    // tool would appear to ignore clicks at random.
    expect(DRAG_THRESHOLD).toBe(5);
    expect(release(EMPTY_PROMPT, at(0, 0), at(5, 0)).kind).toBe("point");
    expect(release(EMPTY_PROMPT, at(0, 0), at(3, 4)).kind).toBe("point"); // distance exactly 5
  });

  it("uses the RELEASE position for the point, not the press", () => {
    const outcome = release(EMPTY_PROMPT, at(30, 40), at(32, 41));

    expect(promptOf(outcome).points[0]).toEqual({ x: 32, y: 41, positive: true });
  });

  it("adds a negative point on a right click", () => {
    const outcome = release(
      { points: [{ x: 1, y: 1, positive: true }], box: null },
      at(30, 40),
      at(30, 40),
      { negative: true },
    );

    expect(promptOf(outcome).points[1]).toEqual({ x: 30, y: 40, positive: false });
  });

  it("collects several", () => {
    let prompt = promptOf(release(EMPTY_PROMPT, at(1, 1), at(1, 1)));
    prompt = promptOf(release(prompt, at(2, 2), at(2, 2)));

    expect(prompt.points).toHaveLength(2);
  });
});

describe("negative points alone", () => {
  it("are placed but do not ask for a prediction", () => {
    // They say what the object is not, and SAM has nothing to grow from -- the same rule the
    // inference service enforces on its own side.
    const outcome = release(EMPTY_PROMPT, at(5, 5), at(5, 5), { negative: true });

    expect(outcome.kind).toBe("ignored");
    if (outcome.kind !== "ignored") throw new Error("expected it to be ignored");
    // What to do, and no more (2026-09-26); why is the code's comment.
    expect(outcome.reason).toBe("add a positive point to segment");
  });

  it("stop being a problem once a positive point joins them", () => {
    const prompt: AiPrompt = { points: [{ x: 1, y: 1, positive: true }], box: null };

    expect(release(prompt, at(5, 5), at(5, 5), { negative: true }).kind).toBe("point");
  });
});

describe("a drag draws a box", () => {
  it("makes a box once the pointer moves past the threshold", () => {
    const outcome = release(EMPTY_PROMPT, at(10, 10), at(70, 70));

    expect(outcome.kind).toBe("box");
    expect(promptOf(outcome).box).toEqual([at(10, 10), at(70, 70)]);
  });

  it("refuses the card's 40x8 drag, and says why", () => {
    // Legacy discards this silently, which is how a thin drag reads as the tool being broken.
    const outcome = release(EMPTY_PROMPT, at(0, 0), at(40, 8));

    expect(outcome.kind).toBe("ignored");
    if (outcome.kind !== "ignored") throw new Error("expected it to be ignored");
    expect(outcome.reason).toContain("40x8");
    expect(MINIMUM_BOX_SIDE).toBe(10);
  });

  it("refuses a box of exactly ten in one direction", () => {
    // MORE than ten in both directions, so ten is not enough.
    expect(release(EMPTY_PROMPT, at(0, 0), at(10, 50)).kind).toBe("ignored");
    expect(release(EMPTY_PROMPT, at(0, 0), at(11, 50)).kind).toBe("box");
  });

  it("works in any drag direction", () => {
    expect(release(EMPTY_PROMPT, at(70, 70), at(10, 10)).kind).toBe("box");
  });

  it("keeps the points that were already placed", () => {
    const prompt: AiPrompt = { points: [{ x: 1, y: 1, positive: true }], box: null };
    const outcome = release(prompt, at(10, 10), at(70, 70));

    expect(promptOf(outcome).points).toHaveLength(1);
  });
});

describe("what Space would accept", () => {
  it("is nothing when nothing is pending", () => {
    expect(pending(EMPTY_PROMPT)).toBe("nothing");
  });

  it("is the points when only points are pending", () => {
    expect(pending({ points: [{ x: 1, y: 1, positive: true }], box: null })).toBe("points");
  });

  it("is nothing when only negative points are pending", () => {
    expect(pending({ points: [{ x: 1, y: 1, positive: false }], box: null })).toBe("nothing");
  });

  it("is the BOX when both are pending", () => {
    // The card's case. Placing points does not clear a box, so both can be waiting, and legacy
    // resolves it in favour of the box -- the more recent, more deliberate gesture.
    expect(
      pending({ points: [{ x: 1, y: 1, positive: true }], box: [at(0, 0), at(60, 60)] }),
    ).toBe("box");
  });
});

describe("taking things back", () => {
  it("removes the box first, because that is what Space would have accepted", () => {
    const prompt: AiPrompt = {
      points: [{ x: 1, y: 1, positive: true }],
      box: [at(0, 0), at(60, 60)],
    };

    const back = undoLast(prompt);

    expect(back.box).toBeNull();
    expect(back.points).toHaveLength(1);
  });

  it("then removes points, one at a time", () => {
    const prompt: AiPrompt = {
      points: [{ x: 1, y: 1, positive: true }, { x: 2, y: 2, positive: false }],
      box: null,
    };

    expect(undoLast(prompt).points).toHaveLength(1);
  });

  it("does nothing on an empty prompt", () => {
    expect(undoLast(EMPTY_PROMPT)).toBe(EMPTY_PROMPT);
  });

  it("clears everything at once when the preview is accepted or discarded", () => {
    expect(clear()).toEqual(EMPTY_PROMPT);
  });
});
