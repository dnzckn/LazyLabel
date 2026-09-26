/**
 * The API serving the built web app: one process, one port, one URL (DEPLOYABILITY.md R3).
 *
 * Through a real socket rather than `app.handle`, because what is under test is the binding: which
 * paths reach the bundle, which reach the router, and what a request spelled to escape the build
 * folder gets. `node:http` sends a path exactly as written, where `fetch` would tidy `%2e%2e` away
 * before it left the test.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { createLogger } from "../../src/http/log.js";
import { builtWebRoot } from "../../src/http/staticWeb.js";
import { createServer } from "../../src/server.js";

const PAGE = "<!doctype html><title>LazyLabel</title><div id=root></div>";
const SCRIPT = "console.log('bundle');";
const SECRET = "not for the browser";

interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

/** A request with its path sent exactly as written. */
function send(port: number, method: string, rawPath: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: "127.0.0.1", port, method, path: rawPath }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () =>
        resolve({
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          body: Buffer.concat(chunks).toString("utf-8"),
        }),
      );
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

let scratch: string;
let site: string;
let metadata: SqliteMetadataStore;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "lazylabel-web-"));
  site = path.join(scratch, "dist");
  await mkdir(path.join(site, "assets"), { recursive: true });
  await writeFile(path.join(site, "index.html"), PAGE);
  await writeFile(path.join(site, "assets", "index-B4x9q2.js"), SCRIPT);
  await writeFile(path.join(site, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  // Beside the build, not in it: what every escape below is trying to reach.
  await writeFile(path.join(scratch, "secret.txt"), SECRET);
  // A link inside the build that leads out of it. A junction, so Windows needs no privilege for it.
  await symlink(scratch, path.join(site, "assets", "outside"), "junction");
  metadata = new SqliteMetadataStore(":memory:");
});

afterAll(async () => {
  await metadata.close();
  await rm(scratch, { recursive: true, force: true });
});

/** Every line the API's router logs, so a test can say what reached it. */
let routerLog: string[] = [];

function app() {
  return createApp({
    blobStore: new MemoryBlobStore(),
    metadataStore: metadata,
    datasetHealthy: async () => true,
    logger: createLogger((line) => routerLog.push(line)),
  });
}

describe("with the web app built", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer(app(), { webRoot: site });
    port = await listen(server);
  });
  afterAll(() => close(server));
  beforeEach(() => {
    routerLog = [];
  });

  it("answers / with the app", async () => {
    const answer = await send(port, "GET", "/");

    expect(answer.status).toBe(200);
    expect(answer.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(answer.body).toBe(PAGE);
  });

  it("never lets a browser keep index.html, or it would load last week's bundle", async () => {
    expect((await send(port, "GET", "/")).headers["cache-control"]).toBe("no-cache");
    expect((await send(port, "GET", "/index.html")).body).toBe(PAGE);
  });

  it("serves the bundle's assets, and lets the browser keep them, since their names are fingerprints", async () => {
    const answer = await send(port, "GET", "/assets/index-B4x9q2.js");

    expect(answer.status).toBe(200);
    expect(answer.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(answer.headers["cache-control"]).toContain("immutable");
    expect(answer.body).toBe(SCRIPT);
  });

  it("serves a top-level file such as a favicon, which is not fingerprinted", async () => {
    const answer = await send(port, "GET", "/favicon.svg");

    expect(answer.status).toBe(200);
    expect(answer.headers["content-type"]).toBe("image/svg+xml");
    expect(answer.headers["cache-control"]).toBe("no-cache");
  });

  it("answers HEAD with the headers and no body", async () => {
    const answer = await send(port, "HEAD", "/");

    expect(answer.status).toBe(200);
    expect(answer.headers["content-length"]).toBe(String(Buffer.byteLength(PAGE)));
    expect(answer.body).toBe("");
  });

  it("still answers the API's routes unprefixed, as the dev server's proxy and nginx send them", async () => {
    const answer = await send(port, "GET", "/health");

    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toMatchObject({ status: "ok" });
  });

  it("answers the same routes under /api, which is what the browser calls", async () => {
    const plain = await send(port, "GET", "/health");
    const prefixed = await send(port, "GET", "/api/health");

    expect(prefixed.status).toBe(plain.status);
    expect(JSON.parse(prefixed.body)).toEqual(JSON.parse(plain.body));
    expect((await send(port, "GET", "/api/projects/default/images")).status).toBe(200);
  });

  it("never serves the bundle under /api, where every path is the API's", async () => {
    const answer = await send(port, "GET", "/api/index.html");

    expect(answer.status).toBe(404);
    expect(JSON.parse(answer.body)).toMatchObject({ code: "not_found" });
  });

  it.each([
    "/assets/../../secret.txt",
    "/assets/%2e%2e/%2e%2e/secret.txt",
    "/assets/..%2f..%2fsecret.txt",
    "/assets/..%5c..%5csecret.txt",
    "/%2e%2e/secret.txt",
    "/assets/outside/secret.txt",
    "/assets/%00.js",
    "/assets/%E0%A4%A.js",
  ])("reads nothing outside the build for %s", async (spelled) => {
    const answer = await send(port, "GET", spelled);

    expect(answer.status).toBe(404);
    expect(answer.body).not.toContain(SECRET);
  });

  it("answers a bundle path the build does not have with a plain 404, as any web server would", async () => {
    const answer = await send(port, "GET", "/assets/missing.js");

    expect(answer.status).toBe(404);
    expect(answer.headers["content-type"]).toBe("text/plain; charset=utf-8");
  });

  it("does not hand the browser's own /favicon.ico to the router, which would log it on every page load", async () => {
    // Every browser asks for it, and this bundle has none. The router logs a path it has no route
    // for as a warning, so each page load put a warning in front of a new user.
    const answer = await send(port, "GET", "/favicon.ico");

    expect(answer.status).toBe(404);
    expect(routerLog).toEqual([]);
  });

  it("gives a method other than GET or HEAD to the API, bundle path or not", async () => {
    const answer = await send(port, "POST", "/");

    expect(answer.status).toBe(404);
    expect(JSON.parse(answer.body)).toMatchObject({ code: "not_found" });
  });
});

describe("with no web app", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer(app());
    port = await listen(server);
  });
  afterAll(() => close(server));

  it("answers / with the API's 404, as it always did", async () => {
    const answer = await send(port, "GET", "/");

    expect(answer.status).toBe(404);
    expect(JSON.parse(answer.body)).toMatchObject({ code: "not_found" });
  });

  it("still answers its routes, under /api as well", async () => {
    expect((await send(port, "GET", "/health")).status).toBe(200);
    expect((await send(port, "GET", "/api/health")).status).toBe(200);
  });
});

describe("whether the web app has been built", () => {
  it("is the folder when it holds an index.html", () => {
    expect(builtWebRoot(site)).toBe(site);
  });

  it("is not a folder with no index.html in it, such as one a failed build left", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "lazylabel-empty-"));
    try {
      expect(builtWebRoot(empty)).toBeNull();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("is nothing when serving it is turned off", () => {
    expect(builtWebRoot(null)).toBeNull();
  });
});
