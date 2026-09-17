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

import { boundingRect, contourArea, fillPoly } from "../geometry/contours.js";
import { toInt32Pixel, toPixel } from "./labels.js";
import { contourToPolygon, iterObjectContours } from "./objects.js";
import { pythonJsonDumps } from "../util/pythonJson.js";
import type { ExportContext, LoadedAnnotations, Segment } from "../types.js";

/** Split "name.supercategory" dot notation; without a dot the supercategory equals the name. */
export function parseAlias(alias: string): { name: string; supercategory: string } {
  const dot = alias.lastIndexOf(".");
  if (dot < 0) return { name: alias, supercategory: alias };
  return { name: alias.slice(0, dot), supercategory: alias.slice(dot + 1) };
}

/** Render the document, or null when there is no object to write. */
export function renderCoco(ctx: ExportContext): string | null {
  const [height, width] = ctx.imageSize;

  const categories = ctx.classOrder.map((classId) => {
    const { name, supercategory } = parseAlias(ctx.classAliases.get(classId) ?? String(classId));
    return { id: classId, name, supercategory };
  });

  const annotations: unknown[] = [];
  let annotationId = 1;
  for (const { channel, contour } of iterObjectContours(ctx)) {
    const { x, y, width: bw, height: bh } = boundingRect(contour);
    annotations.push({
      id: annotationId,
      image_id: 1,
      category_id: ctx.classOrder[channel],
      bbox: [x, y, bw, bh],
      // int() truncates toward zero, so 24.5 becomes 24 and 0.5 becomes 0. Never round here.
      area: contour.length >= 3 ? Math.trunc(contourArea(contour)) : bw * bh,
      segmentation: [contourToPolygon(contour)],
      iscrowd: 0,
    });
    annotationId += 1;
  }
  if (annotations.length === 0) return null;

  return pythonJsonDumps({
    images: [{ id: 1, file_name: baseName(ctx.imagePath), width, height }],
    annotations,
    categories,
  });
}

/**
 * Parse a COCO document into segments.
 *
 * Each annotation prefers its polygons; an RLE dictionary, an empty list, or polygons too
 * degenerate to rasterize all fall through to the bounding box, so an object is never lost.
 * Categories restore aliases, rejoining "name.supercategory" when the two differ. As with every
 * reader, the returned alias map holds only what this file establishes.
 */
export function parseCoco(
  text: string,
  imageSize: readonly [number, number],
  existingAliases: ReadonlyMap<number, string> = new Map(),
): LoadedAnnotations {
  const [height, width] = imageSize;
  const document: unknown = JSON.parse(text);
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new TypeError("COCO JSON is not an object");
  }
  const root = document as Record<string, unknown>;

  const classAliases = new Map<number, string>();
  for (const entry of asArray(root["categories"])) {
    if (!entry || typeof entry !== "object") continue;
    const category = entry as Record<string, unknown>;
    const id = asInt(category["id"]);
    if (id === null) continue;
    const name = String(category["name"] ?? id);
    const supercategory = String(category["supercategory"] ?? name);
    classAliases.set(id, supercategory !== name ? `${name}.${supercategory}` : name);
  }

  const segments: Segment[] = [];
  let rejected = 0;
  for (const entry of asArray(root["annotations"])) {
    if (!entry || typeof entry !== "object") {
      rejected += 1;
      continue;
    }
    const annotation = entry as Record<string, unknown>;
    const categoryId = asInt(annotation["category_id"]) ?? 0;

    let added = false;
    const segmentation = annotation["segmentation"];
    if (Array.isArray(segmentation)) {
      for (const polygon of segmentation) {
        if (!Array.isArray(polygon) || polygon.length < 6) continue;
        const points: [number, number][] = [];
        let usable = true;
        for (let i = 0; i + 1 < polygon.length; i += 2) {
          const px = asNumber(polygon[i]);
          const py = asNumber(polygon[i + 1]);
          if (px === null || py === null) {
            usable = false;
            break;
          }
          points.push([toInt32Pixel(px, "a COCO polygon x"), toInt32Pixel(py, "a COCO polygon y")]);
        }
        if (!usable) continue;

        const mask = fillPoly(height, width, [points]);
        if (!mask.data.some((v) => v !== 0)) continue;
        segments.push({
          type: "Loaded",
          classId: categoryId,
          mask,
          vertices: points.map(([px, py]) => [px, py] as const),
        });
        added = true;
      }
    }
    if (added) continue;

    const bbox = annotation["bbox"];
    if (!Array.isArray(bbox) || bbox.length !== 4) {
      rejected += 1; // no usable polygon and no usable box: the object is lost
      continue;
    }
    const values = bbox.map((v) => asNumber(v));
    if (values.some((v) => v === null)) {
      rejected += 1;
      continue;
    }
    const [bx, by, bw, bh] = values.map((v) => toPixel(v!, "a COCO box value")) as [number, number, number, number];

    const x1 = Math.max(0, bx);
    const y1 = Math.max(0, by);
    const x2 = Math.min(width, bx + bw);
    const y2 = Math.min(height, by + bh);
    if (x2 <= x1 || y2 <= y1) {
      rejected += 1;
      continue;
    }

    const data = new Uint8Array(height * width);
    for (let y = y1; y < y2; y += 1) data.fill(1, y * width + x1, y * width + x2);
    segments.push({ type: "Loaded", classId: categoryId, mask: { height, width, data } });
  }

  // COCO carries explicit category ids, so unlike the text formats it needs no label map.
  return { segments, classAliases, rejected };
}

function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(index + 1);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function asInt(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed === null || !Number.isFinite(parsed) ? null : Math.trunc(parsed);
}
