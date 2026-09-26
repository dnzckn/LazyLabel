/**
 * What the file list does with its rows, apart from drawing them: which are selected, where the
 * cursor is, where dragged rows land, and what Copy puts on the clipboard. Legacy's
 * `FastFileManager` (utils/fast_file_manager.py), by key rather than by row number.
 */

/**
 * Which rows are selected, the cursor and the anchor of a Shift range: Qt's selection model in its
 * ExtendedSelection mode (fast_file_manager.py:1025-1026).
 *
 * The rows chosen by plain and Ctrl clicks are `committed`, in the order they were chosen; `extent`
 * is the run the last Shift click selected, which the next Shift click replaces. Qt keeps the two
 * apart the same way, and lists a selection in that order, which is the order Copy uses.
 */
export interface Selection {
  readonly committed: readonly string[];
  readonly extent: readonly string[];
  /** Where a Shift click's run starts. */
  readonly anchor: string | null;
  /** The list's current row: next and previous image step from it (1771-1843). */
  readonly cursor: string | null;
}

export const NO_SELECTION: Selection = { committed: [], extent: [], anchor: null, cursor: null };

/** The row alone selected and current, as opening an image leaves it (1745-1759). */
export function selectOnly(key: string | null): Selection {
  return key === null ? NO_SELECTION : { committed: [key], extent: [], anchor: key, cursor: key };
}

/**
 * The selection without the rows the list stopped showing, as Qt drops them when its proxy filters
 * them out, the current row and the anchor with them. The same object when none went.
 */
export function keepShown(selection: Selection, shown: ReadonlySet<string>): Selection {
  const committed = selection.committed.filter((key) => shown.has(key));
  const extent = selection.extent.filter((key) => shown.has(key));
  const anchor = selection.anchor !== null && shown.has(selection.anchor) ? selection.anchor : null;
  const cursor = selection.cursor !== null && shown.has(selection.cursor) ? selection.cursor : null;
  const same =
    committed.length === selection.committed.length
    && extent.length === selection.extent.length
    && anchor === selection.anchor
    && cursor === selection.cursor;
  return same ? selection : { committed, extent, anchor, cursor };
}

/** The selected rows, in the order Qt lists them: committed first, then the Shift run. */
export function selectedKeys(selection: Selection): readonly string[] {
  return [...new Set([...selection.committed, ...selection.extent])];
}

/**
 * A click on a row. Shift selects the run from the anchor to it, in the order on screen; Ctrl or
 * Cmd adds it or takes it away; a plain click selects it alone. Each makes it the current row.
 */
export function clickRow(
  selection: Selection,
  key: string,
  modifiers: { readonly shift: boolean; readonly toggle: boolean },
  order: readonly string[],
): Selection {
  if (modifiers.shift) {
    // Qt falls back to the current row when the anchor has gone, as a hidden row's has.
    const from = [selection.anchor, selection.cursor].find((candidate) => candidate !== null && order.includes(candidate)) ?? key;
    const [a, b] = [order.indexOf(from), order.indexOf(key)];
    return { ...selection, extent: order.slice(Math.min(a, b), Math.max(a, b) + 1), anchor: from, cursor: key };
  }
  if (modifiers.toggle) {
    const all = selectedKeys(selection);
    const committed = all.includes(key) ? all.filter((each) => each !== key) : [...all, key];
    return { committed, extent: [], anchor: key, cursor: key };
  }
  return selectOnly(key);
}

/**
 * The order with `moving` taken out and put back before `before`, or at the end when it is null:
 * legacy's `moveFileRows` (fast_file_manager.py:337-358). The moved rows keep their order among
 * themselves, and a drop onto one of them lands where the rows above it that stay put end.
 */
export function moveKeys(order: readonly string[], moving: ReadonlySet<string>, before: string | null): readonly string[] {
  const at = before === null ? order.length : order.indexOf(before);
  const place = order.slice(0, at < 0 ? order.length : at).filter((key) => !moving.has(key)).length;
  const moved = order.filter((key) => moving.has(key));
  const rest = order.filter((key) => !moving.has(key));
  return [...rest.slice(0, place), ...moved, ...rest.slice(place)];
}

/**
 * The range's rows put in the timeline's order, each into a place one of them held: legacy's
 * `reorderRows` (fast_file_manager.py:360-373), which its timeline Sort calls (1331-1351).
 * `placed` says whether any row was in the order at all.
 */
export function placeInOrder(
  order: readonly string[],
  range: readonly string[],
  timeline: readonly string[],
): { readonly order: readonly string[]; readonly placed: boolean } {
  const inRange = new Set(range);
  const at = new Map(order.map((key, index) => [key, index]));
  const moved = timeline.filter((key) => inRange.has(key) && at.has(key));
  const places = moved.map((key) => at.get(key)!).sort((a, b) => a - b);
  const reordered = [...order];
  places.forEach((place, n) => {
    reordered[place] = moved[n]!;
  });
  return { order: reordered, placed: moved.length > 0 };
}

/**
 * An order kept from an earlier listing, brought up to date with this one: keys that went are
 * dropped, and new ones go at the end in the listing's order.
 */
export function reconcile(order: readonly string[] | null, keys: readonly string[]): readonly string[] {
  if (order === null) return keys;
  const present = new Set(keys);
  const kept = order.filter((key) => present.has(key));
  const seen = new Set(kept);
  return [...kept, ...keys.filter((key) => !seen.has(key))];
}

/**
 * What "Copy filename" puts on the clipboard: the name alone for one row, and for several a JSON
 * list exactly as Python's `json.dumps` writes it, with ", " between names and anything outside
 * printable ASCII escaped (fast_file_manager.py:1691-1698).
 */
export function copiedNames(names: readonly string[]): string {
  if (names.length === 1) return names[0]!;
  const quoted = names.map((name) =>
    JSON.stringify(name).replace(/[\u007f-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`),
  );
  return `[${quoted.join(", ")}]`;
}

/**
 * A file's path as legacy copies it: the image's own path on disk (fast_file_manager.py:1670,
 * 1699-1704). The dataset folder is the server's, so its path comes from the server; the key is
 * joined to it with the separator that path already uses. Without it the key is all there is.
 */
export function filePath(root: string | undefined, key: string): string {
  if (root === undefined || root === "") return key;
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const base = root.endsWith(separator) ? root.slice(0, -1) : root;
  return `${base}${separator}${key.split("/").join(separator)}`;
}
