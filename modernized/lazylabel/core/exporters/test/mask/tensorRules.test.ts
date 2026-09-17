/**
 * Mask composition clauses no fixture reaches.
 *
 * RULE-015 (shape rasterization: the rule card's own worked example, and the circle CENTRE, which
 * every fixture leaves on a whole pixel), RULE-016 (the degenerate crop that empties the image),
 * RULE-010 (a stored mask whose size differs from the image), RULE-008 (such a segment is omitted
 * from the instance-aware exports) and the P1-visible consequence of RULE-053 (a malformed undo
 * record adds a class, and therefore an empty channel to every NPZ).
 *
 * ORACLE: the LEGACY `SegmentManager.rasterize_circle`, `rasterize_polygon`,
 * `create_final_mask_tensor`, `create_instance_contours` and `FileManager._apply_crop_to_mask`
 * (legacy/lazylabel/src/lazylabel/core/segment_manager.py:174-315,
 * legacy/lazylabel/src/lazylabel/core/file_manager.py:712-739), run read-only under
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 * with OpenCV 4.12.0 and numpy 2.2.6, reporting set-pixel counts and inclusive pixel bounds, and
 * where a whole file is named, the exporter's output for the same context.
 */

import { describe, expect, it } from "vitest";

import { renderCoco } from "../../src/format/coco.js";
import { renderNpz } from "../../src/format/npz.js";
import { renderYoloDetection } from "../../src/format/yoloDetection.js";
import {
  applyCrop,
  createFinalMaskTensor,
  createInstanceContours,
  rasterizeSegment,
} from "../../src/mask/tensor.js";
import { decodeNpy } from "../../src/util/npy.js";
import { readZip } from "../../src/util/zip.js";
import type { BinaryMask, ExportContext, MaskTensor, Segment } from "../../src/types.js";
import { channelOf, countSetTensorPixels, maskBounds, maskFromRects } from "../helpers/fixtures.js";

function bounds(mask: BinaryMask | null) {
  return mask === null ? null : maskBounds(mask);
}

function setPixels(mask: BinaryMask | null): number {
  if (mask === null) return 0;
  let total = 0;
  for (const value of mask.data) if (value) total += 1;
  return total;
}

/** An ExportContext over one tensor and its instance contours, as a save path assembles one. */
function contextFor(
  segments: readonly Segment[],
  imageSize: readonly [number, number],
  classOrder: readonly number[],
): { tensor: MaskTensor; context: ExportContext } {
  const tensor = createFinalMaskTensor(segments, imageSize, classOrder);
  const instances = createInstanceContours(segments, imageSize, classOrder, tensor);
  return {
    tensor,
    context: {
      imagePath: "image.png",
      imageSize,
      classOrder,
      classLabels: classOrder.map(String),
      classAliases: new Map(),
      maskTensor: tensor,
      cropCoords: null,
      instances,
    },
  };
}

describe("shape rasterization, the rule card's worked example (RULE-015)", () => {
  it("turns a box dragged from (10.7, 10.2) to (20.9, 30.8) into 231 pixels and a [10,10,11,21] box", () => {
    // Oracle: 231 px spanning x 10..20 and y 10..30 on a 640x480 image; the COCO box is
    // [10, 10, 11, 21] with area 200, and YOLO writes width 11/640 = 0.0171875. The vertices are
    // TRUNCATED toward zero by np.int32, and cv2.fillPoly includes both edges, so the exported box
    // is one pixel wider and taller than the drawn span.
    const box: Segment = {
      type: "Polygon",
      classId: 0,
      vertices: [
        [10.7, 10.2],
        [20.9, 10.2],
        [20.9, 30.8],
        [10.7, 30.8],
      ],
    };
    const { tensor, context } = contextFor([box], [480, 640], [0]);

    expect(countSetTensorPixels(tensor)).toBe(231);
    expect(maskBounds(channelOf(tensor, 0))).toEqual([10, 10, 20, 30]);
    expect(renderCoco(context)).toContain('"bbox": [\n        10,\n        10,\n        11,\n        21\n      ]');
    expect(renderCoco(context)).toContain('"area": 200');
    expect(renderYoloDetection(context)).toBe("0 0.02421875 0.042708333333333334 0.0171875 0.04375\n");
  });

  it("turns a circle at (20.4, 20.6) with a radius point 5.4 px away into 81 pixels", () => {
    // Oracle: centre rounds to (20, 21), radius rounds to 5, and cv2.circle fills 81 px spanning
    // x 15..25, y 16..26.
    const circle: Segment = { type: "Circle", classId: 1, vertices: [[20.4, 20.6], [25.8, 20.6]] };
    const mask = rasterizeSegment(circle, 100, 100);

    expect(setPixels(mask)).toBe(81);
    expect(bounds(mask)).toEqual([15, 16, 25, 26]);
  });

  it("rounds a circle CENTRE half to even, which no golden fixture exercises", () => {
    // Every fixture centre is a whole pixel, so a port using Math.round would pass the goldens.
    // Oracle: centre x 20.5 rounds DOWN to 20, giving columns 17..23; centre x 21.5 rounds UP to
    // 22, giving columns 19..25. Both hold 29 px at radius 3.
    const at = (cx: number) =>
      bounds(rasterizeSegment({ type: "Circle", classId: 0, vertices: [[cx, 10], [cx + 3, 10]] }, 40, 40));

    expect(at(20.5)).toEqual([17, 7, 23, 13]);
    expect(at(21.5)).toEqual([19, 7, 25, 13]);
  });
});

