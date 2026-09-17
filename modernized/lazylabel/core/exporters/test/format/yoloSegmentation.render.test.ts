/**
 * Characterization tests for the YOLO Segmentation WRITER.
 *
 * Legacy under test:
 *   legacy/lazylabel/src/lazylabel/core/exporters/yolo_segmentation.py:25-56  (export, get_output_path)
 *   legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:114-157         (iter_object_contours, contour_to_polygon)
 *
 * Every expected value below comes either from a golden file the legacy exporter wrote
 * (goldens/<case id>/image_seg.txt) or from the legacy source plus a read-only run of the legacy
 * Python under E:/venv/lazylabel. None of it came from running a TypeScript implementation.
 *
 * Comparison rule: MODERNIZATION_BRIEF.md decision 10 — text exports are byte-identical AFTER
 * normalizing line endings. The goldens were captured on Windows and carry CRLF; the target
 * always writes LF.
 */

import { describe, expect, it } from "vitest";

import { outputPathFor, renderYoloSegmentation } from "../../src/index.js";
import {
  CASE_IDS,
  buildExportContext,
  countSetTensorPixels,
  goldenSegText,
  manifestEntry,
  maskFromRects,
  renderedLines,
  syntheticContext,
} from "../helpers/fixtures.js";

const CASES = [...CASE_IDS];

describe("fixture inputs reproduce what the legacy writer saw", () => {
  // RULE-010 (final per-class mask composition), RULE-012 (pixel priority), RULE-014 (channel
  // order = ascending class id), RULE-016 (crop).
  // legacy segment_manager.py:86-95, :212-252, :254-315, :317-373; file_manager.py:712-739.
  // Not a test of the writer: it proves the TypeScript-built ExportContext equals the input the
  // legacy exporter was given, which is what makes the differential tests below meaningful.
  it.each(CASES)("%s builds the ExportContext recorded in goldens/manifest.json", (id) => {
    const { context, instanceRecordCount } = buildExportContext(id);
    const expected = manifestEntry(id);

    expect(context.classOrder).toEqual(expected.classOrder);
    expect(context.classLabels).toEqual(expected.classLabels);
    expect([
      context.maskTensor.height,
      context.maskTensor.width,
      context.maskTensor.classOrder.length,
    ]).toEqual(expected.maskShape);
    expect(countSetTensorPixels(context.maskTensor)).toBe(expected.maskSetPixels);
    expect(instanceRecordCount).toBe(expected.instanceCount);
  });
});

describe("differential: renderYoloSegmentation matches the legacy exporter byte for byte", () => {
  // RULE-006 (YOLO Segmentation export polygon simplification), RULE-008 (instance separation).
  // legacy yolo_segmentation.py:25-53 via exporters/__init__.py:114-157.
  // One case per fixture in tools/fixtures.json; the oracle is the file the legacy wrote.
  it.each(CASES)("%s", (id) => {
    const { context } = buildExportContext(id);
    expect(renderYoloSegmentation(context)).toBe(goldenSegText(id));
  });
});

