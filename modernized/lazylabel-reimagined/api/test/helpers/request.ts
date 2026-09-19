/**
 * Building API requests for tests.
 *
 * `createApp` speaks plain request objects rather than sockets, so these are the whole transport.
 * The image size travels as a query parameter because the image pipeline (C8, Phase 5) cannot yet
 * decode the file to find it; `imageSizeFromQuery` in `app.ts` records why that seam is visible
 * rather than hidden.
 */

import type { ApiRequest } from "../../src/app.js";

const EMPTY = new Uint8Array(0);

export function get(
  path: string,
  imageSize?: readonly [number, number],
  headers: Readonly<Record<string, string>> = {},
): ApiRequest {
  const query = new URLSearchParams();
  if (imageSize) {
    query.set("height", String(imageSize[0]));
    query.set("width", String(imageSize[1]));
  }
  return { method: "GET", path, query, headers, body: EMPTY };
}

export function put(
  path: string,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): ApiRequest {
  return {
    method: "PUT",
    path,
    query: new URLSearchParams(),
    headers: { "content-type": "application/json", ...headers },
    body: new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

export function request(
  method: string,
  path: string,
  options: {
    query?: Readonly<Record<string, string>>;
    headers?: Readonly<Record<string, string>>;
    body?: Uint8Array;
  } = {},
): ApiRequest {
  return {
    method,
    path,
    query: new URLSearchParams(options.query ?? {}),
    headers: options.headers ?? {},
    body: options.body ?? EMPTY,
  };
}

/**
 * The JSON body of a response.
 *
 * `ApiResponse.body` is `string | Uint8Array` since the image routes return PNG bytes, and every
 * JSON test would otherwise have to narrow it by hand.
 */
export function jsonBody<T = any>(response: { body: string | Uint8Array }): T {
  const text =
    typeof response.body === "string" ? response.body : new TextDecoder().decode(response.body);
  return JSON.parse(text) as T;
}
