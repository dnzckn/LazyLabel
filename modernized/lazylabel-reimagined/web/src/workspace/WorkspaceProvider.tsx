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

/** The manual drawing tools. The AI and editing tools arrive later in Phase 5. */
export type Tool = "none" | "polygon" | "box" | "circle";

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

  const markSaved = useCallback(() => setDirty(false), []);

  const value = useMemo(
    () => ({
      open,
      openImage,
      imageState,
      segments,
      addSegment,
      history,
      markSaved,
      activeTool,
      setActiveTool,
      activeClassId,
      setActiveClassId,
    }),
    [
      activeClassId,
      activeTool,
      addSegment,
      history,
      imageState,
      markSaved,
      open,
      openImage,
      segments,
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
