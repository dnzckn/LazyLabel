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

  async health(): Promise<{ status: string; dataset: string; database: string; degraded: string[] }> {
    const response = await this.send("GET", "/health");
    // 503 is a real answer here, not an error: it says the dataset folder is unreadable, which the
    // UI must show as a blocking message naming the path.
    if (response.status === 200 || response.status === 503) return (await response.json()) as never;
    throw await this.problem(response);
  }

  /** List a folder of images with what each one already carries. */
  async listImages(projectId: string, folder = ""): Promise<WireDatasetListing> {
    const query = folder === "" ? "" : `?folder=${encodeURIComponent(folder)}`;
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
  pixelsUrl(projectId: string, imagePath: string): string {
    return `${this.baseUrl}${this.imagePath(projectId, imagePath)}/pixels`;
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
