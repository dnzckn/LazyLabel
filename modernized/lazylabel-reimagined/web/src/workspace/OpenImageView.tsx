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

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { normalizeExportFormats } from "@lazylabel/settings-schema";
import type {
  WireDatasetImage,
  WireImageMetadata,
  WireLoadResponse,
  WireSaveResponse,
  WireSegment,
} from "@lazylabel/contracts";

import { AnnotationCanvas } from "../canvas/AnnotationCanvas.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useWorkspace } from "./WorkspaceProvider.jsx";
import { PolygonLayer, toWireVertices } from "../canvas/PolygonLayer.jsx";
import { decodeMask } from "@lazylabel/contracts";
import { AiTool } from "./AiTool.jsx";
import { SelectLayer } from "../canvas/SelectLayer.jsx";
import { ShapeLayer } from "../canvas/ShapeLayer.jsx";
import { EditLayer } from "../canvas/EditLayer.jsx";
import { adjustmentsFrom } from "../tools/adjustments.js";
import { processingQuery } from "./processing.js";
import type { ImagePoint } from "../canvas/coordinates.js";
import { classForNewSegment } from "./classes.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";

import type { AnnotationsResult, ApiClient } from "../api/client.js";
import { RESOLUTION_DEFAULT, epsilonFactorFor, maskToPolygon } from "../tools/autoPolygon.js";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";
import { CropLayer } from "../canvas/CropLayer.jsx";
import { canSave } from "./saveState.js";
import { PanLayer } from "../canvas/PanLayer.jsx";

/**
 * What a save sends when the image had no annotation file.
 *
 * Not null and not a special case: the save path takes the file's PREVIOUS contents only to report
 * on them, and "there was nothing" is a perfectly good answer. Making the button conditional on a
 * file existing is what hid it from every new dataset.
 */
