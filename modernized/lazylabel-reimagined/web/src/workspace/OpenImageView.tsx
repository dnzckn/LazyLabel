/**
 * The image that is open: its pixels, its annotations, and what can be done with them.
 *
 * Split out of `DatasetBrowser` when the workspace store landed. The browser lists a folder and the
 * shell puts that list on the right; this is what goes in the middle, which is legacy's arrangement
 * and the one its users know. Before the split, one component held both, so the layout could not
 * place them separately without the state following one of them into the wrong pane.
 *
 * It reads the open image from the workspace store rather than taking it as a prop, because four
 * other things ask the same question and a prop chain would make this one the owner by accident.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { normalizeExportFormats } from "@lazylabel/settings-schema";
import type {
  WireDatasetImage,
  WireImageMetadata,
  WireSaveRequest,
  WireSaveResponse,
  WireSegment,
} from "@lazylabel/contracts";

import { AnnotationCanvas, segmentAt } from "../canvas/AnnotationCanvas.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useWorkspace, type LeaveSave, type SideIndex } from "./WorkspaceProvider.jsx";
import type { Crop } from "../tools/crop.js";
import { PolygonLayer, toWireVertices } from "../canvas/PolygonLayer.jsx";
import { AiTool } from "./AiTool.jsx";
import { SelectLayer } from "../canvas/SelectLayer.jsx";
import { ShapeLayer } from "../canvas/ShapeLayer.jsx";
import { EditLayer } from "../canvas/EditLayer.jsx";
import { adjustmentsFrom } from "../tools/adjustments.js";
import { processingParams, processingQuery } from "./processing.js";
import type { ImagePoint } from "../canvas/coordinates.js";
import { classForNewSegment } from "./classes.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";

import type { AnnotationsResult, ApiClient } from "../api/client.js";
import { RESOLUTION_DEFAULT } from "../tools/autoPolygon.js";
import { clampZoom } from "../canvas/fit.js";
import { useHotkey, useKeyHint } from "../hotkeys/HotkeyProvider.jsx";
import { CropLayer } from "../canvas/CropLayer.jsx";
import { canSave, deletionNotice } from "./saveState.js";
import { PanLayer } from "../canvas/PanLayer.jsx";
import { panPane } from "../canvas/panStep.js";
import { useFittedPane } from "../canvas/useFittedPane.js";
import { PairPanContext } from "../split/pairPan.js";

/** Reads the store and hands the parts to the presentation below. */
export function OpenImageView({
  client,
  projectId,
  folderKeys = [],
  archetypes = [],
}: {
  readonly client: ApiClient;
  readonly projectId: string;
  /** The folder in the order the user steps through it, for RULE-091's prefetch. */
  readonly folderKeys?: readonly string[];
  /** Frames Find Archetypes suggested. RULE-091 encodes the first uncached one first. */
  readonly archetypes?: readonly string[];
}): ReactNode {
  const { open, processing } = useWorkspace();

  // Legacy's words for a viewer with nothing in it (main_window.py:3086).
  if (open === null) return <p className="open-image__empty">No image loaded</p>;

  return (
    <OpenedImage
      client={client}
      projectId={projectId}
      folderKeys={folderKeys}
      archetypes={archetypes}
      image={open.image}
      result={open.result}
      error={open.error}
      metadata={open.metadata}
      // RULE-029 and RULE-032 run on the SERVER, because they belong before the 16-bit to 8-bit
      // conversion and the browser only ever receives what comes after it. The query is "" when
      // nothing is asked for, so an unprocessed image keeps the URL the browser has cached.
      pixelsUrl={client.pixelsUrl(projectId, open.image.key, processingQuery(processing))}
      // C8: the same picture a tile at a time, so a 50-megapixel image fitted to the pane costs a
      // few hundred kilobytes rather than 41 MB and a half-second stall.
      tileUrl={(z, x, y) =>
        client.tileUrl(projectId, open.image.key, z, x, y, processingQuery(processing))
      }
    />
  );
}

