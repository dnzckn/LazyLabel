/**
 * The built web app, served by the API itself: one process, one port, one URL.
 *
 * DEPLOYABILITY.md's F5. The app existed only at the Vite dev server's address, and the API
 * answered `/` with a 404 while `vite.config.ts` and the architecture both said it served the built
 * app. A newcomer had to run two programs in two terminals and know which of the two ports was the
 * app. Now `npm install` builds `web/dist` and the API serves it.
 *
 * ONLY THE BUNDLE'S OWN PATHS ARE STATIC: `/`, `/index.html`, `/assets/*`, and a file at the top
 * level with a static extension (a favicon, say), fetched with GET or HEAD. Everything else is the
 * API's, so `/health` and every other unprefixed route keep working exactly as the dev server's
 * proxy and nginx expect. A bundle path whose file is not there is a plain 404 from here, as from
 * any web server, rather than the router's: every browser asks for `/favicon.ico`, which this
 * bundle does not have, and the router logs each path it has no route for as a warning, so a
 * warning per page load would have been the first thing a new user saw in the terminal.
 *
 * NOTHING OUTSIDE THE BUILD FOLDER, however the request spells it. The router decodes a path once
 * for the API; this decodes it once for the disk, then resolves it, follows any link, and refuses
 * anything that did not land inside the folder. `%2e%2e`, `%2f` and, on Windows, `%5c` are the
 * spellings that get past a check made before decoding.
 */

import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as path from "node:path";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

/** The top-level files a bundle carries beside `index.html`: favicons, manifests, robots.txt. */
const TOP_LEVEL_FILE = /^\/[^/]+\.(?:ico|png|svg|txt|webmanifest|json)$/;

/** True for a request the web app's bundle answers. Every other request is the API's. */
export function isStaticRequest(method: string | undefined, pathname: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  return (
    pathname === "/"
    || pathname === "/index.html"
    || pathname.startsWith("/assets/")
    || TOP_LEVEL_FILE.test(pathname)
  );
}

/**
 * The web app's build folder when it has been built, or null.
 *
 * "Built" means an `index.html` is there: a `dist` folder with nothing in it, left by a build that
 * failed, is not an app, and serving it would answer `/` with the API's 404 anyway.
 */
export function builtWebRoot(folder: string | null): string | null {
  if (folder === null) return null;
  return existsSync(path.join(folder, "index.html")) ? folder : null;
}

/** Answer a request `isStaticRequest` accepted: the file from `root`, or a plain 404. */
export async function serveStatic(
  root: string,
  pathname: string,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> {
  const file = await resolveInside(root, pathname === "/" ? "/index.html" : pathname);
  const body = file === null ? null : await readFile(file).catch(() => null);

  if (file === null || body === null) {
    outgoing.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    });
    outgoing.end(incoming.method === "HEAD" ? undefined : "Not found\n");
    return;
  }

  outgoing.writeHead(200, {
    "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": String(body.length),
    // Vite fingerprints everything under assets/, so a name there never changes content and can be
    // kept for good. index.html cannot, or a browser would keep loading last week's bundle, and a
    // top-level file is not fingerprinted either.
    "cache-control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
  });
  outgoing.end(incoming.method === "HEAD" ? undefined : body);
}

/** The file `pathname` names inside `root`, or null when it is not one, or not inside. */
async function resolveInside(root: string, pathname: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  try {
    const base = await realpath(root);
    const candidate = path.resolve(base, `.${decoded}`);
    if (!isInside(base, candidate)) return null;
    const real = await realpath(candidate);
    if (!isInside(base, real)) return null;
    return (await stat(real)).isFile() ? real : null;
  } catch {
    return null;
  }
}

function isInside(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return (
    relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}
