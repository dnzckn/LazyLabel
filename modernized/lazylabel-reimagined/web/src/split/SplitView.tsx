/**
 * Two images side by side, annotated together — C14, decision 8's rebuild of multi-view.
 *
 * Not a port. Legacy's multi-view is half-migrated with fourteen undefined members, and decision 8
 * settled that it is rebuilt from the linked-operation rules instead. `linked.ts` holds those; this
 * is the view.
 *
 * THE LEFT PANE IS THE IMAGE YOU ARE WORKING ON. It is not chosen here: it is whatever the dataset
 * browser opened, side 0 of the workspace. This panel chooses the SECOND image and opens it into
 * side 1, and a radio says which of the two the centre view, the tools and the panels act on. So
 * annotating a pair is: open one, pick its partner here, and switch sides — with both on screen,
 * both holding their own segments, crop and undo.
 *
 * THE KEYS LEGACY APPLIES TO BOTH VIEWERS ACT ON BOTH SIDES here, by the owner's decision of
 * 2026-09-26 ("Act on both, like the desktop app"; CONTROL_PARITY.md CP-31), which reverses the
 * active-side-only view of decision 8 for them: next and previous move the pair by two images,
 * the pan keys move both halves, Fit fits both, Delete (V) and Merge (M) take each image's own
 * selection, and Escape clears both (main_window.py:1647-1744, 6491-6557;
 * viewport_manager.py:45-50, 89-94; keyboard_event_manager.py:44-57, 236-239). Select All selects
 * both while linked. The store knows the tab is showing because this view says so (`multiView`).
 *
 * That is a narrower view than the one before it, which let you compare any two images without
 * disturbing what you had open, and the narrowing is deliberate. RULE-092 is about a PAIR being
 * labelled together, not an arbitrary comparison; making the left pane a second way to choose an
 * image would put two controls on one question and a second image-loading path beside the store's.
 * Comparing two images you have not opened now costs one extra click: open one, pick the other.
 *
 * LINKED, one annotation drawn once lands in BOTH at the same pixel, as ONE undo entry, with the
 * two images agreeing on the class NAME while each keeps its own id for it. The decision lives in
 * the store's `addSegment` rather than here, which is why it cost so little: every drawing tool and
 * the hotkeys already reach the store through that one function, so none of them has to know a
 * pair exists. This panel owns the switch and shows what the last one did — including the
 * refusals, which is the part worth surfacing: a shape that falls outside the other image is
 * refused there rather than moved, and the user is looking at the first image when they draw.
 *
 * THE AI PROMPT IS WHAT LINKS, NOT ITS ANSWER -- the owner, 2026-09-27: the Multi tab exists to
 * prompt the models "using the same coordinates across both images", with contours that "can vary
 * slightly". Every point and box placed on either image is placed on both, drawn in both halves,
 * and asked of each image's own model; each half shows its own preview, Space makes each image's
 * preview its own annotation in one undo step, and Escape clears both, as legacy's linked viewers
 * do (main_window.py:6645-6720; ai_segment_manager.py:301-403; `pairAi.ts`). The accepted mask was
 * copied pixel for pixel into the other image until then, so the two contours could not differ.
 *
 * It is ON from the start, as legacy's pair is (multi_view_coordinator.py:46), since 2026-09-27;
 * it was off before, when an annotation appearing in an image the user was not looking at was
 * judged to need an explicit act. The box stays beside the panes, in plain sight.
 *
 * ERASING LINKS TOO, since 2026-09-23 -- the store's `eraseWith`, for the same reason adding is
 * cheap: every eraser reaches it as one segment. Legacy mirrors both. So, since 2026-09-26, do the
 * SELECTION -- choosing rows in one image chooses the same rows in the other -- and a class's NAME,
 * as legacy's linked viewers share them (main_window.py:6194-6209, 6284-6319, 6392-6425). Deleting
 * and merging are not linked operations: their keys act on each image's own selection, linked or
 * not, and the table's buttons on the image being edited, as each of legacy's viewers has its own.
 * The two sides still SAVE separately.
 *
 * TWO VIEWERS, not four. Legacy has a four-view setting and only viewers 0 and 1 exist
 * (RULE-092's edge cases); the setting is a control that does nothing, and it is not carried over.
 *
 * NO NOTE UNDER THE PANES. Until the owner asked for legacy's panels without paragraphs
 * (2026-09-26) one said what the mode in force does: linked, one annotation drawn in either image
 * lands in both at the same pixel under the same class NAME, each image keeping its own id for it;
 * erasing links the same way; one undo takes back both; a shape outside the other image is refused
 * there rather than moved; each side SAVES separately. Unlinked, the tools, the panels and undo
 * follow the side chosen. Legacy's Linked button says it in a tooltip, and so does this one.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import type { WireSegmentResponse } from "../api/client.js";
import { AiMarks } from "../canvas/AiLayer.jsx";
import { AnnotationCanvas } from "../canvas/AnnotationCanvas.jsx";
import { scale as pixelsPerScreenPixel } from "../canvas/coordinates.js";
import { panPane } from "../canvas/panStep.js";
import { useFittedPane } from "../canvas/useFittedPane.js";
import { useSizing } from "../canvas/useSizing.js";
import { useWheelZoom } from "../canvas/useWheelZoom.js";
import { ViewKindContext } from "../canvas/viewKind.js";
import type { AiPrompt } from "../tools/ai.js";
import { AiPreview } from "../workspace/AiTool.jsx";
import { classForNewSegment } from "../workspace/classes.js";
import type { ImageProcessing } from "../workspace/processing.js";
import {
  useWorkspace,
  type SideIndex,
  type SideState,
} from "../workspace/WorkspaceProvider.jsx";
import { IdlePress } from "./IdlePress.jsx";
import { describePair, type ImageSize } from "./linked.js";
import { PairAiContext, usePairAi, type Pairing } from "./pairAi.js";
import { PairPanContext, PaneScrollContext, usePaneScroll, type PairPan } from "./pairPan.js";
import { PairDraftContext, type PairDraft } from "./pairDraft.js";
import { PairPressContext, type HandedPress, type PressTool } from "./pairPress.js";
import { EMPTY_DRAFT, type PolygonDraft } from "../tools/polygon.js";

/** The tools whose press on the half not being edited is the tool's (`pairPress.ts`). */
const PRESS_TOOLS: ReadonlySet<string> = new Set<PressTool>(["ai", "polygon", "box", "circle"]);

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
  const { sides, activeSide, setActiveSide, openImageOn, closeSide, linked, setLinked, linkReport, setMultiView } =
    useWorkspace();
  const { activeTool, activeClassId } = useWorkspace();
  const [left, right] = sides;

  /*
   * A LINKED PAIR'S AI PROMPT, held here so both halves draw it and it outlives the view moving to
   * the other half (`pairAi.ts`). Only while both images are measured, linked, and the AI tool is
   * chosen; anything else, a different pair included, starts it again.
   */
  const otherIndex: SideIndex = activeSide === 0 ? 1 : 0;
  const otherSide = sides[otherIndex];
  const otherOpen = otherSide.open;
  const otherSize = sizeOf(otherSide);
  const activeSize = sizeOf(sides[activeSide]);
  const pairKey = left.open === null || right.open === null ? "" : `${left.open.image.key}\u0000${right.open.image.key}`;
  const pairing = useMemo<Pairing | null>(
    () =>
      !linked || activeTool !== "ai" || viewer === undefined || pairKey === "" || otherOpen === null
      || otherSize === null || activeSize === null
        ? null
        : {
            key: pairKey,
            active: activeSide,
            other: {
              side: otherIndex,
              key: otherOpen.image.key,
              name: otherOpen.image.name,
              width: otherSize.width,
              height: otherSize.height,
              processing: otherSide.processing,
            },
          },
    // The sizes by their numbers: `sizeOf` builds a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      linked,
      activeTool,
      viewer === undefined,
      pairKey,
      activeSide,
      otherIndex,
      otherOpen,
      otherSize?.width,
      otherSize?.height,
      activeSize === null,
      otherSide.processing,
    ],
  );
  const pairAi = usePairAi(pairing);
  // The class the view's tool gives a new annotation, whose colour the other half's preview takes.
  const aiClassId = classForNewSegment(sides[activeSide].segments, activeClassId);
  // Where each half was scrolled to, put back when the view moves between them (CP-31).
  const paneScroll = usePaneScroll();

  /*
   * A PRESS ON THE HALF NOT BEING EDITED is the tool's, and makes that half the one edited, as a
   * press in either of legacy's viewers is (main_window.py:5498-5537; `pairPress.ts`). The view
   * drawn there next is handed the gesture for the render that draws it, and whatever wants it
   * keeps it; it is dropped after that render, so nothing drawn later is handed an old press.
   */
  const [handed, setHanded] = useState<{ readonly side: SideIndex; readonly press: HandedPress } | null>(null);
  useEffect(() => {
    if (handed !== null) setHanded(null);
  }, [handed]);
  const pressOn = useCallback(
    (side: SideIndex) => (press: HandedPress) => {
      setHanded({ side, press });
      setActiveSide(side);
    },
    [setActiveSide],
  );

  /*
   * A LINKED PAIR'S POLYGON IN PROGRESS, held here so both halves draw it and the view moving to the
   * other half keeps it, as legacy's linked viewers each hold the same one (`pairDraft.ts`). Another
   * pair, unlinking or another tool starts again.
   */
  const drafting = linked && activeTool === "polygon" && viewer !== undefined && right.open !== null;
  const [linkedDraft, setLinkedDraft] = useState<PolygonDraft>(EMPTY_DRAFT);
  useEffect(() => setLinkedDraft(EMPTY_DRAFT), [pairKey, drafting]);
  const pairDraft = useMemo<PairDraft | null>(
    () => (drafting ? { draft: linkedDraft, setDraft: setLinkedDraft } : null),
    [drafting, linkedDraft],
  );

  // The store's word for legacy's `view_mode == "multi"`: while this is on screen, the keys legacy
  // applies to both viewers act on both sides (CP-31).
  useEffect(() => {
    setMultiView(true);
    return () => setMultiView(false);
  }, [setMultiView]);

  /*
   * THE OTHER HALF MOVES WITH THE VIEW. Legacy's W, A, S and D pan both viewers, each by a tenth of
   * its own size (viewport_manager.py:45-50, 52-79). The view pans its own half and asks for this
   * one through `PairPanContext`. Each half's picture keeps its element here for that.
   */
  const leftPicture = useRef<HTMLDivElement | null>(null);
  const rightPicture = useRef<HTMLDivElement | null>(null);
  const panOtherHalf = useCallback<PairPan>(
    (dx, dy, multiplier) => {
      const picture = (activeSide === 0 ? rightPicture : leftPicture).current;
      if (picture !== null) panPane(picture, dx, dy, multiplier);
    },
    [activeSide],
  );

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
          {linkReport.erase === true ? "Erased in" : "Added to"} {linkReport.where ?? "this image"} only:{" "}
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
      <PaneScrollContext.Provider value={paneScroll}>
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
                    <ViewKindContext.Provider value="multi">
                      <PairPanContext.Provider value={panOtherHalf}>
                        <PairAiContext.Provider value={pairAi}>
                          <PairPressContext.Provider value={handed?.side === side ? handed.press : null}>
                            <PairDraftContext.Provider value={pairDraft}>{viewer}</PairDraftContext.Provider>
                          </PairPressContext.Provider>
                        </PairAiContext.Provider>
                      </PairPanContext.Provider>
                    </ViewKindContext.Provider>
                  </div>
                ) : (
                  <Pane
                    side={sides[side]}
                    index={side}
                    picture={side === 0 ? leftPicture : rightPicture}
                    pixelsUrl={pixelsUrl}
                    {...(tileUrl === undefined ? {} : { tileUrl })}
                    // The linked prompt, drawn here too, with this image's own answer to it.
                    {...(pairAi === null
                      ? {}
                      : { ai: { prompt: pairAi.prompt, result: pairAi.results[side], classId: aiClassId } })}
                    // The linked polygon in progress, drawn here too.
                    {...(pairDraft === null ? {} : { draft: pairDraft.draft })}
                    // A press here is the tool's, as in legacy's non-active viewer.
                    {...(viewer !== undefined && PRESS_TOOLS.has(activeTool)
                      ? {
                          press: {
                            tool: activeTool as PressTool,
                            classId: classForNewSegment(sides[side].segments, activeClassId),
                            onPress: pressOn(side),
                          },
                        }
                      : {})}
                  />
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
      </PaneScrollContext.Provider>
    </div>
  );
}