describe("number formatting follows Python float repr", () => {
  // RULE-006 parameters + RULE-005 "NUMBER FORMATTING". legacy yolo_segmentation.py:39-42.
  // The f-string interpolates a Python float, so a whole number keeps its ".0" where JavaScript's
  // String(0) writes a bare "0". The full-frame fixture reaches 0.0 on both axes; its far edge is
  // 63/64, NOT 1.0, because a traced contour never leaves the pixel grid.
  it("writes whole numbers with a trailing .0", () => {
    const { context } = buildExportContext("full-frame-box");
    expect(renderYoloSegmentation(context)).toBe(
      "0 0.0 0.0 0.0 0.984375 0.984375 0.984375 0.984375 0.0\n",
    );
  });

  // RULE-006 parameters. legacy yolo_segmentation.py:40; Python repr(1.0) == "1.0".
  // 1.0 is UNREACHABLE from a traced mask (max contour coordinate is size-1), so this feeds a
  // hand-built contour on the image edge to pin the formatting rule itself.
  it("writes an on-edge coordinate as 1.0, not 1", () => {
    const context = syntheticContext({
      imageSize: [64, 64],
      classOrder: [0],
      instances: [{ channel: 0, contour: [[64, 64]] }],
    });
    expect(renderYoloSegmentation(context)).toBe("0 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0\n");
  });

  // RULE-006 parameters. legacy yolo_segmentation.py:40.
  // The 8192px fixture's single pixel sits at (0,0), so every coordinate is exactly 0.0. The
  // fixture rationale in tools/fixtures.json claims this case reaches Python's exponential form;
  // for YOLO Segmentation it does not (see the two tests below).
  it("writes the 8192px single-pixel case as plain zeros", () => {
    const { context } = buildExportContext("tiny-box-huge-image");
    expect(renderYoloSegmentation(context)).toBe("2 0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0\n");
  });

  // RULE-006 parameters. legacy yolo_segmentation.py:40; Python repr(1/8192) == "0.0001220703125".
  // Verified read-only against the lazylabel venv. The smallest non-zero coordinate an 8192px
  // image can produce is 1.22e-4, which is still ABOVE Python's 1e-4 exponential threshold.
  it("keeps positional form at the 1e-4 boundary", () => {
    const context = syntheticContext({
      imageSize: [8192, 8192],
      classOrder: [2],
      instances: [{ channel: 0, contour: [[1, 1]] }],
    });
    expect(renderYoloSegmentation(context)).toBe(
      "2 0.0001220703125 0.0001220703125 0.0001220703125 0.0001220703125 " +
        "0.0001220703125 0.0001220703125 0.0001220703125 0.0001220703125\n",
    );
  });

  // RULE-006 parameters. legacy yolo_segmentation.py:40; Python repr(1/20000) == "5e-05", where
  // JavaScript String(0.00005) gives "0.00005". Exponential form needs a coordinate below 1e-4,
  // which for this format means an image larger than 10000px, so no fixture reaches it.
  it("switches to exponential form with a zero-padded exponent below 1e-4", () => {
    const context = syntheticContext({
      imageSize: [20000, 20000],
      classOrder: [0],
      instances: [{ channel: 0, contour: [[1, 1]] }],
    });
    expect(renderYoloSegmentation(context)).toBe(
      "0 5e-05 5e-05 5e-05 5e-05 5e-05 5e-05 5e-05 5e-05\n",
    );
  });
});

describe("granularity: one line per outer contour, not per object", () => {
  // RULE-008; the "One line per object" docstring at yolo_segmentation.py:19-23 is wrong.
  // legacy exporters/__init__.py:122-126 yields every contour of every instance record, and
  // segment_manager.py:303-305 traces each segment with RETR_EXTERNAL.
  // The fixture holds ONE segment whose pixels fall in two islands; the manifest records
  // instanceCount 1 while the golden has two lines.
  it("writes two lines for one segment that fell into two islands", () => {
    const { context, instanceRecordCount } = buildExportContext("split-segment-two-islands");
    expect(instanceRecordCount).toBe(1);
    expect(renderedLines(renderYoloSegmentation(context) ?? "")).toEqual([
      "1 0.75 0.5 0.75 0.595 0.8475 0.595 0.8475 0.5",
      "1 0.025 0.05 0.025 0.095 0.0475 0.095 0.0475 0.05",
    ]);
  });

  // RULE-008. legacy exporters/__init__.py:122-126, segment_manager.py:296-313.
  // Two touching same-class segments stay apart in the instance path: x 0..49 and x 50..99.
  it("keeps two touching same-class objects on separate lines", () => {
    const context = syntheticContext({
      imageSize: [100, 100],
      classOrder: [1],
      channelMasks: [maskFromRects(100, 100, [[0, 0, 100, 50]])],
      instances: [
        {
          channel: 0,
          contour: [
            [0, 0],
            [0, 49],
            [49, 49],
            [49, 0],
          ],
        },
        {
          channel: 0,
          contour: [
            [50, 0],
            [50, 49],
            [99, 49],
            [99, 0],
          ],
        },
      ],
    });
    expect(renderedLines(renderYoloSegmentation(context) ?? "")).toEqual([
      "1 0.0 0.0 0.0 0.49 0.49 0.49 0.49 0.0",
      "1 0.5 0.0 0.5 0.49 0.99 0.49 0.99 0.0",
    ]);
  });
});

