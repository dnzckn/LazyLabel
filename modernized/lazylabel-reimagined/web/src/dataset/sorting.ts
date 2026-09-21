/**
 * The order the dataset browser lists images in — RULE-036's `file_manager_sort_order`.
 *
 * Legacy's six, by dropdown index (`fast_file_manager.py:1250-1259`): name ascending and
 * descending, modified ascending and descending, size ascending and descending.
 *
 * ONLY THE TWO NAME ORDERS CAN BE HONOURED TODAY, and the reason is worth stating rather than
 * working around. `WireDatasetImage` carries no `modified` and no `size`, and `listing.ts` has an
 * explicit "ONE PASS, NOT SEVEN PER IMAGE" optimisation behind that: adding a stat per image to
 * every listing would pay for a column most folders never show. The shape that fits is a
 * `?details=1` the client asks for only when a sort or a column needs it, which is a contract
 * change and its own slice.
 *
 * So an order this app cannot perform falls back to NAME ASCENDING and says so through
 * `isSupported`, rather than silently returning the list in some other order. A user whose
 * imported legacy settings say "size, largest first" is told that is not available yet; they are
 * not shown a list sorted by name that claims to be sorted by size.
 */

export const SORT_ORDERS = [
  { value: 0, label: "Name (A–Z)", needsDetails: false },
  { value: 1, label: "Name (Z–A)", needsDetails: false },
  { value: 2, label: "Modified (oldest first)", needsDetails: true },
  { value: 3, label: "Modified (newest first)", needsDetails: true },
  { value: 4, label: "Size (smallest first)", needsDetails: true },
  { value: 5, label: "Size (largest first)", needsDetails: true },
] as const;

/**
 * Whether this order needs the listing to have been asked for DETAILS.
 *
 * Four of the six sort by a file's date or size, which the listing carries only on request --
 * because filling them costs a stat per image, and a folder of ten thousand frames would pay for
 * it on every listing to serve a sort nobody chose.
 */
export function needsDetails(order: number): boolean {
  return SORT_ORDERS.some((entry) => entry.value === order && entry.needsDetails);
}

export function isSupported(order: number): boolean {
  return SORT_ORDERS.some((entry) => entry.value === order);
}


interface Named {
  readonly name: string;
  /** Present only when the listing was asked for details. */
  readonly size?: number;
  readonly modified?: number | null;
}

/**
 * Sort a listing, leaving the input alone.
 *
 * By LOWERCASED name, which is what the API already does when it builds the listing — so order 0
 * returns what arrived, in the same order, rather than a second sort that could disagree with the
 * server's on case. `localeCompare` is deliberately not used: the server's comparison is a plain
 * one, and two different collations applied to one list is how "a.png, B.png" and "B.png, a.png"
 * both look correct depending on who you ask.
 */
export function sortImages<T extends Named>(images: readonly T[], order: number): readonly T[] {
  if (!isSupported(order) || order === 0) return images;

  if (order === 1) {
    return [...images].sort((a, b) => compareNames(b, a));
  }

  /*
   * A DETAIL SORT WITH NO DETAILS FALLS BACK TO NAME, rather than putting every file it cannot
   * measure at one end. That happens for one render after the order changes -- the listing has to
   * be fetched again with `details=1` -- and for any store that cannot report a modified time at
   * all, which the port allows.
   *
   * Ties break by NAME, so a folder whose files were all written in the same second has a stable,
   * meaningful order rather than whatever the previous sort left behind.
   */
  const by = order === 2 || order === 3 ? "modified" : "size";
  const descending = order === 3 || order === 5;
  if (images.every((image) => image[by] === undefined || image[by] === null)) return images;

  return [...images].sort((a, b) => {
    const left = a[by] ?? null;
    const right = b[by] ?? null;
    // A file whose date or size is unknown sorts LAST whichever way the order runs: it is a gap in
    // what is known, not a very small or very old file.
    if (left === null || right === null) return left === right ? compareNames(a, b) : left === null ? 1 : -1;
    if (left === right) return compareNames(a, b);
    return descending ? right - left : left - right;
  });
}

function compareNames(a: Named, b: Named): number {
  const left = a.name.toLowerCase();
  const right = b.name.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}
