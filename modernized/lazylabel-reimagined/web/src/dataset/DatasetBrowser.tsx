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
 * THE LIST WORKS AS LEGACY'S `FastFileManager` DOES (utils/fast_file_manager.py; CONTROL_PARITY.md
 * CP-48). A click selects, Ctrl and Shift as in any table, and a double-click opens (1088-1089). A
 * right-click offers Copy and Hide (1657-1706). Rows drag to another place (1034-1039, 1615-1655).
 * Any header sorts, the format columns too (1055-1057, 817-882). Refresh reads the folder again, and
 * Hide takes rows out of the list until Show All or Refresh (1190-1209, 1708-1727). Nothing is
 * deleted; a hidden row is also out of next and previous image and of a sequence range, because
 * those walk the rows the list shows.
 *
 * The image's pixel size comes from the API rather than from the user, now that the image pipeline
 * can read it without decoding the whole file. That matters more than convenience: the text formats
 * store normalized coordinates, so a wrong size silently rescales every polygon.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

import type { WireDatasetImage, WireDatasetListing, WireSegment } from "@lazylabel/contracts";

import type { ApiClient } from "../api/client.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useWorkspace } from "../workspace/WorkspaceProvider.jsx";
import { copyText } from "./clipboard.js";
import { formatModified, formatSize, listColumns, shownColumns, type ListColumn } from "./columns.js";
import {
  NO_SELECTION,
  clickRow,
  copiedNames,
  filePath,
  keepShown,
  moveKeys,
  placeInOrder,
  reconcile,
  selectOnly,
  selectedKeys,
  type Selection,
} from "./fileList.js";
import { clickedSort, sortNeedsDetails, sortRows, storedSort, type SortKey } from "./sorting.js";

/** What the shell asks of the list. */
export interface DatasetBrowserHandle {
  /**
   * Next (1) or previous (-1) image: the row below or above the list's current row, which a click
   * moves as well as an open. With none, next opens the first row and previous the last, as after
   * a Refresh or when the current row was hidden (fast_file_manager.py:1771-1843).
   */
  readonly step: (by: 1 | -1) => void;
}

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
   * The rows the table SHOWS, sorted, searched and not hidden, in the order on screen.
   *
   * The Multi tab's pair steps through these, and a sequence range is built from them, as legacy's
   * are (fast_file_manager.py:1465-1503, 1971-1999; CONTROL_PARITY.md CP-14).
   */
  readonly onShown?: (images: readonly WireDatasetImage[]) => void;
  /**
   * The run's masks a timeline frame opens with (SP-22). A timeline frame chosen here shows them, as
   * legacy's list sends a sequence frame through frame selection (right_panel.py:208;
   * main_window.py:1447-1455, 3591-3606). Undefined opens the file.
   */
  readonly reviewSegments?: (key: string) => readonly WireSegment[] | undefined;
  /**
   * Opens a file chosen in the list while the Multi tab is showing: legacy loads it and the next
   * one as the pair (file_navigation_manager.py:390-423). Without it, the file opens on one side.
   */
  readonly onOpenInPair?: (image: WireDatasetImage) => void;
  /**
   * The sequence range to colour: Start light green, End red and the rows between dark green, once
   * both are set, as legacy's list colours them (`fast_file_manager.py:303-309, 501-513`).
   */
  readonly range?: {
    readonly start: string | null;
    readonly end: string | null;
    readonly between: readonly string[];
    /** The timeline's order while it is sorted: the range's rows are shown in it (SP-42). */
    readonly order?: readonly string[] | null;
  } | null;
  /** The dataset folder's own path on the server, which Copy path puts before a file's key. */
  readonly root?: string | undefined;
  /**
   * Changes when annotation files were written other than by the open image's save, as Save All
   * writes them. The list reads the folder's status again, as legacy's does after a save
   * (fast_file_manager.py:611-692); the open image's own saves are seen through the workspace.
   */
  readonly written?: number;
  readonly ref?: Ref<DatasetBrowserHandle>;
}