/** The pixel size this side has been measured at, or null while it is still loading. */
function sizeOf(side: SideState): ImageSize | null {
  const metadata = side.open?.metadata;
  if (metadata === undefined || metadata === null) return null;
  return { width: metadata.width, height: metadata.height };
}

/** What a press on the half not being edited is for: the tool, its colour, and where it goes. */
interface PressProps {
  readonly tool: PressTool;
  readonly classId: number;
  readonly onPress: (press: HandedPress) => void;
}

function Pane({
  side,
  index,
  picture,
  pixelsUrl,
  tileUrl,
  ai,
  draft,
  press,
}: {
  readonly side: SideState;
  readonly index: SideIndex;
  /** Kept pointing at the picture's scrolling box, which the pan keys move. */
  readonly picture: RefObject<HTMLDivElement | null>;
  readonly pixelsUrl: (key: string, processing: ImageProcessing) => string;
  readonly tileUrl?: (key: string, processing: ImageProcessing, z: number, x: number, y: number) => string;
  readonly ai?: PairPromptProps;
  readonly draft?: PolygonDraft;
  readonly press?: PressProps;
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
    <SidePicture
      side={side}
      index={index}
      size={size}
      picture={picture}
      pixelsUrl={pixelsUrl}
      {...(tileUrl === undefined ? {} : { tileUrl })}
      {...(ai === undefined ? {} : { ai })}
      {...(draft === undefined ? {} : { draft })}
      {...(press === undefined ? {} : { press })}
    />
  );
}

