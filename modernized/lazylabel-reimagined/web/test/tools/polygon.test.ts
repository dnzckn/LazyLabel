/**
 * RULE-047, worked to the pixel.
 *
 * The rule card's own example is the anchor: join threshold 2, vertices at (10,10), (50,10),
 * (50,50); a click at (11,11) closes because squared distance 2 is less than 4, and a click at
 * (12,10) — squared distance exactly 4 — adds a fourth vertex instead. That boundary is the whole
 * rule, and it is the case hardest to produce by hand in a browser.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_JOIN_THRESHOLD,
  EMPTY_DRAFT,
  MAX_JOIN_THRESHOLD,
  MIN_JOIN_THRESHOLD,
  MINIMUM_VERTICES,
  cancel,
  click,
  finish,
  lastVertex,
  redoVertex,
  undoVertex,
  type PolygonDraft,
} from "../../src/tools/polygon.js";

function draft(...points: readonly [number, number][]): PolygonDraft {
  return { vertices: points.map(([x, y]) => ({ x, y })) };
}

const TRIANGLE = draft([10, 10], [50, 10], [50, 50]);

describe("adding vertices", () => {
  it("starts empty and grows a point at a time", () => {
    let current = EMPTY_DRAFT;
    for (const at of [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }]) {
      const outcome = click(current, at);
      expect(outcome.kind).toBe("vertex");
      if (outcome.kind !== "vertex") throw new Error("expected a vertex");
      current = outcome.draft;
    }

    expect(current.vertices).toHaveLength(3);
  });

  it("does not mutate the draft it was given", () => {
    const before = TRIANGLE.vertices.length;
    click(TRIANGLE, { x: 99, y: 99 });

    expect(TRIANGLE.vertices).toHaveLength(before);
  });

  it("cannot close on two points, however near the start the click is", () => {
    // Strictly MORE than two. Two points and a close would be a line, which has no area.
    const outcome = click(draft([10, 10], [50, 10]), { x: 10, y: 10 });

    expect(outcome.kind).toBe("vertex");
  });

  it("cannot close on one point, so a double-click does not make a polygon", () => {
    expect(click(draft([10, 10]), { x: 10, y: 10 }).kind).toBe("vertex");
  });
});

describe("the join threshold, at the boundary", () => {
  it("closes the card's example: squared distance 2 against a threshold of 2", () => {
    const outcome = click(TRIANGLE, { x: 11, y: 11 }, { joinThreshold: 2 });

    expect(outcome.kind).toBe("close");
    if (outcome.kind !== "close") throw new Error("expected a close");
    // The closing click is NOT a vertex. Appending first and closing afterwards would leave a
    // duplicate point on top of the start -- invisible on screen, present in every export.
    expect(outcome.vertices).toEqual(TRIANGLE.vertices);
  });

  it("does NOT close at exactly the threshold, because the test is strictly less than", () => {
    // (12,10) is squared distance 4 from (10,10), and the threshold squared is 4. The card says
    // this adds a fourth vertex, and off-by-one here changes behaviour on every polygon.
    const outcome = click(TRIANGLE, { x: 12, y: 10 }, { joinThreshold: 2 });

    expect(outcome.kind).toBe("vertex");
    if (outcome.kind !== "vertex") throw new Error("expected a vertex");
    expect(outcome.draft.vertices).toHaveLength(4);
  });

  it("closes just inside it", () => {
    expect(click(TRIANGLE, { x: 11, y: 10 }, { joinThreshold: 2 }).kind).toBe("close");
  });

  it("measures from the FIRST vertex, not the nearest one", () => {
    // Clicking back on the last vertex is how a user pauses, not how they finish.
    expect(click(TRIANGLE, { x: 50, y: 50 }, { joinThreshold: 2 }).kind).toBe("vertex");
  });

  it("uses legacy's default when none is given", () => {
    expect(DEFAULT_JOIN_THRESHOLD).toBe(2);
    expect(click(TRIANGLE, { x: 11, y: 11 }).kind).toBe("close");
    expect(click(TRIANGLE, { x: 12, y: 10 }).kind).toBe("vertex");
  });

  it("clamps a threshold outside legacy's range rather than honouring it", () => {
    // The settings widget allows 1..10. A file edited by hand could say 0, which would make a
    // polygon impossible to close, or 10000, which would close it on the second click.
    expect(click(TRIANGLE, { x: 10, y: 10 }, { joinThreshold: 0 }).kind).toBe("close");
    expect(click(TRIANGLE, { x: 15, y: 10 }, { joinThreshold: 10_000 }).kind).toBe("close");
    expect(click(TRIANGLE, { x: 25, y: 10 }, { joinThreshold: 10_000 }).kind).toBe("vertex");
    expect([MIN_JOIN_THRESHOLD, MAX_JOIN_THRESHOLD]).toEqual([1, 10]);
  });

  it("falls back to the default for a threshold that is not a number at all", () => {
    expect(click(TRIANGLE, { x: 11, y: 11 }, { joinThreshold: Number.NaN }).kind).toBe("close");
  });
});

describe("shift closes into an erase", () => {
  it("erases instead of adding when shift is held on the closing click", () => {
    const outcome = click(TRIANGLE, { x: 11, y: 11 }, { joinThreshold: 2, shift: true });

    expect(outcome.kind).toBe("erase");
    if (outcome.kind !== "erase") throw new Error("expected an erase");
    expect(outcome.vertices).toEqual(TRIANGLE.vertices);
  });

  it("does not turn an ordinary click into anything when shift is held", () => {
    // Shift only matters at the moment of closing. Holding it while placing vertices is not a mode.
    expect(click(TRIANGLE, { x: 80, y: 80 }, { shift: true }).kind).toBe("vertex");
  });
});

describe("finishing with Space or Enter", () => {
  it("closes a polygon that has enough points", () => {
    const outcome = finish(TRIANGLE);

    expect(outcome.kind).toBe("close");
    if (outcome.kind !== "close") throw new Error("expected a close");
    expect(outcome.vertices).toEqual(TRIANGLE.vertices);
  });

  it("erases with shift, the same as a shift-click on the start", () => {
    expect(finish(TRIANGLE, { shift: true }).kind).toBe("erase");
  });

  it("refuses fewer than three points, and says why", () => {
    // Legacy does nothing SILENTLY here, so a user pressing Space on a two-point polygon gets no
    // shape and no explanation, and concludes the key is not bound. The behaviour is unchanged;
    // what changes is that a caller is now able to say something.
    const outcome = finish(draft([10, 10], [50, 10]));

    expect(outcome.kind).toBe("ignored");
    if (outcome.kind !== "ignored") throw new Error("expected it to be ignored");
    expect(outcome.reason).toContain("at least 3 points");
    expect(outcome.reason).toContain("2 points");
  });

  it("reads correctly for a single point", () => {
    const outcome = finish(draft([10, 10]));

    if (outcome.kind !== "ignored") throw new Error("expected it to be ignored");
    expect(outcome.reason).toContain("1 point");
  });

  it("refuses an empty draft rather than producing an empty polygon", () => {
    expect(finish(EMPTY_DRAFT).kind).toBe("ignored");
    expect(MINIMUM_VERTICES).toBe(3);
  });
});

describe("undo during drawing", () => {
  it("takes back one vertex at a time", () => {
    // Legacy records an action per vertex click, so undo steps back through the polygon rather
    // than discarding the whole thing.
    expect(undoVertex(TRIANGLE).vertices).toHaveLength(2);
  });

  it("leaves the idle state after the first point is taken back", () => {
    expect(undoVertex(draft([10, 10])).vertices).toEqual([]);
  });

  it("does nothing on an empty draft rather than failing", () => {
    expect(undoVertex(EMPTY_DRAFT)).toEqual(EMPTY_DRAFT);
  });

  it("undoing back below three points makes the polygon uncloseable again", () => {
    const back = undoVertex(TRIANGLE);
    expect(click(back, { x: 10, y: 10 }).kind).toBe("vertex");
  });
});

describe("abandoning a draft", () => {
  it("returns the idle state", () => {
    expect(cancel()).toEqual(EMPTY_DRAFT);
  });
});

describe("in legacy's Multi tab, whose vertices are whole pixels", () => {
  /** A click's new draft, or a failure naming what came instead. */
  function placed(outcome: ReturnType<typeof click>): PolygonDraft {
    if (outcome.kind !== "vertex") throw new Error(`expected a vertex, got ${outcome.kind}`);
    return outcome.draft;
  }

  it("places the vertex at int() of the click, and its dot where the click was", () => {
    // `point = [int(pos.x()), int(pos.y())]` (main_window.py:5654); the dot at `pos` (5659-5662).
    const next = placed(click(EMPTY_DRAFT, { x: 30.8, y: 40.6 }, { whole: true }));

    expect(next.vertices).toEqual([{ x: 30, y: 40 }]);
    expect(next.marks).toEqual([{ x: 30.8, y: 40.6 }]);
  });

  it("measures the close test from the click as it is to the WHOLE first vertex", () => {
    // `(pos.x() - first_point[0]) ** 2 + ...` against the stored int point (main_window.py:
    // 5609-5614). Clicked at (10.9, 10.9), the first vertex is (10, 10): a click at (12.2, 10.9)
    // is sqrt(5.65) from it and adds a vertex, though it is 1.3 from where the first click was.
    let current = EMPTY_DRAFT;
    for (const at of [{ x: 10.9, y: 10.9 }, { x: 50.5, y: 10.5 }, { x: 50.5, y: 50.5 }]) {
      current = placed(click(current, at, { whole: true }));
    }

    expect(click(current, { x: 12.2, y: 10.9 }, { whole: true }).kind).toBe("vertex");
    expect(click(current, { x: 11.2, y: 10.9 }, { whole: true })).toEqual({
      kind: "close",
      vertices: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }],
    });
  });

  it("takes the dot back with its vertex, and puts both back on redo", () => {
    const one = placed(click(EMPTY_DRAFT, { x: 1.5, y: 2.5 }, { whole: true }));
    const two = placed(click(one, { x: 9.9, y: 9.1 }, { whole: true }));
    const taken = lastVertex(two)!;
    const back = undoVertex(two);

    expect(back).toEqual({ vertices: [{ x: 1, y: 2 }], marks: [{ x: 1.5, y: 2.5 }] });
    expect(redoVertex(back, taken)).toEqual(two);
  });

  it("leaves the single view's vertices where the click was, with no separate dots", () => {
    // polygon_drawing_manager.py:93, 202 keep the QPointF.
    expect(placed(click(EMPTY_DRAFT, { x: 30.8, y: 40.6 }))).toEqual({ vertices: [{ x: 30.8, y: 40.6 }] });
  });
});

