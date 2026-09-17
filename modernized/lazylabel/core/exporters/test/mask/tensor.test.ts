/**
 * The SHIPPED mask composition, tested directly.
 *
 * test/helpers/fixtures.ts deliberately reimplements this logic so the test INPUT stays independent
 * of the code under test. That independence left src/mask/tensor.ts itself untested: four P0 rules
 * were proven against the test-local copy, and any edit to the shipped path would have passed.
 *
 * Oracles here are goldens/manifest.json (pixel counts and shapes recorded from the legacy run) and
 * the golden export files themselves, reached by feeding the shipped contours into the writer.
 *
 * Rules: "Final per-class mask composition", "Pixel priority resolves overlapping classes",
 * "Crop is clamped to the image and blanks everything outside it on save", and the shape
 * rasterization rule. legacy: core/segment_manager.py:174-315, core/file_manager.py:712-739.
 */

import { describe, expect, it } from "vitest";

import { renderYoloSegmentation } from "../../src/format/yoloSegmentation.js";
import {
  applyCrop,
  applyPixelPriority,
  createFinalMaskTensor,
  createInstanceContours,
  rasterizeSegment,
} from "../../src/mask/tensor.js";
import type { Segment } from "../../src/types.js";
import {
  CASE_IDS,
  fixtureCase,
  manifestEntry,
  maskFromRects,
  normalizeEol,
  readGoldenRaw,
} from "../helpers/fixtures.js";

/** Build the case's segments from fixtures.json, using the shipped rasterizer for shapes. */
function segmentsOf(id: string): Segment[] {
  const testCase = fixtureCase(id);
  const [height, width] = testCase.imageSize;
  return testCase.segments.map((spec) => {
    if (spec.type === "AI" || spec.type === "Loaded") {
      return { type: spec.type, classId: spec.classId, mask: maskFromRects(height, width, spec.rects ?? []) };
    }
    return { type: spec.type, classId: spec.classId, vertices: spec.vertices ?? [] };
  });
}

function contextOf(id: string) {
  const testCase = fixtureCase(id);
  const imageSize = testCase.imageSize;
  const segments = segmentsOf(id);
  const classOrder = [...new Set(segments.map((s) => s.classId as number))].sort((a, b) => a - b);
  const priority = testCase.pixelPriority ?? { enabled: false, ascending: true };

  let tensor = createFinalMaskTensor(segments, imageSize, classOrder, priority);
  if (testCase.crop) tensor = applyCrop(tensor, testCase.crop);
  const instances = createInstanceContours(segments, imageSize, classOrder, tensor);
  return { testCase, imageSize, segments, classOrder, tensor, instances };
}

