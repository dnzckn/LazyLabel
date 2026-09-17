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
import { parseCoco } from "../format/coco.js";
import { parseCreateMl } from "../format/createMl.js";
import { parseNpz } from "../format/npz.js";
import { parseNpzClassMap } from "../format/npzClassMap.js";
import { parsePascalVoc } from "../format/pascalVoc.js";
import { parseYoloDetection } from "../format/yoloDetection.js";
import { parseYoloSegmentation } from "../format/yoloSegmentation.js";
import { LOAD_PRIORITY } from "../types.js";
/** Raised when the winning file exists but cannot be read. Never presented as "no annotations". */
export class AnnotationLoadError extends Error {
    format;
    cause;
    constructor(format, cause) {
        super(`the ${format} annotation file could not be read: ${describe(cause)}`);
        this.format = format;
        this.cause = cause;
        this.name = "AnnotationLoadError";
    }
}
/**
 * Load the highest-priority file present.
 *
 * Returns null only when no candidate file exists at all. A file that exists but parses to zero
 * segments still wins the chain, exactly as in legacy, so an empty file is not silently skipped in
 * favour of a lower-priority one.
 */
export async function loadAnnotations(sources, imageSize, existingAliases = new Map()) {
    for (const format of LOAD_PRIORITY) {
        const content = sources[format];
        if (content === undefined)
            continue;
        try {
            const loaded = await parseOne(format, content, imageSize, existingAliases);
            return { ...loaded, format };
        }
        catch (cause) {
            throw new AnnotationLoadError(format, cause);
        }
    }
    return null;
}
async function parseOne(format, content, imageSize, aliases) {
    switch (format) {
        case "NPZ":
            return parseNpz(asBytes(format, content));
        case "NPZ_CLASS_MAP":
            return parseNpzClassMap(asBytes(format, content), imageSize);
        case "YOLO_SEGMENTATION":
            return parseYoloSegmentation(asText(format, content), imageSize, aliases);
        case "YOLO_DETECTION":
            return parseYoloDetection(asText(format, content), imageSize, aliases);
        case "COCO_JSON":
            return parseCoco(asText(format, content), imageSize, aliases);
        case "PASCAL_VOC":
            return parsePascalVoc(asText(format, content), imageSize, aliases);
        case "CREATEML":
            return parseCreateMl(asText(format, content), imageSize, aliases);
    }
}
function asBytes(format, content) {
    if (typeof content === "string")
        throw new TypeError(`${format} needs bytes, not text`);
    return content;
}
/**
 * Decode as UTF-8 and drop a byte-order mark.
 *
 * The legacy loaders open text files in the platform's locale encoding, which makes "the same
 * pixels as legacy" undefined for non-ASCII files: the same UTF-8 file loads differently on Windows
 * and Linux, and a BOM becomes a class named "﻿0". Decision 15b settles on UTF-8 with the BOM
 * stripped, which matches a Linux legacy install and fixes the BOM class.
 */
function asText(format, content) {
    const text = typeof content === "string" ? content : new TextDecoder("utf-8").decode(content);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
function describe(cause) {
    return cause instanceof Error ? cause.message : String(cause);
}
//# sourceMappingURL=chain.js.map