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

import type { WireDatasetImage, WireImageMetadata } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../api/client.js";
import { provenanceFromLoad, type ImageState } from "./saveState.js";

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

  const openImage = useCallback(
    (image: WireDatasetImage) => {
      // Cleared first, so a slow open cannot leave the previous image's annotations on screen
      // under the new image's name -- which is the shape of legacy's most expensive bug, where the
      // current path is committed before the decode succeeds.
      setOpen({ image, metadata: null, result: null, error: null });

      client
        .imageMetadata(projectId, image.key)
        .then(async (metadata) => {
          const result = await client.loadAnnotations(projectId, image.key, [
            metadata.height,
            metadata.width,
          ]);
          // Keyed on the image, so a slow open that finishes after the user moved on is discarded
          // rather than applied to whatever is now in front of them.
          setOpen((current) =>
            current?.image.key === image.key ? { ...current, metadata, result } : current,
          );
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
      // Always false for now. Nothing can edit an image until the drawing tools arrive in Phase 5,
      // and a dirty flag nothing can set would be a claim rather than a fact.
      dirty: false,
      segmentCount: open.result.kind === "loaded" ? open.result.annotations.segments.length : 0,
    };
  }, [open]);

  const value = useMemo(() => ({ open, openImage, imageState }), [imageState, open, openImage]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (value === null) throw new Error("useWorkspace needs a WorkspaceProvider above it");
  return value;
}
