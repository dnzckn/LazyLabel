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
import { boundingRect } from "../geometry/contours.js";
import { boxesToSegments } from "./boxes.js";
import { parseFloatLikePython, toPixel } from "./labels.js";
import { iterObjectContours } from "./objects.js";
import { pyFloat, pythonJsonDumps } from "../util/pythonJson.js";
/** Render the document, or null when there is no object to write. */
export function renderCreateMl(ctx) {
    const annotations = [];
    for (const { channel, contour } of iterObjectContours(ctx)) {
        const { x, y, width: bw, height: bh } = boundingRect(contour);
        annotations.push({
            label: ctx.classLabels[channel] ?? String(ctx.classOrder[channel]),
            // The centres are int + int/2 in Python, so they are floats even when whole: "20.0", not "20".
            // The sizes stay ints.
            coordinates: { x: pyFloat(x + bw / 2), y: pyFloat(y + bh / 2), width: bw, height: bh },
        });
    }
    if (annotations.length === 0)
        return null;
    return pythonJsonDumps([{ image: baseName(ctx.imagePath), annotations }]);
}
/**
 * Parse a CreateML document into segments.
 *
 * Only the FIRST image entry is read, which is how the legacy loader behaves: a file describing
 * several images contributes only its first. An annotation without a coordinates object is skipped.
 */
export function parseCreateMl(text, imageSize, existingAliases = new Map()) {
    const document = JSON.parse(text);
    if (!Array.isArray(document) || document.length === 0 || typeof document[0] !== "object" || !document[0]) {
        return { segments: [], classAliases: new Map(), rejected: 0 };
    }
    const first = document[0];
    const boxes = [];
    const entries = Array.isArray(first["annotations"]) ? first["annotations"] : [];
    let rejected = 0;
    for (const entry of entries) {
        if (!entry || typeof entry !== "object") {
            rejected += 1;
            continue;
        }
        const annotation = entry;
        const coordinates = annotation["coordinates"];
        if (!coordinates || typeof coordinates !== "object") {
            rejected += 1;
            continue;
        }
        const box = coordinates;
        const cx = asNumber(box["x"]);
        const cy = asNumber(box["y"]);
        const bw = asNumber(box["width"]);
        const bh = asNumber(box["height"]);
        if (cx === null || cy === null || bw === null || bh === null) {
            rejected += 1;
            continue;
        }
        // The corner rounds first, then the size is added, so x2 is NOT round(cx + bw/2).
        const x1 = toPixel(cx - bw / 2, "a CreateML box left edge");
        const y1 = toPixel(cy - bh / 2, "a CreateML box top edge");
        boxes.push({
            label: String(annotation["label"] ?? "0"),
            x1,
            y1,
            x2: x1 + toPixel(bw, "a CreateML box width"),
            y2: y1 + toPixel(bh, "a CreateML box height"),
        });
    }
    const loaded = boxesToSegments(boxes, imageSize, existingAliases);
    return { ...loaded, rejected: loaded.rejected + rejected };
}
/**
 * A coordinate as Python's `float(coords.get(key, 0))` reads it.
 *
 * A missing key defaults to 0. A string goes through Python's float rules, so "nan" and "inf"
 * parse rather than fail here and are refused later by toPixel, which discards the whole file.
 * That matters: in the legacy loader the rounding sits OUTSIDE the try, so one bad coordinate
 * loses every annotation in the file rather than one. Skipping just that annotation would load
 * boxes the legacy app never loads.
 */
function asNumber(value) {
    if (typeof value === "number")
        return value;
    if (typeof value === "string")
        return parseFloatLikePython(value);
    return value === undefined ? 0 : null;
}
function baseName(path) {
    const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return path.slice(index + 1);
}
//# sourceMappingURL=createMl.js.map