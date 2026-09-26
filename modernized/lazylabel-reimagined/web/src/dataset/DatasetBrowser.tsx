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

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  WireDatasetImage,
  WireDatasetListing,
  WireImageMetadata,
  WireLoadResponse,
  WireSaveResponse,
  WireSegment,
} from "@lazylabel/contracts";

import { useWorkspace } from "../workspace/WorkspaceProvider.jsx";

import type { AnnotationsResult, ApiClient } from "../api/client.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { columnName, formatModified, formatSize, hideableColumns, visibleColumns } from "./columns.js";
import { SORT_ORDERS, needsDetails, sortImages } from "./sorting.js";

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
  /**
   * The rows the table SHOWS, sorted and searched, in the order on screen.
   *
   * Next and previous image step through these, as legacy's do (fast_file_manager.py:1771-1843,
   * 1971-1999). They walked the raw listing, so with a sort or a search the key went somewhere
   * other than the row below the one open (`CONTROL_PARITY.md` CP-14).
   */
  readonly onShown?: (images: readonly WireDatasetImage[]) => void;
  /**
   * The run's masks a timeline frame opens with (SP-22). A timeline frame chosen here shows them, as
   * legacy's list sends a sequence frame through frame selection (right_panel.py:208;
   * main_window.py:1447-1455, 3591-3606). Undefined opens the file.
   */
  readonly reviewSegments?: (key: string) => readonly WireSegment[] | undefined;
  /**
   * The sequence range to colour: Start light green, End red and the rows between dark green, once
   * both are set, as legacy's list colours them (`fast_file_manager.py:303-309, 501-513`).
   */
  readonly range?: {
    readonly start: string | null;
    readonly end: string | null;
    readonly between: readonly string[];
  } | null;
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
  onShown,
  reviewSegments,
  range,
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
  const { open: openState, openImage: openInStore } = useWorkspace();
  // A timeline frame opens with the run's masks while the Sequence tab is in use (SP-22).
  const openImage = useCallback(
    (image: WireDatasetListing["images"][number]) => {
      const segments = reviewSegments?.(image.key);
      openInStore(image, segments === undefined ? undefined : { segments });
    },
    [openInStore, reviewSegments],
  );
  const { settings, save } = useSettings();

  /*
   * Whether this listing needs each file's size and date -- one stat per image on the server.
   *
   * Asked for only when the CHOSEN SORT needs it, or when a column that shows it is switched on.
   * Only this side knows either, which is why the flag is the client's to send: a server that
   * always stat-ted would pay for a folder of ten thousand frames on every listing to serve a sort
   * nobody chose, and one that never did could not serve it at all.
   *
   * It is part of the effect's dependencies, so switching to a date sort refetches WITH details
   * rather than sorting the rows it already has by a field they do not carry.
   */
  const { settings: listSettings } = useSettings();
  const wantsDetails =
    needsDetails(Number(listSettings.values["file_manager_sort_order"] ?? 0))
    || listSettings.values["file_manager_show_modified"] === true
    || listSettings.values["file_manager_show_size"] === true;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    client
      .listImages(projectId, here, wantsDetails)
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
  }, [client, projectId, here, onListed, wantsDetails]);

  // No table, no rows: a folder that is loading, failed or empty shows none, and the previous
  // folder's must not linger as the order the image keys step through.
  const tableless = state.status !== "ready" || state.listing.images.length === 0;
  useEffect(() => {
    if (tableless) onShown?.([]);
  }, [onShown, tableless]);

  const where = folderName(here);

  // Legacy's words while scanning and on a failure (fast_file_manager.py:1225, main_window.py:7330).
  if (state.status === "loading") return <p>Loading: {where}</p>;
  if (state.status === "failed") {
    return (
      <p role="alert" className="banner banner--error">
        Error discovering images: {state.reason}
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
    <section className="dataset-browser">
      <h2 className="visually-hidden">Images</h2>

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

      {listing.unrecognized > 0 && (
        <p role="status" className="dataset__unrecognized">
          {listing.unrecognized} file{listing.unrecognized === 1 ? "" : "s"} not recognized
        </p>
      )}

      {listing.images.length === 0 ? (
        // Legacy's empty footer (fast_file_manager.py:952-953). A folder holding only folders is
        // the normal shape of a dataset root; they are listed just above, so a place to go through
        // does not read as a failure.
        <p>No images in {where}</p>
      ) : (
        <ColumnedTable
          listing={listing}
          openState={openState}
          openImage={openImage}
          onShown={onShown}
          range={range ?? null}
        />
      )}
      {/* The formats to write are in Application Settings, where legacy's Export Formats is. */}
    </section>
  );
}

/**
 * What legacy's file list calls a folder (fast_file_manager.py:951-955): its own name, which at the
 * dataset's root is the breadcrumb's "Dataset".
 */