describe("mask composition, as shipped", () => {
  for (const id of CASE_IDS) {
    it(`matches the recorded legacy tensor for ${id}`, () => {
      const { tensor, classOrder } = contextOf(id);
      const manifest = manifestEntry(id);

      expect(classOrder).toEqual([...manifest.classOrder]);
      expect([tensor.height, tensor.width, tensor.classOrder.length]).toEqual([...manifest.maskShape]);
      expect(tensor.data.reduce((sum, v) => sum + v, 0)).toBe(manifest.maskSetPixels);
    });
  }

  for (const id of CASE_IDS) {
    it(`produces contours that write the golden polygons for ${id}`, () => {
      const { testCase, imageSize, classOrder, tensor, instances } = contextOf(id);
      const aliases = new Map(
        Object.entries(testCase.aliases ?? {}).map(([key, value]) => [Number(key), value as string]),
      );
      const produced = renderYoloSegmentation({
        imagePath: "image.png",
        imageSize,
        classOrder,
        classLabels: classOrder.map((classId) => aliases.get(classId) ?? String(classId)),
        classAliases: aliases,
        maskTensor: tensor,
        cropCoords: testCase.crop ?? null,
        instances,
      });
      expect(normalizeEol(produced ?? "")).toBe(normalizeEol(readGoldenRaw(id, "image_seg.txt")));
    });
  }

  it("keeps at most one class per pixel when priority is on", () => {
    const { tensor } = contextOf("overlap-pixel-priority-ascending");
    const channels = tensor.classOrder.length;
    for (let pixel = 0; pixel < tensor.height * tensor.width; pixel += 1) {
      let set = 0;
      for (let c = 0; c < channels; c += 1) if (tensor.data[pixel * channels + c]) set += 1;
      expect(set).toBeLessThanOrEqual(1);
    }
  });

  it("hands the overlap to the lowest class ascending and the highest descending", () => {
    const ascending = contextOf("overlap-pixel-priority-ascending").tensor;
    const descending = contextOf("overlap-pixel-priority-descending").tensor;
    const channels = ascending.classOrder.length;
    const overlapPixel = 25 * 50 + 25; // inside both rectangles of that fixture
    expect(ascending.data[overlapPixel * channels + 0]).toBe(1);
    expect(descending.data[overlapPixel * channels + channels - 1]).toBe(1);
  });

  it("leaves a pixel claimed by a single class untouched", () => {
    const off = contextOf("overlap-pixel-priority-off").tensor;
    const on = contextOf("overlap-pixel-priority-ascending").tensor;
    const channels = off.classOrder.length;
    const soloPixel = 12 * 50 + 12; // inside the first rectangle only
    expect(off.data[soloPixel * channels + 0]).toBe(1);
    expect(on.data[soloPixel * channels + 0]).toBe(1);
  });

  it("clears the image's last row and column on any crop", () => {
    const { tensor, testCase } = contextOf("crop-clears-last-row-and-column");
    const [height, width] = testCase.imageSize;
    const channels = tensor.classOrder.length;
    for (let x = 0; x < width; x += 1) {
      expect(tensor.data[((height - 1) * width + x) * channels]).toBe(0);
    }
    for (let y = 0; y < height; y += 1) {
      expect(tensor.data[(y * width + (width - 1)) * channels]).toBe(0);
    }
  });

  it("rounds a circle radius half to even", () => {
    // vertices [[60,60],[63.9,60]] give a radius of 3.9, which rounds to 4.
    const mask = rasterizeSegment(
      { type: "Circle", classId: 1, vertices: [[60, 60], [63.9, 60]] },
      100,
      100,
    );
    expect(mask).not.toBeNull();
    expect(mask?.data[60 * 100 + 64]).toBe(1); // four to the right is inside
    expect(mask?.data[60 * 100 + 65]).toBe(0); // five is not
  });

  it("truncates polygon vertices toward zero rather than rounding", () => {
    const mask = rasterizeSegment(
      { type: "Polygon", classId: 0, vertices: [[10.9, 10.9], [20.9, 10.9], [20.9, 20.9], [10.9, 20.9]] },
      40,
      40,
    );
    expect(mask?.data[10 * 40 + 10]).toBe(1); // 10.9 truncates to 10, so this pixel is the corner
    expect(mask?.data[9 * 40 + 10]).toBe(0);
  });

  it("returns null for a circle with a radius that rounds to zero", () => {
    expect(rasterizeSegment({ type: "Circle", classId: 0, vertices: [[5, 5], [5.4, 5]] }, 20, 20)).toBeNull();
  });

  it("skips a segment whose class is not in the class order", () => {
    const segments: Segment[] = [
      { type: "AI", classId: 3, mask: maskFromRects(10, 10, [[0, 0, 5, 5]]) },
      { type: "AI", classId: 99, mask: maskFromRects(10, 10, [[5, 5, 10, 10]]) },
    ];
    const tensor = createFinalMaskTensor(segments, [10, 10], [3]);
    expect(tensor.data.reduce((sum, v) => sum + v, 0)).toBe(25);
  });

  it("drops an instance left with no pixels after intersection", () => {
    const segments: Segment[] = [{ type: "AI", classId: 1, mask: maskFromRects(10, 10, [[0, 0, 4, 4]]) }];
    const empty = createFinalMaskTensor([], [10, 10], [1]);
    expect(createInstanceContours(segments, [10, 10], [1], empty)).toHaveLength(0);
  });

  it("does not mutate the tensor it is given", () => {
    const segments = segmentsOf("overlap-pixel-priority-off");
    const original = createFinalMaskTensor(segments, [50, 50], [1, 4]);
    const before = original.data.reduce((sum, v) => sum + v, 0);
    applyPixelPriority(original, true);
    applyCrop(original, [0, 0, 10, 10]);
    expect(original.data.reduce((sum, v) => sum + v, 0)).toBe(before);
  });
});