function OpenedImage({
  client,
  projectId,
  folderKeys,
  archetypes,
  image,
  result,
  error,
  metadata,
  pixelsUrl,
  tileUrl,
}: {
  readonly client: ApiClient;
  readonly projectId: string;
  /** The folder in the order the user steps through it, for RULE-091's prefetch. */
  readonly folderKeys: readonly string[];
  /** Frames Find Archetypes suggested. RULE-091 encodes the first uncached one first. */
  readonly archetypes: readonly string[];
  readonly image: WireDatasetImage;
  readonly result: AnnotationsResult | null;
  readonly error: string | null;
  readonly metadata: WireImageMetadata | null;
  readonly pixelsUrl: string;
  /** One tile of the same picture (C8). The canvas falls back to `pixelsUrl` if tiles fail. */
  readonly tileUrl?: (z: number, x: number, y: number) => string;
}): ReactNode {
  const { settings } = useSettings();
  // The LIVE names, not the ones the file held: a class renamed since loading must be written
  // with its new name, or the rename is lost on the next save.
  const { classAliases } = useWorkspace();
  const { segments, addSegment, replaceSegments, activeTool, activeClassId, selected, toggleSelected } =
    useWorkspace();
  const { eraseWith } = useWorkspace();
  // The crop is the store's, not this view's: the SAVE path reads it, so a crop dragged here and
  // held locally would be one the panel showed and the file never saw.
  const { crop, setCrop, zoom, processing, setFitted } = useWorkspace();

  /*
   * PANNING THE ZOOMED IMAGE FROM THE KEYBOARD -- the four `pan_*` keys, which the reference has
   * promised since Phase 2 while nothing listened, and `pan_multiplier`, the last setting outside
   * C11 and RULE-089 with no reader.
   *
   * Scrolling the pane rather than transforming the canvas. The pane already scrolls once an image
   * is larger than it, so this moves the thing that moves -- a transform would be a second way to
   * position the image, and the two would disagree the moment a user used the scrollbar.
   *
   * `pan_multiplier` scales the step, as legacy's does: its value is a factor on a base step, so 1
   * is normal and 2 moves twice as far per press. A user on a large scan wants fewer presses to
   * cross it.
   */
  const scrollRef = useRef<HTMLDivElement>(null);

  /*
   * FITTED, AS LEGACY FITS: the whole image, as large as the pane allows, smaller images enlarged
   * too (photo_viewer.py:42-54). The pane is measured whenever it changes size, which is also when
   * the window does, and the scale goes to the store so the zoom buttons step from what is shown.
   *
   * Measured through a callback ref, because the pane exists only once the metadata has arrived.
   */
  const { attach: attachPane, scale: fitted } = useFittedPane(metadata, scrollRef);
  useEffect(() => setFitted(fitted), [fitted, setFitted]);
  useEffect(() => () => setFitted(null), [setFitted]);
  const rawPan = Number(settings.values["pan_multiplier"]);
  const panMultiplier = Number.isFinite(rawPan) && rawPan > 0 ? Math.min(10, rawPan) : 1;
  // In the Multi tab, the other half: legacy pans both viewers (viewport_manager.py:45-50, CP-31).
  const panOtherHalf = useContext(PairPanContext);
  const pan = useCallback(
    (dx: number, dy: number) => {
      // A tenth of the view a press, as legacy's (`panStep.ts`).
      const pane = scrollRef.current;
      if (pane !== null) panPane(pane, dx, dy, panMultiplier);
      panOtherHalf?.(dx, dy, panMultiplier);
    },
    [panMultiplier, panOtherHalf],
  );

  useHotkey("pan_left", () => pan(-1, 0));
  useHotkey("pan_right", () => pan(1, 0));
  useHotkey("pan_up", () => pan(0, -1));
  useHotkey("pan_down", () => pan(0, 1));

  /*
   * THE WHEEL ZOOMS, as legacy's does: 1.25x a notch in, 0.8x a notch out, about the point under
   * the pointer (photo_viewer.py:180-185, with AnchorUnderMouse at :28). It scrolled the pane
   * instead, so the gesture every desktop viewer zooms with scrolled the picture away
   * (`CONTROL_PARITY.md` CP-17).
   *
   * By the notch, not the event: a mouse sends 100 pixels a notch, a trackpad a stream of small
   * deltas, and zooming on each of those would fly past any size a user wanted. Listened to
   * natively, because React's wheel handler is passive and cannot stop the scroll.
   */
  const { setZoom } = useWorkspace();
  const zoomNow = useRef(1);
  zoomNow.current = zoom ?? fitted ?? 1;
  const wheelTravel = useRef(0);
  /** Where the pane should scroll once the new zoom is drawn, to keep the pointed-at point put. */
  const pendingScroll = useRef<{ readonly left: number; readonly top: number } | null>(null);

  const attachWheel = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) return undefined;
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        wheelTravel.current += event.deltaY * (event.deltaMode === 1 ? 100 / 3 : event.deltaMode === 2 ? 100 : 1);
        const notches = Math.trunc(wheelTravel.current / 100);
        if (notches === 0) return;
        wheelTravel.current -= notches * 100;

        const from = zoomNow.current;
        // Up, away from the user, is a negative delta and zooms in.
        const to = clampZoom(from * (notches < 0 ? 1.25 : 0.8) ** Math.abs(notches));
        if (to === from) return;

        const box = element.getBoundingClientRect();
        const x = event.clientX - box.left;
        const y = event.clientY - box.top;
        pendingScroll.current = {
          left: (element.scrollLeft + x) * (to / from) - x,
          top: (element.scrollTop + y) * (to / from) - y,
        };
        zoomNow.current = to;
        setZoom(to);
      };
      element.addEventListener("wheel", onWheel, { passive: false });
      return () => element.removeEventListener("wheel", onWheel);
    },
    [setZoom],
  );

  useLayoutEffect(() => {
    const target = pendingScroll.current;
    const pane = scrollRef.current;
    if (target === null || pane === null) return;
    pendingScroll.current = null;
    pane.scrollLeft = Math.max(0, target.left);
    pane.scrollTop = Math.max(0, target.top);
  }, [zoom]);

  // One ref for the pane: measured for fitting, and listened to for the wheel.
  const attachScrollPane = useCallback(
    (element: HTMLDivElement | null) => {
      const unmeasure = attachPane(element);
      const unlisten = attachWheel(element);
      return () => {
        unmeasure?.();
        unlisten?.();
      };
    },
    [attachPane, attachWheel],
  );
  const { notify } = useNotifications();
  // Only a context failure falls back to the plain image. A picture that will not DECODE is the
  // canvas's own business -- it reports that and still draws the annotations, which is worth more
  // than a broken-image icon with nothing on it.
  const [canvasFailed, setCanvasFailed] = useState(false);
  const onCanvasError = useCallback(
    (reason: string) => {
      if (reason.includes("2D canvas")) setCanvasFailed(true);
      notify({ severity: "warning", message: reason });
    },
    [notify],
  );
  // RULE-028, read from the same settings the panel writes. Neutral values cost nothing: the
  // canvas skips the whole read-modify-write when there is no adjustment to make.
  const adjustments = useMemo(() => adjustmentsFrom(settings.values), [settings.values]);
  const joinThreshold = Number(settings.values["polygon_join_threshold"]);
  const fragmentThreshold = Number(settings.values["fragment_threshold"] ?? 0);
  // Legacy's Auto-Convert. Read here rather than inside the tool so that the tool takes a value
  // and the settings are looked up in one place per panel, as every other setting is.
  const autoPolygon = {
    enabled: settings.values["auto_polygon_enabled"] === true,
    resolution: Number(settings.values["polygon_resolution"] ?? RESOLUTION_DEFAULT),
  };
  // A manifest NAME, not a file path. Empty means none chosen -- which, since legacy's default is
  // chosen when it can be (useDefaultModel), means none can be -- and a click in AI mode says so
  // rather than sending a request the service can only refuse.
  const aiModel = String(settings.values["ai_model"] ?? "");


  // One commit path for every manual tool. Three copies of "work out the class, wrap the vertices,
  // record it" is three places for them to disagree about which class the shape takes.
  const commit = useCallback(
    (type: "Polygon" | "Circle", vertices: readonly ImagePoint[], label: string) => {
      addSegment(
        { type, classId: classForNewSegment(segments, activeClassId), vertices: toWireVertices(vertices) },
        label,
      );
    },
    [activeClassId, addSegment, segments],
  );

  const refuse = useCallback(
    (reason: string) => notify({ severity: "warning", message: reason }),
    [notify],
  );

  /*
   * HOVER, as legacy's items take it: the topmost segment under the pointer is drawn at 170 rather
   * than 70, whatever the tool (hoverable_polygon_item.py:28, hoverable_pixelmap_item.py:26). The
   * pointer is followed on the stack, which every drawing layer sits in, so no layer has to pass
   * its moves on. The stack is exactly the picture (drawingSurface.test.ts), so its box scales to
   * image pixels as the layers' own boxes do.
   */
  const [hovered, setHovered] = useState<WireSegment | null>(null);
  const hoverAt = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (metadata === null) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const x = ((event.clientX - box.left) / box.width) * metadata.width;
      const y = ((event.clientY - box.top) / box.height) * metadata.height;
      const index = segmentAt(segments, x, y);
      setHovered(index < 0 ? null : segments[index]!);
    },
    [metadata, segments],
  );

  /**
   * Cut the drawn shape out of every annotation it overlaps.
   *
   * The erase shape is rasterized through the same path a saved annotation takes, so what the
   * eraser removes is exactly what would have been written -- the alternative is an eraser that
   * agrees with the outline on screen and disagrees with the file.
   */
  const eraseAndSay = useCallback(
    (eraser: WireSegment) => {
      // The store erases -- here, and at the same pixels in the other image while a pair is linked
      // (RULE-092) -- so what is left for this view is saying what happened.
      const outcome = eraseWith(eraser);

      if (outcome.kind === "empty-shape") {
        notify({ severity: "warning", message: "that shape covers no pixels, so nothing was erased" });
        return;
      }
      if (outcome.kind === "nothing") {
        // Legacy's words, and saying nothing at all would leave a user wondering whether the
        // gesture registered.
        notify({ severity: "info", message: "No segments to erase" });
        return;
      }
      if (outcome.vanished > 0) {
        // RULE-009 discards every remaining piece of ten pixels or fewer, so an annotation can
        // disappear entirely -- what remained of it was under the 10-pixel minimum. Legacy does
        // this silently; a deletion nobody is told about is the shape of defect decision 7 exists
        // to remove.
        notify({
          severity: "warning",
          message:
            `${outcome.vanished} annotation${outcome.vanished === 1 ? " was" : "s were"} removed completely`,
          irreversible: false,
        });
      }
    },
    [eraseWith, notify],
  );

  /** A drawn shape erases by being rasterized first -- the same path a saved annotation takes. */
  const applyErase = useCallback(
    (type: "Polygon" | "Circle", vertices: readonly ImagePoint[]) =>
      eraseAndSay({
        type,
        classId: null,
        vertices: vertices.map((v) => [v.x, v.y] as const),
      } as unknown as WireSegment),
    [eraseAndSay],
  );

  return (
    // No heading: legacy's viewer has none. The picture takes the pane; its name, its size and
    // everything else are in the strip under it.
    <section className="open-image">
      {metadata !== null && (
        <>
          {/* The API re-encodes every image, so what is shown here is the same 8-bit RGB the model
              is given. A 16-bit file cannot look one way on screen and arrive at SAM another.

              Once the annotations are in, the canvas draws them over it; until then a plain image
              shows the picture rather than an empty box. */}
          {/* The drawing layer sits OVER whichever of these is showing, so an image with no
              annotation file can still be annotated -- which is the usual way a dataset starts.

              THE CANVAS DRAWS WHATEVER IS LIVE, not only what a file held. It used to be shown
              only when the load returned annotations, which meant an image with NO annotation file
              -- the first image of every new dataset -- showed a plain picture, and every shape
              drawn on it stayed invisible until the user saved and came back. The canvas with no
              segments renders exactly what that plain picture did, so there was nothing to gain by
              the split.

              The `<img>` survives as the fallback for a browser that gives no 2D context, where
              the canvas can show nothing at all. */}
          {/* Fitted, nothing overflows, so no scrollbar can appear and shrink the pane it was
              measured from. Zoomed, it scrolls. */}
          <div
            className={zoom === null ? "canvas-scroll canvas-scroll--fit" : "canvas-scroll"}
            ref={attachScrollPane}
          >
          <div className="canvas-stack" onPointerMove={hoverAt} onPointerLeave={() => setHovered(null)}>
            {canvasFailed ? (
              <img className="preview" src={pixelsUrl} alt={image.name} />
            ) : (
              <AnnotationCanvas
                imageUrl={pixelsUrl}
                width={metadata.width}
                height={metadata.height}
                segments={segments}
                adjustments={adjustments}
                zoom={zoom ?? fitted}
                onError={onCanvasError}
                hovered={hovered}
                selected={selected}
                // Edit (R) is the "none" tool here (ModeControls), where selected shapes carry
                // their vertex handles.
                editing={activeTool === "none"}
                {...(tileUrl === undefined ? {} : { tileUrl, pane: scrollRef })}
              />
            )}

            {activeTool === "ai" &&
              (aiModel === ""
                ? (
                    // No model can be chosen for it (useDefaultModel picks legacy's default when one
                    // can), so a click says why nothing happens instead of doing nothing silently.
                    <svg
                      className="polygon-layer"
                      viewBox={`0 0 ${metadata.width} ${metadata.height}`}
                      preserveAspectRatio="none"
                      role="application"
                      aria-label="AI tool, no model chosen"
                      onPointerDown={() =>
                        notify({
                          severity: "info",
                          message: "The AI tool has no model: choose one in AI Model Selection",
                        })
                      }
                    />
                  )
                : (
                    <AiTool
                      client={client}
                      imageKey={image.key}
                      width={metadata.width}
                      height={metadata.height}
                      classId={classForNewSegment(segments, activeClassId)}
                      model={aiModel}
                      folderKeys={folderKeys}
                      archetypes={archetypes}
                      fragmentThreshold={fragmentThreshold}
                      autoPolygon={autoPolygon}
                      {...(settings.values["operate_on_view"] === true
                        ? { operateOnView: { adjustments: { ...adjustments }, processing: processingParams(processing) } }
                        : {})}
                      onAccept={(segment) => addSegment(segment, "Accept AI mask")}
                      // The MASK erases, not its bounding box: an AI mask is rarely a
                      // rectangle, and erasing its box would take out pixels the model never
                      // selected.
                      onErase={(segment) =>
                        segment.mask === undefined ? undefined : eraseAndSay(segment)
                      }
                    />
                  ))}

            {activeTool === "select" && (
              <SelectLayer
                width={metadata.width}
                height={metadata.height}
                segments={segments}
                selected={selected}
                onToggle={toggleSelected}
                onMiss={() =>
                  notify({ severity: "info", message: "Nothing there to select" })
                }
              />
            )}

            {/* Legacy's Edit mode (R), which is the "none" tool here (ModeControls). Every selected
                polygon and circle gets its vertex handles, and a press anywhere else on the image
                drags the whole selection, as legacy's does (edit_mode_manager.py:94-135,
                single_view_mouse_handler.py:81-97). It is mounted with nothing selected too, so the
                pointer is legacy's Edit cursor and a press there does nothing.

                Every selected shape, not only one: legacy does not refuse several, whatever this
                comment used to say (CONTROL_PARITY.md CP-16). A drag moves the vertex it grabbed,
                and each handle knows whose it is. */}
            {activeTool === "none" && (
              <EditLayer
                width={metadata.width}
                height={metadata.height}
                segments={segments}
                selected={selected}
                // The shapes follow the pointer live and the drag is recorded once, at release,
                // with the shapes as they were before it -- one undo per drag.
                onPreview={(moved) => replaceSegments(moved)}
                onCommit={(before, after, label) => replaceSegments(after, { label, before })}
                // RULE-046's warning for a polygon over the 200-vertex limit goes to the
                // notifications rather than being drawn over the image.
                onNotice={(message) => notify({ severity: "info", message })}
              />
            )}

            {activeTool === "pan" && (
              <PanLayer
                width={metadata.width}
                height={metadata.height}
                pane={scrollRef}
                multiplier={panMultiplier}
              />
            )}

            {activeTool === "crop" && (
              <CropLayer
                width={metadata.width}
                height={metadata.height}
                crop={crop}
                onCrop={setCrop}
                onRefused={refuse}
              />
            )}

            {activeTool === "polygon" && (
              <PolygonLayer
                width={metadata.width}
                height={metadata.height}
                joinThreshold={joinThreshold}
                onComplete={(vertices) => commit("Polygon", vertices, "Add polygon")}
                onErase={(vertices) => applyErase("Polygon", vertices)}
                onRefused={refuse}
              />
            )}

            {(activeTool === "box" || activeTool === "circle") && (
              <ShapeLayer
                kind={activeTool}
                width={metadata.width}
                height={metadata.height}
                classId={classForNewSegment(segments, activeClassId)}
                onComplete={(vertices) =>
                  // A box is stored as a four-corner POLYGON -- nothing downstream knows it was
                  // drawn as a box. A circle keeps its own type, because its two vertices are a
                  // centre and a radius point rather than an outline.
                  commit(
                    activeTool === "box" ? "Polygon" : "Circle",
                    vertices,
                    activeTool === "box" ? "Add box" : "Add circle",
                  )
                }
                onErase={(vertices) =>
                  applyErase(activeTool === "box" ? "Polygon" : "Circle", vertices)
                }
                onRefused={refuse}
              />
            )}
          </div>
          </div>
        </>
      )}

      {/* OUTSIDE the "loaded" block, deliberately.

          It used to live inside it, which meant an image with NO annotation file -- the first
          image of every new dataset -- had no save button at all. A user could draw as much as
          they liked and had no way to write any of it. That is the same branch, and the same
          mistake, that once made those drawings invisible: "has a file" is not "can be saved to".

          `annotations` is what the file HELD, which is nothing here. The live segments and class
          names come from the store, as they have to -- anything drawn or renamed since loading
          would otherwise be dropped on save. */}
      <div className="open-image__info">
      {/* A caption, not a heading: it names the picture without taking space above it. */}
      <span className="open-image__name">{image.name}</span>
      {metadata !== null && (
        // A 16-bit image is shown and sent to the model as value / 256, truncated (RULE-024); the
        // line said so until the owner asked for no explanations on 2026-09-26.
        <p className="provisional">
          {metadata.width} x {metadata.height}, {metadata.sourceFormat}
          {metadata.sourceDepth === 16 ? ", 16-bit" : ""}
        </p>
      )}

      {metadata !== null && (
        <ConvertButton
          /* KEYED ON THE IMAGE, so the outcome of the last save is forgotten when a different one
             opens. The revision the next write is conditional on is NOT kept here any more: the
             store holds it per side, because this button remounts whenever the view moves between
             the centre tabs, and a revision it forgot turned the next save into a conflict with the
             app's own previous write. It is shown for every image, including one with no
             annotation file, which is how a dataset starts. */
          key={image.key}
          client={client}
          projectId={projectId}
          image={image}
          size={[metadata.height, metadata.width]}
        />
      )}


      {error !== null && (
        <p role="alert" className="banner banner--error">
          {image.name} could not be opened: {error}
        </p>
      )}

      {result === null && error === null && <p>Opening…</p>}

      {/* Three different answers, never collapsed into one. Decision 15d. */}
      {result?.kind === "none" && <p>This image has no annotation file.</p>}

      {/* Decision 15d's banner. Nothing is deleted on this path (15c); the banner said so too until
          the owner asked for messages as short as legacy's (2026-09-26). */}
      {result?.kind === "failed" && (
        <p role="alert" className="banner banner--error">
          Annotations for {image.name} could not be read: {result.message}
        </p>
      )}

      {result?.kind === "loaded" && (
        <>
          <p>
            {result.annotations.segments.length} objects, read from{" "}
            <code>{result.annotations.sourceFile}</code> ({result.annotations.sourceFormat}).
          </p>

          {/* The desktop app's own name table is read as data; a table in any other shape is
              refused, for safety. The objects and their class ids are fine and the NAMES are
              missing, so a Pascal VOC or CreateML file written now would say "3" where the original
              said "stop sign" without looking wrong -- which a user needs before saving, so it is
              the tooltip rather than lost with the paragraph (2026-09-26). */}
          {result.annotations.unreadableAliases === true && (
            <p
              role="status"
              className="banner banner--warning"
              title="Saving to Pascal VOC or CreateML now would write the class ids where the names belong"
            >
              Class names could not be read from this file
            </p>
          )}

          {result.annotations.rejected > 0 && (
            <p role="status" className="banner banner--warning">
              {result.annotations.rejected} unreadable lines or objects skipped
            </p>
          )}

          {/* A recovery the user is not told about is what decision 15c forbids: a higher-priority
              annotation file could not be read, so these came from a lower one. */}
          {result.annotations.failures.length > 0 && (
            <p role="status" className="banner banner--warning">
              Loaded from {result.annotations.sourceFormat}; could not read{" "}
              {result.annotations.failures.map((f) => `${f.format} (${f.reason})`).join("; ")}
            </p>
          )}

          {/* The file's class names are the class table's aliases; this line listed them again
              until 2026-09-26. */}
        </>
      )}
      </div>
    </section>
  );
}

