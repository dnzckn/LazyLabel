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
  // RULE-031's presets are REACHED now -- `equalizeLut` and `clahe` are applied by the pipeline's
  // rescale step, asked for through `preset=` on the processing query, and the Rescale histogram
  // dialog's Contrast Stretch arrives as a plain window. Their entries are gone, which is what this
  // list is for: an excuse that outlives the gap tells the next reader a working feature is still
  // missing. `applyLut` went with them, by deletion -- the pipeline applies the table inside the
  // loop it already runs over every pixel, so a second pass over the whole image was the wrong
  // shape -- and so did `stretchWindow`, when the stretch moved into the dialog as legacy's is.

  // ---- Propagation, C11. Nothing left here. ----
  //
  // `frameConfidence` came off when the browser learned to propagate, and `saveableFrames` when it
  // learned to SAVE what it propagated. That one had been sitting here since it was written: the
  // rule it encodes -- Save All never writes a flagged frame -- was correct, tested, and had never
  // been asked. A rule nothing consults is not a rule the software follows.

  // ---- Hidden by the guard's own blind spot until 2026-09-21. ----
  //
  // All three were mentioned by NAME in a comment, and the sweep counted a mention as a use. The
  // guard strips comments now; these are what was behind it, and each is a real gap rather than
  // dead code. `resetForPropagation` came off the list in the same commit, wired into the start of
  // a propagation run where RULE-075 says it belongs.
  // The formats package is scanned too, since 2026-09-23. SEC-06's object limit sat there with no
  // caller while the text readers allocated one full-image mask per line, and neither reach guard
  // looked at that package. Widening the sweep found this one entry, and it is not a defect.
  findExternalContoursDense: {
    kind: "library",
    who:
      "the formats package's own tests. It is cv2's CHAIN_APPROX_NONE -- every border pixel -- and "
      + "exists to pin the border tracer down independently of CHAIN_APPROX_SIMPLE's corner "
      + "compression, which is what the writers use. Deleting it would remove the only way to test "
      + "the tracer on its own.",
  },

  // The settings and contracts packages are scanned too, since 2026-09-23. Widening the sweep to
  // them found two, and both are wired now: `importLegacySettings`, the desktop settings import
  // PROGRESS had recorded as Phase 4 exit criterion 3 MET while nothing called it, and
  // `checkAssignment`, RULE-049's check for a hotkey editor nobody had built. The editor exists now
  // (`hotkeys/HotkeyEditor.tsx`) and calls it on every key a user presses to rebind.

  project: awaiting(
    "the image-to-display direction of the coordinate transform. Every drawing path needs only "
      + "`locate`, the other direction; this waits for the first feature that draws a known image "
      + "point onto the screen",
  ),

  // ---- Other rules whose UI is not built. ----

  // ---- Superseded, and DELETED rather than recorded. ----
  //
  // Nothing is listed here any more, and that is deliberate: `afterRemoval`, `rescaleAll`,
  // `posterizeAll` and `cssColor` were each superseded by a route the code actually takes, and
  // dead code with an excuse attached is still dead code -- the next reader has to work out
  // whether it matters before they can ignore it. They were removed in the same commit that
  // introduced this list.
};
