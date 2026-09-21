/**
 * The inference client, over the internal HTTP the architecture specifies.
 *
 * Thin by design. Everything it does beyond `fetch` is there because of something the spec asks
 * for or something the legacy code got wrong:
 *
 *   - the correlation id travels on every call, so one request's browser, API and inference log
 *     lines group together (`AI_NATIVE_SPEC.md` section 4);
 *   - "could not reach it" and "it refused" are DIFFERENT errors, because one is an outage and the
 *     other is about this request;
 *   - a response that is not JSON is a proxy or a gateway, not the service, and says so rather than
 *     surfacing a parse error from somewhere unrelated;
 *   - nothing is retried. A cold encode is seconds of GPU work, and retrying one that timed out
 *     doubles the load on a service that is already the bottleneck.
 */

import {
  InferenceError,
  InferenceUnreachableError,
  type EmbedRequest,
  type EmbedResult,
  type InferenceClient,
  type InferenceHealth,
  type ModelStatus,
  type PropagationJob,
  type PropagationStart,
  type SegmentRequest,
  type SegmentResult,
} from "../ports/inference.js";

export interface HttpInferenceOptions {
  /** Where the inference service listens, e.g. http://127.0.0.1:8788 */
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  /**
   * How long to wait. Generous, because a cold SAM encode is seconds: the spec's 150 ms budget is
   * for a WARM embedding, and a timeout tuned to that would cancel every first click.
   */
  readonly timeoutMs?: number;
}

export class HttpInferenceClient implements InferenceClient {
  private readonly baseUrl: string;
  private readonly doFetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpInferenceOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async health(): Promise<InferenceHealth> {
    const response = await this.send("GET", "/health", undefined, "health");
    const body = (await this.json(response)) as {
      status?: string;
      ai?: { available?: boolean; videoCapable?: boolean; accelerator?: string };
      reason?: string | null;
    };

    // 503 is a real answer here: the service is up and telling us why it cannot work. Treating it
    // as unreachable would turn "no checkpoint installed" into "the AI service is down".
    return {
      ready: body.status === "ok",
      available: body.ai?.available === true,
      reason: body.status === "ok" ? null : (body.reason ?? "the inference service is not ready"),
      videoCapable: body.ai?.videoCapable === true,
      // An older service that does not report it is "unknown", not a guess at "CPU".
      accelerator: body.ai?.accelerator ?? "unknown",
    };
  }

  async models(): Promise<readonly ModelStatus[]> {
    const response = await this.send("GET", "/models", undefined, "models");

    // Unlike `/health`, a non-200 here is a real failure. 503 means the MANIFEST is unreadable,
    // which is a different problem from "the manifest is fine and lists nothing usable" -- and
    // reading the error body as an absent `models` key would report the two identically, sending
    // an operator to look for missing files that are not the issue.
    if (response.status !== 200) throw await this.failure(response);

    const body = (await this.json(response)) as { models?: readonly ModelStatus[] };
    return body.models ?? [];
  }

  async embed(request: EmbedRequest, correlationId: string): Promise<EmbedResult> {
    const response = await this.send("POST", "/inference/embeddings", request, correlationId);
    if (response.status !== 200) throw await this.failure(response);

    const body = (await this.json(response)) as { handle?: unknown; cached?: unknown };
    if (typeof body.handle !== "string") {
      throw new InferenceError(502, "malformed_response", "the inference service returned no handle");
    }
    return { handle: body.handle, cached: body.cached === true };
  }

  async segment(request: SegmentRequest, correlationId: string): Promise<SegmentResult> {
    const response = await this.send("POST", "/inference/segment", request, correlationId);
    if (response.status !== 200) throw await this.failure(response);

    const body = (await this.json(response)) as Partial<SegmentResult>;
    if (body.mask === undefined || typeof body.score !== "number") {
      throw new InferenceError(
        502,
        "malformed_response",
        "the inference service returned no mask; a prediction is never an empty success",
      );
    }
    return {
      mask: body.mask,
      score: body.score,
      chosen: body.chosen ?? 0,
      alternatives: body.alternatives ?? [],
    };
  }

