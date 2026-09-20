/**
 * C3 — Segment an object with SAM: the API's share, which is the proxy.
 *
 * Phase 3's exit criterion 4: failures surface as typed errors, never as success, and the
 * API-to-inference contract tests pass.
 *
 * The API is the only thing that talks to inference, so the browser never holds a model endpoint —
 * and so one correlation id runs through all three processes. The model itself is exercised in the
 * inference package against a real checkpoint; what belongs here is everything around it, which is
 * where a proxy goes wrong: losing the correlation id, flattening five distinct failures into one,
 * or turning "the model is not answering" into "the API is broken".
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { HttpInferenceClient } from "../../src/adapters/httpInference.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, jsonBody, post } from "../helpers/request.js";

const HEALTHY_INFERENCE = {
  status: "ok",
  ai: {
    available: true,
    reason: "PyTorch 2.7.1 and segment-anything are available.",
    videoCapable: true,
    accelerator: "NVIDIA GeForce RTX 4090",
  },
  models: { declared: 1, usable: 1, manifestError: null },
  reason: null,
};

const MASK = { height: 4, width: 4, box: [1, 1, 3, 3] as const, data: "AQEBAQ==" };

/** A stand-in inference service, so the proxy can be tested without Python or a GPU. */
function fakeService(handler: (path: string, body: unknown, headers: Headers) => Response) {
  const calls: { path: string; body: unknown; correlationId: string | null }[] = [];

  // Parameters<typeof fetch> rather than RequestInfo: the API's tsconfig has no DOM lib, on
  // purpose, so a server file cannot reach for a browser type by accident.
  const fetchStub = vi.fn(async (...args: Parameters<typeof globalThis.fetch>) => {
    const [input, init] = args;
    const url = new URL(String(input));
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    const headers = new Headers(init?.headers);
    calls.push({ path: url.pathname, body, correlationId: headers.get("x-correlation-id") });
    return handler(url.pathname, body, headers);
  });

  return { fetch: fetchStub as unknown as typeof globalThis.fetch, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("C3: the API's inference proxy", () => {
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

  it("forwards an embedding request and returns the handle", async () => {
    const service = fakeService((path) =>
      path === "/inference/embeddings"
        ? jsonResponse(200, { handle: "abc123", cached: false })
        : jsonResponse(404, {}),
    );

    const response = await appWith(service).handle(
      post("/inference/embeddings", { image: "frames/a.png", model: "SAM 2.1 large" }),
    );

    expect(response.status).toBe(200);
    expect(jsonBody(response)).toEqual({ handle: "abc123", cached: false });
    expect(service.calls[0]!.body).toEqual({ image: "frames/a.png", model: "SAM 2.1 large" });
  });

  it("forwards a prompt and returns the winning mask with every candidate's score", async () => {
    const service = fakeService(() =>
      jsonResponse(200, { mask: MASK, score: 0.99, chosen: 2, alternatives: [0.1, 0.2, 0.99] }),
    );

    const response = await appWith(service).handle(
      post("/inference/segment", { handle: "abc123", points: [{ x: 5, y: 6, positive: true }] }),
    );

    expect(response.status).toBe(200);
    const body = jsonBody(response);
    // RULE-020 chose one of three. Passing all three on lets the client show it was close rather
    // than presenting a marginal mask as a confident one.
    expect(body.chosen).toBe(2);
    expect(body.alternatives).toEqual([0.1, 0.2, 0.99]);
  });

  it("carries one correlation id through to the inference service", async () => {
    const service = fakeService(() => jsonResponse(200, { handle: "h", cached: true }));

    const response = await appWith(service).handle(
      post(
        "/inference/embeddings",
        { image: "a.png", model: "m" },
        { "x-correlation-id": "trace-abc" },
      ),
    );

    // One request, three processes, one id to group their log lines by.
    expect(service.calls[0]!.correlationId).toBe("trace-abc");
    expect(response.headers["x-correlation-id"]).toBe("trace-abc");
  });

  describe("failures stay distinct", () => {
    const cases: [number, string][] = [
      [404, "unknown_handle"],
      [422, "invalid_prompt"],
      [422, "image_unreadable"],
      [503, "model_unavailable"],
      [500, "prediction_failed"],
    ];

    for (const [status, code] of cases) {
      it(`passes ${status} ${code} through rather than flattening it`, async () => {
        const service = fakeService(() =>
          jsonResponse(status, { status, code, message: "something specific" }),
        );

        const response = await appWith(service).handle(post("/inference/segment", { handle: "h" }));

        // Exit criterion 4 is not met by replacing None with one 500: an expired handle and a bad
        // prompt need different things from the caller.
        expect(response.status).toBe(status);
        expect(jsonBody(response).code).toBe(code);
      });
    }

    it("answers 503 when the service cannot be reached, not 500", async () => {
      const service = fakeService(() => {
        throw new Error("connect ECONNREFUSED");
      });

      const response = await appWith(service).handle(post("/inference/segment", { handle: "h" }));

      // The API is fine; the model is not answering. Annotation work continues, so this is an
      // outage of one feature rather than of the service.
      expect(response.status).toBe(503);
      expect(jsonBody(response).code).toBe("inference_unavailable");
    });

    it("refuses an empty mask presented as a success", async () => {
      const service = fakeService(() => jsonResponse(200, { score: 0.9 }));

      const response = await appWith(service).handle(post("/inference/segment", { handle: "h" }));

      // ASSESSMENT.md 5.4's pattern: a failure presented as a successful empty result. A response
      // with no mask is not a prediction, whatever status it carried.
      expect(response.status).toBe(502);
      expect(jsonBody(response).message).toMatch(/never an empty success/);
    });

    it("says so when the answer is not JSON at all", async () => {
      const service = fakeService(() => new Response("<html>502 Bad Gateway</html>", { status: 200 }));

      const response = await appWith(service).handle(post("/inference/segment", { handle: "h" }));
      expect(response.status).toBe(502);
    });
  });

  describe("without an inference service configured", () => {
    function appWithout(): App {
      return createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata });
    }

    it("answers 503 with a reason rather than pretending", async () => {
      const response = await appWithout().handle(post("/inference/segment", { handle: "h" }));

      expect(response.status).toBe(503);
      expect(jsonBody(response).message).toMatch(/no inference service is configured/);
    });

    it("stays healthy, because annotations are files and do not need a model", async () => {
      const response = await appWithout().handle(get("/health"));
      const body = jsonBody(response);

      // The failure-mode table: without inference, everything except SAM prompts and propagation
      // still works. Reporting the whole API as down would tell a user to stop working.
      expect(response.status).toBe(200);
      expect(body.ai.available).toBe(false);
      expect(body.degraded.some((reason: string) => reason.includes("AI tools"))).toBe(true);
    });
  });

  it("reports the AI state on health, with the reason attached", async () => {
    const service = fakeService(() => jsonResponse(200, HEALTHY_INFERENCE));
    const body = jsonBody(await appWith(service).handle(get("/health")));

    expect(body.ai).toEqual({
      available: true,
      reason: null,
      videoCapable: true,
      // The browser cannot find this out for itself: the model is on a server it cannot see.
      accelerator: "NVIDIA GeForce RTX 4090",
    });
    expect(body.degraded).toEqual([]);
  });

  it("says the device is unknown rather than guessing when the service does not report it", async () => {
    // "CPU" would be a wrong answer rather than a vague one, and a user told their server has no
    // GPU when it has one has been given a reason to stop waiting for something that works.
    const service = fakeService(() =>
      jsonResponse(200, {
        status: "ok",
        ai: { available: true, reason: null, videoCapable: true },
        models: { declared: 1, usable: 1, manifestError: null },
        reason: null,
      }),
    );

    const body = jsonBody(await appWith(service).handle(get("/health")));

    expect((body.ai as { accelerator: string }).accelerator).toBe("unknown");
  });

  it("relays why the AI tools are unavailable, so the browser is not left with a dead button", async () => {
    const service = fakeService(() =>
      jsonResponse(503, {
        status: "unavailable",
        ai: { available: false, videoCapable: false },
        reason: "PyTorch is not installed. Install the AI extra: pip install lazylabel-inference[ai]",
      }),
    );

    const body = jsonBody(await appWith(service).handle(get("/health")));

    // RULE-084's behaviour: a user who cannot use the AI tools is told why and what to install.
    expect(body.ai.available).toBe(false);
    expect(body.ai.reason).toMatch(/pip install/);
  });

  describe("request validation happens before anything is forwarded", () => {
    it("refuses an embedding request missing its fields", async () => {
      const service = fakeService(() => jsonResponse(200, {}));
      const app = appWith(service);

      for (const body of [{}, { image: "a.png" }, { model: "m" }, { image: 1, model: "m" }]) {
        expect((await app.handle(post("/inference/embeddings", body))).status).toBe(400);
      }
      // Nothing reached the service, so a malformed request costs no GPU time.
      expect(service.calls).toHaveLength(0);
    });

    it("refuses a malformed box", async () => {
      const service = fakeService(() => jsonResponse(200, {}));
      const response = await appWith(service).handle(
        post("/inference/segment", { handle: "h", box: [1, 2, 3] }),
      );

      expect(response.status).toBe(400);
      expect(service.calls).toHaveLength(0);
    });
  });

  /**
   * The shared contract, read from the same file the inference service reads.
   *
   * A cross-language contract cannot be held by a shared type, so it is held by a shared example.
   * The Python suite asserts its routes ACCEPT these bodies; this asserts the client PRODUCES them.
   * If either side drifts, one of the two fails.
   */
  describe("the shared contract", () => {
    const CONTRACT = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..", "..", "..", "contracts", "fixtures", "inference-contract.json",
    );

    interface Contract {
      requests: { name: string; path: string; method: string; body: Record<string, unknown> }[];
      errorCodes: string[];
    }

    it("sends exactly the bodies the inference service was tested against", async () => {
      const contract = JSON.parse(await readFile(CONTRACT, "utf-8")) as Contract;
      expect(contract.requests.length).toBeGreaterThanOrEqual(5);

      for (const example of contract.requests) {
        const service = fakeService(() =>
          example.path.endsWith("embeddings")
            ? jsonResponse(200, { handle: "h", cached: false })
            : jsonResponse(200, { mask: MASK, score: 1, chosen: 0, alternatives: [1] }),
        );

        const response = await appWith(service).handle(post(example.path, example.body));
        expect(response.status, example.name).toBe(200);

        // Byte for byte the same object, so the Python side's acceptance means something here.
        expect(service.calls[0]!.path, example.name).toBe(example.path);
        expect(service.calls[0]!.body, example.name).toEqual(example.body);
      }
    });

    it("maps every error code the contract names", async () => {
      const contract = JSON.parse(await readFile(CONTRACT, "utf-8")) as Contract;

      for (const code of contract.errorCodes) {
        if (code === "inference_unavailable") continue; // the API's own, not the service's
        const service = fakeService(() => jsonResponse(422, { code, message: "x" }));
        const response = await appWith(service).handle(post("/inference/segment", { handle: "h" }));

        // Passed through untouched: a code the API renames is a code the browser cannot branch on.
        expect(jsonBody(response).code, code).toBe(code);
      }
    });
  });
});
