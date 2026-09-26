/**
 * The API's routes, as a transport-free request handler.
 *
 * `handle` takes a plain request object and returns a plain response, so the acceptance tests
 * exercise the real routing, status codes and bodies without a socket, and `server.ts` is a thin
 * binding onto `node:http`. The point is that the contract can be tested where it is decided.
 *
 * What exists here is the Phase 2 pilot: the annotation read and write paths wired to the Phase 1
 * format library over the blob store port, settings, and health. Everything else is listed in
 * `capabilities.ts` with the phase that builds it, and the acceptance suite holds a place for each.
 */

import {
  applyCrop,
  createFinalMaskTensor,
  createInstanceContours,
  LOAD_PRIORITY,
} from "@lazylabel/annotation-formats";
import type { AnnotationFormat, ExportContext, Segment } from "@lazylabel/annotation-formats";

import {
  AnnotationLoadError,
  readAnnotations,
  writeAnnotations,
} from "./annotations/service.js";
import { listDataset, SIDECAR_COLUMNS } from "./dataset/listing.js";
import {
  decodeImage,
  decodeSourcePlane,
  readImageMetadata,
  renderPng,
  renderThumbnail,
  UnsupportedImageError,
  type DecodedImage,
} from "./images/pipeline.js";
import { claheFromQuery, regionHistogram } from "./images/histogram.js";
import {
  ImageTooLargeError,
  adjustmentsFromQuery,
  applyAdjustments,
  isEmpty,
  processingFromQuery,
  type Processing,
} from "./images/processing.js";
import { isNeutral, type Adjustments } from "@lazylabel/annotation-formats";
import { RenderCache } from "./images/renderCache.js";
import { PyramidCache, tileOf } from "./images/tiles.js";
import { RevisionConflictError, type BlobStore } from "./ports/blobStore.js";
import {
  InferenceError,
  InferenceUnreachableError,
  type InferenceClient,
} from "./ports/inference.js";
import type { MetadataStore } from "./ports/metadataStore.js";
import { silentLogger, type Logger } from "./http/log.js";
import { HttpError, badRequest, notFound, payloadTooLarge, unprocessable } from "./http/problem.js";
import { matchRoute } from "./http/router.js";
import { decodeMask, decoding, encodeLoadResponse, parseJsonObject, type WireMask } from "./http/wire.js";
import {
  defaultSettings,
  findConflicts,
  normalizeExportFormats,
  SETTINGS_SCHEMA_VERSION,
  shapeProblems,
  type StoredSettings,
} from "@lazylabel/settings-schema";

/** Largest request body the API will read. A save of 500 bounded masks stays far below this. */
export const MAX_BODY_BYTES = 64 * 1024 * 1024;

export interface ApiRequest {
  readonly method: string;
  /** Path only, no query string. Percent-escapes are decoded by the router, once. */
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

export interface ApiResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** Text for JSON routes, bytes for the image routes. */
  readonly body: string | Uint8Array;
}

export interface AppDeps {
  readonly blobStore: BlobStore;
  readonly metadataStore: MetadataStore;
  readonly logger?: Logger;
  /** Reports whether the dataset root is reachable. Drives the health endpoint. */
  readonly datasetHealthy?: () => Promise<boolean>;
  /**
   * Where the dataset is, so a failure can NAME it.
   *
   * `AI_NATIVE_SPEC.md`'s failure-mode table asks for "a blocking error naming the path, never an
   * empty file list", and the path never left the server: the browser said "the dataset folder
   * cannot be read" about a folder only the operator had configured and only the server knew.
   *
   * Reported on every health response rather than only on failure, because a deployment pointed at
   * the wrong folder looks healthy -- it lists somebody else's images perfectly well.
   */
  readonly datasetRoot?: string;
  /**
   * True when the metadata store lives only as long as the process (`LAZYLABEL_DB=:memory:`).
   *
   * Reported on /health so the browser can say it. Every settings save succeeds against such a
   * store and every one is gone when the API restarts, which is indistinguishable from "settings do
   * not save" to the person using the app -- and was exactly what its owner saw on 2026-09-26.
   */
  readonly databaseInMemory?: boolean;
  /**
   * The inference service, when one is configured.
   *
   * Absent is a supported deployment, not a broken one: the failure-mode table says everything
   * except SAM prompts and propagation still works without it, so the AI routes answer 503 with a
   * reason and nothing else changes.
   */
  readonly inference?: InferenceClient;
}

type Handler = (request: ApiRequest, params: Readonly<Record<string, string>>) => Promise<ApiResponse>;

export interface App {
  handle(request: ApiRequest): Promise<ApiResponse>;
}

