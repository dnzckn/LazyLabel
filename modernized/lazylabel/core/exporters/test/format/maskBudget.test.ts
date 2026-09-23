/**
 * SEC-06: no reader may allocate without a bound.
 *
 * Every object a reader builds is a FULL-IMAGE mask, so what a file costs is objects x pixels. The
 * limits module had a per-object limit and a per-image limit -- and `assertObjects` had no caller at
 * all, while `assertPixels` was called by one reader of six. The text formats checked neither.
 *
 * The assessment's own example is the first case below: a 450 KB YOLO Segmentation file of 20,000
 * polygons beside a 12-megapixel image. That asks for about 240 GB. Before this, the reader would
 * have started allocating and the API process would have died partway through.
 *
 * Each refusal is also timed, because WHEN matters as much as whether. A limit checked after the
 * masks are built has already cost what it exists to prevent.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_LIMITS, assertMaskBudget } from "../../src/limits.js";
import { parseCoco } from "../../src/format/coco.js";
import { parseYoloSegmentation } from "../../src/format/yoloSegmentation.js";

/** One small triangle per line, in normalized YOLO coordinates. */
function yoloPolygons(count: number): string {
  return Array.from({ length: count }, () => "0 0.10 0.10 0.20 0.10 0.15 0.20").join("\n");
}

/** Refused, and quickly: under a second means no mask was built on the way to the answer. */
function refusedFast(parse: () => unknown): void {
  const started = performance.now();
  expect(parse).toThrow(/GiB of masks|objects, over/);
  expect(performance.now() - started).toBeLessThan(1000);
}

describe("the assessment's own example", () => {
  it("refuses 20,000 polygons beside a 12-megapixel image, before allocating", () => {
    // ~450 KB of text asking for ~240 GB. The shape of a denial of service that fits in an email.
    const text = yoloPolygons(20_000);

    refusedFast(() => parseYoloSegmentation(text, [3000, 4000]));
  });
});

describe("every reader that builds one mask per object", () => {
  it("YOLO Segmentation", () => {
    refusedFast(() => parseYoloSegmentation(yoloPolygons(5_000), [4000, 4000]));
  });

  it("COCO", () => {
    const annotations = Array.from({ length: 5_000 }, (_unused, index) => ({
      id: index,
      category_id: 1,
      segmentation: [[10, 10, 20, 10, 15, 20]],
    }));
    const text = JSON.stringify({
      images: [{ id: 1, width: 4000, height: 4000 }],
      categories: [{ id: 1, name: "cell" }],
      annotations,
    });

    refusedFast(() => parseCoco(text, [4000, 4000]));
  });
});

describe("what is still allowed", () => {
  it("an ordinary file loads exactly as before", () => {
    // The limit must not refuse real work, or it will be switched off the first time it does.
    const loaded = parseYoloSegmentation(yoloPolygons(3), [100, 100]);

    expect(loaded.segments.length).toBeGreaterThan(0);
  });

  it("a few hundred objects on a large image is inside the budget", () => {
    // 350 objects on 12 MP is ~4 GiB, the documented ceiling. 300 is comfortably inside it.
    expect(() => assertMaskBudget(300, 3000, 4000)).not.toThrow();
  });
});

describe("the budget itself", () => {
  it("bounds the PRODUCT, which neither per-limit check does on its own", () => {
    // Both of these individually pass: 50,000 objects is under maxObjects, and 100 MP is at
    // maxPixels. Together they are five terabytes of masks.
    expect(50_000).toBeLessThanOrEqual(DEFAULT_LIMITS.maxObjects);
    expect(10_000 * 10_000).toBeLessThanOrEqual(DEFAULT_LIMITS.maxPixels);

    expect(() => assertMaskBudget(50_000, 10_000, 10_000)).toThrow(/GiB of masks/);
  });

  it("still applies the object limit that nothing used to call", () => {
    expect(() => assertMaskBudget(DEFAULT_LIMITS.maxObjects + 1, 1, 1)).toThrow(/objects, over/);
  });

  it("still applies the pixel limit", () => {
    expect(() => assertMaskBudget(1, 20_000, 20_000)).toThrow(/pixels, over/);
  });

  it("says how much it would have cost, so the refusal can be judged", () => {
    expect(() => assertMaskBudget(20_000, 3000, 4000)).toThrow(/223\.5 GiB/);
  });
});
