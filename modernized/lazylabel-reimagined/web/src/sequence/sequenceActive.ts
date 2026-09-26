/**
 * Whether the Sequence tab is the one showing.
 *
 * The timeline stays mounted when its tab is left, and throws its timeline away when this turns
 * false, as legacy's exit does (CentreTabs.tsx, SEQUENCE_PARITY.md SP-15). Its KEYS must not act
 * meanwhile. Legacy's sequence keys act only in sequence mode: each handler returns when there is
 * no sequence view (main_window.py:4666-4716, 5150-5168). Here N pressed on the Single tab opened a
 * flagged frame.
 *
 * True where no tab says otherwise, so the panel works on its own, as its tests render it.
 */

import { createContext, useContext } from "react";

export const SequenceActiveContext = createContext(true);

/** What Find Archetypes' key says off the Sequence tab, whether or not the timeline is mounted. */
export const FIND_ARCHETYPES_ELSEWHERE = "Find Archetypes works on the Sequence tab";

export function useSequenceActive(): boolean {
  return useContext(SequenceActiveContext);
}
