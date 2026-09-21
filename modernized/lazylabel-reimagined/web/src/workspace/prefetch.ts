/**
 * Which image to encode next, before anyone asks for it — RULE-091's second half.
 *
 * The cache is built and keyed properly. What was missing is the reason it pays: a cold SAM encode
 * is seconds, and the first click after navigating to the next image is exactly when a user is
 * least willing to wait for one. Legacy pre-computes neighbours so that click lands on a warm
 * cache, and RULE-074's latency budget assumes it.
 *
 * THE ORDER IS THE RULE, and it is not "the nearest images": the first uncached ARCHETYPE frame
 * comes first, then N+1, N+2, N-1. Archetypes are the frames the app itself suggested annotating,
 * so they are the ones a user is most likely to jump to rather than step to — and a jump is the
 * navigation a prefetch of neighbours alone would never help with.
 *
 * ONLY THE FIRST UNCACHED ARCHETYPE, not all of them. Encoding every suggested frame would evict
 * the neighbours to make room — the cache holds ten — and leave stepping through the sequence
 * slower than it was before any of this.
 *
 * THE TIMINGS ARE DEFAULTS, NOT CONSTANTS. 200 ms to settle and 500 ms to retry are legacy's,
 * tuned against a desktop GPU; RULE-091's answer says plainly they are "defaults to measure in
 * Phase 3 against the 150 ms p95 budget, not constants to port unexamined". They are exported so a
 * hosted deployment can change them without editing this file.
 */

/** How long to wait after an encode finishes before starting the next. Legacy's 200 ms. */
export const SETTLE_MS = 200;

/** How often to look again while the current image is still encoding. Legacy's 500 ms. */
export const RETRY_MS = 500;

/** Legacy's LRU size, and the spec's retention cap. Prefetching more than this evicts itself. */
export const CACHE_SIZE = 10;

export interface PrefetchInput {
  /** Every image in the folder, in the order the user steps through them. */
  readonly keys: readonly string[];
  /** The image on screen. Never prefetched — it is being encoded by the normal path. */
  readonly current: string;
  /** Frames Find Archetypes suggested, in its own order. */
  readonly archetypes?: readonly string[];
  /** What this session has already had encoded. A cache hit costs nothing but a round trip. */
  readonly encoded: ReadonlySet<string>;
}

/**
 * The images to encode ahead, in the order RULE-091 gives.
 *
 * Returns a LIST rather than one key so a caller can walk it as each encode finishes, and so the
 * order is testable without a clock. Anything already encoded, missing, or the current image is
 * left out — a prefetch that re-encodes what is already warm is pure cost.
 */
export function prefetchOrder(input: PrefetchInput): readonly string[] {
  const { keys, current, encoded } = input;
  const position = keys.indexOf(current);

  const wanted: string[] = [];

  // The first uncached archetype, and only the first: the cache holds ten, and encoding every
  // suggested frame would evict the neighbours this same list is about to ask for.
  const archetype = (input.archetypes ?? []).find(
    (key) => key !== current && !encoded.has(key) && keys.includes(key),
  );
  if (archetype !== undefined) wanted.push(archetype);

  if (position >= 0) {
    // N+1, N+2, N-1. Forward first because stepping forward is the common motion, and N+2 before
    // N-1 because a user who has just moved forward is more likely to keep going than turn back.
    for (const offset of [1, 2, -1]) {
      const key = keys[position + offset];
      if (key !== undefined && key !== current) wanted.push(key);
    }
  }

  const seen = new Set<string>();
  return wanted.filter((key) => {
    if (encoded.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
