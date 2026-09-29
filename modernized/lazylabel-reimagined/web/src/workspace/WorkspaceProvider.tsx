/**
 * Which image is open, and everything that follows from that.
 *
 * Phase 4's workspace store. It exists because the answer "what is open" has too many readers for
 * any one of them to own it: the dataset list highlights the open row, the canvas draws it, the
 * status bar names it, the save path decides whether navigating away is safe, and Phase 6's
 * timeline and split view both ask the same question. Legacy's answer lives on MainWindow and is
 * reached through half a dozen managers, which is how it ends up with several save paths that do
 * different bookkeeping for the same act.
 *
 * TWO IMAGES, NOT ONE. RULE-092's linked multi-view needs a second image open at the same time, so
 * everything per-image lives in a `SideState` and the store holds two of them plus a pointer to
 * the ACTIVE side. The single-image components -- eight of them -- read exactly what they read
 * when there was one image: the context still exposes `segments`, `crop`, `dirty` and the rest as
 * flat values, resolved from the active side. The alternative was to thread a side through every
 * signature in the app to serve one view, which is a worse trade in both directions: it would make
 * every caller state something only one of them has an opinion about.
 *
 * THE ORDER OF THE TWO FETCHES IS LOAD-BEARING. The pixel size has to arrive before the
 * annotations, because the text formats store NORMALIZED coordinates and the reader needs the
 * dimensions to turn them back into pixels. Loading them the other way round, or in parallel and
 * taking whichever wins, silently rescales every polygon.
 *
 * `provenance` is tracked rather than inferred from the segment count, which is the distinction
 * `saveState.ts` depends on: an image with no annotation file and an image whose annotations could
 * not be READ both have zero segments, and only one of them is safe to write over.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { decodeMask, type WireDatasetImage, type WireImageMetadata, type WireSegment } from "@lazylabel/contracts";
import { rasterizeSegment, type BinaryMask } from "@lazylabel/annotation-formats";

import type { AnnotationsResult, ApiClient } from "../api/client.js";
import { History } from "./history.js";
import { onNavigateAway, provenanceFromLoad, type ImageState } from "./saveState.js";
import { toggle } from "../tools/selection.js";
import type { Crop } from "../tools/crop.js";
import { NO_PROCESSING, type ImageProcessing } from "./processing.js";
import { linkedAdd, linkedClass, linkedErase, type LinkedAdd } from "../split/linkedAdd.js";
import { erase, type EraseResult } from "../tools/erase.js";
import { chooseMode, toggleMode, type ModeState } from "../tools/modes.js";
import type { ImageSize } from "../split/linked.js";

/** Every tool the workspace offers. */
export type Tool = "none" | "select" | "polygon" | "box" | "circle" | "ai" | "crop" | "pan";

/**
 * Which of the two slots. Two rather than a list, because two is what exists: legacy's four-view
 * setting was a control over two viewers, and a list would invite a third with nothing to show in
 * it.
 */
export type SideIndex = 0 | 1;

/** What an open can carry beyond the image itself. */
export interface OpenOptions {
  /**
   * Segments to show INSTEAD of the ones the file holds — RULE-090's propagated masks.
   *
   * An override rather than a merge, because that is what the rule says: fresh propagated masks
   * first, else the annotation file. Merging would put the model's guess and the user's own
   * drawing on the same image with no way to tell them apart.
   */
  readonly segments?: readonly WireSegment[];
  /**
   * Open without saving or asking about what the side holds, which is lost: legacy's reload of the
   * image from disk when the Sequence tab is left (`main_window.py:3043-3056, 7242-7272`), by the
   * owner's decision of 2026-09-26 (SEQUENCE_PARITY.md SP-15). The only other caller is Save All's
   * reload of a frame that shows nothing but a finished run's masks, which it has just written.
   */
  readonly discard?: boolean;
  /**
   * The Multi view's save of both sides (`savePair`) has run for this move already, so the open
   * does not run it again (CONTROL_PARITY.md CP-67). The pair's next and previous pass it, and the
   * store does for a move it held for that save.
   */
  readonly pairSaved?: boolean;
  /**
   * Leave the side's image unsaved if it is UNCHANGED: a changed one is still saved or asked
   * about. For Build Timeline's open of frame 1, which legacy makes without its leaving save
   * (`main_window.py:4981-4994, 3424-3427`; `sequence_view_mode.py:130`), and for the move a save
   * held, made once that save has written.
   */
  readonly keepUnchanged?: boolean;
}

export const SIDES: readonly SideIndex[] = [0, 1];

export interface OpenImage {
  readonly image: WireDatasetImage;
  /**
   * Which open this is: a number no earlier open had, kept while the image loads. Opening the same
   * image again gets a new one, so the Sequence tab can tell an open from a load (SP-55).
   */
  readonly serial: number;
  /** Null until the metadata arrives. */
  readonly metadata: WireImageMetadata | null;
  /** Null until the annotations arrive, or when opening failed before they could. */
  readonly result: AnnotationsResult | null;
  /** Set when the image could not be opened at all. */
  readonly error: string | null;
}

/**
 * Everything that belongs to ONE open image.
 *
 * One record rather than seven parallel values, which is what these were. The crop is the reason
 * it matters: it lives here and inside `processing`, and as two `useState` calls keeping them in
 * step was a rule someone had to remember. In one record it is one assignment.
 */
export interface SideState {
  readonly open: OpenImage | null;
  /**
   * The annotations as they stand now, which is not what the file said once anything is drawn.
   *
   * Seeded from the load and then owned here. Reading them back off `open.result` instead would
   * make the loaded file the source of truth for something the user has since changed.
   */
  readonly segments: readonly WireSegment[];
  /**
   * Class names by id, as this image's file holds them. Under decision 6 these are PER IMAGE, so
   * the same name can be a different id on the other side.
   */
  readonly classAliases: Readonly<Record<string, string>>;
  /** Cleared on a successful save; that is what makes it mean "differs from the file". */
  readonly dirty: boolean;
  /**
   * Which annotations are selected, by POSITION in `segments`.
   *
   * Positions rather than identities because that is what legacy uses and what every operation on
   * a selection takes. The cost is that any change to the list can invalidate it, which is why
   * `applySegments` clears it rather than letting a stale index reach a merge or a delete.
   */
  readonly selected: readonly number[];
  /** The crop in force, or null for none — RULE-018, a P0 rule. */
  readonly crop: Crop | null;
  /** What the server should do to the image before sending it — RULE-029 and RULE-032. */
  readonly processing: ImageProcessing;
  /**
   * CSS pixels per image pixel, or null to fit the pane.
   *
   * Per image, like the crop and the processing, and for the same reason: a 4x zoom that suits a
   * 200-pixel thumbnail fills the screen with one corner of a 4000-pixel scan.
   *
   * Null is the default and is not "1". Fitting is what the app did before there was a zoom and
   * is what a user wants on opening an image; 1:1 on a large scan shows a corner of it.
   */
  readonly zoom: number | null;
  /**
   * The revision each annotation file was last read or written at, which the next save is
   * conditional on.
   *
   * Here rather than in the save button, which held it until 2026-09-24. The button remounts --
   * when the view moves between the centre tabs, or the other side of a pair is made active and
   * then this one again -- and a revision forgotten there turned the next save into a conflict
   * with the app's own previous write.
   */
  readonly revisions: Readonly<Record<string, string | null>>;
}

const EMPTY_SIDE: SideState = {
  open: null,
  segments: [],
  classAliases: {},
  dirty: false,
  selected: [],
  crop: null,
  processing: NO_PROCESSING,
  zoom: null,
  revisions: {},
};

/**
 * What an undo entry says it touches, so opening an image into one side forgets that side's edits
 * and leaves the other side's alone.
 *
 * A string rather than the index itself because `History` takes the caller's word for a scope and
 * has no idea what a side is -- see its `clear`.
 */
export function sideScope(side: SideIndex): string {
  return `side:${side}`;
}

/**
 * What the last linked-capable action did, for the split view to show.
 *
 * Held here rather than pushed to the notification system on purpose. A refusal is about the pair
 * the user is looking at -- "that shape does not fit the other image" -- and belongs beside the
 * two panes, not in a list at the top of the page competing with save failures.
 */
/** What one save wrote, by reference: every edit replaces these, so identity is the test. */
export interface WrittenState {
  readonly segments: readonly WireSegment[];
  readonly classAliases: Readonly<Record<string, string>>;
  readonly crop: Crop | null;
  /** Which image the save was of, and the revisions it produced, once the server has said. */
  readonly key?: string;
  readonly revisions?: Readonly<Record<string, string>>;
  /**
   * The save found no segments and DELETED the image's seven sidecars, as legacy's does (RULE-083).
   * The files' revisions go with them. And it is not a save for the sequence timeline: legacy marks
   * an emptied frame neither saved nor anything else, so it keeps its status and its propagated
   * masks, and Save All writes them back (`main_window.py:3499-3515`; SEQUENCE_PARITY.md SP-58).
   */
  readonly deleted?: boolean;
  /**
   * The save was of an image the user had not changed, made on leaving it (`onNavigateAway`). Not a
   * save for the sequence timeline either: a frame it counted would lose its pending masks unseen.
   */
  readonly unchanged?: boolean;
}

/**
 * The save a side's save button makes, lent to the store so that LEAVING the side can save it
 * first: legacy's Auto-Save on Navigate, restored by the owner's decision of 2026-09-25.
 *
 * Lent rather than rebuilt here, because the button's save IS the save -- its formats, its
 * revisions, its refusal to write over annotations that could not be read. A second copy is how
 * legacy came to have several save paths doing different bookkeeping for the same act.
 */
