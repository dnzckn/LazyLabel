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
import { useSettings } from "../settings/SettingsProvider.jsx";
import { hideableColumns, visibleColumns } from "./columns.js";

export interface DatasetBrowserProps {
  readonly client: ApiClient;
  readonly projectId: string;
  readonly folder?: string;
  /**
   * The folder as it was listed, for anything else that needs it.
   *
   * The sequence timeline builds from exactly this -- a file range and which frames are annotated
   * -- and fetching the same folder twice would be two answers to one question, which is how two
   * views of the same dataset come to disagree.
   */
  readonly onListed?: (images: readonly WireDatasetImage[]) => void;
}

type ListingState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly listing: WireDatasetListing }
  | { readonly status: "failed"; readonly reason: string };

export function DatasetBrowser({
  client,
  projectId,
  folder = "",
  onListed,
}: DatasetBrowserProps): ReactNode {
  const [state, setState] = useState<ListingState>({ status: "loading" });
  /*
   * WHERE IN THE DATASET WE ARE.
   *
   * The listing is not recursive -- RULE-051, and deliberate, because making it recursive would
   * change which images a dataset contains. Without a way to walk down, though, that is not a
   * restriction but a dead end: a dataset whose images live under `frames/` (the ordinary layout,
   * and the one this project's own fixtures use) shows an empty root and no way anywhere.
   *
   * `folder` is still the prop, and it seeds this. Somewhere to start, not somewhere to stay.
   */
  const [here, setHere] = useState(folder);
  useEffect(() => setHere(folder), [folder]);
  // Opening belongs to the workspace store: the list is one of five things that ask what is open,
  // and whichever one holds the state becomes the owner of a question that is not its own.
  const { open: openState, openImage } = useWorkspace();
  const { settings, save } = useSettings();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    client
      .listImages(projectId, here)
      .then((listing) => {
        if (cancelled) return;
        setState({ status: "ready", listing });
        onListed?.(listing.images);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setState({ status: "failed", reason: cause instanceof Error ? cause.message : String(cause) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, projectId, here, onListed]);

  if (state.status === "loading") return <p>Loading the folder…</p>;
  if (state.status === "failed") {
    return (
      <p role="alert" className="banner banner--error">
        The folder could not be listed: {state.reason}
      </p>
    );
  }

  const { listing } = state;

  // "a/b/c" as ["a", "b", "c"], each with the path that reaches it, so a crumb can be clicked.
  const crumbs = here === "" ? [] : here.split("/").filter((part) => part !== "");
  // Defaulted, because this arrives over the wire. A server that predates the field should leave
  // the browser working exactly as it did -- no navigation -- rather than blanking the pane with
  // a TypeError, which is what reading `.length` off an absent field does.
  const folders = listing.folders ?? [];

  return (
    <section>
      <h2>Images</h2>

      <nav className="crumbs" aria-label="Folder">
        <button type="button" onClick={() => setHere("")} disabled={here === ""}>
          Dataset
        </button>
        {crumbs.map((name, index) => (
          <span key={`${name}-${index}`}>
            {" / "}
            <button
              type="button"
              onClick={() => setHere(crumbs.slice(0, index + 1).join("/"))}
              disabled={index === crumbs.length - 1}
            >
              {name}
            </button>
          </span>
        ))}
      </nav>

      {folders.length > 0 && (
        <ul className="crumbs__folders">
          {folders.map((name) => (
            <li key={name}>
              <button type="button" onClick={() => setHere(here === "" ? name : `${here}/${name}`)}>
                {name}/
              </button>
            </li>
          ))}
        </ul>
      )}

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
        <p>
          {folders.length > 0
            // A folder holding only folders is the normal shape of a dataset root, and saying
            // "no images" there reads as a failure rather than as a place to go through.
            ? "No images in this folder. There are folders below it."
            : "This folder has no images LazyLabel can open."}
        </p>
      ) : (
        <ColumnedTable listing={listing} openState={openState} openImage={openImage} />
      )}

      <ExportFormats />
    </section>
  );
}

/**
 * The listing as a table, with only the columns the user has left switched on.
 *
 * Its own component because the columns have to be derived from the SETTINGS and the listing
 * together, and the listing only exists inside the ready branch -- deriving it above would be
 * reading a variable that is not in scope yet, which is what the first attempt did.
 */
function ColumnedTable({
  listing,
  openState,
  openImage,
}: {
  readonly listing: WireDatasetListing;
  readonly openState: { readonly image: { readonly key: string } } | null;
  readonly openImage: (image: WireDatasetListing["images"][number]) => void;
}): ReactNode {
  const { settings, save } = useSettings();
  // Filtered once: the header and every row must show the same columns, and two filters is two
  // chances for them to disagree by one.
  const shown = visibleColumns(listing.columns, settings.values);

  return (
    <>
        {/* RULE-036's ten column settings, none of which had a reader -- the table showed every
            format the API reported and a user could not hide one. On a folder whose images carry
            two of the seven formats, five columns are a field of dots. */}
        <details className="dataset__columns">
          <summary>Columns</summary>
          {hideableColumns(listing.columns).map((column) => (
            <label key={column.format}>
              <input
                type="checkbox"
                checked={settings.values[column.setting] !== false}
                aria-label={`Show the ${column.suffix} column`}
                onChange={(event) =>
                  void save({
                    ...settings,
                    values: { ...settings.values, [column.setting]: event.target.checked },
                  })
                }
              />{" "}
              {column.suffix}
            </label>
          ))}
        </details>

        <table className="dataset">
          <thead>
            <tr>
              <th scope="col">Image</th>
              {shown.map((column) => (
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
                {shown.map((column) => (
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
    </>
  );
}
