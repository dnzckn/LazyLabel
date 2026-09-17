/**
 * CreateML: Apple's JSON box format, one file per image, in `<base>_createml.json`.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/createml.py:33-64.
 * Reader ported from FileManager.load_createml_json (file_manager.py:495-540).
 *
 * Implements the rule cards "CreateML export/import: pixel center boxes" and
 * "Pascal VOC and CreateML import rules".
 *
 * Boxes are centre-based in PIXELS, not normalized, and the centre is computed as
 * x + width/2 on integers, so a box of odd width lands on a .5 centre. The reader rebuilds the
 * corner with round-half-to-even, which is not always the inverse.
 */
import type { ExportContext, LoadedAnnotations } from "../types.js";
/** Render the document, or null when there is no object to write. */
export declare function renderCreateMl(ctx: ExportContext): string | null;
/**
 * Parse a CreateML document into segments.
 *
 * Only the FIRST image entry is read, which is how the legacy loader behaves: a file describing
 * several images contributes only its first. An annotation without a coordinates object is skipped.
 */
export declare function parseCreateMl(text: string, imageSize: readonly [number, number], existingAliases?: ReadonlyMap<number, string>): LoadedAnnotations;
//# sourceMappingURL=createMl.d.ts.map