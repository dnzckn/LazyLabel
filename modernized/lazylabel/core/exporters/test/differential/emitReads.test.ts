/**
 * Emit what this library's READERS produce for each golden file, for the legacy comparison.
 *
 * The writer side is already proven byte for byte. This covers the other half of Phase 1's exit
 * criterion 1: that reading a file back yields the same segments the legacy loader yields. Masks
 * are summarized by a hash of their bytes plus a set-pixel count, which Python computes identically
 * in tools/compare_readers.py, so the comparison is exact rather than approximate.
 *
 * Run: npx vitest run test/differential  then  python tools/compare_readers.py .differential/read
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { parseCoco } from "../../src/format/coco.js";
import { parseCreateMl } from "../../src/format/createMl.js";
import { parseNpz } from "../../src/format/npz.js";
import { parseNpzClassMap } from "../../src/format/npzClassMap.js";
import { parsePascalVoc } from "../../src/format/pascalVoc.js";
import { parseYoloDetection } from "../../src/format/yoloDetection.js";
import { parseYoloSegmentation } from "../../src/format/yoloSegmentation.js";
import type { LoadedAnnotations } from "../../src/types.js";
import { CASE_IDS, fixtureCase, GOLDENS_DIR, PACKAGE_ROOT } from "../helpers/fixtures.js";

const OUT = join(PACKAGE_ROOT, ".differential", "read");

interface Reader {
  readonly file: string;
  read(bytes: Uint8Array, size: readonly [number, number]): Promise<LoadedAnnotations> | LoadedAnnotations;
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

const READERS: Record<string, Reader> = {
  YOLO_SEGMENTATION: { file: "image_seg.txt", read: (b, s) => parseYoloSegmentation(text(b), s) },
  YOLO_DETECTION: { file: "image.txt", read: (b, s) => parseYoloDetection(text(b), s) },
  COCO_JSON: { file: "image_coco.json", read: (b, s) => parseCoco(text(b), s) },
  PASCAL_VOC: { file: "image.xml", read: (b, s) => parsePascalVoc(text(b), s) },
  CREATEML: { file: "image_createml.json", read: (b, s) => parseCreateMl(text(b), s) },
  NPZ: { file: "image.npz", read: (b) => parseNpz(b) },
  NPZ_CLASS_MAP: { file: "image_CM.npz", read: (b, s) => parseNpzClassMap(b, s) },
};

/** The same summary tools/compare_readers.py computes from the legacy loader's segments. */
function summarize(loaded: LoadedAnnotations) {
  return {
    segments: loaded.segments.map((segment) => {
      const data = segment.mask?.data ?? new Uint8Array();
      let pixels = 0;
      for (const value of data) if (value) pixels += 1;
      return {
        classId: segment.classId,
        pixels,
        sha256: createHash("sha256").update(data).digest("hex"),
      };
    }),
    aliases: Object.fromEntries([...loaded.classAliases].map(([id, name]) => [String(id), name])),
    rejected: loaded.rejected,
  };
}

describe("emit reader output for the legacy comparison", () => {
  beforeAll(() => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
  });

  for (const id of CASE_IDS) {
    it(`reads every golden file of ${id}`, async () => {
      const size = fixtureCase(id).imageSize;
      const results: Record<string, unknown> = {};
      for (const [format, reader] of Object.entries(READERS)) {
        const bytes = new Uint8Array(readFileSync(join(GOLDENS_DIR, id, reader.file)));
        results[format] = summarize(await reader.read(bytes, size));
      }
      writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ imageSize: size, formats: results }, null, 1));
      expect(Object.keys(results)).toHaveLength(7);
    });
  }
});
