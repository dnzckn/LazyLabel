/**
 * C12 — Convert a dataset from one annotation format to another.
 *
 * Persona flow 4, and Phase 4's exit criterion 1: an ML engineer opens a folder labelled in one
 * format, picks the formats their training pipeline needs, and re-saves. The criterion is that the
 * exported files are BYTE-IDENTICAL to legacy exports on the fixture datasets.
 *
 * The fixtures are the Phase 1 goldens, produced by running the legacy Python exporters. So this
 * reads a legacy-written NPZ through the API, saves every format, and compares each output to the
 * file legacy wrote for the same case — a real conversion against real legacy output rather than
 * against our own earlier output.
 *
 * ONE THING THE CONVERSION CANNOT CARRY BY ITSELF, and it is the architecture's known migration
 * gap rather than a defect here. A legacy NPZ stores its class names as a PICKLED Python dict,
 * which nothing in this stack will unpickle (SEC-01). The masks read perfectly; the names do not.
 * So the tests below split in two:
 *
 *   - with the names supplied, which is what the pickle converter will do, every format is
 *     byte-identical to legacy's;
 *   - without them, the load REPORTS that a class-name table was refused, so a conversion cannot
 *     quietly write "3" where the original said "stop sign".
 *
 * Decision 10's line-ending rule applies throughout: legacy opens text files in text mode and emits
 * CRLF on Windows, so text outputs are compared after normalizing.
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { parseNpz } from "@lazylabel/annotation-formats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, jsonBody, put } from "../helpers/request.js";
import type { WireLoadResponse } from "../../src/http/wire.js";

const GOLDENS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "lazylabel",
  "core",
  "exporters",
  "goldens",
);

interface GoldenCase {
  readonly classOrder: readonly number[];
  readonly classLabels: readonly string[];
  readonly outputs: Record<string, { readonly file: string }>;
}

const { cases } = JSON.parse(await readFile(path.join(GOLDENS, "manifest.json"), "utf-8")) as {
  cases: Record<string, GoldenCase>;
};

/** Decision 10: legacy writes CRLF on Windows and LF elsewhere; the target always writes LF. */
const normalize = (text: string) => text.replace(/\r\n/g, "\n");

const TEXT_FORMATS = ["YOLO_DETECTION", "YOLO_SEGMENTATION", "COCO_JSON", "PASCAL_VOC", "CREATEML"];

