/**
 * Which image is open, and everything that follows from that.
 *
 * Phase 4's workspace store. It exists because the answer "what is open" has too many readers for
 * any one of them to own it: the dataset list highlights the open row, the canvas draws it, the
 * status bar names it, the save path decides whether navigating away is safe, and Phase 6's
 * timeline and split view will both ask the same question. Legacy's answer lives on MainWindow and
 * is reached through half a dozen managers, which is how it ends up with several save paths that
 * do different bookkeeping for the same act.
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

/** Every tool the workspace offers. */
export type Tool = "none" | "select" | "polygon" | "box" | "circle" | "ai";

export interface OpenImage {
  readonly image: WireDatasetImage;
  /** Null until the metadata arrives. */
  readonly metadata: WireImageMetadata | null;
  /** Null until the annotations arrive, or when opening failed before they could. */
  readonly result: AnnotationsResult | null;
  /** Set when the image could not be opened at all. */
  readonly error: string | null;
}

export interface WorkspaceContextValue {
  readonly open: OpenImage | null;
  readonly openImage: (image: WireDatasetImage) => void;
  /**
   * The derived answer the save path and the status bar need: what is open, is it saved, is it
   * safe to write. Null while nothing is open or the open image is still loading.
   */
  readonly imageState: ImageState | null;
  /**
   * The annotations as they stand now, which is not what the file said once anything is drawn.
   *
   * Seeded from the load and then owned here. Reading them back off `open.result` instead would
   * make the loaded file the source of truth for something the user has since changed.
   */
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
  /**
   * Which drawing tool is in force.
   *
   * "none" rather than defaulting to a tool, because a canvas that starts in a drawing mode turns
   * the first click of a session -- often a click to look at something -- into an annotation.
   */
  readonly activeTool: Tool;
  readonly setActiveTool: (tool: Tool) => void;
  /** The class new annotations take, or null to use the next free id. */
  readonly activeClassId: number | null;
  readonly setActiveClassId: (classId: number | null) => void;
  /**
   * Which annotations are selected, by POSITION in `segments`.
   *
   * Positions rather than identities because that is what legacy uses and what every operation on
   * a selection takes. The cost is that any change to the list can invalidate it, which is why
   * `applySegments` clears it rather than letting a stale index reach a merge or a delete.
   */
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
  /**
   * Class names by id, as the open image's file holds them.
   *
   * Owned here for the same reason the segments are: once a user renames a class, the loaded file
   * is no longer what the app should be showing. Under decision 6 these are PER IMAGE, so the
   * same name can be a different id in the next file.
   */
  readonly classAliases: Readonly<Record<string, string>>;
  /** Rename one class, or clear the name with an empty string. Recorded, and marks the image unsaved. */
  readonly setClassAlias: (classId: number, name: string) => void;
  /** Renumber classes and rename them together, as RULE-013's reassign does. */
  readonly applyClasses: (
    segments: readonly WireSegment[],
    aliases: Readonly<Record<string, string>>,
    label: string,
  ) => void;
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
  const [open, setOpen] = useState<OpenImage | null>(null);
  const [segments, setSegments] = useState<readonly WireSegment[]>([]);
  const [dirty, setDirty] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>("none");
  const [activeClassId, setActiveClassId] = useState<number | null>(null);
  const [selected, setSelected] = useState<readonly number[]>([]);
  const [classAliases, setClassAliases] = useState<Readonly<Record<string, string>>>({});
  // One History for the session, cleared per image: RULE-052 scopes undo to the open image, so an
  // undo after switching must not reach back into the previous one's edits.
  const history = useMemo(() => new History(), []);

  const openImage = useCallback(
    (image: WireDatasetImage) => {
      // Cleared first, so a slow open cannot leave the previous image's annotations on screen
      // under the new image's name -- which is the shape of legacy's most expensive bug, where the
      // current path is committed before the decode succeeds.
      setOpen({ image, metadata: null, result: null, error: null });
      // RULE-052: history is cleared when an image loads. An undo that reached into the previous
      // image's edits would apply them to annotations that are not on screen.
      history.clear();
      setSegments([]);
      setSelected([]);
      setClassAliases({});
      setDirty(false);

      client
        .imageMetadata(projectId, image.key)
        .then(async (metadata) => {
          const result = await client.loadAnnotations(projectId, image.key, [
            metadata.height,
            metadata.width,
          ]);
          // Keyed on the image, so a slow open that finishes after the user moved on is discarded
          // rather than applied to whatever is now in front of them.
          setOpen((current) => {
            if (current?.image.key !== image.key) return current;
            // Seeded here rather than in an effect on `open`, so the segments and the result they
            // came from can never be one render out of step.
            setSegments(result.kind === "loaded" ? result.annotations.segments : []);
            setClassAliases(result.kind === "loaded" ? result.annotations.classAliases : {});
            return { ...current, metadata, result };
          });
        })
        .catch((cause: unknown) => {
          const error = cause instanceof Error ? cause.message : String(cause);
          setOpen((current) => (current?.image.key === image.key ? { ...current, error } : current));
        });
    },
    [client, projectId],
  );

