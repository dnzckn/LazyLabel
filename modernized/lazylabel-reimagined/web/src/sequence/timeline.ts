/**
 * The sequence timeline — Phase 6's pilot slice.
 *
 * The brief's pilot is "build a timeline from a file range and mark references from existing
 * annotations, without propagation". This is the whole of it as pure logic: what a frame's status
 * is, how the timeline orders itself, how navigation moves between frames, and what a new
 * propagation run or a Clear Flags does to the statuses that are already there.
 *
 * NO PROPAGATION HAPPENS HERE and that is the point of the pilot. Propagation needs the real
 * checkpoints and a golden capture to be proven against; the timeline needs neither, and building
 * it first is what turns "Phase 6" into something a person can look at.
 *
 * THE STATUS IS ONE FIELD IN LEGACY AND TWO HERE, which is RULE-055's answer carried in. Legacy
 * stores `reference` and `saved` in the same enum, so writing a frame's file destroys its role:
 * the next Propagate resets SAVED to PENDING, the frame stops being protected, and propagation can
 * overwrite the ground truth it was seeded from — after the user did nothing but walk past it.
 * Here a frame has a ROLE (is it a reference?) and a STATE (what has happened to it), and saving
 * changes only the second.
 *
 * Legacy also has TWO FrameStatus enums that disagree — one in the view mode with seven values and
 * one in the propagation engine with five — and its own status function is never called
 * (RULE-076's recorded defect). There is one here.
 */

/**
 * What has happened to a frame. Its ROLE is separate; see `Frame.isReference`.
 *
 * `skipped` is not a user action: RULE-048 marks a frame skipped when its image size does not
 * match the first reference's, because SAM 2 stages one video at one size and a frame of another
 * cannot take part.
 */
export type FrameState =
  | "pending"
  | "propagated"
  | "flagged"
  | "saved"
  | "skipped"
  | "suggested";

export interface Frame {
  /** Position in the timeline, which is what every operation addresses a frame by. */
  readonly index: number;
  /** The image this frame is, as a dataset key. */
  readonly key: string;
  readonly state: FrameState;
  /**
   * Whether this frame is ground truth propagation runs FROM.
   *
   * Separate from `state` deliberately — see the note at the top. A reference frame that has been
   * saved is a saved reference, not a frame that has stopped being a reference.
   */
  readonly isReference: boolean;
}

/**
 * How the timeline's Sort orders frames — RULE-072.
 *
 * Reference first, then saved, propagated, suggested, pending, flagged, skipped. Not an ordering
 * anyone would guess: flagged sorts almost LAST, below pending, because the list is "what is
 * finished" rather than "what needs attention" — the flagged frames have their own navigation
 * (N / Shift+N) for that.
 */
const SORT_PRIORITY: Readonly<Record<FrameState, number>> = {
  saved: 1,
  propagated: 2,
  suggested: 3,
  pending: 4,
  flagged: 5,
  skipped: 6,
};

/** Reference outranks every state, which is why it is not in the table above. */
const REFERENCE_PRIORITY = 0;

export function sortPriority(frame: Frame): number {
  return frame.isReference ? REFERENCE_PRIORITY : SORT_PRIORITY[frame.state];
}

/**
 * RULE-034's sibling for the timeline: the colours legacy paints each status.
 *
 * Kept exact because a user moving between the desktop app and this one reads the timeline by
 * colour before they read anything else.
 */
export const STATE_COLOURS: Readonly<Record<FrameState | "reference", readonly [number, number, number]>> = {
  reference: [255, 193, 7],
  saved: [0, 188, 212],
  propagated: [76, 175, 80],
  suggested: [156, 39, 176],
  pending: [128, 128, 128],
  flagged: [244, 67, 54],
  skipped: [139, 69, 19],
};

export function colourOf(frame: Frame): readonly [number, number, number] {
  return frame.isReference ? STATE_COLOURS.reference : STATE_COLOURS[frame.state];
}

/** The folder a dataset key sits in, as the listing API names it: "" for the dataset's root. */
export function folderOf(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash < 0 ? "" : key.slice(0, slash);
}

