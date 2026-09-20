/**
 * The sequence timeline — Phase 6's pilot slice, against RULE-072, RULE-076 and RULE-048.
 *
 * The two rules worth reading before this file are the ones whose behaviour nobody would guess:
 * the Sort puts FLAGGED almost last, below pending, and Clear Flags resets SKIPPED frames while a
 * new propagation run does not. Both are legacy's, both are reproduced, and both look like bugs
 * until you know why.
 */

import { describe, expect, it } from "vitest";

import {
  buildTimeline,
  clearFlags,
  colourOf,
  markReferences,
  resetForPropagation,
  sortedOrder,
  step,
  summarize,
  type Frame,
  type FrameState,
} from "../../src/sequence/timeline.js";

const FILES = ["a.png", "b.png", "c.png", "d.png", "e.png"];

/** A timeline with the states named, so a test reads as the situation it is about. */
function timeline(...states: (FrameState | "reference")[]): readonly Frame[] {
  return states.map((state, index) => ({
    index,
    key: `${index}.png`,
    state: state === "reference" ? "pending" : state,
    isReference: state === "reference",
  }));
}

describe("building it from a file range", () => {
  it("takes an inclusive range of the file list", () => {
    const frames = buildTimeline(FILES, 1, 3);

    expect(frames.map((f) => f.key)).toEqual(["b.png", "c.png", "d.png"]);
  });

  it("numbers frames from zero within the timeline, not within the folder", () => {
    // Every operation addresses a frame by its TIMELINE position. Carrying the folder's index
    // would make a trimmed timeline's numbers full of holes.
    expect(buildTimeline(FILES, 2, 4).map((f) => f.index)).toEqual([0, 1, 2]);
  });

  it("puts a reversed range the right way round", () => {
    // Dragging a range backwards means the same range.
    expect(buildTimeline(FILES, 3, 1)).toEqual(buildTimeline(FILES, 1, 3));
  });

  it("clamps a range that ran off the end rather than refusing it", () => {
    expect(buildTimeline(FILES, -5, 99).map((f) => f.key)).toEqual(FILES);
  });

  it("starts every frame pending and unreferenced", () => {
    expect(buildTimeline(FILES, 0, 1).every((f) => f.state === "pending" && !f.isReference)).toBe(true);
  });

  it("copes with an empty folder", () => {
    expect(buildTimeline([], 0, 5)).toEqual([]);
  });
});

describe("marking references from existing annotations", () => {
  it("makes an already-annotated frame a reference", () => {
    const frames = markReferences(buildTimeline(FILES, 0, 2), new Set(["b.png"]));

    expect(frames.map((f) => f.isReference)).toEqual([false, true, false]);
  });

  it("leaves unannotated frames pending, not skipped", () => {
    const frames = markReferences(buildTimeline(FILES, 0, 2), new Set(["b.png"]));

    expect(frames[0]!.state).toBe("pending");
  });

  it("SKIPS a reference whose size disagrees with the first one (RULE-048)", () => {
    // SAM 2 stages one video at one size, so a frame of another cannot take part. Marked skipped
    // rather than silently dropped: a frame that vanished from the run with no trace is how a
    // sequence comes back with a hole in it.
    const sizes: Record<string, { width: number; height: number }> = {
      "a.png": { width: 640, height: 480 },
      "b.png": { width: 800, height: 600 },
      "c.png": { width: 640, height: 480 },
    };
    const frames = markReferences(
      buildTimeline(["a.png", "b.png", "c.png"], 0, 2),
      new Set(["a.png", "b.png", "c.png"]),
      (key) => sizes[key] ?? null,
    );

    expect(frames.map((f) => [f.isReference, f.state])).toEqual([
      [true, "pending"],
      [false, "skipped"],
      [true, "pending"],
    ]);
  });

  it("takes the FIRST reference's size as the required one, not the first frame's", () => {
    // Frame 0 is not annotated, so it sets nothing; frame 1 does.
    const sizes: Record<string, { width: number; height: number }> = {
      "a.png": { width: 1, height: 1 },
      "b.png": { width: 800, height: 600 },
      "c.png": { width: 800, height: 600 },
    };
    const frames = markReferences(
      buildTimeline(["a.png", "b.png", "c.png"], 0, 2),
      new Set(["b.png", "c.png"]),
      (key) => sizes[key] ?? null,
    );

    expect(frames[2]!.isReference).toBe(true);
  });

  it("trusts a frame whose size is not known yet", () => {
    // Refusing on unknown information is worse than checking later: the size arrives from a
    // metadata request that may not have landed.
    const frames = markReferences(buildTimeline(FILES, 0, 1), new Set(["a.png", "b.png"]));

    expect(frames.every((f) => f.isReference)).toBe(true);
  });
});