type ListingState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly listing: WireDatasetListing }
  | { readonly status: "failed"; readonly reason: string };

const NO_IMAGES: readonly WireDatasetImage[] = [];
const NO_KEYS: readonly string[] = [];
const NOTHING_HIDDEN: ReadonlySet<string> = new Set();

export function DatasetBrowser({
  client,
  projectId,
  folder = "",
  onListed,
  onShown,
  reviewSegments,
  onOpenInPair,
  range,
  root,
  written,
  ref,
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
  // Opening belongs to the workspace store: the list is one of five things that ask what is open,
  // and whichever one holds the state becomes the owner of a question that is not its own.
  const { open: openState, openImage: openInStore, saveCounts, quietWrites, multiView } = useWorkspace();
  const { notify } = useNotifications();
  // A timeline frame opens with the run's masks while the Sequence tab is in use (SP-22).
  const openImage = useCallback(
    (image: WireDatasetImage) => {
      if (multiView && onOpenInPair !== undefined) {
        onOpenInPair(image);
        return;
      }
      const segments = reviewSegments?.(image.key);
      openInStore(image, segments === undefined ? undefined : { segments });
    },
    [multiView, onOpenInPair, openInStore, reviewSegments],
  );
  const { settings, save } = useSettings();

  // How the list is arranged and what is picked in it: kept across a reload of the same folder.
  const [generation, setGeneration] = useState(0);
  // Legacy's "Search files..." (fast_file_manager.py:1150-1161, 1233-1237): a view of the list, by name.
  const [query, setQuery] = useState("");
  /** The header last clicked, or null for the stored order the list opens in. */
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  /** The order rows that tie in a sort keep: the order on screen when the header was clicked. */
  const [base, setBase] = useState<readonly string[] | null>(null);
  /** A dragged order, which replaces the sort until a header is clicked (legacy's custom order). */
  const [custom, setCustom] = useState<readonly string[] | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NOTHING_HIDDEN);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [menu, setMenu] = useState<{ readonly x: number; readonly y: number } | null>(null);
  /** Where dragged rows would land: before this row, at the end when null, nowhere when undefined. */
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);
  const dragging = useRef<ReadonlySet<string> | null>(null);

  /*
   * THE TIMELINE'S ORDER, while the timeline is sorted: legacy's Sort puts the range's rows in the
   * timeline's order, in the places they hold, until another sort is chosen or the timeline is
   * unsorted (`main_window.py:3436-3455`; `fast_file_manager.py:360-373, 1325-1358`,
   * SEQUENCE_PARITY.md SP-42). So Left and Right follow the sorted timeline. `released` is the
   * order a header click, a drag or a Refresh left.
   */
  const timelineOrder = range?.order ?? null;
  const [released, setReleased] = useState<readonly string[] | null>(null);
  /**
   * The range a drag took the colours off. Legacy's first drag out of a sorted list clears the
   * range's highlight (fast_file_manager.py:1633-1638), and its timeline Sort then has no rows to
   * reorder; Set Start or Set End colours a new one.
   */
  const [cleared, setCleared] = useState<readonly string[] | null>(null);
  const lastBetween = useRef<readonly string[]>(NO_KEYS);
  useEffect(() => {
    if (range !== null && range !== undefined && range.between.length > 0) lastBetween.current = range.between;
  }, [range]);

  /** Legacy's `setDirectory` (1215-1224): a folder read again shows every row, sorted, none picked. */
  const resetView = useCallback(() => {
    setHidden(NOTHING_HIDDEN);
    setCustom(null);
    setBase(null);
    setSelection(NO_SELECTION);
    setMenu(null);
    setReleased(timelineOrder);
  }, [timelineOrder]);

  const goTo = useCallback(
    (path: string) => {
      resetView();
      setHere(path);
    },
    [resetView],
  );
  const seeded = useRef(folder);
  useEffect(() => {
    if (seeded.current === folder) return;
    seeded.current = folder;
    goTo(folder);
  }, [folder, goTo]);

  const stored = storedSort(settings.values["file_manager_sort_order"]);
  const sort = sortKey ?? stored;

  /*
   * Whether this listing needs each file's size and date -- one stat per image on the server.
   *
   * Asked for only when the sort needs it, or when a column that shows it is switched on. Only this
   * side knows either, which is why the flag is the client's to send: a server that always stat-ted
   * would pay for a folder of ten thousand frames on every listing to serve a sort nobody chose,
   * and one that never did could not serve it at all.
   *
   * It is part of the effect's dependencies, so sorting by date refetches WITH details rather than
   * sorting the rows it already has by a field they do not carry.
   */
  const wantsDetails =
    sortNeedsDetails(sort)
    || settings.values["file_manager_show_modified"] === true
    || settings.values["file_manager_show_size"] === true;

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
  }, [client, projectId, here, onListed, wantsDetails, generation]);

  /*
   * AFTER A SAVE, THE FORMAT COLUMNS ARE READ AGAIN, as legacy re-checks a saved image's files
   * (fast_file_manager.py:611-645, 651-692). Quietly: the list stays as it is, hidden rows, order
   * and selection too, and only what changed on disk changes. They went stale until 2026-09-26.
   * A save that deleted an image's files (SP-58) counts too.
   */
  const lastWrite = useRef({ saveCounts, quietWrites, written });
  useEffect(() => {
    const last = lastWrite.current;
    if (last.saveCounts === saveCounts && last.quietWrites === quietWrites && last.written === written) return;
    lastWrite.current = { saveCounts, quietWrites, written };
    let cancelled = false;
    client
      .listImages(projectId, here, wantsDetails)
      .then((listing) => {
        if (cancelled) return;
        setState({ status: "ready", listing });
        onListed?.(listing.images);
      })
      // The list shown stays; the next save or a Refresh reads it again.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, projectId, here, onListed, wantsDetails, saveCounts, quietWrites, written]);

  const listing = state.status === "ready" ? state.listing : null;
  const images = listing?.images ?? NO_IMAGES;
  const between = range?.between ?? NO_KEYS;
  // Coloured only once both ends are set, as legacy's list is (main_window.py:4938-4947).
  const coloured = range !== null && range !== undefined && between.length > 0 && between !== cleared ? range : null;
  const following = coloured !== null && timelineOrder !== null && timelineOrder !== released ? timelineOrder : null;

  /*
   * THE ROWS: the listing in the dragged order or sorted by the header, the timeline's order over
   * the range while it is followed, and then only the rows not hidden whose name matches the
   * search -- the order legacy's source model, its reorder and its proxy make them in.
   *
   * Memoized, because it is reported up: a new array every render would re-render the shell,
   * which re-renders this, which reports again.
   */
  const { rows, ordered, inCustomOrder } = useMemo(() => {
    const byKey = new Map(images.map((image) => [image.key, image]));
    const keys = images.map((image) => image.key);
    const arranged =
      custom !== null
        ? reconcile(custom, keys)
        : sortRows(reconcile(base, keys).map((key) => byKey.get(key)!), sort).map((image) => image.key);
    const placed = following === null ? null : placeInOrder(arranged, between, following);
    const inOrder = placed?.order ?? arranged;
    const needle = query.trim().toLowerCase();
    const shown = inOrder
      .map((key) => byKey.get(key)!)
      .filter((image) => !hidden.has(image.key) && (needle === "" || image.name.toLowerCase().includes(needle)));
    return { rows: shown, ordered: inOrder, inCustomOrder: custom !== null || placed?.placed === true };
  }, [base, between, custom, following, hidden, images, query, sort]);
  const rowKeys = useMemo(() => rows.map((image) => image.key), [rows]);
  const shownKeys = useMemo(() => new Set(rowKeys), [rowKeys]);
  const inRange = useMemo(() => new Set(coloured?.between ?? NO_KEYS), [coloured]);
  const rowOf = useMemo(() => new Map(rows.map((image) => [image.key, image])), [rows]);
  useEffect(() => onShown?.(rows), [onShown, rows]);

  // A row the list stops showing leaves the selection, and the current row with it, as in Qt.
  useEffect(() => setSelection((current) => keepShown(current, shownKeys)), [shownKeys]);

  // Opening an image selects its row and makes it the current one (fast_file_manager.py:1745-1759,
  // file_navigation_manager.py:359), whichever way it was opened.
  const openKey = openState?.image.key ?? null;
  const shownNow = useRef(shownKeys);
  useEffect(() => {
    shownNow.current = shownKeys;
  }, [shownKeys]);
  useEffect(() => {
    if (openKey === null) return;
    setSelection(shownNow.current.has(openKey) ? selectOnly(openKey) : NO_SELECTION);
  }, [openKey]);

  // Legacy's Unsort (`resetHighlightedSort`, 1353-1358): a list in the timeline's order, or in a
  // dragged one, goes back to the stored order. Not New Timeline, which takes the range away.
  const lastOrder = useRef<readonly string[] | null>(null);
  useEffect(() => {
    if (range === null || range === undefined) return;
    const before = lastOrder.current;
    lastOrder.current = timelineOrder;
    if (before === null || timelineOrder !== null || range.between.length === 0) return;
    if (before !== released || custom !== null) {
      setCustom(null);
      setBase(null);
      setSortKey(null);
    }
  }, [custom, range, released, timelineOrder]);

  const step = useCallback(
    (by: 1 | -1) => {
      if (rows.length === 0) return;
      const at = selection.cursor === null ? -1 : rowKeys.indexOf(selection.cursor);
      const target = at < 0 ? rows[by === 1 ? 0 : rows.length - 1] : rows[at + by];
      // Clamped, not wrapping: legacy stops at the ends.
      if (target === undefined) return;
      // The row moves when the image does, so a refused open leaves it where it was.
      if (target.key === openKey) setSelection(selectOnly(target.key));
      else openImage(target);
    },
    [openImage, openKey, rowKeys, rows, selection.cursor],
  );
  useImperativeHandle(ref, () => ({ step }), [step]);

  const refresh = (): void => {
    resetView();
    setGeneration((count) => count + 1);
  };

  /** Legacy's Hide (1708-1722): the selected rows leave the list, and the selection is cleared. */
  const hideSelected = (): void => {
    const chosen = selectedKeys(selection).filter((key) => shownKeys.has(key));
    if (chosen.length === 0) return;
    setHidden((previous) => new Set([...previous, ...chosen]));
    setSelection((current) => ({ ...current, committed: [], extent: [] }));
  };

  /** A header click (1325-1329): out of a dragged or timeline order, sorted by that column. */
  const sortBy = (column: string): void => {
    setBase(ordered);
    setCustom(null);
    setReleased(timelineOrder);
    setSortKey(clickedSort(sort, column));
  };

  const onRowClick = (event: MouseEvent, key: string): void => {
    setMenu(null);
    setSelection((current) =>
      clickRow(current, key, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }, rowKeys),
    );
  };

  /*
   * A RIGHT-CLICK on a row that is not selected selects it alone; on a selected one, or with Shift or
   * Ctrl held, the selection stays. Either way the row becomes the current one, as Qt's press
   * makes it (fast_file_manager.py:1657-1690).
   */
  const onRowContextMenu = (event: MouseEvent, key: string): void => {
    event.preventDefault();
    const keep = event.shiftKey || event.ctrlKey || event.metaKey || selectedKeys(selection).includes(key);
    const next = keep ? { ...selection, anchor: key, cursor: key } : selectOnly(key);
    setSelection(next);
    if (selectedKeys(next).length === 0) return;
    // From the keyboard there is no pointer: the menu opens at the row.
    const box = (event.currentTarget as Element).getBoundingClientRect();
    const fromKeys = event.clientX === 0 && event.clientY === 0;
    setMenu({ x: fromKeys ? box.left : event.clientX, y: fromKeys ? box.bottom : event.clientY });
  };

  const closeMenu = useCallback(() => setMenu(null), []);

  const copy = (text: string): void => {
    void copyText(text).then((copied) => {
      if (!copied) notify({ severity: "warning", message: "Could not copy to the clipboard" });
    });
  };

  /*
   * DRAGGING ROWS (fast_file_manager.py:1034-1039, 885-909, 1615-1655). The selection moves, or the
   * row under the pointer alone when it is not selected, and lands before the row it is dropped on,
   * or at the end below the last. The list leaves its sort for that order until a header is clicked,
   * and the moved rows stay selected.
   */
  const onDragStart = (event: DragEvent, key: string): void => {
    let current = selection;
    if (!selectedKeys(current).includes(key)) {
      current = selectOnly(key);
      setSelection(current);
    }
    const moving = new Set(selectedKeys(current).filter((each) => shownKeys.has(each)));
    dragging.current = moving;
    setMenu(null);
    // Legacy's own type for dragged rows (322-332).
    event.dataTransfer?.setData("application/x-lazylabel-file-rows", [...moving].join("\n"));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  const dropTarget = (event: DragEvent): string | null =>
    (event.target as Element).closest?.("tbody tr[data-key]")?.getAttribute("data-key") ?? null;

  const onDragOver = (event: DragEvent): void => {
    if (dragging.current === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const before = dropTarget(event);
    setDropBefore((previous) => (previous === before ? previous : before));
  };

  const endDrag = (): void => {
    dragging.current = null;
    setDropBefore(undefined);
  };

  const onDrop = (event: DragEvent): void => {
    const moving = dragging.current;
    if (moving === null) return;
    event.preventDefault();
    const before = dropTarget(event);
    endDrag();
    if (!inCustomOrder) setCleared(lastBetween.current);
    const next = moveKeys(ordered, moving, before);
    setCustom(next);
    setReleased(timelineOrder);
    setSelection((current) => ({ ...current, committed: next.filter((key) => moving.has(key)), extent: [] }));
  };

  // Legacy's words while scanning and on a failure (fast_file_manager.py:1225, main_window.py:7330).
  const where = folderName(here);
  if (state.status === "loading") return <p>Loading: {where}</p>;
  if (state.status === "failed") {
    return (
      <p role="alert" className="banner banner--error">
        Error discovering images: {state.reason}
      </p>
    );
  }

  const ready = state.listing;
  // "a/b/c" as ["a", "b", "c"], each with the path that reaches it, so a crumb can be clicked.
  const crumbs = here === "" ? [] : here.split("/").filter((part) => part !== "");
  // Defaulted, because this arrives over the wire. A server that predates the field should leave
  // the browser working exactly as it did -- no navigation -- rather than blanking the pane with
  // a TypeError, which is what reading `.length` off an absent field does.
  const folders = ready.folders ?? [];

  // Legacy's ten columns in legacy's order (CP-63). Filtered once: the header and every row must
  // show the same columns, and two filters is two chances for them to disagree by one.
  const columns = listColumns(ready.columns);
  const shown = shownColumns(columns, settings.values);
  const picked = new Set(selectedKeys(selection));
  // The selected rows the list shows, in the order Qt lists a selection, which Copy writes them in.
  const menuRows =
    menu === null ? NO_IMAGES : selectedKeys(selection).flatMap((key) => (shownKeys.has(key) ? rowOf.get(key) ?? [] : []));

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
  // The header keeps its arrow in a dragged or timeline order, as Qt's does; a screen reader is
  // told the list is sorted only while it is.
  const arrow = (column: ListColumn): "ascending" | "descending" | undefined =>
    sort.column === column.id ? (sort.descending ? "descending" : "ascending") : undefined;

  return (
    <section className="dataset-browser">
      <h2 className="visually-hidden">Images</h2>

      <nav className="crumbs" aria-label="Folder">
        <button type="button" onClick={() => goTo("")} disabled={here === ""}>
          Dataset
        </button>
        {crumbs.map((name, index) => (
          <span key={`${name}-${index}`}>
            {" / "}
            <button
              type="button"
              onClick={() => goTo(crumbs.slice(0, index + 1).join("/"))}
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
              <button type="button" onClick={() => goTo(here === "" ? name : `${here}/${name}`)}>
                {name}/
              </button>
            </li>
          ))}
        </ul>
      )}

      {ready.unrecognized > 0 && (
        <p role="status" className="dataset__unrecognized">
          {ready.unrecognized} file{ready.unrecognized === 1 ? "" : "s"} not recognized
        </p>
      )}

      {/* Legacy's header row (fast_file_manager.py:1143-1213): search, the column menu, Refresh,
          Hide, and Show All while rows are hidden. */}
      <div className="dataset__toolbar">
        <input
          type="search"
          className="dataset__search"
          value={query}
          placeholder="Search files..."
          aria-label="Search files"
          onChange={(event) => setQuery(event.target.value)}
        />
        <details className="dataset__columns">
          {/* Legacy's 30px column menu button, "⚏" (fast_file_manager.py:47). */}
          <summary aria-label="Columns" title="Columns">
            ⚏
          </summary>
          {/* A dropdown, as legacy's column menu is, so opening it does not push the list. */}
          <div className="dataset__columns-menu">
            {/* Legacy's ten, in its order, Name among them (fast_file_manager.py:1168-1178). */}
            {columns.flatMap((column) => {
              const setting = column.setting;
              if (setting === undefined) return [];
              return [
                <label key={column.id} title={column.suffix}>
                  <input
                    type="checkbox"
                    checked={settings.values[setting] !== false}
                    aria-label={`Show the ${column.title} column`}
                    onChange={(event) =>
                      void save({
                        ...settings,
                        values: { ...settings.values, [setting]: event.target.checked },
                      })
                    }
                  />{" "}
                  {column.title}
                </label>,
              ];
            })}
          </div>
        </details>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
        <button type="button" title="Hide selected files from the list" onClick={hideSelected}>
          Hide
        </button>
        {hidden.size > 0 && (
          <button type="button" title="Restore all hidden files" onClick={() => setHidden(NOTHING_HIDDEN)}>
            Show All ({hidden.size})
          </button>
        )}
      </div>

      {ready.images.length === 0 ? (
        // Legacy's empty footer (fast_file_manager.py:952-953). A folder holding only folders is
        // the normal shape of a dataset root; they are listed just above, so a place to go through
        // does not read as a failure.
        <p>No images in {where}</p>
      ) : (
        <table
          className={[
            "dataset",
            coloured === null ? "" : "dataset--ranged",
            dropBefore === null ? "dataset--drop-end" : "",
          ].filter((name) => name !== "").join(" ")}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropBefore(undefined);
          }}
        >
          <thead>
            <tr>
              {/* Legacy's column names (fast_file_manager.py:277-288), each format's suffix in its
                  tooltip. A click sorts by the column, again turns it around. */}
              {shown.map((column) => (
                <th
                  scope="col"
                  key={column.id}
                  title={column.suffix}
                  data-sort={arrow(column)}
                  aria-sort={inCustomOrder ? undefined : arrow(column)}
                >
                  <button type="button" onClick={() => sortBy(column.id)}>
                    {column.title}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((image) => (
              <tr
                key={image.key}
                data-key={image.key}
                aria-selected={picked.has(image.key)}
                className={[rangeClass(image.key), dropBefore === image.key ? "dataset__row--drop" : undefined]
                  .filter((name) => name !== undefined)
                  .join(" ") || undefined}
                draggable
                onClick={(event) => onRowClick(event, image.key)}
                onDoubleClick={() => openImage(image)}
                onContextMenu={(event) => onRowContextMenu(event, image.key)}
                onDragStart={(event) => onDragStart(event, image.key)}
                onDragEnd={endDrag}
              >
                {shown.map((column) => (
                  <Cell key={column.id} column={column} image={image} />
                ))}
              </tr>
            ))}
          </tbody>
          {/* Legacy's totals row: how many images, in its words, under Name, and how many have each
              format, blank for none (fast_file_manager.py:948-959). Hidden rows count. */}
          <tfoot>
            <tr>
              {shown.map((column) => {
                if (column.kind === "name") {
                  return (
                    <th scope="row" key={column.id}>
                      {ready.images.length} image{ready.images.length === 1 ? "" : "s"} in{" "}
                      {folderName(ready.folder)}
                    </th>
                  );
                }
                const count =
                  column.kind === "format"
                    ? ready.images.filter((image) => image.sidecars[column.id]).length
                    : 0;
                return <td key={column.id}>{count > 0 ? count : ""}</td>;
              })}
            </tr>
          </tfoot>
        </table>
      )}

      {menu !== null && menuRows.length > 0 && (
        <FileMenu
          at={menu}
          onClose={closeMenu}
          items={[
            {
              label: menuRows.length === 1 ? "Copy filename" : `Copy ${menuRows.length} filenames`,
              run: () => copy(copiedNames(menuRows.map((image) => image.name))),
            },
            {
              label: menuRows.length === 1 ? "Copy path" : `Copy ${menuRows.length} paths`,
              run: () => copy(menuRows.map((image) => filePath(root, image.key)).join("\n")),
            },
            null,
            {
              label: menuRows.length === 1 ? "Hide file" : `Hide ${menuRows.length} files`,
              run: hideSelected,
            },
          ]}
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

/** One row's cell in one column, as legacy's model shows it (fast_file_manager.py:461-500). */
function Cell({ column, image }: { readonly column: ListColumn; readonly image: WireDatasetImage }): ReactNode {
  switch (column.kind) {
    case "name":
      return (
        <th scope="row">
          {/* A button so the row can be reached and selected from the keyboard; the row's click
              selects and its double-click opens. */}
          <button type="button">{image.name}</button>
          {image.sharesSidecarsWith.length > 0 && (
            <span role="status" className="collision">
              {" "}
              shares annotation files with {image.sharesSidecarsWith.join(", ")}
            </span>
          )}
        </th>
      );
    case "format":
      return (
        <td>
          <span aria-label={image.sidecars[column.id] ? "present" : "absent"}>
            {image.sidecars[column.id] ? "✓" : ""}
          </span>
        </td>
      );
    case "modified":
      return <td className="dataset__detail">{formatModified(image.modified)}</td>;
    case "size":
      return <td className="dataset__detail">{formatSize(image.size)}</td>;
  }
}

/** A menu entry, or null for the line between entries. */
type MenuItem = { readonly label: string; readonly run: () => void } | null;

/**
 * Legacy's right-click menu over the list, where it was clicked, until an entry is chosen, Escape
 * is pressed or the pointer goes down elsewhere (fast_file_manager.py:1675-1690).
 */
function FileMenu({
  at,
  items,
  onClose,
}: {
  readonly at: { readonly x: number; readonly y: number };
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
}): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(at);

  // Kept on screen, as a Qt menu is: the list is the window's right-hand column.
  useLayoutEffect(() => {
    const size = box.current?.getBoundingClientRect();
    if (size === undefined) return;
    const x = Math.max(0, Math.min(at.x, window.innerWidth - size.width));
    const y = Math.max(0, Math.min(at.y, window.innerHeight - size.height));
    setPlace({ x, y });
  }, [at]);

  useEffect(() => {
    box.current?.querySelector("button")?.focus();
  }, []);

  useEffect(() => {
    const away = (event: Event): void => {
      if (!(event.target instanceof Node) || !box.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [onClose]);

  // The menu's keys are the menu's: none reaches the application's shortcuts behind it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    const entries = [...(box.current?.querySelectorAll("button") ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const by = event.key === "ArrowDown" ? 1 : -1;
      entries[(at + by + entries.length) % entries.length]?.focus();
    }
  };

  return (
    <div
      ref={box}
      role="menu"
      aria-label="File"
      className="file-menu"
      style={{ left: place.x, top: place.y }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) =>
        item === null ? (
          <div key={`line-${index}`} role="separator" className="file-menu__line" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
