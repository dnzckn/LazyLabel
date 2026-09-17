/**
 * `findExternalContours` against OpenCV 4.12.0.
 *
 * The assertions compare whole contour lists with `toEqual`, so a difference in the
 * ORDER of the contours fails just as loudly as a difference in a coordinate - which is
 * the point: the exported annotation file records that order.
 */

import { describe, expect, it } from "vitest";

import {
  findExternalContours,
  findExternalContoursDense,
} from "../../src/geometry/contours.js";
import { corpus, decodeMask } from "./corpus.js";

describe("corpus provenance", () => {
  it("was generated against OpenCV 4.12.0", () => {
    expect(corpus.opencv).toBe("4.12.0");
    expect(corpus.masks.length).toBeGreaterThanOrEqual(300);
  });
});

describe("findExternalContours (CHAIN_APPROX_SIMPLE)", () => {
  for (const kase of corpus.masks) {
    it(kase.name, () => {
      const mask = decodeMask(kase.height, kase.width, kase.mask);
      expect(findExternalContours(mask)).toEqual(kase.contours.map((c) => c.points));
    });
  }
});

describe("findExternalContours (CHAIN_APPROX_NONE)", () => {
  for (const kase of corpus.masks) {
    it(kase.name, () => {
      const mask = decodeMask(kase.height, kase.width, kase.mask);
      expect(findExternalContoursDense(mask)).toEqual(kase.contoursNone);
    });
  }
});

describe("enumeration order is observable", () => {
  it("returns the lower island first, as goldens/split-segment-two-islands records", () => {
    const kase = corpus.masks.find((m) => m.name === "split-segment-two-islands-fixture");
    expect(kase).toBeDefined();
    const contours = findExternalContours(decodeMask(kase!.height, kase!.width, kase!.mask));
    expect(contours).toHaveLength(2);
    // The island at y=100..119 is discovered second but returned first.
    expect(contours[0]![0]).toEqual([300, 100]);
    expect(contours[1]![0]).toEqual([10, 10]);
  });

  it("returns the second single pixel first, as goldens/single-pixel-objects records", () => {
    const kase = corpus.masks.find((m) => m.name === "single-pixel-objects-fixture");
    expect(kase).toBeDefined();
    const contours = findExternalContours(decodeMask(kase!.height, kase!.width, kase!.mask));
    expect(contours).toEqual([[[12, 9]], [[3, 3]]]);
  });
});
