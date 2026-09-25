/**
 * A collapsible panel section, and the layout the workspace is built from.
 *
 * Legacy's control panel and right panel are both stacks of collapsible cards with a pop-out button
 * in the header (`control_panel.py:34-95`, `right_panel.py:46-92`). The card is the repeated piece,
 * so it is one component here rather than two that drift.
 *
 * WHAT IS NOT BUILT IS SAID, NOT MOCKED. Several of these sections hold tools that arrive in Phase
 * 5 — the drawing modes, the segment table, the class table. A panel showing a disabled row of
 * buttons that look like the real thing is worse than one that says what is missing and when: the
 * first invites a user to press something, the second tells them where the work stands. The
 * `pending` prop is what keeps that honest, and the capability table is where the same answer is
 * recorded for the app as a whole.
 */

import { useCallback, useState, type ReactNode } from "react";

export interface PanelProps {
  readonly title: string;
  /** Collapsed to begin with. A panel whose content is not yet built starts closed. */
  readonly initiallyCollapsed?: boolean;
  /**
   * Which phase builds this, when it is not built yet. Present means the section renders its
   * explanation instead of its children.
   */
  readonly pending?: { readonly phase: string; readonly summary: string };
  readonly children?: ReactNode;
}

export function Panel({ title, initiallyCollapsed, pending, children }: PanelProps): ReactNode {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed ?? pending !== undefined);
  /*
   * COLLAPSING HIDES; IT DOES NOT UNMOUNT. It did until 2026-09-23, and collapsing is something
   * people do for room: collapsing the Sequence panel threw away an unsaved propagation -- minutes
   * of GPU time -- without a word, and collapsing Drawing tools took Ctrl+Z away, because Undo's
   * hotkey lives in the history controls inside it. Legacy's cards hide their widgets too.
   *
   * What a panel holds is built the first time it opens, so a panel nobody opens costs nothing.
   */
  const [opened, setOpened] = useState(!collapsed);
  const toggle = useCallback(() => {
    setCollapsed((open) => !open);
    setOpened(true);
  }, []);

  return (
    <section className="panel">
      <h3 className="panel__header">
        <button
          type="button"
          className="panel__toggle"
          onClick={toggle}
          // Both facts, because a triangle alone tells a screen-reader user neither. `aria-expanded`
          // says the state; the label says what pressing it does.
          aria-expanded={!collapsed}
        >
          {/* Legacy's glyphs, in a 16px column of their own (control_panel.py:47-55). */}
          <span className="panel__arrow" aria-hidden="true">{collapsed ? "▶" : "▼"}</span>
          {title}
        </button>
        {pending !== undefined && <span className="panel__pending">{pending.phase}</span>}
      </h3>

      {opened && (
        <div className="panel__body" hidden={collapsed}>
          {pending === undefined ? (
            children
          ) : (
            <p className="panel__missing">Built in {pending.phase}: {pending.summary}</p>
          )}
        </div>
      )}
    </section>
  );
}

export interface WorkspaceProps {
  readonly left: ReactNode;
  readonly centre: ReactNode;
  readonly right: ReactNode;
}

/**
 * The three-pane frame: tools on the left, the image in the middle, the dataset on the right.
 *
 * Legacy's arrangement, kept because it is the one its users know — and because Phase 5 should be
 * adding tools into existing slots rather than also deciding where they go.
 *
 * The panes are a CSS grid rather than draggable splitters. Splitters are legacy's answer to a
 * fixed window; a browser already reflows, and the grid collapses to a single column on a narrow
 * screen without anything having to be dragged. Resizable panes are a preference, not a
 * capability, and can be added without moving anything that sits inside them.
 */
export function Workspace({ left, centre, right }: WorkspaceProps): ReactNode {
  return (
    <div className="workspace">
      <aside className="workspace__left" aria-label="Tools">
        {left}
      </aside>

      <main className="workspace__centre" aria-label="Image">
        {centre}
      </main>

      <aside className="workspace__right" aria-label="Dataset">
        {right}
      </aside>
    </div>
  );
}