describe("the crop's degenerate cases (RULE-016)", () => {
  it("empties the whole mask once clamping collapses the crop to zero width", () => {
    // Oracle: _apply_crop_to_mask with (4, 4, 4, 9) on a 10x10 tensor of ones leaves 0 pixels.
    // Reachable from the UI: the > 5 px gate is measured on the float rectangle BEFORE truncation
    // and clamping, so a drag from x = 99.4 to x = 110 on a 100 px image lands here.
    const ones = createFinalMaskTensor(
      [{ type: "AI", classId: 0, mask: maskFromRects(10, 10, [[0, 0, 10, 10]]) }],
      [10, 10],
      [0],
    );
    expect(countSetTensorPixels(applyCrop(ones, [4, 4, 4, 9]))).toBe(0);
  });

  it("keeps rows y1..y2-1 and columns x1..x2-1, so a 2,2 to 5,5 crop keeps 9 pixels", () => {
    // Oracle: 9 px spanning x 2..4, y 2..4 - the slice ends are exclusive on both axes.
    const ones = createFinalMaskTensor(
      [{ type: "AI", classId: 0, mask: maskFromRects(10, 10, [[0, 0, 10, 10]]) }],
      [10, 10],
      [0],
    );
    const cropped = applyCrop(ones, [2, 2, 5, 5]);
    expect(countSetTensorPixels(cropped)).toBe(9);
    expect(maskBounds(channelOf(cropped, 0))).toEqual([2, 2, 4, 4]);
  });

  it("loses the last row and column even when the crop covers the whole image", () => {
    // Oracle: the widest crop clamping allows on a 10x10 image is (0, 0, 9, 9), and it keeps 81 px,
    // not 100. Preserved deliberately (decision 15h).
    const ones = createFinalMaskTensor(
      [{ type: "AI", classId: 0, mask: maskFromRects(10, 10, [[0, 0, 10, 10]]) }],
      [10, 10],
      [0],
    );
    const cropped = applyCrop(ones, [0, 0, 9, 9]);
    expect(countSetTensorPixels(cropped)).toBe(81);
    expect(maskBounds(channelOf(cropped, 0))).toEqual([0, 0, 8, 8]);
  });
});

describe("an object entirely covered by a higher-priority class (RULE-012)", () => {
  /** Class 1 fills x,y 2..17; class 4 sits wholly inside it at 6..9. */
  function overlapping(ascending: boolean) {
    const segments: Segment[] = [
      { type: "AI", classId: 1, mask: maskFromRects(20, 20, [[2, 2, 18, 18]]) },
      { type: "AI", classId: 4, mask: maskFromRects(20, 20, [[6, 6, 10, 10]]) },
    ];
    const tensor = createFinalMaskTensor(segments, [20, 20], [1, 4], { enabled: true, ascending });
    const instances = createInstanceContours(segments, [20, 20], [1, 4], tensor);
    return {
      tensor,
      instances,
      context: {
        imagePath: "image.png",
        imageSize: [20, 20],
        classOrder: [1, 4],
        classLabels: ["1", "4"],
        classAliases: new Map(),
        maskTensor: tensor,
        cropCoords: null,
        instances,
      } satisfies ExportContext,
    };
  }

  it("disappears from the detection exports under ascending priority", () => {
    // Oracle: channel sums [256, 0], one instance record (class 1), and the .txt holds one line.
    // The object is still in the segment store; it is the intersection with the prioritized tensor
    // at segment_manager.py:297 that removes it. Losing a whole object is the reason this is P0.
    const { tensor, instances, context } = overlapping(true);
    expect([setPixels(channelOf(tensor, 0)), setPixels(channelOf(tensor, 1))]).toEqual([256, 0]);
    expect(instances.map((instance) => instance.channel)).toEqual([0]);
    expect(renderYoloDetection(context)).toBe("1 0.5 0.5 0.8 0.8\n");
  });

  it("survives, and punches a hole in the lower class, under descending priority", () => {
    // Oracle: channel sums [240, 16] and two lines, class 1 then class 4.
    const { tensor, context } = overlapping(false);
    expect([setPixels(channelOf(tensor, 0)), setPixels(channelOf(tensor, 1))]).toEqual([240, 16]);
    expect(renderYoloDetection(context)).toBe("1 0.5 0.5 0.8 0.8\n4 0.4 0.4 0.2 0.2\n");
  });
});

