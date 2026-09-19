/**
 * The shapes the annotation routes speak, and the codec for the one field that is not plain JSON.
 *
 * PROVISIONAL, and marked so deliberately. Phase 4 builds the real client and the wire format is
 * its to settle. What is fixed now is only what `AI_NATIVE_SPEC.md` section 3 already promises: a
 * load carries its source format, the names the file established, the count it rejected, and every
 * failure it walked past. Those exist so a client can say "412 unreadable lines" rather than
 * showing an empty canvas (decision 15d), and they are the part worth getting right before there
 * is a client to get it wrong.
 *
 * Masks travel BOUNDED — a bounding box plus the bytes inside it. The obvious encoding, a
 * full-image plane per segment, is what the memory NFR exists to forbid: 500 objects on a
 * 50-megapixel image is 25 GB of ones and zeros, almost all of them zero. Bounding costs a dozen
 * lines and keeps the wire honest about the same property the in-memory representation must have.
 *
 * This lives in a shared package rather than in the API because the browser has to decode exactly
 * what the server encoded. A second implementation of a binary layout is not a risk worth taking
 * for the sake of avoiding one small package.
 */

import type { BinaryMask, LoadOutcome, Segment } from "@lazylabel/annotation-formats";

import { base64ToBytes, bytesToBase64 } from "./base64.js";

/** The bytes on the wire do not describe a value this codec can build. */
export class WireFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WireFormatError";
  }
}

/** A mask as a bounding box plus the bytes inside it, base64-encoded row-major. */
export interface WireMask {
  readonly height: number;
  readonly width: number;
  /** [x0, y0, x1, y1], half-open on the far edge. Null when the mask is empty. */
  readonly box: readonly [number, number, number, number] | null;
  /** Base64 of the (y1-y0) x (x1-x0) region, one byte per pixel. Empty when `box` is null. */
  readonly data: string;
}

export interface WireSegment {
  readonly type: Segment["type"];
  readonly classId: number | null;
  readonly mask?: WireMask;
  readonly vertices?: readonly (readonly [number, number])[];
}

export interface WireFailure {
  readonly format: string;
  readonly reason: string;
}

export interface WireLoadResponse {
  readonly sourceFormat: string;
  readonly sourceFile: string;
  readonly revision: string;
  readonly segments: readonly WireSegment[];
  /** Class names this file established, by class id. Never an echo of names the client already had. */
  readonly classAliases: Readonly<Record<string, string>>;
  /** How many lines or objects the reader skipped as unreadable. */
  readonly rejected: number;
  /**
   * The file holds class names this reader will not read: a legacy NPZ's pickled alias table.
   *
   * The masks are fine. Saving in another format without converting the names first writes the
   * class ids where the names should be, and nothing about the result looks wrong.
   */
  readonly unreadableAliases?: boolean;
  /**
   * Higher-priority sidecars that exist but could not be read.
   *
   * Never silently empty: decision 15c continues the chain past a damaged file so the user's work
   * is recovered from a healthy sidecar, and requires that the recovery be visible. A client that
   * drops this field turns a fixable problem into a mystery.
   */
  readonly failures: readonly WireFailure[];
}

export interface WireSaveRequest {
  readonly imageSize: readonly [number, number];
  readonly formats: readonly string[];
  readonly segments: readonly WireSegment[];
  readonly classAliases?: Readonly<Record<string, string>>;
  readonly cropCoords?: readonly [number, number, number, number] | null;
  readonly pixelPriority?: { readonly enabled: boolean; readonly ascending: boolean };
  readonly expectedRevisions?: Readonly<Record<string, string | null>>;
}

export interface WireSaveResponse {
  readonly written: Readonly<Record<string, string>>;
  /** Sidecars present in formats the user did not select. Reported, never deleted (decision 15f). */
  readonly stale: readonly string[];
  /** Selected formats the library rendered nothing for. See the API's note about Phase 4. */
  readonly skippedEmpty: readonly string[];
  readonly note?: string;
}

/** One image in a dataset listing, with what it already carries. */
export interface WireDatasetImage {
  readonly key: string;
  readonly name: string;
  /** Which annotation files exist for this image, by format. */
  readonly sidecars: Readonly<Record<string, boolean>>;
  readonly annotated: boolean;
  /**
   * Other images that share every sidecar with this one.
   *
   * Two images whose base names match have the same seven sidecar paths, so annotating one
   * overwrites the other's work. Legacy never mentions it; the listing is the first moment a user
   * could be told.
   */
  readonly sharesSidecarsWith: readonly string[];
}

