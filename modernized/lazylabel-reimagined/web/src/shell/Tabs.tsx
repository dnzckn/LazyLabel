/**
 * Tabs as legacy's QTabWidget draws them: the chosen tab in the accent with a 2px underline.
 *
 * `TabList` is the row of tabs with the tab pattern's keys, shared by the centre's Single | Multi |
 * Sequence and the left column's Global | Image. `Tabs` is the simple case: every panel mounted
 * and the others hidden, because the panels hold hotkeys (the zoom keys live in Image Adjustments)
 * and state a user would not expect a tab change to throw away.
 */

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabSpec {
  readonly id: string;
  readonly label: string;
}

export interface TabListProps {
  readonly label: string;
  readonly tabs: readonly TabSpec[];
  readonly current: string;
  readonly onChoose: (id: string) => void;
  /** Element ids: the tab's own, and the panel it controls. */
  readonly tabId: (id: string) => string;
  readonly panelId: (id: string) => string;
}

export function TabList({ label, tabs, current, onChoose, tabId, panelId }: TabListProps): ReactNode {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  // The arrows move between tabs and select as they go; Home and End jump to the ends.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const at = tabs.findIndex((tab) => tab.id === current);
      const to =
        event.key === "ArrowRight" ? (at + 1) % tabs.length
        : event.key === "ArrowLeft" ? (at - 1 + tabs.length) % tabs.length
        : event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
        : null;
      if (to === null) return;
      event.preventDefault();
      // The tab list's, not the page's: Left and Right are also previous and next IMAGE, and the
      // dispatcher heard them too, so moving between tabs by keyboard changed the image as well
      // (`CONTROL_PARITY.md` CP-19).
      event.stopPropagation();
      const next = tabs[to]!.id;
      onChoose(next);
      buttons.current[next]?.focus();
    },
    [current, onChoose, tabs],
  );

  return (
    <div role="tablist" aria-label={label} className="tabs__list" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(element) => {
            buttons.current[tab.id] = element;
          }}
          type="button"
          role="tab"
          id={tabId(tab.id)}
          aria-selected={current === tab.id}
          aria-controls={panelId(tab.id)}
          // Only the chosen tab is in the Tab order; the arrows reach the others.
          tabIndex={current === tab.id ? 0 : -1}
          className="tabs__tab"
          onClick={() => onChoose(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export interface TabsProps {
  readonly label: string;
  readonly tabs: readonly (TabSpec & { readonly content: ReactNode })[];
}

export function Tabs({ label, tabs }: TabsProps): ReactNode {
  const [current, setCurrent] = useState(tabs[0]?.id ?? "");
  const base = useId();
  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;

  return (
    <div className="tabs">
      <TabList
        label={label}
        tabs={tabs}
        current={current}
        onChoose={setCurrent}
        tabId={tabId}
        panelId={panelId}
      />
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          hidden={current !== tab.id}
          className="tabs__panel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
