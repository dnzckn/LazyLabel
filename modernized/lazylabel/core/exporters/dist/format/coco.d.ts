/**
 * COCO JSON: one file per image, with polygon segmentation, a box and an area per object.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/coco.py:19-97.
 * Reader ported from FileManager.load_coco_json (file_manager.py:602-710).
 *
 * Implements the rule cards "COCO JSON export structure and area" and
 * "COCO JSON import with polygon-then-box fallback".
 *
 * Note for anyone comparing with other COCO tooling: `area` here is the TRUNCATED contour area, not
 * the mask pixel count that pycocotools computes, and the box is [x, y, width, height] with an
 * inclusive pixel span. Both are legacy behavior the rewrite reproduces exactly (decision 10).
 */
import type { ExportContext, LoadedAnnotations } from "../types.js";
/** Split "name.supercategory" dot notation; without a dot the supercategory equals the name. */
export declare function parseAlias(alias: string): {
    name: string;
    supercategory: string;
};
/** Render the document, or null when there is no object to write. */
export declare function renderCoco(ctx: ExportContext): string | null;
/**
 * Parse a COCO document into segments.
 *
 * Each annotation prefers its polygons; an RLE dictionary, an empty list, or polygons too
 * degenerate to rasterize all fall through to the bounding box, so an object is never lost.
 * Categories restore aliases, rejoining "name.supercategory" when the two differ. As with every
 * reader, the returned alias map holds only what this file establishes.
 */
export declare function parseCoco(text: string, imageSize: readonly [number, number], existingAliases?: ReadonlyMap<number, string>): LoadedAnnotations;
//# sourceMappingURL=coco.d.ts.map