/**
 * RULE-019, as answered on 2026-09-19: merge targets the lowest SELECTED class, never the active one.
 */

import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { merge, mergeTarget } from "../../src/tools/merge.js";

const of = (...ids: (number | null)[]): WireSegment[] =>
  ids.map((classId) => ({ type: "Polygon", classId }) as WireSegment);

describe("which class a merge targets", () => {
  it("is the lowest among the selection", () => {
    expect(mergeTarget(of(5, 2, 9), [0, 1, 2])).toBe(2);
  });

  it("looks only at the SELECTED segments, not the whole image", () => {
    // Class 0 exists but is not selected, so it does not win.
    expect(mergeTarget(of(0, 5, 9), [1, 2])).toBe(5);
  });

  it("treats class 0 as a real class", () => {
    expect(mergeTarget(of(0, 3), [0, 1])).toBe(0);
  });

  it("skips unclassified segments rather than treating them as class 0", () => {
    // null means unclassified. Letting it win would drag everything selected down to a class
    // nothing actually had.
    expect(mergeTarget(of(null, 4, 7), [0, 1, 2])).toBe(4);
  });

  it("falls back to the next free id when nothing selected has a class", () => {
    expect(mergeTarget(of(null, null, 6), [0, 1])).toBe(7);
  });

  it("falls back for an empty selection too", () => {
    expect(mergeTarget(of(2), [])).toBe(3);
  });
});

describe("applying a merge", () => {
  it("moves every selected segment to the target", () => {
    const result = merge(of(5, 2, 9), [0, 1, 2]);

    expect(result.segments.map((s) => s.classId)).toEqual([2, 2, 2]);
    expect(result.classId).toBe(2);
  });

  it("leaves unselected segments alone", () => {
    const result = merge(of(5, 2, 9), [0, 1]);

    expect(result.segments.map((s) => s.classId)).toEqual([2, 2, 9]);
  });

  it("reports only what actually changed", () => {
    // The one already at the target is not a change, so "3 segments moved" would overstate it.
    const result = merge(of(2, 5, 2), [0, 1, 2]);

    expect(result.changed).toEqual([1]);
  });

  it("does not combine the shapes", () => {
    // Merge changes the class of several annotations; it does not fuse them. Nothing is deleted
    // and no pixels move.
    const before = of(5, 2);
    const result = merge(before, [0, 1]);

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.type).toBe("Polygon");
  });

  it("leaves the original list untouched", () => {
    const before = of(5, 2);
    merge(before, [0, 1]);

    expect(before[0]?.classId).toBe(5);
  });

  it("ignores a selected index that is not there", () => {
    const result = merge(of(3, 8), [0, 99]);

    expect(result.segments.map((s) => s.classId)).toEqual([3, 8]);
  });

  it("gives an unclassified selection a class rather than leaving it null", () => {
    const result = merge(of(null, null), [0, 1]);

    expect(result.segments.map((s) => s.classId)).toEqual([0, 0]);
  });
});