function folderName(path: string): string {
  return path.split("/").filter((part) => part !== "").pop() ?? "Dataset";
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
  onShown,
  range,
}: {
  readonly listing: WireDatasetListing;
  readonly openState: { readonly image: { readonly key: string } } | null;
  readonly openImage: (image: WireDatasetListing["images"][number]) => void;
  readonly onShown?: ((images: readonly WireDatasetImage[]) => void) | undefined;
  readonly range: DatasetBrowserProps["range"];
}): ReactNode {
  // Coloured only once both ends are set, as legacy's list is (main_window.py:4938-4947).
  const coloured = range !== null && range !== undefined && range.between.length > 0 ? range : null;
  const inRange = useMemo(() => new Set(coloured?.between ?? []), [coloured]);
  const rangeClass = (key: string): string | undefined =>
    coloured === null
      ? undefined
      : key === coloured.start
        ? "dataset__row--start"
        : key === coloured.end
          ? "dataset__row--end"
          : inRange.has(key)
            ? "dataset__row--range"
            : undefined;
  const { settings, save } = useSettings();
  // Filtered once: the header and every row must show the same columns, and two filters is two
  // chances for them to disagree by one.
  const shown = visibleColumns(listing.columns, settings.values);

  const rawOrder = Number(settings.values["file_manager_sort_order"]);
  const order = Number.isInteger(rawOrder) ? rawOrder : 0;
  // Legacy's "Search files..." (fast_file_manager.py:1143-1213): a view of the list, by name.
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  // Memoized, because it is reported up: a new array every render would re-render the shell,
  // which re-renders this, which reports again.
  const rows = useMemo(
    () =>
      sortImages(listing.images, order).filter(
        (image) => needle === "" || image.name.toLowerCase().includes(needle),
      ),
    [listing.images, needle, order],
  );
  useEffect(() => onShown?.(rows), [onShown, rows]);
  const showModified = settings.values["file_manager_show_modified"] !== false;
  const showSize = settings.values["file_manager_show_size"] !== false;

  return (
    <>
        {/* RULE-036's ten column settings, none of which had a reader -- the table showed every
            format the API reported and a user could not hide one. On a folder whose images carry
            two of the seven formats, five columns are a field of dots. */}
        <div className="dataset__toolbar">
        <input
          type="search"
          className="dataset__search"
          value={query}
          placeholder="Search files..."
          aria-label="Search files"
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="dataset__sort">
          <span className="visually-hidden">Order</span>
          <select
            value={order}
            aria-label="Sort order"
            onChange={(event) =>
              void save({
                ...settings,
                values: { ...settings.values, file_manager_sort_order: Number(event.target.value) },
              })
            }
          >
            {SORT_ORDERS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>


        <details className="dataset__columns">
          {/* Legacy's 30px column menu button, "⚏" (fast_file_manager.py:47). */}
          <summary aria-label="Columns" title="Columns">
            ⚏
          </summary>
          {/* A dropdown, as legacy's 30px column menu is, so opening it does not push the list. */}
          <div className="dataset__columns-menu">
          {/* The two detail columns sit with the format ones: to a user they are all "columns",
              and separating them by what they cost the server would be exposing an implementation
              detail as a category. */}
          {([
            { suffix: "Modified", setting: "file_manager_show_modified" },
            { suffix: "Size", setting: "file_manager_show_size" },
          ] as const).map((column) => (
            <label key={column.setting}>
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
          {hideableColumns(listing.columns).map((column) => (
            <label key={column.format} title={column.suffix}>
              <input
                type="checkbox"
                checked={settings.values[column.setting] !== false}
                aria-label={`Show the ${columnName(column)} column`}
                onChange={(event) =>
                  void save({
                    ...settings,
                    values: { ...settings.values, [column.setting]: event.target.checked },
                  })
                }
              />{" "}
              {columnName(column)}
            </label>
          ))}
          </div>
        </details>
        </div>

        <table className={coloured === null ? "dataset" : "dataset dataset--ranged"}>
          <thead>
            <tr>
              {/* Legacy's column names (fast_file_manager.py:277-288), each format's suffix in its
                  tooltip. */}
              <th scope="col">Name</th>
              {shown.map((column) => (
                <th scope="col" key={column.format} title={column.suffix}>
                  {columnName(column)}
                </th>
              ))}
              {/* RULE-036's other two columns. They are the reason the listing can be asked for
                  details at all: each costs a stat per image on the server, so they are fetched
                  only while one of them is switched on or a sort needs them. */}
              {showModified && <th scope="col">Modified</th>}
              {showSize && <th scope="col">Size</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((image) => (
              <tr
                key={image.key}
                aria-selected={openState?.image.key === image.key}
                className={rangeClass(image.key)}
              >
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
                      {image.sidecars[column.format] ? "✓" : ""}
                    </span>
                  </td>
                ))}
                {showModified && <td className="dataset__detail">{formatModified(image.modified)}</td>}
                {showSize && <td className="dataset__detail">{formatSize(image.size)}</td>}
              </tr>
            ))}
          </tbody>
          {/* Legacy's totals row: how many images, in its words (fast_file_manager.py:954-955), and
              how many have each format. It said how many were already annotated until 2026-09-26;
              the per-format totals beside it say that. */}
          <tfoot>
            <tr>
              <th scope="row">
                {listing.images.length} image{listing.images.length === 1 ? "" : "s"} in{" "}
                {folderName(listing.folder)}
              </th>
              {shown.map((column) => (
                <td key={column.format}>
                  {listing.images.filter((image) => image.sidecars[column.format]).length}
                </td>
              ))}
              {showModified && <td />}
              {showSize && <td />}
            </tr>
          </tfoot>
        </table>
    </>
  );
}
