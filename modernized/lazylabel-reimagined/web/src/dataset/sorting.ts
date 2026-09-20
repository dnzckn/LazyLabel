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
  { value: 0, label: "Name (A–Z)", supported: true },
  { value: 1, label: "Name (Z–A)", supported: true },
  { value: 2, label: "Modified (oldest first)", supported: false },
  { value: 3, label: "Modified (newest first)", supported: false },
  { value: 4, label: "Size (smallest first)", supported: false },
  { value: 5, label: "Size (largest first)", supported: false },
] as const;

export function isSupported(order: number): boolean {
  return SORT_ORDERS.some((entry) => entry.value === order && entry.supported);
}

export function labelFor(order: number): string {
  return SORT_ORDERS.find((entry) => entry.value === order)?.label ?? SORT_ORDERS[0].label;
}

interface Named {
  readonly name: string;
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
  if (!isSupported(order)) return images;
  if (order === 0) return images;

  const byName = [...images].sort((a, b) => {
    const left = a.name.toLowerCase();
    const right = b.name.toLowerCase();
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return byName.reverse();
}
