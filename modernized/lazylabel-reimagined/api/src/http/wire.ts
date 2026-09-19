/**
 * The JSON shapes the annotation routes speak.
 *
 * PROVISIONAL. Phase 4 builds the real client, and the wire format is its to settle; what is fixed
 * here is only what the contracts in `AI_NATIVE_SPEC.md` section 3 already promise — that a load
 * carries its source format, the names the file established, the count it rejected, and every
 * failure it walked past. Those fields exist so a client can say "412 unreadable lines" rather than
 * showing an empty canvas (decision 15d), and they are the part worth getting right now.
 *
 * Masks travel BOUNDED: a bounding box plus the bytes inside it. The obvious encoding, a full-image
 * plane per segment, is what the memory NFR exists to forbid — a 50-megapixel image with 500
 * objects is 25 GB of ones and zeros, almost all of them zero. Bounding costs a dozen lines here
 * and keeps the wire honest about the same property the in-memory representation has to have.
 */

import type { BinaryMask, LoadOutcome, Segment } from "@lazylabel/annotation-formats";

import { badRequest, unprocessable } from "./problem.js";

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
   * Higher-priority sidecars that exist but could not be read.
   *
   * Never silently empty: decision 15c continues the chain past a damaged file so the user's work
   * is recovered from a healthy sidecar, and requires that the recovery be visible. A client that
   * drops this field turns a fixable problem into a mystery.
   */
  readonly failures: readonly { readonly format: string; readonly reason: string }[];
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
    failures: outcome.failures.map((failure) => ({ format: failure.format, reason: failure.reason })),
  };
}

function encodeSegment(segment: Segment): WireSegment {
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

export function encodeMask(mask: BinaryMask): WireMask {
  const box = boundsOf(mask);
  if (box === null) return { height: mask.height, width: mask.width, box: null, data: "" };

  const [x0, y0, x1, y1] = box;
  const boxWidth = x1 - x0;
  const region = new Uint8Array(boxWidth * (y1 - y0));
  for (let y = y0; y < y1; y += 1) {
    region.set(mask.data.subarray(y * mask.width + x0, y * mask.width + x1), (y - y0) * boxWidth);
  }
  return {
    height: mask.height,
    width: mask.width,
    box,
    data: Buffer.from(region).toString("base64"),
  };
}

export function decodeMask(wire: WireMask): BinaryMask {
  const { height, width } = wire;
  if (!Number.isInteger(height) || !Number.isInteger(width) || height < 0 || width < 0) {
    throw unprocessable("a mask has a non-integer or negative size");
  }

  const data = new Uint8Array(height * width);
  if (wire.box === null) return { height, width, data };

  const [x0, y0, x1, y1] = wire.box;
  if (!(x0 >= 0 && y0 >= 0 && x1 <= width && y1 <= height && x1 >= x0 && y1 >= y0)) {
    throw unprocessable(`a mask box ${JSON.stringify(wire.box)} does not fit its ${width}x${height} image`);
  }

  const boxWidth = x1 - x0;
  const region = Buffer.from(wire.data, "base64");
  if (region.length !== boxWidth * (y1 - y0)) {
    throw unprocessable(
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

/** Parse a JSON request body into an object, or fail with 400. */
export function parseJsonObject(body: Uint8Array): Record<string, unknown> {
  if (body.length === 0) throw badRequest("the request body is empty");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8").decode(body));
  } catch (cause) {
    throw badRequest(`the request body is not JSON: ${cause instanceof Error ? cause.message : cause}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw badRequest("the request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
