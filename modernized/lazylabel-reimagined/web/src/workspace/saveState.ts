/**
 * Dirty tracking and the one save path — decision 7, RULE-057, and the close prompt.
 *
 * This is the module Phase 4 owes the later phases. The sequence timeline (Phase 6) and the split
 * view (Phase 6, decision 8) both save, and legacy's defining mistake here was having several save
 * paths that did different bookkeeping for the same act. So the DECISION about whether to save is
 * made here, once, as a pure function; the callers only carry it out.
 *
 * Four rules from the catalogue, each of which legacy breaks in a way that costs a user real work:
 *
 *   1. AUTO-SAVE ON NAVIGATION STAYS, and stays on by default (RULE-057). The annotator's loop is
 *      click, accept, next. Decision 7 forbids silent LOSS, not automatic saving, and removing the
 *      automatic save would change the tool's core interaction under cover of a safety fix.
 *
 *   2. NEVER INFER A DELETION FROM AN EMPTY SEGMENT LIST. Legacy, in two-viewer mode, deletes every
 *      annotation file of a viewer image that happens to be empty, on every pair change, regardless
 *      of the setting. A user who opens a pair to look at it and moves on without drawing destroys
 *      whatever those images were already labelled with. An empty image saves EMPTY FILES for the
 *      selected formats; it never deletes.
 *
 *   3. A FAILED LOAD MUST NOT BE SAVED OVER. Legacy commits the current path before decoding
 *      succeeds, so an image that fails to open (`cv2.imread` returns None — a non-ASCII path on
 *      Windows is enough) becomes the current image with zero segments, and the NEXT navigation
 *      writes that emptiness over its real annotations. Provenance is tracked for exactly this:
 *      annotations that did not come from a successful load are never written back automatically.
 *
 *   4. CLOSING ASKS, AND NAMES WHAT WOULD BE LOST. Not auto-save-on-close, even with Auto-Save on:
 *      a user who closes after an experiment they did not want may be closing precisely to discard
 *      it, and saving silently on exit is a different silent behaviour rather than a fix for this
 *      one. But the loss is not silent either — the question says which images and how many
 *      segments, because "are you sure?" gives a user nothing to decide with.
 *
 * Formats the user did not select are reported as stale by the API and never deleted
 * (decision 15f); that half lives on the server, and `WireSaveResponse.stale` carries it back.
 */

/** Where an image's in-memory annotations came from. The reason saving can be unsafe. */
export type Provenance =
  /** Read from an annotation file that parsed. Safe to write back. */
  | "loaded"
  /** The image opened and carried no annotation file. Legitimately empty; safe to write. */
  | "absent"
  /** The image or its annotations could not be read. NOT safe to write over. */
  | "failed";

export interface ImageState {
  readonly key: string;
  readonly provenance: Provenance;
  /** Edited since the last successful save. */
  readonly dirty: boolean;
  /** How many segments would be written. Zero is a legitimate state, never a deletion. */
  readonly segmentCount: number;
}

export type Decision =
  /** Write the annotations now, then continue. */
  | { readonly kind: "save"; readonly image: string }
  /** Stop and ask. `summary` names what is at stake, and is meant to be shown verbatim. */
  | { readonly kind: "ask"; readonly at: readonly AtRisk[]; readonly summary: string }
  /** Nothing to do. */
  | { readonly kind: "proceed" };

export interface AtRisk {
  readonly key: string;
  readonly segmentCount: number;
  /** Why saving this one is not simply offered. Absent when it could be saved normally. */
  readonly unsafe?: string;
}

export interface SaveSettings {
  /** RULE-057: user-visible, defaults on. */
  readonly saveOnNavigate: boolean;
}

const UNSAFE_AFTER_FAILED_LOAD =
  "its annotations could not be read, so saving would write over a file this session never loaded";

/**
 * What to do when the user navigates away from `image`.
 *
 * The order of the checks is the whole rule. Provenance is tested BEFORE dirtiness and before the
 * setting, because a failed load must not be written back by any route — not by auto-save, and not
 * by a user who answers yes to a prompt that never mentioned the risk.
 */