/**
 * Build a timeline from a range of a file list.
 *
 * `from` and `to` are POSITIONS in the list, inclusive at both ends, and are put in order if they
 * arrive reversed — a user dragging a range backwards means the same range.
 *
 * Out-of-range positions are clamped rather than refused: the range comes from a UI selection, and
 * a selection that ran off the end still names a real stretch of files.
 */
export function buildTimeline(files: readonly string[], from: number, to: number): readonly Frame[] {
  if (files.length === 0) return [];

  const low = Math.max(0, Math.min(files.length - 1, Math.min(from, to)));
  const high = Math.max(0, Math.min(files.length - 1, Math.max(from, to)));

  return files.slice(low, high + 1).map((key, index) => ({
    index,
    key,
    state: "pending" as const,
    isReference: false,
  }));
}

/**
 * "+ All Labeled": mark the frames that already carry annotations as references.
 *
 * `annotated` is the set of dataset keys that have a sidecar. Only when the user asks: this ran
 * whenever a timeline was built until 2026-09-23, and legacy never marks a reference by itself
 * (`_on_add_all_labeled_reference` is a button). Marking on build made a rebuilt timeline seed from
 * every frame an earlier Save All wrote.
 *
 * RULE-048: every reference must be the same pixel size, because SAM 2 stages one video at one
 * size. The FIRST reference in timeline order sets that size and any later one that disagrees is
 * marked `skipped` rather than silently resized or silently dropped — legacy marks them Skipped
 * too, and a frame that vanished from the run with no trace is how a sequence comes back with a
 * hole in it.
 *
 * `sizeOf` returning null means the size is not known yet; such a frame is taken at its word and
 * marked a reference, because refusing on unknown information is worse than checking later.
 */
export function markReferences(
  frames: readonly Frame[],
  annotated: ReadonlySet<string>,
  sizeOf: (key: string) => { readonly width: number; readonly height: number } | null = () => null,
): readonly Frame[] {
  let required: { readonly width: number; readonly height: number } | null = null;
  let sizeSeen = false;

  return frames.map((frame) => {
    if (!annotated.has(frame.key)) return frame;

    const size = sizeOf(frame.key);
    if (size === null) return { ...frame, isReference: true };

    if (!sizeSeen) {
      sizeSeen = true;
      required = size;
      return { ...frame, isReference: true };
    }

    if (required !== null && (size.width !== required.width || size.height !== required.height)) {
      // Not a reference, and not pending either: it cannot take part in the run at all.
      return { ...frame, state: "skipped" as const, isReference: false };
    }

    return { ...frame, isReference: true };
  });
}

/**
 * What a new propagation run does to the statuses already on the timeline — RULE-076.
 *
 * Every non-reference, non-skipped frame goes back to pending, INCLUDING SAVED ONES. That is
 * legacy's behaviour and it is reproduced: a saved frame is one whose file is on disk, and
 * re-running propagation over it is a thing users do deliberately when the first run was seeded
 * badly. The file is not touched — only the timeline's idea of what has been done this run.
 *
 * Reference frames keep their role AND their state, which is the difference RULE-055's answer
 * makes: in legacy a saved reference had already stopped being a reference by this point, so this
 * reset would have cleared it and propagation could then overwrite it.
 */
export function resetForPropagation(frames: readonly Frame[]): readonly Frame[] {
  return frames.map((frame) => {
    if (frame.isReference || frame.state === "skipped") return frame;
    return { ...frame, state: "pending" as const };
  });
}

/**
 * The frames a run leaves out, marked `skipped`: legacy's `mark_frames_skipped`, brown on its
 * timeline (`sequence_view_mode.py:586-596`, SEQUENCE_PARITY.md SP-25).
 *
 * Stored rather than only shown, because legacy keeps them through the reset each run makes
 * (`sequence_view_mode.py:143-159`), as `resetForPropagation` does; Clear Flags and Clear
 * references return them to pending, as legacy's do. A reference keeps its role.
 */
export function markSkipped(frames: readonly Frame[], keys: Iterable<string>): readonly Frame[] {
  const left = new Set(keys);
  let changed = false;
  const next = frames.map((frame) => {
    if (!left.has(frame.key) || frame.isReference || frame.state === "skipped") return frame;
    changed = true;
    return { ...frame, state: "skipped" as const };
  });
  return changed ? next : frames;
}

