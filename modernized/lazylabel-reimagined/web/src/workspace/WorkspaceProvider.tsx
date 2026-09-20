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
  useState,
  type ReactNode,
} from "react";

import type { WireDatasetImage, WireImageMetadata, WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../api/client.js";
import { History } from "./history.js";
import { provenanceFromLoad, type ImageState } from "./saveState.js";
import { toggle } from "../tools/selection.js";
import type { Crop } from "../tools/crop.js";
import { NO_PROCESSING, type ImageProcessing } from "./processing.js";

/** Every tool the workspace offers. */
export type Tool = "none" | "select" | "polygon" | "box" | "circle" | "ai";

/**
 * Which of the two slots. Two rather than a list, because two is what exists: legacy's four-view
 * setting was a control over two viewers, and a list would invite a third with nothing to show in
 * it.
 */
export type SideIndex = 0 | 1;

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
}

const EMPTY_SIDE: SideState = {
  open: null,
  segments: [],
  classAliases: {},
  dirty: false,
  selected: [],
  crop: null,
  processing: NO_PROCESSING,
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

export interface WorkspaceContextValue {
  /** Both slots, for the split view. Everything below resolves from `sides[activeSide]`. */
  readonly sides: readonly [SideState, SideState];
  /** Which side the single-image components act on. */
  readonly activeSide: SideIndex;
  readonly setActiveSide: (side: SideIndex) => void;

  readonly open: OpenImage | null;
  /** Open into the active side. */
  readonly openImage: (image: WireDatasetImage) => void;
  /** Open into a named side, without changing which side is active. */
  readonly openImageOn: (side: SideIndex, image: WireDatasetImage) => void;
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
  readonly selected: readonly number[];
  readonly toggleSelected: (index: number) => void;
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
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  client,
  projectId,
  children,
}: {
  readonly client: ApiClient;
  readonly projectId: string;
  readonly children: ReactNode;
}): ReactNode {
  const [sides, setSides] = useState<readonly [SideState, SideState]>([EMPTY_SIDE, EMPTY_SIDE]);
  const [activeSide, setActiveSide] = useState<SideIndex>(0);
  const [activeTool, setActiveTool] = useState<Tool>("none");
  const [activeClassId, setActiveClassId] = useState<number | null>(null);

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
    (side: SideIndex, image: WireDatasetImage) => {
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
              segments: result.kind === "loaded" ? result.annotations.segments : [],
              classAliases: result.kind === "loaded" ? result.annotations.classAliases : {},
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
    [client, history, projectId, updateSide],
  );

  const openImage = useCallback(
    (image: WireDatasetImage) => openImageOn(activeSide, image),
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
  const { open, segments, classAliases, selected, crop, processing } = sides[activeSide];
  const imageState = imageStates[activeSide];

  const addSegment = useCallback(
    (segment: WireSegment, label = "Add annotation") => {
      // Recorded OUTSIDE the state updater. React may invoke an updater more than once for one
      // call -- StrictMode does it deliberately -- and recording inside would push two history
      // entries for one drawn polygon, so the first undo would appear to do nothing.
      const index = segments.length;
      const at = activeSide;

      const insert = () =>
        updateSide(at, (current) => ({
          ...current,
          segments: [...current.segments.slice(0, index), segment, ...current.segments.slice(index)],
          dirty: true,
        }));
      const remove = () =>
        updateSide(at, (current) => ({
          ...current,
          segments: current.segments.filter((_, i) => i !== index),
          dirty: true,
        }));

      insert();

      // Keyed on the index it lands at, which is what legacy records too
      // (`polygon_drawing_manager.py:205-211`). Safe against later edits shifting it because
      // RULE-052 clears the redo stack on any new action: between an undo and its redo, the only
      // possible operations are other undos, which unwind in order.
      //
      // The SIDE is captured as a value, not read back when the undo runs. An undo puts the shape
      // back where it was drawn, not wherever the user happens to be looking.
      history.record({
        label,
        bytes: estimateBytes(segment),
        scope: [sideScope(at)],
        undo: remove,
        redo: insert,
      });
    },
    [activeSide, history, segments.length, updateSide],
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

  const clearSelection = useCallback(
    () => updateSide(activeSide, (current) => ({ ...current, selected: [] })),
    [activeSide, updateSide],
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

  const markSavedOn = useCallback(
    (at: SideIndex) => updateSide(at, (current) => ({ ...current, dirty: false })),
    [updateSide],
  );

  const markSaved = useCallback(() => markSavedOn(activeSide), [activeSide, markSavedOn]);

  const value = useMemo(
    () => ({
      sides,
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
      updateSegment,
      history,
      markSaved,
      markSavedOn,
      activeTool,
      setActiveTool,
      activeClassId,
      setActiveClassId,
      selected,
      toggleSelected,
      clearSelection,
      applySegments,
      classAliases,
      setClassAlias,
      applyClasses,
      crop,
      setCrop,
      processing,
      setProcessing,
    }),
    [
      activeClassId,
      activeSide,
      activeTool,
      addSegment,
      applyClasses,
      applySegments,
      classAliases,
      clearSelection,
      closeSide,
      crop,
      history,
      imageState,
      imageStates,
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
      sides,
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
