/**
 * YOLO Detection: one normalized centre/size box per object, in `<base>.txt`.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/yolo_detection.py:19-46.
 * Reader ported from FileManager.load_bb_txt (file_manager.py:412-454).
 *
 * Implements the rule cards "YOLO Detection export line format" and
 * "YOLO Detection import validation, rounding and clamping".
 *
 * Do NOT use FileManager.save_bb_txt (file_manager.py:74-123) as a reference: it writes the same
 * path but emits the alias NAME instead of the class id, and nothing in the app calls it.
 */
import { MalformedAnnotationError } from "./labels.js";
import type { ExportContext, LoadedAnnotations } from "../types.js";
/** Render the file body, or null where the legacy exporter writes no file. */
export declare function renderYoloDetection(ctx: ExportContext): string | null;
/**
 * Parse a `.txt` body into segments.
 *
 * A line must have exactly 5 whitespace-separated tokens, and its four coordinates must parse as
 * numbers; anything else is skipped. Corners are recovered as round-half-to-even of the
 * denormalized centre and size, so a tie lands on the EVEN pixel. A non-finite coordinate rejects
 * the whole file, as in legacy.
 */
export declare function parseYoloDetection(text: string, imageSize: readonly [number, number], existingAliases?: ReadonlyMap<number, string>): LoadedAnnotations;
export { MalformedAnnotationError };
//# sourceMappingURL=yoloDetection.d.ts.map