export interface WireDatasetListing {
  readonly folder: string;
  readonly images: readonly WireDatasetImage[];
  readonly annotatedCount: number;
  /** Files that are neither a supported image nor a recognized sidecar. Counted, never dropped. */
  readonly unrecognized: number;
  /** The status columns to render, in load-priority order. */
  readonly columns: readonly { readonly format: string; readonly suffix: string }[];
}

/** An image's size and kind, read without decoding its pixels. */
export interface WireImageMetadata {
  readonly width: number;
  readonly height: number;
  /** 8, or 16 when RULE-024's truncating conversion was applied to show it. */
  readonly sourceDepth: 8 | 16;
  readonly sourceFormat: string;
}

/** A failure, as every route reports one. Never an empty success. */
export interface WireProblem {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly detail?: unknown;
}

export function encodeLoadResponse(
  outcome: LoadOutcome,
  sourceFile: string,
  revision: string,
): WireLoadResponse {
  return {
    sourceFormat: outcome.format,
    sourceFile,
    revision,
    segments: outcome.segments.map(encodeSegment),
    classAliases: Object.fromEntries([...outcome.classAliases].map(([id, name]) => [String(id), name])),
    rejected: outcome.rejected,
    ...(outcome.unreadableAliases === true ? { unreadableAliases: true } : {}),
    failures: outcome.failures.map((failure) => ({ format: failure.format, reason: failure.reason })),
  };
}

export function encodeSegment(segment: Segment): WireSegment {
  const out: {
    type: Segment["type"];
    classId: number | null;
    mask?: WireMask;
    vertices?: readonly (readonly [number, number])[];
  } = { type: segment.type, classId: segment.classId };
  if (segment.mask !== undefined) out.mask = encodeMask(segment.mask);
  if (segment.vertices !== undefined) out.vertices = segment.vertices;
  return out;
}

export function decodeSegment(wire: WireSegment): Segment {
  const out: {
    type: Segment["type"];
    classId: number | null;
    mask?: BinaryMask;
    vertices?: readonly (readonly [number, number])[];
  } = { type: wire.type, classId: wire.classId };
  if (wire.mask !== undefined) out.mask = decodeMask(wire.mask);
  if (wire.vertices !== undefined) out.vertices = wire.vertices;
  return out as Segment;
}

export function encodeMask(mask: BinaryMask): WireMask {
  const box = boundsOf(mask);
  if (box === null) return { height: mask.height, width: mask.width, box: null, data: "" };

  const [x0, y0, x1, y1] = box;
  const boxWidth = x1 - x0;
  const region = new Uint8Array(boxWidth * (y1 - y0));
  for (let y = y0; y < y1; y += 1) {
    region.set(mask.data.subarray(y * mask.width + x0, y * mask.width + x1), (y - y0) * boxWidth);
  }
  return { height: mask.height, width: mask.width, box, data: bytesToBase64(region) };
}

export function decodeMask(wire: WireMask): BinaryMask {
  const { height, width } = wire;
  if (!Number.isInteger(height) || !Number.isInteger(width) || height < 0 || width < 0) {
    throw new WireFormatError("a mask has a non-integer or negative size");
  }

  const data = new Uint8Array(height * width);
  if (wire.box === null || wire.box === undefined) return { height, width, data };

  const [x0, y0, x1, y1] = wire.box;
  if (!(x0 >= 0 && y0 >= 0 && x1 <= width && y1 <= height && x1 >= x0 && y1 >= y0)) {
    throw new WireFormatError(
      `a mask box ${JSON.stringify(wire.box)} does not fit its ${width}x${height} image`,
    );
  }

  const boxWidth = x1 - x0;
  let region: Uint8Array;
  try {
    region = base64ToBytes(wire.data);
  } catch {
    throw new WireFormatError("a mask's pixels are not valid base64");
  }
  if (region.length !== boxWidth * (y1 - y0)) {
    throw new WireFormatError(
      `a mask box says ${boxWidth * (y1 - y0)} pixels but carries ${region.length} bytes`,
    );
  }

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      // Anything non-zero is a set pixel; the library's masks are strictly 0 or 1.
      data[y * width + x] = region[(y - y0) * boxWidth + (x - x0)]! === 0 ? 0 : 1;
    }
  }
  return { height, width, data };
}

function boundsOf(mask: BinaryMask): [number, number, number, number] | null {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y += 1) {
    const row = y * mask.width;
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[row + x] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX < 0 ? null : [minX, minY, maxX + 1, maxY + 1];
}
