/**
 * Undo and redo, reachable.
 *
 * The history itself has existed since Phase 4, with the two defects RULE-052 and RULE-053 record
 * designed out and a full test suite over it — and until now NOTHING CALLED IT. No button, no
 * hotkey. A user could draw, erase and merge, and had no way to take any of it back.
 *
 * That is the third time this session the same shape has turned up: a rule implemented, tested and
 * correct, with no path from a person to it. The lesson that keeps being relearned is that a
 * component test proves the component and nothing else.
 *
 * BOTH A HOTKEY AND A BUTTON, deliberately. Ctrl+Z is what anyone reaches for and it is what
 * legacy binds, but a hotkey is invisible: a user who does not already know it is there cannot
 * discover it, and the button also carries the LABEL of what would be undone, which no keystroke
 * can. Legacy has the same pair.
 */

import { type ReactNode } from "react";

import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";
import { useWorkspace } from "./WorkspaceProvider.jsx";

export function HistoryControls(): ReactNode {
  const { history, segments, classAliases } = useWorkspace();
  /*
   * Read on every render, and the render comes from the STORE rather than from the history.
   *
   * `History` is a plain object held in a ref-like memo, so mutating it notifies nobody. That is
   * sound here because every recorded action also changes store state -- there is no way to push
   * or pop an entry without `segments` or `classAliases` moving -- and those are what this
   * component subscribes to. They are named in the destructuring above for that reason and not
   * because the markup uses them; removing them would leave the buttons stale after an undo.
   */
  void segments;
  void classAliases;
  const state = history.state;

  // The bindings come from the user's own hotkey settings, so a rebound Ctrl+Z follows.
  useHotkey("undo", () => history.undo());
  useHotkey("redo", () => history.redo());

  return (
    <div className="history">
      <button
        type="button"
        onClick={() => history.undo()}
        disabled={!state.canUndo}
        // The label names WHAT would be undone -- "Undo Erase from 3 annotations", not "Undo".
        // After a sequence of edits that is the difference between confidence and a guess, and it
        // is the one thing a keystroke cannot tell you.
        title={state.undoLabel ?? "Nothing to undo"}
      >
        Undo{state.undoLabel === null ? "" : `: ${state.undoLabel}`}
      </button>
      <button
        type="button"
        onClick={() => history.redo()}
        disabled={!state.canRedo}
        title={state.redoLabel ?? "Nothing to redo"}
      >
        Redo{state.redoLabel === null ? "" : `: ${state.redoLabel}`}
      </button>
    </div>
  );
}
