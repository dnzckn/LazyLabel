/**
 * Inputs for the YOLO Segmentation characterization tests.
 *
 * `tools/fixtures.json` declares 12 cases; `tools/generate_golden.py` fed each one through the
 * LEGACY Python and recorded the result under `goldens/<case id>/`. This module rebuilds the same
 * inputs in TypeScript, so one case can be handed to the legacy oracle and to the port alike.
 *
 * It mirrors, call for call, what the golden generator does:
 *   SegmentManager.get_unique_class_ids      legacy/lazylabel/src/lazylabel/core/segment_manager.py:86-95
 *   SegmentManager.get_class_alias           legacy/lazylabel/src/lazylabel/core/segment_manager.py:397-399
 *   SegmentManager.create_final_mask_tensor  legacy/lazylabel/src/lazylabel/core/segment_manager.py:212-252
 *   SegmentManager._apply_pixel_priority     legacy/lazylabel/src/lazylabel/core/segment_manager.py:317-373
 *   FileManager._apply_crop_to_mask          legacy/lazylabel/src/lazylabel/core/file_manager.py:712-739
 *   SegmentManager.create_instance_contours  legacy/lazylabel/src/lazylabel/core/segment_manager.py:254-315
 *
 * Nothing here is an oracle. The oracle is `goldens/<case id>/image_seg.txt`; this file only
 * reproduces the INPUT the legacy writer saw, and the render suite proves that reproduction
 * against `goldens/manifest.json`.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BinaryMask,
  ExportContext,
  InstanceContour,
  MaskTensor,
} from "../../src/types.js";

// Contour tracing (OpenCV RETR_EXTERNAL + CHAIN_APPROX_SIMPLE) is being ported in parallel.
// This import is the ONLY coupling between the tests and that module; if it lands under a
// different export name, `resolveTracer` below is the single place to adapt.
import * as contourModule from "../../src/geometry/contours.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Package root: .../modernized/lazylabel/core/exporters */
export const PACKAGE_ROOT = resolve(HERE, "..", "..");
const FIXTURES_PATH = join(PACKAGE_ROOT, "tools", "fixtures.json");
export const GOLDENS_DIR = join(PACKAGE_ROOT, "goldens");

/* -------------------------------------------------------------------------- */
/* fixtures.json                                                              */
/* -------------------------------------------------------------------------- */

/** One [x1, y1, x2, y2] rectangle, x2/y2 EXCLUSIVE (numpy slicing, per fixtures.json:note). */
export type FixtureRect = readonly [number, number, number, number];

export interface FixtureSegment {
  readonly type: "AI" | "Loaded" | "Polygon" | "Circle";
  readonly classId: number;
  readonly rects?: readonly FixtureRect[];
  readonly vertices?: readonly (readonly [number, number])[];
}

export interface FixtureCase {
  readonly id: string;
  readonly why: string;
  /** [height, width], as the legacy ExportContext stores it (exporters/__init__.py:102). */
  readonly imageSize: readonly [number, number];
  readonly aliases?: Readonly<Record<string, string>>;
  readonly segments: readonly FixtureSegment[];
  /** [x1, y1, x2, y2], clamped inclusively and applied exclusively (file_manager.py:712-739). */
  readonly crop?: readonly [number, number, number, number];
  readonly pixelPriority?: { readonly enabled: boolean; readonly ascending: boolean };
}

interface FixturesFile {
  readonly note: string;
  readonly cases: readonly FixtureCase[];
}

const FIXTURES = JSON.parse(readFileSync(FIXTURES_PATH, "utf8")) as FixturesFile;

/** Case ids in declaration order. */
export const CASE_IDS: readonly string[] = FIXTURES.cases.map((c) => c.id);

export function fixtureCase(id: string): FixtureCase {
  const found = FIXTURES.cases.find((c) => c.id === id);
  if (!found) throw new Error(`no fixture case "${id}" in tools/fixtures.json`);
  return found;
}

/* -------------------------------------------------------------------------- */
/* goldens                                                                    */
/* -------------------------------------------------------------------------- */

