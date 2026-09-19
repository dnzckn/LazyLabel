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
 * ONE HONEST GAP. Loading annotations needs the image's pixel size, because the text formats store
 * normalized coordinates — and nothing can know it until the API's image pipeline can decode the
 * file, which is Phase 5. So the size is an input here, marked as provisional rather than hidden
 * behind a guess. A wrong size silently rescales every polygon, so guessing would be worse than
 * asking.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { WireDatasetImage, WireDatasetListing } from "@lazylabel/contracts";

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
  const [size, setSize] = useState<[number, number]>([1080, 1920]);

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

      client
        .loadAnnotations(projectId, image.key, size)
        .then(setOpened)
        .catch((cause: unknown) => setOpenError(cause instanceof Error ? cause.message : String(cause)));
    },
    [client, projectId, size],
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

      <fieldset>
        <legend>Image size</legend>
        <p className="provisional">
          Provisional: the text formats store normalized coordinates, so opening annotations needs
          the image&rsquo;s pixel size. The API cannot decode the image until the image pipeline
          lands in Phase 5, so it is stated here rather than guessed — a wrong size silently
          rescales every polygon.
        </p>
        <label>
          Height{" "}
          <input
            type="number"
            value={size[0]}
            onChange={(event) => setSize([Number(event.target.value), size[1]])}
          />
        </label>
        <label>
          Width{" "}
          <input
            type="number"
            value={size[1]}
            onChange={(event) => setSize([size[0], Number(event.target.value)])}
          />
        </label>
      </fieldset>

      {selected !== null && <OpenedImage image={selected} result={opened} error={openError} />}
    </section>
  );
}

function OpenedImage({
  image,
  result,
  error,
}: {
  readonly image: WireDatasetImage;
  readonly result: AnnotationsResult | null;
  readonly error: string | null;
}): ReactNode {
  return (
    <section>
      <h3>{image.name}</h3>

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
