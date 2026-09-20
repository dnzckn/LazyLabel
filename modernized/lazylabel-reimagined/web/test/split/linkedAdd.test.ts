/**
 * What the other image gets when one annotation is drawn in this one.
 *
 * Mostly a test of the refusals. A linked operation that quietly did something slightly different
 * in the second image is the failure the whole arrangement exists to avoid — the user is looking
 * at the first image when they draw, and would find out at export.
 */

import { describe, expect, it } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { linkedAdd } from "../../src/split/linkedAdd.js";

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
    expect(result.reason).toMatch(/does not fit the other image/);
    expect(result.reason).toMatch(/50x100/);
  });

  it("carries a mask when the two images are the same size", () => {
    const result = linkedAdd({ segment: masked(0), aliases: {}, size: SAME }, empty);

    expect(result.kind).toBe("linked");
    if (result.kind !== "linked") return;
    expect(result.segment.mask).toEqual({ width: 100, height: 100, data: "abc" });
  });

  it("refuses a mask between images of different sizes, and says what to do instead", () => {
    // Resampling would change which pixels are covered; cropping is the clamping a polygon is
    // already refused for. Either way the second image would hold a different object.
    const result = linkedAdd(
      { segment: masked(0), aliases: {}, size: SAME },
      { ...empty, size: SMALL },
    );

    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.reason).toMatch(/mask cannot be linked between images of different sizes/);
    expect(result.reason).toMatch(/draw it as a polygon/);
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
