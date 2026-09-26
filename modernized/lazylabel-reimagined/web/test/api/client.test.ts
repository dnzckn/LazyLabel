/**
 * The typed API client.
 *
 * The test that matters most is the three-way split of a load: annotations, no file, and a file
 * that could not be read. Collapsing the last two into null is the bug decision 15d exists to
 * prevent, and the client's type is where that becomes impossible rather than merely discouraged.
 */

import { describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "../../src/api/client.js";

function stubFetch(
  responses: Record<string, { status: number; body?: unknown; headers?: Record<string, string> }>,
): { fetch: typeof globalThis.fetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(init === undefined ? { url } : { url, init });

    const match = Object.keys(responses).find((path) => url.startsWith(path));
    if (match === undefined) throw new Error(`no stub for ${url}`);
    const { status, body, headers } = responses[match]!;

    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  });

  return { fetch: fetchStub as unknown as typeof globalThis.fetch, calls };
}

const LOADED = {
  sourceFormat: "YOLO_SEGMENTATION",
  sourceFile: "frames/a_seg.txt",
  revision: "rev1",
  segments: [{ type: "Loaded", classId: 3 }],
  classAliases: { "3": "stop sign" },
  rejected: 0,
  failures: [],
};

describe("loading annotations", () => {
  it("returns the annotations on 200", async () => {
    const { fetch } = stubFetch({ "/api": { status: 200, body: LOADED } });
    const result = await new ApiClient({ fetch }).loadAnnotations("p1", "frames/a.png", [64, 80]);

    expect(result.kind).toBe("loaded");
    if (result.kind !== "loaded") throw new Error("unreachable");
    expect(result.annotations.sourceFormat).toBe("YOLO_SEGMENTATION");
    expect(result.annotations.classAliases).toEqual({ "3": "stop sign" });
  });

  it("distinguishes 'no annotation file' from 'could not be read'", async () => {
    const none = stubFetch({ "/api": { status: 204 } });
    expect((await new ApiClient({ fetch: none.fetch }).loadAnnotations("p1", "a.png", [1, 1])).kind).toBe(
      "none",
    );

    const failed = stubFetch({
      "/api": {
        status: 409,
        body: {
          status: 409,
          code: "annotations_unreadable",
          message: "no annotation file could be read",
          detail: { failures: [{ format: "NPZ", reason: "not a zip archive" }] },
        },
      },
    });
    const result = await new ApiClient({ fetch: failed.fetch }).loadAnnotations("p1", "a.png", [1, 1]);

    // Two different answers, and the type will not let a caller treat them as one.
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") throw new Error("unreachable");
    expect(result.failures).toEqual([{ format: "NPZ", reason: "not a zip archive" }]);
    expect(result.message).toMatch(/could be read/);
  });

  it("carries the failures a successful load walked past (decision 15c)", async () => {
    const { fetch } = stubFetch({
      "/api": {
        status: 200,
        body: { ...LOADED, failures: [{ format: "NPZ", reason: "not a zip archive" }] },
      },
    });
    const result = await new ApiClient({ fetch }).loadAnnotations("p1", "a.png", [1, 1]);

    if (result.kind !== "loaded") throw new Error("unreachable");
    // A recovery the user is not told about is the thing decision 15c forbids.
    expect(result.annotations.failures).toHaveLength(1);
  });

  it("escapes each path segment but keeps the separators", async () => {
    const { fetch, calls } = stubFetch({ "/api": { status: 204 } });
    await new ApiClient({ fetch }).loadAnnotations("p 1", "run 4/frame#12.png", [64, 80]);

    expect(calls[0]!.url).toBe(
      "/api/projects/p%201/images/run%204/frame%2312.png/annotations?height=64&width=80",
    );
  });

  it("throws for a status it does not know how to interpret", async () => {
    const { fetch } = stubFetch({
      "/api": { status: 500, body: { status: 500, code: "internal", message: "boom" } },
    });
    await expect(new ApiClient({ fetch }).loadAnnotations("p1", "a.png", [1, 1])).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe("the client envelope", () => {
  it("reports the correlation id so an error can be traced to a server log line", async () => {
    const seen: string[] = [];
    const { fetch } = stubFetch({
      "/api": { status: 204, headers: { "x-correlation-id": "trace-abc" } },
    });

    await new ApiClient({ fetch, onCorrelationId: (id) => seen.push(id) }).loadAnnotations(
      "p1",
      "a.png",
      [1, 1],
    );
    expect(seen).toEqual(["trace-abc"]);
  });

  it("treats 503 from health as an answer, not an error", async () => {
    const { fetch } = stubFetch({
      "/api": {
        status: 503,
        body: { status: "unavailable", dataset: "unreadable", database: "ok", degraded: [] },
      },
    });

    // The dataset folder being unreadable is something the UI must show, not something that makes
    // the health check itself fail.
    const health = await new ApiClient({ fetch }).health();
    expect(health.dataset).toBe("unreadable");
  });

  it("survives an error body that is not JSON, as a proxy would send", async () => {
    const fetchStub = vi.fn(async () => new Response("<html>502</html>", { status: 502 }));
    const client = new ApiClient({ fetch: fetchStub as unknown as typeof globalThis.fetch });

    const error = await client.getSettings().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).code).toBe("unexpected");
  });

  it("sends a save as JSON to the annotations path", async () => {
    const { fetch, calls } = stubFetch({
      "/api": { status: 200, body: { written: {}, stale: [], skippedEmpty: [] } },
    });

    await new ApiClient({ fetch }).saveAnnotations("p1", "a.png", {
      imageSize: [64, 80],
      formats: ["NPZ"],
      segments: [],
    });

    expect(calls[0]!.init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]!.init?.body)).formats).toEqual(["NPZ"]);
  });

  it("sends a deletion to the annotations path, with no body, and reads what went (RULE-083)", async () => {
    const { fetch, calls } = stubFetch({
      "/api": { status: 200, body: { deleted: ["run 4/a_coco.json", "run 4/a.npz"] } },
    });

    const result = await new ApiClient({ fetch }).deleteAnnotations("p1", "run 4/a.png");

    expect(calls[0]!.url).toBe("/api/projects/p1/images/run%204/a.png/annotations");
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(result.deleted).toEqual(["run 4/a_coco.json", "run 4/a.npz"]);
  });

  it("raises a refused deletion as the API's own problem", async () => {
    const { fetch } = stubFetch({
      "/api": { status: 404, body: { status: 404, code: "not_found", message: "a.png is not in the dataset folder" } },
    });

    const error = await new ApiClient({ fetch }).deleteAnnotations("p1", "a.png").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("a.png is not in the dataset folder");
  });

  it("strips a trailing slash from the base url rather than doubling it", async () => {
    const { fetch, calls } = stubFetch({ "http://api.test": { status: 204 } });
    await new ApiClient({ fetch, baseUrl: "http://api.test/" }).loadAnnotations("p", "a.png", [1, 1]);

    expect(calls[0]!.url).toBe("http://api.test/projects/p/images/a.png/annotations?height=1&width=1");
  });
});

