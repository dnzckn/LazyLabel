/**
 * Pascal VOC: one XML file per image with a box per object.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/pascal_voc.py:22-59.
 * Reader ported from FileManager.load_pascal_voc_xml (file_manager.py:456-493).
 *
 * Implements the rule card "Pascal VOC export uses alias names and exclusive max bounds".
 *
 * WARNING for consumers: these files are NOT devkit-compatible. The VOC devkit convention is
 * 1-based with inclusive xmax/ymax; LazyLabel writes 0-based with EXCLUSIVE xmax/ymax, so a reader
 * applying the devkit rule sees every box one pixel too wide and too tall, with the extra pixel on
 * the left and top edges. Decision 15i keeps the legacy convention and documents it here.
 *
 * Serialization detail that byte-identity depends on: ElementTree writes a single-quoted
 * declaration, indents with two spaces, and ends without a trailing newline.
 */
import type { ExportContext, LoadedAnnotations } from "../types.js";
/** Render the document, or null when there is no object to write. */
export declare function renderPascalVoc(ctx: ExportContext): string | null;
/**
 * Parse a VOC document into segments.
 *
 * An object without a name or a bndbox is skipped and counted in `rejected`, a missing coordinate
 * defaults to 0, and xmax/ymax are read as exclusive, matching what the writer emits. A document
 * that is not XML, or carries no <annotation> root, is refused outright rather than read as "no
 * objects", which would win the load chain and show an empty canvas (decision 15c).
 */
export declare function parsePascalVoc(text: string, imageSize: readonly [number, number], existingAliases?: ReadonlyMap<number, string>): LoadedAnnotations;
//# sourceMappingURL=pascalVoc.d.ts.map