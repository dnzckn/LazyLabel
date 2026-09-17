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
import { boxesToSegments, type ImportedBox } from "./boxes.js";
import { toPixel } from "./labels.js";
import { iterObjectContours } from "./objects.js";
import type { ExportContext, LoadedAnnotations } from "../types.js";

/** Render the document, or null when there is no object to write. */
export function renderPascalVoc(ctx: ExportContext): string | null {
  const [height, width] = ctx.imageSize;
  const objects: string[] = [];

  for (const { channel, contour } of iterObjectContours(ctx)) {
    const { x, y, width: bw, height: bh } = boundingRect(contour);
    const label = ctx.classLabels[channel] ?? String(ctx.classOrder[channel]);
    objects.push(
      [
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
      ].join("\n"),
    );
  }
  if (objects.length === 0) return null;

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
 * An object without a name or a bndbox is skipped, a missing coordinate defaults to 0, and
 * xmax/ymax are read as exclusive, matching what the writer emits.
 */
export function parsePascalVoc(
  text: string,
  imageSize: readonly [number, number],
  existingAliases: ReadonlyMap<number, string> = new Map(),
): LoadedAnnotations {
  const boxes: ImportedBox[] = [];

  for (const object of text.matchAll(/<object\b[^>]*>([\s\S]*?)<\/object>/g)) {
    const body = object[1] ?? "";
    const name = tagText(body, "name");
    const bndbox = /<bndbox\b[^>]*>([\s\S]*?)<\/bndbox>/.exec(body)?.[1];
    if (name === null || bndbox === undefined) continue;

    const read = (tag: string): number | null => {
      const raw = tagText(bndbox, tag) ?? "0";
      const value = Number(raw.trim());
      return Number.isNaN(value) ? null : value;
    };
    const [x1, y1, x2, y2] = [read("xmin"), read("ymin"), read("xmax"), read("ymax")];
    if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

    boxes.push({
      label: name === "" ? "0" : name,
      x1: toPixel(x1, "a VOC xmin"),
      y1: toPixel(y1, "a VOC ymin"),
      x2: toPixel(x2, "a VOC xmax"),
      y2: toPixel(y2, "a VOC ymax"),
    });
  }
  return boxesToSegments(boxes, imageSize, existingAliases);
}

function tagText(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!match) return null;
  return unescapeXml(match[1] ?? "");
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(index + 1);
}