describe("the inference calls", () => {
  it("asks for an encode by model NAME, never a path", () => {
    // The service refuses anything not in its manifest, so a path here would be a request it can
    // only reject -- and the manifest is what makes "a checkpoint that is not listed is not
    // loadable" true.
    const { fetch, calls } = stubFetch({
      "/api/inference/embeddings": { status: 200, body: { handle: "h1", cached: false } },
    });
    const client = new ApiClient({ baseUrl: "/api", fetch });

    void client.embed({ image: "frames/a.png", model: "SAM 2.1 large" });

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      image: "frames/a.png",
      model: "SAM 2.1 large",
    });
  });

  it("says whether the encode was already cached", async () => {
    // A cold encode is seconds and a cached one is immediate. A spinner that flashes on every
    // click is worse than no spinner, so the caller needs to know which it got.
    const { fetch } = stubFetch({
      "/api/inference/embeddings": { status: 200, body: { handle: "h1", cached: true } },
    });
    const client = new ApiClient({ baseUrl: "/api", fetch });

    expect((await client.embed({ image: "a.png", model: "m" })).cached).toBe(true);
  });

  it("sends a prompt against the handle", async () => {
    const { fetch, calls } = stubFetch({
      "/api/inference/segment": {
        status: 200,
        body: { mask: { height: 2, width: 2, box: null, data: "" }, score: 0.9, chosen: 1, alternatives: [0.1, 0.9, 0.5] },
      },
    });
    const client = new ApiClient({ baseUrl: "/api", fetch });

    const result = await client.segment({
      handle: "h1",
      points: [{ x: 5, y: 6, positive: true }],
    });

    expect(JSON.parse(String(calls[0]?.init?.body)).handle).toBe("h1");
    // RULE-020: every candidate's score travels back, so a client can show that the choice was
    // close rather than presenting one mask as the only answer.
    expect(result.alternatives).toEqual([0.1, 0.9, 0.5]);
    expect(result.chosen).toBe(1);
  });

  it("raises the service's reason rather than a bare failure", async () => {
    // "AI unavailable" tells a user to give up; the reason tells them what to do.
    const { fetch } = stubFetch({
      "/api/inference/segment": {
        status: 503,
        body: { code: "inference_unavailable", message: "PyTorch is not installed" },
      },
    });
    const client = new ApiClient({ baseUrl: "/api", fetch });

    await expect(client.segment({ handle: "h1" })).rejects.toThrow(/PyTorch is not installed/);
  });
});
