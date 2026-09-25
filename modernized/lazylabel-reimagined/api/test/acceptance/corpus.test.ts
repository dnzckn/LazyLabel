/**
 * Phase 6's exit criterion 4 on the synthetic corpus the owner chose in place of a real one
 * (2026-09-25): "simulate the round trip, have multiple shapes/segments/classes and play with the
 * priority setting to ensure expected behaviors across the variety of save formats".
 *
 * `test/fixtures/acceptance-corpus` is ten randomized images -- polygons, circles and masks over two
 * to five classes, overlapping on purpose, some classes named (non-ASCII among them) -- saved by the
 * LEGACY app's own code once per pixel-priority setting, in all seven formats, then converted as a
 * real dataset would be (legacy pickles its class names; SEC-01). `acceptance-oracle` is what legacy
 * writes when it opens each of those images and saves it again. `tools/generate_acceptance_corpus.py`
 * wrote both, with legacy at 2a7d5d8.
 *
 * Two claims, each over every format, every image and every priority setting:
 *
 *   1. Given the same annotations and the same setting, the port's save route writes what legacy's
 *      save path wrote.
 *   2. Opening an image and saving it again, the port writes what legacy writes. Not "what the file
 *      held": legacy's own files do not survive that, since its NPZ holds one mask per class and
 *      opening it merges a class's instances -- the instance formats then list one entry per class
 *      region, in class order.
 *
 * Text formats are compared after decision 10's line-ending normalisation; the NPZ formats array by
 * array, with the class names as JSON, because the port stores the names as JSON by design.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { put } from "../helpers/request.js";
import { roundTripFolder, sameFile, sidecarPathFor } from "../../tools/acceptanceRoundTrip.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(HERE, "..", "fixtures", "acceptance-corpus");
const ORACLE = path.resolve(HERE, "..", "fixtures", "acceptance-oracle");

const FORMATS = [
  "NPZ",
  "NPZ_CLASS_MAP",
  "YOLO_DETECTION",
  "YOLO_SEGMENTATION",
  "COCO_JSON",
  "PASCAL_VOC",
  "CREATEML",
] as const;

type Rect = readonly [number, number, number, number];

interface CorpusSegment {
  readonly type: "AI" | "Loaded" | "Polygon" | "Circle";
  readonly classId: number;
  readonly rects?: readonly Rect[];
  readonly vertices?: readonly (readonly [number, number])[];
}

interface CorpusCase {
  readonly id: string;
  readonly file: string;
  readonly imageSize: readonly [number, number];
  readonly pixelPriority: { readonly enabled: boolean; readonly ascending: boolean };
  readonly aliases: Readonly<Record<string, string>>;
  readonly segments: readonly CorpusSegment[];
}

const corpus = JSON.parse(
  await readFile(path.join(CORPUS, "corpus.json"), "utf-8"),
) as { readonly cases: readonly CorpusCase[] };

const SETTINGS = [...new Set(corpus.cases.map((entry) => entry.id.split("/")[0]!))];

/**
 * One declared segment on the wire: vertices as they are, a mask as the union of its rectangles,
 * sent as the box around them and one byte per pixel inside it.
 */
function wireSegment(segment: CorpusSegment, [height, width]: readonly [number, number]) {
  if (segment.rects === undefined) {
    return { type: segment.type, classId: segment.classId, vertices: segment.vertices };
  }
  const x0 = Math.min(...segment.rects.map((r) => r[0]));
  const y0 = Math.min(...segment.rects.map((r) => r[1]));
  const x1 = Math.max(...segment.rects.map((r) => r[2]));
  const y1 = Math.max(...segment.rects.map((r) => r[3]));
  const data = new Uint8Array((x1 - x0) * (y1 - y0));
  for (const [rx0, ry0, rx1, ry1] of segment.rects) {
    for (let y = ry0; y < ry1; y += 1) data.fill(1, (y - y0) * (x1 - x0) + (rx0 - x0), (y - y0) * (x1 - x0) + (rx1 - x0));
  }
  return {
    type: segment.type,
    classId: segment.classId,
    mask: { height, width, box: [x0, y0, x1, y1], data: Buffer.from(data).toString("base64") },
  };
}

async function bytesOf(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file));
}

describe("the corpus exercises what it is for", () => {
  it("covers the three priority settings, every segment type and overlapping classes", () => {
    expect(SETTINGS.sort()).toEqual(["priority-ascending", "priority-descending", "priority-off"]);
    const types = new Set(corpus.cases.flatMap((entry) => entry.segments.map((s) => s.type)));
    expect([...types].sort()).toEqual(["AI", "Circle", "Loaded", "Polygon"]);
    expect(corpus.cases.every((entry) => new Set(entry.segments.map((s) => s.classId)).size >= 2)).toBe(true);
  });
});

describe("1. the same annotations saved: the port writes what legacy wrote", () => {
  let root: string;
  let app: App;
  let metadata: SqliteMetadataStore;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-corpus-"));
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: new DirectoryBlobStore(root), metadataStore: metadata });
  });

  afterAll(async () => {
    await metadata.close();
    await rm(root, { recursive: true, force: true });
  });

  for (const entry of corpus.cases) {
    it(entry.id, async () => {
      const response = await app.handle(
        put(`/projects/p1/images/${entry.file}/annotations`, {
          imageSize: entry.imageSize,
          formats: FORMATS,
          segments: entry.segments.map((segment) => wireSegment(segment, entry.imageSize)),
          classAliases: entry.aliases,
          pixelPriority: entry.pixelPriority,
        }),
      );
      expect(response.status).toBe(200);

      const differing: string[] = [];
      for (const format of FORMATS) {
        const sidecar = sidecarPathFor(entry.file, format)!;
        const legacy = await bytesOf(path.join(CORPUS, sidecar));
        const port = await bytesOf(path.join(root, sidecar));
        if (!(await sameFile(format, legacy, port))) differing.push(format);
      }
      expect(differing).toEqual([]);
    });
  }
});

describe("2. opened and saved again: the port writes what legacy writes", () => {
  for (const setting of SETTINGS) {
    it(setting, async () => {
      const outcome = await roundTripFolder(CORPUS, setting, ORACLE);

      expect(outcome.images).toHaveLength(10);
      const failures = outcome.images
        .filter((image) => image.status !== "identical")
        .map((image) => `${image.key}: ${image.status} ${image.differing.join(", ")} ${image.detail}`);
      expect(failures).toEqual([]);
    }, 60_000);
  }
});
