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
import { get, jsonBody, post, request } from "../helpers/request.js";
import sharp from "sharp";

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

  function appWith(service: ReturnType<typeof fakeService>, blobStore = new MemoryBlobStore()): App {
    return createApp({
      blobStore,
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
  describe("RULE-089: the model is given the view the user sees", () => {
    /*
     * Legacy's rescale, thresholds and FFT replace the image its brightness and contrast apply to,
     * so its Operate On View segments the PROCESSED view. Until 2026-09-23 this proxy rendered the
     * adjustments over the unprocessed image, and posted nothing when only processing was on -- a
     * mask of a picture the user was not looking at, under the setting that promises otherwise.
     */
    const FIXTURE = path.join(
      path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "images", "gradient8.png",
    );
    const KEY = "frames/gradient8.png";
    // A channel threshold: processing that changes a colour image (rescale is grayscale-only).
    const PROCESSING = "markers_r=128";

    async function setUp() {
      const store = new MemoryBlobStore();
      await store.writeAtomic(KEY, new Uint8Array(await readFile(FIXTURE)));
      const service = fakeService(() => jsonResponse(200, { handle: "h", cached: false }));
      return { app: appWith(service, store), service };
    }

    it("renders the processed, adjusted view: byte for byte what the pixels route shows", async () => {
      const { app, service } = await setUp();

      const embedded = await app.handle(post("/inference/embeddings", {
        image: KEY,
        model: "m",
        adjustments: { brightness: 40, contrast: 0, gamma: 1, saturation: 1 },
        processing: PROCESSING,
      }));
      const shown = await app.handle(request("GET", `/projects/p1/images/${KEY}/pixels`, {
        query: { markers_r: "128", adjust: "40,0,1,1" },
      }));

      expect(embedded.status).toBe(200);
      expect(shown.status).toBe(200);
      const sent = service.calls[0]!.body as { pixels: string; processing: string };
      // Forwarded too: the service keys its encodings on the whole view.
      expect(sent.processing).toBe(PROCESSING);
      expect([...Buffer.from(sent.pixels, "base64")]).toEqual([...(shown.body as Uint8Array)]);
    });

    it("renders processing alone, with no adjustments at all", async () => {
      const { app, service } = await setUp();

      await app.handle(post("/inference/embeddings", { image: KEY, model: "m", processing: PROCESSING }));
      const unprocessed = await app.handle(get(`/projects/p1/images/${KEY}/pixels`));

      const sent = service.calls[0]!.body as { pixels?: string };
      expect(sent.pixels).toBeTruthy();
      expect([...Buffer.from(sent.pixels!, "base64")]).not.toEqual([...(unprocessed.body as Uint8Array)]);
    });

    it("treats an empty processing chain as none, and posts no picture", async () => {
      const { app, service } = await setUp();

      await app.handle(post("/inference/embeddings", { image: KEY, model: "m", processing: "" }));

      expect(service.calls[0]!.body).toEqual({ image: KEY, model: "m" });
    });

    it("refuses a malformed processing chain before a model is involved", async () => {
      const { app, service } = await setUp();

      for (const processing of ["rescaleMin=50", 7]) {
        const response = await app.handle(post("/inference/embeddings", { image: KEY, model: "m", processing }));
        expect(response.status, String(processing)).toBe(400);
      }
      expect(service.calls).toHaveLength(0);
    });
  });

  describe("the shared contract", () => {
    const CONTRACT = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..", "..", "..", "contracts", "fixtures", "inference-contract.json",
    );

    interface Contract {
      requests: {
        name: string;
        path: string;
        method: string;
        body: Record<string, unknown>;
        /**
         * Fields the API ADDS before forwarding, listed rather than written out because their
         * value comes from the image on disk -- `pixels` is a base64 PNG the API renders.
         *
         * The fixture used to describe one body for both directions, which held only while the
         * API was a pure forwarder. RULE-089 makes it a pipeline for one case, and a fixture that
         * could not say so would have forced the feature to ship untested or not at all.
         */
        addedByApi?: string[];
        /**
         * What the API answers when the service accepts it. 200 unless the example says otherwise.
         *
         * Needed the moment a route stopped answering 200: C11's start returns 202, and a harness
         * that asserted 200 everywhere would have made the fixture entry fail for a reason having
         * nothing to do with whether the two sides agree about the BODY, which is all this is for.
         */
        status?: number;
      }[];
      errorCodes: string[];
    }

    /**
     * What the fake service answers, by route.
     *
     * Keyed on the path rather than a chain of `endsWith`, so adding a route is a line here. The
     * bodies only have to be well-formed enough for the client to accept them; what is under test
     * is the request the API SENDS.
     */
    const SERVICE_ANSWERS: Record<string, { status: number; body: unknown }> = {
      "/inference/embeddings": { status: 200, body: { handle: "h", cached: false } },
      "/inference/segment": {
        status: 200,
        body: { mask: MASK, score: 1, chosen: 0, alternatives: [1] },
      },
      "/inference/archetypes": {
        status: 200,
        body: {
          suggested: ["frames/frame_000.png"],
          budget: 1,
          clusters: 1,
          noise: 0,
          fellShort: false,
          unreadable: [],
        },
      },
      "/inference/propagations": {
        status: 202,
        body: {
          id: "job-1",
          state: "running",
          completed: 0,
          total: 3,
          cursor: 0,
          cancelling: false,
          error: null,
          results: [],
        },
      },
    };

    it("sends exactly the bodies the inference service was tested against", async () => {
      const contract = JSON.parse(await readFile(CONTRACT, "utf-8")) as Contract;
      expect(contract.requests.length).toBeGreaterThanOrEqual(5);

      for (const example of contract.requests) {
        const answer = SERVICE_ANSWERS[example.path];
        expect(answer, `${example.name}: no fake answer for ${example.path}`).toBeTruthy();
        const service = fakeService(() => jsonResponse(answer!.status, answer!.body));

        /*
         * A REAL IMAGE, because the API is no longer a pure forwarder for every case: under
         * RULE-089 it renders the adjusted picture and posts the bytes, so the file named in the
         * body has to exist. The other examples do not touch it.
         */
        const store = new MemoryBlobStore();
        const named = example.body["image"];
        if (typeof named === "string") {
          await store.writeAtomic(named, await sharp({
            create: { width: 4, height: 4, channels: 3, background: { r: 120, g: 130, b: 140 } },
          }).png().toBuffer());
        }

        const response = await appWith(service, store).handle(post(example.path, example.body));
        expect(response.status, example.name).toBe(example.status ?? 200);

        // Byte for byte the same object, so the Python side's acceptance means something here --
        // except for what the API is declared to ADD, which has no literal value to record.
        expect(service.calls[0]!.path, example.name).toBe(example.path);
        const sent = { ...(service.calls[0]!.body as Record<string, unknown>) };
        for (const field of example.addedByApi ?? []) {
          expect(sent[field], `${example.name}: ${field}`).toBeTruthy();
          delete sent[field];
        }
        expect(sent, example.name).toEqual(example.body);
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

  describe("listing the models the service could load", () => {
    it("passes them through, including one that is present and fails its hash", async () => {
      // Not filtered to the usable ones. An operator setting the app up most needs to see a
      // checkpoint that IS there and does not verify, and a list of only-the-good-ones hides exactly
      // that -- the file looks absent when it is corrupt.
      const service = fakeService(() =>
        jsonResponse(200, {
          models: [
            { name: "SAM 2.1 large", family: "sam2", size: "large", videoCapable: true, present: true, verified: true, detail: null },
            { name: "SAM 1 huge", family: "sam1", size: "vit_h", videoCapable: false, present: true, verified: false, detail: "sha256 does not match the manifest" },
            { name: "SAM 2.1 tiny", family: "sam2", size: "tiny", videoCapable: true, present: false, verified: false, detail: "not in the model directory" },
          ],
        }),
      );

      const body = jsonBody(await appWith(service).handle(get("/inference/models")));

      expect(body.models).toHaveLength(3);
      expect(body.models[1]).toMatchObject({ present: true, verified: false });
      expect(body.models[1].detail).toContain("does not match");
    });

    it("reports an unreadable manifest rather than an empty list", async () => {
      // Empty means "the manifest is fine and lists nothing usable". Unreadable means the operator
      // has a different problem, and collapsing them would send them looking for missing files.
      const service = fakeService(() =>
        jsonResponse(503, { code: "manifest_unreadable", message: "models.json is not valid JSON" }),
      );

      const response = await appWith(service).handle(get("/inference/models"));

      expect(response.status).toBe(503);
      expect(jsonBody(response).message).toContain("not valid JSON");
    });

    it("is 503 when no inference service is configured at all", async () => {
      const bare = createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata });

      expect((await bare.handle(get("/inference/models"))).status).toBe(503);
    });
  });

});