  async startPropagation(
    request: PropagationStart,
    correlationId: string,
  ): Promise<PropagationJob> {
    // 202, not 200: the service accepted the job and it is running. Treating only 200 as success
    // here would turn every successful start into an error.
    const response = await this.send("POST", "/inference/propagations", request, correlationId);
    if (response.status !== 202) throw await this.failure(response);
    return this.job(await this.json(response));
  }

  async propagationState(
    jobId: string,
    cursor: number,
    correlationId: string,
  ): Promise<PropagationJob> {
    const query = new URLSearchParams({ id: jobId, cursor: String(cursor) });
    const response = await this.send(
      "GET",
      `/inference/propagations?${query.toString()}`,
      undefined,
      correlationId,
    );
    if (response.status !== 200) throw await this.failure(response);
    return this.job(await this.json(response));
  }

  async listPropagations(correlationId: string): Promise<readonly PropagationJob[]> {
    const response = await this.send("GET", "/inference/propagations", undefined, correlationId);
    if (response.status !== 200) throw await this.failure(response);

    const body = (await this.json(response)) as { jobs?: unknown };
    if (!Array.isArray(body.jobs)) {
      throw new InferenceError(502, "malformed_response", "the service listed no jobs array");
    }
    return body.jobs.map((each) => this.job(each));
  }

  async cancelPropagation(jobId: string, correlationId: string): Promise<PropagationJob> {
    const response = await this.send(
      "DELETE",
      `/inference/propagations/${encodeURIComponent(jobId)}`,
      undefined,
      correlationId,
    );
    if (response.status !== 200) throw await this.failure(response);
    return this.job(await this.json(response));
  }

  /**
   * Read a job off the wire, refusing one that is missing what a caller has to branch on.
   *
   * `state` most of all: a job whose state did not arrive would be shown as running forever, which
   * is the shape of failure this service exists to stop -- a caller that cannot tell it has
   * stopped waiting for something that already finished.
   */
  private job(body: unknown): PropagationJob {
    const raw = (body ?? {}) as Record<string, unknown>;
    const state = raw["state"];
    if (typeof raw["id"] !== "string" || typeof state !== "string") {
      throw new InferenceError(502, "malformed_response", "the service returned no job");
    }
    if (!["running", "completed", "cancelled", "failed"].includes(state)) {
      throw new InferenceError(502, "malformed_response", `unknown job state ${JSON.stringify(state)}`);
    }
    return {
      id: raw["id"],
      state: state as PropagationJob["state"],
      completed: typeof raw["completed"] === "number" ? raw["completed"] : 0,
      total: typeof raw["total"] === "number" ? raw["total"] : null,
      cursor: typeof raw["cursor"] === "number" ? raw["cursor"] : 0,
      cancelling: raw["cancelling"] === true,
      error: typeof raw["error"] === "string" ? raw["error"] : null,
      results: Array.isArray(raw["results"]) ? (raw["results"] as PropagationJob["results"]) : [],
    };
  }

  private async send(
    method: string,
    path: string,
    body: unknown,
    correlationId: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.doFetch(this.baseUrl + path, {
        method,
        signal: controller.signal,
        headers: {
          "x-correlation-id": correlationId,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      // Down, refused, or too slow. All of them mean the same thing to a caller: the model is not
      // answering, which is an outage rather than a problem with this request.
      throw new InferenceUnreachableError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      clearTimeout(timer);
    }
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new InferenceError(
        502,
        "malformed_response",
        `the inference service answered ${response.status} with something that is not JSON`,
      );
    }
  }

  private async failure(response: Response): Promise<InferenceError> {
    let problem: { code?: string; message?: string; detail?: unknown } = {};
    try {
      problem = (await response.json()) as typeof problem;
    } catch {
      // Not JSON: a gateway or proxy rather than the service itself.
    }
    return new InferenceError(
      response.status,
      problem.code ?? "inference_failed",
      problem.message ?? `the inference service answered ${response.status}`,
      problem.detail,
    );
  }
}