export function createApp(deps: AppDeps): App {
  const logger = deps.logger ?? silentLogger;

  const routes: { method: string; pattern: string; handler: Handler }[] = [
    { method: "GET", pattern: "/health", handler: () => health(deps) },
    {
      method: "GET",
      pattern: "/projects/:projectId/images",
      handler: (request) => listImages(deps, request),
    },
    {
      method: "GET",
      pattern: "/projects/:projectId/images/*imagePath/metadata",
      handler: (_request, params) => imageMetadata(deps, params),
    },
    {
      method: "GET",
      pattern: "/projects/:projectId/images/*imagePath/pixels",
      handler: (request, params) => imagePixels(deps, request, params),
    },
    {
      method: "GET",
      pattern: "/projects/:projectId/images/*imagePath/thumbnail",
      handler: (request, params) => imageThumbnail(deps, request, params),
    },
    {
      method: "GET",
      pattern: "/projects/:projectId/images/*imagePath/histogram",
      handler: (request, params) => imageHistogram(deps, request, params),
    },
    {
      method: "GET",
      pattern: "/projects/:projectId/images/*imagePath/tiles/:z/:x/:y",
      handler: (request, params) => imageTile(deps, request, params),
    },
    {
      method: "GET",
      pattern: "/projects/:projectId/images/*imagePath/annotations",
      handler: (request, params) => getAnnotations(deps, request, params),
    },
    {
      method: "PUT",
      pattern: "/projects/:projectId/images/*imagePath/annotations",
      handler: (request, params) => putAnnotations(deps, request, params),
    },
    {
      method: "GET",
      pattern: "/inference/models",
      handler: () => proxyModels(deps),
    },
    {
      method: "POST",
      pattern: "/inference/embeddings",
      handler: (request) => proxyEmbed(deps, request),
    },
    {
      method: "POST",
      pattern: "/inference/segment",
      handler: (request) => proxySegment(deps, request),
    },
    {
      method: "POST",
      pattern: "/inference/propagations",
      handler: (request) => startPropagation(deps, request),
    },
    {
      method: "GET",
      pattern: "/inference/propagations",
      handler: (request) => propagationState(deps, request),
    },
    {
      method: "POST",
      pattern: "/inference/archetypes",
      handler: (request) => findArchetypes(deps, request),
    },
    {
      method: "DELETE",
      pattern: "/inference/propagations/:jobId",
      handler: (request, params) => cancelPropagation(deps, request, params),
    },
    { method: "GET", pattern: "/users/me/settings", handler: () => getSettings(deps) },
    { method: "PUT", pattern: "/users/me/settings", handler: (request) => putSettings(deps, request) },
  ];

  return {
    async handle(request: ApiRequest): Promise<ApiResponse> {
      // Every request carries a correlation id through to the inference service and into every log
      // line (AI_NATIVE_SPEC.md section 4). A client-supplied one is honoured so a trace survives
      // the hop; otherwise one is minted here.
      const correlationId = request.headers["x-correlation-id"] ?? newCorrelationId();
      const scoped = logger.child({ correlationId, method: request.method, path: request.path });

      try {
        if (request.body.length > MAX_BODY_BYTES) {
          throw payloadTooLarge(`the request body exceeds ${MAX_BODY_BYTES} bytes`);
        }

        let allowed: string[] = [];
        for (const route of routes) {
          const match = matchRoute(route.pattern, request.path);
          if (match === null) continue;
          if (route.method !== request.method) {
            allowed.push(route.method);
            continue;
          }
          const response = await route.handler(request, match.params);
          scoped.log("info", "request handled", { status: response.status });
          return withCorrelation(response, correlationId);
        }

        if (allowed.length > 0) {
          scoped.log("warn", "method not allowed", { allowed });
          return withCorrelation(
            problemResponse(new HttpError(405, "method_not_allowed", `use ${allowed.join(" or ")} here`), {
              Allow: allowed.join(", "),
            }),
            correlationId,
          );
        }

        scoped.log("warn", "no route");
        return withCorrelation(problemResponse(notFound(`no route for ${request.path}`)), correlationId);
      } catch (cause) {
        const error = toHttpError(cause);
        // 5xx is our fault and gets the stack; 4xx is the request's and does not.
        scoped.log(error.status >= 500 ? "error" : "warn", "request failed", {
          status: error.status,
          code: error.code,
          reason: error.message,
          ...(error.status >= 500 ? { cause } : {}),
        });
        return withCorrelation(problemResponse(error), correlationId);
      }
    },
  };
}

async function health(deps: AppDeps): Promise<ApiResponse> {
  const [dataset, database, ai] = await Promise.all([
    deps.datasetHealthy?.() ?? Promise.resolve(true),
    deps.metadataStore.healthy(),
    inferenceHealth(deps),
  ]);

  // The dataset folder is the source of truth, so losing it is fatal; losing the database costs
  // settings but not annotation work (AI_NATIVE_SPEC.md, failure modes). The status reflects that
  // difference rather than collapsing both into "unhealthy".
  const status = dataset ? 200 : 503;
  return json(status, {
    status: dataset ? (database ? "ok" : "degraded") : "unavailable",
    dataset: dataset ? "ok" : "unreadable",
    ...(deps.datasetRoot === undefined ? {} : { datasetRoot: deps.datasetRoot }),
    database: database ? "ok" : "unavailable",
    // Healthy, and forgetful: nothing saved outlives the process.
    databaseInMemory: deps.databaseInMemory === true,
    // The AI tools are a third independent axis. Losing them disables clicking objects with SAM
    // and nothing else, so it degrades rather than breaks -- RULE-084's behaviour, with the reason
    // attached so the browser shows "AI tools disabled, and here is why" instead of a dead button.
    ai,
    degraded: [
      ...(database ? [] : ["settings and hotkeys are unavailable; annotation work continues"]),
      ...(ai.available ? [] : [ai.reason ?? "AI tools are unavailable"]),
    ],
  });
}

/**
 * What the inference service could load.
 *
 * Passed through rather than filtered to the usable ones: an operator setting the app up needs to
 * see a checkpoint that is PRESENT and fails its hash, and a list of only-the-good-ones hides
 * exactly that. The browser decides what to offer; the API does not decide for it.
 */
async function proxyModels(deps: AppDeps): Promise<ApiResponse> {
  const models = await inferenceOf(deps).models();
  return json(200, { models });
}

async function inferenceHealth(deps: AppDeps): Promise<{
  available: boolean;
  reason: string | null;
  videoCapable: boolean;
  accelerator: string;
}> {
  if (deps.inference === undefined) {
    return {
      available: false,
      reason: "no inference service is configured, so the AI tools are unavailable",
      videoCapable: false,
      accelerator: "unknown",
    };
  }

  try {
    const health = await deps.inference.health();
    return {
      available: health.available,
      reason: health.reason,
      videoCapable: health.videoCapable,
      accelerator: health.accelerator,
    };
  } catch (cause) {
    // Unreachable is not a 500 for the whole API: annotations still load and save.
    return {
      available: false,
      reason: cause instanceof Error ? cause.message : String(cause),
      videoCapable: false,
      accelerator: "unknown",
    };
  }
}

