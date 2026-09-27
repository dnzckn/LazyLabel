/**
 * A pair's unfinished polygons, held by the split view so both halves draw them and they outlive
 * the view moving to the other half.
 *
 * Legacy keeps a polygon in progress PER VIEWER (main_window.py:5599-5706). Linked, every vertex goes
 * into both viewers at the same pixel and is drawn in both; a click on the first vertex, Space or
 * Enter finishes both, and Escape clears both (5609-5652; keyboard_event_manager.py:99-123, 206-230,
 * 315-334). While linked the two are the same polygon, so it is held once, and finishing it adds it
 * to both images through the store's linked add.
 *
 * UNLINKED, EACH IMAGE KEEPS ITS OWN, since 2026-09-27: a vertex goes into the image clicked alone,
 * making the other half the one edited leaves this one's polygon where it is, drawn in its half,
 * and Space finishes every polygon of three vertices or more, each into its own image, while a click
 * on a first vertex finishes that image's alone (main_window.py:5633-5652; keyboard_event_manager.py:
 * 118-123, 157-163). Escape still clears both. Until then the view's own polygon went with the move.
 *
 * Unlinking keeps what each image holds, as legacy's viewers keep their points. Linking two
 * DIFFERENT polygons starts again: a linked pair has one, and legacy's would go on adding the same
 * vertex to two different shapes. Another pair, or another tool, starts again too.
 */

import { createContext, useCallback, useMemo, useRef, useState } from "react";

import { EMPTY_DRAFT, type PolygonDraft } from "../tools/polygon.js";
import type { SideIndex } from "../workspace/WorkspaceProvider.jsx";

export interface PairDraft {
  /** Whether the pair is linked: one polygon for both images, or each image its own. */
  readonly linked: boolean;
  /** The side being edited, whose polygon `draft` is. */
  readonly active: SideIndex;
  /** Each image's polygon in progress, by side. Linked, the pair's one polygon in both. */
  readonly drafts: readonly [PolygonDraft, PolygonDraft];
  /** The polygon in progress of the image being edited. */
  readonly draft: PolygonDraft;
  /** Sets the polygon of the image being edited; linked, of both. */
  readonly setDraft: (draft: PolygonDraft) => void;
  /** Empties these images' polygons; both, when none is named. */
  readonly clear: (sides?: readonly SideIndex[]) => void;
}

/** The pair's polygons in progress, while the Multi tab shows a pair and the polygon tool; else null. */
export const PairDraftContext = createContext<PairDraft | null>(null);

type Drafts = readonly [PolygonDraft, PolygonDraft];

const NONE: Drafts = [EMPTY_DRAFT, EMPTY_DRAFT];

/**
 * The pair's polygons, or null when there is no pair to draw on. `key` names the pair and whatever
 * else starts the polygons again when it changes, or is null for none.
 */
export function usePairDrafts(key: string | null, linked: boolean, active: SideIndex): PairDraft | null {
  const [held, setHeld] = useState<{ readonly key: string | null; readonly drafts: Drafts }>({ key, drafts: NONE });

  // Another pair or tool, or two different polygons linked: start again. Set while rendering, so no
  // render shows a linked pair with two polygons (react.dev: storing information from previous renders).
  const fresh = held.key !== key || (linked && held.drafts[0] !== held.drafts[1]);
  if (fresh && (held.key !== key || held.drafts !== NONE)) setHeld({ key, drafts: NONE });
  const drafts = fresh ? NONE : held.drafts;

  // Read when a setter is called, so a setter kept by a key handler still acts on the side edited now.
  const now = useRef({ linked, active });
  now.current = { linked, active };

  const setDraft = useCallback((draft: PolygonDraft) => {
    const { linked: bothImages, active: side } = now.current;
    setHeld((current) => {
      const next: Drafts = bothImages ? [draft, draft] : side === 0 ? [draft, current.drafts[1]] : [current.drafts[0], draft];
      return next[0] === current.drafts[0] && next[1] === current.drafts[1] ? current : { ...current, drafts: next };
    });
  }, []);

  const clear = useCallback((sides?: readonly SideIndex[]) => {
    setHeld((current) => {
      const emptied = (side: SideIndex) => sides === undefined || sides.includes(side) || now.current.linked;
      const next: Drafts = [
        emptied(0) ? EMPTY_DRAFT : current.drafts[0],
        emptied(1) ? EMPTY_DRAFT : current.drafts[1],
      ];
      return next[0] === current.drafts[0] && next[1] === current.drafts[1] ? current : { ...current, drafts: next };
    });
  }, []);

  return useMemo(
    () =>
      key === null
        ? null
        : { linked, active, drafts, draft: drafts[active], setDraft, clear },
    [active, clear, drafts, key, linked, setDraft],
  );
}