/**
 * "+ All Before": the frames before the current one, as the timeline is SHOWN, that may become
 * references -- the panel then checks their size (SP-24) and marks them.
 *
 * In display order, as legacy does it (`main_window.py:3910-3930`): with the timeline sorted,
 * "before" is to the left of the current frame on screen, not a lower index -- the frames a user is
 * looking at, which is the only reading of "before" they can act on. A size-mismatched frame
 * (`skipped`) is left out, as legacy refuses it.
 */
export function framesBefore(
  frames: readonly Frame[],
  current: number,
  order: readonly number[],
): readonly Frame[] {
  const at = order.indexOf(current);
  if (at <= 0) return [];
  const byIndex = new Map(frames.map((frame) => [frame.index, frame]));
  return order
    .slice(0, at)
    .map((index) => byIndex.get(index))
    .filter((frame): frame is Frame => frame !== undefined && frame.state !== "skipped");
}

/**
 * "Clear All": no frame is a reference any more — `_on_clear_sequence_references`.
 *
 * The frames skipped for a size mismatch go back to pending with them, as in legacy: the size
 * they failed to match was the first reference's, and with no reference there is nothing to fail.
 * A cleared reference keeps its STATE, which is where this departs from legacy on purpose (RULE-055's
 * answer): a reference that was saved is still a saved frame when it stops being a reference, and
 * legacy's repaint to pending forgets that its file is on disk.
 */
export function clearReferences(frames: readonly Frame[]): readonly Frame[] {
  if (!frames.some((frame) => frame.isReference || frame.state === "skipped")) return frames;
  return frames.map((frame) => {
    if (frame.isReference) return { ...frame, isReference: false };
    if (frame.state === "skipped") return { ...frame, state: "pending" as const };
    return frame;
  });
}

/**
 * The frames Save All wrote, marked `saved` — what legacy's `mark_frame_saved` paints cyan.
 *
 * Until 2026-09-23 nothing did this: a Save All wrote the files and the timeline went on calling
 * the frames `propagated`, so a user looking at it could not tell written work from unwritten --
 * the one thing the colour is for. The synthetic-shapes golden compares the timeline after a save.
 */
export function markSaved(frames: readonly Frame[], keys: Iterable<string>): readonly Frame[] {
  const written = new Set(keys);
  if (written.size === 0) return frames;
  return frames.map((frame) =>
    written.has(frame.key) && !frame.isReference ? { ...frame, state: "saved" as const } : frame,
  );
}

/**
 * The frames Skip Labeled kept this run, SHOWN as `skipped` without being stored that way — RULE-081.
 *
 * Shown, not stored, because the protection belongs to the run: the next run takes a new snapshot
 * of which frames are labelled, and a stored `skipped` would outlive it (`resetForPropagation`
 * keeps skipped frames, since a size mismatch does outlive a run). Legacy does the same thing the
 * other way round: it paints the cell brown and leaves the frame's stored status pending.
 */
export function showKeptLabels(frames: readonly Frame[], keys: ReadonlySet<string>): readonly Frame[] {
  if (keys.size === 0) return frames;
  return frames.map((frame) =>
    keys.has(frame.key) && !frame.isReference ? { ...frame, state: "skipped" as const } : frame,
  );
}

/**
 * Clear Flags — RULE-076, and it is NOT the same as `resetForPropagation`.
 *
 * It resets every non-reference frame to pending, including saved AND SKIPPED ones. Skipped is the
 * difference, and it is legacy's behaviour: a frame marked skipped for a size mismatch becomes
 * pending again, so the next run tries it and marks it skipped once more. Harmless, and preserved
 * because a user who fixed the offending image expects it back in the run.
 */
export function clearFlags(frames: readonly Frame[]): readonly Frame[] {
  return frames.map((frame) =>
    frame.isReference ? frame : { ...frame, state: "pending" as const },
  );
}

/** The display order the Sort button produces: by priority, ties by frame index (RULE-072). */
export function sortedOrder(frames: readonly Frame[]): readonly number[] {
  return [...frames]
    .sort((a, b) => sortPriority(a) - sortPriority(b) || a.index - b.index)
    .map((frame) => frame.index);
}

/** What the navigation hotkeys move between. */
export type Target = "flagged" | "reference" | "suggested";