function inferenceOf(deps: AppDeps): InferenceClient {
  if (deps.inference === undefined) {
    throw new HttpError(
      503,
      "inference_unavailable",
      "no inference service is configured, so the AI tools are unavailable",
    );
  }
  return deps.inference;
}

/**
 * Forward an embedding request.
 *
 * The browser never holds a model endpoint: the architecture makes the API the only thing that
 * talks to inference, which is also what keeps one correlation id across all three processes.
 */
async function proxyEmbed(deps: AppDeps, request: ApiRequest): Promise<ApiResponse> {
  const body = parseJsonObject(request.body);
  const image = body["image"];
  const model = body["model"];
  if (typeof image !== "string" || typeof model !== "string") {
    throw badRequest("an embedding request needs 'image' and 'model' strings");
  }

  const adjustments = body["adjustments"];
  if (adjustments !== undefined && (adjustments === null || typeof adjustments !== "object")) {
    throw badRequest("'adjustments' must be an object of numbers");
  }

  /*
   * The processing chain the user is looking at, in the pixels route's own query form. Legacy's
   * rescale, thresholds and FFT REPLACE the image its adjustments apply to, so its Operate On View
   * segments the processed view; until 2026-09-23 this rendered the adjustments over the
   * unprocessed image, and sent nothing at all when only processing was on.
   */
  const processingText = body["processing"];
  if (processingText !== undefined && typeof processingText !== "string") {
    throw badRequest("'processing' must be the pixels route's query string");
  }
  let processing: Processing | undefined;
  try {
    processing = processingText === undefined ? undefined : processingFromQuery(new URLSearchParams(processingText));
  } catch (cause) {
    throw badRequest(cause instanceof Error ? cause.message : String(cause));
  }
  if (isEmpty(processing)) processing = undefined;

  /*
   * RULE-089. A view present means the user asked the model to segment what they can SEE, so the
   * API renders it and posts the bytes; absent means the service reads the original file, which
   * is the rule's default and puts no image on this wire.
   *
   * A NEUTRAL VIEW SENDS NOTHING, and that is not an optimisation. An image adjusted and processed
   * by nothing IS the original, so rendering it would put a re-encoded PNG on the wire for a
   * picture identical to the file already beside the service.
   */
  const wanted = adjustmentsOf(adjustments as Record<string, number> | undefined);
  const pixels = wanted === null && processing === undefined
    ? undefined
    : await renderForModel(deps, image, processing, wanted);

  const correlationId = request.headers["x-correlation-id"] ?? "";
  return json(
    200,
    await inferenceOf(deps).embed(
      {
        image,
        model,
        ...(adjustments === undefined ? {} : { adjustments: adjustments as Record<string, number> }),
        // Forwarded because the service keys its encodings on the whole view: the same
        // adjustments over a different rescale are a different picture.
        ...(processing === undefined ? {} : { processing: processingText as string }),
        ...(pixels === undefined ? {} : { pixels }),
      },
      correlationId,
    ),
  );
}

async function proxySegment(deps: AppDeps, request: ApiRequest): Promise<ApiResponse> {
  const body = parseJsonObject(request.body);
  const handle = body["handle"];
  if (typeof handle !== "string") throw badRequest("a segment request needs a 'handle' string");

  const points = body["points"];
  if (points !== undefined && !Array.isArray(points)) throw badRequest("'points' must be an array");

  const box = body["box"];
  if (box !== undefined && box !== null) {
    if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === "number")) {
      throw badRequest("'box' must be four numbers, [x1, y1, x2, y2]");
    }
  }

  const correlationId = request.headers["x-correlation-id"] ?? "";
  return json(
    200,
    await inferenceOf(deps).segment(
      {
        handle,
        ...(points === undefined ? {} : { points: points as never }),
        ...(box === undefined || box === null ? {} : { box: box as [number, number, number, number] }),
      },
      correlationId,
    ),
  );
}

/**
 * C11: start a propagation, watch it, stop it.
 *
 * The API forwards rather than interprets. It checks the SHAPE -- so a body that cannot possibly
 * work is refused here rather than three minutes into a GPU job -- and leaves every judgement about
 * frames and models to the service, which is the only side that knows what it loaded.
 */