describe("line order follows instance then contour order", () => {
  // RULE-008 edge cases; RULE-005 note (2). legacy exporters/__init__.py:122-126.
  // OpenCV's enumeration is not top-to-bottom: the LOWER island (y=100) is written first, and the
  // golden proves it. MODERNIZATION_BRIEF.md decision 15(a) makes that order part of the contract.
  it("writes the lower island first, as OpenCV enumerated it", () => {
    const { context } = buildExportContext("split-segment-two-islands");
    const lines = renderedLines(renderYoloSegmentation(context) ?? "");
    // 0.75 * 400 = 300 (the lower-right island), 0.025 * 400 = 10 (the upper-left one).
    expect(lines[0]?.startsWith("1 0.75 0.5 ")).toBe(true);
    expect(lines[1]?.startsWith("1 0.025 0.05 ")).toBe(true);
  });

  // RULE-008. legacy exporters/__init__.py:122-126, segment_manager.py:303-305.
  // The fixture declares the pixels in the order (3,3) then (12,9); the writer emits (12,9) first.
  it("writes single-pixel objects in trace order, not declaration order", () => {
    const { context } = buildExportContext("single-pixel-objects");
    expect(renderedLines(renderYoloSegmentation(context) ?? "")).toEqual([
      "9 0.75 0.5625 0.75 0.5625 0.75 0.5625 0.75 0.5625",
      "9 0.1875 0.1875 0.1875 0.1875 0.1875 0.1875 0.1875 0.1875",
    ]);
  });

  // RULE-005 note (2): lines are never sorted by class id in the instance path.
  // legacy exporters/__init__.py:122-126 iterates ctx.instances verbatim.
  // No fixture reaches this, because every fixture happens to declare its segments in ascending
  // class order; this hand-built context puts channel 1 (class 7) before channel 0 (class 3).
  it("does not sort lines by class id", () => {
    const context = syntheticContext({
      imageSize: [100, 100],
      classOrder: [3, 7],
      instances: [
        {
          channel: 1,
          contour: [
            [10, 10],
            [10, 19],
            [19, 19],
            [19, 10],
          ],
        },
        {
          channel: 0,
          contour: [
            [0, 0],
            [0, 9],
            [9, 9],
            [9, 0],
          ],
        },
      ],
    });
    expect(renderedLines(renderYoloSegmentation(context) ?? "")).toEqual([
      "7 0.1 0.1 0.1 0.19 0.19 0.19 0.19 0.1",
      "3 0.0 0.0 0.0 0.09 0.09 0.09 0.09 0.0",
    ]);
  });
});

describe("class ids are written verbatim", () => {
  // RULE-005 Answer (2026-09-17) and RULE-014. legacy yolo_segmentation.py:43 writes
  // ctx.class_order[channel], never the 0..N-1 channel index and never the alias text.
  it("writes the sparse ids 3 and 7, not 0 and 1", () => {
    const { context } = buildExportContext("two-classes-sparse-ids");
    const lines = renderedLines(renderYoloSegmentation(context) ?? "");
    expect(lines.map((line) => line.split(" ")[0])).toEqual(["3", "7"]);
    expect(context.classLabels).toEqual(["cat", "dog"]);
  });

  // RULE-005 Answer (2026-09-17). legacy yolo_segmentation.py:43.
  // A single class whose id is 9 keeps the token 9 even though it is the only channel.
  it("writes a lone class id of 9 rather than channel 0", () => {
    const { context } = buildExportContext("single-pixel-objects");
    const lines = renderedLines(renderYoloSegmentation(context) ?? "");
    expect(lines.map((line) => line.split(" ")[0])).toEqual(["9", "9"]);
  });

  // RULE-005 Answer (2026-09-17). legacy yolo_segmentation.py:43.
  // Class 0 is a real class, not background, and shares a file with class 3.
  it("writes class 0 as the token 0", () => {
    const { context } = buildExportContext("class-zero-and-background");
    const lines = renderedLines(renderYoloSegmentation(context) ?? "");
    expect(lines.map((line) => line.split(" ")[0])).toEqual(["0", "3"]);
  });

  // RULE-006. legacy yolo_segmentation.py:43 writes the id; the alias never reaches the file.
  // Contrast FileManager.save_bb_txt (file_manager.py:105), the dead writer that emits names.
  it("never writes the class alias text", () => {
    const { context } = buildExportContext("non-ascii-aliases");
    const rendered = renderYoloSegmentation(context) ?? "";
    expect(rendered).not.toContain("Zelle");
    expect(rendered).not.toContain("\u7d30\u80de");
    expect(renderedLines(rendered).map((line) => line.split(" ")[0])).toEqual(["1", "5"]);
  });
});