/**
 * What a save sends for one image: its annotations as they stand, in the selected formats, with its
 * crop and the pixel priority in force, conditional on `expected`. One request for Enter's save and
 * for the Multi view's save of each side (CP-67), so the two cannot write differently.
 */
function saveRequest(
  annotations: {
    readonly segments: readonly WireSegment[];
    readonly classAliases: Readonly<Record<string, string>>;
    readonly crop: Crop | null;
  },
  size: readonly [number, number],
  formats: readonly string[],
  values: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, string | null>>,
): WireSaveRequest {
  const { segments, classAliases, crop } = annotations;
  return {
    imageSize: size,
    formats,
    segments,
    classAliases,
    // RULE-018 is applied on the server, against the same mask tensor the exports are built
    // from -- so what a crop blanks is exactly what the files lose, rather than two
    // implementations of the same rectangle.
    cropCoords: crop === null ? null : [crop.x1, crop.y1, crop.x2, crop.y2],
    // RULE-012: which class wins a pixel two annotations both cover. The API has accepted this
    // since Phase 2 and the client never sent it, so the two settings did NOTHING -- a user
    // whose imported legacy settings turned pixel priority on got masks resolved the other
    // way, and the difference is invisible until an overlap actually occurs.
    // Empty for an image that had no annotation file: there is nothing to be out of date
    // with, and demanding absence would refuse a second save of a file this app just wrote.
    expectedRevisions: expected,
    pixelPriority: {
      enabled: values["pixel_priority_enabled"] === true,
      // Ascending unless explicitly false, which matches the server's own default: the lowest
      // class id wins, as legacy resolves it.
      ascending: values["pixel_priority_ascending"] !== false,
    },
  };
}

