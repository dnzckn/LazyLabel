/**
 * The typed client for the API.
 *
 * Every response shape comes from `@lazylabel/contracts`, shared with the server, so the two cannot
 * drift. What this adds is the part a browser needs: turning a status code into a value the UI can
 * branch on, rather than an exception for every non-200.
 *
 * The three annotation outcomes are DIFFERENT VALUES, not one nullable result:
 *
 *   loaded    the annotations, plus any failures the chain walked past
 *   none      the image has no annotation file at all (204)
 *   failed    files exist and none could be read (409)
 *
 * Collapsing "none" and "failed" into null is precisely the bug decision 15d exists to prevent: it
 * is what lets a damaged sidecar show as an empty canvas, which with auto-save then overwrites the
 * user's healthy files. The type makes that collapse impossible to write by accident.
 */

import type {
  WireDatasetListing,
  WireFailure,
  WireImageMetadata,
  WireLoadResponse,
  WireMask,
  WireProblem,
  WireSaveRequest,
  WireSaveResponse,
} from "@lazylabel/contracts";
import type { StoredSettings } from "@lazylabel/settings-schema";

export type AnnotationsResult =
  | { readonly kind: "loaded"; readonly annotations: WireLoadResponse }
  | { readonly kind: "none" }
  | { readonly kind: "failed"; readonly failures: readonly WireFailure[]; readonly message: string };

/** A response the client could not interpret as either success or a known failure. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * What `/health` reports.
 *
 * The AI block is three independent facts, kept apart rather than collapsed: whether the model can
 * run, WHY not when it cannot, and what it runs on. A deployment with SAM 1 only is a working
 * install with no propagation, so `videoCapable` is not implied by `available`.
 */
export interface ApiHealth {
  readonly status: string;
  readonly dataset: string;
  readonly database: string;
  readonly degraded: string[];
  readonly ai: {
    readonly available: boolean;
    readonly reason: string | null;
    readonly videoCapable: boolean;
    /** A GPU's name, "CPU", or "unknown". The server's device, which the browser cannot see. */
    readonly accelerator: string;
  };
}

export interface WireEmbedRequest {
  readonly image: string;
  /** A manifest model NAME, never a file path -- the service will not load anything unlisted. */
  readonly model: string;
  readonly adjustments?: Readonly<Record<string, number>>;
}

export interface WireEmbedResponse {
  readonly handle: string;
  /** False for a cold encode, which takes seconds; true when the service already had it. */
  readonly cached: boolean;
}

export interface WireModelStatus {
  readonly name: string;
  readonly family: string;
  readonly size: string;
  readonly videoCapable: boolean;
  /** The file is in the model directory. */
  readonly present: boolean;
  /** Its SHA-256 matches the manifest. Present and unverified is the case worth showing. */
  readonly verified: boolean;
  readonly detail: string | null;
}

export interface WireSegmentRequest {
  readonly handle: string;
  readonly points?: readonly { readonly x: number; readonly y: number; readonly positive: boolean }[];
  readonly box?: readonly [number, number, number, number];
}

export interface WireSegmentResponse {
  readonly mask: WireMask;
  readonly score: number;
  /** Which candidate won, and every candidate's score (RULE-020). */
  readonly chosen: number;
  readonly alternatives: readonly number[];
}

export interface WirePropagationReference {
  /** Position in `sequence`, never a file name (RULE-017). */
  readonly frame: number;
  readonly objectId: number;
  /** The user's OWN annotation, rasterized the way export rasterizes it. */
  readonly mask: WireMask;
}

export interface WirePropagationStart {
  readonly sequence: readonly string[];
  readonly references: readonly number[];
  /** The masks to carry. Separate from `references`: one frame can hold several objects. */
  readonly objects?: readonly WirePropagationReference[];
  readonly start?: number;
  readonly end?: number;
  readonly streaming?: boolean;
  /** RULE-026's `stream_window_size`. */
  readonly window?: number;
  readonly model?: string;
}

export interface WirePropagationFrame {
  readonly source: string;
  readonly objectId: number;
  readonly mask: { readonly height: number; readonly width: number; readonly box: readonly number[]; readonly data: string };
  /** RULE-016. What RULE-060 flags a frame on. */
  readonly confidence: number;
}

export interface WirePropagationJob {
  readonly id: string;
  readonly state: "running" | "completed" | "cancelled" | "failed";
  readonly completed: number;
  readonly total: number | null;
  readonly cursor: number;
  readonly cancelling: boolean;
  readonly error: string | null;
  readonly results: readonly WirePropagationFrame[];
}

export interface WireArchetypeResult {
  readonly suggested: readonly string[];
  /** How many the app aimed for. Compared against `suggested` to explain a short answer. */
  readonly budget: number;
  readonly clusters: number;
  readonly noise: number;
  /** Fewer frames were found than the budget asked for -- the sequence is too uniform. */
  readonly fellShort: boolean;
  readonly unreadable: readonly { readonly key: string; readonly reason: string }[];
}