/**
 * One half's picture, at its own zoom: fitted to its half as the view is fitted to the pane, or
 * drawn at the zoom it was left at and scrolled by the pan keys, as legacy's second viewer keeps
 * its own zoom and moves with the first (viewport_manager.py:45-50). Fitting the pair fits it too.
 *
 * The wheel zooms it, about the pointer, and it alone: each of legacy's viewers scales itself under
 * the wheel and the signal that would sync them is connected to nothing (photo_viewer.py:180-190).
 * It is put back where it was scrolled to when the view leaves it (`pairPan.ts`).
 */
function SidePicture({
  side,
  index,
  size,
  picture,
  pixelsUrl,
  tileUrl,
  ai,
  draft,
  press,
}: {
  readonly side: SideState;
  readonly index: SideIndex;
  readonly size: ImageSize;
  readonly picture: RefObject<HTMLDivElement | null>;
  readonly pixelsUrl: (key: string, processing: ImageProcessing) => string;
  readonly tileUrl?: (key: string, processing: ImageProcessing, z: number, x: number, y: number) => string;
  readonly ai?: PairPromptProps;
  readonly draft?: PolygonDraft;
  readonly press?: PressProps;
}): ReactNode {
  const { attach, scale } = useFittedPane(size, picture);
  const { setZoomOn } = useWorkspace();
  const zoomHere = useCallback((zoom: number) => setZoomOn(index, zoom), [index, setZoomOn]);
  const attachWheel = useWheelZoom(side.zoom, scale, zoomHere, picture);
  const paneScroll = useContext(PaneScrollContext);
  const attachPicture = useCallback(
    (element: HTMLDivElement | null) => {
      const unmeasure = attach(element);
      const unlisten = attachWheel(element);
      const unkeep = element === null ? undefined : paneScroll?.keep(index, element);
      return () => {
        unmeasure?.();
        unlisten?.();
        unkeep?.();
      };
    },
    [attach, attachWheel, index, paneScroll],
  );
  const key = side.open?.image.key ?? "";
  return (
    <div
      className={side.zoom === null ? "split__picture" : "split__picture split__picture--zoomed"}
      ref={attachPicture}
    >
      <AnnotationCanvas
        imageUrl={pixelsUrl(key, side.processing)}
        {...(tileUrl === undefined
          ? {}
          : { tileUrl: (z: number, x: number, y: number) => tileUrl(key, side.processing, z, x, y), pane: picture })}
        width={size.width}
        height={size.height}
        zoom={side.zoom ?? scale}
        // The LIVE segments, straight from the store, so an edit made in the view appears here as
        // it happens rather than at the next reload.
        segments={side.segments satisfies readonly WireSegment[]}
        // Highlighted as the view highlights its own: a linked pair selects the same rows in both
        // images, and legacy highlights them in the other viewer (main_window.py:6319).
        selected={side.selected}
      >
        {ai !== undefined && <PairPrompt {...ai} width={size.width} height={size.height} />}
        {draft !== undefined && draft.vertices.length > 0 && (
          <PairDraftMarks draft={draft} width={size.width} height={size.height} />
        )}
        {press !== undefined && (
          <IdlePress
            {...press}
            name={side.open?.image.name ?? ""}
            width={size.width}
            height={size.height}
          />
        )}
      </AnnotationCanvas>
    </div>
  );
}

