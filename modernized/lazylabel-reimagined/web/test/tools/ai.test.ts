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
  NEGATIVE_ALONE,
  asked,
  clear,
  pending,
  press,
  release,
  undoLast,
  type AiPrompt,
} from "../../src/tools/ai.js";

const at = (x: number, y: number) => ({ x, y });

function promptOf(outcome: ReturnType<typeof release> | null): AiPrompt {
  if (outcome === null) throw new Error("expected a prompt, got a press still waiting for its release");
  if (outcome.kind === "ignored") throw new Error(`expected a prompt, got: ${outcome.reason}`);
  return outcome.prompt;
}

const ONE_POSITIVE: AiPrompt = { points: [{ x: 1, y: 1, positive: true }], box: null };

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

  it("collects several", () => {
    let prompt = promptOf(release(EMPTY_PROMPT, at(1, 1), at(1, 1)));
    prompt = promptOf(release(prompt, at(2, 2), at(2, 2)));

    expect(prompt.points).toHaveLength(2);
  });
});

describe("a press, in legacy's single view", () => {
  it("is a negative point AT ONCE when it is the right button, where it was pressed", () => {
    // `single_view_mouse_handler.py:137-139`: `_add_point(pos, positive=False)` on the press itself.
    const outcome = press(ONE_POSITIVE, at(30, 40), "right");

    expect(outcome?.kind).toBe("point");
    expect(promptOf(outcome).points[1]).toEqual({ x: 30, y: 40, positive: false });
  });

  it("only remembers where it went down when it is the left button, for the release to decide", () => {
    // `:131-136`: a left press stores the position and adds nothing.
    expect(press(EMPTY_PROMPT, at(30, 40), "left")).toBeNull();
  });
});

describe("negative points alone", () => {
  it("are placed but do not ask for a prediction", () => {
    // They say what the object is not, and SAM has nothing to grow from -- the same rule the
    // inference service enforces on its own side. Legacy still draws the red point
    // (`ai_segment_manager.py:447-466`); this used to drop it.
    const outcome = press(EMPTY_PROMPT, at(5, 5), "right");

    expect(outcome?.kind).toBe("placed");
    if (outcome?.kind !== "placed") throw new Error("expected the point to be placed");
    expect(outcome.prompt.points).toEqual([{ x: 5, y: 5, positive: false }]);
    // What to do, and no more (2026-09-26); why is the code's comment.
    expect(outcome.reason).toBe(NEGATIVE_ALONE);
    expect(outcome.reason).toBe("add a positive point to segment");
  });

  it("stop being a problem once a positive point joins them", () => {
    expect(press(ONE_POSITIVE, at(5, 5), "right")?.kind).toBe("point");
  });
});

