/**
 * Label parsing and class-id resolution shared by every text and XML importer.
 *
 * Ported from FileManager._build_label_map (legacy/lazylabel/src/lazylabel/core/file_manager.py:345-379)
 * and the float/int parsing the loaders rely on. Implements the rule card
 * "Label text to class ID resolution on import".
 */
/**
 * Resolve every label in ONE annotation file to a class id.
 *
 * Order per label: an existing alias wins, then a plain integer, then a freshly assigned id.
 * Assignment happens only after every numeric label in the file has claimed its id, so a file
 * mixing "dog" with "0" does not hand both the same id and merge two classes into one.
 *
 * The returned `aliases` map holds ONLY the pairs this file establishes, never the caller's
 * existing table echoed back. The caller merges. Returning the merge instead would make a reader's
 * output depend on what the caller happened to pass, which is how a store silently loses class
 * names when one sidecar exists rather than another.
 */
export declare function buildLabelMap(labels: readonly string[], existingAliases: ReadonlyMap<number, string>): {
    labelMap: Map<string, number>;
    aliases: Map<number, string>;
};
/**
 * Python's float(), which differs from JavaScript's Number() in both directions.
 *
 * Python accepts, JavaScript does not: "nan", "inf", "infinity", and digit separators such as
 * "1_0" (10.0) or "1_0e1_0", allowed singly BETWEEN digits only (PEP 515).
 * JavaScript accepts, Python does not: "0x10", "0b1", "" and " " (Number gives 16, 1, 0 and 0).
 *
 * Returns null where float() raises ValueError, which makes the caller skip that line. A returned
 * NaN or Infinity is NOT a parse failure: the legacy loaders accept it here and then raise later,
 * when int(round(...)) is applied, which discards the whole file rather than one line.
 */
export declare function parseFloatLikePython(token: string): number | null;
/**
 * Python's int(): optional sign, then digits with optional single separators between them.
 *
 * "1_0" is 10, so a label written that way stays NUMERIC. Treating it as a name instead would
 * quietly split one class into two on reload, with a fresh id and an alias.
 */
export declare function parseIntLikePython(token: string): number | null;
/**
 * Raised when a coordinate is not finite.
 *
 * The legacy loaders let "nan" and "inf" through float() and then hit int(round(...)), which raises
 * OUTSIDE their per-line try block, so the entire file is discarded rather than one line skipped.
 * Reproducing the whole-file abort matters: skipping just the line would draw polygons the legacy
 * app never draws. Decision 15c requires the caller to report this rather than fall through to a
 * lower-priority file.
 */
export declare class MalformedAnnotationError extends Error {
    constructor(message: string);
}
/** Mirror int(round(value)): round-half-to-even, then refuse a non-finite result. */
export declare function toPixel(value: number, what: string): number;
/**
 * As toPixel, but for coordinates that legacy hands to `np.array(..., dtype=np.int32)`.
 *
 * NumPy raises OverflowError past the 32-bit range, and that raise happens outside the loaders'
 * per-line guard, so the whole file is abandoned rather than the polygon clipped. Only the polygon
 * paths convert this way; the box paths clamp to the image instead and never overflow.
 */
export declare function toInt32Pixel(value: number, what: string): number;
/**
 * Refuse content that is not text at all.
 *
 * A JPEG renamed to .txt, or a truncated binary file, otherwise parses to "no annotations", wins
 * the load chain and shows the user an empty canvas. A NUL byte is the cheapest reliable signal,
 * and no annotation format this library reads may contain one.
 */
export declare function assertText(content: string, format: string): void;
//# sourceMappingURL=labels.d.ts.map