describe("no file is produced when there is nothing to write", () => {
  // RULE-006; legacy yolo_segmentation.py:45-46 returns None when no contour produced a line,
  // WITHOUT writing and WITHOUT deleting, so a stale _seg.txt survives with outdated polygons.
  it("returns null when instances are empty and every channel is blank", () => {
    const context = syntheticContext({ imageSize: [40, 40], classOrder: [1] });
    expect(renderYoloSegmentation(context)).toBeNull();
  });

  // RULE-006; legacy yolo_segmentation.py:26-28. The guard is "h <= 0 or w <= 0", not "== 0",
  // and it runs BEFORE any contour is looked at, so instances cannot rescue it.
  it("returns null for a zero-height image even with instances present", () => {
    const context = syntheticContext({
      imageSize: [0, 640],
      classOrder: [0],
      instances: [{ channel: 0, contour: [[1, 1]] }],
    });
    expect(renderYoloSegmentation(context)).toBeNull();
  });

  // RULE-006; legacy yolo_segmentation.py:26-28.
  it("returns null for a zero-width image", () => {
    const context = syntheticContext({
      imageSize: [480, 0],
      classOrder: [0],
      instances: [{ channel: 0, contour: [[1, 1]] }],
    });
    expect(renderYoloSegmentation(context)).toBeNull();
  });

  // RULE-006; legacy yolo_segmentation.py:26-28. "<= 0" also covers negative sizes.
  it("returns null for a negative image size", () => {
    const context = syntheticContext({
      imageSize: [-1, -1],
      classOrder: [0],
      instances: [{ channel: 0, contour: [[1, 1]] }],
    });
    expect(renderYoloSegmentation(context)).toBeNull();
  });

  // RULE-006; legacy yolo_segmentation.py:45-46 with exporters/__init__.py:128-136: an image with
  // no classes at all has no channels to contour.
  it("returns null when the class order is empty", () => {
    const context = syntheticContext({ imageSize: [40, 40], classOrder: [] });
    expect(renderYoloSegmentation(context)).toBeNull();
  });
});

describe("empty instances fall back to the merged per-class channels", () => {
  // RULE-005 note (3), RULE-008 "reloaded segments fuse". legacy exporters/__init__.py:122
  // tests truthiness, so an EMPTY list silently selects the merged-channel path at :128-136.
  // Same pixels as the "two touching objects" test above, one fused line instead of two.
  it("fuses touching same-class objects into one line", () => {
    const context = syntheticContext({
      imageSize: [100, 100],
      classOrder: [1],
      channelMasks: [maskFromRects(100, 100, [[0, 0, 100, 50]])],
      instances: [],
    });
    expect(renderedLines(renderYoloSegmentation(context) ?? "")).toEqual([
      "1 0.0 0.0 0.0 0.49 0.99 0.49 0.99 0.0",
    ]);
  });

  // RULE-005 note (3). legacy exporters/__init__.py:128-131 skips channels with no set pixel.
  it("skips an all-zero channel and keeps the surviving class id", () => {
    const context = syntheticContext({
      imageSize: [100, 100],
      classOrder: [3, 7],
      channelMasks: [
        maskFromRects(100, 100, []),
        maskFromRects(100, 100, [[10, 10, 20, 20]]),
      ],
      instances: [],
    });
    expect(renderedLines(renderYoloSegmentation(context) ?? "")).toEqual([
      "7 0.1 0.1 0.1 0.19 0.19 0.19 0.19 0.1",
    ]);
  });

  // RULE-005 note (3), RULE-014. legacy exporters/__init__.py:128 walks channels in order, and
  // class_order is sorted, so the fallback path IS ordered by ascending class id.
  it("emits channels in ascending class id order", () => {
    const context = syntheticContext({
      imageSize: [100, 100],
      classOrder: [3, 7],
      channelMasks: [
        maskFromRects(100, 100, [[0, 0, 10, 10]]),
        maskFromRects(100, 100, [[10, 10, 20, 20]]),
      ],
      instances: [],
    });
    expect(renderedLines(renderYoloSegmentation(context) ?? "")).toEqual([
      "3 0.0 0.0 0.0 0.09 0.09 0.09 0.09 0.0",
      "7 0.1 0.1 0.1 0.19 0.19 0.19 0.19 0.1",
    ]);
  });
});