describe("legacy's multi view, which is another handler", () => {
  // `main_window.py:5498-5572`: every press waits for its release; the release decides with
  // either button.
  it("waits for the release whichever button is pressed", () => {
    expect(press(EMPTY_PROMPT, at(30, 40), "right", "multi")).toBeNull();
    expect(press(EMPTY_PROMPT, at(30, 40), "left", "multi")).toBeNull();
  });

  it("puts a click's point where the pointer went DOWN, not where it came up", () => {
    // `_handle_multi_view_ai_click(viewer_idx, start_pos, is_positive)`.
    const outcome = release(EMPTY_PROMPT, at(30, 40), at(33, 41), { view: "multi" });

    expect(promptOf(outcome).points).toEqual([{ x: 30, y: 40, positive: true }]);
  });

  it("makes a right click a negative point on its release", () => {
    const outcome = release(ONE_POSITIVE, at(30, 40), at(30, 40), { negative: true, view: "multi" });

    expect(promptOf(outcome).points[1]).toEqual({ x: 30, y: 40, positive: false });
  });

  it("makes a RIGHT drag a box, as it does a left one", () => {
    const outcome = release(EMPTY_PROMPT, at(10, 10), at(70, 70), { negative: true, view: "multi" });

    expect(outcome.kind).toBe("box");
    expect(promptOf(outcome).box).toEqual([at(10, 10), at(70, 70)]);
  });

  it("makes a thin drag a point where it was pressed, where the single view discards it", () => {
    expect(release(EMPTY_PROMPT, at(0, 0), at(40, 8)).kind).toBe("ignored");

    const outcome = release(EMPTY_PROMPT, at(0, 0), at(40, 8), { view: "multi" });

    expect(promptOf(outcome).points).toEqual([{ x: 0, y: 0, positive: true }]);
  });

  it("still places negative points alone without asking for a prediction", () => {
    // Legacy's multi view asks its model anyway (`main_window.py:6791-6797`); the service here
    // refuses a prompt of negative points alone.
    const outcome = release(EMPTY_PROMPT, at(5, 5), at(5, 5), { negative: true, view: "multi" });

    expect(outcome.kind).toBe("placed");
  });

  it("asks a box ALONE, the points placed before it left out", () => {
    // `predict_from_box(target_idx, box)` (main_window.py:6693-6704): the box and nothing else.
    const boxed = promptOf(release(ONE_POSITIVE, at(10, 10), at(70, 70), { view: "multi" }));

    expect(asked(boxed, "multi")).toEqual({ points: [], box: [at(10, 10), at(70, 70)] });
    // The points stay placed, and drawn.
    expect(boxed.points).toEqual(ONE_POSITIVE.points);
  });

  it("asks the points alone at the next click, every one placed, the box forgotten", () => {
    // `_update_multi_view_prediction` predicts from the viewer's points (main_window.py:6788-6797).
    const boxed = promptOf(release(ONE_POSITIVE, at(10, 10), at(70, 70), { view: "multi" }));

    const outcome = release(boxed, at(30, 30), at(30, 30), { negative: true, view: "multi" });

    expect(outcome.kind).toBe("point");
    expect(asked(promptOf(outcome), "multi")).toEqual({
      points: [...ONE_POSITIVE.points, { x: 30, y: 30, positive: false }],
      box: null,
    });
  });

  it("keeps the box when the click has nothing positive to ask from, as its preview stays", () => {
    // Legacy predicts nothing without a positive point (sam_multi_view_manager.py:278-279), so the
    // box's preview is still the one Space accepts.
    const boxed = promptOf(release(EMPTY_PROMPT, at(10, 10), at(70, 70), { view: "multi" }));

    const outcome = release(boxed, at(30, 30), at(30, 30), { negative: true, view: "multi" });

    expect(outcome.kind).toBe("placed");
    expect(promptOf(outcome).box).toEqual([at(10, 10), at(70, 70)]);
    expect(pending(promptOf(outcome))).toBe("box");
  });

  it("leaves the single view asking the box with the points (RULE-066)", () => {
    const boxed = promptOf(release(ONE_POSITIVE, at(10, 10), at(70, 70)));

    expect(asked(boxed)).toEqual(boxed);
    expect(asked(boxed, "single")).toEqual({ points: ONE_POSITIVE.points, box: [at(10, 10), at(70, 70)] });
  });

  it("places a click's point in the whole pixel it went down in, as legacy's int() does", () => {
    // `_transform_multi_view_coords` returns `int(pos.x()), int(pos.y())` (main_window.py:6739),
    // and that point is what each viewer keeps and draws (6667-6672, 6760-6762).
    const outcome = release(EMPTY_PROMPT, at(30.9, 40.2), at(31.6, 40.9), { view: "multi" });

    expect(promptOf(outcome).points).toEqual([{ x: 30, y: 40, positive: true }]);
  });

  it("places a box in whole pixels, judging its size on the drag as it was", () => {
    // `rect.width() > 10` on the QRectF (main_window.py:5566), then `int(rect.left())` and the rest
    // (6694): 10.7 wide is a box, though its whole pixels are 10 apart.
    const outcome = release(EMPTY_PROMPT, at(10.2, 10.2), at(20.9, 20.9), { view: "multi" });

    expect(outcome.kind).toBe("box");
    expect(promptOf(outcome).box).toEqual([at(10, 10), at(20, 20)]);
  });
});

describe("what the model is asked, in whole pixels", () => {
  it("truncates the single view's points, which keep where the click was for their dots", () => {
    // Drawn at `pos` (ai_segment_manager.py:457-462), asked as `int(pos.x() * 1.0)`
    // (ai_segment_manager.py:445; coordinate_transformer.py:47-50; sam_update_worker.py:42-43).
    const prompt = promptOf(release(EMPTY_PROMPT, at(12.7, 8.3), at(12.9, 8.6)));

    expect(prompt.points).toEqual([{ x: 12.9, y: 8.6, positive: true }]);
    expect(asked(prompt)).toEqual({ points: [{ x: 12, y: 8, positive: true }], box: null });
  });

  it("truncates a box's corners, whichever way it was dragged", () => {
    // `_handle_ai_bounding_box`: `int()` of the rect's left, top, right and bottom
    // (main_window.py:2236-2242).
    const prompt = promptOf(release(ONE_POSITIVE, at(35.6, 18.2), at(5.9, 2.4)));

    expect(asked(prompt).box).toEqual([at(35, 18), at(5, 2)]);
  });

  it("truncates toward zero, as Python's int() does, and never asks for -0", () => {
    const asks = asked({ points: [{ x: -0.4, y: 3.5, positive: true }], box: null }).points[0]!;

    expect(asks).toEqual({ x: 0, y: 3, positive: true });
    expect(Object.is(asks.x, 0)).toBe(true);
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
