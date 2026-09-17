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
import { boxesToSegments, type ImportedBox } from "./boxes.js";
import { toPixel } from "./labels.js";
import { iterObjectContours } from "./objects.js";
import { pythonJsonDumps } from "../util/pythonJson.js";
import type { ExportContext, LoadedAnnotations } from "../types.js";

/** Render the document, or null when there is no object to write. */
export function renderCreateMl(ctx: ExportContext): string | null {
  const annotations: unknown[] = [];

  for (const { channel, contour } of iterObjectContours(ctx)) {
    const { x, y, width: bw, height: bh } = boundingRect(contour);
    annotations.push({
      label: ctx.classLabels[channel] ?? String(ctx.classOrder[channel]),
      coordinates: { x: x + bw / 2, y: y + bh / 2, width: bw, height: bh },
    });
  }
  if (annotations.length === 0) return null;

  return pythonJsonDumps([{ image: baseName(ctx.imagePath), annotations }]);
}

/**
 * Parse a CreateML document into segments.
 *
 * Only the FIRST image entry is read, which is how the legacy loader behaves: a file describing
 * several images contributes only its first. An annotation without a coordinates object is skipped.
 */
export function parseCreateMl(
  text: string,
  imageSize: readonly [number, number],
  existingAliases: ReadonlyMap<number, string> = new Map(),
): LoadedAnnotations {
  const document: unknown = JSON.parse(text);
  if (!Array.isArray(document) || document.length === 0 || typeof document[0] !== "object" || !document[0]) {
    return { segments: [], classAliases: new Map(existingAliases) };
  }

  const first = document[0] as Record<string, unknown>;
  const boxes: ImportedBox[] = [];
  const entries = Array.isArray(first["annotations"]) ? (first["annotations"] as unknown[]) : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const annotation = entry as Record<string, unknown>;
    const coordinates = annotation["coordinates"];
    if (!coordinates || typeof coordinates !== "object") continue;
    const box = coordinates as Record<string, unknown>;

    const cx = asNumber(box["x"]);
    const cy = asNumber(box["y"]);
    const bw = asNumber(box["width"]);
    const bh = asNumber(box["height"]);
    if (cx === null || cy === null || bw === null || bh === null) continue;

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
  return boxesToSegments(boxes, imageSize, existingAliases);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value === undefined ? 0 : null; // a missing key defaults to 0, as float(coords.get(k, 0)) does
}

function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(index + 1);
}
