/**
 * The load chain's three-way outcome: LOADED, EMPTY and FAILED.
 *
 * RULE-078. test/format/loadChain.test.ts proves the priority ORDER and that a damaged winner is
 * reported. What it did not cover is the distinction the rule card's answer calls "the whole bug":
 * a file that parses cleanly to zero annotations is EMPTY, still wins the chain, and must not be
 * confused with a file that could not be read. Three legacy loaders reach that state without
 * raising, and each one hides a healthy lower-priority sidecar.
 *
 * ORACLE: `FileManager.load_existing_mask` and its loaders
 * (legacy/lazylabel/src/lazylabel/core/file_manager.py:125-205, :224-280, :495-540), read in place
 * and exercised read-only under
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 *
 * ONE DELIBERATE DIFFERENCE, from brief decision 15c: where legacy's handler `continue`s past a
 * loader that RAISES (file_manager.py:202-204), this library reports the failure and stops. The
 * rule card's answer argues for continuing instead; the brief's decision 15c, which the
 * implementation follows, says stop and report. That conflict is recorded in RULE_COVERAGE.md.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AnnotationLoadError, loadAnnotations } from "../../src/load/chain.js";
import { encodeNpy } from "../../src/util/npy.js";
import { writeZip } from "../../src/util/zip.js";
import { GOLDENS_DIR } from "../helpers/fixtures.js";

const CASE = "two-classes-sparse-ids";
const SIZE = [20, 30] as const;

function golden(file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(GOLDENS_DIR, CASE, file)));
}

describe("a file that parses to nothing still wins the chain (RULE-078)", () => {
  it("lets an NPZ with no mask member hide a healthy YOLO Segmentation sidecar", async () => {
    // Oracle: `_load_npz` returns at file_manager.py:241-242 without raising, so load_existing_mask
    // commits at :205 with zero segments and never reads the _seg.txt. With auto-save on, the next
    // navigation then routes the empty list to the delete branch. Reproducing the SELECTION is the
    // contract; surfacing it, and refusing to delete, is Phase 4's job.
    const emptyNpz = await writeZip([
      { name: "class_order.npy", data: encodeNpy({ dtype: "int64", shape: [2], data: Float64Array.from([3, 7]) }) },
    ]);

    const outcome = await loadAnnotations(
      { NPZ: emptyNpz, YOLO_SEGMENTATION: golden("image_seg.txt") },
      SIZE,
    );
    expect(outcome?.format).toBe("NPZ");
    expect(outcome?.segments).toHaveLength(0);
  });

  it("lets a CreateML file whose root is not a list hide a YOLO Detection sidecar", async () => {
    // Oracle: file_manager.py:509-510 returns without raising.
    const outcome = await loadAnnotations(
      { CREATEML: '{"image": "i.png"}', YOLO_DETECTION: golden("image.txt") },
      SIZE,
    );
    expect(outcome?.format).toBe("CREATEML");
    expect(outcome?.segments).toHaveLength(0);
  });

  it("recovers from an unreadable winner, and reports that it did", async () => {
    // Decision 15c, as settled on 2026-09-17 after RULE-078's answer contradicted its first
    // wording. A damaged file usually sits beside a healthy one written by the same save, so the
    // chain continues and the user keeps their work. What must never happen is silence: the
    // outcome names the file that failed as well as the one that answered.
    const outcome = await loadAnnotations(
      { COCO_JSON: "[1, 2, 3]", PASCAL_VOC: golden("image.xml") },
      SIZE,
    );

    expect(outcome?.format).toBe("PASCAL_VOC");
    expect(outcome?.segments.length).toBeGreaterThan(0);
    expect(outcome?.failures.map((f) => f.format)).toEqual(["COCO_JSON"]);
    expect(outcome?.failures[0]?.reason).not.toBe("");
  });

  it("raises when every file present fails, rather than reporting no annotations", async () => {
    const failure = await loadAnnotations(
      { COCO_JSON: "[1, 2, 3]", PASCAL_VOC: "not xml at all" },
      SIZE,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AnnotationLoadError);
    expect((failure as AnnotationLoadError).format).toBe("COCO_JSON");
    expect((failure as AnnotationLoadError).failures).toHaveLength(2);
  });

  it("chooses by format rank alone, never by how much each file contains", async () => {
    // The lowest-priority file here holds the most objects; NPZ still wins, because the loaded
    // content is what the next save writes back and a reordered chain silently downgrades masks
    // to rectangles (test_bbox_roundtrip.py:484-492).
    const outcome = await loadAnnotations(
      {
        NPZ: golden("image.npz"),
        YOLO_DETECTION: "0 0.5 0.5 0.2 0.2\n1 0.25 0.25 0.1 0.1\n2 0.75 0.75 0.1 0.1\n",
      },
      SIZE,
    );
    expect(outcome?.format).toBe("NPZ");
    expect(outcome?.segments.map((segment) => segment.classId)).toEqual([3, 7]);
  });

  it("counts a file's unreadable lines instead of presenting it as an empty image", async () => {
    // `rejected` is what decision 15d's banner shows. Legacy silently skipped these lines.
    const outcome = await loadAnnotations(
      { YOLO_DETECTION: "0 0.5 0.5 0.2\nnonsense\n1 0.5 0.5 0.2 0.2\n" },
      SIZE,
    );
    expect(outcome?.segments).toHaveLength(1);
    expect(outcome?.rejected).toBe(2);
  });
});