describe("the Sort order (RULE-072)", () => {
  it("works the rule card's example", () => {
    // Frames 0 pending, 1 flagged, 2 reference, 3 saved gives 2, 3, 0, 1.
    const frames = timeline("pending", "flagged", "reference", "saved");

    expect(sortedOrder(frames)).toEqual([2, 3, 0, 1]);
  });

  it("puts FLAGGED below pending, which is the surprising part", () => {
    // The list is "what is finished", not "what needs attention" -- the flagged frames have their
    // own navigation for that. A port that sorted flagged to the top would look more helpful and
    // would not be legacy.
    expect(sortedOrder(timeline("flagged", "pending"))).toEqual([1, 0]);
  });

  it("puts skipped last of all", () => {
    expect(sortedOrder(timeline("skipped", "flagged", "propagated"))).toEqual([2, 1, 0]);
  });

  it("breaks ties by frame number", () => {
    expect(sortedOrder(timeline("pending", "pending", "pending"))).toEqual([0, 1, 2]);
  });

  it("ranks a reference above everything, whatever state it is in", () => {
    const frames: readonly Frame[] = [
      { index: 0, key: "0", state: "saved", isReference: false },
      { index: 1, key: "1", state: "flagged", isReference: true },
    ];

    expect(sortedOrder(frames)).toEqual([1, 0]);
  });
});

describe("a new propagation run (RULE-076)", () => {
  it("works the rule card's example", () => {
    // 5 saved, 6 flagged, 7 reference, 8 skipped: 5 and 6 become pending, 7 stays reference,
    // 8 stays skipped.
    const after = resetForPropagation(timeline("saved", "flagged", "reference", "skipped"));

    expect(after.map((f) => f.state)).toEqual(["pending", "pending", "pending", "skipped"]);
    expect(after[2]!.isReference).toBe(true);
  });

  it("resets SAVED frames, which is deliberate", () => {
    // A saved frame is one whose file is on disk; re-running propagation over it is something
    // users do when the first run was seeded badly. The file is untouched -- only the timeline's
    // idea of what this run has done.
    expect(resetForPropagation(timeline("saved"))[0]!.state).toBe("pending");
  });

  it("leaves a reference frame's STATE alone as well as its role", () => {
    // The difference RULE-055's answer makes. In legacy a saved reference had already stopped
    // being a reference by this point, so this reset would clear it and propagation could then
    // overwrite the ground truth it was seeded from.
    const frames: readonly Frame[] = [{ index: 0, key: "0", state: "saved", isReference: true }];

    expect(resetForPropagation(frames)[0]).toEqual(frames[0]);
  });
});

