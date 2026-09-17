/**
 * YOLO Segmentation: normalized polygon vertices, one line per object, in `<base>_seg.txt`.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/yolo_segmentation.py:25-56.
 * Reader ported from legacy/lazylabel/src/lazylabel/core/file_manager.py:542-600 and the label
 * resolution at :345-379.
 *
 * Implements the rule cards "YOLO Segmentation export polygon simplification",
 * "YOLO Segmentation import validation" and "Label text to class ID resolution on import".
 */
import type { LoadedAnnotations, ExportContext } from "../types.js";
/**
 * Render the file body, or null where the legacy exporter writes no file.
 *
 * Null means "write nothing", which is NOT the same as "delete": a stale `_seg.txt` from an earlier
 * save survives, because exporting never removes files (decision 15f covers warning about that).
 */
export declare function renderYoloSegmentation(ctx: ExportContext): string | null;
/**
 * Parse a `_seg.txt` body into segments.
 *
 * Validation matches the legacy loader exactly: a line needs at least 7 whitespace-separated tokens
 * and an odd token count, coordinates must all parse as numbers, and fewer than 3 points is
 * dropped. Coordinates denormalize with round-half-to-even, so a tie moves to the EVEN pixel.
 * A polygon that rasterizes to no pixels is dropped rather than stored empty.
 *
 * The label token is never parsed as a number here, so a line beginning "dog" loads fine. A
 * non-finite coordinate rejects the entire file rather than one line, because that is what the
 * legacy loader does and skipping the line would draw polygons legacy never draws.
 */
export declare function parseYoloSegmentation(text: string, imageSize: readonly [number, number], existingAliases?: ReadonlyMap<number, string>): LoadedAnnotations;
//# sourceMappingURL=yoloSegmentation.d.ts.map