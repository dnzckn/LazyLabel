/**
 * Trim — RULE-077. Cut removes the frames between the markers; Keep removes everything outside.
 *
 * The rule's worked example is a 100-frame timeline with markers at 20 and 30, and most of what it
 * specifies is about what SURVIVES: the remaining frames keep their status, score, masks and
 * reference role, and the current frame moves to the nearest kept one.
 *
 * ONE DIVERGENCE, ON PURPOSE. Legacy resets the propagation engine on trim, and its own card
 * records the cost: "Save All then reports nothing to save even though green frames with unsaved
 * propagated masks remain". The masks are keyed by image key here rather than by position, so a
 * trim cannot lose or misplace them and they simply survive.
 */

import { describe, expect, it } from "vitest";

import { trim } from "../../src/sequence/timeline.js";
import type { Frame } from "../../src/sequence/timeline.js";

function frames(count: number): readonly Frame[] {
  return Array.from({ length: count }, (_unused, index) => ({
    index,
    key: `frames/f${String(index).padStart(3, "0")}.png`,
    state: "pending",
    isReference: false,
  })) as unknown as readonly Frame[];
}

function keysOf(outcome: ReturnType<typeof trim>): readonly string[] {
  if (outcome.kind !== "trimmed") throw new Error(`refused: ${outcome.reason}`);
  return outcome.frames.map((frame) => frame.key);
}

describe("cutting", () => {
  it("removes the frames between the markers, both ends included", () => {
    // The rule's own example: markers at 20 and 30 remove ELEVEN frames, not nine.
    const outcome = trim(frames(100), 20, 30, "cut");

    expect(outcome.kind).toBe("trimmed");
    if (outcome.kind !== "trimmed") return;
    expect(outcome.removed).toBe(11);
    expect(outcome.frames).toHaveLength(89);
  });

  it("re-indexes what is left, so old frame 31 becomes index 20", () => {
    const outcome = trim(frames(100), 20, 30, "cut");

    expect(keysOf(outcome)[20]).toBe("frames/f031.png");
    if (outcome.kind !== "trimmed") return;
    expect(outcome.frames[20]!.index).toBe(20);
  });

  it("does not care which marker came first", () => {
    // A user drags two markers and does not think about which was which.
    expect(keysOf(trim(frames(10), 7, 3, "cut"))).toEqual(keysOf(trim(frames(10), 3, 7, "cut")));
  });
});

describe("keeping", () => {
  it("removes everything OUTSIDE the markers", () => {
    const outcome = trim(frames(10), 3, 5, "keep");

    expect(keysOf(outcome)).toEqual([
      "frames/f003.png",
      "frames/f004.png",
      "frames/f005.png",
    ]);
  });

  it("refuses when the range already covers everything", () => {
    const outcome = trim(frames(10), 0, 9, "keep");

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.reason).toMatch(/every frame is inside/);
  });
});

describe("what it refuses", () => {
  it("needs both bounds", () => {
    const outcome = trim(frames(10), 3, null, "cut");

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.reason).toMatch(/both trim bounds/);
  });

  it("will not empty the timeline", () => {
    // An empty timeline has no range picker in it, so the only way back would be to rebuild.
    const outcome = trim(frames(10), 0, 9, "cut");

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.reason).toMatch(/Cannot remove all frames/);
  });

  it("says so when a cut would remove nothing", () => {
    const outcome = trim(frames(10), 20, 30, "cut");

    expect(outcome.kind).toBe("refused");
  });
});

describe("what survives", () => {
  it("keeps every frame's status and reference role", () => {
    // "Remaining frames keep their status, score, masks and reference data." Losing a reference to
    // a trim would silently change what the next propagation carries from.
    const original = frames(10).map((frame, index) =>
      index === 8 ? { ...frame, state: "flagged", isReference: true } : frame,
    ) as readonly Frame[];

    const outcome = trim(original, 2, 4, "cut");

    if (outcome.kind !== "trimmed") throw new Error("refused");
    const moved = outcome.frames.find((frame) => frame.key === "frames/f008.png")!;
    expect(moved.state).toBe("flagged");
    expect(moved.isReference).toBe(true);
    // And it really did move: 8 minus the three cut frames.
    expect(moved.index).toBe(5);
  });

  it("moves the current frame to the nearest one kept", () => {
    // The rule: current 25, markers 20-30, so it lands on old 19.
    const outcome = trim(frames(100), 20, 30, "cut", 25);

    if (outcome.kind !== "trimmed") throw new Error("refused");
    expect(outcome.frames[outcome.current]!.key).toBe("frames/f019.png");
  });

  it("breaks a tie towards the EARLIER frame", () => {
    // Current 5, cutting 4-6: old 3 and old 7 are both two away. Legacy takes the lower, and any
    // other answer would depend on iteration order rather than on a decision.
    const outcome = trim(frames(10), 4, 6, "cut", 5);

    if (outcome.kind !== "trimmed") throw new Error("refused");
    expect(outcome.frames[outcome.current]!.key).toBe("frames/f003.png");
  });

  it("leaves the current frame where it is when nothing before it moved", () => {
    const outcome = trim(frames(10), 6, 8, "cut", 2);

    if (outcome.kind !== "trimmed") throw new Error("refused");
    expect(outcome.frames[outcome.current]!.key).toBe("frames/f002.png");
  });
});

describe("with the timeline sorted (SP-27)", () => {
  /*
   * Legacy cuts and keeps the frames between the markers AS DISPLAYED (main_window.py:5209-5228,
   * 5311-5322). The web took them in natural order, so a sorted timeline lost different frames
   * from the ones between the markers on screen.
   */
  const shown = [1, 4, 0, 2, 3]; // f001, f004, f000, f002, f003 on screen

  it("cuts the frames between the markers on screen", () => {
    // Markers on f001 (shown first) and f000 (shown third): f001, f004 and f000 go.
    expect(keysOf(trim(frames(5), 1, 0, "cut", 0, shown))).toEqual(["frames/f002.png", "frames/f003.png"]);
  });

  it("keeps the frames between the markers on screen", () => {
    expect(keysOf(trim(frames(5), 1, 0, "keep", 0, shown))).toEqual([
      "frames/f000.png",
      "frames/f001.png",
      "frames/f004.png",
    ]);
  });

  it("takes natural order when nothing is sorted, as before", () => {
    expect(keysOf(trim(frames(5), 1, 0, "cut"))).toEqual(["frames/f002.png", "frames/f003.png", "frames/f004.png"]);
  });
});
