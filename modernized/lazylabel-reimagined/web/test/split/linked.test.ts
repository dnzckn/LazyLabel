/**
 * Linked operations across a split view — RULE-092 and decision 8.
 *
 * The case worth reading first is "agrees on the NAME even when the ids differ". That is the whole
 * rule: decision 6 keeps class ids per image, so copying the number across a pair produces matching
 * numbers that mean different things — which is worse than a visible mismatch, because every export
 * then looks consistent.
 */

import { describe, expect, it } from "vitest";

import {
  describePair,
  mirror,
  mirrorShape,
  nextFreeId,
  resolveClass,
} from "../../src/split/linked.js";

describe("resolving a class in the other image", () => {
  it("uses the id that ALIAS already has there, not the source's id", () => {
    // "car" is 1 on the left and 4 on the right. A linked operation makes one object, so both must
    // call it "car" -- and on the right that means id 4.
    const assignment = resolveClass(
      { alias: "car", sourceId: 1 },
      { "4": "car", "0": "sky" },
      [0, 4],
    );

    expect(assignment).toEqual({ classId: 4, alias: null, allocated: false });
  });

  it("allocates the other image's next free id when the name is new there", () => {
    const assignment = resolveClass({ alias: "car", sourceId: 1 }, { "0": "sky" }, [0, 2]);

    // 3, not 1: the source's id is irrelevant to what is free here.
    expect(assignment).toEqual({ classId: 3, alias: "car", allocated: true });
  });

  it("records the alias only when it had to allocate", () => {
    // Writing an alias that is already there is harmless and writing one that is not is required;
    // the flag is what tells the caller which happened, so it can report a new class.
    const known = resolveClass({ alias: "car", sourceId: 1 }, { "4": "car" }, [4]);
    const fresh = resolveClass({ alias: "car", sourceId: 1 }, {}, [0]);

    expect(known.alias).toBeNull();
    expect(fresh.alias).toBe("car");
  });

  it("CARRIES the number when the class has no name", () => {
    // Legacy writes str(class_id), so an unnamed class IS its number -- the two images have to
    // share it, and allocating a different one would be the same bug in a different place.
    const assignment = resolveClass({ alias: null, sourceId: 7 }, {}, [0, 1]);

    expect(assignment).toEqual({ classId: 7, alias: null, allocated: false });
  });

  it("treats an empty name as no name", () => {
    // A blank alias would export as "" where the id belongs, which looks like a name and is not.
    expect(resolveClass({ alias: "", sourceId: 7 }, {}, []).classId).toBe(7);
  });

  it("agrees on the NAME even when the ids differ, which is the point", () => {
    const left = { "1": "car" };
    const right = { "4": "car" };

    const onLeft = resolveClass({ alias: "car", sourceId: 1 }, left, [1]);
    const onRight = resolveClass({ alias: "car", sourceId: 1 }, right, [4]);

    expect(onLeft.classId).not.toBe(onRight.classId);
    expect(left[String(onLeft.classId) as "1"]).toBe(right[String(onRight.classId) as "4"]);
  });
});

describe("the next free id", () => {
  it("is the highest present plus one", () => {
    expect(nextFreeId(new Set([0, 1, 4]))).toBe(5);
  });

  it("is zero on an empty image, which is why datasets are zero-based", () => {
    expect(nextFreeId(new Set())).toBe(0);
  });

  it("counts NAMED ids even when nothing is annotated with them", () => {
    // Otherwise the new object is handed an id that already has a name attached, and silently
    // inherits it.
    expect(nextFreeId(new Set([0]), { "5": "car" })).toBe(6);
  });

  it("ignores an alias key that is not a number", () => {
    expect(nextFreeId(new Set([1]), { car: "car" })).toBe(2);
  });
});

describe("mirroring a point", () => {
  const TARGET = { width: 100, height: 50 };

  it("uses the SAME PIXEL, not the same relative position", () => {
    // A decision, not a lookup: RULE-092 says "the same coordinates" and is silent on size. Same
    // pixel, because a split view pairs two images of one subject and a relative mapping would
    // stretch a drawn shape exactly when the sizes differ.
    expect(mirror({ x: 90, y: 40 }, TARGET)).toEqual({ kind: "point", x: 90, y: 40 });
  });

  it("REPORTS a point outside rather than clamping it", () => {
    // Clamping puts a vertex on an edge the user did not click, and makes a mirrored polygon
    // quietly the wrong shape.
    const out = mirror({ x: 120, y: 10 }, TARGET);

    expect(out.kind).toBe("outside");
    if (out.kind !== "outside") throw new Error("expected outside");
    expect(out.reason).toContain("100x50");
  });

  it("treats the far edge as outside, because width is not a valid coordinate", () => {
    expect(mirror({ x: 100, y: 0 }, TARGET).kind).toBe("outside");
    expect(mirror({ x: 99, y: 49 }, TARGET).kind).toBe("point");
  });

  it("refuses a negative coordinate", () => {
    expect(mirror({ x: -1, y: 0 }, TARGET).kind).toBe("outside");
  });
});

describe("mirroring a shape", () => {
  const TARGET = { width: 100, height: 50 };

  it("carries every vertex through", () => {
    const out = mirrorShape([[1, 1], [50, 1], [50, 30]], TARGET);

    expect(out).toEqual({ kind: "shape", vertices: [[1, 1], [50, 1], [50, 30]] });
  });

  it("refuses the WHOLE shape when one vertex falls outside", () => {
    // All or nothing: a polygon missing one vertex is a different polygon, not a partial one, and
    // silently producing a different shape in the second image is what this file exists to stop.
    const out = mirrorShape([[1, 1], [500, 1], [50, 30]], TARGET);

    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") throw new Error("expected refused");
    expect(out.reason).toContain("does not fit");
  });
});

describe("describing a pair", () => {
  it("says nothing when the images match", () => {
    expect(describePair({ width: 10, height: 10 }, { width: 10, height: 10 })).toBeNull();
  });

  it("explains a size difference without preventing the pairing", () => {
    // A user comparing a full frame with a crop of it has a real reason to pair them; the smaller
    // one simply refuses what falls outside, per operation.
    const note = describePair({ width: 100, height: 50 }, { width: 80, height: 50 });

    expect(note).toContain("different sizes");
    expect(note).toContain("same pixel");
  });
});