export interface LeaveSave {
  /** `auto_save`, as the button read it: whether leaving the side saves it first. */
  readonly enabled: boolean;
  /** The save Enter makes. Resolves whether it wrote; a refusal is shown where Enter's is. */
  readonly save: () => Promise<boolean>;
  /**
   * The same save of an image the user has NOT changed, which legacy's leaving save makes too. A
   * write refused because someone else changed the file is skipped and said, as is any failure,
   * and it resolves true: there is no work of this session to keep the user on the image for.
   */
  readonly saveUnchanged?: () => Promise<boolean>;
  /**
   * Legacy's multi-view save of ONE side, either side, which `savePair` runs for both
   * (CONTROL_PARITY.md CP-67): Enter's request for that side's image, or its seven sidecars deleted
   * when it has no segments; silent when it works, as legacy's is. Resolves whether the side is safe
   * to leave -- true too for a side with nothing it may save: none loaded, or annotations that
   * could not be read, which are never written over or deleted (SEC-04).
   */
  readonly saveSide?: (side: SideIndex) => Promise<boolean>;
}

export type LinkReport =
  | { readonly kind: "linked"; readonly classId: number; readonly allocated: boolean; readonly image: string }
  | {
      readonly kind: "refused";
      readonly reason: string;
      readonly erase?: boolean;
      /** The image it WAS done in, when that is the other one; the one being edited when absent. */
      readonly where?: string;
    }
  | { readonly kind: "erased"; readonly image: string; readonly count: number };

/** What one erase did, so the caller can say it: legacy's "No segments to erase", and the pieces lost. */
export type EraseOutcome =
  /** The eraser covers no pixels at all -- a degenerate shape. */
  | { readonly kind: "empty-shape" }
  /** It overlapped no annotation, in this image or, when linked, the other. */
  | { readonly kind: "nothing" }
  | {
      readonly kind: "erased";
      /** Annotations cut, across both images when linked. */
      readonly erased: number;
      /** Of those, how many vanished entirely under RULE-009's ten-pixel floor. */
      readonly vanished: number;
      readonly bothImages: boolean;
      /** Annotations cut in each image, by side: legacy names each viewer an erase reached. */
      readonly bySide: readonly [number, number];
    };

/** One side's new annotation list, for `applySegmentsOn`. */
export interface SideSegments {
  readonly side: SideIndex;
  readonly segments: readonly WireSegment[];
}

export interface WorkspaceContextValue {
  /** Both slots, for the split view. Everything below resolves from `sides[activeSide]`. */
  readonly sides: readonly [SideState, SideState];
  /**
   * Whether one annotation drawn in either image should land in BOTH — C14, RULE-092 — and one AI
   * prompt be asked of both. Only in the Multi tab, where legacy's link lives.
   *
   * ON by default, as legacy's pair starts (multi_view_coordinator.py:46), by the owner's word of
   * 2026-09-27: the Multi tab exists to prompt the AI at the same coordinates in both images. It
   * was off before, when an annotation appearing in the image not being looked at was judged to
   * need an explicit act; the Linked box beside the panes is in plain sight either way.
   */
  readonly linked: boolean;
  readonly setLinked: (linked: boolean) => void;
  /** What the last linked-capable action did, or null when nothing has been tried. */
  readonly linkReport: LinkReport | null;
  /** Which side the single-image components act on. */
  readonly activeSide: SideIndex;
  readonly setActiveSide: (side: SideIndex) => void;
  /**
   * Whether the Multi tab is on screen, set by the split view while it is mounted -- legacy's
   * `view_mode == "multi"`. While it is, the keys legacy applies to both viewers act on both sides
   * (CONTROL_PARITY.md CP-31), and a linked pair shares its selection and its class names.
   */
  readonly multiView: boolean;
  readonly setMultiView: (showing: boolean) => void;

