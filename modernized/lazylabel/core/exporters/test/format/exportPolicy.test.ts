/**
 * Export policy: what a writer does when there is nothing to write, and where its file goes.
 *
 * RULE-079 (every selected format is written, nothing else is removed), RULE-080 (sidecar naming
 * and suffix collisions), the P1 half of RULE-081 (the existence probe that decides whether a frame
 * counts as already labelled), the P1 half of RULE-083 (nothing here deletes), and the RULE-014
 * edge case that an all-zero tensor is still written as NPZ.
 *
 * Every golden case writes all seven files, so the differential suite never took its
 * "legacy wrote nothing" branch and six of the seven writers had no test of their null return at
 * all - only renderYoloSegmentation did. A stale sidecar is never deleted, so "write nothing" and
 * "write an empty file" differ by an entire image's annotations.
 *
 * ORACLE for the writer expectations: the LEGACY exporters run read-only under
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 * over an ExportContext with the stated tensor, recording which files `export()` actually wrote.
 * ORACLE for the paths: each exporter's `get_output_path` (e.g. coco.py:99-100) and
 * `FileManager._LOAD_CHAIN` (core/file_manager.py:128-136), called on the same inputs.
 */

import { describe, expect, it } from "vitest";

import * as library from "../../src/index.js";
import { renderCoco } from "../../src/format/coco.js";
import { renderCreateMl } from "../../src/format/createMl.js";
import { renderNpz } from "../../src/format/npz.js";
import { renderNpzClassMap } from "../../src/format/npzClassMap.js";
import { renderPascalVoc } from "../../src/format/pascalVoc.js";
import { renderYoloDetection } from "../../src/format/yoloDetection.js";
import { renderYoloSegmentation } from "../../src/format/yoloSegmentation.js";
import { outputPathFor } from "../../src/paths.js";
import { decodeNpy } from "../../src/util/npy.js";
import { readZip } from "../../src/util/zip.js";
import { FORMAT_SUFFIX, LOAD_PRIORITY, type AnnotationFormat } from "../../src/types.js";
import { maskFromRects, syntheticContext } from "../helpers/fixtures.js";

const TEXT_WRITERS: [string, (ctx: library.ExportContext) => string | null][] = [
  ["YOLO Detection", renderYoloDetection],
  ["YOLO Segmentation", renderYoloSegmentation],
  ["COCO JSON", renderCoco],
  ["Pascal VOC", renderPascalVoc],
  ["CreateML", renderCreateMl],
];

/** Two classes present on the image, neither with a single set pixel. */
function allZeroTensor() {
  return syntheticContext({ imageSize: [4, 4], classOrder: [1, 4] });
}

describe("a format with nothing to write writes nothing (RULE-079)", () => {
  for (const [name, render] of TEXT_WRITERS) {
    it(`${name} returns null for a tensor with no set pixel`, () => {
      // Oracle: each legacy exporter returned None for this context, so no file was created and
      // no existing file was touched. Null here means "write nothing", never "delete".
      expect(render(allZeroTensor())).toBeNull();
    });
  }

  it("NPZ Class Map returns null for a tensor with no set pixel", async () => {
    expect(await renderNpzClassMap(allZeroTensor())).toBeNull();
  });

  it("NPZ is the one format that still writes an all-zero tensor", async () => {
    // Oracle: npz.py:16-17 skips only `mask_tensor.size == 0`, so an image whose crop blanked
    // every pixel still gets an .npz holding empty channels - and that file then wins the load
    // chain. RULE-014: "written even when every channel is empty after crop".
    const archive = await renderNpz(allZeroTensor());
    expect(archive).not.toBeNull();

    const members = new Map((await readZip(archive!)).map((entry) => [entry.name, entry.data]));
    const mask = decodeNpy(members.get("mask.npy")!);
    expect(mask.shape).toEqual([4, 4, 2]);
    expect((mask.data as Uint8Array).some((value) => value !== 0)).toBe(false);
    expect(Array.from(decodeNpy(members.get("class_order.npy")!).data as Float64Array)).toEqual([1, 4]);
  });

  it("both NPZ writers return null for a tensor with no channels at all", async () => {
    // Oracle: `mask_tensor.size == 0` (npz.py:16, npz_class_map.py:21).
    const empty = syntheticContext({ imageSize: [4, 4], classOrder: [] });
    expect(await renderNpz(empty)).toBeNull();
    expect(await renderNpzClassMap(empty)).toBeNull();
  });

  it("the YOLO writers refuse a non-positive image size, guarding on <= 0 rather than == 0", () => {
    // Oracle: yolo_detection.py:21-22 and yolo_segmentation.py:30-31 both test `h <= 0 or w <= 0`.
    for (const size of [[0, 8], [8, 0], [-4, 8]] as const) {
      const context = syntheticContext({ imageSize: size, classOrder: [1] });
      expect(renderYoloDetection(context), `detection at ${size.join("x")}`).toBeNull();
      expect(renderYoloSegmentation(context), `segmentation at ${size.join("x")}`).toBeNull();
    }
  });
});

