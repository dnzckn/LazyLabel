/**
 * Two images side by side, annotated together — C14, decision 8's rebuild of multi-view.
 *
 * Not a port. Legacy's multi-view is half-migrated with fourteen undefined members, and decision 8
 * settled that it is rebuilt from the linked-operation rules instead. `linked.ts` holds those; this
 * is the view.
 *
 * THE LEFT PANE IS THE IMAGE YOU ARE WORKING ON. It is not chosen here: it is whatever the dataset
 * browser opened, side 0 of the workspace. This panel chooses the SECOND image and opens it into
 * side 1, and a radio says which of the two the centre view and every tool act on. So annotating a
 * pair is: open one, pick its partner here, and switch sides — with both on screen, both holding
 * their own segments, crop and undo.
 *
 * That is a narrower view than the one before it, which let you compare any two images without
 * disturbing what you had open, and the narrowing is deliberate. RULE-092 is about a PAIR being
 * labelled together, not an arbitrary comparison; making the left pane a second way to choose an
 * image would put two controls on one question and a second image-loading path beside the store's.
 * Comparing two images you have not opened now costs one extra click: open one, pick the other.
 *
 * WHAT IT STILL DOES NOT DO. A linked operation — one action applying to both images at once, as
 * one undo entry — is not built. Each side is edited on its own. The note at the bottom says which
 * of the two you are getting rather than implying the other.
 *
 * TWO VIEWERS, not four. Legacy has a four-view setting and only viewers 0 and 1 exist
 * (RULE-092's edge cases); the setting is a control that does nothing, and it is not carried over.
 */

import { useMemo, type ReactNode } from "react";

import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import { AnnotationCanvas } from "../canvas/AnnotationCanvas.jsx";
import type { ImageProcessing } from "../workspace/processing.js";
import {
  useWorkspace,
  type SideIndex,
  type SideState,
} from "../workspace/WorkspaceProvider.jsx";
import { describePair, type ImageSize } from "./linked.js";

export interface SplitViewProps {
  /** The folder's images, for choosing the second one. */
  readonly images: readonly WireDatasetImage[];
  /**
   * Takes the side's PROCESSING as well as its key.
   *
   * Each side carries its own rescale window, channel thresholds and filters — they are per image
   * for the same reason the crop is. A pane drawn from the plain URL would show one side adjusted
   * and the other raw, which in a comparison view is the one thing that must not happen.
   */
  readonly pixelsUrl: (key: string, processing: ImageProcessing) => string;
}

export function SplitView({ images, pixelsUrl }: SplitViewProps): ReactNode {
  const { sides, activeSide, setActiveSide, openImageOn, closeSide } = useWorkspace();
  const [left, right] = sides;

  const note = useMemo(() => {
    const leftSize = sizeOf(left);
    const rightSize = sizeOf(right);
    if (leftSize === null || rightSize === null) return null;
    return describePair(leftSize, rightSize);
  }, [left, right]);

  if (left.open === null) {
    return (
      <p className="panel__missing">
        Open an image first. A split view pairs a second image with the one you are working on.
      </p>
    );
  }

  if (images.length < 2) {
    return (
      <p className="panel__missing">
        A split view needs two images. This folder has {images.length}.
      </p>
    );
  }

  const rightKey = right.open?.image.key ?? "";

  return (
    <div className="split">
      <div className="split__controls">
        <label className="crop__field">
          <span>Second image</span>
          <select
            value={rightKey}
            aria-label="Second image"
            onChange={(event) => {
              const chosen = images.find((image) => image.key === event.target.value);
              if (chosen === undefined) {
                // Back to one image. The side is emptied rather than left holding an image nobody
                // can see: a pane off screen still reporting unsaved work is decision 7's silent
                // loss by another route.
                setActiveSide(0);
                closeSide(1);
                return;
              }
              openImageOn(1, chosen);
            }}
          >
            <option value="">None — one image</option>
            {images.map((image) => (
              <option key={image.key} value={image.key}>
                {image.name}
              </option>
            ))}
          </select>
        </label>

        {right.open !== null && (
          <fieldset className="split__link">
            {/* Which side everything else acts on. A radio group rather than a pair of toggles,
                because the sides are exclusive and that says so to a screen reader and to the
                keyboard without any code of ours. */}
            <legend>Editing</legend>
            {([0, 1] as const).map((side) => (
              <label key={side}>
                <input
                  type="radio"
                  name="split-active"
                  checked={activeSide === side}
                  aria-label={side === 0 ? "Edit the left image" : "Edit the right image"}
                  onChange={() => setActiveSide(side)}
                />{" "}
                {sides[side].open?.image.name ?? (side === 0 ? "Left" : "Right")}
              </label>
            ))}
          </fieldset>
        )}
      </div>

      {right.open !== null && left.open.image.key === rightKey && (
        // Allowed, and worth saying: the same image twice is a legitimate way to look at one
        // picture under two sets of display adjustments. Worth saying LOUDLY here, though, because
        // the two sides now hold separate segments -- so edits made on one do not appear on the
        // other, and the last save wins.
        <p role="status" className="banner banner--warning">
          Both sides are showing the same image. Each side holds its own annotations, so edits made
          on one will not appear on the other and the later save will win.
        </p>
      )}

      {note !== null && (
        <p role="status" className="banner banner--warning">
          {note}
        </p>
      )}

      <div className="split__panes">
        {([0, 1] as const).map((side) =>
          sides[side].open === null ? null : (
            <figure
              key={side}
              className={`split__pane${activeSide === side ? " split__pane--active" : ""}`}
            >
              <Pane side={sides[side]} pixelsUrl={pixelsUrl} />
              <figcaption>
                {sides[side].open.image.name}
                {activeSide === side && right.open !== null ? " — editing" : ""}
                {sides[side].dirty ? " (unsaved)" : ""}
              </figcaption>
            </figure>
          ),
        )}
      </div>

      <p className="panel__missing">
        {right.open === null
          ? "Pick a second image to pair with this one."
          : "Each side is edited on its own: the tools, the panels and undo all follow the side "
            + "chosen above, and each side saves separately. A LINKED operation — one action "
            + "applying to both images at the same pixel, as one undo entry, with both naming the "
            + "object the same class while each keeps its own id for it — is not built yet."}
      </p>
    </div>
  );
}

/** The pixel size this side has been measured at, or null while it is still loading. */
function sizeOf(side: SideState): ImageSize | null {
  const metadata = side.open?.metadata;
  if (metadata === undefined || metadata === null) return null;
  return { width: metadata.width, height: metadata.height };
}

function Pane({
  side,
  pixelsUrl,
}: {
  readonly side: SideState;
  readonly pixelsUrl: (key: string, processing: ImageProcessing) => string;
}): ReactNode {
  const open = side.open;
  if (open === null) return null;

  if (open.error !== null) {
    return (
      <p role="alert" className="banner banner--error">
        {open.image.name} could not be opened: {open.error}
      </p>
    );
  }

  const size = sizeOf(side);
  if (size === null) {
    // Measured before drawn. A canvas sized from a guess shows the image at the wrong scale, and
    // every coordinate taken from it would be wrong by the same factor.
    return <p className="panel__missing">Measuring {open.image.name}…</p>;
  }

  return (
    <AnnotationCanvas
      imageUrl={pixelsUrl(open.image.key, side.processing)}
      width={size.width}
      height={size.height}
      // The LIVE segments, straight from the store, so an edit made in the centre view appears
      // here as it happens rather than at the next reload.
      segments={side.segments satisfies readonly WireSegment[]}
    />
  );
}