  readonly open: OpenImage | null;
  /** Open into the active side. */
  readonly openImage: (image: WireDatasetImage, options?: OpenOptions) => void;
  /** Open into a named side, without changing which side is active. */
  readonly openImageOn: (side: SideIndex, image: WireDatasetImage, options?: OpenOptions) => void;
  /**
   * Empty a side and forget its edits -- after asking, when that would lose unsaved work.
   *
   * Needed the moment a second side can be opened: a split view that returns to one image must
   * leave nothing behind, and a side still holding unsaved work that nothing displays is decision
   * 7's silent loss by another route. So is emptying it without a word, which it did until
   * 2026-09-23. Returns whether the side was closed.
   */
  readonly closeSide: (side: SideIndex) => boolean;
  /**
   * Leave every open side as a move to another image leaves it, opening nothing: saved first with
   * Auto-Save on Navigate on (both at once in the Multi view, as a pair move saves them), asked about
   * otherwise. What Open Image Folder does before the folder changes, since afterwards an image's key
   * names a file in the new folder. Resolves whether every side may be left.
   */
  readonly leaveAll: () => Promise<boolean>;
  /**
   * Empty both sides and forget their edits, asking nothing: what Open Image Folder does once the
   * folder has changed, after `leaveAll` has saved or asked about them.
   */
  readonly closeAll: () => void;
  /** Lend the store a side's save, for leaving that side (`LeaveSave`). Returns its withdrawal. */
  readonly registerSave: (side: SideIndex, lend: () => LeaveSave) => () => void;
  /**
   * Legacy's multi-view save, `_save_multi_view_annotations` (`main_window.py:6559-6636`): both
   * sides, in order, changed or not and whatever Auto-Save on Navigate says, an empty side's seven
   * sidecars deleted without a word -- what legacy runs before every pair move, even one that then
   * finds the end of the list (6496-6497, 6529-6530; CONTROL_PARITY.md CP-67). Resolves whether
   * both are safe to leave, once the render that shows the saves is done, so what the caller does
   * next reads them. With no save lent, nothing is saved, and it resolves true: each open then asks
   * about its side as any open does.
   */
  readonly savePair: () => Promise<boolean>;
  /**
   * The derived answer the save path and the status bar need: what is open, is it saved, is it
   * safe to write. Null while nothing is open or the open image is still loading.
   */
  readonly imageState: ImageState | null;
  /** The same for both sides, so a caller that must not lose work can ask about all of it. */
  readonly imageStates: readonly [ImageState | null, ImageState | null];
  readonly segments: readonly WireSegment[];
  /** Add an annotation, recording it so it can be undone and marking the image unsaved. */
  readonly addSegment: (segment: WireSegment, label?: string) => void;
  /**
   * Erase with a shape or a mask in this image -- and, while linked, at the same pixels in the
   * other (RULE-092). One recorded step either way, and one undo takes both back.
   *
   * The eraser is a SEGMENT for the reason addSegment takes one: a drawn polygon, a box, a circle
   * and an AI mask accepted in erase mode all arrive in that shape, so linking is decided once,
   * here, and no tool has to know a pair exists.
   */
  readonly eraseWith: (eraser: WireSegment) => EraseOutcome;
  /**
   * Add EACH image's own annotation, by side, as ONE recorded step: a linked pair's AI accept.
   *
   * Nothing is mirrored. Each image's model answered the same prompt about its own pixels, and
   * each keeps its own answer, as legacy's viewers do (ai_segment_manager.py:321-381). Only the
   * class crosses: both arrive with the class chosen in the image being edited, and the other
   * image files its own under the class of the same NAME there (`linkedClass`). Either may be null.
   */
  readonly addEach: (bySide: readonly [WireSegment | null, WireSegment | null], label?: string) => void;
  /** Erase each image with its OWN eraser, by side, as one recorded step: the linked AI erase. */
  readonly eraseEach: (bySide: readonly [WireSegment | null, WireSegment | null]) => EraseOutcome;
  /**
   * Add each image's OWN annotation, by side, as ONE recorded step, with nothing mirrored and no
   * class crossing: an unlinked pair's polygons finished together by Space, each with its own image's
   * class, as legacy finishes every viewer's polygon (keyboard_event_manager.py:118-123;
   * main_window.py:6938-7020). Either may be null; the other side is the one NOT being edited.
   */
  readonly addOwn: (bySide: readonly [WireSegment | null, WireSegment | null], label?: string) => void;
  /** Erase each image with its own shape, by side, as one step: an unlinked pair's Shift+Space. */
  readonly eraseOwn: (bySide: readonly [WireSegment | null, WireSegment | null]) => EraseOutcome;
  /**
   * Replace one annotation in place, recording it.
   *
   * Separate from `addSegment` because an edit has to restore the PREVIOUS value on undo, not
   * remove the entry -- undoing a moved vertex must put the vertex back, not delete the shape.
   */
  readonly updateSegment: (index: number, segment: WireSegment, label?: string) => void;
  /**
   * Replace annotations in place, by position, keeping the selection: what dragging in Edit mode
   * does to the shapes it moves.
   *
   * WITHOUT `record` THE CHANGE IS LIVE AND NOT RECORDED. Legacy moves the shape under the pointer
   * as it is dragged (editable_vertex.py:30-37, single_view_mouse_handler.py:183-197) and records
   * the gesture once, on release. A history entry per pointer event would make undo crawl back
   * through the drag. A live change leaves "unsaved" alone, so a drag abandoned with Escape leaves
   * the image as it found it.
   *
   * WITH `record`, ONE entry is recorded, whose undo puts back `record.before` -- the shapes as they
   * were before the drag, which the store can no longer see, because the live changes replaced
   * them. That is why this is not `updateSegment`, which records whatever the list held a moment
   * ago as the thing to go back to.
   *
   * Only while the image the change was made on is still open: a drag abandoned by opening another
   * image must not land in it.
   */
  readonly replaceSegments: (
    changes: ReadonlyMap<number, WireSegment>,
    record?: { readonly label: string; readonly before: ReadonlyMap<number, WireSegment> },
  ) => void;
  readonly history: History;
  /** Cleared on a successful save; that is what makes `dirty` mean "differs from the file". */
  readonly markSaved: () => void;
  /**
   * The same for a named side, which is what a split view's two save paths need.
   *
   * Given what the save WROTE, it clears "unsaved" only if that is still what the side holds. A
   * save is a round trip, and an edit made while it is in flight is not in the file: clearing the
   * flag regardless is how Enter -- which finishes a polygon and saves in one keystroke -- once left
   * an empty file on disk and the word "saved" on screen.
   */
  readonly markSavedOn: (side: SideIndex, written?: WrittenState) => void;
  /**
   * How many times each image has been saved this session by the ordinary save, by key. The
   * sequence timeline reads it: a propagated frame saved here is the user's correction, and Save All
   * must not write the run's masks over it (SEQUENCE_PARITY.md SP-02).
   */
  readonly saveCounts: ReadonlyMap<string, number>;
  /**
   * How many writes this session were not saves for the timeline: a save that deleted an image's
   * files (SP-58), and one of an image left unchanged (`WrittenState.unchanged`). Not in
   * `saveCounts`, which the timeline reads as "saved"; the file list reads both, to re-read its
   * format columns.
   */
  readonly quietWrites: number;
  /** The active side's file revisions, which its next save is conditional on. */
  readonly revisions: Readonly<Record<string, string | null>>;
  /**
   * Which drawing tool is in force.
   *
   * "none" rather than defaulting to a tool, because a canvas that starts in a drawing mode turns
   * the first click of a session -- often a click to look at something -- into an annotation.
   *
   * Held for the WORKSPACE rather than per side: a tool is what the user's hand is doing, and
   * picking the polygon tool and then clicking the other pane should draw a polygon.
   */
  readonly activeTool: Tool;
  /** Legacy's `set_mode`: what AI, Polygon, Box and Circle do. Records the tool left (RULE-070). */
  readonly setActiveTool: (tool: Tool) => void;
  /**
   * Legacy's `toggle_mode`, what Select (E), Pan (Q) and Edit (R) do: the tool, or the one before it
   * when the tool is already in force -- RULE-070, by the owner's decision of 2026-09-26.
   */
  readonly toggleTool: (tool: Tool) => void;
  /** The class new annotations take, or null to use the next free id. */
  readonly activeClassId: number | null;
  readonly setActiveClassId: (classId: number | null) => void;
  /** Legacy's toggle_active_class: active if it was not, inactive if it was. True when now active. */
  readonly toggleActiveClass: (classId: number) => boolean;
  /**
   * Legacy's X (RULE-086): toggle the class most recently made active or used by a new annotation.
   * With none yet on this image, the first class present -- the lowest id, or with pixel priority
   * descending the highest. Null when the image has no classes.
   *
   * It swapped between the current class and the one before it until 2026-09-25, which is not
   * what the rule says or legacy does (`CONTROL_PARITY.md` CP-23).
   */
  readonly toggleRecentClass: (
    fallback?: "lowest" | "highest",
  ) => { readonly classId: number; readonly active: boolean } | null;
  readonly selected: readonly number[];
  /**
   * Select or deselect one annotation. This one, `setSelection` and `clearSelection` are the
   * selection a user makes, so while a linked pair is on screen the other image takes the same
   * rows, as legacy's does (CP-31).
   */
  readonly toggleSelected: (index: number) => void;
  /**
   * Replace the whole selection — what Select All needs.
   *
   * Not recorded in history, like the other two: legacy does not make a selection undoable and a
   * user pressing undo after selecting everything means to undo their last EDIT, not the click.
   */
  readonly setSelection: (indices: readonly number[]) => void;
  readonly clearSelection: () => void;
  /** Replace a named side's selection, and only that side's: what the keys acting on a pair need. */
  readonly setSelectionOn: (side: SideIndex, indices: readonly number[]) => void;
  /**
   * Replace the whole annotation list in one recorded step.
   *
   * Merge, erase and delete each touch several entries at once, and inverting them individually is
   * far more delicate than restoring the list that was there. A snapshot's cost is one array of
   * references -- the segments themselves are shared, not copied.
   */
  readonly applySegments: (next: readonly WireSegment[], label: string) => void;
  /**
   * The same for named sides, as ONE recorded step: what Delete and Merge do to a pair in the Multi
   * view, where legacy's keys act on both viewers (CP-31). One key press, one undo. Each side
   * changed loses its selection, as `applySegments` clears it.
   */
  readonly applySegmentsOn: (changes: readonly SideSegments[], label: string) => void;
  readonly classAliases: Readonly<Record<string, string>>;
  /**
   * Rename one class, or clear the name with an empty string. Recorded, and marks the image unsaved.
   *
   * While a linked pair is on screen, the class of the same NAME in the other image is renamed too,
   * in the same step: legacy mirrors a rename to the other viewer (main_window.py:6392-6425).
   */
  readonly setClassAlias: (classId: number, name: string) => void;
  /** Renumber classes and rename them together, as RULE-013's reassign does. */
  readonly applyClasses: (
    segments: readonly WireSegment[],
    aliases: Readonly<Record<string, string>>,
    label: string,
  ) => void;
  /**
   * The crop in force, or null for none — RULE-018, a P0 rule.
   *
   * Held here rather than in the panel because the SAVE path reads it: a crop blanks every mask
   * pixel outside it on write, so a crop the save request does not carry is a crop that silently
   * does nothing, and one the panel forgets to clear is work deleted without anyone asking.
   *
   * Under decision 9 it does NOT carry over between images. Legacy keeps it, so a crop set on a
   * wide image and forgotten blanks most of the next, narrow one.
   */
  readonly crop: Crop | null;
  readonly setCrop: (crop: Crop | null) => void;
  /**
   * What the server should do to the image before sending it — RULE-029 and RULE-032.
   *
   * Held here rather than in the panel because the CANVAS reads it: these rules run before the
   * 16-bit to 8-bit conversion, so the browser cannot apply them and can only ask. Per image, like
   * the crop: a rescale window that suits one scan blanks the next.
   */
  readonly processing: ImageProcessing;
  readonly setProcessing: (processing: ImageProcessing) => void;
  /**
   * How far in the image is drawn — CSS pixels per image pixel, or null to fit the pane.
   *
   * Not a display adjustment: those change what the pixels LOOK like and this changes how many of
   * them you can see at once. An annotator zooms to place a vertex on a boundary, which at the
   * fitted size of a large scan is guesswork -- and the browser's own zoom scales the panels too.
   */
  readonly zoom: number | null;
  readonly setZoom: (zoom: number | null) => void;
  /** The same for a named side: fitting a pair fits both viewers, as legacy's does (CP-31). */
  readonly setZoomOn: (side: SideIndex, zoom: number | null) => void;
  /**
   * The scale the open image is drawn at while `zoom` is null: the pane's size over the image's,
   * scaling up as well as down, as legacy's `fitInView` does. Null until the view has measured its
   * pane.
   *
   * The zoom buttons step from this. Stepping from 1 instead would make "zoom in" SHRINK a small
   * image that fitting had enlarged past 200%.
   */
  readonly fitted: number | null;
  readonly setFitted: (scale: number | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  client,
  projectId,
  children,
  confirmNavigation = (summary) => window.confirm(summary),
}: {
  readonly client: ApiClient;
  readonly projectId: string;
  readonly children: ReactNode;
  /**
   * Asked before unsaved work would be discarded. Returns whether to go ahead.
   *
   * Injectable so a test can answer it without a browser dialog, and so a future in-page prompt
   * can replace the blunt one without touching this file. A `window.confirm` because it BLOCKS:
   * decision 7 wants an explicit act, and a banner the user can scroll past while the annotations
   * are already gone is not one.
   */
  readonly confirmNavigation?: (summary: string) => boolean;
}): ReactNode {
  const [sides, setSides] = useState<readonly [SideState, SideState]>([EMPTY_SIDE, EMPTY_SIDE]);
  const [activeSide, setActiveSide] = useState<SideIndex>(0);
  // The last open's `serial`.
  const serials = useRef(0);
  /*
   * The tool and the one before it, legacy's `mode` and `previous_mode`, which Select, Pan and Edit
   * go back to (RULE-070; `tools/modes.ts` has legacy's rules). One record, so the two cannot be a
   * render apart. Nothing precedes the first tool, so going back from it stays put.
   *
   * THE FIRST TOOL IS POLYGON, as legacy's: AI when a model is loaded, else Polygon, and models load
   * lazily, so a session starts on Polygon (main_window.py:1098-1102). It was Edit until 2026-09-27.
   */
  const [mode, setMode] = useState<ModeState>({ tool: "polygon", previous: "polygon" });
  const activeTool = mode.tool;
  const setActiveTool = useCallback((tool: Tool) => setMode((current) => chooseMode(current, tool)), []);
  const toggleTool = useCallback((tool: Tool) => setMode((current) => toggleMode(current, tool)), []);
  const [activeClassId, setActiveClassIdState] = useState<number | null>(null);
  /*
   * Legacy's `last_toggled_class_id`, for its X (RULE-086): the class most recently made active or
   * inactive, or used by a new annotation (segment_manager.py:18, 42, 409-419).
   *
   * A ref rather than state: nothing renders from it, and making it state would re-render every
   * consumer of this context each time the active class changed -- which is all eight of them, for
   * a value none of them reads.
   */
  const lastToggledClassId = useRef<number | null>(null);

  const setActiveClassId = useCallback((classId: number | null) => {
    if (classId !== null) lastToggledClassId.current = classId;
    setActiveClassIdState(classId);
  }, []);

  /** Legacy's toggle_active_class: active if it was not, inactive if it was. True when now active. */
  const toggleActiveClass = useCallback(
    (classId: number): boolean => {
      lastToggledClassId.current = classId;
      const activating = activeClassId !== classId;
      setActiveClassIdState(activating ? classId : null);
      return activating;
    },
    [activeClassId],
  );
  const toggleRecentClass = useCallback(
    (fallback: "lowest" | "highest" = "lowest") => {
      const present = [
        ...new Set(
          sides[activeSide].segments
            .map((segment) => segment.classId)
            .filter((classId): classId is number => classId !== null && classId !== undefined),
        ),
      ].sort((a, b) => a - b);
      const classId =
        lastToggledClassId.current ?? (fallback === "highest" ? present[present.length - 1] : present[0]) ?? null;
      if (classId === null) return null;
      return { classId, active: toggleActiveClass(classId) };
    },
    [activeSide, sides, toggleActiveClass],
  );

  // Legacy's recent class belongs to the image: opening another clears it (RULE-086's edge cases).
  const openKey = sides[activeSide].open?.image.key;
  useEffect(() => {
    lastToggledClassId.current = null;
  }, [openKey]);

  /** How many times each image has been saved this session by the ordinary save, by key. */
  const [saveCounts, setSaveCounts] = useState<ReadonlyMap<string, number>>(new Map());
  const [quietWrites, setQuietWrites] = useState(0);
  // Linked from the start, as legacy's pair is (multi_view_coordinator.py:46; the owner, 2026-09-27).
  const [linked, setLinked] = useState(true);
  // The split view says so while it is mounted (`multiView` on the context).
  const [multiView, setMultiView] = useState(false);
  /**
   * Whether what is done to one side is done to the other too: its annotations, erasers, selection
   * and class names. Only while the Multi tab shows the pair, where legacy's link lives -- with the
   * link on from the start, a second image left open behind the Single tab would otherwise take
   * every shape drawn there.
   */
  const mirroring = linked && multiView;
  const [linkReport, setLinkReport] = useState<LinkReport | null>(null);
  // Measured by the view, which is the only thing that knows the pane's size.
  const [fitted, setFitted] = useState<number | null>(null);

  // One History for the session, scoped per side: RULE-052 scopes undo to the open image, so an
  // undo after switching must not reach back into the previous one's edits. With two sides that
  // means clearing one side's entries and keeping the other's, which is what `sideScope` is for.
  const history = useMemo(() => new History(), []);

  const updateSide = useCallback(
    (side: SideIndex, change: (current: SideState) => SideState) => {
      setSides((current): readonly [SideState, SideState] => {
        const next = change(current[side]);
        // The SAME tuple back when nothing changed, so a no-op update does not re-render every
        // consumer of the context -- which is all eight of them.
        if (next === current[side]) return current;
        return side === 0 ? [next, current[1]] : [current[0], next];
      });
    },
    [],
  );

  /** Each side's lent save (`LeaveSave`), or null while no save button shows that side. */
  const savers = useRef<[(() => LeaveSave) | null, (() => LeaveSave) | null]>([null, null]);
  const registerSave = useCallback((side: SideIndex, lend: () => LeaveSave) => {
    savers.current[side] = lend;
    return () => {
      if (savers.current[side] === lend) savers.current[side] = null;
    };
  }, []);
  /** The move each side is making once the save leaving it has written, or null. */
  const leaving = useRef<[Leaving | null, Leaving | null]>([null, null]);
  /** Counts saves written on the way out, so the effect below runs after each one's render. */
  const [leaveWritten, setLeaveWritten] = useState(0);

  /*
   * LEGACY'S MULTI-VIEW SAVE (`savePair` on the context): both sides through the lent `saveSide`,
   * one after the other, each attempted whatever the other did, as legacy's loop does
   * (main_window.py:6581-6636). A call while one is being written waits for that one.
   *
   * Each caller is answered after the render that shows what was written, through the effect
   * below: the next thing a caller does -- a move, a closed side -- must see the sides saved, and a
   * promise settled straight from the write would hand it the sides as they were before.
   */
  const pairSaving = useRef<Promise<boolean> | null>(null);
  const pairWaiting = useRef<{ readonly answer: (saved: boolean) => void; saved: boolean | null }[]>([]);
  const [pairWritten, setPairWritten] = useState(0);
  /** The lent save of one side, from whichever save button is mounted, or undefined with none. */
  const pairSaver = useCallback(
    (): ((side: SideIndex) => Promise<boolean>) | undefined =>
      SIDES.map((each) => savers.current[each]?.().saveSide).find((lent) => lent !== undefined),
    [],
  );
  /** Auto-Save on Navigate, as the mounted save button reads it; off when none is mounted. */
  const autoSaveOn = useCallback(
    (): boolean => SIDES.map((each) => savers.current[each]?.()).find((lent) => lent !== undefined)?.enabled === true,
    [],
  );
  const savePair = useCallback((): Promise<boolean> => {
    const saveSide = pairSaver();
    if (saveSide === undefined) return Promise.resolve(true);
    return new Promise<boolean>((answer) => {
      pairWaiting.current.push({ answer, saved: null });
      if (pairSaving.current !== null) return;
      const saving = (async () => {
        const saved: boolean[] = [];
        for (const each of SIDES) saved.push(await saveSide(each));
        return saved.every(Boolean);
      })();
      pairSaving.current = saving;
      void saving.then((saved) => {
        pairSaving.current = null;
        for (const waiter of pairWaiting.current) {
          if (waiter.saved === null) waiter.saved = saved;
        }
        setPairWritten((count) => count + 1);
      });
    });
  }, [pairSaver]);
  useEffect(() => {
    const answered = pairWaiting.current.filter((waiter) => waiter.saved !== null);
    pairWaiting.current = pairWaiting.current.filter((waiter) => waiter.saved === null);
    for (const waiter of answered) waiter.answer(waiter.saved === true);
  }, [pairWritten]);

  /*
   * A MOVE OUT OF A SIDE: into `image`, or, with null, into no image at all, which is what opening
   * another folder does to each side before the folder changes (`leaveAll`). Both take the one
   * leaving step below, the save or the question; `done` hears whether the side was left, once it
   * has been, for a caller that waits on it.
   */
  const moveSide = useCallback(
    (side: SideIndex, image: WireDatasetImage | null, options?: OpenOptions, done?: (left: boolean) => void) => {
      // The save leaving this side is still being written: go where the user asked LAST, once it is.
      const waiting = leaving.current[side];
      if (waiting !== null) {
        waiting.done?.(false);
        waiting.image = image;
        waiting.options = options;
        waiting.done = done;
        return;
      }

      /*
       * IN THE MULTI VIEW, WITH AUTO-SAVE ON NAVIGATE ON, A MOVE SAVES BOTH SIDES FIRST, changed or
       * not, and a side with no segments has its seven sidecars deleted without a word: legacy's
       * multi-view save, run before every pair move (main_window.py:6496-6497, 6529-6530;
       * file_navigation_manager.py:401-403; CONTROL_PARITY.md CP-67). Legacy runs it whatever the
       * setting says; the owner, 2026-09-26: saving on a move is "only if the user has the save on
       * navigation setting turned on". With it off, each side is asked about as in the Single view.
       * A file chosen in the list and a new partner chosen for the pair come here; the pair's next
       * and previous run `savePair` themselves, before they know whether anything moves, and say so
       * with `pairSaved`.
       *
       * The move waits for the save. One that fails keeps the pair where it is, with the reason
       * said, where legacy logs it and moves on. Once both are written the move is made, and the
       * side asked about as any move asks -- which, both being saved, is nothing, unless the side
       * was edited while the save was in flight or could not be read.
       */
      if (
        multiView
        && options?.discard !== true
        && options?.pairSaved !== true
        && autoSaveOn()
        && pairSaver() !== undefined
      ) {
        const held: Leaving = { image, options, written: false, done };
        leaving.current[side] = held;
        void savePair().then((saved) => {
          if (leaving.current[side] !== held) return;
          leaving.current[side] = null;
          if (saved) moveLatest.current(side, held.image, { ...held.options, pairSaved: true }, held.done);
          else held.done?.(false);
        });
        return;
      }

      /*
       * WHAT IS ON THIS SIDE IS ABOUT TO BE THROWN AWAY, so it is saved first, or asked about.
       *
       * Saved: legacy's Auto-Save on Navigate, on by default, saves the image being left before
       * loading the next (file_navigation_manager.py:270-274), and the owner decided on 2026-09-25
       * that "moving should save if save on move setting is turned on". The save is the side's own
       * save button's, lent through `registerSave`, and the move waits for it: a save that fails
       * keeps the image open, with the reason on the button. Never for annotations that could not
       * be read -- `onNavigateAway` asks about those whatever the setting says.
       *
       * Asked: with the setting off, or no button to lend the save. Discarding the work without a
       * word, as legacy does then, is decision 7's silent loss.
       *
       * Neither, for an open that DISCARDS: legacy's reload on leaving the Sequence tab (SP-15).
       *
       * CHANGED OR NOT, with the setting on: legacy saves whenever an image is open
       * (file_navigation_manager.py:156-160, 270-274; main_window.py:3480-3520), so an image left
       * as it was loaded has Enter's request written again, newly selected formats and all, or its
       * files deleted when it has no segments. The owner, 2026-09-26: "Match the desktop app
       * exactly". Except where legacy makes no such save: reopening the image already open (its
       * `path == current_image_path` return, 153-154 and 267-268), a move whose save has run
       * already (`pairSaved`, `keepUnchanged`), and Build Timeline's open (`keepUnchanged`). An
       * unchanged image's refused write is said and skipped, and the move goes on.
       */
      const discard = options?.discard === true;
      const saver = discard ? null : (savers.current[side]?.() ?? null);
      const decision = discard
        ? ({ kind: "proceed" } as const)
        : onNavigateAway(stateOf(sides[side]), { saveOnNavigate: saver?.enabled === true });
      const unsavedAgain =
        decision.kind === "save"
        && !decision.changed
        && (options?.pairSaved === true
          || options?.keepUnchanged === true
          || (image !== null && sides[side].open?.image.key === image.key));
      const save =
        decision.kind !== "save" || saver === null || unsavedAgain
          ? null
          : decision.changed
            ? saver.save
            : (saver.saveUnchanged ?? null);
      if (save !== null) {
        const held: Leaving = { image, options, written: false, done };
        leaving.current[side] = held;
        void save().then((written) => {
          if (leaving.current[side] !== held) return;
          if (!written) {
            leaving.current[side] = null;
            held.done?.(false);
            return;
          }
          held.written = true;
          setLeaveWritten((count) => count + 1);
        });
        return;
      }
      const going = image === null ? "Open another folder anyway?" : `Open ${image.name} anyway?`;
      if (decision.kind === "ask" && !confirmNavigation(`${decision.summary} ${going}`)) {
        done?.(false);
        return;
      }
      // Left for no image: the caller empties the side once the folder has changed (`closeAll`).
      if (image === null) {
        done?.(true);
        return;
      }

      // Cleared first, so a slow open cannot leave the previous image's annotations on screen
      // under the new image's name -- which is the shape of legacy's most expensive bug, where the
      // current path is committed before the decode succeeds.
      //
      // Decision 9 is in this one assignment: the crop and the processing chain do NOT carry over.
      // Legacy keeps them, so a crop set on a wide image and forgotten blanks most of the next,
      // narrow one, and a rescale window that suits one scan makes the next one black.
      const serial = (serials.current += 1);
      updateSide(side, () => ({ ...EMPTY_SIDE, open: { image, serial, metadata: null, result: null, error: null } }));
      // RULE-052: history is cleared when an image loads. An undo that reached into the previous
      // image's edits would apply them to annotations that are not on screen. Scoped, so opening
      // into one side does not throw away what the user drew on the other.
      history.clear(sideScope(side));

      client
        .imageMetadata(projectId, image.key)
        .then(async (metadata) => {
          const result = await client.loadAnnotations(projectId, image.key, [
            metadata.height,
            metadata.width,
          ]);
          // Keyed on the image, so a slow open that finishes after the user moved on is discarded
          // rather than applied to whatever is now in front of them.
          //
          // The annotations land in the SAME assignment as the result they came from, so the two
          // can never be one render out of step.
          updateSide(side, (current) => {
            if (current.open?.image.key !== image.key) return current;
            return {
              ...current,
              open: { ...current.open, metadata, result },
              /*
               * RULE-090: a frame with fresh PROPAGATED masks shows those, not the file.
               *
               * Which is what makes the results reviewable at all. Without it a propagation put
               * colours on the timeline and a Save button on screen, and opening one of the frames
               * it had just produced a mask for showed whatever the sidecar held -- nothing, for a
               * frame never annotated. The masks could be saved without ever being looked at.
               *
               * Never on a reference frame: that is the user's own drawing, and replacing it with
               * the model's reconstruction of it is the one thing propagation must not do.
               */
              segments:
                options?.segments ?? (result.kind === "loaded" ? result.annotations.segments : []),
              classAliases: result.kind === "loaded" ? result.annotations.classAliases : {},
              // Only the file the annotations came from: it is the one whose contents the user is
              // editing, and the only revision the load returns.
              revisions:
                result.kind === "loaded" && result.annotations.sourceFormat !== ""
                  ? { [result.annotations.sourceFormat]: result.annotations.revision }
                  : {},
              // Propagated masks are UNSAVED work the moment they are shown, so the status bar,
              // the close guard and the navigation guard all count them -- which is the whole of
              // decision 7 applied to a mask the user did not draw by hand.
              dirty: options?.segments !== undefined,
            };
          });
        })
        .catch((cause: unknown) => {
          const error = cause instanceof Error ? cause.message : String(cause);
          updateSide(side, (current) =>
            current.open?.image.key === image.key
              ? { ...current, open: { ...current.open, error } }
              : current,
          );
        });
    },
    [client, confirmNavigation, history, multiView, pairSaver, projectId, savePair, sides, updateSide],
  );

  /*
   * THE MOVE A SAVE WAS HOLDING, made after the render that save produced, and decided again there
   * rather than assumed: an edit made while the write was in flight leaves the side unsaved, and is
   * then saved too instead of being discarded. Through a ref, so this runs once per written save.
   */
  const moveLatest = useRef(moveSide);
  moveLatest.current = moveSide;
  useEffect(() => {
    for (const side of SIDES) {
      const held = leaving.current[side];
      if (held === null || !held.written) continue;
      leaving.current[side] = null;
      // Saved once on this move: an image unchanged since is not written a second time.
      moveLatest.current(side, held.image, { ...held.options, keepUnchanged: true }, held.done);
    }
  }, [leaveWritten]);

  const openImageOn = useCallback(
    (side: SideIndex, image: WireDatasetImage, options?: OpenOptions) => moveSide(side, image, options),
    [moveSide],
  );

  const openImage = useCallback(
    (image: WireDatasetImage, options?: OpenOptions) => openImageOn(activeSide, image, options),
    [activeSide, openImageOn],
  );

  const closeSide = useCallback(
    (side: SideIndex): boolean => {
      // The question opening another image asks, because closing is navigation too. Until
      // 2026-09-23 it asked nothing, so "None -- one image" discarded the second side's work.
      // Never a save, even with Auto-Save on: legacy saves when moving to another image or pair,
      // and has no act of closing a viewer to save on (main_window.py:6491-6530).
      const decision = onNavigateAway(stateOf(sides[side]), { saveOnNavigate: false });
      if (decision.kind === "ask" && !confirmNavigation(`${decision.summary} Close it anyway?`)) {
        return false;
      }
      updateSide(side, () => EMPTY_SIDE);
      history.clear(sideScope(side));
      // A move this side was saving for would reopen it once the write lands.
      leaving.current[side]?.done?.(false);
      leaving.current[side] = null;
      return true;
    },
    [confirmNavigation, history, sides, updateSide],
  );

  /*
   * OPEN IMAGE FOLDER'S TWO HALVES (the owner, 2026-09-29): every side left the way a move leaves it,
   * through `moveSide` into no image, before the folder changes; then, once it has, both emptied with
   * nothing asked, since their images are in the folder no longer open. Both sides at once, so a
   * Multi pair joins the one pair save (`savePair`), as its move does.
   */
  const leaveAll = useCallback(
    (): Promise<boolean> =>
      Promise.all(
        SIDES.filter((side) => sides[side].open !== null).map(
          (side) => new Promise<boolean>((resolve) => moveSide(side, null, undefined, resolve)),
        ),
      ).then((left) => left.every(Boolean)),
    [moveSide, sides],
  );

  const closeAll = useCallback(() => {
    for (const side of SIDES) {
      leaving.current[side]?.done?.(false);
      leaving.current[side] = null;
      history.clear(sideScope(side));
    }
    setSides([EMPTY_SIDE, EMPTY_SIDE]);
    setActiveSide(0);
    setLinkReport(null);
  }, [history]);

  const imageStates = useMemo<readonly [ImageState | null, ImageState | null]>(
    () => [stateOf(sides[0]), stateOf(sides[1])],
    [sides],
  );

  // What the single-image components read. Flat, exactly as they read it when there was one image.
  const { open, segments, classAliases, selected, crop, processing, zoom, revisions } =
    sides[activeSide];
  const imageState = imageStates[activeSide];

  const addSegment = useCallback(
    (segment: WireSegment, label = "Add annotation") => {
      // Adding an annotation USES its class, which makes it the class X toggles, as legacy's
      // add_segment does (segment_manager.py:42; RULE-086).
      if (segment.classId !== null && segment.classId !== undefined) lastToggledClassId.current = segment.classId;
      // Recorded OUTSIDE the state updater. React may invoke an updater more than once for one
      // call -- StrictMode does it deliberately -- and recording inside would push two history
      // entries for one drawn polygon, so the first undo would appear to do nothing.
      const at = activeSide;
      const other = (at === 0 ? 1 : 0) as SideIndex;
      const source = sides[at];
      const target = sides[other];
      const index = source.segments.length;

      /*
       * THE LINKED HALF -- C14, RULE-092. One annotation drawn once, landing in both images.
       *
       * Decided here rather than in the drawing tools, and that is the whole reason this is cheap:
       * every drawing tool and the hotkeys reach the store through this one function, so none of
       * them has to know a pair exists. `linkedAdd` holds the rules and the refusals. A linked AI
       * accept does not come here: each image keeps its own model's answer (`addEach`).
       */
      const sourceSize = sizeOf(source);
      const targetSize = sizeOf(target);
      const plan =
        mirroring && target.open !== null && sourceSize !== null && targetSize !== null
          ? linkedAdd(
              { segment, aliases: source.classAliases, size: sourceSize },
              { segments: target.segments, aliases: target.classAliases, size: targetSize },
            )
          : null;
      const mirrored = plan !== null && plan.kind === "linked" ? plan : null;
      const targetIndex = target.segments.length;
      const targetAliasesBefore = target.classAliases;

      const insert = () => {
        updateSide(at, (current) => ({
          ...current,
          segments: [...current.segments.slice(0, index), segment, ...current.segments.slice(index)],
          dirty: true,
        }));
        if (mirrored === null) return;
        updateSide(other, (current) => ({
          ...current,
          segments: [
            ...current.segments.slice(0, targetIndex),
            mirrored.segment,
            ...current.segments.slice(targetIndex),
          ],
          classAliases: mirrored.aliases,
          dirty: true,
        }));
      };
      const remove = () => {
        updateSide(at, (current) => ({
          ...current,
          segments: current.segments.filter((_, i) => i !== index),
          dirty: true,
        }));
        if (mirrored === null) return;
        updateSide(other, (current) => ({
          ...current,
          segments: current.segments.filter((_, i) => i !== targetIndex),
          // The alias table as it was, not merely the one name removed: linking may have written
          // nothing at all, and deleting a name the other image already had would take a class
          // name away from annotations that were there before this stroke.
          classAliases: targetAliasesBefore,
          dirty: true,
        }));
      };

      insert();
      setLinkReport(reportFor(plan, mirrored, target.open?.image.name ?? ""));

      // Keyed on the index it lands at, which is what legacy records too
      // (`polygon_drawing_manager.py:205-211`). Safe against later edits shifting it because
      // RULE-052 clears the redo stack on any new action: between an undo and its redo, the only
      // possible operations are other undos, which unwind in order.
      //
      // The SIDE is captured as a value, not read back when the undo runs. An undo puts the shape
      // back where it was drawn, not wherever the user happens to be looking.
      //
      // ONE ENTRY FOR A LINKED PAIR, scoped to both sides. The user performed one action, so one
      // press of undo takes it back everywhere -- and clearing either side drops the entry,
      // because half of its inverse would be restoring a shape into an image that has closed.
      history.record({
        label: mirrored === null ? label : `${label} (both images)`,
        // Not doubled for a link: the mirrored segment shares the source's mask by reference, so
        // the only new bytes are the segment wrapper itself.
        bytes: estimateBytes(segment) + (mirrored === null ? 0 : 64),
        scope: mirrored === null ? [sideScope(at)] : [sideScope(at), sideScope(other)],
        undo: remove,
        redo: insert,
      });
    },
    [activeSide, history, mirroring, sides, updateSide],
  );

  /*
   * A LINKED PAIR'S AI ACCEPT: each image's own answer to the one prompt, in its own image, as ONE
   * recorded step whose undo takes both back. Legacy records one step per viewer
   * (ai_segment_manager.py:371-381); one here, as a linked shape is one, because the user pressed
   * Space once. Only the class crosses (`linkedClass`).
   */
  const addEach = useCallback(
    (bySide: readonly [WireSegment | null, WireSegment | null], label = "Accept AI mask") => {
      const at = activeSide;
      const other = otherSide(at);
      const here = bySide[at];
      const source = sides[at];
      const target = sides[other];
      const plan =
        bySide[other] === null || target.open === null
          ? null
          : linkedClass(bySide[other]!, source.classAliases, {
              segments: target.segments,
              aliases: target.classAliases,
            });
      const there = plan !== null && plan.kind === "linked" ? plan : null;
      if (here === null && there === null) return;

      // Accepting USES the class, which makes it the class X toggles (RULE-086), as addSegment does.
      const used = here?.classId ?? null;
      if (used !== null) lastToggledClassId.current = used;

      recordEach(updateSide, history, { at, sides }, here, there, label);

      const targetName = target.open?.image.name ?? "";
      setLinkReport(
        here !== null && there !== null
          ? { kind: "linked", classId: there.classId, allocated: there.allocated, image: targetName }
          : here !== null
            ? { kind: "refused", reason: plan?.kind === "refused" ? plan.reason : `no prediction in ${targetName}` }
            : { kind: "refused", reason: "no prediction in this image", where: targetName },
      );
    },
    [activeSide, history, sides, updateSide],
  );

  /*
   * AN UNLINKED PAIR'S POLYGONS, finished by one Space: each image's own shape, in its own image,
   * under the class it chose there, as ONE recorded step. Legacy finishes each viewer's polygon on
   * its own (keyboard_event_manager.py:118-123) and records none of them; one step here, as the
   * user pressed one key. Nothing crosses between the images, so no report beside the panes.
   */
  const addOwn = useCallback(
    (bySide: readonly [WireSegment | null, WireSegment | null], label = "Add annotation") => {
      const at = activeSide;
      const other = otherSide(at);
      const here = bySide[at];
      const target = sides[other];
      const there = bySide[other] === null || target.open === null ? null : { segment: bySide[other]!, aliases: target.classAliases };
      if (here === null && there === null) return;
      const used = here?.classId ?? there?.segment.classId ?? null;
      if (used !== null) lastToggledClassId.current = used;
      recordEach(updateSide, history, { at, sides }, here, there, label);
      setLinkReport(null);
    },
    [activeSide, history, sides, updateSide],
  );

  const updateSegment = useCallback(
    (index: number, segment: WireSegment, label = "Edit annotation") => {
      const previous = segments[index];
      if (previous === undefined) return;
      // Nothing changed: recording it would put an entry on the stack whose undo is invisible,
      // and a user pressing undo would think the key had stopped working.
      if (previous === segment) return;
      const at = activeSide;

      const replace = (value: WireSegment) =>
        updateSide(at, (current) => ({
          ...current,
          segments: current.segments.map((entry, i) => (i === index ? value : entry)),
          dirty: true,
        }));

      replace(segment);
      history.record({
        label,
        bytes: estimateBytes(segment),
        scope: [sideScope(at)],
        undo: () => replace(previous),
        redo: () => replace(segment),
      });
    },
    [activeSide, history, segments, updateSide],
  );

  const openKeyNow = open?.image.key;
  const replaceSegments = useCallback(
    (
      changes: ReadonlyMap<number, WireSegment>,
      record?: { readonly label: string; readonly before: ReadonlyMap<number, WireSegment> },
    ) => {
      const at = activeSide;
      const key = openKeyNow;

      const put = (values: ReadonlyMap<number, WireSegment>, recorded: boolean) =>
        updateSide(at, (current) => {
          if (current.open?.image.key !== key) return current;
          let changed = false;
          const next = current.segments.map((entry, i) => {
            const value = values.get(i);
            if (value === undefined || value === entry) return entry;
            changed = true;
            return value;
          });
          // The recorded step marks the image unsaved even when the live changes already put these
          // very shapes in place: they are what it records.
          const dirty = current.dirty || recorded;
          if (!changed && dirty === current.dirty) return current;
          return { ...current, segments: changed ? next : current.segments, dirty };
        });

      put(changes, record !== undefined);
      if (record === undefined) return;

      const before = record.before;
      history.record({
        label: record.label,
        bytes: [...changes.values()].reduce((total, segment) => total + estimateBytes(segment), 0),
        scope: [sideScope(at)],
        undo: () => put(before, true),
        redo: () => put(changes, true),
      });
    },
    [activeSide, history, openKeyNow, updateSide],
  );

  /*
   * THE SELECTION A USER MAKES, and while a linked pair is on screen, the other image's too: legacy
   * replaces the other viewer's selection with the rows selected in this one, those it has, whenever
   * this one's changes -- from its table or from a click on the image (main_window.py:2414-2423,
   * 6194-6209, 6284-6319). Rows there are the annotations in order, so a row is a position here.
   * Both sides change in one update, so they are never a render apart; a selection that does not
   * change sends nothing across, as Qt signals nothing then.
   */
  const select = useCallback(
    (change: (current: readonly number[]) => readonly number[]) => {
      const at = activeSide;
      const other = otherSide(at);
      setSides((current): readonly [SideState, SideState] => {
        const indices = change(current[at].selected);
        const here = withSelection(current[at], indices);
        if (here === current[at]) return current;
        const there =
          mirroring && current[other].open !== null
            ? withSelection(current[other], indices.filter((index) => index < current[other].segments.length))
            : current[other];
        return at === 0 ? [here, there] : [there, here];
      });
    },
    [activeSide, mirroring],
  );

  const toggleSelected = useCallback(
    (index: number) => select((current) => toggle(current, index)),
    [select],
  );

  const setSelection = useCallback((indices: readonly number[]) => select(() => indices), [select]);

  const clearSelection = useCallback(() => select(() => []), [select]);

  const setSelectionOn = useCallback(
    (side: SideIndex, indices: readonly number[]) =>
      updateSide(side, (current) => withSelection(current, indices)),
    [updateSide],
  );

  const eraseWith = useCallback(
    (eraser: WireSegment): EraseOutcome => {
      const at = activeSide;
      const other = (at === 0 ? 1 : 0) as SideIndex;
      const source = sides[at];
      const target = sides[other];
      const sourceSize = sizeOf(source);
      if (sourceSize === null) return { kind: "nothing" };

      const hereMask = maskOf(eraser, sourceSize);
      if (hereMask === null) return { kind: "empty-shape" };
      const here = erase(source.segments, hereMask, sourceSize);

      /*
       * THE LINKED HALF, RULE-092: the same pixels in the other image. Legacy mirrors erasing as it
       * mirrors adding -- Shift+Space finishes the polygon in both linked viewers, and an AI mask
       * accepted in erase mode is applied to both. Refused, and said beside the panes, exactly
       * where an added shape would be: outside the other image, or a mask across two sizes.
       */
      const targetSize = sizeOf(target);
      const plan =
        mirroring && target.open !== null && targetSize !== null
          ? linkedErase(eraser, sourceSize, targetSize)
          : null;
      let there: EraseResult | null = null;
      if (plan !== null && plan.kind === "linked" && targetSize !== null) {
        const thereMask = maskOf(plan.eraser, targetSize);
        if (thereMask !== null) there = erase(target.segments, thereMask, targetSize);
      }
      setLinkReport(
        plan === null
          ? null
          : plan.kind === "refused"
            ? { kind: "refused", reason: plan.reason, erase: true }
            : { kind: "erased", image: target.open?.image.name ?? "", count: there?.erased.length ?? 0 },
      );

      return recordErase(updateSide, history, { at, before: [source.segments, target.segments] }, here, there);
    },
    [activeSide, history, mirroring, sides, updateSide],
  );

  /*
   * A LINKED PAIR'S AI ERASE, Shift+Space: each image cut by its OWN prediction's mask, as legacy
   * erases each target viewer with its own preview (ai_segment_manager.py:341-360). Nothing is
   * mirrored, so two images of different sizes erase too. One recorded step, as eraseWith's.
   */
  const eraseBySide = useCallback(
    (bySide: readonly [WireSegment | null, WireSegment | null], linkedAi: boolean): EraseOutcome => {
      const at = activeSide;
      const other = otherSide(at);
      const source = sides[at];
      const target = sides[other];
      const cut = (side: SideState, eraser: WireSegment | null): EraseResult | null => {
        const size = sizeOf(side);
        if (eraser === null || size === null || side.open === null) return null;
        const mask = maskOf(eraser, size);
        return mask === null ? null : erase(side.segments, mask, size);
      };
      const here = cut(source, bySide[at]);
      const there = cut(target, bySide[other]);
      if (here === null && there === null) return { kind: "empty-shape" };

      // What the other image took, beside the panes, as legacy names each viewer an erase reached
      // (main_window.py:6985-6988). The linked AI erase says so when that image had no prediction.
      const targetName = target.open?.image.name ?? "";
      setLinkReport(
        there !== null
          ? { kind: "erased", image: targetName, count: there.erased.length }
          : linkedAi
            ? { kind: "refused", reason: `no prediction in ${targetName}`, erase: true }
            : null,
      );

      return recordErase(updateSide, history, { at, before: [source.segments, target.segments] }, here, there);
    },
    [activeSide, history, sides, updateSide],
  );
  const eraseEach = useCallback(
    (bySide: readonly [WireSegment | null, WireSegment | null]) => eraseBySide(bySide, true),
    [eraseBySide],
  );
  // An unlinked pair's Shift+Space: each image's own polygon erases in it (keyboard_event_manager.py:157-163).
  const eraseOwn = useCallback(
    (bySide: readonly [WireSegment | null, WireSegment | null]) => eraseBySide(bySide, false),
    [eraseBySide],
  );

  const applySegments = useCallback(
    (next: readonly WireSegment[], label: string) => {
      const previous = segments;
      if (next === previous) return;
      const at = activeSide;

      const apply = (value: readonly WireSegment[]) =>
        updateSide(at, (current) => ({
          ...current,
          segments: value,
          dirty: true,
          // Cleared rather than remapped. Merge keeps positions, erase does not, and delete shifts
          // them -- one rule that is always safe beats three that each have to be right.
          selected: [],
        }));

      apply(next);
      history.record({
        label,
        // Only what this step introduced: the segments it shares with the previous list are not
        // retained by it, and counting them would shrink the usable history for no reason.
        bytes: next.reduce(
          (total, segment) => total + (previous.includes(segment) ? 0 : estimateBytes(segment)),
          0,
        ),
        scope: [sideScope(at)],
        undo: () => apply(previous),
        redo: () => apply(next),
      });
    },
    [activeSide, history, segments, updateSide],
  );

  const applySegmentsOn = useCallback(
    (changes: readonly SideSegments[], label: string) => {
      // The sides this step changes, each once, with what each held before it.
      const applied = SIDES.flatMap((side) => {
        const change = changes.find((entry) => entry.side === side);
        return change === undefined || change.segments === sides[side].segments
          ? []
          : [{ side, next: change.segments, previous: sides[side].segments }];
      });
      if (applied.length === 0) return;

      const put = (pick: (entry: (typeof applied)[number]) => readonly WireSegment[]) => {
        for (const entry of applied) {
          updateSide(entry.side, (current) => ({ ...current, segments: pick(entry), dirty: true, selected: [] }));
        }
      };

      put((entry) => entry.next);
      history.record({
        label,
        bytes: applied.reduce(
          (total, { next, previous }) =>
            total + next.reduce((sum, segment) => sum + (previous.includes(segment) ? 0 : estimateBytes(segment)), 0),
          0,
        ),
        // Every side it changed, so closing either drops it: half an inverse would put annotations
        // back into an image that is no longer open.
        scope: applied.map(({ side }) => sideScope(side)),
        undo: () => put((entry) => entry.previous),
        redo: () => put((entry) => entry.next),
      });
    },
    [history, sides, updateSide],
  );

  const setClassAlias = useCallback(
    (classId: number, name: string) => {
      const key = String(classId);
      const previous = classAliases;
      const trimmed = name.trim();
      const at = activeSide;

      // An empty name CLEARS the entry rather than storing "". A blank alias would export as a
      // class literally named nothing, which is worse than falling back to the id.
      const next = { ...previous };
      if (trimmed === "") delete next[key];
      else next[key] = trimmed;

      if (previous[key] === next[key]) return;

      /*
       * LINKED, THE OTHER IMAGE'S CLASS IS RENAMED TOO, as legacy mirrors a rename to the other
       * viewer (main_window.py:6392-6425) -- the class with the same NAME there, which legacy finds
       * by id. A linked pair here agrees on names while each image keeps its own ids (RULE-092's
       * answer, `split/linked.ts`), so the same id in the other image can be a different class, and
       * renaming it would put this class's name on it. An image with no class of that name has
       * nothing to rename.
       */
      const other = otherSide(at);
      const there = sides[other];
      const theirs = mirroring && there.open !== null ? classNamed(there, previous[key] ?? key) : null;
      const thereBefore = there.classAliases;
      let thereAfter: Readonly<Record<string, string>> | null = null;
      if (theirs !== null) {
        const renamed = { ...thereBefore };
        if (trimmed === "") delete renamed[String(theirs)];
        else renamed[String(theirs)] = trimmed;
        if (renamed[String(theirs)] !== thereBefore[String(theirs)]) thereAfter = renamed;
      }

      const apply = (value: Readonly<Record<string, string>>, valueThere: Readonly<Record<string, string>> | null) => {
        updateSide(at, (current) => ({ ...current, classAliases: value, dirty: true }));
        if (thereAfter !== null && valueThere !== null) {
          updateSide(other, (current) => ({ ...current, classAliases: valueThere, dirty: true }));
        }
      };

      apply(next, thereAfter);
      const action = trimmed === "" ? `Clear the name of class ${classId}` : `Rename class ${classId}`;
      history.record({
        label: thereAfter === null ? action : `${action} (both images)`,
        bytes: 64,
        scope: thereAfter === null ? [sideScope(at)] : [sideScope(at), sideScope(other)],
        undo: () => apply(previous, thereBefore),
        redo: () => apply(next, thereAfter),
      });
    },
    [activeSide, classAliases, history, mirroring, sides, updateSide],
  );

  const applyClasses = useCallback(
    (
      nextSegments: readonly WireSegment[],
      nextAliases: Readonly<Record<string, string>>,
      label: string,
    ) => {
      const previousSegments = segments;
      const previousAliases = classAliases;
      const at = activeSide;

      const apply = (
        theSegments: readonly WireSegment[],
        theAliases: Readonly<Record<string, string>>,
      ) =>
        updateSide(at, (current) => ({
          ...current,
          segments: theSegments,
          classAliases: theAliases,
          dirty: true,
          selected: [],
        }));

      apply(nextSegments, nextAliases);
      history.record({
        label,
        bytes: 64,
        scope: [sideScope(at)],
        undo: () => apply(previousSegments, previousAliases),
        redo: () => apply(nextSegments, nextAliases),
      });
    },
    [activeSide, classAliases, history, segments, updateSide],
  );

  // The crop is held in BOTH the side's `crop` and its `processing`, and deliberately: the save
  // path reads `crop`, and the processing chain is restricted to the same region (RULE-029 and
  // RULE-032 both say so). One assignment now sets both, which is what stops the view being
  // processed over one rectangle while the save blanks another.
  //
  // A crop applied or cleared drops a CLAHE preset, as legacy's does: its picture was computed on
  // the region the crop had then (main_window.py:2837-2845). An equalization table is kept.
  const setCrop = useCallback(
    (next: Crop | null) =>
      updateSide(activeSide, (current) => ({
        ...current,
        crop: next,
        processing: {
          ...current.processing,
          crop: next,
          preset: current.processing.preset?.kind === "clahe" ? null : current.processing.preset,
        },
      })),
    [activeSide, updateSide],
  );

  const setProcessing = useCallback(
    (next: ImageProcessing) =>
      updateSide(activeSide, (current) => ({ ...current, crop: next.crop, processing: next })),
    [activeSide, updateSide],
  );

  const setZoom = useCallback(
    (next: number | null) => updateSide(activeSide, (current) => ({ ...current, zoom: next })),
    [activeSide, updateSide],
  );

  const setZoomOn = useCallback(
    (side: SideIndex, next: number | null) =>
      updateSide(side, (current) => (current.zoom === next ? current : { ...current, zoom: next })),
    [updateSide],
  );

  const markSavedOn = useCallback(
    (at: SideIndex, written?: WrittenState) => {
      // Counted per image, for the sequence timeline: a propagated frame saved here is the user's
      // correction, which Save All must not write over (SEQUENCE_PARITY.md SP-02). A deletion is not
      // counted: legacy leaves an emptied frame's status and masks as they were (SP-58). Nor is the
      // save of an image left unchanged: a pending frame it counted would lose its masks unseen.
      const quiet = written?.deleted === true || written?.unchanged === true;
      const savedKey = quiet ? undefined : written?.key;
      if (savedKey !== undefined) {
        setSaveCounts((previous) => new Map(previous).set(savedKey, (previous.get(savedKey) ?? 0) + 1));
      }
      if (quiet) setQuietWrites((count) => count + 1);
      updateSide(at, (current) => {
        // The revisions are the FILE's, so they move on even when an edit landed during the
        // round trip: the next write is conditional on what is on disk now. Only for the image
        // the save was of -- a side that has since opened another keeps that one's. Deleted files
        // have none: the next write expects nothing, as for an image that never had a file.
        const ofThisImage = written?.key !== undefined && current.open?.image.key === written.key;
        const revisions =
          ofThisImage && written.deleted === true
            ? {}
            : ofThisImage && written.revisions !== undefined
              ? { ...current.revisions, ...written.revisions }
              : current.revisions;
        const editedSince =
          written !== undefined
          && (current.segments !== written.segments
            || current.classAliases !== written.classAliases
            || current.crop !== written.crop);
        if (editedSince) return revisions === current.revisions ? current : { ...current, revisions };
        return { ...current, revisions, dirty: false };
      });
    },
    [updateSide],
  );

  const markSaved = useCallback(() => markSavedOn(activeSide), [activeSide, markSavedOn]);

  const value = useMemo(
    () => ({
      sides,
      saveCounts,
      quietWrites,
      linked,
      setLinked,
      linkReport,
      activeSide,
      setActiveSide,
      multiView,
      setMultiView,
      open,
      openImage,
      openImageOn,
      closeSide,
      leaveAll,
      closeAll,
      registerSave,
      savePair,
      imageState,
      imageStates,
      segments,
      addSegment,
      eraseWith,
      addEach,
      eraseEach,
      addOwn,
      eraseOwn,
      updateSegment,
      replaceSegments,
      history,
      markSaved,
      markSavedOn,
      revisions,
      activeTool,
      setActiveTool,
      toggleTool,
      activeClassId,
      setActiveClassId,
      toggleActiveClass,
      toggleRecentClass,
      selected,
      toggleSelected,
      setSelection,
      clearSelection,
      setSelectionOn,
      applySegments,
      applySegmentsOn,
      classAliases,
      setClassAlias,
      applyClasses,
      crop,
      setCrop,
      processing,
      setProcessing,
      zoom,
      setZoom,
      setZoomOn,
      fitted,
      setFitted,
    }),
    [
      activeClassId,
      activeSide,
      activeTool,
      addSegment,
      addEach,
      addOwn,
      applyClasses,
      applySegments,
      eraseWith,
      eraseEach,
      eraseOwn,
      classAliases,
      fitted,
      clearSelection,
      closeSide,
      leaveAll,
      closeAll,
      crop,
      history,
      imageState,
      imageStates,
      linkReport,
      linked,
      markSaved,
      markSavedOn,
      open,
      openImage,
      openImageOn,
      processing,
      registerSave,
      replaceSegments,
      revisions,
      savePair,
      segments,
      selected,
      setClassAlias,
      setCrop,
      setProcessing,
      setSelection,
      setZoom,
      sides,
      saveCounts,
      quietWrites,
      zoom,
      setActiveTool,
      toggleTool,
      multiView,
      setSelectionOn,
      applySegmentsOn,
      setZoomOn,
      toggleActiveClass,
      toggleRecentClass,
      toggleSelected,
      updateSegment,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (value === null) throw new Error("useWorkspace needs a WorkspaceProvider above it");
  return value;
}

/** The side that is not this one. */
function otherSide(side: SideIndex): SideIndex {
  return side === 0 ? 1 : 0;
}

/** The side with this selection, or the same side when it already has it. */
function withSelection(side: SideState, indices: readonly number[]): SideState {
  const same = indices.length === side.selected.length && indices.every((index, at) => side.selected[at] === index);
  return same ? side : { ...side, selected: indices };
}

/**
 * The class this side calls `name`, or null when it has none: a class named so, or, since an
 * unnamed class's name is its id, an unnamed class of that id with annotations here.
 */
function classNamed(side: SideState, name: string): number | null {
  for (const [id, alias] of Object.entries(side.classAliases)) {
    if (alias === name) return Number(id);
  }
  const id = Number(name);
  if (!Number.isInteger(id) || String(id) !== name || side.classAliases[name] !== undefined) return null;
  return side.segments.some((segment) => segment.classId === id) ? id : null;
}

/**
 * Each image's own new annotation, put at the end of its list as ONE recorded step whose undo takes
 * back both: `here` in the side being edited, `at`, and `there` in the other, with the other image's
 * class names as they are to be after it -- a linked accept may name a class there, and its undo
 * puts back the names that image had. Either may be null.
 */
function recordEach(
  updateSide: (side: SideIndex, change: (current: SideState) => SideState) => void,
  history: History,
  pair: { readonly at: SideIndex; readonly sides: readonly [SideState, SideState] },
  here: WireSegment | null,
  there: { readonly segment: WireSegment; readonly aliases: Readonly<Record<string, string>> } | null,
  label: string,
): void {
  const { at, sides } = pair;
  const other = otherSide(at);
  const index = sides[at].segments.length;
  const targetIndex = sides[other].segments.length;
  const targetAliasesBefore = sides[other].classAliases;
  const insert = () => {
    if (here !== null) {
      updateSide(at, (current) => ({
        ...current,
        segments: [...current.segments.slice(0, index), here, ...current.segments.slice(index)],
        dirty: true,
      }));
    }
    if (there === null) return;
    updateSide(other, (current) => ({
      ...current,
      segments: [...current.segments.slice(0, targetIndex), there.segment, ...current.segments.slice(targetIndex)],
      classAliases: there.aliases,
      dirty: true,
    }));
  };
  const remove = () => {
    if (here !== null) {
      updateSide(at, (current) => ({
        ...current,
        segments: current.segments.filter((_, i) => i !== index),
        dirty: true,
      }));
    }
    if (there === null) return;
    updateSide(other, (current) => ({
      ...current,
      segments: current.segments.filter((_, i) => i !== targetIndex),
      classAliases: targetAliasesBefore,
      dirty: true,
    }));
  };
  insert();

  const both = here !== null && there !== null;
  history.record({
    label: both ? `${label} (both images)` : label,
    bytes: (here === null ? 0 : estimateBytes(here)) + (there === null ? 0 : estimateBytes(there.segment)),
    // Every side it changed, so closing either drops it: half an inverse would take an annotation
    // out of an image that is no longer open.
    scope: [...(here === null ? [] : [sideScope(at)]), ...(there === null ? [] : [sideScope(other)])],
    undo: remove,
    redo: insert,
  });
}

/**
 * What an erase cut from this side and, when linked, the other, applied as ONE recorded step: one
 * undo puts back both. `before` is each side's annotations as they stood, by side from `at`.
 */
function recordErase(
  updateSide: (side: SideIndex, change: (current: SideState) => SideState) => void,
  history: History,
  pair: { readonly at: SideIndex; readonly before: readonly [readonly WireSegment[], readonly WireSegment[]] },
  here: EraseResult | null,
  there: EraseResult | null,
): EraseOutcome {
  const { at } = pair;
  const other = otherSide(at);
  const [beforeHere, beforeThere] = pair.before;
  const hereChanged = here !== null && here.erased.length > 0;
  const thereChanged = there !== null && there.erased.length > 0;
  if (!hereChanged && !thereChanged) return { kind: "nothing" };

  const afterHere = here?.segments ?? beforeHere;
  const afterThere = there?.segments ?? beforeThere;
  const put = (side: SideIndex, value: readonly WireSegment[]) =>
    updateSide(side, (current) => ({
      ...current,
      segments: value,
      dirty: true,
      // Cleared rather than remapped, as applySegments does: erase does not keep positions.
      selected: [],
    }));
  const apply = () => {
    if (hereChanged) put(at, afterHere);
    if (thereChanged) put(other, afterThere);
  };
  const revert = () => {
    if (hereChanged) put(at, beforeHere);
    if (thereChanged) put(other, beforeThere);
  };
  apply();

  const count = (here?.erased.length ?? 0) + (there?.erased.length ?? 0);
  const where = thereChanged ? (hereChanged ? " (both images)" : " (the other image)") : "";
  const fresh = (next: readonly WireSegment[], previous: readonly WireSegment[]) =>
    next.reduce((total, segment) => total + (previous.includes(segment) ? 0 : estimateBytes(segment)), 0);
  history.record({
    label: `Erase from ${count} annotation${count === 1 ? "" : "s"}${where}`,
    bytes: (hereChanged ? fresh(afterHere, beforeHere) : 0) + (thereChanged ? fresh(afterThere, beforeThere) : 0),
    // Scoped to every side it changed, so closing either drops the entry: half an inverse
    // would restore annotations into an image that is no longer open.
    scope: [...(hereChanged ? [sideScope(at)] : []), ...(thereChanged ? [sideScope(other)] : [])],
    undo: revert,
    redo: apply,
  });

  const bySide: [number, number] = [0, 0];
  bySide[at] = here?.erased.length ?? 0;
  bySide[other] = there?.erased.length ?? 0;
  return {
    kind: "erased",
    erased: count,
    vanished: (here?.vanished.length ?? 0) + (there?.vanished.length ?? 0),
    bothImages: hereChanged && thereChanged,
    bySide,
  };
}

/** The pixels an eraser covers in an image of this size, or null when it covers none. */
function maskOf(eraser: WireSegment, size: ImageSize): BinaryMask | null {
  if (eraser.mask !== undefined) return decodeMask(eraser.mask);
  if (eraser.vertices === undefined) return null;
  return rasterizeSegment(
    { type: eraser.type, classId: null, vertices: eraser.vertices },
    size.height,
    size.width,
  );
}

/** The pixel size this side has been measured at, or null while it is still loading. */
function sizeOf(side: SideState): ImageSize | null {
  const metadata = side.open?.metadata;
  if (metadata === undefined || metadata === null) return null;
  return { width: metadata.width, height: metadata.height };
}

/** Turn what `linkedAdd` decided into what the split view should say about it. */
function reportFor(
  plan: LinkedAdd | null,
  mirrored: Extract<LinkedAdd, { kind: "linked" }> | null,
  image: string,
): LinkReport | null {
  // Not linking at all is not a report. Clearing it here is what stops a refusal from an earlier
  // pair sitting under a drawing that had nothing to do with it.
  if (plan === null) return null;
  if (mirrored === null) return plan as Extract<LinkedAdd, { kind: "refused" }>;
  return { kind: "linked", classId: mirrored.classId, allocated: mirrored.allocated, image };
}

/** A move waiting for the save leaving its side. Mutable: a later move replaces where it goes. */
interface Leaving {
  /** Where it goes: an image, or none, for another folder (`leaveAll`). */
  image: WireDatasetImage | null;
  options: OpenOptions | undefined;
  /** Set once the save has written, for the effect that then makes the move. */
  written: boolean;
  /** Told whether the side was left, for a caller that waits on it; false when a later move replaces it. */
  done: ((left: boolean) => void) | undefined;
}

/** What the save path and the status bar need to know about one side. */
function stateOf(side: SideState): ImageState | null {
  const { open, dirty, segments } = side;
  if (open === null) return null;

  if (open.error !== null) {
    return { key: open.image.key, provenance: "failed", dirty: false, segmentCount: 0 };
  }

  // Still opening. Reporting it as empty here is exactly the mistake that makes a failed load look
  // like a cleared image, so it reports nothing instead.
  if (open.result === null) return null;

  return {
    key: open.image.key,
    provenance: provenanceFromLoad(open.result.kind),
    dirty,
    // From the live segments, not from the file: once something is drawn they differ, and the
    // count is what the save prompt shows the user before they decide.
    segmentCount: segments.length,
  };
}

/**
 * Roughly what an annotation retains, so the undo stack can bound itself.
 *
 * A mask dominates when there is one; vertices are two numbers each. It does not need to be exact
 * -- the stack's limit is 256 MB and the point is that a thousand mask edits cannot sit in memory
 * unnoticed -- but it must never be zero, or a stack of them would never trim.
 */
function estimateBytes(segment: WireSegment): number {
  const mask = segment.mask === undefined ? 0 : segment.mask.data.length;
  const vertices = (segment.vertices?.length ?? 0) * 16;
  return 64 + mask + vertices;
}
