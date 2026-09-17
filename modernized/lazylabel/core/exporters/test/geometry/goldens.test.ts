/**
 * The geometry primitives against the real exports in `goldens/`.
 *
 * `goldens/<case>/image.txt` and `image_seg.txt` were written by the legacy Python
 * pipeline over the cases declared in `tools/fixtures.json`. They are the strongest
 * evidence available that these functions behave like the app: every number in them is
 * `boundingRect` or `approxPolyDP` output, divided by the image size, and every *line*
 * is one contour in `findContours` order.
 *
 * This file deliberately compares NUMBERS, not text. Reproducing Python's float
 * formatting is `src/format/`'s job; parsing the goldens with `Number()` recovers the
 * exact same doubles, so the comparison stays exact while testing only geometry.
 *
 * The mask-building helpers below are local to this test on purpose: they are a minimal
 * restatement of `SegmentManager.create_final_mask_tensor` / `create_instance_contours`
 * and `FileManager._apply_crop_to_mask`, just enough to drive the geometry. The
 * production versions live in `src/mask/`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  approxPolyDP,
  arcLength,
  boundingRect,
  fillCircle,
  fillPoly,
  findExternalContours,
} from "../../src/geometry/contours.js";
import type { Point2 } from "../../src/geometry/types.js";
import type { BinaryMask } from "../../src/types.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface FixtureSegment {
  type: "AI" | "Polygon" | "Circle";
  classId: number;
  rects?: [number, number, number, number][];
  vertices?: [number, number][];
}

interface FixtureCase {
  id: string;
  imageSize: [number, number];
  crop?: [number, number, number, number];
  pixelPriority?: { enabled: boolean; ascending: boolean };
  segments: FixtureSegment[];
}

const fixtures = JSON.parse(
  readFileSync(join(pkgRoot, "tools", "fixtures.json"), "utf8"),
) as { cases: FixtureCase[] };

const manifest = JSON.parse(
  readFileSync(join(pkgRoot, "goldens", "manifest.json"), "utf8"),
) as { cases: Record<string, { classOrder: number[]; maskSetPixels: number }> };

/** Python's round(): ties go to the even integer, unlike JavaScript's Math.round. */
function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Rasterize one fixture segment exactly as SegmentManager does at save time. */
function segmentMask(seg: FixtureSegment, height: number, width: number): BinaryMask {
  if (seg.type === "Polygon") {
    return fillPoly(height, width, [seg.vertices as Point2[]]);
  }
  if (seg.type === "Circle") {
    const [cx, cy] = seg.vertices![0]!;
    const [rx, ry] = seg.vertices![1]!;
    const radius = roundHalfToEven(Math.sqrt((rx - cx) ** 2 + (ry - cy) ** 2));
    return fillCircle(height, width, [roundHalfToEven(cx), roundHalfToEven(cy)], radius);
  }
  const data = new Uint8Array(height * width);
  for (const [x1, y1, x2, y2] of seg.rects ?? []) {
    for (let y = y1; y < y2; y++) data.fill(1, y * width + x1, y * width + x2);
  }
  return { height, width, data };
}

/** Per-class channels, OR-ed over the segments, then priority and crop, as the app does. */
function buildChannels(kase: FixtureCase, classOrder: number[]): Uint8Array[] {
  const [height, width] = kase.imageSize;
  const channels = classOrder.map(() => new Uint8Array(height * width));
  const segMasks = kase.segments.map((s) => segmentMask(s, height, width));

  kase.segments.forEach((seg, i) => {
    const c = classOrder.indexOf(seg.classId);
    if (c < 0) return;
    const channel = channels[c]!;
    const mask = segMasks[i]!.data;
    for (let p = 0; p < channel.length; p++) if (mask[p] !== 0) channel[p] = 1;
  });

  if (kase.pixelPriority?.enabled) {
    const ascending = kase.pixelPriority.ascending;
    for (let p = 0; p < height * width; p++) {
      let set = 0;
      let keep = -1;
      for (let c = 0; c < channels.length; c++) {
        if (channels[c]![p] !== 0) {
          set++;
          if (keep < 0 || !ascending) keep = c;
        }
      }
      if (set > 1) {
        for (let c = 0; c < channels.length; c++) channels[c]![p] = c === keep ? 1 : 0;
      }
    }
  }

  if (kase.crop) {
    const [x1, y1, x2, y2] = kase.crop;
    for (const channel of channels) {
      if (y1 > 0) channel.fill(0, 0, y1 * width);
      if (y2 < height) channel.fill(0, y2 * width);
      for (let y = y1; y < Math.min(y2, height); y++) {
        if (x1 > 0) channel.fill(0, y * width, y * width + x1);
        if (x2 < width) channel.fill(0, y * width + x2, (y + 1) * width);
      }
    }
  }

  return channels;
}