async function startPropagation(deps: AppDeps, request: ApiRequest): Promise<ApiResponse> {
  const body = parseJsonObject(request.body);

  const sequence = body["sequence"];
  if (!Array.isArray(sequence) || sequence.length === 0
    || !sequence.every((each) => typeof each === "string" && each !== "")) {
    throw badRequest("a propagation needs a non-empty 'sequence' of image keys");
  }

  const references = body["references"];
  if (!Array.isArray(references) || references.length === 0
    || !references.every((each) => Number.isInteger(each))) {
    // Legacy starts the job anyway and produces an empty mask for every frame in the sequence.
    throw badRequest("a propagation needs at least one reference frame to carry from");
  }

  const optional = (name: string): number | undefined => {
    const value = body[name];
    if (value === undefined || value === null) return undefined;
    if (!Number.isInteger(value)) throw badRequest(`'${name}' must be a whole frame number`);
    return value as number;
  };

  /*
   * The reference masks pass through SHAPE-CHECKED and otherwise untouched. What a mask means is
   * the format library's business and what it is worth is the model's; the API's job is to refuse
   * a body that cannot possibly work before a GPU is involved.
   */
  const objects = body["objects"];
  if (objects !== undefined) {
    if (!Array.isArray(objects)) throw badRequest("'objects' must be a list of reference masks");
    for (const each of objects) {
      const one = each as Record<string, unknown> | null;
      if (one === null || typeof one !== "object") {
        throw badRequest("each reference object must be an object");
      }
      if (!Number.isInteger(one["frame"])) {
        throw badRequest("each reference object needs a whole 'frame' position");
      }
      if (!Number.isInteger(one["objectId"])) {
        throw badRequest("each reference object needs a whole 'objectId'");
      }
      if (one["mask"] === undefined || one["mask"] === null) {
        throw badRequest("each reference object needs its 'mask'");
      }
    }
  }

  const started = await inferenceOf(deps).startPropagation(
    {
      sequence: sequence as readonly string[],
      references: references as readonly number[],
      ...(objects === undefined ? {} : { objects: objects as never }),
      ...(optional("start") === undefined ? {} : { start: optional("start")! }),
      ...(optional("end") === undefined ? {} : { end: optional("end")! }),
      ...(optional("window") === undefined ? {} : { window: optional("window")! }),
      ...(typeof body["streaming"] === "boolean" ? { streaming: body["streaming"] } : {}),
      ...(typeof body["model"] === "string" ? { model: body["model"] } : {}),
    },
    request.headers["x-correlation-id"] ?? "",
  );

  // 202 all the way through: the browser must not be told the work is done.
  return json(202, started);
}

async function propagationState(deps: AppDeps, request: ApiRequest): Promise<ApiResponse> {
  const correlationId = request.headers["x-correlation-id"] ?? "";
  const jobId = request.query.get("id");

  if (jobId === null) {
    return json(200, { jobs: await inferenceOf(deps).listPropagations(correlationId) });
  }

  const raw = request.query.get("cursor") ?? "0";
  const cursor = Number(raw);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw badRequest(`'cursor' must be a whole number, got ${JSON.stringify(raw)}`);
  }

  return json(200, await inferenceOf(deps).propagationState(jobId, cursor, correlationId));
}

async function cancelPropagation(
  deps: AppDeps,
  request: ApiRequest,
  params: Record<string, string>,
): Promise<ApiResponse> {
  return json(
    200,
    await inferenceOf(deps).cancelPropagation(
      params["jobId"] ?? "",
      request.headers["x-correlation-id"] ?? "",
    ),
  );
}

/**
 * C10: which frames of a sequence are worth annotating by hand.
 *
 * One request and one answer rather than a job, unlike propagation. It is a single pass that
 * embeds every frame once, so there is no per-frame result to stream -- and half the clusters is
 * not half the suggestions, it is a different set.
 */
async function findArchetypes(deps: AppDeps, request: ApiRequest): Promise<ApiResponse> {
  const body = parseJsonObject(request.body);

  const sequence = body["sequence"];
  if (!Array.isArray(sequence) || sequence.length === 0
    || !sequence.every((each) => typeof each === "string" && each !== "")) {
    throw badRequest("finding archetypes needs a non-empty 'sequence' of image keys");
  }

  const model = body["model"];
  if (model !== undefined && typeof model !== "string") {
    throw badRequest("'model' must be a model name");
  }

  return json(
    200,
    await inferenceOf(deps).findArchetypes(
      sequence as readonly string[],
      model,
      request.headers["x-correlation-id"] ?? "",
    ),
  );
}

/**
 * C1: open a folder of images and see which already carry annotations.
 *
 * The folder is a query parameter rather than a path segment because it is a LOCATION inside the
 * dataset, and an empty one - the dataset root - has no sensible path spelling.
 */
async function listImages(deps: AppDeps, request: ApiRequest): Promise<ApiResponse> {
  const folder = request.query.get("folder") ?? "";

  /*
   * `details=1` adds each image's size and modified time, at the cost of a stat PER IMAGE.
   *
   * Opt-in rather than always, because a folder of ten thousand frames would pay for it on every
   * listing to fill two columns most datasets never show. The client asks when a visible column or
   * a chosen sort needs them -- which is the only way it can be both correct and cheap, since only
   * the client knows what the user has switched on.
   */
  const details = request.query.get("details") === "1";

  const listing = await listDataset(deps.blobStore, folder, details);
  return json(200, {
    folder: listing.folder,
    folders: listing.folders,
    images: listing.images,
    annotatedCount: listing.annotatedCount,
    // Never silently dropped: a folder of .avif files should say so rather than look empty.
    unrecognized: listing.unrecognized,
    columns: SIDECAR_COLUMNS,
  });
}

/** Read an image's bytes, or fail with a status the client can act on. */
async function imageBytes(deps: AppDeps, key: string): Promise<Uint8Array> {
  const bytes = await deps.blobStore.read(key);
  if (bytes === null) throw notFound(`${key} is not in the dataset folder`);
  return bytes;
}

/**
 * An image's size and kind.
 *
 * The dataset browser needs the size before it can load annotations, because the text formats store
 * normalized coordinates, and the size comes from the header. The channel count needs the pixels
 * only when the header says colour: RULE-024 calls a colour file gray when its channels agree
 * (`readImageMetadata`).
 */
async function imageMetadata(
  deps: AppDeps,
  params: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const key = params["imagePath"]!;
  return json(200, await readImageMetadata(await imageBytes(deps, key)));
}

/**
 * The image as 8-bit RGB, encoded as PNG.
 *
 * Always re-encoded, even for a file the browser could decode itself. That is what one pipeline
 * means: the pixels on screen are the pixels the model is given, so a 16-bit image cannot look one
 * way to the user and arrive at SAM another (RULE-024).
 */
