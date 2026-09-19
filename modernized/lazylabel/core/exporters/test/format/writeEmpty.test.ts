/**
 * `writeEmpty`: a save with no segments writes an empty file rather than no file.
 *
 * The architecture review found that "a save with zero segments writes nothing" lets the next load
 * resurrect deleted work: a user clears an image, saves, and the stale sidecar is still there to be
 * read back. Decision 7 forbids deleting a file without explicit user action, so the fix cannot be
 * "delete it" — it has to be "write an empty one".
 *
 * WHAT AN EMPTY FILE IS, and why it is not an invention. Every writer already builds its whole
 * document and only short-circuits at the very end when there is nothing in it. So the empty form
 * is exactly what that writer produces with no objects — same structure, same header, empty list.
 * That is what makes the property below hold: an empty file parses back through the SAME reader to
 * zero segments, rather than being a special case the reader has to know about.
 *
 * The option defaults off, so every byte-identity proof against legacy is untouched.
 */

import { describe, expect, it } from "vitest";

import {
  createFinalMaskTensor,
  parseCoco,
  parseCreateMl,
  parseNpz,
  parseNpzClassMap,
  parsePascalVoc,
  parseYoloDetection,
  parseYoloSegmentation,
  renderCoco,
  renderCreateMl,
  renderNpz,
  renderNpzClassMap,
  renderPascalVoc,
  renderYoloDetection,
  renderYoloSegmentation,
} from "../../src/index.js";
import type { ExportContext } from "../../src/index.js";

const SIZE: [number, number] = [40, 60];

/** A context for an image the user has just cleared: a real image, and nothing on it. */
function clearedContext(): ExportContext {
  return {
    imagePath: "frames/frame_012.png",
    imageSize: SIZE,
    classOrder: [],
    classLabels: [],
    classAliases: new Map(),
    maskTensor: createFinalMaskTensor([], SIZE, []),
    cropCoords: null,
    instances: [],
  };
}

const TEXT_WRITERS = [
  ["YOLO_DETECTION", renderYoloDetection, parseYoloDetection],
  ["YOLO_SEGMENTATION", renderYoloSegmentation, parseYoloSegmentation],
  ["COCO_JSON", renderCoco, parseCoco],
  ["PASCAL_VOC", renderPascalVoc, parsePascalVoc],
  ["CREATEML", renderCreateMl, parseCreateMl],
] as const;

describe("without writeEmpty, nothing is written — legacy's behaviour", () => {
  for (const [name, render] of TEXT_WRITERS) {
    it(`${name} returns null for a cleared image`, () => {
      expect(render(clearedContext())).toBeNull();
    });
  }

  it("NPZ returns null for a cleared image", async () => {
    expect(await renderNpz(clearedContext())).toBeNull();
  });

  it("NPZ Class Map returns null for a cleared image", async () => {
    expect(await renderNpzClassMap(clearedContext())).toBeNull();
  });
});

describe("with writeEmpty, a file is written and reads back as zero segments", () => {
  for (const [name, render, parse] of TEXT_WRITERS) {
    it(`${name} writes a file that parses to nothing`, async () => {
      const body = render(clearedContext(), { writeEmpty: true });

      expect(body, `${name} wrote nothing`).not.toBeNull();

      // The property that matters. A file the reader cannot handle would be worse than no file,
      // because the load chain would stop on it and report a failure for an image that is simply
      // empty.
      const loaded = await parse(body!, SIZE, new Map());
      expect(loaded.segments).toEqual([]);
      expect(loaded.rejected).toBe(0);
    });
  }

  it("NPZ writes an archive that parses to nothing", async () => {
    const bytes = await renderNpz(clearedContext(), { writeEmpty: true });
    expect(bytes).not.toBeNull();

    const loaded = await parseNpz(bytes!);
    expect(loaded.segments).toEqual([]);
    expect(loaded.classAliases.size).toBe(0);
  });

  it("NPZ Class Map writes an archive that parses to nothing", async () => {
    const bytes = await renderNpzClassMap(clearedContext(), { writeEmpty: true });
    expect(bytes).not.toBeNull();

    const loaded = await parseNpzClassMap(bytes!, SIZE);
    expect(loaded.segments).toEqual([]);
  });
});

describe("the empty file keeps the structure of a populated one", () => {
  it("COCO carries the image entry, with empty annotations and categories", () => {
    const body = renderCoco(clearedContext(), { writeEmpty: true })!;
    const document = JSON.parse(body) as {
      images: { file_name: string; width: number; height: number }[];
      annotations: unknown[];
      categories: unknown[];
    };

    // Not "{}" — the same document a populated file has, with the lists empty. A consumer that
    // reads images[0] to learn the size still works.
    expect(document.images).toEqual([{ id: 1, file_name: "frame_012.png", width: 60, height: 40 }]);
    expect(document.annotations).toEqual([]);
    expect(document.categories).toEqual([]);
  });

  it("Pascal VOC carries the filename and size, with no object elements", () => {
    const body = renderPascalVoc(clearedContext(), { writeEmpty: true })!;

    expect(body).toContain("<annotation>");
    expect(body).toContain("<filename>frame_012.png</filename>");
    expect(body).toContain("<width>60</width>");
    expect(body).not.toContain("<object>");
  });

  it("CreateML keeps its image entry with an empty annotation list", () => {
    // Not "[]". The writer builds one entry per image and only the annotations inside it are
    // empty, which is the same "structure of a populated file" rule the other formats follow -- and
    // it means the file still says which image it belongs to.
    const document = JSON.parse(renderCreateMl(clearedContext(), { writeEmpty: true })!) as {
      image: string;
      annotations: unknown[];
    }[];

    expect(document).toEqual([{ image: "frame_012.png", annotations: [] }]);
  });

  it("the YOLO formats are genuinely empty files", () => {
    // There is no header to keep: a YOLO file is one line per object.
    expect(renderYoloDetection(clearedContext(), { writeEmpty: true })).toBe("");
    expect(renderYoloSegmentation(clearedContext(), { writeEmpty: true })).toBe("");
  });
});

describe("writeEmpty changes nothing when there IS something to write", () => {
  it("produces byte-identical output either way", async () => {
    const mask = new Uint8Array(SIZE[0] * SIZE[1]);
    for (let y = 5; y < 15; y += 1) mask.fill(1, y * SIZE[1] + 8, y * SIZE[1] + 20);

    const segments = [
      { type: "Loaded" as const, classId: 2, mask: { height: SIZE[0], width: SIZE[1], data: mask } },
    ];
    const tensor = createFinalMaskTensor(segments, SIZE, [2]);
    const context: ExportContext = {
      imagePath: "frames/frame_012.png",
      imageSize: SIZE,
      classOrder: [2],
      classLabels: ["dog"],
      classAliases: new Map([[2, "dog"]]),
      maskTensor: tensor,
      cropCoords: null,
      instances: [],
    };

    // The option only decides what happens when the document would be empty. If it changed a
    // populated file by so much as a byte, every equivalence proof against legacy would be at risk.
    for (const [, render] of TEXT_WRITERS) {
      expect(render(context, { writeEmpty: true })).toBe(render(context));
    }
    expect(await renderNpz(context, { writeEmpty: true })).toEqual(await renderNpz(context));
  });
});
