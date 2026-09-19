/**
 * Reading and writing an image's annotations, in place, beside the image.
 *
 * This is the Phase 2 pilot slice: the one path taken end to end so the scaffold's seams are proved
 * by something real rather than asserted. Every decision about what a file CONTAINS belongs to
 * `@lazylabel/annotation-formats`; this module decides only which files to look at, in what order
 * to trust them, and how to move the bytes safely.
 *
 * Contracts implemented here come from `AI_NATIVE_SPEC.md` section 3 and the rule cards it cites:
 *
 *   - A load returns the highest-priority readable sidecar, carrying every failure it walked past
 *     (RULE-078, decision 15c). No sidecars at all is a distinct answer from one that cannot be
 *     read; the second is never presented as "no annotations" (decision 15d).
 *   - A write is atomic per file, and a write that cannot be made safely writes nothing at all.
 *   - A sidecar that exists in a format the user did not select is reported as stale and offered
 *     for removal, never deleted silently (decision 15f).
 */

import {
  AnnotationLoadError,
  LOAD_PRIORITY,
  loadAnnotations,
  renderCoco,
  renderCreateMl,
  renderNpz,
  renderNpzClassMap,
  renderPascalVoc,
  renderYoloDetection,
  renderYoloSegmentation,
} from "@lazylabel/annotation-formats";
import type {
  AnnotationFormat,
  AnnotationSources,
  ExportContext,
  LoadOutcome,
} from "@lazylabel/annotation-formats";

import { RevisionConflictError, type BlobStore } from "../ports/blobStore.js";
import { sidecarKeysFor } from "./sidecars.js";

/** Formats whose files are text; the rest are binary archives. */
const TEXT_FORMATS: ReadonlySet<AnnotationFormat> = new Set<AnnotationFormat>([
  "YOLO_DETECTION",
  "YOLO_SEGMENTATION",
  "COCO_JSON",
  "PASCAL_VOC",
  "CREATEML",
]);

export interface AnnotationsRead {
  readonly outcome: LoadOutcome;
  /** Revision of the file the annotations came from, for a later conditional write. */
  readonly revision: string;
  readonly key: string;
}

/**
 * Load the image's annotations from the best sidecar present.
 *
 * Returns null when the image has no sidecar at all, which the route answers as 204. Throws
 * {@link AnnotationLoadError} when sidecars exist but none could be read, which the route answers
 * as 409 — never as an empty annotation set, and nothing is deleted on that path.
 */
export async function readAnnotations(
  store: BlobStore,
  imageKey: string,
  imageSize: readonly [number, number],
  existingAliases: ReadonlyMap<number, string> = new Map(),
): Promise<AnnotationsRead | null> {
  const keys = sidecarKeysFor(imageKey);
  const sources: AnnotationSources = {};
  const revisions = new Map<AnnotationFormat, string>();

  // Read every candidate before parsing any. The alternative, reading lazily inside the chain,
  // makes the set of files considered depend on how far the chain got, which makes a failure
  // report depend on the failure it is reporting.
  await Promise.all(
    [...keys].map(async ([format, key]) => {
      const [bytes, info] = await Promise.all([store.read(key), store.stat(key)]);
      if (bytes === null || info === null) return;
      sources[format] = TEXT_FORMATS.has(format) ? decodeText(bytes) : bytes;
      revisions.set(format, info.revision);
    }),
  );

  const outcome = await loadAnnotations(sources, imageSize, existingAliases);
  if (outcome === null) return null;

  return {
    outcome,
    revision: revisions.get(outcome.format) ?? "",
    key: keys.get(outcome.format)!,
  };
}

export interface WriteRequest {
  /** Formats to write. A format absent here whose file exists is reported stale, never deleted. */
  readonly formats: readonly AnnotationFormat[];
  readonly context: ExportContext;
  /**
   * Revisions the client last read, by format. A format listed here is written only if its file is
   * still at that revision; map a format to null to require that its file does not yet exist.
   * Formats absent from the map are written unconditionally.
   */
  readonly expectedRevisions?: ReadonlyMap<AnnotationFormat, string | null>;
}