  const imageState = useMemo<ImageState | null>(() => {
    if (open === null) return null;

    if (open.error !== null) {
      return { key: open.image.key, provenance: "failed", dirty: false, segmentCount: 0 };
    }

    // Still opening. Reporting it as empty here is exactly the mistake that makes a failed load
    // look like a cleared image, so it reports nothing instead.
    if (open.result === null) return null;

    return {
      key: open.image.key,
      provenance: provenanceFromLoad(open.result.kind),
      dirty,
      // From the live segments, not from the file: once something is drawn they differ, and the
      // count is what the save prompt shows the user before they decide.
      segmentCount: segments.length,
    };
  }, [dirty, open, segments]);

  const addSegment = useCallback(
    (segment: WireSegment, label = "Add annotation") => {
      // Recorded OUTSIDE the state updater. React may invoke an updater more than once for one
      // call -- StrictMode does it deliberately -- and recording inside would push two history
      // entries for one drawn polygon, so the first undo would appear to do nothing.
      const index = segments.length;

      setSegments((current) => [...current, segment]);
      setDirty(true);

      // Keyed on the index it lands at, which is what legacy records too
      // (`polygon_drawing_manager.py:205-211`). Safe against later edits shifting it because
      // RULE-052 clears the redo stack on any new action: between an undo and its redo, the only
      // possible operations are other undos, which unwind in order.
      history.record({
        label,
        bytes: estimateBytes(segment),
        undo: () => {
          setSegments((live) => live.filter((_, i) => i !== index));
          setDirty(true);
        },
        redo: () => {
          setSegments((live) => [...live.slice(0, index), segment, ...live.slice(index)]);
          setDirty(true);
        },
      });
    },
    [history, segments.length],
  );

  const updateSegment = useCallback(
    (index: number, segment: WireSegment, label = "Edit annotation") => {
      const previous = segments[index];
      if (previous === undefined) return;
      // Nothing changed: recording it would put an entry on the stack whose undo is invisible,
      // and a user pressing undo would think the key had stopped working.
      if (previous === segment) return;

      const replace = (value: WireSegment) => {
        setSegments((live) => live.map((entry, at) => (at === index ? value : entry)));
        setDirty(true);
      };

      replace(segment);
      history.record({
        label,
        bytes: estimateBytes(segment),
        undo: () => replace(previous),
        redo: () => replace(segment),
      });
    },
    [history, segments],
  );

  const toggleSelected = useCallback(
    (index: number) => setSelected((current) => toggle(current, index)),
    [],
  );

  const clearSelection = useCallback(() => setSelected([]), []);

  const applySegments = useCallback(
    (next: readonly WireSegment[], label: string) => {
      const previous = segments;
      if (next === previous) return;

      const apply = (value: readonly WireSegment[]) => {
        setSegments(value);
        setDirty(true);
        // Cleared rather than remapped. Merge keeps positions, erase does not, and delete shifts
        // them -- one rule that is always safe beats three that each have to be right.
        setSelected([]);
      };

      apply(next);
      history.record({
        label,
        // Only what this step introduced: the segments it shares with the previous list are not
        // retained by it, and counting them would shrink the usable history for no reason.
        bytes: next.reduce(
          (total, segment) => total + (previous.includes(segment) ? 0 : estimateBytes(segment)),
          0,
        ),
        undo: () => apply(previous),
        redo: () => apply(next),
      });
    },
    [history, segments],
  );

  const setClassAlias = useCallback(
    (classId: number, name: string) => {
      const key = String(classId);
      const previous = classAliases;
      const trimmed = name.trim();

      // An empty name CLEARS the entry rather than storing "". A blank alias would export as a
      // class literally named nothing, which is worse than falling back to the id.
      const next = { ...previous };
      if (trimmed === "") delete next[key];
      else next[key] = trimmed;

      if (previous[key] === next[key]) return;

      const apply = (value: Readonly<Record<string, string>>) => {
        setClassAliases(value);
        setDirty(true);
      };

      apply(next);
      history.record({
        label: trimmed === "" ? `Clear the name of class ${classId}` : `Rename class ${classId}`,
        bytes: 64,
        undo: () => apply(previous),
        redo: () => apply(next),
      });
    },
    [classAliases, history],
  );

  const applyClasses = useCallback(
    (
      nextSegments: readonly WireSegment[],
      nextAliases: Readonly<Record<string, string>>,
      label: string,
    ) => {
      const previousSegments = segments;
      const previousAliases = classAliases;

      const apply = (
        theSegments: readonly WireSegment[],
        theAliases: Readonly<Record<string, string>>,
      ) => {
        setSegments(theSegments);
        setClassAliases(theAliases);
        setDirty(true);
        setSelected([]);
      };

      apply(nextSegments, nextAliases);
      history.record({
        label,
        bytes: 64,
        undo: () => apply(previousSegments, previousAliases),
        redo: () => apply(nextSegments, nextAliases),
      });
    },
    [classAliases, history, segments],
  );

  const markSaved = useCallback(() => setDirty(false), []);

  const value = useMemo(
    () => ({
      open,
      openImage,
      imageState,
      segments,
      addSegment,
      updateSegment,
      history,
      markSaved,
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
    }),
    [
      activeClassId,
      activeTool,
      addSegment,
      updateSegment,
      history,
      imageState,
      markSaved,
      open,
      openImage,
      segments,
      selected,
      toggleSelected,
      clearSelection,
      applySegments,
      classAliases,
      setClassAlias,
      applyClasses,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (value === null) throw new Error("useWorkspace needs a WorkspaceProvider above it");
  return value;
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