describe("polygon simplification and degenerate contours", () => {
  // RULE-006 "epsilon = 0.001 x contour arc length". legacy yolo_segmentation.py:34-35.
  // A redundant collinear midpoint at (50,99) is dropped by approxPolyDP; the four corners stay.
  // Verified read-only: arcLength 396.0, epsilon 0.396, approx [[0,0],[0,99],[99,99],[99,0]].
  it("drops a collinear point at epsilon 0.001 of the closed arc length", () => {
    const context = syntheticContext({
      imageSize: [100, 100],
      classOrder: [0],
      instances: [
        {
          channel: 0,
          contour: [
            [0, 0],
            [0, 99],
            [50, 99],
            [99, 99],
            [99, 0],
          ],
        },
      ],
    });
    expect(renderYoloSegmentation(context)).toBe("0 0.0 0.0 0.0 0.99 0.99 0.99 0.99 0.0\n");
  });

  // RULE-006 edge case "a 1-pixel object is written as the same point repeated 4 times".
  // legacy exporters/__init__.py:156-157. The golden for single-pixel-objects shows the repeat.
  it("repeats a single-point contour four times", () => {
    const { context } = buildExportContext("single-pixel-objects");
    const lines = renderedLines(renderYoloSegmentation(context) ?? "");
    expect(lines[0]).toBe("9 0.75 0.5625 0.75 0.5625 0.75 0.5625 0.75 0.5625");
  });

  // RULE-006 edge case "a 1-pixel-wide line as a there-and-back 4-point ring".
  // legacy exporters/__init__.py:152-154. No fixture produces a two-point contour, so this feeds
  // one directly: (5,5) then (7,9) becomes x1 y1 x2 y2 x2 y2 x1 y1.
  // ARCHITECTURE.md:179-180 claims a bounding-box outline is used instead; the code does not.
  it("expands a two-point contour into a there-and-back ring", () => {
    const context = syntheticContext({
      imageSize: [100, 100],
      classOrder: [0],
      instances: [
        {
          channel: 0,
          contour: [
            [5, 5],
            [7, 9],
          ],
        },
      ],
    });
    expect(renderYoloSegmentation(context)).toBe("0 0.05 0.05 0.07 0.09 0.07 0.09 0.05 0.05\n");
  });

  // RULE-006 edge case "holes are not exported (external contours only)"; the crop fixture also
  // pins RULE-016: crop does not move the coordinate frame, coordinates stay divided by the FULL
  // width and height, and the clamped-inclusive/applied-exclusive crop clears the last row and
  // column (legacy file_manager.py:712-739). Crop [0,10,99,79] on an 80x100 image leaves
  // y 10..78 and x 0..98.
  it("keeps the full-image coordinate frame under a crop", () => {
    const { context } = buildExportContext("crop-clears-last-row-and-column");
    expect(renderYoloSegmentation(context)).toBe("2 0.0 0.125 0.0 0.975 0.98 0.975 0.98 0.125\n");
  });
});

describe("file shape", () => {
  // RULE-006 / RULE-005 note (5). legacy yolo_segmentation.py:51-52 writes line + "\n" for every
  // line INCLUDING the last, and never a blank line beyond that terminator.
  it.each(CASES)("%s ends every line with a terminator and adds no blank line", (id) => {
    const { context } = buildExportContext(id);
    const rendered = renderYoloSegmentation(context);
    expect(rendered).not.toBeNull();
    expect(rendered?.endsWith("\n")).toBe(true);
    expect(rendered).not.toContain("\n\n");
    expect(rendered).not.toContain("\r");
  });

  // RULE-006 parameters. legacy yolo_segmentation.py:40-43: fields are joined with a single
  // U+0020, with no leading or trailing space, no header and no comment lines.
  it.each(CASES)("%s separates fields with single spaces only", (id) => {
    const { context } = buildExportContext(id);
    for (const line of renderedLines(renderYoloSegmentation(context) ?? "")) {
      expect(line).not.toMatch(/ {2}|^ | $|\t/);
      // class id + an even number of coordinates, at least 3 pairs after contour_to_polygon.
      const tokens = line.split(" ");
      expect(tokens.length % 2).toBe(1);
      expect(tokens.length).toBeGreaterThanOrEqual(7);
    }
  });

  // RULE-006 "output <base>_seg.txt". legacy yolo_segmentation.py:55-56 uses
  // os.path.splitext(image_path)[0] + "_seg.txt"; the renderer returns content, so the path comes
  // from outputPathFor.
  it("pairs its content with a _seg.txt sidecar name", () => {
    expect(outputPathFor("/data/img.png", "YOLO_SEGMENTATION")).toBe("/data/img_seg.txt");
    expect(outputPathFor("/data/img.tar.png", "YOLO_SEGMENTATION")).toBe("/data/img.tar_seg.txt");
  });
});
