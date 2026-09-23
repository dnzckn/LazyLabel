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
import { linkedAdd, linkedErase, type LinkedAdd } from "../split/linkedAdd.js";
import { erase, type EraseResult } from "../tools/erase.js";
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
}

export const SIDES: readonly SideIndex[] = [0, 1];

export interface OpenImage {
  readonly image: WireDatasetImage;
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
export type LinkReport =
  | { readonly kind: "linked"; readonly classId: number; readonly allocated: boolean; readonly image: string }
  | { readonly kind: "refused"; readonly reason: string; readonly erase?: boolean }
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
    };

export interface WorkspaceContextValue {
  /** Both slots, for the split view. Everything below resolves from `sides[activeSide]`. */
  readonly sides: readonly [SideState, SideState];
  /**
   * Whether one annotation drawn in either image should land in BOTH — C14, RULE-092.
   *
   * OFF by default, which reverses the first split view's "starts linked, as legacy does".
   * Legacy's default does not bind here: decision 8 rebuilt multi-view from the rules rather than
   * porting a half-migrated feature, and this app's rule is that nothing reaches a file the user
   * did not act on. An annotation appearing in an image they were not looking at is exactly that.
   * Turning it on is one click, in the panel that made the pair.
   */
  readonly linked: boolean;
  readonly setLinked: (linked: boolean) => void;
  /** What the last linked-capable action did, or null when nothing has been tried. */
  readonly linkReport: LinkReport | null;
  /** Which side the single-image components act on. */
  readonly activeSide: SideIndex;
  readonly setActiveSide: (side: SideIndex) => void;

  readonly open: OpenImage | null;
  /** Open into the active side. */
  readonly openImage: (image: WireDatasetImage, options?: OpenOptions) => void;
  /** Open into a named side, without changing which side is active. */
  readonly openImageOn: (side: SideIndex, image: WireDatasetImage, options?: OpenOptions) => void;
  /**
   * Empty a side and forget its edits.
   *
   * Needed the moment a second side can be opened: a split view that returns to one image must
   * leave nothing behind, and a side still holding unsaved work that nothing displays is decision
   * 7's silent loss by another route.
   */
  readonly closeSide: (side: SideIndex) => void;
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
   * Replace one annotation in place, recording it.
   *
   * Separate from `addSegment` because an edit has to restore the PREVIOUS value on undo, not
   * remove the entry -- undoing a moved vertex must put the vertex back, not delete the shape.
   */
  readonly updateSegment: (index: number, segment: WireSegment, label?: string) => void;
  readonly history: History;
  /** Cleared on a successful save; that is what makes `dirty` mean "differs from the file". */
  readonly markSaved: () => void;
  /** The same for a named side, which is what a split view's two save paths need. */
  readonly markSavedOn: (side: SideIndex) => void;
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
  readonly setActiveTool: (tool: Tool) => void;
  /** The class new annotations take, or null to use the next free id. */
  readonly activeClassId: number | null;
  readonly setActiveClassId: (classId: number | null) => void;
  /**
   * Swap between the current class and the one before it — legacy's X.
   *
   * What makes it worth having is what annotators actually do: two classes at a time, alternating.
   * Cell and background, vehicle and road. Picking from a list every time is the friction this
   * removes, and a toggle with no memory would be a key that clears the class instead.
   */
  readonly toggleRecentClass: () => void;
  readonly selected: readonly number[];
  readonly toggleSelected: (index: number) => void;
  /**
   * Replace the whole selection — what Select All needs.
   *
   * Not recorded in history, like the other two: legacy does not make a selection undoable and a
   * user pressing undo after selecting everything means to undo their last EDIT, not the click.
   */
  readonly setSelection: (indices: readonly number[]) => void;
  readonly clearSelection: () => void;
  /**
   * Replace the whole annotation list in one recorded step.
   *
   * Merge, erase and delete each touch several entries at once, and inverting them individually is
   * far more delicate than restoring the list that was there. A snapshot's cost is one array of
   * references -- the segments themselves are shared, not copied.
   */
  readonly applySegments: (next: readonly WireSegment[], label: string) => void;
  readonly classAliases: Readonly<Record<string, string>>;
  /** Rename one class, or clear the name with an empty string. Recorded, and marks the image unsaved. */
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
  const [activeTool, setActiveTool] = useState<Tool>("none");
  const [activeClassId, setActiveClassIdState] = useState<number | null>(null);
  /*
   * The class before this one, for legacy's X.
   *
   * A ref rather than state: nothing renders from it, and making it state would re-render every
   * consumer of this context each time the active class changed -- which is all eight of them, for
   * a value none of them reads.
   */
  const previousClassId = useRef<number | null>(null);