/**
 * Persona flow 4's last step: write the chosen formats beside the image -- or, for an image with no
 * segments, delete all seven of its sidecar formats, as legacy's save does (RULE-083; the owner's
 * decision of 2026-09-26).
 *
 * Three things the response says that the button has to pass on rather than swallow, because each
 * of them is a way a save can be less than it looks:
 *
 *   - `stale`, sidecars in formats that were NOT selected and are still on disk. Decision 15f says
 *     report and offer removal, never delete; the offer is Phase 5's, the report is now.
 *   - `skippedEmpty`, a selected format that could not be rendered at all.
 *   - a save that wrote nothing because the class names were missing would look like success, so
 *     the warning above it stays on screen.
 */
function ConvertButton({
  client,
  projectId,
  image,
  size,
}: {
  readonly client: ApiClient;
  readonly projectId: string;
  readonly image: WireDatasetImage;
  readonly size: readonly [number, number];
}): ReactNode {
  const { settings } = useSettings();
  // The LIVE names and segments, not the ones the file held. A class renamed or an annotation
  // drawn since loading has to be written as it now stands, or the edit is lost on the next save.
  // The crop comes from the store for the same reason: it is part of what a save WRITES, and a
  // crop the request leaves out is a crop the panel showed and the file never saw.
  const { classAliases, segments, crop, activeSide, markSavedOn, imageState, revisions, registerSave } =
    useWorkspace();
  // Both sides, for the Multi view's save of each (`saveSide`, below), and Enter's there (`saveKey`).
  const { sides, imageStates, multiView, savePair } = useWorkspace();
  const { notify } = useNotifications();
  const keyOf = useKeyHint();

  /*
   * WHETHER THIS IMAGE MAY BE WRITTEN AT ALL -- and until now the button never asked.
   *
   * `canSave` is false for an image whose annotations could not be READ. Its own comment says it
   * is exported because the button needs the same answer the navigation logic needs, and it was
   * called by neither. The hole that leaves is decision 7's central one: the image loads, its
   * PIXELS are fine, the segment list is empty because the read failed -- and pressing Write puts
   * an empty annotation file over a damaged one that might still have been recoverable. The write
   * is unconditional there too, because a failed load returns no revision to make it conditional
   * on.
   *
   * Disabled with the reason beside it rather than hidden. A missing button is indistinguishable
   * from a bug; a disabled one that says why is an explanation. The save KEY asks the same
   * question, below.
   */
  const writable = canSave(imageState);

  const [state, setState] = useState<
    | { readonly status: "idle" }
    | { readonly status: "saving" }
    | { readonly status: "saved"; readonly result: WireSaveResponse }
    | {
        readonly status: "failed";
        readonly reason: string;
        readonly conflicted?: boolean;
        /** It was a deletion that failed, which may have removed some of the files first. */
        readonly deleting?: boolean;
      }
  >({ status: "idle" });

  /*
   * THE REVISION OF THE FILE THESE ANNOTATIONS CAME FROM, so the write can be CONDITIONAL.
   *
   * The API has supported conditional writes since Phase 2 and the client never sent one, so every
   * save was an unconditional overwrite. That matters most in exactly the arrangement the cutover
   * plan describes: the desktop app stays installed and reads the same folder, so a user can have
   * both open on one image. Without this, whichever writes last wins and the other's work is gone
   * with nothing said.
   *
   * ONLY THE SOURCE FORMAT IS PROTECTED, and that is honest rather than lazy: it is the one file
   * whose contents the user is editing, and it is the only revision the client has. Claiming to
   * guard the other six would need revisions the load never returned.
   *
   * The revisions are the store's (`revisions` above), set by the load and moved on by each save.
   */

  const formats = normalizeExportFormats(settings.values["export_formats"]).formats;

  /** The write under way, which a second save -- or leaving the image -- waits for rather than races. */
  const writing = useRef<Promise<boolean> | null>(null);

  /*
   * `expected` is what the write is conditional on. The button passes the revisions this client
   * read; the recovery below passes `{}`, which is an UNCONDITIONAL write — "overwrite whatever is
   * there now".
   *
   * That is not a hole in the safety, it is the shape decision 7 asks for: nothing is lost without
   * an explicit act, and this is the explicit act, behind its own button, labelled with what it
   * does and shown only after a refusal.
   *
   * Resolves whether it wrote, which is what leaving the image waits on (`LeaveSave`).
   */
  const convert = useCallback((expected: Readonly<Record<string, string | null>>, unchanged = false): Promise<boolean> => {
    // Captured now, not read in the callback below: see `markSavedOn` there.
    const side = activeSide;
    const written = { segments, classAliases, crop };
    setState({ status: "saving" });
    /*
     * THE SAVE OF AN IMAGE LEFT UNCHANGED (`LeaveSave.saveUnchanged`) never keeps the user on it:
     * nothing of this session's is at stake. A write refused because someone else changed the file
     * is skipped, so that file stays as they left it, and said briefly; any other failure is said in
     * legacy's words (`save_export_manager.py:131-133`). Either way the move goes on.
     */
    const skipped = (cause: unknown): boolean => {
      setState({ status: "idle" });
      const conflict =
        typeof cause === "object" && cause !== null && "code" in cause
          && (cause as { code?: unknown }).code === "revision_conflict";
      const file =
        typeof cause === "object" && cause !== null && "detail" in cause
          ? ((cause as { detail?: { key?: unknown } }).detail?.key as string | undefined)
          : undefined;
      notify(
        conflict
          ? {
              severity: "warning",
              message: `Not saved: ${(file ?? image.key).split("/").pop()} changed since you loaded it`,
            }
          : { severity: "error", message: `Error saving: ${cause instanceof Error ? cause.message : String(cause)}` },
      );
      return true;
    };
    /*
     * NO SEGMENTS: THE SAVE DELETES, as legacy's does -- all seven sidecar formats, whatever formats
     * are selected, then "Deleted: ..." or, with nothing there, "No segments to save."
     * (`save_export_manager.py:106-109, 523-542`; RULE-083). The owner's decision of 2026-09-26,
     * "Match the desktop app exactly", reversing "write empty files instead". By Enter, by this
     * button and on leaving the image, since all three are this save. Never for annotations that
     * could not be read: `saveNow` refuses those first, and this button is disabled for them.
     *
     * The image is then as its files are, so it is no longer unsaved -- but it is not SAVED for the
     * sequence timeline, which keeps an emptied frame's status and masks, as legacy's does (SP-58).
     */
    if (segments.length === 0) {
      const erase = client
        .deleteAnnotations(projectId, image.key)
        .then((result) => {
          notify(deletionNotice(result.deleted));
          setState({ status: "idle" });
          markSavedOn(side, { ...written, key: image.key, deleted: true });
          return true;
        })
        .catch((cause: unknown) => {
          if (unchanged) return skipped(cause);
          setState({
            status: "failed",
            deleting: true,
            reason: cause instanceof Error ? cause.message : String(cause),
          });
          return false;
        })
        .finally(() => {
          if (writing.current === erase) writing.current = null;
        });
      writing.current = erase;
      return erase;
    }
    const write = client
      .saveAnnotations(projectId, image.key, saveRequest(written, size, formats, settings.values, expected))
      .then((result) => {
        setState({ status: "saved", result });
        /*
         * THE IMAGE IS NO LONGER UNSAVED, and nothing said so until now. `markSaved` existed on
         * the store, was covered by its own test, was exposed on the context -- and had no caller
         * anywhere in the app, so `dirty` never cleared once anything was drawn. The status bar
         * and the split view's captions read "unsaved" for the rest of the session, which is the
         * one thing a user checks before closing a tab.
         *
         * BY SIDE, captured when the write started rather than read when it finishes. A save is a
         * round trip and the user can switch panes during it; marking whichever side happens to be
         * active on return would tell them the image they just moved to is saved when it is not.
         */
        // The revisions this write produced become the ones the NEXT write is conditional on.
        // Without this, saving twice would compare against the load's revision the second time and
        // conflict with the app's own previous save. The store keeps them, not this button, which
        // remounts whenever the view moves.
        markSavedOn(side, {
          ...written,
          key: image.key,
          revisions: result.written,
          ...(unchanged ? { unchanged: true } : {}),
        });
        return true;
      })
      .catch((cause: unknown) => {
        if (unchanged) return skipped(cause);
        const reason = cause instanceof Error ? cause.message : String(cause);
        const conflict =
          typeof cause === "object" && cause !== null && "code" in cause
            && (cause as { code?: unknown }).code === "revision_conflict";

        /*
         * WRITTEN, NOT CONCATENATED. Appending an explanation to the server's message put
         * "nothing was written" on screen three times -- the banner is prefixed with it, the API's
         * sentence ends with it, and the explanation said it again. Only running it showed that.
         *
         * A conflict gets its own sentence built from the file the server named, so it says each
         * thing once: what changed, who could have done it, that nothing was lost, and what to do.
         * The server's revision hashes are dropped deliberately -- they are for a log, and a user
         * comparing two base64 strings learns nothing from them.
         */
        const key =
          (typeof cause === "object" && cause !== null && "detail" in cause
            ? ((cause as { detail?: { key?: unknown } }).detail?.key as string | undefined)
            : undefined) ?? "the annotation file";

        setState({
          status: "failed",
          // What decides whether the overwrite recovery is offered. A failure that is NOT a
          // conflict has nothing to overwrite past, so offering it there would be a button that
          // retried the same broken thing.
          conflicted: conflict,
          /*
           * ONE SENTENCE, the fact. It went on to say who could have written the file (the
           * desktop app, another tab, a script), that the annotations on screen are still the
           * user's, and that reloading the image WOULD replace them with what the file now says
           * -- until the owner asked, on 2026-09-26, for messages as short as legacy's. The
           * recovery is the "Save anyway" button beside it; reloading is still the one thing not
           * to do before the annotations on screen are somewhere else.
           */
          reason: conflict ? `${key} changed since you loaded it` : reason,
        });
        return false;
      })
      .finally(() => {
        if (writing.current === write) writing.current = null;
      });
    writing.current = write;
    return write;
  }, [
    activeSide,
    classAliases,
    client,
    crop,
    formats,
    image.key,
    markSavedOn,
    notify,
    projectId,
    revisions,
    segments,
    settings.values,
    size,
  ]);

  /*
   * SAVE, from the keyboard. Ctrl+S and its alternate were in the reference with nothing behind
   * them, which for a save key is the worst one to get wrong: it is the shortcut people press
   * reflexively before closing something, and believing it worked is the belief that loses work.
   *
   * Guarded on `saving` exactly as the button is disabled. Holding the key down would otherwise
   * queue a write per repeat against a revision each one invalidates, so every press after the
   * first would come back a conflict.
   *
   * And guarded on `writable`, as the button is. The key used to skip that check, so on an image
   * whose annotations could not be read Enter wrote an empty file over the damaged one -- the one
   * write the disabled button exists to prevent, from the key a user presses without looking.
   *
   * A press during a write gets that write's outcome rather than a second write.
   */
  const saveNow = (): Promise<boolean> => {
    if (writing.current !== null) return writing.current;
    if (!writable) {
      // Saving would replace a damaged file with an empty one. The way on is to move the file aside
      // and reopen the image, or to repair it outside the app; the notice said so in a second
      // paragraph until 2026-09-26.
      notify({
        severity: "warning",
        message: "Nothing was written: this image's annotations could not be read",
      });
      return Promise.resolve(false);
    }
    return convert(revisions);
  };
  /*
   * ENTER IN THE MULTI VIEW SAVES BOTH SIDES, as legacy's does: its Enter ends in `save_output`,
   * which in the multi view runs the save of both viewers and says "Multi-view annotations saved!"
   * (keyboard_event_manager.py:187-234; save_export_manager.py:86-93, 584-593). The pair save every
   * move makes (CP-67), so the two cannot write differently. Said once both are saved; a side that
   * could not be is said instead, where legacy logs it and says "saved" anyway.
   */
  const saveKey = (): Promise<boolean> =>
    multiView
      ? savePair().then((saved) => {
          if (saved) notify({ severity: "success", message: "Multi-view annotations saved!" });
          return saved;
        })
      : saveNow();
  useHotkey("save_output", saveKey);
  useHotkey("save_output_alt", saveKey);

  /*
   * LEGACY'S MULTI-VIEW SAVE OF ONE SIDE (`main_window.py:6559-6636`), which the store runs for both
   * sides before every move in the Multi view, changed or not and whatever Auto-Save on Navigate
   * says: the owner's decision of 2026-09-26, "Match the desktop app exactly" (CONTROL_PARITY.md
   * CP-67). Enter's request for that side's image, so the two cannot write differently; with no
   * segments, the side's seven sidecars are deleted instead. Silent when it works, as legacy's is:
   * no "Deleted: ..." and no "No segments to save." (6589-6593). A failure is said, and the store
   * keeps the pair where it is.
   *
   * Nothing for a side with no image loaded, and nothing for one whose annotations could not be
   * read, which is never written over or deleted (ASSESSMENT.md SEC-04). Legacy deletes those.
   */
  const saveSide = (at: SideIndex): Promise<boolean> => {
    const side = sides[at];
    const open = side.open;
    if (open === null || open.metadata === null || !canSave(imageStates[at])) return Promise.resolve(true);
    const key = open.image.key;
    const written = { segments: side.segments, classAliases: side.classAliases, crop: side.crop };
    const refused = (cause: unknown): boolean => {
      notify({
        severity: "error",
        message: `Error saving: ${cause instanceof Error ? cause.message : String(cause)}`,
        detail: open.image.name,
      });
      return false;
    };
    if (side.segments.length === 0) {
      return client.deleteAnnotations(projectId, key).then(() => {
        markSavedOn(at, { ...written, key, deleted: true });
        return true;
      }, refused);
    }
    const sized = [open.metadata.height, open.metadata.width] as const;
    return client
      .saveAnnotations(projectId, key, saveRequest(written, sized, formats, settings.values, side.revisions))
      .then((result) => {
        markSavedOn(at, { ...written, key, revisions: result.written });
        return true;
      }, refused);
  };

  /*
   * LENT TO THE STORE, for leaving this image: legacy's Auto-Save on Navigate, on unless turned off
   * (settings_widget.py:39-44), saves the image being left, and by the owner's decision of
   * 2026-09-25 it does so here -- with this save, guards and all, not a second one. Through a ref,
   * so it is lent once per side rather than on every render. The save of either side goes with it,
   * which the store runs for both in the Multi view (CP-67).
   */
  const lent = useRef<LeaveSave>({ enabled: false, save: saveNow });
  // The leaving save of an image the user has not changed, which legacy makes too: Enter's, but
  // never keeping the user on the image. None for one that could not be read (SEC-04).
  const saveUnchanged = (): Promise<boolean> =>
    writing.current ?? (writable ? convert(revisions, true) : Promise.resolve(true));
  lent.current = { enabled: settings.values["auto_save"] !== false, save: saveNow, saveUnchanged, saveSide };
  useEffect(() => registerSave(activeSide, () => lent.current), [activeSide, registerSave]);

  return (
    <div>
      <button
        type="button"
        onClick={() => convert(revisions)}
        disabled={state.status === "saving" || !writable}
        // Disabled with the reason in its tooltip, as legacy explains a control it disables; the
        // reason was a paragraph beside it until 2026-09-26. Otherwise legacy's name for the save
        // key (hotkeys.py:67), since legacy saves with the key rather than a button.
        title={
          writable
            ? `Save Output${keyOf("save_output")}`
            : "This image's annotations could not be read, so nothing can be written over them"
        }
      >
        {state.status === "saving" ? "Writing…" : `Write ${formats.length} format${formats.length === 1 ? "" : "s"}`}
      </button>

      {state.status === "failed" && (
        <>
          {/* For a conflict, what the user needs before acting is the tooltip: their work is still
              on screen, and reopening the image would replace it with the file. */}
          <p
            role="alert"
            className="banner banner--error"
            {...(state.conflicted === true
              ? { title: "The annotations on screen are still yours; reopening the image replaces them with the file" }
              : {})}
          >
            {state.deleting === true ? "Could not delete: " : "Nothing was written: "}
            {state.reason}
          </p>

          {/* Offered only after a refusal, and only for a conflict: an unconditional write is the
              thing the conditional write exists to prevent, so it is a deliberate second press
              rather than a setting or a retry that happens on its own. */}
          {state.conflicted === true && (
            <button type="button" title="Overwrite what is there now" onClick={() => convert({})}>
              Save anyway
            </button>
          )}
        </>
      )}

      {state.status === "saved" && (
        <>
          {Object.keys(state.result.written).length === 0 ? (
            /*
             * A SAVE THAT WROTE NOTHING IS NOT A SAVE, and this rendered "Wrote  beside f01.png."
             * -- a blank list presented as a success. Legacy prints `annotations saved!` from a
             * path that may have written nothing at all, because it reports the INTENT; the whole
             * point of building this from the outcome is not to.
             */
            <p role="status" className="banner banner--warning">
              No files were written for {image.name}.
            </p>
          ) : (
            <p role="status">
              Wrote {Object.keys(state.result.written).join(", ")} beside {image.name}.
            </p>
          )}

          {/* Sidecars in formats that were not selected, still on disk and so possibly out of date
              with what was just saved. Reported, never deleted (decision 15f). */}
          {state.result.stale.length > 0 && (
            <p role="status" className="banner banner--warning">
              Still on disk, not rewritten: {state.result.stale.join(", ")}
            </p>
          )}

          {/* The API's own two-sentence note on why is the tooltip, not a paragraph (2026-09-26). */}
          {state.result.skippedEmpty.length > 0 && (
            <p
              role="status"
              className="banner banner--warning"
              {...(state.result.note === undefined ? {} : { title: state.result.note })}
            >
              {state.result.skippedEmpty.join(", ")} could not be written
            </p>
          )}
        </>
      )}
    </div>
  );
}
