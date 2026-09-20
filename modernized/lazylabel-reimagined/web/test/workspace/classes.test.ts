/**
 * Which class a new annotation gets, including the two ways it goes wrong quietly.
 */

import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { classForNewSegment, nextClassId } from "../../src/workspace/classes.js";

const of = (...ids: (number | null)[]): WireSegment[] =>
  ids.map((classId) => ({ type: "Polygon", classId }) as WireSegment);

describe("the next free class id", () => {
  it("starts at zero on an unannotated image", () => {
    // Legacy's starting point, and why LazyLabel datasets are zero-based while many tools are not.
    expect(nextClassId([])).toBe(0);
  });

  it("is one past the highest in use", () => {
    expect(nextClassId(of(0, 1, 2))).toBe(3);
  });

  it("does NOT fill a gap left by a deleted class", () => {
    // max + 1, so deleting class 5 from {0,1,5} gives 6, not 2. Reusing 2 would hand a new object
    // the alias the deleted one had, and under decision 6 that alias travels with the file.
    expect(nextClassId(of(0, 1, 5))).toBe(6);
  });

  it("ignores segments with no class at all", () => {
    expect(nextClassId(of(null, 3, null))).toBe(4);
    expect(nextClassId(of(null, null))).toBe(0);
  });

  it("is not confused by the order they appear in", () => {
    expect(nextClassId(of(7, 2, 5))).toBe(8);
  });
});

describe("the class a new annotation takes", () => {
  it("uses the active class when one is set", () => {
    expect(classForNewSegment(of(0, 1), 1)).toBe(1);
  });

  it("treats class 0 as a real class, not as absent", () => {
    // The trap in any language where 0 is falsy. `activeClassId || nextClassId(...)` would send
    // every annotation drawn under class 0 to a brand new id instead.
    expect(classForNewSegment(of(0, 1, 2), 0)).toBe(0);
  });

  it("falls back to the next free id when no class is active", () => {
    expect(classForNewSegment(of(0, 1, 2), null)).toBe(3);
  });

  it("can hand out an id that is already in use, which is the point of an active class", () => {
    // Several objects of the same class is the normal case, not a collision.
    expect(classForNewSegment(of(4, 4, 4), 4)).toBe(4);
  });
});
