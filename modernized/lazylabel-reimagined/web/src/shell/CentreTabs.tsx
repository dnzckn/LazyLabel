/**
 * The centre pane's tabs: Single, Multi and Sequence, as in legacy (main_window.py:673-691).
 *
 * Until 2026-09-24 the split view and the sequence timeline were collapsible panels in the right
 * column, a quarter of the window wide. Legacy gives each the centre, and so does this.
 *
 * ONE VIEW, WHEREVER IT IS SHOWN. The interactive view registers the save, undo and pan keys, so
 * two mounted copies would answer each key twice. Single and Sequence show it in the same place in
 * the tree, so moving between them keeps it; Multi hands it to the split view, which draws it in
 * the active half. It remounts then, which is safe because everything it holds that matters --
 * the annotations, the crop, the file revisions -- is in the store.
 *
 * THE TIMELINE STAYS MOUNTED once opened, hidden on the other tabs. It holds a built timeline and
 * any propagated masks not yet saved -- minutes of GPU time -- and leaving the tab must not throw
 * them away. The Sequence panel learned the same thing when collapsing it did.
 */

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type CentreTab = "single" | "multi" | "sequence";

const TABS: readonly { readonly id: CentreTab; readonly label: string }[] = [
  { id: "single", label: "Single" },
  { id: "multi", label: "Multi" },
  { id: "sequence", label: "Sequence" },
];

export interface CentreTabsProps {
  /** The interactive view of the active image. */
  readonly viewer: ReactNode;
  /** The Multi tab, given the view to draw in its active half. */
  readonly multi: (viewer: ReactNode) => ReactNode;
  /** The Sequence tab's controls, shown under the view. */
  readonly sequence: ReactNode;
}

export function CentreTabs({ viewer, multi, sequence }: CentreTabsProps): ReactNode {
  const [tab, setTab] = useState<CentreTab>("single");
  // Built the first time it is opened, then kept: see the module comment.
  const [sequenceOpened, setSequenceOpened] = useState(false);
  const buttons = useRef<Partial<Record<CentreTab, HTMLButtonElement | null>>>({});

  const choose = useCallback((next: CentreTab) => {
    setTab(next);
    if (next === "sequence") setSequenceOpened(true);
  }, []);

  // The tab pattern's keys: the arrows move between tabs and select as they go, Home and End jump.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const at = TABS.findIndex((entry) => entry.id === tab);
      const to =
        event.key === "ArrowRight" ? (at + 1) % TABS.length
        : event.key === "ArrowLeft" ? (at - 1 + TABS.length) % TABS.length
        : event.key === "Home" ? 0
        : event.key === "End" ? TABS.length - 1
        : null;
      if (to === null) return;
      event.preventDefault();
      const next = TABS[to]!.id;
      choose(next);
      buttons.current[next]?.focus();
    },
    [choose, tab],
  );

  return (
    <div className="centre">
      <div role="tablist" aria-label="View" className="centre__tabs" onKeyDown={onKeyDown}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            ref={(element) => {
              buttons.current[entry.id] = element;
            }}
            type="button"
            role="tab"
            id={`centre-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls="centre-panel"
            // Only the chosen tab is in the Tab order; the arrows reach the others.
            tabIndex={tab === entry.id ? 0 : -1}
            className="centre__tab"
            onClick={() => choose(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="centre-panel"
        aria-labelledby={`centre-tab-${tab}`}
        className={`centre__panel centre__panel--${tab}`}
      >
        {tab === "multi" ? multi(viewer) : <div className="centre__viewer">{viewer}</div>}

        {sequenceOpened && (
          <div className="centre__sequence" hidden={tab !== "sequence"}>
            {sequence}
          </div>
        )}
      </div>
    </div>
  );
}
