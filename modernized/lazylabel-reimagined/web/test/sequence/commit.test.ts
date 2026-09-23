/**
 * What a propagated frame becomes — RULE-060's commit and RULE-081's skip, one case at a time.
 *
 * `acceptance/c11.goldens.test.tsx` holds the whole of it against legacy's own sequence mode; these
 * pin each branch on its own, so that when the golden disagrees the failure says which rule moved.
 */

import { describe, expect, it } from "vitest";

import type { WirePropagationFrame } from "../../src/api/client.js";
import { commitFrame, scoreOf, type CommitPolicy } from "../../src/sequence/commit.js";

const MASK = { height: 8, width: 8, box: [1, 1, 3, 3], data: btoa("\u0001".repeat(4)) };
const EMPTY = { height: 8, width: 8, box: null, data: "" };

function result(objectId: number, confidence: number, mask: unknown = MASK): WirePropagationFrame {
  return { source: "clip/f05.png", objectId, mask, confidence } as WirePropagationFrame;
}

function policy(overrides: Partial<CommitPolicy> = {}): CommitPolicy {
  return { keepFlagged: false, skip: new Set(), references: new Set(), ...overrides };
}

const KEY = "clip/f05.png";

describe("the reference frame", () => {
  it("is the user's own drawing, and the run's version of it is ignored", () => {
    // Legacy's engine does not even report it (`propagation_manager.py:744-749`); the port's
    // runner does, because the forward walk opens on it.
    const committed = commitFrame(KEY, [result(1, 0.2)], policy({ references: new Set([KEY]) }), 0.99);

    expect(committed).toEqual({ kind: "reference" });
  });
});

describe("Skip Labeled (RULE-081)", () => {
  it("keeps the frame's own labels whatever the model said", () => {
    const committed = commitFrame(KEY, [result(1, 0.999)], policy({ skip: new Set([KEY]) }), 0.99);

    expect(committed).toEqual({ kind: "skipped", painted: true });
  });

  it("wins over a flag: a labelled frame is never reported for review", () => {
    // Legacy checks the skip set before it buffers anything, so frame 2 of the golden -- flagged at
    // 0.975 in every other scenario -- is brown, not red, when it is labelled.
    const committed = commitFrame(KEY, [result(1, 0.5)], policy({ skip: new Set([KEY]) }), 0.99);

    expect(committed.kind).toBe("skipped");
  });

  it("is only PAINTED when the model produced a mask for the frame", () => {
    // Legacy's brown comes from a result arriving; a frame every object left gets none, and stays
    // grey -- its labels kept either way.
    const committed = commitFrame(KEY, [result(1, 0, EMPTY)], policy({ skip: new Set([KEY]) }), 0.99);

    expect(committed).toEqual({ kind: "skipped", painted: false });
  });
});

describe("a frame every object left (RULE-060)", () => {
  it("is never committed, rather than committed at zero", () => {
    const committed = commitFrame(KEY, [result(1, 0, EMPTY), result(2, 0, EMPTY)], policy(), 0.99);

    expect(committed).toEqual({ kind: "empty" });
  });
});

describe("Keep Flagged Masks (RULE-060)", () => {
  const partial = [result(1, 0.999), result(2, 0.97)];

  it("OFF: a frame where one object fails keeps no masks at all, the passing one included", () => {
    const committed = commitFrame(KEY, partial, policy({ keepFlagged: false }), 0.99);

    expect(committed).toEqual({ kind: "scored", score: 0.97, flagged: true, kept: [] });
  });

  it("ON: it keeps every object with pixels, the failing one included, for review", () => {
    const committed = commitFrame(KEY, partial, policy({ keepFlagged: true }), 0.99);

    expect(committed).toMatchObject({ kind: "scored", flagged: true });
    expect(committed.kind === "scored" && committed.kept.map((r) => r.objectId)).toEqual([1, 2]);
  });

  it("does not touch a frame that passes", () => {
    const committed = commitFrame(KEY, [result(1, 0.999), result(2, 0.995)], policy(), 0.99);

    expect(committed).toMatchObject({ kind: "scored", score: 0.995, flagged: false });
    expect(committed.kind === "scored" && committed.kept).toHaveLength(2);
  });

  it("scores exactly at Min Conf as a pass -- strictly below flags", () => {
    const committed = commitFrame(KEY, [result(1, 0.99)], policy(), 0.99);

    expect(committed).toMatchObject({ kind: "scored", flagged: false });
  });
});

describe("an object that left the frame beside one that did not", () => {
  it("is dropped from the minimum and from the kept masks, not counted as zero", () => {
    // Frames 20-23 of the golden: the square has gone, the disc is fine, and the frame is saved
    // with the disc alone.
    const committed = commitFrame(KEY, [result(1, 0.9995), result(2, 0, EMPTY)], policy(), 0.99);

    expect(committed).toMatchObject({ kind: "scored", score: 0.9995, flagged: false });
    expect(committed.kind === "scored" && committed.kept.map((r) => r.objectId)).toEqual([1]);
  });
});

describe("what counts as empty", () => {
  it("is the contract's `box: null`, and a box with no area", () => {
    expect(scoreOf(result(1, 0.5, EMPTY)).empty).toBe(true);
    expect(scoreOf(result(1, 0.5, { ...MASK, box: [0, 0, -1, -1] })).empty).toBe(true);
    expect(scoreOf(result(1, 0.5)).empty).toBe(false);
  });
});
