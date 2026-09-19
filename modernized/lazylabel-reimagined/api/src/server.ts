/**
 * Binding the app onto `node:http`.
 *
 * Deliberately thin. Everything worth testing is in `app.ts`, which speaks plain request and
 * response objects, so the acceptance tests do not need a socket and this file has no logic to get
 * wrong beyond reading the body and writing it back.
 */

import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { MAX_BODY_BYTES, type ApiRequest, type App } from "./app.js";

export function createServer(app: App): Server {
  return createHttpServer((incoming, outgoing) => {
    void respond(app, incoming, outgoing);
  });
}

async function respond(app: App, incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
  try {
    const url = new URL(incoming.url ?? "/", "http://localhost");
    const body = await readBody(incoming);

    const request: ApiRequest = {
      method: incoming.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      headers: normalizeHeaders(incoming.headers),
      body,
    };

    const response = await app.handle(request);
    outgoing.writeHead(response.status, response.headers);
    outgoing.end(typeof response.body === "string" ? response.body : Buffer.from(response.body));
  } catch (cause) {
    // Reaching here means the request could not even be assembled. The app handles everything else.
    const tooLarge = cause instanceof Error && cause.name === "PayloadTooLargeError";
    outgoing.writeHead(tooLarge ? 413 : 400, { "content-type": "application/json; charset=utf-8" });
    outgoing.end(
      JSON.stringify({
        status: tooLarge ? 413 : 400,
        code: tooLarge ? "payload_too_large" : "bad_request",
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  }
}

/**
 * Read the body, refusing anything over the cap.
 *
 * The cap is enforced as the bytes ARRIVE, not after. Buffering an unbounded body and checking its
 * length afterwards is the check that cannot work: the memory is already spent by the time it runs.
 */
function readBody(incoming: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    incoming.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        const error = new Error(`the request body exceeds ${MAX_BODY_BYTES} bytes`);
        error.name = "PayloadTooLargeError";
        incoming.destroy();
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    incoming.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    incoming.on("error", reject);
  });
}

function normalizeHeaders(headers: IncomingMessage["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}
