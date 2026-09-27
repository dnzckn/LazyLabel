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
 *      automatic save would change the tool's core interaction under cover of a safety fix. With
 *      it on, leaving an image or a sequence frame saves it CHANGED OR NOT, as legacy's does
 *      (`file_navigation_manager.py:156-160, 270-274`; `main_window.py:3480-3520`): Enter's
 *      request, so newly selected formats are written for an image nobody touched. The owner's
 *      directive of 2026-09-26, "Match the desktop app exactly". An UNCHANGED image differs in one
 *      way: a write refused because someone else changed its file is skipped, said, and the move
 *      goes on -- there is no work of this session to keep the user there for. A changed image's
 *      refusal keeps the user on it. With the setting off, a changed image is asked about and an
 *      unchanged one is simply left.
 *
 *   2. A SAVE OF AN IMAGE WITH NO SEGMENTS DELETES ITS FILES, as legacy's does: all seven sidecar
 *      formats, whatever formats are selected, with legacy's "Deleted: ..." notice, or "No segments
 *      to save." when none existed (`save_export_manager.py:106-109, 523-542`; RULE-083). The owner
 *      decided so on 2026-09-26 -- "Match the desktop app exactly" -- reversing this rule's earlier
 *      "never delete; write empty files". It is the same save, by Enter or on leaving the image, so
 *      the decision below says "save" either way; the save button carries it out
 *      (`OpenImageView.tsx`). In the Multi view every move saves BOTH sides first, changed or not
 *      and whatever the setting, and deletes an empty side's files without a word, as legacy's
 *      multi-view save does (CONTROL_PARITY.md CP-67); the store's `savePair` runs it. Enter there
 *      runs the same save of both, and says legacy's "Multi-view annotations saved!".
 *
 *   3. A FAILED LOAD MUST NOT BE SAVED OVER, OR DELETED. Legacy commits the current path before
 *      decoding succeeds, so an image that fails to open (`cv2.imread` returns None — a non-ASCII
 *      path on Windows is enough) becomes the current image with zero segments, and the NEXT
 *      navigation deletes its real annotations (ASSESSMENT.md SEC-04). Provenance is tracked for
 *      exactly this: annotations that did not come from a successful load are never written back,
 *      and never deleted, automatically or by Enter. Legacy deletes even then; the owner's decision
 *      did not ask for that, and this rule stays. Left unchanged, such an image is neither saved
 *      nor asked about: the move just happens.
 *
 *   4. CLOSING ASKS, AND NAMES WHAT WOULD BE LOST. Not auto-save-on-close, even with Auto-Save on:
 *      a user who closes after an experiment they did not want may be closing precisely to discard
 *      it, and saving silently on exit is a different silent behaviour rather than a fix for this
 *      one. But the loss is not silent either — the question says which images and how many
 *      segments, because "are you sure?" gives a user nothing to decide with.
 *
 * A save WITH segments writes the selected formats and deletes nothing: formats the user did not
 * select are reported as stale by the API (decision 15f), as legacy's `export_all` leaves them
 * alone; that half lives on the server, and `WireSaveResponse.stale` carries it back.
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
  /** How many segments would be written. Zero means a save deletes the image's files (rule 2). */
  readonly segmentCount: number;
}

export type Decision =
  /**
   * Write the annotations now, then continue. `changed` is false for an image as it was loaded or
   * last saved, which legacy saves too (rule 1); its refused write does not stop the move.
   */
  | { readonly kind: "save"; readonly image: string; readonly changed: boolean }
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
  if (image === null) return { kind: "proceed" };

  if (image.provenance === "failed") {
    // Never written, changed or not (rule 3). Unchanged, there is nothing to ask about either.
    if (!image.dirty) return { kind: "proceed" };
    // Not a refusal to continue -- a refusal to write. The user is told why, and can still leave.
    return {
      kind: "ask",
      at: [{ key: image.key, segmentCount: image.segmentCount, unsafe: UNSAFE_AFTER_FAILED_LOAD }],
      summary: describe([
        { key: image.key, segmentCount: image.segmentCount, unsafe: UNSAFE_AFTER_FAILED_LOAD },
      ]),
    };
  }

  // An empty image is saved like any other, and its save deletes its files (rule 2). One branch, so
  // there is no separate empty-image path to decide differently. Changed or not (rule 1).
  if (settings.saveOnNavigate) return { kind: "save", image: image.key, changed: image.dirty };

  if (!image.dirty) return { kind: "proceed" };
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
export function summarize(image: ImageState | null, cropped = false): string {
  if (image === null) return "No image open.";
  if (image.provenance === "failed") return `${image.key} could not be read.`;

  const segments = image.segmentCount === 1 ? "1 segment" : `${image.segmentCount} segments`;

  /*
   * A CROP IS ANNOUNCED HERE, not only in its own panel.
   *
   * It is continuous state with a destructive consequence, which is exactly what this bar is for:
   * a crop blanks every mask pixel outside it on the next save, and the exported files keep their
   * full size so nothing about them looks cropped afterwards. The Crop panel starts collapsed and
   * a crop set ten minutes ago is otherwise invisible until it has already taken a row of somebody's
   * work.
   *
   * Legacy shows nothing at all, which is how the same crop survives an image change and blanks
   * most of the next, narrower one.
   */
  const crop = cropped ? ", cropped on save" : "";

  if (!image.dirty) return `${image.key} — ${segments}, saved${crop}.`;

  // Zero is said out loud rather than smoothed away. "0 segments, unsaved" is precisely the state
  // a user needs to see before a save deletes the files of an image that had annotations.
  return `${image.key} — ${segments}, unsaved${crop}.`;
}

/**
 * What legacy says after a save found no segments and deleted (`save_export_manager.py:523-542`):
 * "Deleted: " and the files' names, in the order they went -- which is legacy's exporter order, so
 * "Deleted: a_coco.json, a.npz, a.txt" -- or the warning "No segments to save." when none of the
 * seven existed.
 *
 * The words and the timer are legacy's: an ordinary 3 s message (CP-64). It was kept until
 * dismissed until then.
 */
export function deletionNotice(deleted: readonly string[]): {
  readonly severity: "info" | "warning";
  readonly message: string;
} {
  if (deleted.length === 0) return { severity: "warning", message: "No segments to save." };
  const names = deleted.map((key) => key.split("/").pop() ?? key);
  return { severity: "info", message: `Deleted: ${names.join(", ")}` };
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
