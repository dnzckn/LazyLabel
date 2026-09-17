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
import { boundingRect } from "../geometry/contours.js";
import { boxesToSegments } from "./boxes.js";
import { parseFloatLikePython, toPixel } from "./labels.js";
import { iterObjectContours } from "./objects.js";
import { childText, directChildren, escapeXml, readXmlRoot } from "./xml.js";
/** Render the document, or null when there is no object to write. */
export function renderPascalVoc(ctx) {
    const [height, width] = ctx.imageSize;
    const objects = [];
    for (const { channel, contour } of iterObjectContours(ctx)) {
        const { x, y, width: bw, height: bh } = boundingRect(contour);
        const label = ctx.classLabels[channel] ?? String(ctx.classOrder[channel]);
        objects.push([
            "  <object>",
            `    <name>${escapeXml(label)}</name>`,
            "    <pose>Unspecified</pose>",
            "    <truncated>0</truncated>",
            "    <difficult>0</difficult>",
            "    <bndbox>",
            `      <xmin>${x}</xmin>`,
            `      <ymin>${y}</ymin>`,
            `      <xmax>${x + bw}</xmax>`, // exclusive, unlike the VOC devkit
            `      <ymax>${y + bh}</ymax>`,
            "    </bndbox>",
            "  </object>",
        ].join("\n"));
    }
    if (objects.length === 0)
        return null;
    return [
        "<?xml version='1.0' encoding='utf-8'?>",
        "<annotation>",
        `  <filename>${escapeXml(baseName(ctx.imagePath))}</filename>`,
        "  <size>",
        `    <width>${width}</width>`,
        `    <height>${height}</height>`,
        "    <depth>3</depth>", // always 3, even for a 16-bit grayscale image
        "  </size>",
        ...objects,
        "</annotation>",
    ].join("\n");
}
/**
 * Parse a VOC document into segments.
 *
 * An object without a name or a bndbox is skipped and counted in `rejected`, a missing coordinate
 * defaults to 0, and xmax/ymax are read as exclusive, matching what the writer emits. A document
 * that is not XML, or carries no <annotation> root, is refused outright rather than read as "no
 * objects", which would win the load chain and show an empty canvas (decision 15c).
 */
export function parsePascalVoc(text, imageSize, existingAliases = new Map()) {
    const root = readXmlRoot(text, "annotation");
    const boxes = [];
    let rejected = 0;
    for (const object of directChildren(root, "object")) {
        const name = childText(object, "name");
        const bndbox = directChildren(object, "bndbox")[0];
        if (name === null || bndbox === undefined) {
            rejected += 1;
            continue;
        }
        // A missing coordinate defaults to "0", as findtext does, but a present but unreadable one
        // drops the object, as float() raising inside the legacy try does.
        const read = (tag) => parseFloatLikePython(childText(bndbox, tag) ?? "0");
        const corners = [read("xmin"), read("ymin"), read("xmax"), read("ymax")];
        if (corners.some((value) => value === null)) {
            rejected += 1;
            continue;
        }
        const [x1, y1, x2, y2] = corners;
        boxes.push({
            label: name === "" ? "0" : name,
            x1: toPixel(x1, "a VOC xmin"),
            y1: toPixel(y1, "a VOC ymin"),
            x2: toPixel(x2, "a VOC xmax"),
            y2: toPixel(y2, "a VOC ymax"),
        });
    }
    const loaded = boxesToSegments(boxes, imageSize, existingAliases);
    return { ...loaded, rejected: loaded.rejected + rejected };
}
function baseName(path) {
    const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return path.slice(index + 1);
}
//# sourceMappingURL=pascalVoc.js.map