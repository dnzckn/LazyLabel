/**
 * Choosing which annotation file wins when an image has several.
 *
 * Ported from FileManager._LOAD_CHAIN and load_annotations
 * (legacy/lazylabel/src/lazylabel/core/file_manager.py:125-205) and the LOAD_PRIORITY table
 * (core/exporters/__init__.py:65-81). Implements the rule card "Annotations load from the best file
 * present, and a damaged non-NPZ file stops the search".
 *
 * Priority, most faithful first: NPZ, YOLO Segmentation, COCO, NPZ Class Map, Pascal VOC, CreateML,
 * YOLO Detection. Pixel masks beat polygons beat boxes; within that, formats that keep objects
 * apart beat formats that merge everything of one class.
 *
 * ONE DELIBERATE DEVIATION, required by decisions 7 and 15c. In legacy, five of the seven loaders
 * catch their own read and parse errors and return normally, so a damaged file yields zero segments
 * and the chain STOPS there, showing an empty canvas. With auto-save on, navigating away then
 * deletes the user's healthy annotation files. Here a damaged file raises AnnotationLoadError, the
 * caller must surface it, and nothing is deleted. The priority order itself is unchanged.
 */
import { type AnnotationFormat, type LoadedAnnotations } from "../types.js";
/** The bytes or text of one candidate file, keyed by the format that writes it. */
export type AnnotationSources = Partial<Record<AnnotationFormat, string | Uint8Array>>;
export interface LoadOutcome extends LoadedAnnotations {
    /** Which format actually supplied the annotations. */
    readonly format: AnnotationFormat;
}
/** Raised when the winning file exists but cannot be read. Never presented as "no annotations". */
export declare class AnnotationLoadError extends Error {
    readonly format: AnnotationFormat;
    readonly cause: unknown;
    constructor(format: AnnotationFormat, cause: unknown);
}
/**
 * Load the highest-priority file present.
 *
 * Returns null only when no candidate file exists at all. A file that exists but parses to zero
 * segments still wins the chain, exactly as in legacy, so an empty file is not silently skipped in
 * favour of a lower-priority one.
 */
export declare function loadAnnotations(sources: AnnotationSources, imageSize: readonly [number, number], existingAliases?: ReadonlyMap<number, string>): Promise<LoadOutcome | null>;
//# sourceMappingURL=chain.d.ts.map