/**
 * The other half of the Multi tab, for the pan keys -- CONTROL_PARITY.md CP-31.
 *
 * The interactive view is drawn in the active half, and its W, A, S and D move it. Legacy's move
 * BOTH viewers, each by its own size (viewport_manager.py:45-50). So the split view hands the view
 * this, which moves the other half the same way; outside the Multi tab there is none.
 */

import { createContext } from "react";

/** Pan the other half by one press: `dx` and `dy` are -1, 0 or 1; `multiplier` is `pan_multiplier`. */
export type PairPan = (dx: number, dy: number, multiplier: number) => void;

export const PairPanContext = createContext<PairPan | null>(null);