describe("sidecar naming (RULE-080, RULE-081)", () => {
  it("appends each format's suffix to the image base name", () => {
    // Oracle: every exporter's get_output_path called on "dir/foo.png".
    const produced = Object.fromEntries(
      (Object.keys(FORMAT_SUFFIX) as AnnotationFormat[]).map((format) => [
        format,
        outputPathFor("dir/foo.png", format),
      ]),
    );
    expect(produced).toEqual({
      NPZ: "dir/foo.npz",
      NPZ_CLASS_MAP: "dir/foo_CM.npz",
      YOLO_DETECTION: "dir/foo.txt",
      YOLO_SEGMENTATION: "dir/foo_seg.txt",
      COCO_JSON: "dir/foo_coco.json",
      PASCAL_VOC: "dir/foo.xml",
      CREATEML: "dir/foo_createml.json",
    });
  });

  it("probes the same seven suffixes, in the same order, that decide whether an image is labelled", () => {
    // RULE-081: "already labelled" is os.path.exists(splitext(image)[0] + suffix) over
    // FileManager._LOAD_CHAIN in this exact order (file_manager.py:128-136, :138-151). The file is
    // never opened, so a stray sibling counts. Phase 6 gates propagation on this list; if the order
    // or the suffixes drift, a frame's hand-made labels get propagated over.
    expect(LOAD_PRIORITY.map((format) => FORMAT_SUFFIX[format])).toEqual([
      ".npz",
      "_seg.txt",
      "_coco.json",
      "_CM.npz",
      ".xml",
      "_createml.json",
      ".txt",
    ]);
  });

  it("collides an image named foo_seg.png with foo.png's segmentation sidecar", () => {
    // Oracle: get_output_path("foo_seg.png") for YOLO Detection and get_output_path("foo.png")
    // for YOLO Segmentation both return "foo_seg.txt". Decision 15e keeps this; Phase 4 warns.
    expect(outputPathFor("foo_seg.png", "YOLO_DETECTION")).toBe(outputPathFor("foo.png", "YOLO_SEGMENTATION"));
    expect(outputPathFor("foo_CM.png", "NPZ")).toBe(outputPathFor("foo.png", "NPZ_CLASS_MAP"));
  });

  it("gives foo.png and foo.jpg the same sidecar for every format", () => {
    for (const format of Object.keys(FORMAT_SUFFIX) as AnnotationFormat[]) {
      expect(outputPathFor("foo.png", format), format).toBe(outputPathFor("foo.jpg", format));
    }
  });

  it("strips only the last extension, and keeps a leading dot", () => {
    // Oracle: os.path.splitext("foo.tar.png") is ("foo.tar", ".png"); splitext(".bashrc") is
    // (".bashrc", ""); a dot in a directory name is never an extension.
    expect(outputPathFor("foo.tar.png", "YOLO_DETECTION")).toBe("foo.tar.txt");
    expect(outputPathFor(".bashrc", "YOLO_DETECTION")).toBe(".bashrc.txt");
    expect(outputPathFor("a.b/foo", "YOLO_DETECTION")).toBe("a.b/foo.txt");
    expect(outputPathFor("dir.x/img.tiff", "YOLO_DETECTION")).toBe("dir.x/img.txt");
  });
});

describe("this library never deletes (RULE-083, RULE-079)", () => {
  it("exposes no deletion entry point at all", () => {
    // Legacy `delete_all_outputs` (core/exporters/__init__.py:209-215) removes every registered
    // format's sidecar whenever the in-memory segment list is empty, including formats the user
    // never selected. Decision 7 forbids reproducing it, and TRANSFORMATION_NOTES.md records the
    // omission. This is the executable form of that promise: adding a delete_* export fails here.
    const suspicious = Object.keys(library).filter((name) => /delete|remove|unlink|rmdir/i.test(name));
    expect(suspicious).toEqual([]);
  });

  it("returns the file body, not the path it was written to", () => {
    // The legacy exporters write the file and return its PATH (yolo_detection.py:38-46). Here the
    // writer returns CONTENT and the caller pairs it with outputPathFor, which is what keeps the
    // same code usable in the browser, in the API and in the differential harness - and what makes
    // it impossible for this library to overwrite or remove a user's file.
    const context = syntheticContext({
      imageSize: [4, 4],
      classOrder: [1],
      channelMasks: [maskFromRects(4, 4, [[0, 0, 2, 2]])],
    });
    expect(renderYoloDetection(context)).toBe("1 0.25 0.25 0.5 0.5\n");
    expect(outputPathFor("dir/foo.png", "YOLO_DETECTION")).toBe("dir/foo.txt");
  });
});