function matches(frame: Frame, target: Target): boolean {
  if (target === "reference") return frame.isReference;
  // A reference frame is never a navigation target for the other two: its role is what it is, and
  // N should not stop on ground truth while looking for work.
  if (frame.isReference) return false;
  return frame.state === target;
}

/**
 * The next frame of a kind, WRAPPING — RULE-072.
 *
 * Wrapping is the part worth stating: from the last flagged frame, N goes back to the first, and
 * with a single flagged frame N returns to the one you are on. Legacy does this, and a
 * non-wrapping version looks identical until a user reaches the end of a long sequence and the
 * key stops working with no explanation.
 *
 * Returns null when nothing matches, which is a different answer from "you are already there".
 */
export function step(
  frames: readonly Frame[],
  from: number,
  target: Target,
  direction: 1 | -1 = 1,
): number | null {
  if (frames.length === 0) return null;

  for (let offset = 1; offset <= frames.length; offset += 1) {
    const at = (((from + offset * direction) % frames.length) + frames.length) % frames.length;
    const frame = frames[at];
    if (frame !== undefined && matches(frame, target)) return frame.index;
  }
  return null;
}

/**
 * H and Shift+H: the next suggestion from `from`, wrapping, over the STORED list of suggestions,
 * as legacy walks its list whatever the frames' statuses have become since
 * (`sequence_view_mode.py:519-537`, SEQUENCE_PARITY.md SP-30). Following the purple state lost a
 * suggestion a Propagate had repainted pending, or one that had become a reference.
 */
export function stepAmong(
  frames: readonly Frame[],
  from: number,
  keys: ReadonlySet<string>,
  direction: 1 | -1 = 1,
): number | null {
  if (frames.length === 0) return null;
  for (let offset = 1; offset <= frames.length; offset += 1) {
    const at = (((from + offset * direction) % frames.length) + frames.length) % frames.length;
    const frame = frames[at];
    if (frame !== undefined && keys.has(frame.key)) return frame.index;
  }
  return null;
}

/** Earlier suggestions back to pending, as legacy clears them before a new Find (`sequence_view_mode.py:503-509`). */
export function clearSuggested(frames: readonly Frame[]): readonly Frame[] {
  return frames.map((frame) => (frame.state === "suggested" ? { ...frame, state: "pending" as const } : frame));
}

/** How many frames are in each state, for the counts the timeline shows above itself. */
export function summarize(frames: readonly Frame[]): {
  readonly total: number;
  readonly references: number;
  readonly byState: Readonly<Record<FrameState, number>>;
} {
  const byState: Record<FrameState, number> = {
    pending: 0,
    propagated: 0,
    flagged: 0,
    saved: 0,
    skipped: 0,
    suggested: 0,
  };
  let references = 0;

  for (const frame of frames) {
    byState[frame.state] += 1;
    if (frame.isReference) references += 1;
  }

  return { total: frames.length, references, byState };
}

/**
 * Mark ONE frame as a reference, by hand — legacy's "add reference frame".
 *
 * `markReferences` derives the whole set from which images already have annotations, which is the
 * right answer when a timeline is built and the wrong one afterwards: a user who has just drawn on
 * a frame wants propagation to run from it, and nothing re-derives the set while they work.
 *
 * ADD, not toggle, which is what legacy calls it. Pressing it on a frame that is already a
 * reference does nothing rather than quietly removing ground truth -- and removing one is the sort
 * of thing that should take a deliberate, differently named act, because propagation then runs
 * from somewhere else and every frame after it changes.
 *
 * The frame's STATE is untouched. A reference that has been saved is a saved reference; role and
 * state are separate here for exactly this reason.
 */
export function markReference(frames: readonly Frame[], index: number): readonly Frame[] {
  const at = frames.findIndex((frame) => frame.index === index);
  if (at < 0 || frames[at]!.isReference) return frames;
  return frames.map((frame, i) => (i === at ? { ...frame, isReference: true } : frame));
}


