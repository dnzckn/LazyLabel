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

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { normalizeExportFormats } from "@lazylabel/settings-schema";
import type {
  WireDatasetImage,
  WireImageMetadata,
  WireLoadResponse,
  WireSaveResponse,
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
import { rasterizeSegment, type BinaryMask } from "@lazylabel/annotation-formats";
import { erase } from "../tools/erase.js";
import { adjustmentsFrom } from "../tools/adjustments.js";
import { processingQuery } from "./processing.js";
import type { ImagePoint } from "../canvas/coordinates.js";
import { classForNewSegment } from "./classes.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";

import type { AnnotationsResult, ApiClient } from "../api/client.js";

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
}: {
  readonly client: ApiClient;
  readonly projectId: string;
}): ReactNode {
  const { open, processing } = useWorkspace();

  if (open === null) return <p className="open-image__empty">Choose an image to open it.</p>;

  return (
    <OpenedImage
      client={client}
      projectId={projectId}
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
  image,
  result,
  error,
  metadata,
  pixelsUrl,
}: {
  readonly client: ApiClient;
  readonly projectId: string;
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
  // A manifest NAME, not a file path. Empty means none chosen, and the AI tool says so rather
  // than sending a request the service can only refuse.
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

  /**
   * Cut the drawn shape out of every annotation it overlaps.
   *
   * The erase shape is rasterized through the same path a saved annotation takes, so what the
   * eraser removes is exactly what would have been written -- the alternative is an eraser that
   * agrees with the outline on screen and disagrees with the file.
   */
  const eraseWithMask = useCallback(
    (mask: BinaryMask, size: { width: number; height: number }) => {
      const result = erase(segments, mask, size);

      if (result.erased.length === 0) {
        // Legacy says "No segments to erase" here, and saying nothing at all would leave a user
        // wondering whether the gesture registered.
        notify({ severity: "info", message: "No annotations to erase" });
        return;
      }

      applySegments(result.segments, `Erase from ${result.erased.length} annotation${result.erased.length === 1 ? "" : "s"}`);

      if (result.vanished.length > 0) {
        // RULE-009 discards every remaining piece of ten pixels or fewer, so an annotation can
        // disappear entirely. Legacy does this silently; a deletion nobody is told about is the
        // shape of defect decision 7 exists to remove.
        notify({
          severity: "warning",
          message:
            `${result.vanished.length} annotation${result.vanished.length === 1 ? " was" : "s were"} removed completely`,
          detail: "What remained of them was smaller than the 10-pixel minimum, so nothing was kept.",
          irreversible: false,
        });
      }
    },
    [applySegments, notify, segments],
  );

  /** A drawn shape erases by being rasterized first -- the same path a saved annotation takes. */
  const applyErase = useCallback(
    (type: "Polygon" | "Circle", vertices: readonly ImagePoint[], size: { width: number; height: number }) => {
      const mask = rasterizeSegment(
        { type, classId: null, vertices: vertices.map((v) => [v.x, v.y] as const) },
        size.height,
        size.width,
      );
      if (mask === null) {
        notify({ severity: "warning", message: "that shape covers no pixels, so nothing was erased" });
        return;
      }
      eraseWithMask(mask, size);
    },
    [eraseWithMask, notify],
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
                      fragmentThreshold={fragmentThreshold}
                      onAccept={(segment) => addSegment(segment, "Accept AI mask")}
                      // The MASK erases, not its bounding box: an AI mask is rarely a
                      // rectangle, and erasing its box would take out pixels the model never
                      // selected.
                      onErase={(segment) =>
                        segment.mask === undefined
                          ? undefined
                          : eraseWithMask(decodeMask(segment.mask), metadata)
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

            {activeTool === "polygon" && (
              <PolygonLayer
                width={metadata.width}
                height={metadata.height}
                joinThreshold={joinThreshold}
                classId={classForNewSegment(segments, activeClassId)}
                onComplete={(vertices) => commit("Polygon", vertices, "Add polygon")}
                onErase={(vertices) => applyErase("Polygon", vertices, metadata)}
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
                  applyErase(activeTool === "box" ? "Polygon" : "Circle", vertices, metadata)
                }
                onRefused={refuse}
              />
            )}
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
  const { classAliases, segments, crop } = useWorkspace();
  const [state, setState] = useState<
    | { readonly status: "idle" }
    | { readonly status: "saving" }
    | { readonly status: "saved"; readonly result: WireSaveResponse }
    | { readonly status: "failed"; readonly reason: string }
  >({ status: "idle" });

  const formats = normalizeExportFormats(settings.values["export_formats"]).formats;

  const convert = useCallback(() => {
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
        pixelPriority: {
          enabled: settings.values["pixel_priority_enabled"] === true,
          // Ascending unless explicitly false, which matches the server's own default: the lowest
          // class id wins, as legacy resolves it.
          ascending: settings.values["pixel_priority_ascending"] !== false,
        },
      })
      .then((result) => setState({ status: "saved", result }))
      .catch((cause: unknown) =>
        setState({ status: "failed", reason: cause instanceof Error ? cause.message : String(cause) }),
      );
  }, [classAliases, client, crop, formats, image.key, projectId, segments, settings.values, size]);

  return (
    <div>
      <button type="button" onClick={convert} disabled={state.status === "saving"}>
        {state.status === "saving" ? "Writing…" : `Write ${formats.length} format${formats.length === 1 ? "" : "s"}`}
      </button>

      {state.status === "failed" && (
        <p role="alert" className="banner banner--error">
          Nothing was written: {state.reason}
        </p>
      )}

      {state.status === "saved" && (
        <>
          <p role="status">
            Wrote {Object.keys(state.result.written).join(", ")} beside {image.name}.
          </p>

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