async function imagePixels(
  deps: AppDeps,
  request: ApiRequest,
  params: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const key = params["imagePath"]!;

  // RULE-032's chain runs HERE rather than in the browser, because it belongs before the 16-bit to
  // 8-bit conversion and the browser only ever receives what comes after it. A malformed parameter
  // is a 400 rather than an ignored one: an image that looks untouched for a reason nobody can see
  // is worse than an error.
  let processing;
  let adjustments;
  try {
    processing = processingFromQuery(request.query);
    // RULE-028, applied LAST and after the 16-bit conversion, which is where RULE-032 puts it.
    // The browser applies these for its own display; the API needs them so it can hand a model
    // exactly the pixels a user is looking at, which is RULE-089's Operate On View.
    adjustments = adjustmentsFromQuery(request.query);
  } catch (cause) {
    throw badRequest(cause instanceof Error ? cause.message : String(cause));
  }

  // The revision is part of the cache key, so a file edited under the app cannot answer from the
  // bytes it had before. `stat` is one filesystem call against a decode that can take seconds.
  const stat = await deps.blobStore.stat(key);
  const cacheKey = {
    imageKey: key,
    revision: stat?.revision ?? "absent",
    query: request.query.toString(),
  };

  const cache = cacheFor(deps);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return png(cached.bytes, { ...cached.headers, "x-image-cached": "hit" });

  const decoded = await decodeView(deps, key, processing);

  applyAdjustments(decoded.data, adjustments);

  const rendered = await renderPng(decoded);
  const headers = {
    "x-image-width": String(decoded.width),
    "x-image-height": String(decoded.height),
    "x-image-source-depth": String(decoded.sourceDepth),
    // So a client can tell which controls to offer without decoding the image itself: RULE-032
    // disables rescale for colour, and RULE-029 offers one Gray channel or three separate ones.
    "x-image-source-channels": String(decoded.sourceChannels),
  };
  cache.set(cacheKey, { bytes: rendered, headers });

  return png(rendered, { ...headers, "x-image-cached": "miss" });
}

/**
 * What legacy's Rescale histogram dialog is given: the level counts of the image, or of its crop,
 * at the image's own depth (`images/histogram.ts`). With `clahe=clip:tiles`, the counts of what
 * CLAHE makes of that region, which the dialog previews.
 *
 * GRAYSCALE ONLY. Legacy's Hist button is disabled for a colour image, and its handler refuses one
 * with this very notice (`main_window.py:2789-2792`).
 */
async function imageHistogram(
  deps: AppDeps,
  request: ApiRequest,
  params: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const key = params["imagePath"]!;
  let crop;
  let clahe;
  try {
    crop = processingFromQuery(request.query).crop ?? null;
    clahe = claheFromQuery(request.query);
  } catch (cause) {
    throw badRequest(cause instanceof Error ? cause.message : String(cause));
  }

  const source = await decodeSourcePlane(await imageBytes(deps, key));
  if (source.sourceChannels !== 1) {
    throw new HttpError(409, "not_grayscale", "No grayscale image loaded for histogram");
  }
  return json(200, regionHistogram(source, crop, clahe));
}

/**
 * The cache belonging to one app.
 *
 * Per app rather than per module, so two apps in one process -- which is every test file -- cannot
 * answer each other's requests. Held in a WeakMap keyed on the deps so `createApp` does not have to
 * take a cache it has no opinion about, and so it disappears with the app.
 */
const caches = new WeakMap<AppDeps, RenderCache>();

function cacheFor(deps: AppDeps): RenderCache {
  const existing = caches.get(deps);
  if (existing !== undefined) return existing;
  const made = new RenderCache();
  caches.set(deps, made);
  return made;
}

/**
 * One tile of the image at one level of the pyramid -- the spec's `/tiles/{z}/{x}/{y}`, C8.
 *
 * The same pixels as `/pixels`, through the same processing chain, a piece at a time: tile (x, y)
 * of level 0 IS that region of `/pixels`, and each level above is the one below averaged in 2x2
 * blocks (`images/tiles.ts`). Display adjustments are not taken, because the browser applies them
 * to what it draws; `/pixels` takes them only to render the picture a MODEL is given.
 */
async function imageTile(
  deps: AppDeps,
  request: ApiRequest,
  params: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const key = params["imagePath"]!;
  const [z, x, y] = (["z", "x", "y"] as const).map((name) => {
    const text = params[name]!;
    // Digits only. `Number` also accepts "1e3", " 1" and "0x1", and a tile named three ways is a
    // tile cached three times.
    if (!/^\d{1,6}$/.test(text)) throw badRequest(`tile ${name} must be a whole number, got "${text}"`);
    return Number(text);
  }) as [number, number, number];

  let processing;
  try {
    processing = processingFromQuery(request.query);
  } catch (cause) {
    throw badRequest(cause instanceof Error ? cause.message : String(cause));
  }

  // By revision, as the pixels cache is, so a file edited under the app cannot answer from the
  // pyramid of the bytes it had before.
  const stat = await deps.blobStore.stat(key);
  const view = [key, stat?.revision ?? "absent", request.query.toString()].join("\n");
  const levels = await pyramidsFor(deps).get(view, () => decodeView(deps, key, processing));

  const level = levels[z];
  const tile = level === undefined ? null : tileOf(level, x, y);
  if (tile === null) {
    throw notFound(
      `tile ${z}/${x}/${y} is outside ${key}: it has ${levels.length} level${levels.length === 1 ? "" : "s"}`,
    );
  }

  const bytes = await renderPng(tile);
  return png(bytes, {
    "x-image-width": String(levels[0]!.width),
    "x-image-height": String(levels[0]!.height),
    "x-tile-levels": String(levels.length),
  });
}

/** The tile pyramids belonging to one app, for the reason `cacheFor` gives. */
const pyramids = new WeakMap<AppDeps, PyramidCache>();