/**
 * Mark the frames Find Archetypes suggested — RULE-091's priority queue and C10's whole point.
 *
 * A REFERENCE IS NEVER DEMOTED. A frame the user has already annotated is ground truth, and the
 * suggestion is "this is worth annotating"; overwriting the first with the second would tell
 * someone to redo work they have finished. Legacy's own sort puts reference above suggested for
 * the same reason.
 *
 * A frame already propagated, saved or flagged keeps its state too. Those describe what HAPPENED
 * to a frame, and a suggestion is only ever advice about what to do next.
 */
export function markSuggested(
  frames: readonly Frame[],
  suggested: readonly string[],
): readonly Frame[] {
  const wanted = new Set(suggested);
  return frames.map((frame) =>
    wanted.has(frame.key) && !frame.isReference && frame.state === "pending"
      ? { ...frame, state: "suggested" as const }
      : frame,
  );
}

export type TrimMode = "cut" | "keep";

export type TrimOutcome =
  | {
      readonly kind: "trimmed";
      readonly frames: readonly Frame[];
      readonly removed: number;
      /** Where the current frame lands: the nearest kept one, ties to the lower index. */
      readonly current: number;
    }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Trim — RULE-077. Cut removes the frames between the markers; Keep removes everything outside.
 *
 * FILES ARE NOT TOUCHED. This edits the timeline's idea of which frames are in the run, and
 * nothing else; a frame removed here is still on disk with whatever it had.
 *
 * REMAINING FRAMES KEEP EVERYTHING — status, score, masks, reference role — and keeping the masks
 * is where this diverges from legacy on purpose. Legacy resets the propagation engine on trim, and
 * its own rule card records what that costs: "Save All then reports nothing to save even though
 * green frames with unsaved propagated masks remain". The masks are keyed by image key here rather
 * than by position, so a trim cannot lose or misplace them, and they simply survive. Decision 7 is
 * the standing reason not to copy that.
 *
 * MARKER ORDER DOES NOT MATTER, and both ends are inclusive. A user drags two markers and does not
 * think about which came first.
 */
export function trim(
  frames: readonly Frame[],
  a: number | null,
  b: number | null,
  mode: TrimMode,
  current = 0,
  /** The order the frames are SHOWN in, when sorted: the markers then bound what is between them on screen. */
  order?: readonly number[],
): TrimOutcome {
  // Legacy's words (`main_window.py:5236, 5239, 5308, 5329, 5332`).
  if (a === null || b === null) {
    return { kind: "refused", reason: "Set both trim left and right bounds first" };
  }

  // Between the markers AS DISPLAYED: with the timeline sorted, legacy cuts and keeps the frames
  // between the markers on screen (`main_window.py:5209-5228, 5311-5322`; SEQUENCE_PARITY.md SP-27).
  const shownAt = order === undefined ? null : new Map(order.map((index, at) => [index, at]));
  const place = (index: number): number => shownAt?.get(index) ?? index;
  const low = Math.min(place(a), place(b));
  const high = Math.max(place(a), place(b));
  const inside = (index: number): boolean => place(index) >= low && place(index) <= high;

  const kept = frames.filter((_frame, index) => (mode === "cut" ? !inside(index) : inside(index)));
  const removed = frames.length - kept.length;

  if (kept.length === 0) {
    // Legacy refuses this too, and the reason is not arbitrary: an empty timeline has no range
    // picker in it, so the only way back would be to rebuild from scratch.
    return { kind: "refused", reason: "Cannot remove all frames from the timeline" };
  }
  if (removed === 0) {
    // Only Keep can remove nothing: Cut always removes at least the bounds.
    return { kind: "refused", reason: "Nothing to remove — all frames are in the range" };
  }

  // Which of the ORIGINAL positions survived, in order, so the current frame can be moved to the
  // nearest one rather than to whatever now sits at its old number.
  const survivors = frames
    .map((_frame, index) => index)
    .filter((index) => (mode === "cut" ? !inside(index) : inside(index)));

  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  survivors.forEach((original, position) => {
    const distance = Math.abs(original - current);
    // Strictly less, so a tie keeps the EARLIER frame -- which is what legacy does and is the only
    // choice that does not depend on iteration order.
    if (distance < best) {
      best = distance;
      nearest = position;
    }
  });

  return {
    kind: "trimmed",
    // Re-indexed 0..n-1. Everything else about a frame travels with it untouched.
    frames: kept.map((frame, index) => ({ ...frame, index })),
    removed,
    current: nearest,
  };
}