interface PairPromptProps {
  readonly prompt: AiPrompt;
  /** This image's own model's answer to the prompt, or null: none yet, failed, or not asked. */
  readonly result: WireSegmentResponse | null;
  readonly classId: number;
}

/**
 * A linked AI prompt over the half not being edited: the same points and box at the same pixels,
 * and THIS image's own answer to them, as legacy draws each point and each viewer's own preview in
 * every target viewer (main_window.py:6666-6672, 6741-6776, 6806-6851). Clicks pass through it, so
 * a click on the half still makes it the one edited.
 */
function PairPrompt({
  prompt,
  result,
  classId,
  width,
  height,
}: PairPromptProps & { readonly width: number; readonly height: number }): ReactNode {
  const sizing = useSizing();
  const surface = useRef<SVGSVGElement>(null);
  // Image pixels per screen pixel, so a dot is the size the view draws it at any zoom.
  const box = surface.current?.getBoundingClientRect();
  const perPixel =
    box === undefined || box.width <= 0 || box.height <= 0
      ? { x: 1, y: 1 }
      : pixelsPerScreenPixel(box, { width, height });
  return (
    <svg
      ref={surface}
      className="split__prompt"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label="AI prompt"
    >
      {result !== null && <AiPreview result={result} classId={classId} />}
      <AiMarks prompt={prompt} classId={classId} perPixel={perPixel} sizing={sizing} />
    </svg>
  );
}

