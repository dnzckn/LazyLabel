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
 * LINKED, one annotation drawn once lands in BOTH at the same pixel, as ONE undo entry, with the
 * two images agreeing on the class NAME while each keeps its own id for it. The decision lives in
 * the store's `addSegment` rather than here, which is why it cost so little: every tool, the AI
 * prompt and the hotkeys already reach the store through that one function, so none of them has to
 * know a pair exists. This panel owns the switch and shows what the last one did — including the
 * refusals, which is the part worth surfacing: a shape that falls outside the other image is
 * refused there rather than moved, and the user is looking at the first image when they draw.
 *
 * It is OFF by default, reversing this view's first "starts linked, as legacy does". Legacy's
 * default does not bind: decision 8 rebuilt multi-view from the rules rather than porting a
 * half-migrated feature, and an annotation appearing in an image the user was not looking at is
 * precisely what decision 7 says must follow an explicit act.
 *
 * ERASING LINKS TOO, since 2026-09-23 -- the store's `eraseWith`, for the same reason adding is
 * cheap: every eraser reaches it as one segment. Legacy mirrors both. Deleting and merging do not
 * link, in legacy or here: each of legacy's viewers has its own buttons acting on its own
 * selection. The two sides still SAVE separately. The note at the bottom says which you are getting.
 *
 * TWO VIEWERS, not four. Legacy has a four-view setting and only viewers 0 and 1 exist
 * (RULE-092's edge cases); the setting is a control that does nothing, and it is not carried over.
 *
 * NO NOTE UNDER THE PANES. Until the owner asked for legacy's panels without paragraphs
 * (2026-09-26) one said what the mode in force does: linked, one annotation drawn in either image
 * lands in both at the same pixel under the same class NAME, each image keeping its own id for it;
 * erasing links the same way; one undo takes back both; a shape outside the other image is refused
 * there rather than moved; deleting and merging act on the side chosen, and each side SAVES
 * separately. Unlinked, the tools, the panels and undo follow the side chosen. Legacy's Linked
 * button says it in a tooltip, and so does this one.
 */

import { useMemo, type ReactNode } from "react";

import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import { AnnotationCanvas } from "../canvas/AnnotationCanvas.jsx";
import { useFittedPane } from "../canvas/useFittedPane.js";
import { ViewKindContext } from "../canvas/viewKind.js";
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
  /**
   * One tile of the same processed picture (C8). A pane is fitted, so it needs one coarse level of
   * each image -- two 50-megapixel images side by side were two 41 MB downloads before tiles.
   */
  readonly tileUrl?: (key: string, processing: ImageProcessing, z: number, x: number, y: number) => string;
  /**
   * The interactive view, drawn in the ACTIVE side's half in place of its picture, so either image
   * can be drawn on where it is shown -- as in legacy's Multi tab, where both viewers are live.
   * Clicking the other half makes that side active and moves the view there. Without it, both
   * halves are pictures only.
   */
  readonly viewer?: ReactNode;
}

