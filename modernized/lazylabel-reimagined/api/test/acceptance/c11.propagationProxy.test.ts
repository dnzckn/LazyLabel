/**
 * C11 through the API: starting a propagation, watching it, stopping it.
 *
 * The inference service's own suite proves the JOB behaves — cancellation keeps committed frames,
 * a failure is a state with its reason, a client that falls behind is told. What is proven here is
 * the layer between the browser and that: the API forwards rather than interprets, it checks the
 * shape so a body that cannot possibly work is refused before a GPU is involved, and it does not
 * flatten the two statuses that carry meaning — 202 for accepted, 410 for results that are gone.
 *
 * Nothing here needs a model, because the API has never had one. It has a fake service.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { HttpInferenceClient } from "../../src/adapters/httpInference.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { jsonBody, post, request } from "../helpers/request.js";

function fakeService(handler: (path: string, body: unknown, method: string) => Response) {
  const calls: { path: string; search: string; method: string; body: unknown }[] = [];

  const fetchStub = vi.fn(async (...args: Parameters<typeof globalThis.fetch>) => {
    const [input, init] = args;
    const url = new URL(String(input));
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({
      path: url.pathname,
      search: url.search,
      method: init?.method ?? "GET",
      body,
    });
    return handler(url.pathname, body, init?.method ?? "GET");
  });

  return { fetch: fetchStub as unknown as typeof globalThis.fetch, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SEQUENCE = ["frames/a.png", "frames/b.png", "frames/c.png"];

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    state: "running",
    completed: 0,
    total: 3,
    cursor: 0,
    cancelling: false,
    error: null,
    results: [],
    ...overrides,
  };
}

const MASK = { height: 2, width: 2, box: [0, 0, 1, 1], data: "AQE=" };

describe("C11: propagation through the API", () => {
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

  describe("starting", () => {
    it("forwards the request and keeps the 202", async () => {
      // 202 all the way through. Turning it into a 200 would tell the browser the work is done.
      const service = fakeService(() => jsonResponse(202, job()));

      const response = await appWith(service).handle(
        post("/inference/propagations", { sequence: SEQUENCE, references: [0] }),
      );

      expect(response.status).toBe(202);
      expect(jsonBody(response).id).toBe("job-1");
      expect(service.calls[0]!.body).toEqual({ sequence: SEQUENCE, references: [0] });
    });

    it("passes the streaming window through untouched", async () => {
      // RULE-026's `stream_window_size`. The API has no opinion about it; the service does.
      const service = fakeService(() => jsonResponse(202, job()));

      await appWith(service).handle(
        post("/inference/propagations", {
          sequence: SEQUENCE,
          references: [0],
          window: 50,
          streaming: true,
          start: 1,
          end: 2,
          model: "SAM 2.1 large",
        }),
      );

      expect(service.calls[0]!.body).toEqual({
        sequence: SEQUENCE,
        references: [0],
        start: 1,
        end: 2,
        window: 50,
        streaming: true,
        model: "SAM 2.1 large",
      });
    });

    it("omits what was not asked for rather than sending defaults", async () => {
      // A default invented here is a default the service cannot tell from a choice.
      const service = fakeService(() => jsonResponse(202, job()));

      await appWith(service).handle(
        post("/inference/propagations", { sequence: SEQUENCE, references: [0] }),
      );

      expect(Object.keys(service.calls[0]!.body as object).sort()).toEqual([
        "references",
        "sequence",
      ]);
    });

    it.each([
      [{ references: [0] }, "non-empty 'sequence'"],
      [{ sequence: [], references: [0] }, "non-empty 'sequence'"],
      [{ sequence: [1, 2], references: [0] }, "non-empty 'sequence'"],
      [{ sequence: SEQUENCE }, "at least one reference"],
      [{ sequence: SEQUENCE, references: [] }, "at least one reference"],
      [{ sequence: SEQUENCE, references: ["a"] }, "at least one reference"],
      [{ sequence: SEQUENCE, references: [0], start: 1.5 }, "whole frame number"],
    ])("refuses %j before reaching the service", async (body, expected) => {
      const service = fakeService(() => jsonResponse(202, job()));

      const response = await appWith(service).handle(post("/inference/propagations", body));

      expect(response.status).toBe(400);
      expect(jsonBody(response).message).toContain(expected);
      expect(service.calls).toHaveLength(0);
    });
  });

  describe("watching", () => {
    it("asks with the cursor and returns the frames", async () => {
      const service = fakeService(() =>
        jsonResponse(200, job({
          state: "completed",
          completed: 2,
          cursor: 2,
          results: [
            { source: "frames/b.png", objectId: 1, mask: MASK, confidence: 0.97 },
            { source: "frames/c.png", objectId: 1, mask: MASK, confidence: 0.4 },
          ],
        })),
      );

      const response = await appWith(service).handle(
        request("GET", "/inference/propagations", { query: { id: "job-1", cursor: "0" } }),
      );

      expect(response.status).toBe(200);
      expect(service.calls[0]!.search).toBe("?id=job-1&cursor=0");
      expect(jsonBody(response).results).toHaveLength(2);
      // RULE-016's confidence survives the trip: it decides which frames get flagged for review.
      expect(jsonBody(response).results[1].confidence).toBeCloseTo(0.4);
    });

    it("lists the jobs when no id is given", async () => {
      // What a client that has just reconnected needs; the alternative is a running propagation
      // nobody holds a handle to.
      const service = fakeService(() => jsonResponse(200, { jobs: [job(), job({ id: "job-2" })] }));

      const response = await appWith(service).handle(request("GET", "/inference/propagations"));

      expect(response.status).toBe(200);
      expect(jsonBody(response).jobs.map((each: { id: string }) => each.id)).toEqual([
        "job-1",
        "job-2",
      ]);
    });

    it("keeps the 410 when buffered results are gone", async () => {
      // The one status that must not be flattened into a 500: it means results EXISTED and are
      // gone, and the detail says where to resume. A 500 would make a client retry the same cursor
      // forever.
      const service = fakeService(() =>
        jsonResponse(410, {
          code: "results_overflowed",
          message: "results from cursor 0 are no longer buffered",
          detail: { earliest: 15, requested: 0 },
        }),
      );

      const response = await appWith(service).handle(
        request("GET", "/inference/propagations", { query: { id: "job-1", cursor: "0" } }),
      );

      expect(response.status).toBe(410);
      expect(jsonBody(response).code).toBe("results_overflowed");
      expect(jsonBody(response).detail.earliest).toBe(15);
    });

    it("refuses a cursor that is not a whole number", async () => {
      const service = fakeService(() => jsonResponse(200, job()));

      const response = await appWith(service).handle(
        request("GET", "/inference/propagations", { query: { id: "job-1", cursor: "soon" } }),
      );

      expect(response.status).toBe(400);
      expect(service.calls).toHaveLength(0);
    });

    it("passes a 404 through for a job that does not exist", async () => {
      const service = fakeService(() => jsonResponse(404, { code: "unknown_job", message: "no job" }));

      const response = await appWith(service).handle(
        request("GET", "/inference/propagations", { query: { id: "nope" } }),
      );

      expect(response.status).toBe(404);
      expect(jsonBody(response).code).toBe("unknown_job");
    });

    it("refuses a job whose state did not arrive", async () => {
      // A job with no state would be shown as running forever -- a caller left waiting for
      // something that already finished, which is the failure this service exists to stop.
      const service = fakeService(() => jsonResponse(200, { id: "job-1", completed: 3 }));

      const response = await appWith(service).handle(
        request("GET", "/inference/propagations", { query: { id: "job-1" } }),
      );

      expect(response.status).toBe(502);
    });

    it("refuses a state nobody can branch on", async () => {
      const service = fakeService(() => jsonResponse(200, job({ state: "thinking" })));

      const response = await appWith(service).handle(
        request("GET", "/inference/propagations", { query: { id: "job-1" } }),
      );

      expect(response.status).toBe(502);
      expect(jsonBody(response).message).toContain("thinking");
    });
  });

  describe("cancelling", () => {
    it("sends the DELETE and reports what was kept", async () => {
      // RULE-063: the frames already done survive, and the message says so -- which is the part a
      // user needs before they trust the button.
      const service = fakeService(() =>
        jsonResponse(200, job({
          state: "cancelled",
          completed: 2,
          error: "cancelled after 2 frames; those frames are kept",
        })),
      );

      const response = await appWith(service).handle(
        request("DELETE", "/inference/propagations/job-1"),
      );

      expect(response.status).toBe(200);
      expect(service.calls[0]!.method).toBe("DELETE");
      expect(service.calls[0]!.path).toBe("/inference/propagations/job-1");
      expect(jsonBody(response).error).toContain("kept");
    });

    it("reports cancelling while the frame in flight finishes", async () => {
      const service = fakeService(() => jsonResponse(200, job({ cancelling: true })));

      const response = await appWith(service).handle(
        request("DELETE", "/inference/propagations/job-1"),
      );

      expect(jsonBody(response).cancelling).toBe(true);
      expect(jsonBody(response).state).toBe("running");
    });

    it("escapes a job id rather than building a path from it", async () => {
      const service = fakeService(() => jsonResponse(200, job()));

      await appWith(service).handle(request("DELETE", "/inference/propagations/a%2Fb"));

      expect(service.calls[0]!.path).toBe("/inference/propagations/a%2Fb");
    });
  });

  describe("without an inference service at all", () => {
    it("answers 503 rather than pretending", async () => {
      const app = createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata });

      const response = await app.handle(
        post("/inference/propagations", { sequence: SEQUENCE, references: [0] }),
      );

      expect(response.status).toBe(503);
    });
  });
});