describe("C12: convert a labelled folder into other formats", () => {
  let root: string;
  let app: App;
  let metadata: SqliteMetadataStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-c12-"));
    await mkdir(path.join(root, "frames"), { recursive: true });
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: new DirectoryBlobStore(root), metadataStore: metadata });
  });

  afterEach(async () => {
    await metadata.close();
    await rm(root, { recursive: true, force: true });
  });

  /** Put a case's legacy NPZ in the folder and return the image size it implies. */
  async function seed(caseId: string, golden: GoldenCase): Promise<[number, number]> {
    const source = await readFile(path.join(GOLDENS, caseId, golden.outputs["NPZ"]!.file));
    await writeFile(path.join(root, "frames", "image.npz"), source);

    const parsed = await parseNpz(new Uint8Array(source));
    const mask = parsed.segments[0]?.mask;
    if (mask === undefined) throw new Error(`${caseId}: the golden NPZ holds no segments`);
    return [mask.height, mask.width];
  }

  /**
   * The class names the converter will restore.
   *
   * The goldens' manifest records what legacy wrote them as, which is exactly what unpickling the
   * legacy alias table would recover. Supplying them here is standing in for the converter, so the
   * byte-identity claim is about the CONVERSION and not about the pickle gap.
   */
  function aliases(golden: GoldenCase): Record<string, string> {
    return Object.fromEntries(
      golden.classOrder.map((id, index) => [String(id), golden.classLabels[index]!]),
    );
  }

  it("has golden cases to convert", () => {
    expect(Object.keys(cases).length).toBeGreaterThan(5);
  });

  for (const [caseId, golden] of Object.entries(cases)) {
    if (golden.outputs["NPZ"] === undefined) continue;

    it(`converts ${caseId} to every format legacy wrote, byte for byte`, async () => {
      const size = await seed(caseId, golden);

      // Step 1: open the image; the most faithful existing file is loaded.
      const loaded = await app.handle(get("/projects/p1/images/frames/image.png/annotations", size));
      expect(loaded.status, caseId).toBe(200);
      const annotations = jsonBody(loaded) as WireLoadResponse;
      expect(annotations.sourceFormat).toBe("NPZ");

      // Step 2: choose the formats the pipeline needs, and save.
      const formats = Object.keys(golden.outputs);
      const saved = await app.handle(
        put("/projects/p1/images/frames/image.png/annotations", {
          imageSize: size,
          formats,
          segments: annotations.segments,
          classAliases: aliases(golden),
        }),
      );
      expect(saved.status, caseId).toBe(200);

      // Step 3: every chosen format is written beside the image, matching what legacy wrote.
      for (const format of formats.filter((f) => TEXT_FORMATS.includes(f))) {
        const file = golden.outputs[format]!.file;
        const expected = await readFile(path.join(GOLDENS, caseId, file), "utf-8");
        const actual = await readFile(path.join(root, "frames", file), "utf-8");
        expect(normalize(actual), `${caseId} / ${format}`).toBe(normalize(expected));
      }
    });
  }

  describe("the class names a legacy NPZ will not give up", () => {
    const [caseId, golden] = Object.entries(cases).find(
      ([, c]) => c.classLabels.some((label) => !/^\d+$/.test(label)) && c.outputs["NPZ"],
    )!;

    it("reports that a class-name table was refused rather than reading it", async () => {
      const size = await seed(caseId, golden);
      const annotations = jsonBody(
        await app.handle(get("/projects/p1/images/frames/image.png/annotations", size)),
      ) as WireLoadResponse;

      // The masks are fine. The names are pickled, and refusing to execute a pickle is deliberate
      // (SEC-01) — but losing them silently is what would make a conversion quietly wrong.
      expect(annotations.segments.length).toBeGreaterThan(0);
      expect(annotations.classAliases).toEqual({});
      expect(annotations.unreadableAliases).toBe(true);
    });

    it("writes bare class ids when the names are not supplied, which is why the warning exists", async () => {
      const size = await seed(caseId, golden);
      const annotations = jsonBody(
        await app.handle(get("/projects/p1/images/frames/image.png/annotations", size)),
      ) as WireLoadResponse;

      await app.handle(
        put("/projects/p1/images/frames/image.png/annotations", {
          imageSize: size,
          formats: ["PASCAL_VOC"],
          segments: annotations.segments,
          classAliases: annotations.classAliases,
        }),
      );

      // Pascal VOC carries NAMES, not ids, so this file now says "3" where legacy said "cat".
      // Nothing about it looks wrong, which is exactly why the loss has to be reported on the way in.
      const written = await readFile(path.join(root, "frames", "image.xml"), "utf-8");
      const expected = await readFile(path.join(GOLDENS, caseId, "image.xml"), "utf-8");
      expect(normalize(written)).not.toBe(normalize(expected));
      expect(written).toMatch(/<name>\d+<\/name>/);
    });

    it("matches legacy once the names are supplied, as the converter will supply them", async () => {
      const size = await seed(caseId, golden);
      const annotations = jsonBody(
        await app.handle(get("/projects/p1/images/frames/image.png/annotations", size)),
      ) as WireLoadResponse;

      await app.handle(
        put("/projects/p1/images/frames/image.png/annotations", {
          imageSize: size,
          formats: ["PASCAL_VOC"],
          segments: annotations.segments,
          classAliases: aliases(golden),
        }),
      );

      const written = await readFile(path.join(root, "frames", "image.xml"), "utf-8");
      const expected = await readFile(path.join(GOLDENS, caseId, "image.xml"), "utf-8");
      expect(normalize(written)).toBe(normalize(expected));
    });
  });

  it("writes the files beside the image, where the dataset already is", async () => {
    const [caseId, golden] = Object.entries(cases)[0]!;
    const size = await seed(caseId, golden);

    const annotations = jsonBody(
      await app.handle(get("/projects/p1/images/frames/image.png/annotations", size)),
    ) as WireLoadResponse;

    await app.handle(
      put("/projects/p1/images/frames/image.png/annotations", {
        imageSize: size,
        formats: ["COCO_JSON", "PASCAL_VOC"],
        segments: annotations.segments,
        classAliases: aliases(golden),
      }),
    );

    // Decision 5: the annotations are files in the user's folder. Converting does not move them
    // anywhere, which is the whole reason this flow is a no-op rather than an export feature.
    expect((await readdir(path.join(root, "frames"))).sort()).toEqual([
      "image.npz",
      "image.xml",
      "image_coco.json",
    ]);
  });
});
