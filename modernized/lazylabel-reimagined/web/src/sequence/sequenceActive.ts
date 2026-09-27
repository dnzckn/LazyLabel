/**
 * Whether the Sequence tab is the one showing.
 *
 * The timeline stays mounted when its tab is left, and throws its timeline away when this turns
 * false, as legacy's exit does (CentreTabs.tsx, SEQUENCE_PARITY.md SP-15). Its KEYS must not act
 * meanwhile. Legacy's sequence keys act only in sequence mode: each handler returns when there is
 * no sequence view (main_window.py:4666-4716, 5150-5168). Here N pressed on the Single tab opened a
 * flagged frame. Off the tab they say legacy's notices instead, as its torn-down timeline does.
 *
 * True where no tab says otherwise, so the panel works on its own, as its tests render it.
 */

import { createContext, useContext } from "react";

export const SequenceActiveContext = createContext(true);

/**
 * What legacy says when there is no such frame to move to (main_window.py:4673-4706, 5158-5168).
 * Its sequence keys are the window's, on every tab, over a timeline torn down on leaving (SP-56).
 */
export const NOTHING_TO_STEP_TO = {
  flagged: "No more flagged frames",
  reference: "No reference frames",
  suggested: "No suggested frames",
} as const;

/** Legacy's Ctrl+H with no timeline built (main_window.py:5057-5059), on any tab. */
export const BUILD_A_TIMELINE_FIRST = "Build a timeline first";

export function useSequenceActive(): boolean {
  return useContext(SequenceActiveContext);
}
