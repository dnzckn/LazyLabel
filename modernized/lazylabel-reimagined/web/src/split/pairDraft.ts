/**
 * A linked pair's unfinished polygon, held by the split view so both halves draw it and it outlives
 * the view moving to the other half.
 *
 * Legacy keeps a polygon in progress per viewer and, linked, puts every vertex into both viewers at
 * the same pixel and draws it in both (main_window.py:5599-5706). A click on either viewer's first
 * vertex, Space or Enter finishes both, and Escape clears both (5609-5652;
 * keyboard_event_manager.py:99-123, 206-230, 315-334). While linked the two are the same polygon,
 * so it is held once, and finishing it adds it to both images through the store's linked add.
 * Unlinked, the view keeps its own, which goes when the view moves (CONTROL_PARITY.md CP-31).
 */

import { createContext, type Dispatch, type SetStateAction } from "react";

import type { PolygonDraft } from "../tools/polygon.js";

export interface PairDraft {
  readonly draft: PolygonDraft;
  readonly setDraft: Dispatch<SetStateAction<PolygonDraft>>;
}

/** The linked pair's polygon in progress, while the Multi tab shows a linked pair; else null. */
export const PairDraftContext = createContext<PairDraft | null>(null);