export interface ManifestEntry {
  readonly classOrder: readonly number[];
  readonly classLabels: readonly string[];
  /** Number of instance RECORDS (one per contour-bearing segment), not number of contours. */
  readonly instanceCount: number;
  readonly maskShape: readonly [number, number, number];
  readonly maskSetPixels: number;
  readonly outputs: Readonly<
    Record<string, { readonly file: string; readonly bytes: number } | null>
  >;
}

const MANIFEST = JSON.parse(readFileSync(join(GOLDENS_DIR, "manifest.json"), "utf8")) as {
  readonly source: string;
  readonly cases: Readonly<Record<string, ManifestEntry>>;
};

export function manifestEntry(id: string): ManifestEntry {
  const entry = MANIFEST.cases[id];
  if (!entry) throw new Error(`no manifest entry for "${id}"`);
  return entry;
}

/**
 * The legacy writers open files in Python text mode, so the captured goldens carry the host's
 * terminator (CRLF: these were captured on Windows). MODERNIZATION_BRIEF.md decision 10 settles
 * that the target always writes LF and the differential tests compare after normalizing.
 */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** Raw text of a golden file, decoded as UTF-8, terminators untouched. */
export function readGoldenRaw(id: string, fileName: string): string {
  return readFileSync(join(GOLDENS_DIR, id, fileName), "utf8");
}

/** goldens/<id>/image_seg.txt with line endings normalized to LF. */
export function goldenSegText(id: string): string {
  return normalizeEol(readGoldenRaw(id, "image_seg.txt"));
}

/* -------------------------------------------------------------------------- */
/* masks                                                                      */
/* -------------------------------------------------------------------------- */

export function emptyMask(height: number, width: number): BinaryMask {
  return { height, width, data: new Uint8Array(Math.max(height, 0) * Math.max(width, 0)) };
}

/** Rasterize [x1, y1, x2, y2] rectangles with x2/y2 exclusive, as `mask[y1:y2, x1:x2] = True`. */
export function maskFromRects(
  height: number,
  width: number,
  rects: readonly FixtureRect[],
): BinaryMask {
  const mask = emptyMask(height, width);
  for (const [x1, y1, x2, y2] of rects) {
    for (let y = Math.max(0, y1); y < Math.min(height, y2); y += 1) {
      for (let x = Math.max(0, x1); x < Math.min(width, x2); x += 1) {
        mask.data[y * width + x] = 1;
      }
    }
  }
  return mask;
}

/** Inclusive row span [y, xFirst, xLast]. */
export type RowSpan = readonly [number, number, number];

export function maskFromSpans(
  height: number,
  width: number,
  spans: readonly RowSpan[],
): BinaryMask {
  const mask = emptyMask(height, width);
  for (const [y, xFirst, xLast] of spans) {
    for (let x = xFirst; x <= xLast; x += 1) mask.data[y * width + x] = 1;
  }
  return mask;
}

export function countSetPixels(mask: BinaryMask): number {
  let total = 0;
  for (const v of mask.data) if (v !== 0) total += 1;
  return total;
}

export function maskPixelAt(mask: BinaryMask, x: number, y: number): number {
  return mask.data[y * mask.width + x] ?? 0;
}

/** Inclusive [xMin, yMin, xMax, yMax] of the set pixels, or null when the mask is empty. */
export function maskBounds(mask: BinaryMask): readonly [number, number, number, number] | null {
  let xMin = Number.POSITIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let xMax = -1;
  let yMax = -1;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x] === 0) continue;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  return xMax < 0 ? null : [xMin, yMin, xMax, yMax];
}

export function channelOf(tensor: MaskTensor, channel: number): BinaryMask {
  const { height, width, classOrder } = tensor;
  const mask = emptyMask(height, width);
  for (let i = 0; i < height * width; i += 1) {
    mask.data[i] = tensor.data[i * classOrder.length + channel] ?? 0;
  }
  return mask;
}

export function countSetTensorPixels(tensor: MaskTensor): number {
  let total = 0;
  for (const v of tensor.data) if (v !== 0) total += 1;
  return total;
}

