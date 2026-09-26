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

/** A mask as a bounding box plus the pixels inside it, base64-encoded row-major. */
export interface WireMask {
  readonly height: number;
  readonly width: number;
  /** [x0, y0, x1, y1], half-open on the far edge. Null when the mask is empty. */
  readonly box: readonly [number, number, number, number] | null;
  /**
   * Base64 of the (y1-y0) x (x1-x0) region, row-major. Empty when `box` is null.
   *
   * With `packing: "bits"`, ONE BIT per pixel: the first pixel is the most significant bit of the
   * first byte -- NumPy's `packbits` order, so Python and TypeScript agree without either
   * translating -- and the last byte is padded with zeros. Without it, one BYTE per pixel.
   */
  readonly data: string;
  /**
   * How `data` is packed. "bits" since 2026-09-23, when the spec's latency budget was first
   * measured: a large mask at one byte per pixel was megabytes of base64 per click, and encoding
   * and serializing it was most of the p95. Absent means one byte per pixel, which every decoder
   * still accepts, so a payload written before the change still reads.
   */
  readonly packing?: "bits";
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
   * The file holds class names this reader will not read: an NPZ name table that is not the pickled
   * dict the desktop app writes (that one is read, as data), or a JSON table that is not ids to names.
   *
   * The masks are fine. Saving in another format now writes the class ids where the names should
   * be, and nothing about the result looks wrong.
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
  /**
   * The image file's size in bytes — only when the listing was asked for DETAILS.
   *
   * Absent by default, and that is the point: filling it costs a `stat` per image, which a folder
   * of ten thousand frames would pay on every listing for a column most datasets never show. The
   * client asks when a visible column or a chosen sort needs it.
   */
  readonly size?: number;
  /** When the image was last written, epoch milliseconds, or null when the store cannot say. */
  readonly modified?: number | null;
}

export interface WireDatasetListing {
  readonly folder: string;
  /**
   * Folder names directly below this one, so a dataset can be walked.
   *
   * RULE-051 makes the listing non-recursive, which is legacy's behaviour and is deliberate.
   * Non-recursive WITHOUT navigation is not a restriction though, it is a dead end: a dataset
   * whose images live under `frames/` shows an empty root and no way down.
   */
  readonly folders: readonly string[];
  readonly images: readonly WireDatasetImage[];
  readonly annotatedCount: number;
  /** Files that are neither a supported image nor a recognized sidecar. Counted, never dropped. */
  readonly unrecognized: number;
  /** The status columns to render, in load-priority order. */
  readonly columns: readonly { readonly format: string; readonly suffix: string }[];
}

/** An image's size and kind. The size comes from the header; see `sourceChannels` for the rest. */
export interface WireImageMetadata {
  readonly width: number;
  readonly height: number;
  /** 8, or 16 when RULE-024's truncating conversion was applied to show it. */
  readonly sourceDepth: 8 | 16;
  /**
   * 1 for a grayscale image, 3 for colour, decided as legacy decides it: from the PIXELS when the
   * header says colour. A colour file whose channels agree to within RULE-024's tolerance is 1.
   *
   * The pixels always arrive as RGB, so this is the only place the distinction survives the
   * pipeline — and two rules turn on it. RULE-032 disables rescale for a colour image, and
   * RULE-029 offers a single Gray channel for a grayscale one against three separate ones for
   * colour. A client that guesses will offer controls the server then ignores.
   */
  readonly sourceChannels: number;
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
  const packed = new Uint8Array(Math.ceil(((x1 - x0) * (y1 - y0)) / 8));
  let bit = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * mask.width;
    for (let x = x0; x < x1; x += 1, bit += 1) {
      if (mask.data[row + x] !== 0) packed[bit >> 3]! |= 0x80 >> (bit & 7);
    }
  }
  return { height: mask.height, width: mask.width, box, data: bytesToBase64(packed), packing: "bits" };
}

/**
 * The pixels inside a wire mask's box, one byte each and 0 or 1, however `data` is packed.
 *
 * THE ONLY PLACE OUTSIDE THE CODEC THAT KNOWS THE LAYOUT. The canvas, erase, selection and the
 * sequence references each read `data` themselves until 2026-09-23 -- four implementations of the
 * binary format this package exists to have one of -- and packing the bits would have broken all
 * four without a type error, because `data` is a string either way. They call this now.
 *
 * Throws `WireFormatError` for a box with negative extent, data that is not base64, a byte count
 * that disagrees with the box, or a packing it does not know.
 */
export function maskRegion(wire: WireMask): Uint8Array {
  if (wire.box === null || wire.box === undefined) return new Uint8Array(0);

  const [x0, y0, x1, y1] = wire.box;
  if (!(x1 >= x0 && y1 >= y0)) {
    throw new WireFormatError(`a mask box ${JSON.stringify(wire.box)} has a negative extent`);
  }
  const count = (x1 - x0) * (y1 - y0);

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(wire.data);
  } catch {
    throw new WireFormatError("a mask's pixels are not valid base64");
  }

  if (wire.packing === undefined) {
    if (bytes.length !== count) {
      throw new WireFormatError(`a mask box says ${count} pixels but carries ${bytes.length} bytes`);
    }
    // Anything non-zero is a set pixel; the library's masks are strictly 0 or 1.
    return bytes.map((value) => (value === 0 ? 0 : 1));
  }
  if (wire.packing !== "bits") {
    throw new WireFormatError(`a mask is packed as ${JSON.stringify(wire.packing)}, which no decoder knows`);
  }

  const expected = Math.ceil(count / 8);
  if (bytes.length !== expected) {
    throw new WireFormatError(
      `a mask box says ${count} pixels, which pack into ${expected} bytes, but it carries ${bytes.length}`,
    );
  }
  const region = new Uint8Array(count);
  for (let bit = 0; bit < count; bit += 1) {
    region[bit] = (bytes[bit >> 3]! >> (7 - (bit & 7))) & 1;
  }
  return region;
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
  const region = maskRegion(wire);
  for (let y = y0; y < y1; y += 1) {
    data.set(region.subarray((y - y0) * boxWidth, (y - y0 + 1) * boxWidth), y * width + x0);
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
