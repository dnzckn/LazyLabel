/**
 * Which class a new annotation gets, including the two ways it goes wrong quietly.
 */

import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { classForNewSegment, nextClassId, reassignClassIds } from "../../src/workspace/classes.js";

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

describe("renumbering classes from the table order (RULE-013)", () => {
  it("works the card's example", () => {
    // Rows ordered 7, 2, 5 after dragging; aliases {7:'car', 2:'person'}.
    const result = reassignClassIds(of(7, 2, 5), { "7": "car", "2": "person" }, [7, 2, 5]);

    expect(result.segments.map((s) => s.classId)).toEqual([0, 1, 2]);
    expect(result.aliases).toEqual({ "0": "car", "1": "person" });
  });

  it("gives the order's position, not the sorted position", () => {
    // The whole point: the table's order is what the exported channel order follows.
    expect(reassignClassIds(of(1, 2, 3), {}, [3, 1, 2]).segments.map((s) => s.classId)).toEqual([1, 2, 0]);
  });

  it("leaves unclassified segments alone", () => {
    expect(reassignClassIds(of(null, 5), {}, [5]).segments.map((s) => s.classId)).toEqual([null, 0]);
  });

  it("KEEPS the old id of a class the order does not mention, and says it collides", () => {
    // Legacy's silent defect. Class 9 is not in the order, so it keeps id 9; but 9 is also what
    // the tenth row would have become -- here the order gives out 0 and 1, so no collision. Make
    // one: class 1 is absent from the order and 1 is handed to the second row.
    const result = reassignClassIds(of(7, 2, 1), {}, [7, 2]);

    expect(result.segments.map((s) => s.classId)).toEqual([0, 1, 1]);
    expect(result.collisions).toEqual([1]);
  });

  it("does not claim a collision when the kept id is free", () => {
    const result = reassignClassIds(of(7, 2, 9), {}, [7, 2]);

    expect(result.segments.map((s) => s.classId)).toEqual([0, 1, 9]);
    expect(result.collisions).toEqual([]);
  });

  it("drops an alias whose class is not in the order, and names it", () => {
    // A name the user typed disappears because nothing currently carries that class. Legacy does
    // this without a word.
    const result = reassignClassIds(of(7), { "7": "car", "4": "bicycle" }, [7]);

    expect(result.aliases).toEqual({ "0": "car" });
    expect(result.droppedAliases).toEqual(["bicycle"]);
  });

  it("ignores a repeated id in the order rather than renumbering twice", () => {
    const result = reassignClassIds(of(5, 8), {}, [5, 5, 8]);

    expect(result.segments.map((s) => s.classId)).toEqual([0, 1]);
  });

  it("leaves the original segments untouched", () => {
    const before = of(7, 2);
    reassignClassIds(before, {}, [7, 2]);

    expect(before.map((s) => s.classId)).toEqual([7, 2]);
  });

  it("does nothing useful with an empty order, and does not crash", () => {
    const result = reassignClassIds(of(3, 4), { "3": "a" }, []);

    expect(result.segments.map((s) => s.classId)).toEqual([3, 4]);
    expect(result.droppedAliases).toEqual(["a"]);
  });
});