/** Build a channel-last tensor from one binary mask per entry of `classOrder`. */
export function tensorFromMasks(
  height: number,
  width: number,
  classOrder: readonly number[],
  masks: readonly BinaryMask[],
): MaskTensor {
  const channels = classOrder.length;
  const data = new Uint8Array(Math.max(height, 0) * Math.max(width, 0) * channels);
  masks.forEach((mask, channel) => {
    for (let i = 0; i < mask.data.length; i += 1) {
      if (mask.data[i] !== 0) data[i * channels + channel] = 1;
    }
  });
  return { height, width, classOrder, data };
}

/* -------------------------------------------------------------------------- */
/* shape rasters recorded from the legacy                                     */
/* -------------------------------------------------------------------------- */

function rectSpans(yFirst: number, yLast: number, xFirst: number, xLast: number): RowSpan[] {
  const spans: RowSpan[] = [];
  for (let y = yFirst; y <= yLast; y += 1) spans.push([y, xFirst, xLast]);
  return spans;
}

/**
 * Rasters for the two shape segments of the `polygon-and-circle` fixture, RECORDED from the legacy
 * rasterizers (RULE-015; segment_manager.py:174-203) by a read-only run of the legacy code under
 * the lazylabel venv (cv2 4.12.0). They are INPUT, not expectations: goldens/manifest.json
 * independently records 280 set pixels for this case (231 + 49), which the render suite checks.
 *
 * Replace this table once `src/geometry/` grows a rasterizer; the table then becomes the
 * characterization test for that module.
 *
 * Key is `<case id>#<segment index>`.
 */
const RECORDED_SHAPE_RASTER: Readonly<Record<string, readonly RowSpan[]>> = {
  // Polygon (10.7,10.2),(20.9,10.2),(20.9,30.8),(10.7,30.8): np.int32 TRUNCATES toward zero to
  // (10,10),(20,10),(20,30),(10,30), and cv2.fillPoly fills edge-inclusive, so rows 10..30 x
  // cols 10..20 = 231 px (segment_manager.py:174-186).
  "polygon-and-circle#0": rectSpans(10, 30, 10, 20),
  // Circle centre (60,60), radius point (63.9,60): radius = int(round(3.9)) = 4, then cv2.circle
  // filled, which is 49 px (segment_manager.py:188-203).
  "polygon-and-circle#1": [
    [56, 60, 60],
    [57, 58, 62],
    [58, 57, 63],
    [59, 57, 63],
    [60, 56, 64],
    [61, 57, 63],
    [62, 57, 63],
    [63, 58, 62],
    [64, 60, 60],
  ],
};

/* -------------------------------------------------------------------------- */
/* contour tracer                                                             */
/* -------------------------------------------------------------------------- */

export type Contour = readonly (readonly [number, number])[];
type Tracer = (mask: BinaryMask) => readonly Contour[];

const TRACER_NAMES = [
  // The name src/format/objects.ts already imports.
  "findExternalContours",
  "traceContours",
  "findContours",
  // src/geometry/suzukiAbe.ts exports this as (mask, direct); called with one argument, `direct`
  // is undefined, which is the falsy CHAIN_APPROX_SIMPLE branch we want.
  "traceExternalContours",
] as const;
let cachedTracer: Tracer | null = null;

/**
 * Resolve the external-contour tracer from `src/geometry/contours.ts`.
 *
 * Expected shape: `(mask: BinaryMask) => Contour[]`, reproducing cv2.findContours with
 * RETR_EXTERNAL and CHAIN_APPROX_SIMPLE INCLUDING enumeration order — MODERNIZATION_BRIEF.md
 * decision 15(a) makes that order part of the contract, because it is visible as line order in
 * the exported file.
 */
function resolveTracer(): Tracer {
  if (cachedTracer) return cachedTracer;
  const mod = contourModule as unknown as Record<string, unknown>;
  for (const name of TRACER_NAMES) {
    const candidate = mod[name];
    if (typeof candidate === "function") {
      cachedTracer = candidate as Tracer;
      return cachedTracer;
    }
  }
  throw new Error(
    `src/geometry/contours.ts must export one of [${TRACER_NAMES.join(", ")}] as ` +
      `(mask: BinaryMask) => Contour[] (RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)`,
  );
}

