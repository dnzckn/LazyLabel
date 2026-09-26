/**
 * Rebinding the hotkeys: C13's editor, and RULE-049 where a user meets it.
 *
 * It is legacy's hotkey dialog (`ui/hotkey_dialog.py`), and it shows only what that dialog shows:
 * a title, one line of instructions, a tab per category with a four-column table in each, and a row
 * of buttons. The owner asked for the category tabs back, because one flat table of forty-three rows
 * made the right set of keys hard to find. They also asked for no explanatory paragraphs. Anything
 * more this editor has to say goes in a tooltip, in legacy's words.
 *
 * KEPT FROM LEGACY (line numbers are `hotkey_dialog.py`'s):
 * - The tabs, in legacy's order, each holding its actions in legacy's order (283-308).
 * - The columns: Action, Description, Primary Key and Secondary Key (217-220). The action is named
 *   as legacy names it, `name.replace("_", " ").title()` (236).
 * - Click a field and press the new key. The field turns yellow while it waits (48-54), and Escape
 *   cancels. A capture gives up after 15 seconds (36-40, 133-137).
 * - The key is written as legacy's dialog writes it, in Qt's words (92-114, `keyEvent.ts`): on a Mac
 *   the Command key is "Ctrl" and the Control key "Meta", the modifiers come in Qt's order, and a
 *   keypad key carries "Num". So a binding made on a Mac means the same keys on Windows.
 * - A modifier or lock key on its own, and Tab with Ctrl or Alt, is waited through (75-90). Plain
 *   Tab and Shift+Tab move focus on, which ends the capture in legacy too: Qt's focus chain takes
 *   them before the field sees them. That was checked by running legacy's dialog under QTest.
 * - A key another action holds is refused in legacy's words, naming that action, and the binding
 *   stays as it was: RULE-049's "Key Conflict warning; the field reverts" (310-358).
 * - Mouse actions sit in their own tab, greyed, with legacy's tooltip, and cannot be rebound
 *   (245-278).
 * - Reset to Defaults asks first, in legacy's words (374-395).
 *
 * CHANGED, each for a reason:
 * - Each accepted change is saved at once, as the export-format choice is, so there is no Save
 *   Hotkeys button and no prompt on close. The binding a user just made is the one in force, and
 *   there is no half-applied session to explain. A recorded decision in `CONTROL_PARITY.md`.
 * - An alternate key can be CLEARED, under the same recorded decision. Legacy's model allows it
 *   and its dialog offers no way to do it.
 * - A field that stops capturing shows the binding in force. Legacy's blanks itself on Escape and
 *   on the timeout without changing the binding, so what it shows and what the keys do disagree
 *   until it is reopened.
 * - Enter or Space on a focused field starts a capture, so the editor works from the keyboard
 *   alone. Legacy's starts only on a mouse click.
 * - Keys the browser keeps for itself, such as Ctrl+W and Ctrl+T, are refused. This is web-only: a
 *   page never receives them, so such a binding could never fire (`keyEvent.ts`,
 *   `browserReservation`). So are the keys only a Mac's browser keeps, such as Command+Q and
 *   Command+Option+Right, written Ctrl+Q and Ctrl+Alt+Right: on every platform, since a binding
 *   made on Windows follows its user to a Mac.
 * - A Mac's arrow keys are written without "Num". Legacy's dialog there writes "Num+Right", because
 *   macOS marks the arrows as keypad keys, and that binding answers no other computer's arrows.
 * - A shifted character is written by the key it is on, "Shift+1", where legacy's dialog writes the
 *   character, "Shift+!". Qt's Windows key mapper offers a shortcut Shift+1 and ! for that keystroke
 *   but never Shift+! (`qwindowskeymapper.cpp`, `possibleKeyCombinations`), so the form written here
 *   is the one legacy's own shortcuts answer.
 * - The capture field is a text input, which the dispatcher ignores (`isTypingTarget`), so pressing
 *   M to bind it does not also merge the selected segments.
 */

import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  DEFAULT_HOTKEYS,
  canRebind,
  checkAssignment,
  defaultSettings,
  findConflicts,
  type HotkeyBinding,
} from "@lazylabel/settings-schema";

