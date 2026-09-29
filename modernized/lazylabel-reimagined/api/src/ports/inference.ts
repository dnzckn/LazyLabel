/**
 * Talking to the inference service.
 *
 * A port, so the API's routes can be tested without a Python process and a GPU, and so the browser
 * never holds a model endpoint: the architecture makes the API the only thing that talks to
 * inference, which is also what keeps a correlation id flowing through both.
 *
 * The interface speaks masks, scores and handles. It never speaks LazyLabel class ids or annotation
 * formats — that boundary is what stops annotation semantics leaking into the model layer.
 */

import type { WireMask } from "@lazylabel/contracts";

export interface InferencePoint {
  readonly x: number;
  readonly y: number;
  readonly positive: boolean;
}

export interface EmbedRequest {
  /** Dataset-relative image key. The inference service reads the same folder the API does. */
  readonly image: string;
  /** Manifest model name, not a file path. */
  readonly model: string;
  readonly adjustments?: Readonly<Record<string, number>>;
  /**
   * The rendered image to encode, base64 PNG — RULE-089's Operate On View.
   *
   * Absent means the service reads the original file itself, which is the rule's DEFAULT and the
   * cheaper path: no image crosses this wire. Present means the user asked the model to segment
   * what they can SEE, so the API has applied the display adjustments and these bytes are the
   * answer.
   *
   * The API renders them rather than the service, because the API owns the image pipeline. A
   * service that applied them itself would be a third implementation of arithmetic the browser
   * and the API already share.
   */
  readonly pixels?: string;
}

export interface EmbedResult {
  readonly handle: string;
  /** Whether the encode was already cached. A cold encode is seconds and is shown as progress. */
  readonly cached: boolean;
}

export interface SegmentRequest {
  readonly handle: string;
  readonly points?: readonly InferencePoint[];
  readonly box?: readonly [number, number, number, number];
}

export interface SegmentResult {
  readonly mask: WireMask;
  readonly score: number;
  /** Which of the candidates won, and every candidate's score (RULE-020). */
  readonly chosen: number;
  readonly alternatives: readonly number[];
}

export interface InferenceHealth {
  readonly ready: boolean;
  readonly available: boolean;
  /** Why the AI tools are unavailable, in words a user can act on. Null when they are available. */
  readonly reason: string | null;
  readonly videoCapable: boolean;
  /**
   * Which device the model runs on: a GPU's name, "CPU", or "unknown".
   *
   * Worth carrying all the way to the browser. On the desktop a user could infer it from their own
   * machine; here the model is on a server they cannot see, so "why is every click slow" has no
   * answer available to them unless the service provides one.
   */
  readonly accelerator: string;
}

/**
 * A typed failure from the inference service.
 *
 * `status` is carried through rather than flattened, because the five outcomes the service
 * distinguishes — bad prompt, expired handle, unreadable image, model unavailable, model raised —
 * need five different things from the caller, and collapsing them here would undo that.
 *
 * `detail` is carried for the same reason, one level down. C11's `results_overflowed` says which
 * cursor is the earliest still buffered, and that is the whole difference between "you have missed
 * some results" and "you have missed some, carry on from here" — a caller given only the first has
 * nothing to do but retry the cursor that already failed.
 */
export class InferenceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "InferenceError";
  }
}

/** The inference service could not be reached at all, which is different from it refusing. */
export class InferenceUnreachableError extends Error {
  constructor(reason: string) {
    super(`the inference service could not be reached: ${reason}`);
    this.name = "InferenceUnreachableError";
  }
}

/**
 * One checkpoint as the manifest declares it, with whether it is actually usable.
 *
 * `present` and `verified` are separate answers: a file can be there and have the wrong hash,
 * which is the case an operator most needs to see, and the one a single "ok" would hide.
 */
export interface ModelStatus {
  readonly name: string;
  readonly family: string;
  readonly size: string;
  readonly videoCapable: boolean;
  readonly present: boolean;
  readonly verified: boolean;
  /** Why it is not usable, when it is not. */
  readonly detail: string | null;
  /** It answers prompts. False for the embedder Find Archetypes uses, which shares the manifest. */
  readonly segmenter?: boolean;
  /** In memory now: what legacy's "Current: ..." names (CP-49). Absent from an older service. */
  readonly loaded?: boolean;
}

/** What Unload freed, and what is still in memory after it. */
export interface UnloadResult {
  readonly unloaded: readonly string[];
  readonly loaded: readonly string[];
}

/**
 * Starting a propagation — C11. Frame numbers are POSITIONS in `sequence`, never file names.
 *
 * RULE-017 is the reason: legacy names each staged frame after its position in its own list and
 * skips one it cannot read without renumbering, so every frame after a gap comes back attributed
 * to the image before it. Identity lives in this array, and results are resolved through it.
 */
export interface PropagationReference {
  /** Position in `sequence`, never a file name (RULE-017). */
  readonly frame: number;
  readonly objectId: number;
  /** The user's OWN annotation. Legacy seeds propagation with `add_new_mask`, not with clicks. */
  readonly mask: WireMask;
}