export interface ApiClientOptions {
  /** Where the API lives. Defaults to "/api", which the dev server proxies and production serves. */
  readonly baseUrl?: string;
  /** Injectable for tests; defaults to the global fetch. */
  readonly fetch?: typeof globalThis.fetch;
  /** Called with the correlation id of every response, so the UI can quote it in an error report. */
  readonly onCorrelationId?: (id: string) => void;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly doFetch: typeof globalThis.fetch;
  private readonly onCorrelationId: ((id: string) => void) | undefined;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/+$/, "");
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.onCorrelationId = options.onCorrelationId;
  }

  async health(): Promise<ApiHealth> {
    const response = await this.send("GET", "/health");
    // 503 is a real answer here, not an error: it says the dataset folder is unreadable, which the
    // UI must show as a blocking message naming the path.
    if (response.status === 200 || response.status === 503) return (await response.json()) as never;
    throw await this.problem(response);
  }

  /** List a folder of images with what each one already carries. */
  /**
   * `details` adds each image's size and modified time, at the cost of a stat per image on the
   * server. Ask for it only when a visible column or the chosen sort needs it: only this side
   * knows what the user has switched on.
   */
  async listImages(
    projectId: string,
    folder = "",
    details = false,
  ): Promise<WireDatasetListing> {
    const parts = new URLSearchParams();
    if (folder !== "") parts.set("folder", folder);
    if (details) parts.set("details", "1");
    const query = [...parts.keys()].length === 0 ? "" : `?${parts.toString()}`;
    const response = await this.send(
      "GET",
      `/projects/${encodeURIComponent(projectId)}/images${query}`,
    );
    if (response.status === 200) return (await response.json()) as WireDatasetListing;
    throw await this.problem(response);
  }

  /** An image's size and kind, without fetching its pixels. */
  async imageMetadata(projectId: string, imagePath: string): Promise<WireImageMetadata> {
    const response = await this.send("GET", `${this.imagePath(projectId, imagePath)}/metadata`);
    if (response.status === 200) return (await response.json()) as WireImageMetadata;
    throw await this.problem(response);
  }

  /**
   * Where to point an <img> at the image's pixels.
   *
   * A URL rather than bytes: the browser's own image loading handles caching, progressive display
   * and memory better than anything done by hand here, and the API sends PNG.
   */
  /**
   * The URL for an image's pixels, optionally asking the server to process them first.
   *
   * `query` comes from `workspace/processing.ts` and is "" when there is nothing to ask for, so
   * an unprocessed image keeps the URL it has always had -- which is what lets the browser's own
   * cache serve it. RULE-032's chain runs on the server because it belongs before the 16-bit to
   * 8-bit conversion, and this is all the browser needs to say about it.
   */
  pixelsUrl(projectId: string, imagePath: string, query = ""): string {
    return `${this.baseUrl}${this.imagePath(projectId, imagePath)}/pixels${query}`;
  }

  thumbnailUrl(projectId: string, imagePath: string, size = 160): string {
    return `${this.baseUrl}${this.imagePath(projectId, imagePath)}/thumbnail?size=${size}`;
  }

  /**
   * Load an image's annotations.
   *
   * `imageSize` is provisional: the text formats store normalized coordinates, so the reader needs
   * the pixel dimensions, and the API cannot decode the image until the pipeline lands in Phase 5.
   */
  async loadAnnotations(
    projectId: string,
    imagePath: string,
    imageSize: readonly [number, number],
  ): Promise<AnnotationsResult> {
    const query = `?height=${imageSize[0]}&width=${imageSize[1]}`;
    const response = await this.send("GET", this.annotationsPath(projectId, imagePath) + query);

    if (response.status === 204) return { kind: "none" };
    if (response.status === 200) {
      return { kind: "loaded", annotations: (await response.json()) as WireLoadResponse };
    }
    if (response.status === 409) {
      const problem = (await response.json()) as WireProblem;
      const detail = problem.detail as { failures?: readonly WireFailure[] } | undefined;
      return { kind: "failed", failures: detail?.failures ?? [], message: problem.message };
    }
    throw await this.problem(response);
  }

  async saveAnnotations(
    projectId: string,
    imagePath: string,
    request: WireSaveRequest,
  ): Promise<WireSaveResponse> {
    const response = await this.send("PUT", this.annotationsPath(projectId, imagePath), request);
    if (response.status === 200) return (await response.json()) as WireSaveResponse;
    throw await this.problem(response);
  }

  /**
   * Encode an image so prompts against it are fast, returning a handle.
   *
   * The expensive half: seconds for a cold encode, immediate when the service already has it.
   * `cached` says which, so the UI can show progress for the first and nothing for the rest --
   * a spinner that flashes on every click is worse than no spinner.
   */
  async embed(request: WireEmbedRequest): Promise<WireEmbedResponse> {
    const response = await this.send("POST", "/inference/embeddings", request);
    if (response.status === 200) return (await response.json()) as WireEmbedResponse;
    throw await this.problem(response);
  }

  /**
   * What the inference service could load.
   *
   * Includes checkpoints that are missing or fail their hash, with the reason. A picker that only
   * listed the working ones would make a corrupt file indistinguishable from an absent one, which
   * is the difference between "re-download it" and "go and find it".
   */
  async models(): Promise<readonly WireModelStatus[]> {
    const response = await this.send("GET", "/inference/models");
    if (response.status === 200) {
      return ((await response.json()) as { models: readonly WireModelStatus[] }).models;
    }
    throw await this.problem(response);
  }

  /** One prompt against an encoded image. The handle comes from `embed`. */
  async segment(request: WireSegmentRequest): Promise<WireSegmentResponse> {
    const response = await this.send("POST", "/inference/segment", request);
    if (response.status === 200) return (await response.json()) as WireSegmentResponse;
    throw await this.problem(response);
  }

  /**
   * Start carrying masks through a sequence. Returns as soon as the job exists.
   *
   * 202, never 200: the work runs for minutes and the browser must not be told it is done. The
   * client returns the job so the caller can poll it, which is the only shape that lets Cancel
   * mean anything.
   */
  async startPropagation(request: WirePropagationStart): Promise<WirePropagationJob> {
    const response = await this.send("POST", "/inference/propagations", request);
    if (response.status === 202) return (await response.json()) as WirePropagationJob;
    throw await this.problem(response);
  }

  /** A job's state and the results produced since `cursor`. */
  async propagationState(jobId: string, cursor: number): Promise<WirePropagationJob> {
    const query = new URLSearchParams({ id: jobId, cursor: String(cursor) });
    const response = await this.send("GET", `/inference/propagations?${query.toString()}`);
    if (response.status === 200) return (await response.json()) as WirePropagationJob;
    throw await this.problem(response);
  }

  /** Stop a job, keeping the frames it has already finished (RULE-063). */
  async cancelPropagation(jobId: string): Promise<WirePropagationJob> {
    const response = await this.send(
      "DELETE",
      `/inference/propagations/${encodeURIComponent(jobId)}`,
    );
    if (response.status === 200) return (await response.json()) as WirePropagationJob;
    throw await this.problem(response);
  }

  /**
   * Which frames of a sequence are worth annotating by hand (C10).
   *
   * One request and one answer, unlike propagation: a single pass that embeds every frame once.
   * There is no per-frame result to stream, and a partial answer would not help if there were --
   * half the clusters is not half the suggestions, it is a different set.
   */
  async findArchetypes(
    sequence: readonly string[],
    model?: string,
  ): Promise<WireArchetypeResult> {
    const response = await this.send("POST", "/inference/archetypes", {
      sequence,
      ...(model === undefined ? {} : { model }),
    });
    if (response.status === 200) return (await response.json()) as WireArchetypeResult;
    throw await this.problem(response);
  }

  async getSettings(): Promise<StoredSettings> {
    const response = await this.send("GET", "/users/me/settings");
    if (response.status === 200) return (await response.json()) as StoredSettings;
    throw await this.problem(response);
  }

  async putSettings(settings: StoredSettings): Promise<StoredSettings & { corrections?: string[] }> {
    const response = await this.send("PUT", "/users/me/settings", settings);
    if (response.status === 200) return (await response.json()) as never;
    throw await this.problem(response);
  }

  /**
   * Build the annotations path.
   *
   * Each segment is escaped separately: `encodeURIComponent` on the whole path would escape the
   * separators too, and the route needs them to see a multi-segment image key.
   */
  private annotationsPath(projectId: string, imagePath: string): string {
    return `${this.imagePath(projectId, imagePath)}/annotations`;
  }

  private imagePath(projectId: string, imagePath: string): string {
    const encoded = imagePath.split("/").map(encodeURIComponent).join("/");
    return `/projects/${encodeURIComponent(projectId)}/images/${encoded}`;
  }

  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await this.doFetch(this.baseUrl + path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const correlationId = response.headers.get("x-correlation-id");
    if (correlationId !== null) this.onCorrelationId?.(correlationId);
    return response;
  }

  private async problem(response: Response): Promise<ApiError> {
    let problem: WireProblem | null = null;
    try {
      problem = (await response.json()) as WireProblem;
    } catch {
      // A response that is not JSON is usually a proxy or a gateway rather than the API.
    }
    return new ApiError(
      response.status,
      problem?.code ?? "unexpected",
      problem?.message ?? `the API answered ${response.status}`,
      problem?.detail,
    );
  }
}