import { useSettings } from "../settings/SettingsProvider.jsx";
import { Tabs } from "../shell/Tabs.jsx";
import { browserReservation, keyStringFor, type BrowserReservation } from "./keyEvent.js";

type Slot = "primary" | "secondary";

// Legacy's words, from `hotkey_dialog.py` at the lines given.
const TITLE = "Hotkey Configuration"; // 149, 161
const INSTRUCTIONS =
  "Click on a hotkey field and press the desired key combination. Mouse-related actions cannot be modified."; // 170-173
const PLACEHOLDER = "Click and press a key (Esc to cancel)"; // 32
const PROMPT = "Press a key (Esc to cancel)"; // 51
const MOUSE_TOOLTIP = "Mouse-related actions cannot be modified"; // 251, 265
const RESET_TOOLTIP = "Reset all hotkeys to default values"; // 195
const RESET_QUESTION = "Are you sure you want to reset all hotkeys to their default values?"; // 379
const CHOOSE_ANOTHER = "Please choose a different key."; // 319, 347

/** How long a capture waits for a key before giving up (`hotkey_dialog.py:40`). */
const CAPTURE_TIMEOUT_MS = 15_000;

/**
 * Legacy's tab order (`hotkey_dialog.py:288-297`). A category not listed here follows the listed
 * ones, in the order its first action appears (304-308). That is how Classes and Sequence end up
 * last.
 */
const TAB_ORDER: readonly string[] = [
  "Modes",
  "Actions",
  "Navigation",
  "Segments",
  "View",
  "Movement",
  "Mouse",
  "General",
];

/**
 * Legacy's category for an action that names none (`config/hotkeys.py:18`). A stored binding the
 * schema does not know is shown there, read-only, rather than hidden.
 */
const UNCATEGORISED = "General";

/**
 * Keys a capture waits through, as legacy's ignores them (`hotkey_dialog.py:75-90`): the lock keys,
 * and a key with no name (Qt's `Key_unknown`; "Process" is what an input method sends). A modifier
 * pressed on its own is waited through too, because `keyStringFor` answers null for it.
 */
const WAITED_THROUGH: ReadonlySet<string> = new Set([
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Unidentified",
  "Process",
]);

/**
 * An action's name as legacy's dialog shows it: `name.replace("_", " ").title()`
 * (`hotkey_dialog.py:236`, and in the conflict warning at 318 and 346). That gives "Bbox Mode" and
 * "Toggle Ai Filter", spelled as legacy spells them. The Description column carries the fuller
 * words.
 */
