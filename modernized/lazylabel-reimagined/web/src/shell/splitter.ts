/**
 * The arithmetic of the right-hand column's splitter (`Splitter.tsx`), apart from the page so it can
 * be tested without a layout engine.
 *
 * A SHARE IS A SECTION'S PART OF THE HEIGHT, as a flex-grow factor: the column's height is divided
 * between the open sections in proportion to their shares, so a closed section's share goes to the
 * others and a window made taller or shorter keeps the proportions, much as legacy's QSplitter
 * spreads a resize over its sections (right_panel.py:67-85).
 */

/** How far one press of Up or Down moves a focused divider, in pixels. */
export const KEY_STEP = 10;

/** The open sections either side of divider `index`, which sits between sections `index` and `index + 1`. */
export interface Pair {
  readonly above: number;
  readonly below: number;
}

/**
 * Which two sections divider `index` resizes: the nearest open one above it and the nearest below.
 * A closed section keeps its header's height and moves with the divider; null when every section
 * on one side is closed, and the divider has nothing to move.
 */
export function pairAt(collapsed: readonly boolean[], index: number): Pair | null {
  let above = index;
  while (above >= 0 && collapsed[above] === true) above -= 1;
  let below = index + 1;
  while (below < collapsed.length && collapsed[below] === true) below += 1;
  if (above < 0 || below >= collapsed.length) return null;
  return { above, below };
}

/**
 * The shares after divider `pair` has moved `by` pixels (down is positive), from where a drag began.
 *
 * The two sections keep the height they had between them, as a QSplitter handle trades height
 * between its neighbours alone, and neither goes under its minimum: a move past one stops there.
 * `heights` are the two sections' heights when the move began, measured on the page. Where the two
 * minimums do not fit in the height the two have, nothing moves.
 */
export function moveDivider(
  shares: readonly number[],
  pair: Pair,
  heights: { readonly above: number; readonly below: number },
  by: number,
  mins: { readonly above: number; readonly below: number },
): number[] {
  const total = heights.above + heights.below;
  const lowest = mins.above;
  const highest = total - mins.below;
  if (!(total > 0) || lowest > highest) return [...shares];
  const above = Math.min(highest, Math.max(lowest, heights.above + by));
  const weight = (shares[pair.above] ?? 0) + (shares[pair.below] ?? 0);
  const next = [...shares];
  next[pair.above] = (weight * above) / total;
  next[pair.below] = weight - next[pair.above]!;
  return next;
}

/**
 * The shares a viewer left, read back from this browser, or the defaults: for nothing stored, for
 * anything unreadable, and for a list made for a different set of sections.
 */
export function readShares(stored: string | null, defaults: readonly number[]): number[] {
  if (stored === null) return [...defaults];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [...defaults];
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== defaults.length
    || !parsed.every((share) => typeof share === "number" && Number.isFinite(share) && share > 0)
  ) {
    return [...defaults];
  }
  return parsed as number[];
}

/**
 * The flex-grow factors the open sections are drawn with: their shares as parts of 100.
 *
 * NEVER THE RAW SHARES. Flex factors that add up to less than 1 hand out only that fraction of the
 * free height, so with Segments closed the file list and the classes, at 0.38 and 0.31, left almost
 * a third of the column empty. A closed section's factor is 0; its header keeps its own height.
 */
export function growFactors(shares: readonly number[], collapsed: readonly boolean[]): number[] {
  const open = shares.reduce((sum, share, index) => (collapsed[index] === true ? sum : sum + share), 0);
  return shares.map((share, index) =>
    collapsed[index] === true || !(open > 0) ? 0 : Math.round((1e6 * share) / open) / 1e4,
  );
}

/** Where divider `pair` stands, as a percentage of the two sections' shares: its ARIA value. */
export function dividerValue(shares: readonly number[], pair: Pair): number {
  const above = shares[pair.above] ?? 0;
  const both = above + (shares[pair.below] ?? 0);
  return both > 0 ? Math.round((100 * above) / both) : 50;
}
