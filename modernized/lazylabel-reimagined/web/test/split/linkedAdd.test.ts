/**
 * What the other image gets when one annotation is drawn in this one.
 *
 * Mostly a test of the refusals. A linked operation that quietly did something slightly different
 * in the second image is the failure the whole arrangement exists to avoid — the user is looking
 * at the first image when they draw, and would find out at export.
 */

import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { linkedAdd, linkedErase } from "../../src/split/linkedAdd.js";

const SAME = { width: 100, height: 100 };
const SMALL = { width: 50, height: 100 };

function polygon(classId: number | null, vertices: readonly (readonly [number, number])[]): WireSegment {
  return { type: "Polygon", classId, vertices } as unknown as WireSegment;
}

function masked(classId: number): WireSegment {
  return {
    type: "AI",
    classId,
    mask: { width: 100, height: 100, data: "abc" },
  } as unknown as WireSegment;
}

const empty = { segments: [] as readonly WireSegment[], aliases: {}, size: SAME };

describe("mirroring the geometry", () => {
  it("puts the shape at the SAME pixels", () => {
    const result = linkedAdd(
      { segment: polygon(0, [[10, 10], [20, 10], [20, 20]]), aliases: {}, size: SAME },
      empty,
    );

    expect(result.kind).toBe("linked");
    if (result.kind !== "linked") return;
    expect(result.segment.vertices).toEqual([[10, 10], [20, 10], [20, 20]]);
  });

  it("refuses a shape that does not fit, as a unit", () => {
    // A polygon missing one vertex is a DIFFERENT polygon, not a partial one.
    const result = linkedAdd(
      { segment: polygon(0, [[10, 10], [80, 10], [80, 20]]), aliases: {}, size: SAME },
      { ...empty, size: SMALL },
    );

    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.reason).toMatch(/outside the other image/);
    expect(result.reason).toMatch(/50x100/);
  });

  it("carries a mask when the two images are the same size", () => {
    const result = linkedAdd({ segment: masked(0), aliases: {}, size: SAME }, empty);

    expect(result.kind).toBe("linked");
    if (result.kind !== "linked") return;
    expect(result.segment.mask).toEqual({ width: 100, height: 100, data: "abc" });
  });

  it("refuses a mask between images of different sizes", () => {
    // Resampling would change which pixels are covered; cropping is the clamping a polygon is
    // already refused for. Either way the second image would hold a different object. What to do
    // instead -- a polygon, or this side on its own -- is the code's comment since 2026-09-26.
    const result = linkedAdd(
      { segment: masked(0), aliases: {}, size: SAME },
      { ...empty, size: SMALL },
    );

    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.reason).toBe("a mask cannot be linked between images of different sizes");
  });

  it("refuses an annotation with no geometry at all", () => {
    const result = linkedAdd(
      { segment: { type: "Polygon", classId: 0 } as unknown as WireSegment, aliases: {}, size: SAME },
      empty,
    );

    expect(result.kind).toBe("refused");
  });
});

describe("agreeing on the class", () => {
  it("gives the other image its OWN id for the same name", () => {
    // Decision 6: class ids are per image. Copying the number across would produce matching
    // numbers meaning different things, which is worse than a visible mismatch because every
    // export then looks consistent.
    const result = linkedAdd(
      { segment: polygon(0, [[1, 1], [2, 2]]), aliases: { "0": "car" }, size: SAME },
      { ...empty, aliases: { "0": "tree", "1": "car" }, segments: [polygon(0, [[0, 0]])] },
    );

    expect(result.kind).toBe("linked");
    if (result.kind !== "linked") return;
    expect(result.segment.classId).toBe(1);
    expect(result.allocated).toBe(false);
    // Nothing to write: it already knew the name.
    expect(result.aliases).toEqual({ "0": "tree", "1": "car" });
  });

  it("allocates an id and records the name when the other image has never seen it", () => {
    const result = linkedAdd(
      { segment: polygon(0, [[1, 1], [2, 2]]), aliases: { "0": "car" }, size: SAME },
      { ...empty, aliases: { "0": "tree" }, segments: [polygon(0, [[0, 0]])] },
    );

    expect(result.kind).toBe("linked");
    if (result.kind !== "linked") return;
    expect(result.segment.classId).toBe(1);
    expect(result.allocated).toBe(true);
    expect(result.aliases).toEqual({ "0": "tree", "1": "car" });
  });

  it("shares the NUMBER when the class has no name, because then the id IS the name", () => {
    const result = linkedAdd(
      { segment: polygon(3, [[1, 1], [2, 2]]), aliases: {}, size: SAME },
      { ...empty, segments: [polygon(0, [[0, 0]])] },
    );

    expect(result.kind).toBe("linked");
    if (result.kind !== "linked") return;
    expect(result.segment.classId).toBe(3);
    expect(result.aliases).toEqual({});
  });

  it("refuses an annotation with no class", () => {
    // Nothing to agree about, and copying it would put a second unclassified object in an image
    // the user was not looking at.
    const result = linkedAdd(
      { segment: polygon(null, [[1, 1], [2, 2]]), aliases: {}, size: SAME },
      empty,
    );

    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.reason).toMatch(/no class/);
  });
});

describe("the rest of the segment", () => {
  it("keeps everything the source segment had, beyond the class and the geometry", () => {
    const source = { type: "Circle", classId: 0, vertices: [[1, 1]], extra: "kept" };
    const result = linkedAdd(
      { segment: source as unknown as WireSegment, aliases: {}, size: SAME },
      empty,
    );

    expect(result.kind).toBe("linked");
    if (result.kind !== "linked") return;
    expect(result.segment.type).toBe("Circle");
    expect((result.segment as unknown as Record<string, unknown>)["extra"]).toBe("kept");
  });
});

describe("an eraser carried to the other image (RULE-092)", () => {
  it("lands at the SAME pixels", () => {
    const result = linkedErase(polygon(null, [[10, 10], [20, 10], [20, 20]]), SAME, SAME);

    expect(result.kind).toBe("linked");
    if (result.kind !== "linked") return;
    expect(result.eraser.vertices).toEqual([[10, 10], [20, 10], [20, 20]]);
  });

  it("needs no class, unlike an annotation", () => {
    // An eraser removes pixels whatever class they belong to: there is no name to agree on, so the
    // refusal an unclassified ANNOTATION gets would be wrong here.
    expect(linkedAdd({ segment: polygon(null, [[1, 1], [5, 1], [5, 5]]), aliases: {}, size: SAME }, empty).kind)
      .toBe("refused");
    expect(linkedErase(polygon(null, [[1, 1], [5, 1], [5, 5]]), SAME, SAME).kind).toBe("linked");
  });

  it("is refused as a unit when it does not fit, rather than moved", () => {
    const result = linkedErase(polygon(null, [[10, 10], [80, 10], [80, 20]]), SAME, SMALL);

    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.reason).toMatch(/outside the other image/);
  });

  it("carries a mask only between images of one size", () => {
    expect(linkedErase(masked(0), SAME, SAME).kind).toBe("linked");

    const across = linkedErase(masked(0), SAME, SMALL);
    expect(across.kind).toBe("refused");
    if (across.kind !== "refused") return;
    expect(across.reason).toMatch(/different sizes/);
  });
});
