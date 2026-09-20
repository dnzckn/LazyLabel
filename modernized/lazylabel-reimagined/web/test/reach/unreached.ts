/**
 * Exported functions no production code calls, and why each one is allowed to be.
 *
 * Every defect in this project's longest-running family had the same shape: a function that works,
 * a test that proves it works, and nothing calling it. `EditLayer` never rendered. Undo with no
 * caller. `HttpInferenceClient` never constructed. `markSaved`, so nothing ever cleared "unsaved".
 * `onNavigateAway`, so opening another image discarded the work in silence. Eleven of them, each
 * found by a person noticing rather than by anything failing.
 *
 * They are all the same query: which exported FUNCTIONS does no production code call? This is that
 * query, with an answer recorded for each. A new one fails the test and has to be explained, which
 * is the prompt that was missing every previous time.
 *
 * WHY FUNCTIONS ONLY. A constant exported for a test to assert against — `MIN_THRESHOLD`,
 * `DEFAULT_SIZING` — is not a promise to the user; it is the test naming the number the code uses.
 * A function is behaviour, and behaviour nothing reaches is behaviour that does not exist.
 */

export type Reason =
  /** A rule whose slice is not built. It is proven and waiting, and the entry says what for. */
  | { readonly kind: "awaiting"; readonly slice: string }
  /** Superseded: the code took another route and this is now dead. Delete on sight. */
  | { readonly kind: "dead"; readonly instead: string }
  /** Deliberately a library: exported for callers outside these packages. */
  | { readonly kind: "library"; readonly who: string };

const awaiting = (slice: string): Reason => ({ kind: "awaiting", slice });
const dead = (instead: string): Reason => ({ kind: "dead", instead });

export const UNREACHED: Readonly<Record<string, Reason>> = {
  // RULE-031's presets are REACHED now -- `stretchWindow` and `equalizeLut` are applied by the
  // pipeline and `clahe` by `applyClahe`, all three asked for through `preset=` on the processing
  // query. Their entries are gone, which is what this list is for: an excuse that outlives the
  // gap tells the next reader a working feature is still missing. `applyLut` went with them, by
  // deletion -- the pipeline applies the table inside the loop it already runs over every pixel,
  // so a second pass over the whole image was the wrong shape.

  // ---- Propagation, C11. Blocked on the inference service and a recorded sequence. ----
  frameConfidence: awaiting("C11: nothing produces per-object scores until propagation runs"),
  saveableFrames: awaiting("C11: Save All has no propagated frames to write yet"),

  // ---- Other rules whose UI is not built. ----
  canSave: awaiting(
    "the save button is always offered and reports its own refusals; this decides in ADVANCE, "
      + "which is what a disabled button with a reason would need",
  ),

  // ---- Superseded, and DELETED rather than recorded. ----
  //
  // Nothing is listed here any more, and that is deliberate: `afterRemoval`, `rescaleAll`,
  // `posterizeAll` and `cssColor` were each superseded by a route the code actually takes, and
  // dead code with an excuse attached is still dead code -- the next reader has to work out
  // whether it matters before they can ignore it. They were removed in the same commit that
  // introduced this list.
};