export function SplitView({ images, pixelsUrl, tileUrl, viewer }: SplitViewProps): ReactNode {
  const { sides, activeSide, setActiveSide, openImageOn, closeSide, linked, setLinked, linkReport } =
    useWorkspace();
  const [left, right] = sides;

  const note = useMemo(() => {
    const leftSize = sizeOf(left);
    const rightSize = sizeOf(right);
    if (leftSize === null || rightSize === null) return null;
    return describePair(leftSize, rightSize);
  }, [left, right]);

  // Legacy's words on entering Multi with nothing open (main_window.py:5942). A split view pairs a
  // second image with the one being worked on.
  if (left.open === null) {
    return <p className="panel__missing">Please load an image first</p>;
  }

  if (images.length < 2) {
    return <p className="panel__missing">A split view needs two images</p>;
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
                // loss by another route. Emptying it is asked first when it holds unsaved work;
                // on a no, the pair stays as it was and the list shows it again.
                if (closeSide(1)) setActiveSide(0);
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
        // picture under two sets of display adjustments. Worth saying here, though, because the two
        // sides hold separate segments -- so edits made on one do not appear on the other, and the
        // later save wins. The banner said all that until 2026-09-26.
        <p role="status" className="banner banner--warning">
          Both sides show the same image
        </p>
      )}

      {note !== null && (
        <p role="status" className="banner banner--warning">
          {note}
        </p>
      )}

      {/* What the last linked action actually did. Beside the panes rather than in the page's
          notification list, because a refusal is about the pair the user is looking at. */}
      {linkReport !== null && linkReport.kind === "refused" && (
        <p role="alert" className="banner banner--warning">
          {linkReport.erase === true ? "Erased in this image only" : "Added to this image only"}:{" "}
          {linkReport.reason}
        </p>
      )}
      {linkReport !== null && linkReport.kind === "erased" && (
        // Legacy's words for the mirrored erase (main_window.py:5803-5805) and for an erase that met
        // nothing (polygon_drawing_manager.py:198), the viewer named by its image, as the panes'
        // headers name it.
        <p role="status" className="panel__missing">
          {linkReport.count === 0
            ? `No segments to erase in ${linkReport.image}`
            : `Erased ${linkReport.count} segment(s) from ${linkReport.image}`}
        </p>
      )}
      {linkReport !== null && linkReport.kind === "linked" && (
        <p role="status" className="panel__missing">
          Added to both images, as {linkReport.allocated ? "new " : ""}class {linkReport.classId} in{" "}
          {linkReport.image}
        </p>
      )}

      {/* Legacy's Multi tab: two viewers, each under a bold "Viewer N:" header, with the Linked
          toggle in a narrow column between them (main_window.py:3069-3119). The header's
          "Viewer N:" is drawn by the stylesheet, so the caption's text stays the image's name. */}
      <div className="split__panes">
        {([0, 1] as const).map((side) => {
          const open = sides[side].open;
          const live = viewer !== undefined && activeSide === side;
          const half =
            open === null ? (
              // Legacy's empty viewer: its header and nothing else, "Viewer 2: No image loaded"
              // (main_window.py:3086), the stylesheet drawing the "Viewer N:".
              <div key={side} className="split__pane split__pane--empty">
                <p className="split__header">No image loaded</p>
              </div>
            ) : (
              <figure
                key={side}
                className={`split__pane${activeSide === side ? " split__pane--active" : ""}`}
                // The other half is a picture; clicking it moves the tools, and the view, there.
                {...(viewer !== undefined && !live ? { onClick: () => setActiveSide(side) } : {})}
              >
                <figcaption className="split__header">
                  {open.image.name}
                  {activeSide === side && right.open !== null ? " — editing" : ""}
                  {sides[side].dirty ? " (unsaved)" : ""}
                </figcaption>
                {live ? (
                  <div className="split__view">
                    {/* Legacy's Multi tab has a mouse handler of its own, and the view's layers
                        follow it here (`canvas/viewKind.ts`). */}
                    <ViewKindContext.Provider value="multi">{viewer}</ViewKindContext.Provider>
                  </div>
                ) : (
                  <Pane side={sides[side]} pixelsUrl={pixelsUrl} {...(tileUrl === undefined ? {} : { tileUrl })} />
                )}
              </figure>
            );
          return side === 0 ? (
            [
              half,
              <div key="link" className="split__middle">
                {right.open !== null && (
                  // Legacy's button text and tooltip (main_window.py:3101-3106). Its text turns to
                  // "Unlinked" when released; a box that is ticked or not says that already.
                  <label className="split__link" title="When linked, operations are mirrored to both viewers">
                    <input
                      type="checkbox"
                      checked={linked}
                      aria-label="Link the two images"
                      onChange={(event) => setLinked(event.target.checked)}
                    />{" "}
                    Linked
                  </label>
                )}
              </div>,
            ]
          ) : (
            half
          );
        })}
      </div>
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
  tileUrl,
}: {
  readonly side: SideState;
  readonly pixelsUrl: (key: string, processing: ImageProcessing) => string;
  readonly tileUrl?: (key: string, processing: ImageProcessing, z: number, x: number, y: number) => string;
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

  return <FittedPicture side={side} size={size} pixelsUrl={pixelsUrl} {...(tileUrl === undefined ? {} : { tileUrl })} />;
}

/** One half's picture, fitted to its half as the view is fitted to the pane. */
function FittedPicture({
  side,
  size,
  pixelsUrl,
  tileUrl,
}: {
  readonly side: SideState;
  readonly size: ImageSize;
  readonly pixelsUrl: (key: string, processing: ImageProcessing) => string;
  readonly tileUrl?: (key: string, processing: ImageProcessing, z: number, x: number, y: number) => string;
}): ReactNode {
  const { attach, scale } = useFittedPane(size);
  const key = side.open?.image.key ?? "";
  return (
    <div className="split__picture" ref={attach}>
      <AnnotationCanvas
        imageUrl={pixelsUrl(key, side.processing)}
        {...(tileUrl === undefined
          ? {}
          : { tileUrl: (z: number, x: number, y: number) => tileUrl(key, side.processing, z, x, y) })}
        width={size.width}
        height={size.height}
        zoom={scale}
        // The LIVE segments, straight from the store, so an edit made in the view appears here as
        // it happens rather than at the next reload.
        segments={side.segments satisfies readonly WireSegment[]}
      />
    </div>
  );
}
