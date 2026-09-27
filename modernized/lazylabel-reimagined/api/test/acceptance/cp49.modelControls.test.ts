/**
 * CP-49: legacy's Refresh, Load and Unload, and what its "Current: ..." names, through the API.
 *
 * Legacy's Model Selection section rescans its list, loads the selected model at once and frees it
 * again (L ui/main_window.py:1204-1305). The browser never holds a model endpoint, so each control
 * is a route here that forwards to the inference service, which is the only side that knows what
 * it has in memory.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { HttpInferenceClient } from "../../src/adapters/httpInference.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, jsonBody, post, request } from "../helpers/request.js";

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly correlationId: string | null;
}

function fakeService(answer: (path: string) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchStub = vi.fn(async (...args: Parameters<typeof globalThis.fetch>) => {
    const [input, init] = args;
    const url = new URL(String(input));
    calls.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      correlationId: new Headers(init?.headers).get("x-correlation-id"),
    });
    const { status, body } = answer(url.pathname);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { fetch: fetchStub as unknown as typeof globalThis.fetch, calls };
}

const LISTED = [
  { name: "SAM 2.1 large", family: "sam2", size: "large", videoCapable: true, segmenter: true, present: true, verified: true, detail: "verified", loaded: true },
];

describe("CP-49: the model controls", () => {
  let metadata: SqliteMetadataStore;

  beforeEach(() => {
    metadata = new SqliteMetadataStore(":memory:");
  });
  afterEach(() => metadata.close());

  function appWith(service: ReturnType<typeof fakeService>): App {
    return createApp({
      blobStore: new MemoryBlobStore(),
      metadataStore: metadata,
      inference: new HttpInferenceClient({ baseUrl: "http://inference.test", fetch: service.fetch }),
    });
  }

  it("Refresh asks the service to read its manifest again and lists what it now has", async () => {
    const service = fakeService(() => ({ status: 200, body: { models: LISTED } }));

    const response = await appWith(service).handle(post("/inference/models/refresh", {}, { "x-correlation-id": "c-1" }));

    expect(response.status).toBe(200);
    expect(jsonBody(response).models).toEqual(LISTED);
    expect(service.calls).toMatchObject([{ method: "POST", path: "/inference/models/refresh", correlationId: "c-1" }]);
  });

  it("a manifest the service cannot read again is its reason, not an empty list", async () => {
    const service = fakeService(() => ({
      status: 503,
      body: { code: "manifest_unreadable", message: "the manifest is not valid JSON" },
    }));

    const response = await appWith(service).handle(post("/inference/models/refresh", {}));

    expect(response.status).toBe(503);
    expect(jsonBody(response)).toMatchObject({ code: "manifest_unreadable", message: "the manifest is not valid JSON" });
  });

  it("Load names the model and answers with what is in memory", async () => {
    const service = fakeService(() => ({ status: 200, body: { loaded: ["SAM 2.1 large"] } }));

    const response = await appWith(service).handle(post("/inference/models/load", { model: "SAM 2.1 large" }));

    expect(response.status).toBe(200);
    expect(jsonBody(response)).toEqual({ loaded: ["SAM 2.1 large"] });
    expect(service.calls).toMatchObject([{ method: "POST", path: "/inference/models/load", body: { model: "SAM 2.1 large" } }]);
  });

  it("Load without a model name is refused before the service is asked", async () => {
    const service = fakeService(() => ({ status: 200, body: { loaded: [] } }));

    const response = await appWith(service).handle(post("/inference/models/load", {}));

    expect(response.status).toBe(400);
    expect(service.calls).toHaveLength(0);
  });

  it("a model the service will not load is its reason, passed through", async () => {
    const service = fakeService(() => ({
      status: 503,
      body: { code: "model_unavailable", message: "SAM 1 huge cannot be used: it hashes to 0123..." },
    }));

    const response = await appWith(service).handle(post("/inference/models/load", { model: "SAM 1 huge" }));

    expect(response.status).toBe(503);
    expect(jsonBody(response)).toMatchObject({ code: "model_unavailable" });
    expect(jsonBody(response).message).toContain("cannot be used");
  });

  it("Unload with no body frees whatever is loaded, and says what it freed", async () => {
    const service = fakeService(() => ({ status: 200, body: { unloaded: ["SAM 2.1 large"], loaded: [] } }));

    const response = await appWith(service).handle(request("POST", "/inference/models/unload"));

    expect(response.status).toBe(200);
    expect(jsonBody(response)).toEqual({ unloaded: ["SAM 2.1 large"], loaded: [] });
    expect(service.calls).toMatchObject([{ method: "POST", path: "/inference/models/unload", body: {} }]);
  });

  it("which models are loaded is asked cheaply, without the hashing /inference/models does", async () => {
    const service = fakeService(() => ({ status: 200, body: { loaded: ["SAM 2.1 large"] } }));

    const response = await appWith(service).handle(get("/inference/models/loaded"));

    expect(jsonBody(response)).toEqual({ loaded: ["SAM 2.1 large"] });
    expect(service.calls).toMatchObject([{ method: "GET", path: "/inference/models/loaded" }]);
  });

  it("a malformed answer is a 502, not 'nothing loaded'", async () => {
    const service = fakeService(() => ({ status: 200, body: {} }));

    const response = await appWith(service).handle(get("/inference/models/loaded"));

    expect(response.status).toBe(502);
  });

  it("is 503 on every control when no inference service is configured", async () => {
    const bare = createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata });

    for (const each of [
      post("/inference/models/refresh", {}),
      post("/inference/models/load", { model: "SAM 2.1 large" }),
      request("POST", "/inference/models/unload"),
      get("/inference/models/loaded"),
    ]) {
      expect((await bare.handle(each)).status, each.path).toBe(503);
    }
  });
});