/* -------------------------------------------------------------------------- */
/* ExportContext construction                                                 */
/* -------------------------------------------------------------------------- */

export interface BuiltContext {
  readonly context: ExportContext;
  /**
   * Segments that contributed at least one contour. The legacy keeps one RECORD per such segment
   * (segment_manager.py:307-313) and goldens/manifest.json counts records, while
   * `ExportContext.instances` is flattened to one entry per contour, so the two differ whenever a
   * segment traces to more than one island.
   */
  readonly instanceRecordCount: number;
  /** Per-segment masks after the AND with their channel, in fixture order. */
  readonly segmentMasks: readonly BinaryMask[];
}

/** Rasterize one declared segment exactly as generate_golden.py:build_segment does. */
function segmentMask(
  caseId: string,
  index: number,
  spec: FixtureSegment,
  height: number,
  width: number,
): BinaryMask {
  if (spec.type === "AI" || spec.type === "Loaded") {
    return maskFromRects(height, width, spec.rects ?? []);
  }
  const recorded = RECORDED_SHAPE_RASTER[`${caseId}#${index}`];
  if (!recorded) {
    throw new Error(
      `no recorded raster for ${spec.type} segment ${index} of "${caseId}"; ` +
        `add one to RECORDED_SHAPE_RASTER or wire up the real rasterizer`,
    );
  }
  return maskFromSpans(height, width, recorded);
}

/** SegmentManager._apply_pixel_priority (segment_manager.py:317-373), in place. */
function applyPixelPriority(tensor: MaskTensor, ascending: boolean): void {
  const channels = tensor.classOrder.length;
  const pixels = tensor.height * tensor.width;
  for (let i = 0; i < pixels; i += 1) {
    const base = i * channels;
    let set = 0;
    let winner = -1;
    for (let c = 0; c < channels; c += 1) {
      if (tensor.data[base + c] === 0) continue;
      set += 1;
      // argmin over the set channels when ascending, argmax when descending.
      if (winner < 0 || (ascending ? c < winner : c > winner)) winner = c;
    }
    if (set <= 1) continue;
    for (let c = 0; c < channels; c += 1) tensor.data[base + c] = 0;
    tensor.data[base + winner] = 1;
  }
}

/**
 * FileManager._apply_crop_to_mask (file_manager.py:712-739): zero everything outside
 * [x1, y1, x2, y2], where x2/y2 are applied EXCLUSIVELY even though the crop tool clamps them
 * inclusively to width-1/height-1, which is why the last row and column never survive (RULE-016).
 */
function applyCrop(tensor: MaskTensor, crop: readonly [number, number, number, number]): void {
  const [x1, y1, x2, y2] = crop;
  const { height, width, classOrder } = tensor;
  const channels = classOrder.length;
  for (let y = 0; y < height; y += 1) {
    const insideRows = y >= y1 && y < y2;
    for (let x = 0; x < width; x += 1) {
      if (insideRows && x >= x1 && x < x2) continue;
      const base = (y * width + x) * channels;
      for (let c = 0; c < channels; c += 1) tensor.data[base + c] = 0;
    }
  }
}

