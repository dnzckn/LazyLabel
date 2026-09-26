/**
 * Turning a browser keyboard event into the key string the settings schema stores.
 *
 * The stored strings are Qt key sequences, because that is what the desktop app wrote into
 * `hotkeys.json` and decision 5 keeps those files working: "Ctrl+Z", "Shift+Space", "Right",
 * "Ctrl+Plus", "Return", ".". A browser reports something different for every one of those, so this
 * is the translation layer, and it is the only place in the web app that knows both vocabularies.
 *
 * It reads `event.code` — the physical key — rather than `event.key` wherever the difference
 * matters, for three reasons:
 *
 *   1. `event.key` for a letter depends on Shift, so Shift+Z reports "Z" and z reports "z". Qt
 *      names the key "Z" in both cases and lists Shift separately.
 *   2. Legacy binds Save Output to BOTH "Return" and "Enter", which in Qt are the main Enter key
 *      and the numeric keypad's. `event.key` calls both "Enter"; only `event.code` separates them.
 *   3. `event.key` follows the keyboard layout, so W A S D panning would move different directions
 *      on an AZERTY keyboard. Reading the physical key keeps the WASD cluster where the user's
 *      fingers are, which is what a movement binding is for.
 *
 * Layout-independence is a deliberate trade, not an oversight: a user on AZERTY pressing the key
 * labelled Z gets the binding for W. That is the right answer for movement keys and arguably the
 * wrong one for mnemonic ones like M for Merge. Phase 5 owns the rebinding UI and can revisit it;
 * what matters here is that ONE rule applies everywhere rather than a different one per key.
 */

/** Qt lists modifiers in this order, and the stored strings have to match exactly. */
const MODIFIER_ORDER: readonly ["ctrlKey", "altKey", "shiftKey", "metaKey"] = [
  "ctrlKey",
  "altKey",
  "shiftKey",
  "metaKey",
];

const MODIFIER_NAME: Readonly<Record<(typeof MODIFIER_ORDER)[number], string>> = {
  ctrlKey: "Ctrl",
  altKey: "Alt",
  shiftKey: "Shift",
  metaKey: "Meta",
};

/** Physical keys whose Qt name is not simply the letter or digit on them. */
const NAMED_CODES: Readonly<Record<string, string>> = {
  ArrowRight: "Right",
  ArrowLeft: "Left",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Space: "Space",
  Enter: "Return",
  NumpadEnter: "Enter",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Period: ".",
  NumpadDecimal: ".",
  Comma: ",",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  // Qt writes the zoom bindings as Ctrl+Plus and Ctrl+Minus, and the unshifted keys are the ones
  // the user actually presses.
  Equal: "Plus",
  NumpadAdd: "Plus",
  Minus: "Minus",
  NumpadSubtract: "Minus",
};

/**
 * The stored key string for this event, or null when the event is only a modifier.
 *
 * A bare Ctrl press is not a binding; returning null keeps it from matching anything or being
 * offered as one in the rebinding dialog.
 */
export function keyStringFor(event: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string | null {
  const base = baseKeyFor(event);
  if (base === null) return null;

  const parts: string[] = [];
  for (const flag of MODIFIER_ORDER) {
    if (event[flag]) parts.push(MODIFIER_NAME[flag]);
  }
  parts.push(base);
  return parts.join("+");
}

function baseKeyFor(event: Pick<KeyboardEvent, "code" | "key">): string | null {
  const { code } = event;

  if (code in NAMED_CODES) return NAMED_CODES[code]!;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

  // A modifier on its own is not a binding.
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(code)) return null;
  if (["Control", "Alt", "Shift", "Meta", "Dead"].includes(event.key)) return null;

  // Anything left is a key this table does not name. Fall back to the layout's own character so an
  // unusual keyboard is still bindable, rather than silently unable to trigger anything.
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key === "" ? null : event.key;
}

/**
 * Whether a keystroke was aimed at a modal dialog, which the page behind it must not hear.
 *
 * The dialog stops its keys from bubbling to the document, which keeps them from the dispatcher.
 * A listener in the CAPTURE phase hears them first, though, so the AI and polygon layers -- which
 * capture on purpose, to run before the dispatcher -- cleared their points on the Escape that closed
 * the hotkey dialog, and finished a polygon on an Enter pressed on its Close button. Legacy's modal
 * dialogs block the window's shortcuts.
 */
export function isInModal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[aria-modal="true"]') !== null;
}

/**
 * Whether a keystroke should reach the hotkey system at all.
 *
 * It must not while the user is typing: pressing V in a class-name field should write a V, not
 * delete the selected segments. Legacy gets this from Qt's focus handling; in a browser it has to
 * be asked for explicitly, and forgetting it is the classic web-app keyboard bug.
 */
/**
 * The keys a focused `<select>` keeps, to move through its options. Every other key is a hotkey, as
 * legacy's window shortcuts keep working with a combo box focused. The whole select counted as a
 * typing target, so after choosing a Filter Class every key was dead until focus moved
 * (`CONTROL_PARITY.md` CP-18).
 */
const SELECT_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

export function isTypingTarget(target: EventTarget | null, key?: string): boolean {
  if (target === null || !(target instanceof Element)) return false;

  const element = target as HTMLElement;
  // The property is the convenient form, but jsdom does not implement it, so the attribute is the
  // one that has to be authoritative. "contenteditable=false" explicitly turns editing off.
  if (element.isContentEditable) return true;
  const editable = element.closest("[contenteditable]")?.getAttribute("contenteditable");
  if (editable !== null && editable !== undefined && editable !== "false") return true;

  const tag = element.tagName;
  if (tag === "TEXTAREA") return true;
  // Without the key, the answer is the cautious one: some keys are the select's.
  if (tag === "SELECT") return key === undefined || SELECT_KEYS.has(key);
  if (tag !== "INPUT") return false;

  // Checkboxes, radios and buttons do not swallow text, so a hotkey over one is still a hotkey.
  const type = (element as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
}