export interface WriteResult {
  readonly written: ReadonlyMap<AnnotationFormat, string>;
  /**
   * Formats the user selected where the library rendered nothing, so no file was written.
   *
   * This is a KNOWN GAP, not a settled behavior. The architecture review found that "a save with
   * zero segments writes nothing" lets the next load resurrect deleted work, and adopted "a save
   * writes empty files for the selected formats". Implementing that needs a decision per format
   * about what an empty file IS — an empty COCO document is not zero bytes, and an empty NPZ is a
   * valid archive with no members — and those are content decisions, so they belong in the format
   * library with the rest, not improvised here. Phase 4 builds it; `capabilities.ts` records it and
   * an acceptance test holds the place.
   */
  readonly skippedEmpty: readonly AnnotationFormat[];
  /** Sidecars present in formats the user did not select. Reported, never deleted (decision 15f). */
  readonly stale: readonly AnnotationFormat[];
}

/**
 * Write the selected formats for this image.
 *
 * Rendering happens for every format BEFORE any file is written, so a format that throws cannot
 * leave a half-saved set of sidecars behind. Within that, each file is written atomically, and a
 * revision conflict on any of them aborts before the first write.
 */
export async function writeAnnotations(
  store: BlobStore,
  imageKey: string,
  request: WriteRequest,
): Promise<WriteResult> {
  const keys = sidecarKeysFor(imageKey);
  const selected = new Set(request.formats);

  const rendered = new Map<AnnotationFormat, Uint8Array>();
  const skippedEmpty: AnnotationFormat[] = [];
  for (const format of LOAD_PRIORITY) {
    if (!selected.has(format)) continue;
    const content = await render(format, request.context);
    if (content === null) skippedEmpty.push(format);
    else rendered.set(format, content);
  }

  // Check every revision before writing anything. Checking as we go would let the first two files
  // land and the third conflict, leaving the image's sidecars disagreeing with each other.
  const expected = request.expectedRevisions;
  if (expected) {
    for (const format of rendered.keys()) {
      if (!expected.has(format)) continue;
      const want = expected.get(format) ?? null;
      const actual = (await store.stat(keys.get(format)!))?.revision ?? null;
      if (actual !== want) throw new RevisionConflictError(keys.get(format)!, want, actual);
    }
  }

  const written = new Map<AnnotationFormat, string>();
  for (const [format, content] of rendered) {
    const key = keys.get(format)!;
    const stat = await store.writeAtomic(key, content);
    written.set(format, stat.revision);
  }

  const stale: AnnotationFormat[] = [];
  for (const [format, key] of keys) {
    if (selected.has(format)) continue;
    if ((await store.stat(key)) !== null) stale.push(format);
  }

  return { written, skippedEmpty, stale };
}

async function render(
  format: AnnotationFormat,
  ctx: ExportContext,
): Promise<Uint8Array | null> {
  switch (format) {
    case "NPZ":
      return renderNpz(ctx);
    case "NPZ_CLASS_MAP":
      return renderNpzClassMap(ctx);
    case "YOLO_SEGMENTATION":
      return encodeText(renderYoloSegmentation(ctx));
    case "YOLO_DETECTION":
      return encodeText(renderYoloDetection(ctx));
    case "COCO_JSON":
      return encodeText(renderCoco(ctx));
    case "PASCAL_VOC":
      return encodeText(renderPascalVoc(ctx));
    case "CREATEML":
      return encodeText(renderCreateMl(ctx));
  }
}

/**
 * Text sidecars are written as UTF-8 with LF endings, which is what the library renders.
 *
 * Decision 10: the legacy writers open files in text mode, so they emit CRLF on Windows and LF
 * elsewhere, and the differential tests compare after normalizing. The target always writes LF.
 */
function encodeText(body: string | null): Uint8Array | null {
  return body === null ? null : new TextEncoder().encode(body);
}

/**
 * Decode a text sidecar as UTF-8, leaving any byte-order mark for the library to strip.
 *
 * Decision 15b settles the encoding question the legacy readers left open: they open text files in
 * the platform's locale encoding, so the same UTF-8 file loads differently on Windows and Linux,
 * and a BOM becomes a class named "﻿0".
 */
function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

export { AnnotationLoadError, RevisionConflictError };