function pyramidsFor(deps: AppDeps): PyramidCache {
  const existing = pyramids.get(deps);
  if (existing !== undefined) return existing;
  const made = new PyramidCache();
  pyramids.set(deps, made);
  return made;
}

async function imageThumbnail(
  deps: AppDeps,
  request: ApiRequest,
  params: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const key = params["imagePath"]!;
  const requested = Number(request.query.get("size") ?? 160);
  if (!Number.isInteger(requested) || requested < 16 || requested > 1024) {
    throw badRequest("size must be an integer between 16 and 1024");
  }
  return png(await renderThumbnail(await imageBytes(deps, key), requested));
}

async function getAnnotations(
  deps: AppDeps,
  request: ApiRequest,
  params: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const imageKey = params["imagePath"]!;
  const imageSize = imageSizeFromQuery(request.query);

  let read;
  try {
    read = await readAnnotations(deps.blobStore, imageKey, imageSize);
  } catch (cause) {
    if (cause instanceof AnnotationLoadError) {
      // 409, never 200-with-nothing. Decision 15d: a damaged sidecar is reported with the formats
      // still present so the client can offer one, and nothing is deleted on this path.
      throw new HttpError(409, "annotations_unreadable", cause.message, {
        failures: cause.failures.map((failure) => ({ format: failure.format, reason: failure.reason })),
      });
    }
    throw cause;
  }

  // 204, not an empty 200. "This image has no annotation file" and "this image's annotation file is
  // empty" are different facts, and a client that cannot tell them apart cannot warn about either.
  if (read === null) return { status: 204, headers: {}, body: "" };

  return json(200, encodeLoadResponse(read.outcome, read.key, read.revision));
}

async function putAnnotations(
  deps: AppDeps,
  request: ApiRequest,
  params: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const imageKey = params["imagePath"]!;
  const body = parseJsonObject(request.body);

  const imageSize = imageSizeFromBody(body);
  const formats = formatsFromBody(body);
  const segments = segmentsFromBody(body);
  const classAliases = aliasesFromBody(body);

  // classOrder is derived, not taken from the client: it is the sorted unique class ids present,
  // and letting a request name a different order would change which channel each class occupies in
  // the exported files. That is a content rule, so the client does not get a vote.
  const classOrder = [
    ...new Set(segments.map((segment) => segment.classId).filter((id): id is number => id !== null)),
  ].sort((a, b) => a - b);

  const pixelPriority = pixelPriorityFromBody(body);
  let maskTensor = createFinalMaskTensor(segments, imageSize, classOrder, pixelPriority);

  const cropCoords = cropFromBody(body);
  if (cropCoords !== null) maskTensor = applyCrop(maskTensor, cropCoords);

  const context: ExportContext = {
    imagePath: imageKey,
    imageSize,
    classOrder,
    classLabels: classOrder.map((id) => classAliases.get(id) ?? String(id)),
    classAliases,
    maskTensor,
    cropCoords,
    instances: createInstanceContours(segments, imageSize, classOrder, maskTensor),
  };

  try {
    const result = await writeAnnotations(deps.blobStore, imageKey, {
      formats,
      context,
      ...(expectedRevisionsFromBody(body) ?? {}),
    });

    return json(200, {
      written: Object.fromEntries(result.written),
      // Reported, never deleted (decision 15f). The client offers removal; the user decides.
      stale: result.stale,
      skippedEmpty: result.skippedEmpty,
      ...(result.skippedEmpty.length > 0
        ? {
            note:
              "a selected format could not be rendered at all, so no file was written for it. " +
              "An image with no segments is not this case: it writes an empty file.",
          }
        : {}),
    });
  } catch (cause) {
    if (cause instanceof RevisionConflictError) {
      throw new HttpError(409, "revision_conflict", cause.message, { key: cause.key });
    }
    throw cause;
  }
}

/**
 * The stored settings as this build reads them: every setting and hotkey it knows, the user's own
 * value wherever one is stored.
 *
 * A document is written whole and kept as written, so one saved before a setting or an action
 * existed never gains it: a hotkey added since had no key at all for that user, and a setting read
 * without a fallback came through as nothing. Legacy fills both in on load -- `cls(**data)` gives
 * every field missing from settings.json its default (`config/settings.py:96`), and the default
 * bindings are made first and the saved ones laid over them (`config/hotkeys.py:28-29, 260-275`).
 *
 * Keys this build does not know stay as stored (RULE-088).
 */
function withDefaults(stored: StoredSettings | null): StoredSettings {
  const defaults = defaultSettings();
  if (stored === null) return defaults;
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    values: { ...defaults.values, ...stored.values },
    hotkeys: { ...defaults.hotkeys, ...stored.hotkeys },
  };
}

async function getSettings(deps: AppDeps): Promise<ApiResponse> {
  return json(200, withDefaults(await deps.metadataStore.getSettings("me")));
}

/** One conflict, whichever of its two actions a report happens to list first. */
function conflictId(conflict: { readonly key: string; readonly action: string; readonly heldBy: string }): string {
  return `${conflict.key}|${[conflict.action, conflict.heldBy].sort().join("|")}`;
}