/** `create_instance_contours` + `iter_object_contours`: one entry per exported line. */
function objectContours(
  kase: FixtureCase,
  classOrder: number[],
): { classId: number; contour: Point2[] }[] {
  const [height, width] = kase.imageSize;
  const channels = buildChannels(kase, classOrder);
  const out: { classId: number; contour: Point2[] }[] = [];

  for (const seg of kase.segments) {
    const c = classOrder.indexOf(seg.classId);
    if (c < 0) continue;
    const channel = channels[c]!;
    const mask = segmentMask(seg, height, width).data;
    const single = new Uint8Array(height * width);
    let any = false;
    for (let p = 0; p < single.length; p++) {
      if (mask[p] !== 0 && channel[p] !== 0) {
        single[p] = 1;
        any = true;
      }
    }
    if (!any) continue;
    for (const contour of findExternalContours({ height, width, data: single })) {
      out.push({ classId: seg.classId, contour });
    }
  }

  return out;
}

/** `contour_to_polygon` from legacy/lazylabel/src/lazylabel/core/exporters/__init__.py. */
function contourToPolygon(points: readonly Point2[]): number[] {
  if (points.length >= 3) return points.flatMap((p) => [p[0], p[1]]);
  if (points.length === 2) {
    const [a, b] = points as [Point2, Point2];
    return [a[0], a[1], b[0], b[1], b[0], b[1], a[0], a[1]];
  }
  const p = points[0]!;
  return [p[0], p[1], p[0], p[1], p[0], p[1], p[0], p[1]];
}

/** Read a golden text file as one array of numbers per line. */
function readGoldenNumbers(caseId: string, file: string): number[][] {
  const text = readFileSync(join(pkgRoot, "goldens", caseId, file), "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split(" ").map(Number));
}

describe("goldens produced by the legacy pipeline", () => {
  for (const kase of fixtures.cases) {
    const meta = manifest.cases[kase.id];
    if (!meta) continue;

    describe(kase.id, () => {
      const [height, width] = kase.imageSize;

      it("rasterizes the same pixels the golden mask holds", () => {
        const channels = buildChannels(kase, meta.classOrder);
        let set = 0;
        for (const channel of channels) for (const v of channel) set += v;
        expect(set).toBe(meta.maskSetPixels);
      });

      it("writes the same boxes, in the same order, as image.txt", () => {
        const expected = readGoldenNumbers(kase.id, "image.txt");
        const actual = objectContours(kase, meta.classOrder).map(({ classId, contour }) => {
          const r = boundingRect(contour);
          return [
            classId,
            (r.x + r.width / 2) / width,
            (r.y + r.height / 2) / height,
            r.width / width,
            r.height / height,
          ];
        });
        expect(actual).toEqual(expected);
      });

      it("writes the same polygons, in the same order, as image_seg.txt", () => {
        const expected = readGoldenNumbers(kase.id, "image_seg.txt");
        const actual = objectContours(kase, meta.classOrder).map(({ classId, contour }) => {
          const epsilon = 0.001 * arcLength(contour, true);
          const polygon = contourToPolygon(approxPolyDP(contour, epsilon, true));
          const line = [classId];
          for (let i = 0; i < polygon.length; i += 2) {
            line.push(polygon[i]! / width, polygon[i + 1]! / height);
          }
          return line;
        });
        expect(actual).toEqual(expected);
      });
    });
  }
});

describe("contour enumeration order in the goldens", () => {
  it("split-segment-two-islands writes the lower island first", () => {
    const lines = readGoldenNumbers("split-segment-two-islands", "image_seg.txt");
    expect(lines).toHaveLength(2);
    // 0.75 * 400 = 300, the island at y = 100..119; the one at y = 10 comes second.
    expect(lines[0]![1]).toBe(0.75);
    expect(lines[1]![1]).toBe(0.025);
  });

  it("single-pixel-objects writes the second pixel first", () => {
    const lines = readGoldenNumbers("single-pixel-objects", "image.txt");
    expect(lines).toHaveLength(2);
    expect(lines[0]![1]! * 16).toBeCloseTo(12.5, 10);
    expect(lines[1]![1]! * 16).toBeCloseTo(3.5, 10);
  });
});
