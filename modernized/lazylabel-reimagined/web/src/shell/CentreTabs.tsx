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
 * LEAVING THE SEQUENCE TAB THROWS THE TIMELINE AWAY, without asking, as legacy's does
 * (`main_window.py:3043-3047`): the owner's decision of 2026-09-26, "Match the desktop app exactly"
 * (SEQUENCE_PARITY.md SP-15). The timeline, its references, its statuses and its unsaved
 * propagated masks go, and coming back shows Timeline Setup. The panel does that itself, when told
 * its tab no longer shows; it stays mounted, hidden, so that what legacy keeps -- the timeline's
 * zoom -- is kept too. The shell is told as well (`onLeaveSequence`), to reload the open image from
 * its file, as legacy's Single and Multi each load it from disk on entry.
 */

import { useCallback, useState, type ReactNode } from "react";

import { useHotkeyFallback } from "../hotkeys/HotkeyProvider.jsx";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import {
  BUILD_A_TIMELINE_FIRST,
  NOTHING_TO_STEP_TO,
  SequenceActiveContext,
} from "../sequence/sequenceActive.js";
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
  /** What the Sequence tab's header says after "Sequence Mode:", as legacy's does. */
  readonly sequenceStatus?: string;
  /**
   * The Sequence tab has just been left for another. Legacy then loads the open image from disk --
   * Single's `_restore_single_view_state` and Multi's `_enter_multi_view_mode` both do
   * (`main_window.py:7242-7272, 5930-5946`) -- so the frame's unsaved edits and propagated masks go
   * without a word (SP-15). The shell does that; this only says when.
   */
  readonly onLeaveSequence?: () => void;
}

export function CentreTabs({
  viewer,
  multi,
  sequence,
  sequenceStatus = "No sequence loaded",
  onLeaveSequence,
}: CentreTabsProps): ReactNode {
  const [tab, setTab] = useState<CentreTab>("single");
  // Built the first time it is opened, then kept: see the module comment.
  const [sequenceOpened, setSequenceOpened] = useState(false);

  const choose = useCallback(
    (next: string) => {
      if (tab === "sequence" && next !== "sequence") onLeaveSequence?.();
      setTab(next as CentreTab);
      if (next === "sequence") setSequenceOpened(true);
    },
    [onLeaveSequence, tab],
  );

  /*
   * THE SEQUENCE'S CTRL KEYS BELONG TO THE APP ON EVERY TAB. Legacy's shortcuts are the window's,
   * so Ctrl+H and Ctrl+P never reach anything else. Here a key nothing handles falls through to
   * the browser, and until the Sequence tab was first opened -- when nothing had registered them --
   * Ctrl+H opened the browser's history and Ctrl+P its print dialog. Fallbacks, so they answer
   * only until the timeline registers its own: Find Archetypes says "Build a timeline first", and
   * Propagate does nothing, as legacy's does outside sequence mode (main_window.py:4708-4716, 5057-5059).
   */
  const { notify } = useNotifications();
  const say = (message: string) => () => notify({ severity: "info", message });
  useHotkeyFallback("find_archetypes", say(BUILD_A_TIMELINE_FIRST));
  useHotkeyFallback("propagate", () => undefined);
  // And legacy's step keys, which answer on every tab over no timeline (SP-56).
  useHotkeyFallback("next_flagged_frame", say(NOTHING_TO_STEP_TO.flagged));
  useHotkeyFallback("prev_flagged_frame", say(NOTHING_TO_STEP_TO.flagged));
  useHotkeyFallback("next_reference_frame", say(NOTHING_TO_STEP_TO.reference));
  useHotkeyFallback("prev_reference_frame", say(NOTHING_TO_STEP_TO.reference));
  useHotkeyFallback("next_suggested_frame", say(NOTHING_TO_STEP_TO.suggested));
  useHotkeyFallback("prev_suggested_frame", say(NOTHING_TO_STEP_TO.suggested));

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
        {/* Always in the same place in the list, rendered or not, so the view after it keeps its
            place -- and is not rebuilt -- when the tab changes. */}
        {tab === "sequence" && <p className="centre__header">Sequence Mode: {sequenceStatus}</p>}
        {tab === "multi" ? multi(viewer) : <div className="centre__viewer">{viewer}</div>}

        {sequenceOpened && (
          <div className="centre__sequence" hidden={tab !== "sequence"}>
            {/* Mounted on every tab, and told which one shows, so its keys act only on its own. */}
            <SequenceActiveContext.Provider value={tab === "sequence"}>{sequence}</SequenceActiveContext.Provider>
          </div>
        )}
      </div>
    </div>
  );
}