async function putSettings(deps: AppDeps, request: ApiRequest): Promise<ApiResponse> {
  const body = parseJsonObject(request.body);
  const values = body["values"];
  const hotkeys = body["hotkeys"];

  if (values === undefined || values === null || typeof values !== "object" || Array.isArray(values)) {
    throw badRequest("settings must carry a `values` object");
  }
  if (hotkeys === undefined || hotkeys === null || typeof hotkeys !== "object" || Array.isArray(hotkeys)) {
    throw badRequest("settings must carry a `hotkeys` object");
  }

  // SEC-16. Legacy validated neither file, and one malformed hotkey crashed it on every launch; the
  // browser reads these back on every launch too, so what it could not act on is refused here. A
  // `null` binding used to reach `findConflicts` below and answer 500.
  const problems = shapeProblems(values, hotkeys);
  if (problems.length > 0) {
    throw unprocessable("some settings have the wrong shape; nothing was saved", { problems });
  }

  const bindings = hotkeys as StoredSettings["hotkeys"];

  // RULE-049. The browser refuses a conflicting key in the rebinding dialog, using the same
  // function from the same package; this refuses it again on arrival, because a client is not a
  // permission and a hand-written request is a client.
  //
  // Only a conflict the request ADDS. One already stored came from importing a hand-edited legacy
  // `hotkeys.json`, which RULE-049's edge case keeps rather than locking the user out of their
  // configuration. Refusing it here refused every later save -- the theme, a slider, the export
  // formats -- since each sends the whole settings, until the user found the pair on their own.
  //
  // Read with the defaults filled in, as GET serves it: a default binding added since the document
  // was stored can collide with one of the user's, and the browser sends back what GET gave it.
  const previous = withDefaults(await deps.metadataStore.getSettings("me"));
  const stored = new Set(findConflicts(previous.hotkeys).map(conflictId));
  const conflicts = findConflicts(bindings).filter((conflict) => !stored.has(conflictId(conflict)));
  if (conflicts.length > 0) {
    throw unprocessable("a key is bound to more than one action", { conflicts });
  }

  // RULE-088's export-format clauses. An empty or unrecognized list would make a save write no
  // files while reporting success, so it is corrected here rather than stored as given.
  const corrected = { ...(values as Record<string, unknown>) };
  const exportFormats = normalizeExportFormats(corrected["export_formats"]);
  corrected["export_formats"] = exportFormats.formats;

  // Every OTHER unknown key is stored exactly as it arrived. RULE-088's fix is not a validation
  // step to be added later; it is the absence of one here.
  const next: StoredSettings = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    values: corrected,
    hotkeys: bindings,
  };
  await deps.metadataStore.putSettings("me", next);

  return json(200, {
    ...next,
    // Say what was corrected rather than returning the request's own body and letting the client
    // believe it stored what it sent.
    ...(exportFormats.warnings.length > 0 ? { corrections: exportFormats.warnings } : {}),
  });
}

/**
 * The image's pixel size.
 *
 * PROVISIONAL: the text formats store normalized coordinates, so a reader cannot turn them back
 * into pixels without knowing the image size, and the API cannot know it until the image pipeline
 * (C8, Phase 5) can decode the file. Until then the client states it. The seam is deliberately
 * visible rather than hidden behind a half-built decoder that would be wrong for 16-bit TIFF.
 */
function imageSizeFromQuery(query: URLSearchParams): [number, number] {
  const height = Number(query.get("height"));
  const width = Number(query.get("width"));
  if (!isPositiveInteger(height) || !isPositiveInteger(width)) {
    throw badRequest(
      "height and width query parameters are required until the image pipeline can decode the image itself",
    );
  }
  return [height, width];
}

function imageSizeFromBody(body: Record<string, unknown>): [number, number] {
  const size = body["imageSize"];
  if (!Array.isArray(size) || size.length !== 2) {
    throw badRequest("imageSize must be [height, width]");
  }
  const [height, width] = size as unknown[];
  if (!isPositiveInteger(height) || !isPositiveInteger(width)) {
    throw unprocessable("imageSize must be two positive integers, [height, width]");
  }
  return [height, width];
}

function formatsFromBody(body: Record<string, unknown>): AnnotationFormat[] {
  const formats = body["formats"];
  if (!Array.isArray(formats) || formats.length === 0) {
    throw badRequest("formats must be a non-empty array naming which files to write");
  }
  const known = new Set<string>(LOAD_PRIORITY);
  for (const format of formats) {
    if (typeof format !== "string" || !known.has(format)) {
      throw unprocessable(`${JSON.stringify(format)} is not one of the seven annotation formats`);
    }
  }
  return formats as AnnotationFormat[];
}

function segmentsFromBody(body: Record<string, unknown>): Segment[] {
  const segments = body["segments"];
  if (!Array.isArray(segments)) throw badRequest("segments must be an array");

  return segments.map((raw, index) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw unprocessable(`segment ${index} is not an object`);
    }
    const record = raw as Record<string, unknown>;
    const type = record["type"];
    if (type !== "AI" && type !== "Loaded" && type !== "Polygon" && type !== "Circle") {
      throw unprocessable(`segment ${index} has an unknown type ${JSON.stringify(type)}`);
    }

    const classId = record["classId"];
    if (classId !== null && !Number.isInteger(classId)) {
      throw unprocessable(`segment ${index} has a non-integer class id`);
    }

    const segment: {
      type: Segment["type"];
      classId: number | null;
      mask?: ReturnType<typeof decodeMask>;
      vertices?: readonly (readonly [number, number])[];
    } = { type, classId: classId as number | null };

    if (record["mask"] !== undefined && record["mask"] !== null) {
      segment.mask = decoding(() => decodeMask(record["mask"] as WireMask));
    }
    if (Array.isArray(record["vertices"])) {
      segment.vertices = record["vertices"] as readonly (readonly [number, number])[];
    }
    return segment as Segment;
  });
}

function aliasesFromBody(body: Record<string, unknown>): Map<number, string> {
  const aliases = new Map<number, string>();
  const raw = body["classAliases"];
  if (raw === undefined || raw === null) return aliases;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw badRequest("classAliases must be an object keyed by class id");
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    if (!Number.isInteger(id)) throw unprocessable(`${JSON.stringify(key)} is not a class id`);
    if (typeof value !== "string") throw unprocessable(`the alias for class ${id} is not a string`);
    aliases.set(id, value);
  }
  return aliases;
}