/** Build the ExportContext for a fixture case, mirroring generate_golden.py:build_context. */
export function buildExportContext(id: string): BuiltContext {
  const fixture = fixtureCase(id);
  const height = fixture.imageSize[0];
  const width = fixture.imageSize[1];

  // get_unique_class_ids: sorted unique class ids present in THIS image (segment_manager.py:86-95).
  const classOrder = [...new Set(fixture.segments.map((s) => s.classId))].sort((a, b) => a - b);
  const aliases = new Map<number, string>(
    Object.entries(fixture.aliases ?? {}).map(([cid, alias]) => [Number(cid), alias] as const),
  );
  // get_class_alias: the alias, else the id as text (segment_manager.py:397-399).
  const classLabels = classOrder.map((cid) => aliases.get(cid) ?? String(cid));

  const masks = fixture.segments.map((spec, i) => segmentMask(id, i, spec, height, width));

  // create_final_mask_tensor: OR every segment into its class channel (segment_manager.py:212-244).
  const channels = classOrder.length;
  const pixels = height * width;
  const tensorData = new Uint8Array(pixels * channels);
  fixture.segments.forEach((spec, i) => {
    const channel = classOrder.indexOf(spec.classId);
    const mask = masks[i]!;
    for (let p = 0; p < pixels; p += 1) {
      if (mask.data[p] !== 0) tensorData[p * channels + channel] = 1;
    }
  });
  const maskTensor: MaskTensor = { height, width, classOrder, data: tensorData };

  if (fixture.pixelPriority?.enabled) {
    applyPixelPriority(maskTensor, fixture.pixelPriority.ascending);
  }
  if (fixture.crop) applyCrop(maskTensor, fixture.crop);

  // create_instance_contours: AND each segment with its post-crop, post-priority channel, then
  // trace it on its own so same-class objects stay apart (segment_manager.py:254-315).
  const trace = resolveTracer();
  const instances: InstanceContour[] = [];
  const intersected: BinaryMask[] = [];
  let instanceRecordCount = 0;
  fixture.segments.forEach((spec, i) => {
    const channel = classOrder.indexOf(spec.classId);
    const single = emptyMask(height, width);
    const mask = masks[i]!;
    let any = false;
    for (let p = 0; p < pixels; p += 1) {
      const on = mask.data[p] !== 0 && tensorData[p * channels + channel] !== 0;
      single.data[p] = on ? 1 : 0;
      if (on) any = true;
    }
    intersected.push(single);
    if (!any) return;
    const traced = trace(single);
    if (traced.length === 0) return;
    instanceRecordCount += 1;
    for (const contour of traced) instances.push({ channel, contour });
  });

  const context: ExportContext = {
    // generate_golden.py points image_path at the golden directory; only the path is used.
    imagePath: join(GOLDENS_DIR, id, "image.png"),
    imageSize: [height, width],
    classOrder,
    classLabels,
    classAliases: aliases,
    maskTensor,
    cropCoords: fixture.crop
      ? [fixture.crop[0], fixture.crop[1], fixture.crop[2], fixture.crop[3]]
      : null,
    instances,
  };
  return { context, instanceRecordCount, segmentMasks: intersected };
}

/* -------------------------------------------------------------------------- */
/* synthetic contexts for the targeted trap tests                             */
/* -------------------------------------------------------------------------- */

export interface SyntheticOptions {
  /** [height, width]. */
  readonly imageSize: readonly [number, number];
  readonly classOrder: readonly number[];
  /** Flattened, one entry per contour, exactly as the legacy iterates them. */
  readonly instances?: readonly InstanceContour[];
  /** One mask per entry of `classOrder`; defaults to all-empty channels. */
  readonly channelMasks?: readonly BinaryMask[];
  readonly classAliases?: ReadonlyMap<number, string>;
}

/**
 * An ExportContext assembled by hand, for branches no fixture reaches: the empty-instances
 * fallback, the size guard, and coordinate magnitudes that mask tracing cannot produce.
 */
export function syntheticContext(options: SyntheticOptions): ExportContext {
  const height = options.imageSize[0];
  const width = options.imageSize[1];
  const classOrder = options.classOrder;
  const masks = options.channelMasks ?? classOrder.map(() => emptyMask(height, width));
  const aliases = options.classAliases ?? new Map<number, string>();
  return {
    imagePath: join(GOLDENS_DIR, "synthetic", "image.png"),
    imageSize: [height, width],
    classOrder,
    classLabels: classOrder.map((cid) => aliases.get(cid) ?? String(cid)),
    classAliases: aliases,
    maskTensor: tensorFromMasks(height, width, classOrder, masks),
    cropCoords: null,
    instances: options.instances ?? [],
  };
}

/** Split rendered text into lines, dropping the empty piece after the final terminator. */
export function renderedLines(text: string): string[] {
  const lines = normalizeEol(text).split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
