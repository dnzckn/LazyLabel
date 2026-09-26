/**
 * How the file list sorts: by a click on any column's header, the format columns too, as legacy's
 * table does (fast_file_manager.py:1055-1063, 817-882; CONTROL_PARITY.md CP-48).
 *
 * `file_manager_sort_order` holds legacy's six stored orders by index (1250-1260): name, modified
 * and size, each ascending and descending. It sets the order the list opens in, as legacy's
 * `setDisplaySettings` applies it (1886-1891). A header click does not change it: legacy's never
 * does either, since the handler that would (1239-1248) has no caller.
 */

/** A column the list is sorted by, and which way. */
export interface SortKey {
  /** "name", "modified", "size", or the format a status column shows. */
  readonly column: string;
  readonly descending: boolean;
}

/** Legacy's six stored orders, by index (fast_file_manager.py:1252-1259). */
const STORED: readonly SortKey[] = [
  { column: "name", descending: false },
  { column: "name", descending: true },
  { column: "modified", descending: false },
  { column: "modified", descending: true },
  { column: "size", descending: false },
  { column: "size", descending: true },
];

/** The stored order the list opens in. Anything but the six is Name ascending, as legacy's `get` default is. */
export function storedSort(order: unknown): SortKey {
  return (typeof order === "number" && Number.isInteger(order) ? STORED[order] : undefined) ?? STORED[0]!;
}

/**
 * Whether sorting by this key needs each file's size and date, which the listing carries only when
 * asked: filling them costs a stat per image on the server.
 */
export function sortNeedsDetails(key: SortKey): boolean {
  return key.column === "modified" || key.column === "size";
}

/**
 * The sort a header click asks for, as Qt's header decides it: the column already sorted turns
 * around, and any other sorts ascending.
 */
export function clickedSort(current: SortKey, column: string): SortKey {
  return current.column === column
    ? { column, descending: !current.descending }
    : { column, descending: false };
}

interface Sortable {
  readonly name: string;
  readonly sidecars?: Readonly<Record<string, boolean>>;
  /** Present only when the listing was asked for details. */
  readonly size?: number;
  readonly modified?: number | null;
}

/**
 * The rows sorted by one column, leaving the input alone.
 *
 * As legacy's proxy compares them (fast_file_manager.py:817-882): names lowercased and compared
 * plainly, so frame_10 comes before frame_2; sizes and dates as numbers, one that could not be read
 * counting as -1; a format column by whether the file is there, those without it first.
 *
 * STABLE, as Qt's sort is, and a descending sort does not reverse the rows that tie: they keep the
 * order they arrived in. The caller passes the order on screen, so a second header click sorts
 * within the first, as it does in legacy's list.
 */
export function sortRows<T extends Sortable>(rows: readonly T[], key: SortKey): readonly T[] {
  const value = valueOf(key.column);
  return [...rows].sort((a, b) => (key.descending ? compare(value(b), value(a)) : compare(value(a), value(b))));
}

function valueOf(column: string): (row: Sortable) => string | number {
  switch (column) {
    case "name":
      return (row) => row.name.toLowerCase();
    case "size":
      // Undefined is a listing asked for no details: every row ties, and the order stands.
      return (row) => row.size ?? 0;
    case "modified":
      return (row) => (row.modified === null ? -1 : row.modified ?? 0);
    default:
      return (row) => (row.sidecars?.[column] === true ? 1 : 0);
  }
}

function compare(left: string | number, right: string | number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
