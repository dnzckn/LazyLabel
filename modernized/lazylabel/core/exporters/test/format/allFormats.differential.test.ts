/**
 * Differential test across every text and XML format and every fixture case.
 *
 * The oracle is goldens/<case>/<file>, written by the LEGACY Python exporters. Comparison follows
 * MODERNIZATION_BRIEF.md decision 10: byte-identical after normalizing line endings, because the
 * legacy writers open files in text mode and emit CRLF on Windows.
 *
 * The two NPZ formats are binary and are proven separately, by tools/compare_npz.py, which loads
 * both archives in NumPy and compares the arrays.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderCoco } from "../../src/format/coco.js";
import { renderCreateMl } from "../../src/format/createMl.js";
import { renderPascalVoc } from "../../src/format/pascalVoc.js";
import { renderYoloDetection } from "../../src/format/yoloDetection.js";
import { renderYoloSegmentation } from "../../src/format/yoloSegmentation.js";
import type { ExportContext } from "../../src/types.js";
import {
  buildExportContext,
  CASE_IDS,
  GOLDENS_DIR,
  normalizeEol,
  readGoldenRaw,
} from "../helpers/fixtures.js";

const FORMATS: { name: string; file: string; render: (ctx: ExportContext) => string | null }[] = [
  { name: "YOLO Segmentation", file: "image_seg.txt", render: renderYoloSegmentation },
  { name: "YOLO Detection", file: "image.txt", render: renderYoloDetection },
  { name: "COCO JSON", file: "image_coco.json", render: renderCoco },
  { name: "Pascal VOC", file: "image.xml", render: renderPascalVoc },
  { name: "CreateML", file: "image_createml.json", render: renderCreateMl },
];

describe("every text format matches the legacy bytes", () => {
  for (const format of FORMATS) {
    describe(format.name, () => {
      for (const id of CASE_IDS) {
        const goldenPath = join(GOLDENS_DIR, id, format.file);
        const hasGolden = existsSync(goldenPath);

        it(`${id}${hasGolden ? "" : " (legacy wrote nothing)"}`, () => {
          const { context } = buildExportContext(id);
          const produced = format.render(context);

          if (!hasGolden) {
            // Legacy writing no file must mean the port writes none either.
            expect(produced).toBeNull();
            return;
          }
          expect(produced).not.toBeNull();
          expect(normalizeEol(produced!)).toBe(normalizeEol(readGoldenRaw(id, format.file)));
        });
      }
    });
  }
});
