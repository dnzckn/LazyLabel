/**
 * The HTTP contract between the web app and the API.
 *
 * Shared so the two sides cannot drift: the browser must decode exactly what the server encoded,
 * and a binary layout implemented twice is a bug waiting for a large mask.
 */

export { bytesToBase64, base64ToBytes } from "./base64.js";

export { TILE_SIZE, levelCount, levelFor, levelSize, tileGrid, type Size } from "./tiles.js";

export {
  WireFormatError,
  decodeMask,
  decodeSegment,
  encodeLoadResponse,
  encodeMask,
  encodeSegment,
  maskRegion,
  type WireDatasetImage,
  type WireDatasetListing,
  type WireFailure,
  type WireImageMetadata,
  type WireLoadResponse,
  type WireMask,
  type WireProblem,
  type WireSaveRequest,
  type WireSaveResponse,
  type WireSegment,
} from "./wire.js";