describe("Clear Flags (RULE-076)", () => {
  it("resets SKIPPED frames, which a propagation run does not", () => {
    // The whole difference between the two. A frame skipped for a size mismatch becomes pending
    // again, so the next run tries it and skips it once more -- harmless, and it is what a user
    // who fixed the offending image expects.
    expect(clearFlags(timeline("skipped"))[0]!.state).toBe("pending");
    expect(resetForPropagation(timeline("skipped"))[0]!.state).toBe("skipped");
  });

  it("resets saved and flagged frames too", () => {
    const after = clearFlags(timeline("saved", "flagged", "propagated"));

    expect(after.map((f) => f.state)).toEqual(["pending", "pending", "pending"]);
  });

  it("leaves references alone", () => {
    expect(clearFlags(timeline("reference"))[0]!.isReference).toBe(true);
  });
});

describe("navigation wraps (RULE-072)", () => {
  it("goes to the next flagged frame", () => {
    expect(step(timeline("pending", "flagged", "pending", "flagged"), 0, "flagged")).toBe(1);
  });

  it("WRAPS from the last flagged frame to the first", () => {
    // Non-wrapping looks identical until a user reaches the end of a long sequence and the key
    // stops working with no explanation.
    expect(step(timeline("flagged", "pending", "flagged"), 2, "flagged")).toBe(0);
  });

  it("returns to the same frame when it is the only one flagged", () => {
    // Legacy's behaviour, and it is the honest answer: there is nowhere else to go.
    expect(step(timeline("pending", "flagged", "pending"), 1, "flagged")).toBe(1);
  });

  it("goes backwards too", () => {
    expect(step(timeline("flagged", "pending", "flagged"), 2, "flagged", -1)).toBe(0);
  });

  it("wraps backwards", () => {
    expect(step(timeline("flagged", "pending", "pending"), 0, "flagged", -1)).toBe(0);
  });

  it("finds references", () => {
    expect(step(timeline("pending", "reference", "pending"), 0, "reference")).toBe(1);
  });

  it("does NOT stop on a reference while looking for flagged work", () => {
    // A reference's role is what it is; N should not stop on ground truth while looking for
    // something to fix.
    const frames: readonly Frame[] = [
      { index: 0, key: "0", state: "pending", isReference: false },
      { index: 1, key: "1", state: "flagged", isReference: true },
      { index: 2, key: "2", state: "flagged", isReference: false },
    ];

    expect(step(frames, 0, "flagged")).toBe(2);
  });

  it("answers null when nothing matches, which is not the same as staying put", () => {
    expect(step(timeline("pending", "pending"), 0, "flagged")).toBeNull();
  });

  it("answers null on an empty timeline", () => {
    expect(step([], 0, "flagged")).toBeNull();
  });
});

describe("the counts above the timeline", () => {
  it("counts each state and the references separately", () => {
    const frames: readonly Frame[] = [
      { index: 0, key: "0", state: "saved", isReference: true },
      { index: 1, key: "1", state: "flagged", isReference: false },
      { index: 2, key: "2", state: "pending", isReference: false },
    ];

    const counts = summarize(frames);

    expect(counts.total).toBe(3);
    // The saved reference counts in BOTH, because it is both.
    expect(counts.references).toBe(1);
    expect(counts.byState.saved).toBe(1);
    expect(counts.byState.flagged).toBe(1);
  });
});

describe("the colours (RULE-072)", () => {
  it("paints a reference gold whatever state it is in", () => {
    const frames: readonly Frame[] = [{ index: 0, key: "0", state: "saved", isReference: true }];

    expect(colourOf(frames[0]!)).toEqual([255, 193, 7]);
  });

  it("paints legacy's exact colours, because a user reads the timeline by colour first", () => {
    expect(colourOf(timeline("flagged")[0]!)).toEqual([244, 67, 54]);
    expect(colourOf(timeline("propagated")[0]!)).toEqual([76, 175, 80]);
    expect(colourOf(timeline("saved")[0]!)).toEqual([0, 188, 212]);
    expect(colourOf(timeline("suggested")[0]!)).toEqual([156, 39, 176]);
    expect(colourOf(timeline("skipped")[0]!)).toEqual([139, 69, 19]);
  });
});
