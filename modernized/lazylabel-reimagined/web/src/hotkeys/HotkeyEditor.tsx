/**
 * Rebinding the hotkeys: C13's editor, and RULE-049 where a user meets it.
 *
 * The brief maps legacy's hotkey dialog to "web settings and hotkey editor", and the web app had
 * only the reference half: a read-only table. `checkAssignment`, RULE-049's check written for
 * exactly this dialog, sat in the settings package with a test and no caller, which is how the
 * reach guard found the editor missing on 2026-09-23 once it looked in that package.
 *
 * KEPT FROM LEGACY (`ui/hotkey_dialog.py`): click a key and press the new one; Escape cancels; a
 * modifier on its own is not a binding; mouse actions cannot be rebound; a key another action holds
 * is refused, NAMING that action, and the binding stays as it was -- RULE-049's "Key Conflict
 * warning; the field reverts"; Reset to Defaults asks first.
 *
 * CHANGED, each for a reason:
 * - Each accepted change is saved at once, as the export-format choice is, rather than behind a
 *   Save button and a prompt on close. The binding a user just made is the one in force, and there
 *   is no half-applied session to explain.
 * - An alternate key can be CLEARED. Legacy's model allows it and its dialog offers no way to do
 *   it: Escape blanks the field without changing the binding, so what the dialog shows and what
 *   the keys do disagree until it is reopened.
 * - The capture field is a text input, which the dispatcher ignores (`isTypingTarget`), so pressing
 *   M to bind it does not also merge the selected segments.
 */

import { useCallback, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  DEFAULT_HOTKEYS,
  canRebind,
  checkAssignment,
  defaultSettings,
  type HotkeyBinding,
} from "@lazylabel/settings-schema";

import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkeyContext } from "./HotkeyProvider.jsx";
import { keyStringFor } from "./keyEvent.js";

type Slot = "primary" | "secondary";

const PROMPT = "Press a key (Esc to cancel)";

export interface HotkeyEditorProps {
  /** Asked before Reset to Defaults. Injectable, so a test can answer it. */
  readonly confirm?: (message: string) => boolean;
}

/** How a user would recognise an action: legacy's description, falling back to its id. */
function described(action: string): string {
  return DEFAULT_HOTKEYS[action]?.description ?? action;
}

export function HotkeyEditor({
  confirm = (message) => globalThis.confirm(message),
}: HotkeyEditorProps): ReactNode {
  const { settings, save } = useSettings();
  const { isLive } = useHotkeyContext();
  const [capturing, setCapturing] = useState<{ action: string; slot: Slot } | null>(null);
  const [notice, setNotice] = useState<{ tone: "warning" | "error"; text: string } | null>(null);

  const bindings = settings.hotkeys;
  const entries = Object.entries(bindings);
  const liveCount = entries.filter(([action]) => isLive(action)).length;

  const commit = useCallback(
    async (next: Readonly<Record<string, HotkeyBinding>>) => {
      try {
        await save({ ...settings, hotkeys: next });
      } catch (cause) {
        // The stored bindings are what the table shows, so a failed save leaves the old key on
        // screen and in force. Saying so is the whole job here.
        const reason = cause instanceof Error ? cause.message : String(cause);
        setNotice({ tone: "error", text: `The hotkeys could not be saved: ${reason}. Nothing changed.` });
      }
    },
    [save, settings],
  );

  const assign = useCallback(
    (action: string, slot: Slot, key: string | null) => {
      const verdict = checkAssignment(bindings, action, slot, key);
      if (verdict !== null) {
        const kept = bindings[action]?.[slot] ?? "nothing";
        setNotice({
          tone: "warning",
          text:
            "reason" in verdict
              ? `${verdict.reason}.`
              : `${verdict.key} is already used by ${described(verdict.heldBy)}. Choose a different key; ${described(action)} keeps ${kept}.`,
        });
        return;
      }
      const current = bindings[action] ?? { primary: "", secondary: null };
      void commit({ ...bindings, [action]: { ...current, [slot]: key } });
    },
    [bindings, commit],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, action: string, slot: Slot) => {
      if (capturing?.action !== action || capturing.slot !== slot) return;
      // Tab still moves focus, so the table can be left by keyboard; it ends the capture.
      if (event.key === "Tab") {
        setCapturing(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }
      const key = keyStringFor(event.nativeEvent);
      if (key === null) return; // a modifier alone: keep waiting for the key it modifies
      setCapturing(null);
      assign(action, slot, key);
    },
    [assign, capturing],
  );

  const field = (action: string, slot: Slot, value: string | null) => {
    const active = capturing?.action === action && capturing.slot === slot;
    return (
      <input
        type="text"
        readOnly
        className="hotkeys__key"
        aria-label={`${slot === "primary" ? "Key" : "Alternate key"} for ${action}`}
        value={active ? PROMPT : (value ?? "")}
        onClick={() => {
          setNotice(null);
          setCapturing({ action, slot });
        }}
        onKeyDown={(event) => onKeyDown(event, action, slot)}
        onBlur={() => {
          if (active) setCapturing(null);
        }}
      />
    );
  };

  const resetAll = () => {
    setNotice(null);
    if (!confirm("Reset every hotkey to its default? Your own bindings will be replaced.")) return;
    void commit(defaultSettings().hotkeys);
  };

  return (
    <section>
      <h2>Hotkeys</h2>
      {/* The state comes from the dispatcher itself rather than a list someone keeps, so it cannot
          go stale -- the table once named a key for forty actions that had no handler at all. */}
      <p className="panel__missing">
        {liveCount} of {entries.length} do something today. The rest are the desktop app&rsquo;s
        bindings, kept so your remapping survives, and marked below until the action behind them is
        built.
      </p>
      <p>Click a key and press the new one. Mouse actions cannot be changed.</p>

      {notice !== null && (
        <p role="status" className={`banner banner--${notice.tone}`}>
          {notice.text}
        </p>
      )}

      <table className="hotkeys">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Key</th>
            <th scope="col">Alternate</th>
            <th scope="col">Works</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([action, binding]) => (
            <tr key={action} className={isLive(action) ? undefined : "hotkeys__pending"}>
              <th scope="row" title={described(action)}>
                {action}
              </th>
              {canRebind(action) ? (
                <>
                  <td className="hotkeys__slot">{field(action, "primary", binding.primary)}</td>
                  <td className="hotkeys__slot">
                    {field(action, "secondary", binding.secondary)}
                    <button
                      type="button"
                      className="hotkeys__clear"
                      aria-label={`Clear the alternate key for ${action}`}
                      disabled={binding.secondary === null || binding.secondary === ""}
                      onClick={() => {
                        setNotice(null);
                        assign(action, "secondary", null);
                      }}
                    >
                      Clear
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td>{binding.primary}</td>
                  <td>{binding.secondary ?? ""}</td>
                </>
              )}
              <td>{isLive(action) ? "yes" : "not yet"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" onClick={resetAll}>
        Reset to defaults
      </button>
    </section>
  );
}