describe("a malformed undo record reaches the exported file (RULE-053, RULE-014)", () => {
  it("adds an empty channel to the NPZ and no line to the detection file", () => {
    // Undoing an erase appends the WRAPPER {index, segment} rather than the segment
    // (undo_redo_manager.py:574-629), so the store gains a record with no mask, no type and no
    // vertices - but with a class id. Oracle: class_order comes back [1, 4], the mask is
    // (10, 10, 2) with channel sums [9, 0], and YOLO Detection writes only "1 0.15 0.15 0.3 0.3".
    const segments: Segment[] = [
      { type: "AI", classId: 1, mask: maskFromRects(10, 10, [[0, 0, 3, 3]]) },
      { type: "AI", classId: 4 }, // the wrapper: no mask, no vertices
    ];
    const { tensor, context } = contextFor(segments, [10, 10], [1, 4]);

    expect(tensor.classOrder).toEqual([1, 4]);
    expect(setPixels(channelOf(tensor, 0))).toBe(9);
    expect(setPixels(channelOf(tensor, 1))).toBe(0);
    expect(renderYoloDetection(context)).toBe("1 0.15 0.15 0.3 0.3\n");
  });

  it("writes that empty channel into the archive rather than dropping the class", async () => {
    const segments: Segment[] = [
      { type: "AI", classId: 1, mask: maskFromRects(10, 10, [[0, 0, 3, 3]]) },
      { type: "AI", classId: 4 },
    ];
    const { context } = contextFor(segments, [10, 10], [1, 4]);
    const archive = await renderNpz(context);

    const members = new Map((await readZip(archive!)).map((entry) => [entry.name, entry.data]));
    expect(decodeNpy(members.get("mask.npy")!).shape).toEqual([10, 10, 2]);
    expect(Array.from(decodeNpy(members.get("class_order.npy")!).data as Float64Array)).toEqual([1, 4]);
  });
});

describe("a segment whose mask is the wrong size (RULE-010, RULE-008)", () => {
  it("is omitted from the instance contours, so it writes no object", () => {
    // Oracle: create_instance_contours returns [] for a 5x5 mask on a 10x10 image
    // (segment_manager.py:294-295), so the detection formats never see the object.
    const segments: Segment[] = [
      { type: "AI", classId: 1, mask: maskFromRects(5, 5, [[0, 0, 2, 2]]) },
    ];
    const tensor = createFinalMaskTensor([], [10, 10], [1]);
    expect(createInstanceContours(segments, [10, 10], [1], tensor)).toHaveLength(0);
  });

  // PENDING: implementation gap, reported rather than fixed (this task may not edit src/).
  // Oracle: `np.logical_or(final_mask_tensor[:, :, c], mask)` at segment_manager.py:242-244 raises
  // "ValueError: operands could not be broadcast together with shapes (10,10) (5,5)", which the
  // save path reports as "Error saving: ..." and writes nothing (RULE-010's edge case).
  // src/mask/tensor.ts:59-63 instead indexes past the end of the short mask, reads undefined as 0,
  // and silently folds the 5x5 mask's first 25 values into the first 25 pixels of the 10x10 image:
  // a 2x2 block at the origin becomes pixels (0,0), (0,1), (0,5) and (0,6). Unskip once
  // createFinalMaskTensor rejects a mask whose size is not the image size.
  it("refuses to compose a mask whose size is not the image size", () => {
    const segments: Segment[] = [
      { type: "AI", classId: 1, mask: maskFromRects(5, 5, [[0, 0, 2, 2]]) },
    ];
    expect(() => createFinalMaskTensor(segments, [10, 10], [1])).toThrow();
  });
});
