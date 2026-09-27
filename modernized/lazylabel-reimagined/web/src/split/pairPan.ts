/**
 * The other half of the Multi tab, for the pan keys and the scroll -- CONTROL_PARITY.md CP-31.
 *
 * The interactive view is drawn in the active half, and its W, A, S and D move it. Legacy's move
 * BOTH viewers, each by its own size (viewport_manager.py:45-50). So the split view hands the view
 * this, which moves the other half the same way; outside the Multi tab there is none.
 *
 * Each half also keeps where it was scrolled to when the other is made the one edited, as each of
 * legacy's viewers is a widget of its own that nothing re-scrolls. Here the view moves between the
 * halves and each half's picture is drawn afresh, so the split view remembers the place for it.
 */

import { createContext, useCallback, useMemo, useRef } from "react";

import type { SideIndex } from "../workspace/WorkspaceProvider.jsx";

/** Pan the other half by one press: `dx` and `dy` are -1, 0 or 1; `multiplier` is `pan_multiplier`. */
export type PairPan = (dx: number, dy: number, multiplier: number) => void;

export const PairPanContext = createContext<PairPan | null>(null);

export interface PaneScroll {
  /**
   * Put `element` back where `side`'s half was last scrolled to, and follow its scrolling from
   * here on. Returns what stops following.
   */
  readonly keep: (side: SideIndex, element: HTMLElement) => () => void;
}

/** Each half's scroll position, kept by the split view; null outside the Multi tab. */
export const PaneScrollContext = createContext<PaneScroll | null>(null);

/** The split view's memory of where each half was scrolled to. */
export function usePaneScroll(): PaneScroll {
  const places = useRef<[{ left: number; top: number } | null, { left: number; top: number } | null]>([
    null,
    null,
  ]);

  const keep = useCallback((side: SideIndex, element: HTMLElement) => {
    const place = places.current[side];
    if (place !== null) {
      element.scrollLeft = place.left;
      element.scrollTop = place.top;
    }
    const follow = () => {
      places.current[side] = { left: element.scrollLeft, top: element.scrollTop };
    };
    element.addEventListener("scroll", follow, { passive: true });
    return () => element.removeEventListener("scroll", follow);
  }, []);

  return useMemo(() => ({ keep }), [keep]);
}
