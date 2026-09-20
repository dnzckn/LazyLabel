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
 * Mark the frames that already carry annotations as references — the pilot's second half.
 *
 * `annotated` is the set of dataset keys that have a sidecar. A frame that already has labels is
 * ground truth, and propagation must run FROM it rather than over it.
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