export function onNavigateAway(image: ImageState | null, settings: SaveSettings): Decision {
  if (image === null || !image.dirty) return { kind: "proceed" };

  if (image.provenance === "failed") {
    // Not a refusal to continue -- a refusal to write. The user is told why, and can still leave.
    return {
      kind: "ask",
      at: [{ key: image.key, segmentCount: image.segmentCount, unsafe: UNSAFE_AFTER_FAILED_LOAD }],
      summary: describe([
        { key: image.key, segmentCount: image.segmentCount, unsafe: UNSAFE_AFTER_FAILED_LOAD },
      ]),
    };
  }

  // An empty image is saved, not deleted. This is the branch legacy gets wrong, and it is written
  // as one branch with the others precisely so there is no separate empty-image path to get wrong.
  if (settings.saveOnNavigate) return { kind: "save", image: image.key };

  const at = [{ key: image.key, segmentCount: image.segmentCount }];
  return { kind: "ask", at, summary: describe(at) };
}

/**
 * What to do when the workspace is closing.
 *
 * Never saves, whatever the setting says. Reports every dirty image rather than only the open one:
 * legacy loses the last-edited image on exit, and it loses propagated sequence frames and the other
 * half of a multi-view pair the same way, without ever naming them.
 */
export function onClose(images: readonly ImageState[]): Decision {
  const at = images
    .filter((image) => image.dirty)
    .map((image) => ({
      key: image.key,
      segmentCount: image.segmentCount,
      ...(image.provenance === "failed" ? { unsafe: UNSAFE_AFTER_FAILED_LOAD } : {}),
    }));

  if (at.length === 0) return { kind: "proceed" };
  return { kind: "ask", at, summary: describe(at) };
}

/**
 * The sentence the prompt shows.
 *
 * Deliberately concrete. "You have unsaved changes" is true of every such prompt ever written and
 * tells a user nothing they can weigh; the number of segments and the names of the images do.
 */
export function describe(at: readonly AtRisk[]): string {
  if (at.length === 0) return "Nothing is unsaved.";

  const unsafe = at.filter((entry) => entry.unsafe !== undefined);
  const parts: string[] = [];

  if (at.length === 1) {
    const only = at[0]!;
    parts.push(`${only.key} has ${count(only.segmentCount)} that ${have(only.segmentCount)} not been saved.`);
  } else {
    const total = at.reduce((sum, entry) => sum + entry.segmentCount, 0);
    const names = at.slice(0, 3).map((entry) => entry.key);
    const rest = at.length - names.length;
    const listed = rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", ");
    parts.push(`${at.length} images have unsaved work — ${listed} — ${count(total)} in total.`);
  }

  if (unsafe.length > 0) {
    const which = unsafe.length === at.length ? "It" : `${unsafe.map((e) => e.key).join(", ")}`;
    parts.push(`${which} cannot be saved automatically: ${unsafe[0]!.unsafe}.`);
  }

  return parts.join(" ");
}

function count(segments: number): string {
  return segments === 1 ? "1 segment" : `${segments} segments`;
}

function have(segments: number): string {
  return segments === 1 ? "has" : "have";
}

/**
 * Whether this image may be written at all.
 *
 * Exported because the save BUTTON needs the same answer the navigation logic needs, and computing
 * it twice is how the two drift apart.
 */
export function canSave(image: ImageState | null): boolean {
  return image !== null && image.provenance !== "failed";
}

/**
 * One line of continuous state: what is open and whether it is saved.
 *
 * Belongs beside the rules rather than in the component that shows it, because the SAME words have
 * to be available to the status bar, to a prompt, and to anything else that needs to say where the
 * work stands — and three places wording this independently is three places to drift.
 */
export function summarize(image: ImageState | null): string {
  if (image === null) return "No image open.";
  if (image.provenance === "failed") return `${image.key} could not be read.`;

  const segments = image.segmentCount === 1 ? "1 segment" : `${image.segmentCount} segments`;
  if (!image.dirty) return `${image.key} — ${segments}, saved.`;

  // Zero is said out loud rather than smoothed away. "0 segments, unsaved" is precisely the state
  // a user needs to see before a save writes empty files over an image that had annotations.
  return `${image.key} — ${segments}, unsaved.`;
}

/**
 * Turn a load result into provenance.
 *
 * Takes the bare discriminant rather than the API client's type, so this module stays independent
 * of the transport. Small, but worth being a named function with a test: the whole safety property
 * rests on "none" and "failed" being kept apart, and they are easy to collapse into one
 * "no annotations" branch by anyone tidying later. An image with no annotation file is the normal
 * case and must save without ceremony; an image whose annotations could not be READ must not be
 * written back at all. Legacy conflates them, which is how a failed load ends up overwriting a
 * real file with emptiness.
 */
export function provenanceFromLoad(kind: "loaded" | "none" | "failed"): Provenance {
  if (kind === "loaded") return "loaded";
  if (kind === "none") return "absent";
  return "failed";
}
