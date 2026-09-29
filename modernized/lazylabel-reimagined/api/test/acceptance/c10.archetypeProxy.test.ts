/**
 * C10 through the API: which frames of a sequence are worth annotating by hand.
 *
 * The service's own suite proves the clustering answers. What is proven here is the layer between
 * the browser and it: the shape is checked before a GPU is involved, and the two answers that
 * carry meaning survive the trip — `fellShort`, and an empty suggestion list that is a RESULT
 * rather than a failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { HttpInferenceClient } from "../../src/adapters/httpInference.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { jsonBody, post } from "../helpers/request.js";

function fakeService(handler: (path: string, body: unknown) => Response) {
  const calls: { path: string; body: unknown }[] = [];
  const fetchStub = vi.fn(async (...args: Parameters<typeof globalThis.fetch>) => {
    const [input, init] = args;
    const url = new URL(String(input));
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({ path: url.pathname, body });
    return handler(url.pathname, body);
  });
  return { fetch: fetchStub as unknown as typeof globalThis.fetch, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SEQUENCE = ["frames/a.png", "frames/b.png", "frames/c.png", "frames/d.png", "frames/e.png"];

function found(overrides: Record<string, unknown> = {}) {
  return {
    suggested: ["frames/a.png", "frames/c.png"],
    budget: 2,
    clusters: 2,
    noise: 0,
    fellShort: false,
    unreadable: [],
    ...overrides,
  };
}

describe("C10: finding archetypes through the API", () => {
  let metadata: SqliteMetadataStore;

  beforeEach(() => {
    metadata = new SqliteMetadataStore(":memory:");
  });

  afterEach(() => {
    metadata.close();
  });

  function appWith(service: ReturnType<typeof fakeService>): App {
    return createApp({
      blobStore: new MemoryBlobStore(),
      metadataStore: metadata,
      inference: new HttpInferenceClient({ baseUrl: "http://inference.test", fetch: service.fetch }),
    });
  }

  it("forwards the sequence and returns the suggestions", async () => {
    const service = fakeService(() => jsonResponse(200, found()));

    const response = await appWith(service).handle(
      post("/inference/archetypes", { sequence: SEQUENCE }),
    );

    expect(response.status).toBe(200);
    expect(jsonBody(response).suggested).toEqual(["frames/a.png", "frames/c.png"]);
    expect(service.calls[0]!.body).toEqual({ sequence: SEQUENCE });
  });

  it("names the model when one is asked for, and omits it otherwise", async () => {
    const service = fakeService(() => jsonResponse(200, found()));
    const app = appWith(service);

    await app.handle(post("/inference/archetypes", { sequence: SEQUENCE, model: "SAM 2.1 large" }));
    await app.handle(post("/inference/archetypes", { sequence: SEQUENCE }));

    expect((service.calls[0]!.body as { model: string }).model).toBe("SAM 2.1 large");
    expect(Object.keys(service.calls[1]!.body as object)).toEqual(["sequence"]);
  });

  it("carries fellShort, which is the difference between two very different answers", async () => {
    // "Here are your twenty frames" against "this sequence is too uniform to find twenty distinct
    // ones". Legacy computes it to pick a progress message and throws it away.
    const service = fakeService(() => jsonResponse(200, found({ budget: 20, fellShort: true })));

    const response = await appWith(service).handle(
      post("/inference/archetypes", { sequence: SEQUENCE }),
    );

    expect(jsonBody(response).fellShort).toBe(true);
    expect(jsonBody(response).budget).toBe(20);
  });

  it("an empty suggestion list is a RESULT, not a failure", async () => {
    // Every frame was noise: the sequence is too uniform to have scenes. Nothing failed.
    const service = fakeService(() =>
      jsonResponse(200, found({ suggested: [], clusters: 0, noise: 5 })),
    );

    const response = await appWith(service).handle(
      post("/inference/archetypes", { sequence: SEQUENCE }),
    );

    expect(response.status).toBe(200);
    expect(jsonBody(response).suggested).toEqual([]);
  });

  it("refuses a MISSING suggestion list, which is not the same thing", async () => {
    // Rendering "0 suggestions" for a malformed answer would present a failure as a result, which
    // is the defect ASSESSMENT.md 5.4 records of the legacy code.
    const service = fakeService(() => jsonResponse(200, { budget: 2 }));

    const response = await appWith(service).handle(
      post("/inference/archetypes", { sequence: SEQUENCE }),
    );

    expect(response.status).toBe(502);
  });

  it("reports the frames it could not read", async () => {
    // They still count towards the budget, because legacy sizes it from the TOTAL frame count.
    const service = fakeService(() =>
      jsonResponse(200, found({ unreadable: [{ key: "frames/b.png", reason: "corrupt" }] })),
    );

    const response = await appWith(service).handle(
      post("/inference/archetypes", { sequence: SEQUENCE }),
    );

    expect(jsonBody(response).unreadable).toEqual([{ key: "frames/b.png", reason: "corrupt" }]);
  });

  it("passes a 422 through for a sequence too short to answer", async () => {
    // Not flattened into a 400 or a 500: the request was fine and this sequence cannot answer it.
    const service = fakeService(() =>
      jsonResponse(422, { code: "too_few_frames", message: "4 frames is fewer than the 5 needed" }),
    );

    const response = await appWith(service).handle(
      post("/inference/archetypes", { sequence: SEQUENCE }),
    );

    expect(response.status).toBe(422);
    expect(jsonBody(response).code).toBe("too_few_frames");
  });

  it.each([
    [{}, "non-empty 'sequence'"],
    [{ sequence: [] }, "non-empty 'sequence'"],
    [{ sequence: [1, 2] }, "non-empty 'sequence'"],
    [{ sequence: SEQUENCE, model: 7 }, "must be a model name"],
  ])("refuses %j before reaching the service", async (body, expected) => {
    const service = fakeService(() => jsonResponse(200, found()));

    const response = await appWith(service).handle(post("/inference/archetypes", body));

    expect(response.status).toBe(400);
    expect(jsonBody(response).message).toContain(expected);
    expect(service.calls).toHaveLength(0);
  });

  it("answers 503 with no inference service rather than pretending", async () => {
    const app = createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata });

    const response = await app.handle(post("/inference/archetypes", { sequence: SEQUENCE }));

    expect(response.status).toBe(503);
  });

  it("gives every frame its own allowance, so a folder of large photos is not cut off", async () => {
    // 86 photos of about 17 MB took over two minutes on 2026-09-29, and the common limit, two
    // minutes, answered "the inference service could not be reached". Here the common limit is
    // 30 ms and the service answers in 120 ms: five frames get far longer than that.
    const slow = (async (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const answer = setTimeout(() => resolve(jsonResponse(200, found())), 120);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(answer);
          reject(new Error("This operation was aborted"));
        });
      })) as unknown as typeof globalThis.fetch;
    const client = new HttpInferenceClient({ baseUrl: "http://inference.test", fetch: slow, timeoutMs: 30 });

    await expect(client.findArchetypes(SEQUENCE, undefined, "c10")).resolves.toMatchObject({
      suggested: found().suggested,
    });
  });
});
