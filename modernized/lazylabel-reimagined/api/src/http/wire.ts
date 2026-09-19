/**
 * The API's side of the wire contract.
 *
 * The shapes and the mask codec live in `@lazylabel/contracts`, shared with the web app, because
 * the browser has to decode exactly what this encodes. What stays here is the HTTP-specific part:
 * reading a request body, and turning a contract violation into the right status code.
 */

import { WireFormatError } from "@lazylabel/contracts";

import { badRequest, unprocessable } from "./problem.js";

export {
  decodeMask,
  decodeSegment,
  encodeLoadResponse,
  encodeMask,
  encodeSegment,
  WireFormatError,
  type WireFailure,
  type WireLoadResponse,
  type WireMask,
  type WireSaveRequest,
  type WireSaveResponse,
  type WireSegment,
} from "@lazylabel/contracts";

/**
 * Run a codec and report a violation as 422 rather than 500.
 *
 * A mask whose box does not fit its image is a bad request, not a broken server, and the
 * difference decides whether the client sees something it can act on.
 */
export function decoding<T>(decode: () => T): T {
  try {
    return decode();
  } catch (cause) {
    if (cause instanceof WireFormatError) throw unprocessable(cause.message);
    throw cause;
  }
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
