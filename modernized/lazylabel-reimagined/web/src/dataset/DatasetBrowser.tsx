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

import { useWorkspace } from "../workspace/WorkspaceProvider.jsx";
import { ExportFormats } from "./ExportFormats.jsx";

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
  // Opening belongs to the workspace store: the list is one of five things that ask what is open,
  // and whichever one holds the state becomes the owner of a question that is not its own.
  const { open: openState, openImage } = useWorkspace();

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
              <tr key={image.key} aria-selected={openState?.image.key === image.key}>
                <th scope="row">
                  <button type="button" onClick={() => openImage(image)}>
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

    </section>
  );
}
