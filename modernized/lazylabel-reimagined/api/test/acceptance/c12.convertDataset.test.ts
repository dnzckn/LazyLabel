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
 * THE CLASS NAMES TRAVEL WITH THE FILE. A legacy NPZ stores them as a PICKLED Python dict. Since
 * the owner's decision of 2026-09-25 this stack reads that table as data, never unpickling it
 * (SEC-01), so a conversion carries the names the desktop app saved. There is no converter step,
 * and nothing is supplied by hand. A table in any other shape is still refused, and the load
 * REPORTS that, so a conversion cannot quietly write "3" where the original said "stop sign".
 *
 * Decision 10's line-ending rule applies throughout: legacy opens text files in text mode and emits
 * CRLF on Windows, so text outputs are compared after normalizing.
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { parseNpz, readZip, writeZip } from "@lazylabel/annotation-formats";
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

/** A `class_aliases` member with the same .npy header, holding `os.system("ls")` as its pickle. */
function runsACommand(member: Uint8Array): Uint8Array {
  const headerEnd = 10 + (member[8]! | (member[9]! << 8));
  const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
  const pickle = [0x80, 0x02, ...ascii("cos\nsystem\n"), 0x58, 2, 0, 0, 0, ...ascii("ls"), 0x85, 0x52, 0x2e];
  return Uint8Array.from([...member.subarray(0, headerEnd), ...pickle]);
}

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
   * The class names legacy saved, as the goldens' manifest records them: what reading the file's
   * own name table must recover.
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

      // Step 2: choose the formats the pipeline needs, and save. The names are the ones the load
      // read out of the file, so this is the whole conversion, names included.
      const formats = Object.keys(golden.outputs);
      const saved = await app.handle(
        put("/projects/p1/images/frames/image.png/annotations", {
          imageSize: size,
          formats,
          segments: annotations.segments,
          classAliases: annotations.classAliases,
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

  describe("the class names a desktop-saved NPZ carries", () => {
    const [caseId, golden] = Object.entries(cases).find(
      ([, c]) => c.classLabels.some((label) => !/^\d+$/.test(label)) && c.outputs["NPZ"],
    )!;

    const load = async (size: [number, number]) =>
      jsonBody(await app.handle(get("/projects/p1/images/frames/image.png/annotations", size))) as WireLoadResponse;

    const saveVoc = (size: [number, number], annotations: WireLoadResponse) =>
      app.handle(
        put("/projects/p1/images/frames/image.png/annotations", {
          imageSize: size,
          formats: ["PASCAL_VOC"],
          segments: annotations.segments,
          classAliases: annotations.classAliases,
        }),
      );

    it("reads them out of the file, with nothing reported refused", async () => {
      const annotations = await load(await seed(caseId, golden));

      expect(annotations.segments.length).toBeGreaterThan(0);
      expect(annotations.classAliases).toEqual(aliases(golden));
      expect(annotations.unreadableAliases).toBeUndefined();
    });

    it("carries them into a format that stores names, matching legacy", async () => {
      const size = await seed(caseId, golden);
      await saveVoc(size, await load(size));

      const written = await readFile(path.join(root, "frames", "image.xml"), "utf-8");
      const expected = await readFile(path.join(GOLDENS, caseId, "image.xml"), "utf-8");
      expect(normalize(written)).toBe(normalize(expected));
    });

    it("reports a name table it will not read, since a conversion then writes bare ids", async () => {
      const size = await seed(caseId, golden);
      // Swap the file's table for one that would run a command if anything unpickled it. It is
      // refused rather than executed or guessed at, and the masks still load.
      const file = path.join(root, "frames", "image.npz");
      const entries = await readZip(new Uint8Array(await readFile(file)));
      await writeFile(
        file,
        await writeZip(
          entries.map((entry) =>
            entry.name === "class_aliases.npy" ? { name: entry.name, data: runsACommand(entry.data) } : entry,
          ),
        ),
      );

      const annotations = await load(size);
      expect(annotations.segments.length).toBeGreaterThan(0);
      expect(annotations.classAliases).toEqual({});
      expect(annotations.unreadableAliases).toBe(true);

      // Pascal VOC carries NAMES, not ids, so this file now says "3" where legacy said "cat".
      // Nothing about it looks wrong, which is exactly why the loss has to be reported on the way in.
      await saveVoc(size, annotations);
      const written = await readFile(path.join(root, "frames", "image.xml"), "utf-8");
      const expected = await readFile(path.join(GOLDENS, caseId, "image.xml"), "utf-8");
      expect(normalize(written)).not.toBe(normalize(expected));
      expect(written).toMatch(/<name>\d+<\/name>/);
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
