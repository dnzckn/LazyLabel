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
}

/**
 * A typed failure from the inference service.
 *
 * `status` is carried through rather than flattened, because the five outcomes the service
 * distinguishes — bad prompt, expired handle, unreadable image, model unavailable, model raised —
 * need five different things from the caller, and collapsing them here would undo that.
 */
export class InferenceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
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

export interface InferenceClient {
  health(): Promise<InferenceHealth>;
  embed(request: EmbedRequest, correlationId: string): Promise<EmbedResult>;
  segment(request: SegmentRequest, correlationId: string): Promise<SegmentResult>;
}
