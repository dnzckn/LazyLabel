/**
 * NPZ Class Map: one class id per pixel, plus a foreground mask so class 0 survives a round trip.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:20-73.
 * Reader ported from FileManager.load_npz_class_map (file_manager.py:282-333).
 *
 * Implements the rule card "NPZ Class Map export resolves overlaps to lowest class and stores
 * foreground". Two traps the rule review confirmed against the code:
 *   - "lowest class wins an overlap" is really "the FIRST channel wins", which only coincides with
 *     lowest because callers pass a sorted classOrder.
 *   - ids are stored as 16-bit, so an id above 65535 cannot be represented; the legacy writer
 *     raises rather than wrapping, and so does this one.
 */
import type { ExportContext, LoadedAnnotations } from "../types.js";
/** Render the archive, or null when the tensor is empty or no pixel carries a class. */
export declare function renderNpzClassMap(ctx: ExportContext): Promise<Uint8Array | null>;
/**
 * Parse a class map into one segment per distinct class id present.
 *
 * Without a `foreground` member, a pixel of 0 is treated as background, which silently drops every
 * class-0 annotation in files written before that member existed. A class map whose shape does not
 * match the image is rejected, and the caller must surface that rather than show an empty canvas
 * (decision 15c).
 */
export declare function parseNpzClassMap(bytes: Uint8Array, imageSize?: readonly [number, number]): Promise<LoadedAnnotations>;
//# sourceMappingURL=npzClassMap.d.ts.map