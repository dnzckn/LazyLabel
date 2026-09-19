/**
 * C1 — the dataset browser, and the Phase 4 pilot slice in the browser.
 *
 * Lists a folder of images with per-format annotation status, and opens one with its annotations
 * loaded through the Phase 1 library.
 *
 * TWO THINGS IT SHOWS THAT LEGACY NEVER DID, both because the listing is the first moment a user
 * could possibly be told:
 *
 *   - Images that SHARE sidecars (RULE-080). `frame_012.png` and `frame_012.jpg` have the same
 *     seven sidecar paths, so annotating one overwrites the other's work.
 *   - Files that were not recognized. A folder of .avif files otherwise just looks empty, and the
 *     user has no way to tell "no images here" from "none of these count as images".
 *
 * The image's pixel size comes from the API rather than from the user, now that the image pipeline
 * can read it without decoding the whole file. That matters more than convenience: the text formats
 * store normalized coordinates, so a wrong size silently rescales every polygon.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type {
  WireDatasetImage,
  WireDatasetListing,
  WireImageMetadata,
  WireLoadResponse,
  WireSaveResponse,
} from "@lazylabel/contracts";

import { AnnotationCanvas } from "../canvas/AnnotationCanvas.jsx";
import { ExportFormats } from "./ExportFormats.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { normalizeExportFormats } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient } from "../api/client.js";

export interface DatasetBrowserProps {
  readonly client: ApiClient;
  readonly projectId: string;
  readonly folder?: string;
}

type ListingState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly listing: WireDatasetListing }
  | { readonly status: "failed"; readonly reason: string };

export function DatasetBrowser({ client, projectId, folder = "" }: DatasetBrowserProps): ReactNode {
  const [state, setState] = useState<ListingState>({ status: "loading" });
  const [selected, setSelected] = useState<WireDatasetImage | null>(null);
  const [opened, setOpened] = useState<AnnotationsResult | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<WireImageMetadata | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    client
      .listImages(projectId, folder)
      .then((listing) => {
        if (!cancelled) setState({ status: "ready", listing });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setState({ status: "failed", reason: cause instanceof Error ? cause.message : String(cause) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, projectId, folder]);

  const open = useCallback(
    (image: WireDatasetImage) => {
      setSelected(image);
      setOpened(null);
      setOpenError(null);
      setMetadata(null);

      // The size has to come first: the text formats store normalized coordinates, so loading
      // annotations without it would rescale every polygon.
      client
        .imageMetadata(projectId, image.key)
        .then(async (info) => {
          setMetadata(info);
          setOpened(await client.loadAnnotations(projectId, image.key, [info.height, info.width]));
        })
        .catch((cause: unknown) => setOpenError(cause instanceof Error ? cause.message : String(cause)));
    },
    [client, projectId],
  );

  if (state.status === "loading") return <p>Loading the folder…</p>;
  if (state.status === "failed") {
    return (
      <p role="alert" className="banner banner--error">
        The folder could not be listed: {state.reason}
      </p>
    );
  }

  const { listing } = state;

  return (
    <section>
      <h2>Images</h2>
      <p>
        {listing.images.length} images, {listing.annotatedCount} already annotated
        {listing.unrecognized > 0 && (
          <>
            {" — "}
            <span role="status">
              {listing.unrecognized} file{listing.unrecognized === 1 ? "" : "s"} were not recognized
              as images or annotations
            </span>
          </>
        )}
      </p>

      {listing.images.length === 0 ? (
        <p>This folder has no images LazyLabel can open.</p>
      ) : (
        <table className="dataset">
          <thead>
            <tr>
              <th scope="col">Image</th>
              {listing.columns.map((column) => (
                <th scope="col" key={column.format} title={column.format}>
                  {column.suffix}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listing.images.map((image) => (
              <tr key={image.key} aria-selected={selected?.key === image.key}>
                <th scope="row">
                  <button type="button" onClick={() => open(image)}>
                    {image.name}
                  </button>
                  {image.sharesSidecarsWith.length > 0 && (
                    <span role="status" className="collision">
                      {" "}
                      shares annotation files with {image.sharesSidecarsWith.join(", ")}
                    </span>
                  )}
                </th>
                {listing.columns.map((column) => (
                  <td key={column.format}>
                    <span aria-label={image.sidecars[column.format] ? "present" : "absent"}>
                      {image.sidecars[column.format] ? "●" : "·"}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}


      <ExportFormats />

      {selected !== null && (
        <OpenedImage
          client={client}
          projectId={projectId}
          image={selected}
          result={opened}
          error={openError}
          metadata={metadata}
          pixelsUrl={client.pixelsUrl(projectId, selected.key)}
        />
      )}
    </section>
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
          {result?.kind === "loaded" ? (
            <AnnotationCanvas
              imageUrl={pixelsUrl}
              width={metadata.width}
              height={metadata.height}
              segments={result.annotations.segments}
            />
          ) : (
            <img className="preview" src={pixelsUrl} alt={image.name} />
          )}
        </>
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

          {metadata !== null && (
            <ConvertButton
              client={client}
              projectId={projectId}
              image={image}
              annotations={result.annotations}
              size={[metadata.height, metadata.width]}
            />
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
        segments: annotations.segments,
        classAliases: annotations.classAliases,
      })
      .then((result) => setState({ status: "saved", result }))
      .catch((cause: unknown) =>
        setState({ status: "failed", reason: cause instanceof Error ? cause.message : String(cause) }),
      );
  }, [annotations, client, formats, image.key, projectId, size]);

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