export interface PropagationStart {
  readonly sequence: readonly string[];
  /** Frames carrying prompts. Both passes leave the EARLIEST one (RULE-025). */
  readonly references: readonly number[];
  /**
   * The masks to carry, one per object per reference frame.
   *
   * Separate from `references` because a frame can hold several objects and the service needs
   * both answers: which frames are references (RULE-025 leaves the earliest) and what is on them.
   */
  readonly objects?: readonly PropagationReference[];
  readonly start?: number;
  readonly end?: number;
  /** RULE-026. Off means one pass over the whole sequence, which on a long one is gigabytes. */
  readonly streaming?: boolean;
  readonly window?: number;
  readonly model?: string;
}

/** One propagated object on one frame. */
export interface PropagationFrame {
  readonly source: string;
  readonly objectId: number;
  readonly mask: WireMask;
  /** RULE-016. What decides which frames the user is told to check by hand. */
  readonly confidence: number;
}

export type PropagationState = "running" | "completed" | "cancelled" | "failed";

/**
 * A job's state, and the results since the cursor the caller asked with.
 *
 * `completed` and `state` are separate answers on purpose: legacy's propagation wraps its loop in
 * `except Exception: return`, so a run that died on frame 40 of 200 is indistinguishable from a
 * run that was 39 frames long. Here "2 of 200, failed" is a different thing from "2 of 2, done".
 */
export interface PropagationJob {
  readonly id: string;
  readonly state: PropagationState;
  readonly completed: number;
  readonly total: number | null;
  /** Ask with this next. It counts everything ever produced, not what is still buffered. */
  readonly cursor: number;
  /** Asked to stop and not yet stopped: the frame in flight still finishes. */
  readonly cancelling: boolean;
  readonly error: string | null;
  readonly results: readonly PropagationFrame[];
  /**
   * The frames the run leaves out, and why: another size than the reference's, or unreadable.
   * Legacy marks them Skipped and says how many before it propagates (`main_window.py:4149-4162`).
   */
  readonly skipped: readonly { readonly source: string; readonly reason: string }[];
  /** The size they were measured against, once the run has measured. */
  readonly referenceSize: { readonly width: number; readonly height: number } | null;
}

/**
 * What Find Archetypes suggests, and enough about how it got there to explain itself.
 *
 * `fellShort` is the difference between "here are your twenty frames" and "this sequence is too
 * uniform to find twenty distinct ones". Legacy computes the same comparison to pick a progress
 * message and throws it away, and a user who cannot tell those apart assumes the feature is broken.
 */
export interface ArchetypeResult {
  readonly suggested: readonly string[];
  readonly budget: number;
  readonly clusters: number;
  readonly noise: number;
  readonly fellShort: boolean;
  /** Frames that could not be read. They still count towards the budget, so they are reported. */
  readonly unreadable: readonly { readonly key: string; readonly reason: string }[];
}

export interface InferenceClient {
  health(): Promise<InferenceHealth>;
  /** What the service could load. A checkpoint that is not listed is not loadable. */
  models(): Promise<readonly ModelStatus[]>;
  /**
   * Legacy's model controls (CP-49): the manifest read again, a model put in memory now rather
   * than on first use, a model dropped and its GPU memory given back, and which are in memory.
   */
  refreshModels(correlationId: string): Promise<readonly ModelStatus[]>;
  loadModel(model: string, correlationId: string): Promise<readonly string[]>;
  unloadModel(model: string | undefined, correlationId: string): Promise<UnloadResult>;
  loadedModels(correlationId: string): Promise<readonly string[]>;
  embed(request: EmbedRequest, correlationId: string): Promise<EmbedResult>;
  segment(request: SegmentRequest, correlationId: string): Promise<SegmentResult>;

  /** Begin a propagation. Returns as soon as the job exists; it runs for minutes. */
  startPropagation(request: PropagationStart, correlationId: string): Promise<PropagationJob>;
  /** State and the results produced since `cursor`. */
  propagationState(jobId: string, cursor: number, correlationId: string): Promise<PropagationJob>;
  /** Every job this service knows about, for a client that has just reconnected. */
  listPropagations(correlationId: string): Promise<readonly PropagationJob[]>;
  /** Ask a job to stop, keeping the frames already done (RULE-063). Returns at once. */
  cancelPropagation(jobId: string, correlationId: string): Promise<PropagationJob>;

  /** Which frames of a sequence are worth annotating by hand (C10). One pass, one answer. */
  findArchetypes(
    sequence: readonly string[],
    model: string | undefined,
    correlationId: string,
  ): Promise<ArchetypeResult>;

  /**
   * Read images from another folder: the one the app has just opened (POST /folder). The service
   * reads the files itself, so without this a click would be answered from the old folder's image
   * of the same name.
   */
  setDatasetRoot(root: string, correlationId: string): Promise<void>;
}