function displayName(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/[A-Za-z]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** The tabs and their rows, built the way legacy's `_populate_hotkeys` builds them. */
function categories(
  bindings: Readonly<Record<string, HotkeyBinding>>,
): readonly { readonly name: string; readonly actions: readonly string[] }[] {
  const byCategory = new Map<string, string[]>();
  const add = (category: string, action: string): void => {
    const actions = byCategory.get(category);
    if (actions === undefined) byCategory.set(category, [action]);
    else actions.push(action);
  };

  // The schema lists legacy's actions in legacy's order, and that is the order the rows take.
  for (const [action, known] of Object.entries(DEFAULT_HOTKEYS)) add(known.category, action);
  for (const action of Object.keys(bindings)) {
    if (DEFAULT_HOTKEYS[action] === undefined) add(UNCATEGORISED, action);
  }

  const listed = TAB_ORDER.filter((category) => byCategory.has(category));
  const rest = [...byCategory.keys()].filter((category) => !TAB_ORDER.includes(category));
  return [...listed, ...rest].map((name) => ({ name, actions: byCategory.get(name)! }));
}

/**
 * Stored keys the browser keeps. This editor refuses them, so only an imported legacy
 * `hotkeys.json` brings one in.
 */
function reservedBindings(
  bindings: Readonly<Record<string, HotkeyBinding>>,
): readonly { readonly action: string; readonly key: string; readonly where: string }[] {
  const found: { action: string; key: string; where: string }[] = [];
  for (const [action, binding] of Object.entries(bindings)) {
    for (const key of [binding.primary, binding.secondary]) {
      if (key === null || key === "") continue;
      const reservation = browserReservation(key);
      if (reservation !== null) found.push({ action, key, where: whereReserved(reservation) });
    }
  }
  return found;
}

/** The end of "reserved by the browser": nothing, or " on a Mac" for a key only a Mac's keeps. */
function whereReserved(reservation: BrowserReservation): string {
  return reservation.onlyOnAMac ? " on a Mac" : "";
}

export interface HotkeyEditorProps {
  /** Asked before Reset to Defaults. Injectable, so a test can answer it. */
  readonly confirm?: (message: string) => boolean;
  /** Puts legacy's Close at the end of the button row. The dialog that holds the editor passes it. */
  readonly onClose?: () => void;
}

export function HotkeyEditor({
  confirm = (message) => globalThis.confirm(message),
  onClose,
}: HotkeyEditorProps): ReactNode {
  const { settings, save } = useSettings();
  const [capturing, setCapturing] = useState<{ action: string; slot: Slot } | null>(null);
  const [notice, setNotice] = useState<{ tone: "warning" | "error"; text: string } | null>(null);

  const bindings = settings.hotkeys;

  // Each capture is a new object, so clicking the field again restarts the clock, as legacy's
  // `start_capture` does.
  useEffect(() => {
    if (capturing === null) return undefined;
    const timer = setTimeout(() => setCapturing(null), CAPTURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [capturing]);

  /*
   * Problems already stored. This editor refuses both kinds, so they can only have come in with an
   * imported legacy `hotkeys.json`. The import keeps a hand-edited conflict rather than lock anyone
   * out (RULE-049's edge case), and legacy could bind a key the browser keeps. The import's log
   * named the conflicts, but a user reads the editor, not a log.
   */
  const stored = [
    ...findConflicts(bindings).map(
      (conflict) =>
        `The key '${conflict.key}' is used by both '${displayName(conflict.heldBy)}' and '${displayName(conflict.action)}'.`,
    ),
    ...reservedBindings(bindings).map(
      ({ action, key, where }) =>
        `The key '${key}' for '${displayName(action)}' is reserved by the browser${where}.`,
    ),
  ];

  const commit = useCallback(
    async (next: Readonly<Record<string, HotkeyBinding>>) => {
      try {
        await save({ ...settings, hotkeys: next });
      } catch (cause) {
        // The stored bindings are what the table shows, so a failed save leaves the old key on
        // screen and in force. Saying so is the whole job here, in legacy's words (370-372).
        const reason = cause instanceof Error ? cause.message : String(cause);
        setNotice({ tone: "error", text: `Failed to save hotkeys: ${reason}` });
      }
    },
    [save, settings],
  );

  const assign = useCallback(
    (action: string, slot: Slot, key: string | null) => {
      const verdict = checkAssignment(bindings, action, slot, key);
      if (verdict !== null) {
        setNotice({
          tone: "warning",
          text:
            "reason" in verdict
              ? `${verdict.reason}.`
              : `The key '${verdict.key}' is already used by '${displayName(verdict.heldBy)}'. ${CHOOSE_ANOTHER}`,
        });
        return;
      }
      const current = bindings[action] ?? { primary: "", secondary: null };
      void commit({ ...bindings, [action]: { ...current, [slot]: key } });
    },
    [bindings, commit],
  );

  const start = useCallback((action: string, slot: Slot) => {
    setNotice(null);
    setCapturing({ action, slot });
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, action: string, slot: Slot) => {
      const chorded = event.ctrlKey || event.altKey || event.metaKey;
      if (capturing?.action !== action || capturing.slot !== slot) {
        // A click starts a capture, and so do Enter and Space, for anyone not using a mouse.
        if ((event.key === "Enter" || event.key === " ") && !chorded && !event.shiftKey) {
          event.preventDefault();
          start(action, slot);
        }
        return;
      }
      // Tab and Shift+Tab move focus on and end the capture, as they do in legacy's dialog.
      if (event.key === "Tab" && !chorded) {
        setCapturing(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // A held key repeats. The binding is the press, not the Enter that started the capture and
      // is still down.
      if (event.repeat) return;
      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }
      // A Tab still here carries Ctrl, Alt or Meta. Legacy never binds Tab, so it is waited through.
      if (WAITED_THROUGH.has(event.key) || event.key === "Tab") return;
      // Written as legacy's dialog writes it, on this platform: Command is Ctrl on a Mac.
      const key = keyStringFor(event.nativeEvent);
      if (key === null) return; // a modifier alone: keep waiting for the key it modifies
      setCapturing(null);
      const reservation = browserReservation(key);
      if (reservation !== null) {
        setNotice({
          tone: "warning",
          text: `The key '${key}' is reserved by the browser${whereReserved(reservation)}. ${CHOOSE_ANOTHER}`,
        });
        return;
      }
      assign(action, slot, key);
    },
    [assign, capturing, start],
  );

  const field = (action: string, name: string, slot: Slot, value: string | null | undefined, mouse: boolean) => {
    const editable = canRebind(action);
    const active = capturing?.action === action && capturing.slot === slot;
    return (
      <input
        type="text"
        readOnly
        disabled={!editable}
        className={active ? "hotkeys__key hotkeys__key--capturing" : "hotkeys__key"}
        aria-label={`${slot === "primary" ? "Primary" : "Secondary"} key for ${name}`}
        placeholder={PLACEHOLDER}
        {...(mouse ? { title: MOUSE_TOOLTIP } : {})}
        value={active ? PROMPT : (value ?? "")}
        {...(editable
          ? {
              onClick: () => start(action, slot),
              onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => onKeyDown(event, action, slot),
              onBlur: () => {
                if (active) setCapturing(null);
              },
            }
          : {})}
      />
    );
  };

  const row = (action: string) => {
    const known = DEFAULT_HOTKEYS[action];
    const name = displayName(action);
    const mouse = known?.mouseRelated === true;
    // A mouse gesture is what it is: legacy never loads or saves one (`config/hotkeys.py:251, 270`).
    const binding = mouse ? known : bindings[action];
    return (
      <tr key={action} className={mouse ? "hotkeys__mouse" : undefined}>
        <th scope="row" className="hotkeys__fit">
          {name}
        </th>
        <td>{known?.description ?? ""}</td>
        <td className="hotkeys__slot">{field(action, name, "primary", binding?.primary, mouse)}</td>
        <td className="hotkeys__slot">
          {field(action, name, "secondary", binding?.secondary, mouse)}
          {canRebind(action) && (
            <button
              type="button"
              className="hotkeys__clear"
              aria-label={`Clear the secondary key for ${name}`}
              disabled={!binding?.secondary}
              onClick={() => {
                setNotice(null);
                assign(action, "secondary", null);
              }}
            >
              Clear
            </button>
          )}
        </td>
      </tr>
    );
  };

  const table = (actions: readonly string[]) => (
    <table className="hotkeys">
      <thead>
        <tr>
          <th scope="col" className="hotkeys__fit">
            Action
          </th>
          <th scope="col">Description</th>
          <th scope="col" className="hotkeys__fit">
            Primary Key
          </th>
          <th scope="col" className="hotkeys__fit">
            Secondary Key
          </th>
        </tr>
      </thead>
      <tbody>{actions.map((action) => row(action))}</tbody>
    </table>
  );

  const resetAll = () => {
    setNotice(null);
    if (!confirm(RESET_QUESTION)) return;
    void commit(defaultSettings().hotkeys);
  };

  return (
    <section className="hotkeys-editor">
      <h2 className="hotkeys__title">{TITLE}</h2>
      <p className="hotkeys__instructions">{INSTRUCTIONS}</p>

      {notice !== null && (
        <p role="status" className={`banner banner--${notice.tone}`}>
          {notice.text}
        </p>
      )}

      {stored.length > 0 && (
        <p role="alert" className="banner banner--warning">
          {stored.join(" ")} {CHOOSE_ANOTHER}
        </p>
      )}

      <Tabs
        label="Hotkey categories"
        focusablePanels
        tabs={categories(bindings).map(({ name, actions }) => ({ id: name, label: name, content: table(actions) }))}
      />

      <div className="hotkeys__buttons">
        <button type="button" title={RESET_TOOLTIP} onClick={resetAll}>
          Reset to Defaults
        </button>
        {onClose !== undefined && (
          <button type="button" className="hotkeys__close" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </section>
  );
}