  const setActiveClassId = useCallback((classId: number | null) => {
    setActiveClassIdState((current) => {
      // Recorded only when it CHANGES, so pressing the same class twice does not make the toggle a
      // no-op by remembering the class you are already on.
      if (current !== classId) previousClassId.current = current;
      return classId;
    });
  }, []);

  const toggleRecentClass = useCallback(() => setActiveClassId(previousClassId.current), [setActiveClassId]);
  const [linked, setLinked] = useState(false);
  const [linkReport, setLinkReport] = useState<LinkReport | null>(null);

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

  const openImageOn = useCallback(
    (side: SideIndex, image: WireDatasetImage, options?: OpenOptions) => {
      /*
       * WHAT IS ON THIS SIDE IS ABOUT TO BE THROWN AWAY, and until now nothing asked.
       *
       * Decision 7's whole subject: legacy auto-saves on navigation, which is how it deletes every
       * sidecar for an image whose segments happen to be empty, so this app does not save -- and
       * then discarded the work instead, silently, which is the same loss by the other route. Both
       * `onNavigateAway` and `onClose` were written for exactly this, tested, and called by
       * nothing.
       *
       * `saveOnNavigate: false` is not a setting read: `auto_save` is dropped under decision 7 and
       * the honoured list records why. Passing it explicitly keeps the rule visible here rather
       * than hiding it behind an absent key.
       */
      const decision = onNavigateAway(stateOf(sides[side]), { saveOnNavigate: false });
      if (decision.kind === "ask" && !confirmNavigation(`${decision.summary} Open ${image.name} anyway?`)) {
        return;
      }

      // Cleared first, so a slow open cannot leave the previous image's annotations on screen
      // under the new image's name -- which is the shape of legacy's most expensive bug, where the
      // current path is committed before the decode succeeds.
      //
      // Decision 9 is in this one assignment: the crop and the processing chain do NOT carry over.
      // Legacy keeps them, so a crop set on a wide image and forgotten blanks most of the next,
      // narrow one, and a rescale window that suits one scan makes the next one black.
      updateSide(side, () => ({ ...EMPTY_SIDE, open: { image, metadata: null, result: null, error: null } }));
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
    [client, confirmNavigation, history, projectId, sides, updateSide],
  );

  const openImage = useCallback(
    (image: WireDatasetImage, options?: OpenOptions) => openImageOn(activeSide, image, options),
    [activeSide, openImageOn],
  );

  const closeSide = useCallback(
    (side: SideIndex) => {
      updateSide(side, () => EMPTY_SIDE);
      history.clear(sideScope(side));
    },
    [history, updateSide],
  );

  const imageStates = useMemo<readonly [ImageState | null, ImageState | null]>(
    () => [stateOf(sides[0]), stateOf(sides[1])],
    [sides],
  );

  // What the single-image components read. Flat, exactly as they read it when there was one image.
  const { open, segments, classAliases, selected, crop, processing, zoom } = sides[activeSide];
  const imageState = imageStates[activeSide];

  const addSegment = useCallback(
    (segment: WireSegment, label = "Add annotation") => {
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
       * every tool, the AI prompt and the hotkeys all reach the store through this one function,
       * so none of them has to know a pair exists. `linkedAdd` holds the rules and the refusals.
       */
      const sourceSize = sizeOf(source);
      const targetSize = sizeOf(target);
      const plan =
        linked && target.open !== null && sourceSize !== null && targetSize !== null
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
    [activeSide, history, linked, sides, updateSide],
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

  const toggleSelected = useCallback(
    (index: number) =>
      updateSide(activeSide, (current) => ({ ...current, selected: toggle(current.selected, index) })),
    [activeSide, updateSide],
  );

  const setSelection = useCallback(
    (indices: readonly number[]) =>
      updateSide(activeSide, (current) => ({ ...current, selected: indices })),
    [activeSide, updateSide],
  );

  const clearSelection = useCallback(
    () => updateSide(activeSide, (current) => ({ ...current, selected: [] })),
    [activeSide, updateSide],
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
        linked && target.open !== null && targetSize !== null
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

      const hereChanged = here.erased.length > 0;
      const thereChanged = there !== null && there.erased.length > 0;
      if (!hereChanged && !thereChanged) return { kind: "nothing" };

      const beforeHere = source.segments;
      const beforeThere = target.segments;
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
        if (hereChanged) put(at, here.segments);
        if (thereChanged) put(other, afterThere);
      };
      const revert = () => {
        if (hereChanged) put(at, beforeHere);
        if (thereChanged) put(other, beforeThere);
      };
      apply();

      const count = here.erased.length + (there?.erased.length ?? 0);
      const where = thereChanged ? (hereChanged ? " (both images)" : " (the other image)") : "";
      const fresh = (next: readonly WireSegment[], previous: readonly WireSegment[]) =>
        next.reduce((total, segment) => total + (previous.includes(segment) ? 0 : estimateBytes(segment)), 0);
      history.record({
        label: `Erase from ${count} annotation${count === 1 ? "" : "s"}${where}`,
        bytes:
          (hereChanged ? fresh(here.segments, beforeHere) : 0)
          + (thereChanged ? fresh(afterThere, beforeThere) : 0),
        // Scoped to every side it changed, so closing either drops the entry: half an inverse
        // would restore annotations into an image that is no longer open.
        scope: [...(hereChanged ? [sideScope(at)] : []), ...(thereChanged ? [sideScope(other)] : [])],
        undo: revert,
        redo: apply,
      });

      return {
        kind: "erased",
        erased: count,
        vanished: here.vanished.length + (there?.vanished.length ?? 0),
        bothImages: hereChanged && thereChanged,
      };
    },
    [activeSide, history, linked, sides, updateSide],
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

      const apply = (value: Readonly<Record<string, string>>) =>
        updateSide(at, (current) => ({ ...current, classAliases: value, dirty: true }));

      apply(next);
      history.record({
        label: trimmed === "" ? `Clear the name of class ${classId}` : `Rename class ${classId}`,
        bytes: 64,
        scope: [sideScope(at)],
        undo: () => apply(previous),
        redo: () => apply(next),
      });
    },
    [activeSide, classAliases, history, updateSide],
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
  const setCrop = useCallback(
    (next: Crop | null) =>
      updateSide(activeSide, (current) => ({
        ...current,
        crop: next,
        processing: { ...current.processing, crop: next },
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

  const markSavedOn = useCallback(
    (at: SideIndex) => updateSide(at, (current) => ({ ...current, dirty: false })),
    [updateSide],
  );

  const markSaved = useCallback(() => markSavedOn(activeSide), [activeSide, markSavedOn]);

  const value = useMemo(
    () => ({
      sides,
      linked,
      setLinked,
      linkReport,
      activeSide,
      setActiveSide,
      open,
      openImage,
      openImageOn,
      closeSide,
      imageState,
      imageStates,
      segments,
      addSegment,
      eraseWith,
      updateSegment,
      history,
      markSaved,
      markSavedOn,
      activeTool,
      setActiveTool,
      activeClassId,
      setActiveClassId,
      toggleRecentClass,
      selected,
      toggleSelected,
      setSelection,
      clearSelection,
      applySegments,
      classAliases,
      setClassAlias,
      applyClasses,
      crop,
      setCrop,
      processing,
      setProcessing,
      zoom,
      setZoom,
    }),
    [
      activeClassId,
      activeSide,
      activeTool,
      addSegment,
      applyClasses,
      applySegments,
      eraseWith,
      classAliases,
      clearSelection,
      closeSide,
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
      segments,
      selected,
      setClassAlias,
      setCrop,
      setProcessing,
      setSelection,
      setZoom,
      sides,
      zoom,
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
