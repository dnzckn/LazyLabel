/**
 * Turning imported boxes into segments, shared by the YOLO detection, Pascal VOC and CreateML readers.
 *
 * Ported from FileManager._add_box_segments (legacy/lazylabel/src/lazylabel/core/file_manager.py:381-410).
 */
import { buildLabelMap } from "./labels.js";
/**
 * Clamp each box to the image and fill it as a rectangular mask.
 *
 * A box that collapses to nothing after clamping is dropped, but its label has already claimed a
 * class id, so the id stays burned for the rest of the file. That is legacy behavior the rewrite
 * keeps, because the ids it burns are visible in exports.
 */
export function boxesToSegments(boxes, imageSize, existingAliases = new Map()) {
    const [height, width] = imageSize;
    const { labelMap, aliases } = buildLabelMap(boxes.map((box) => box.label), existingAliases);
    const segments = [];
    let rejected = 0;
    for (const box of boxes) {
        const x1 = Math.max(0, box.x1);
        const y1 = Math.max(0, box.y1);
        const x2 = Math.min(width, box.x2);
        const y2 = Math.min(height, box.y2);
        if (x2 <= x1 || y2 <= y1) {
            rejected += 1; // collapsed entirely against the image edge
            continue;
        }
        const data = new Uint8Array(height * width);
        for (let y = y1; y < y2; y += 1)
            data.fill(1, y * width + x1, y * width + x2);
        segments.push({ type: "Loaded", classId: labelMap.get(box.label), mask: { height, width, data } });
    }
    return { segments, classAliases: aliases, rejected };
}
//# sourceMappingURL=boxes.js.map