const EMPTY_ANNOTATIONS = {
  segments: [],
  classAliases: {},
  failures: [],
  rejected: 0,
  sourceFile: "",
  sourceFormat: "",
} as unknown as WireLoadResponse;

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

  if (open === null) return <p className="open-image__empty">Choose an image to open it.</p>;

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
}): ReactNode {
  const { settings } = useSettings();
  // The LIVE names, not the ones the file held: a class renamed since loading must be written
  // with its new name, or the rename is lost on the next save.
  const { classAliases } = useWorkspace();
  const { segments, addSegment, updateSegment, activeTool, activeClassId, applySegments, selected, toggleSelected } =
    useWorkspace();
  const { eraseWith } = useWorkspace();
  // The crop is the store's, not this view's: the SAVE path reads it, so a crop dragged here and
  // held locally would be one the panel showed and the file never saw.
  const { crop, setCrop, zoom } = useWorkspace();

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
  const rawPan = Number(settings.values["pan_multiplier"]);
  const panStep = 64 * (Number.isFinite(rawPan) && rawPan > 0 ? Math.min(10, rawPan) : 1);
  const pan = useCallback(
    (dx: number, dy: number) => {
      // `scrollBy` clamps at the ends itself, so pressing into an edge does nothing rather than
      // needing a bound here that would have to agree with the browser's.
      scrollRef.current?.scrollBy({ left: dx * panStep, top: dy * panStep, behavior: "auto" });
    },
    [panStep],
  );

  useHotkey("pan_left", () => pan(-1, 0));
  useHotkey("pan_right", () => pan(1, 0));
  useHotkey("pan_up", () => pan(0, -1));
  useHotkey("pan_down", () => pan(0, 1));
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
  // A manifest NAME, not a file path. Empty means none chosen, and the AI tool says so rather
  // than sending a request the service can only refuse.
  const aiModel = String(settings.values["ai_model"] ?? "");

  /*
   * CONVERT EVERY MASK ON THIS IMAGE TO A POLYGON -- legacy's P, and Auto-Convert applied after
   * the fact rather than at the moment a mask is accepted.
   *
   * It is the same conversion, at the same resolution, so a user who forgot to switch Auto-Convert
   * on before a session's work is not left re-drawing it. Masks that cannot become a polygon --
   * a sliver that approximates to a line -- are LEFT AS MASKS rather than dropped: the point is to
   * gain corners to drag, not to lose annotations.
   *
   * One recorded step for the lot, because the user performed one action. Undo puts every mask
   * back at once, which is what they would expect from a key that changed everything at once.
   */
  const convertMasks = useCallback(() => {
    const epsilon = epsilonFactorFor(autoPolygon.resolution);
    let changed = 0;
    const next = segments.map((segment) => {
      if (segment.mask === undefined || segment.classId === null) return segment;
      const polygon = maskToPolygon(decodeMask(segment.mask), epsilon);
      if (polygon === null) return segment;
      changed += 1;
      return { type: "Polygon" as const, classId: segment.classId, vertices: polygon.vertices };
    });

    if (changed === 0) {
      notify({ severity: "info", message: "No masks on this image could become polygons" });
      return;
    }
    applySegments(next, `Convert ${changed} mask${changed === 1 ? "" : "s"} to polygons`);
  }, [applySegments, autoPolygon.resolution, notify, segments]);

  useHotkey("convert_to_polygons", convertMasks);


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
        // Legacy says "No segments to erase" here, and saying nothing at all would leave a user
        // wondering whether the gesture registered.
        notify({ severity: "info", message: "No annotations to erase" });
        return;
      }
      if (outcome.vanished > 0) {
        // RULE-009 discards every remaining piece of ten pixels or fewer, so an annotation can
        // disappear entirely. Legacy does this silently; a deletion nobody is told about is the
        // shape of defect decision 7 exists to remove.
        notify({
          severity: "warning",
          message:
            `${outcome.vanished} annotation${outcome.vanished === 1 ? " was" : "s were"} removed completely`,
          detail: "What remained of them was smaller than the 10-pixel minimum, so nothing was kept.",
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
    <section>
      <h3>{image.name}</h3>

      {metadata !== null && (
        <>
          <p className="provisional">
            {metadata.width} x {metadata.height}, {metadata.sourceFormat}
            {metadata.sourceDepth === 16 && (
              <>
                {" "}
                &mdash; 16-bit, shown and sent to the model as <code>value / 256</code> truncated
                (RULE-024)
              </>
            )}
          </p>
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
          <div className="canvas-scroll" ref={scrollRef}>
          <div className="canvas-stack">
            {canvasFailed ? (
              <img className="preview" src={pixelsUrl} alt={image.name} />
            ) : (
              <AnnotationCanvas
                imageUrl={pixelsUrl}
                width={metadata.width}
                height={metadata.height}
                segments={segments}
                adjustments={adjustments}
                zoom={zoom}
                onError={onCanvasError}
              />
            )}

            {activeTool === "ai" &&
              (aiModel === ""
                ? null
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
                        ? { operateOnView: { ...adjustments } }
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

            {/* RULE-069: editing is what you get when no DRAWING tool is active and exactly one
                annotation is selected. Legacy has an explicit Edit mode button; here the state
                already says it -- a user who has selected one shape and put the drawing tools down
                is editing it, and a mode to say so again would be a mode to forget to leave.

                Exactly one, because the handles belong to a shape. With two selected there is no
                answer to which vertex a drag moves, and legacy refuses the same case. */}
            {activeTool === "none" && selected.length === 1 && segments[selected[0]!] !== undefined && (
              <EditLayer
                width={metadata.width}
                height={metadata.height}
                index={selected[0]!}
                segment={segments[selected[0]!]!}
                onChange={(index, segment) => updateSegment(index, segment, "Move vertex")}
                // RULE-046's refusals -- a mask with no outline, a shape over the 200-vertex limit
                // -- go to the notifications rather than being drawn over the image.
                onNoHandles={(reason) => notify({ severity: "info", message: reason })}
              />
            )}

            {activeTool === "pan" && (
              <PanLayer
                width={metadata.width}
                height={metadata.height}
                pane={scrollRef}
                multiplier={panStep / 64}
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
                classId={classForNewSegment(segments, activeClassId)}
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
      {metadata !== null && (
        <ConvertButton
          /* KEYED ON THE IMAGE, so everything this button remembers is forgotten when a different
             one opens: the revision its next write is conditional on, and the outcome of the last.
             Both belong to one image and neither is re-derived.

             It already behaved this way, but by accident -- the button renders behind
             `metadata !== null` and opening an image clears the side before fetching, so it
             unmounts for as long as the load is in flight. A conditional write should not depend
             on a loading gap nobody wrote down; removing the flicker would silently turn every
             save after a switch into a refusal citing a file that had not changed. */
          key={image.key}
          client={client}
          projectId={projectId}
          image={image}
          annotations={
            result?.kind === "loaded"
              ? result.annotations
              : EMPTY_ANNOTATIONS
          }
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

      {result?.kind === "failed" && (
        <p role="alert" className="banner banner--error">
          Annotations exist for {image.name} but none could be read: {result.message}. Nothing has
          been deleted.
        </p>
      )}

      {result?.kind === "loaded" && (
        <>
          <p>
            {result.annotations.segments.length} objects, read from{" "}
            <code>{result.annotations.sourceFile}</code> ({result.annotations.sourceFormat}).
          </p>

          {/* The architecture's migration gap, made visible: masks convert perfectly and names
              do not, and a Pascal VOC or CreateML file written now would say "3" where the
              original said "stop sign" without looking wrong. */}
          {result.annotations.unreadableAliases === true && (
            <p role="status" className="banner banner--warning">
              This file stores its class names in the old pickled format, which is not read for
              safety. The objects and their class ids are correct; the NAMES are missing. Saving to
              Pascal VOC or CreateML now would write the ids where the names belong.
            </p>
          )}

          {result.annotations.rejected > 0 && (
            <p role="status" className="banner banner--warning">
              {result.annotations.rejected} lines or objects in that file could not be read and were
              skipped.
            </p>
          )}

          {/* A recovery the user is not told about is what decision 15c forbids. */}
          {result.annotations.failures.length > 0 && (
            <p role="status" className="banner banner--warning">
              A higher-priority annotation file could not be read, so these annotations came from{" "}
              {result.annotations.sourceFormat} instead:{" "}
              {result.annotations.failures.map((f) => `${f.format} (${f.reason})`).join("; ")}
            </p>
          )}

          {Object.keys(result.annotations.classAliases).length > 0 && (
            <p>
              Class names from that file:{" "}
              {Object.entries(result.annotations.classAliases)
                .map(([id, name]) => `${id} = ${name}`)
                .join(", ")}
            </p>
          )}

        </>
      )}
    </section>
  );
}

/**
 * Persona flow 4's last step: write the chosen formats beside the image.
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
  annotations,
  size,
}: {
  readonly client: ApiClient;
  readonly projectId: string;
  readonly image: WireDatasetImage;
  readonly annotations: WireLoadResponse;
  readonly size: readonly [number, number];
}): ReactNode {
  const { settings } = useSettings();
  // The LIVE names and segments, not the ones the file held. A class renamed or an annotation
  // drawn since loading has to be written as it now stands, or the edit is lost on the next save.
  // The crop comes from the store for the same reason: it is part of what a save WRITES, and a
  // crop the request leaves out is a crop the panel showed and the file never saw.
  const { classAliases, segments, crop, activeSide, markSavedOn, imageState } = useWorkspace();
  const [state, setState] = useState<
    | { readonly status: "idle" }
    | { readonly status: "saving" }
    | { readonly status: "saved"; readonly result: WireSaveResponse }
    | { readonly status: "failed"; readonly reason: string; readonly conflicted?: boolean }
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
   */
  const [revisions, setRevisions] = useState<Readonly<Record<string, string | null>>>(() =>
    annotations.sourceFormat === "" ? {} : { [annotations.sourceFormat]: annotations.revision },
  );

  const formats = normalizeExportFormats(settings.values["export_formats"]).formats;

  /*
   * `expected` is what the write is conditional on. The button passes the revisions this client
   * read; the recovery below passes `{}`, which is an UNCONDITIONAL write — "overwrite whatever is
   * there now".
   *
   * That is not a hole in the safety, it is the shape decision 7 asks for: nothing is lost without
   * an explicit act, and this is the explicit act, behind its own button, labelled with what it
   * does and shown only after a refusal.
   */
  const convert = useCallback((expected: Readonly<Record<string, string | null>>) => {
    // Captured now, not read in the callback below: see `markSavedOn` there.
    const side = activeSide;
    setState({ status: "saving" });
    client
      .saveAnnotations(projectId, image.key, {
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
          enabled: settings.values["pixel_priority_enabled"] === true,
          // Ascending unless explicitly false, which matches the server's own default: the lowest
          // class id wins, as legacy resolves it.
          ascending: settings.values["pixel_priority_ascending"] !== false,
        },
      })
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
        markSavedOn(side);
        // The revisions this write produced become the ones the NEXT write is conditional on.
        // Without this, saving twice would compare against the load's revision the second time and
        // conflict with the app's own previous save.
        setRevisions((current) => ({ ...current, ...result.written }));
      })
      .catch((cause: unknown) => {
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
           * THE ADVICE HAS TO BE COMPATIBLE WITH THE REASSURANCE, and the first version was not:
           * it said the work was still on screen and then told the user to reload — which calls
           * `openImage` and clears the segments, discarding exactly what it had just promised was
           * safe. Written quickly, and only obvious once read as a whole.
           *
           * There is no force-overwrite yet, so the honest instruction is the one that keeps the
           * work: open the file elsewhere to see what it says, and do not reload this image until
           * the annotations on screen are somewhere else.
           */
          reason: conflict
            ? `${key} changed since you loaded it — the desktop app, another tab, or a script `
              + "wrote it. Nothing here was lost; the annotations on screen are still yours. "
              + "Reloading this image WOULD replace them with what the file now says, so check "
              + "the file another way first."
            : reason,
        });
      });
  }, [
    activeSide,
    classAliases,
    client,
    crop,
    formats,
    image.key,
    markSavedOn,
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
   */
  const saveNow = () => {
    if (state.status !== "saving") convert(revisions);
  };
  useHotkey("save_output", saveNow);
  useHotkey("save_output_alt", saveNow);

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
   * from a bug; a disabled one that says why is an explanation.
   */
  const writable = canSave(imageState);

  return (
    <div>
      <button
        type="button"
        onClick={() => convert(revisions)}
        disabled={state.status === "saving" || !writable}
      >
        {state.status === "saving" ? "Writing…" : `Write ${formats.length} format${formats.length === 1 ? "" : "s"}`}
      </button>

      {!writable && (
        <p role="status" className="banner banner--warning">
          This image&rsquo;s annotations could not be read, so nothing can be written over them:
          saving now would replace a damaged file with an empty one. Move the file aside and
          reopen the image to start fresh, or repair it outside the app.
        </p>
      )}

      {state.status === "failed" && (
        <>
          <p role="alert" className="banner banner--error">
            Nothing was written: {state.reason}
          </p>

          {/* Offered only after a refusal, and only for a conflict: an unconditional write is the
              thing the conditional write exists to prevent, so it is a deliberate second press
              rather than a setting or a retry that happens on its own. */}
          {state.conflicted === true && (
            <button type="button" onClick={() => convert({})}>
              Save anyway, overwriting what is there now
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

          {state.result.stale.length > 0 && (
            <p role="status" className="banner banner--warning">
              {state.result.stale.join(", ")} {state.result.stale.length === 1 ? "is" : "are"} still
              on disk for this image and {state.result.stale.length === 1 ? "was" : "were"} not
              rewritten, so {state.result.stale.length === 1 ? "it" : "they"} may now disagree with
              what you just saved. Nothing has been deleted.
            </p>
          )}

          {state.result.skippedEmpty.length > 0 && (
            <p role="status" className="banner banner--warning">
              {state.result.skippedEmpty.join(", ")} could not be written: {state.result.note}
            </p>
          )}
        </>
      )}
    </div>
  );
}
