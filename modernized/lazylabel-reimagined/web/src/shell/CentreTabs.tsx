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

import { useCallback, useState, type ReactNode } from "react";

import { TabList } from "./Tabs.jsx";

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

  const choose = useCallback((next: string) => {
    setTab(next as CentreTab);
    if (next === "sequence") setSequenceOpened(true);
  }, []);

  return (
    <div className="centre">
      <TabList
        label="View"
        tabs={TABS}
        current={tab}
        onChoose={choose}
        tabId={(id) => `centre-tab-${id}`}
        // One panel for all three: Single and Sequence share the view, and Multi takes it over.
        panelId={() => "centre-panel"}
      />

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