/**
 * A linked polygon in progress over the half not being edited, at the same pixels, as legacy draws
 * each vertex and edge in both linked viewers (main_window.py:5680-5706): the view's cyan line and
 * blue points (`PolygonLayer`). Clicks pass through it to the half.
 */
function PairDraftMarks({
  draft,
  width,
  height,
}: {
  readonly draft: PolygonDraft;
  readonly width: number;
  readonly height: number;
}): ReactNode {
  const sizing = useSizing();
  const surface = useRef<SVGSVGElement>(null);
  const box = surface.current?.getBoundingClientRect();
  const perPixel =
    box === undefined || box.width <= 0 || box.height <= 0
      ? { x: 1, y: 1 }
      : pixelsPerScreenPixel(box, { width, height });
  const strokeWidth = Math.max(perPixel.x, perPixel.y) * sizing.line;
  return (
    <svg
      ref={surface}
      className="split__prompt"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label="Polygon in progress"
    >
      {draft.vertices.length > 1 && (
        <polyline
          points={draft.vertices.map((v) => `${v.x},${v.y}`).join(" ")}
          fill="none"
          stroke="rgb(0, 255, 255)"
          strokeWidth={strokeWidth}
        />
      )}
      {draft.vertices.map((vertex, index) => (
        <ellipse
          key={index}
          data-testid={`pair-vertex-${index}`}
          cx={vertex.x}
          cy={vertex.y}
          rx={4 * perPixel.x * sizing.point}
          ry={4 * perPixel.y * sizing.point}
          fill="rgb(0, 0, 255)"
        />
      ))}
    </svg>
  );
}