function cropFromBody(body: Record<string, unknown>): [number, number, number, number] | null {
  const crop = body["cropCoords"];
  if (crop === undefined || crop === null) return null;
  if (!Array.isArray(crop) || crop.length !== 4 || !crop.every((n) => Number.isInteger(n))) {
    throw unprocessable("cropCoords must be four integers, [x1, y1, x2, y2]");
  }
  return crop as [number, number, number, number];
}

function pixelPriorityFromBody(body: Record<string, unknown>): { enabled: boolean; ascending: boolean } {
  const raw = body["pixelPriority"];
  if (raw === undefined || raw === null) return { enabled: false, ascending: true };
  if (typeof raw !== "object" || Array.isArray(raw)) throw badRequest("pixelPriority must be an object");
  const record = raw as Record<string, unknown>;
  return {
    enabled: record["enabled"] === true,
    ascending: record["ascending"] !== false,
  };
}

function expectedRevisionsFromBody(
  body: Record<string, unknown>,
): { expectedRevisions: Map<AnnotationFormat, string | null> } | null {
  const raw = body["expectedRevisions"];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw badRequest("expectedRevisions must be an object keyed by format");
  }

  const known = new Set<string>(LOAD_PRIORITY);
  const revisions = new Map<AnnotationFormat, string | null>();
  for (const [format, revision] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(format)) throw unprocessable(`${JSON.stringify(format)} is not an annotation format`);
    if (revision !== null && typeof revision !== "string") {
      throw unprocessable(`the expected revision for ${format} is neither a string nor null`);
    }
    revisions.set(format as AnnotationFormat, revision);
  }
  return { expectedRevisions: revisions };
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function png(bytes: Uint8Array, extra: Record<string, string> = {}): ApiResponse {
  return {
    status: 200,
    headers: {
      "content-type": "image/png",
      // Immutable for a minute: a canvas re-requests the same image constantly while panning, and
      // the decode is the expensive part. Short enough that replacing a file on disk is still seen.
      "cache-control": "private, max-age=60",
      ...extra,
    },
    body: bytes,
  };
}

function json(status: number, body: unknown): ApiResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function problemResponse(error: HttpError, extraHeaders: Record<string, string> = {}): ApiResponse {
  const response = json(error.status, error.toProblem());
  return { ...response, headers: { ...response.headers, ...extraHeaders } };
}

function withCorrelation(response: ApiResponse, correlationId: string): ApiResponse {
  return { ...response, headers: { ...response.headers, "x-correlation-id": correlationId } };
}

function toHttpError(cause: unknown): HttpError {
  if (cause instanceof HttpError) return cause;
  if (cause instanceof RevisionConflictError) {
    return new HttpError(409, "revision_conflict", cause.message, { key: cause.key });
  }
  if (cause instanceof AnnotationLoadError) {
    return new HttpError(409, "annotations_unreadable", cause.message);
  }
  // InvalidKeyError and anything else from the store is a bad request, not a server fault: the
  // client asked for a path this store will not serve.
  if (cause instanceof Error && cause.name === "InvalidKeyError") {
    return badRequest(cause.message);
  }
  // The service's own status is carried through rather than flattened: it distinguishes a bad
  // prompt from an expired handle from a model that will not load, and each needs something
  // different from the caller.
  if (cause instanceof InferenceError) {
    return new HttpError(cause.status, cause.code, cause.message, cause.detail);
  }
  if (cause instanceof InferenceUnreachableError) {
    // 503, not 500. The API is fine; the model is not answering, and annotation work continues.
    return new HttpError(503, "inference_unavailable", cause.message);
  }
  // A file that is not an image the pipeline can read is a bad request about that file, not a
  // broken server; the client shows it against the row rather than as an outage.
  if (cause instanceof UnsupportedImageError || (cause instanceof Error && cause.name === "BmpDecodeError")) {
    return new HttpError(422, "unsupported_image", cause.message);
  }
  return new HttpError(
    500,
    "internal",
    cause instanceof Error ? cause.message : String(cause),
  );
}

function newCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * The adjustments a request is really asking for, or null when they amount to nothing.
 *
 * Null for absent AND for neutral, because the two mean the same to a model: segment the file as
 * it is. Treating neutral as a request would re-encode every image for no visible change.
 */
function adjustmentsOf(raw: Record<string, number> | undefined): Adjustments | null {
  if (raw === undefined) return null;
  const wanted: Adjustments = {
    brightness: Number(raw["brightness"] ?? 0),
    contrast: Number(raw["contrast"] ?? 0),
    gamma: Number(raw["gamma"] ?? 1),
    saturation: Number(raw["saturation"] ?? 1),
  };
  return isNeutral(wanted) ? null : wanted;
}

/**
 * An image through RULE-032's processing chain, the one path both the pixels route and the model's
 * picture take -- so what a model is given is what the user is shown, down to the byte.
 */
async function decodeView(
  deps: AppDeps,
  key: string,
  processing: Processing | undefined,
): Promise<DecodedImage> {
  try {
    return await decodeImage(await imageBytes(deps, key), processing);
  } catch (cause) {
    if (cause instanceof ImageTooLargeError) {
      // 413, not a 500 and not a long wait: the filter refuses rather than holding the request
      // open for a minute, and the message says how big the image is and what the limit is.
      throw new HttpError(413, "image_too_large", cause.message);
    }
    throw cause;
  }
}

/** The image as the user sees it -- processed, then adjusted -- base64 PNG, for a model to encode. */
async function renderForModel(
  deps: AppDeps,
  key: string,
  processing: Processing | undefined,
  adjustments: Adjustments | null,
): Promise<string> {
  const decoded = await decodeView(deps, key, processing);
  if (adjustments !== null) applyAdjustments(decoded.data, adjustments);
  return Buffer.from(await renderPng(decoded)).toString("base64");
}
