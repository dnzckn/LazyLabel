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
 * and the chain STOPS there, showing an empty canvas; with auto-save on, navigating away then
 * deletes the user's healthy annotation files. The other two raise, and the chain continues past them.
 *
 * Here EVERY failure is reported and the chain continues to the next format. A damaged file usually
 * sits beside a healthy one written by the same save, so continuing recovers the user's work; what
 * must never happen is presenting that silently, so the outcome carries the failures and the caller
 * has to say which file failed and which supplied the annotations. If every file present fails, the
 * load raises rather than returning an empty set. Nothing is deleted on any of these paths, and the
 * priority order itself is unchanged.
 */

import { parseCoco } from "../format/coco.js";
import { parseCreateMl } from "../format/createMl.js";
import { parseNpz } from "../format/npz.js";
import { parseNpzClassMap } from "../format/npzClassMap.js";
import { parsePascalVoc } from "../format/pascalVoc.js";
import { parseYoloDetection } from "../format/yoloDetection.js";
import { parseYoloSegmentation } from "../format/yoloSegmentation.js";
import { LOAD_PRIORITY, type AnnotationFormat, type LoadedAnnotations } from "../types.js";

/** The bytes or text of one candidate file, keyed by the format that writes it. */
export type AnnotationSources = Partial<Record<AnnotationFormat, string | Uint8Array>>;

export interface LoadFailure {
  readonly format: AnnotationFormat;
  readonly reason: string;
}

export interface LoadOutcome extends LoadedAnnotations {
  /** Which format actually supplied the annotations. */
  readonly format: AnnotationFormat;
  /**
   * Higher-priority files that exist but could not be read, in priority order.
   *
   * Never empty silently: the caller must tell the user which file failed and which one supplied
   * the annotations they are looking at. A damaged file usually sits beside a healthy one written
   * by the same save, so continuing recovers the work, but presenting it as if nothing happened
   * would hide that the newest file is broken.
   */
  readonly failures: readonly LoadFailure[];
}

/** Raised when every annotation file present failed to read. Never presented as "no annotations". */
export class AnnotationLoadError extends Error {
  constructor(readonly failures: readonly LoadFailure[]) {
    super(
      failures.length === 1
        ? `the ${failures[0]!.format} annotation file could not be read: ${failures[0]!.reason}`
        : `no annotation file could be read: ${failures.map((f) => `${f.format} (${f.reason})`).join("; ")}`,
    );
    this.name = "AnnotationLoadError";
  }

  /** The format of the highest-priority file that failed, which is the one to report first. */
  get format(): AnnotationFormat | undefined {
    return this.failures[0]?.format;
  }
}

/**
 * Load the highest-priority file present.
 *
 * Returns null only when no candidate file exists at all. A file that exists but parses to zero
 * segments still wins the chain, exactly as in legacy, so an empty file is not silently skipped in
 * favour of a lower-priority one.
 */
export async function loadAnnotations(
  sources: AnnotationSources,
  imageSize: readonly [number, number],
  existingAliases: ReadonlyMap<number, string> = new Map(),
): Promise<LoadOutcome | null> {
  const failures: LoadFailure[] = [];

  for (const format of LOAD_PRIORITY) {
    const content = sources[format];
    if (content === undefined) continue;
    try {
      const loaded = await parseOne(format, content, imageSize, existingAliases);
      return { ...loaded, format, failures };
    } catch (cause) {
      failures.push({ format, reason: describe(cause) });
    }
  }

  if (failures.length > 0) throw new AnnotationLoadError(failures);
  return null;
}

async function parseOne(
  format: AnnotationFormat,
  content: string | Uint8Array,
  imageSize: readonly [number, number],
  aliases: ReadonlyMap<number, string>,
): Promise<LoadedAnnotations> {
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

function asBytes(format: AnnotationFormat, content: string | Uint8Array): Uint8Array {
  if (typeof content === "string") throw new TypeError(`${format} needs bytes, not text`);
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
function asText(format: AnnotationFormat, content: string | Uint8Array): string {
  const text = typeof content === "string" ? content : new TextDecoder("utf-8").decode(content);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
