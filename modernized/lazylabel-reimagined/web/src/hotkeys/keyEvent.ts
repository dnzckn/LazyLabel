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
 *
 * WHAT THE EDITOR RECORDS IS WHAT LEGACY'S DIALOG RECORDS: `QKeySequence(key | modifiers)
 * .toString()` (`ui/hotkey_dialog.py:92-114`). Read from PyQt6 6.9.1, the version legacy runs on:
 * the modifiers in the order Meta, Ctrl, Alt, Shift ("Meta+Ctrl+Alt+Shift+K"); a key on the numeric
 * keypad with "Num" ("Num+1", "Num+Enter", "Ctrl+Num++"); and Qt's own names "Esc", "Del", "Ins",
 * "PgUp", "PgDown", "=", "+" and "-".
 *
 * WHAT A KEYSTROKE MATCHES IS WHAT LEGACY'S SHORTCUTS MATCH (`CONTROL_PARITY.md` CP-66). Legacy
 * binds with `QShortcut(QKeySequence(text))` (`ui/main_window.py:1036-1056`), so:
 *   - A stored string is read as Qt reads it: modifiers in any order and any case, and Qt's other
 *     spellings of a key ("Escape", "Page Down"). See `normalizeKeyString`.
 *   - On a Mac, Qt's "Ctrl" is the Command key and its "Meta" the Control key (`platform.ts`), so
 *     the "Ctrl+Z" written on Windows is Command+Z there, as legacy's is.
 *   - A keypad key answers its "Num" binding first and then the plain one: Qt's shortcut map
 *     retries without the keypad modifier when nothing matched with it (`qshortcutmap.cpp`,
 *     `nextState`). That is how a keypad digit works as a plain digit in legacy.
 *   - Qt also offers the character Shift typed, with the Shift taken off (`qwindowskeymapper.cpp`,
 *     `possibleKeyCombinations`): Ctrl+Shift+= on a US keyboard is Ctrl++ too, which is how a "+"
 *     binding is pressed where "+" is a shifted key. See `keyCandidatesFor`.
 */

import { isApplePlatform } from "../platform.js";

/** The parts of a keyboard event this module reads. */
export type KeyEventFields = Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/** Whose reading of the modifier keys to use. The browser's own platform when it is not given. */
export interface KeyPlatform {
  /** A Mac, where Qt's "Ctrl" is the Command key and its "Meta" the Control key. */
  readonly apple: boolean;
}

/** Qt writes the modifiers in this order, and the keypad's "Num" after them (`QKeySequence::toString`). */
const MODIFIER_ORDER = ["Meta", "Ctrl", "Alt", "Shift", "Num"] as const;

type Modifier = (typeof MODIFIER_ORDER)[number];

/** Physical keys whose Qt name is not simply the letter or digit on them. */
const NAMED_CODES: Readonly<Record<string, string>> = {
  ArrowRight: "Right",
  ArrowLeft: "Left",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Space: "Space",
  Enter: "Return",
  NumpadEnter: "Enter",
  Escape: "Esc",
  Backspace: "Backspace",
  Delete: "Del",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDown",
  Insert: "Ins",
  Period: ".",
  Comma: ",",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Equal: "=",
  Minus: "-",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadMultiply: "*",
  NumpadDivide: "/",
  NumpadEqual: "=",
  NumpadComma: ",",
};

/**
 * What a keypad key reports with NumLock off, and Qt's name for it. Qt keeps the keypad modifier on
 * these too, so a keypad 4 is "Num+Left" then.
 */
const KEYPAD_WITHOUT_NUMLOCK: Readonly<Record<string, string>> = {
  ArrowRight: "Right",
  ArrowLeft: "Left",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDown",
  Insert: "Ins",
  Delete: "Del",
  Clear: "Clear",
};

/** The arrow keys, which macOS marks as keypad keys and Qt there with its keypad modifier. */
const ARROWS: ReadonlySet<string> = new Set(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]);

function currentPlatform(): KeyPlatform {
  return { apple: isApplePlatform() };
}

/**
 * The stored key string for this event, as legacy's hotkey dialog records it, or null when the
 * event is only a modifier.
 *
 * A bare Ctrl press is not a binding; returning null keeps it from matching anything or being
 * offered as one in the rebinding dialog.
 *
 * A Mac's arrow keys are recorded without "Num", where legacy's dialog there writes "Num+Right":
 * macOS marks the arrows as keypad keys, and a "Num+Right" answers no other computer's arrow keys.
 * Such a binding still works when it is pressed on a Mac (`keyCandidatesFor`).
 */
export function keyStringFor(event: KeyEventFields, platform: KeyPlatform = currentPlatform()): string | null {
  const base = baseKeyFor(event);
  if (base === null) return null;

  const held = modifiersHeld(event, platform);
  return spell(onKeypad(event) ? [...held, "Num"] : held, base);
}

/**
 * Every stored key string this keystroke answers to, the most particular first -- what legacy's
 * shortcuts would match, in the order Qt tries them. The dispatcher takes the first one bound.
 *
 *   1. On the keypad: the "Num" binding, then the plain one (`qshortcutmap.cpp`, `nextState`). On a
 *      Mac the arrow keys count, as macOS marks them keypad keys.
 *   2. The key itself, with every modifier held.
 *   3. The character Shift typed, with the Shift taken off (`qwindowskeymapper.cpp`,
 *      `possibleKeyCombinations`): "!" for Shift+1, and Ctrl++ for Ctrl+Shift+= on a US keyboard.
 *   4. WEB-ONLY: the = key without Shift answers a "+" binding too, so Ctrl+= zooms in, as the
 *      web's zoom keys have since the owner's decision to keep them zooming (PROGRESS.md 520-521).
 *      Legacy's own Ctrl+Plus is not a key sequence Qt can read -- `QKeySequence("Ctrl+Plus")` is
 *      empty -- so legacy's zoom keys answer nothing at all.
 */
export function keyCandidatesFor(event: KeyEventFields, platform: KeyPlatform = currentPlatform()): readonly string[] {
  const base = baseKeyFor(event);
  if (base === null) return [];

  const held = modifiersHeld(event, platform);
  const candidates: string[] = [];

  if (onKeypad(event) || (platform.apple && ARROWS.has(event.code ?? ""))) candidates.push(spell([...held, "Num"], base));
  candidates.push(spell(held, base));

  const typed = shiftedCharacter(event, base);
  if (typed !== null) candidates.push(spell(held.filter((modifier) => modifier !== "Shift"), typed));

  if (event.code === "Equal" && !event.shiftKey) candidates.push(spell(held, "+"));

  return [...new Set(candidates)];
}

/**
 * Qt's reading of the modifier keys held: its "Ctrl" is the key a platform's shortcuts use --
 * Control on Windows and Linux, Command on a Mac -- and its "Meta" the other one.
 */
function modifiersHeld(event: KeyEventFields, platform: KeyPlatform): Modifier[] {
  const ctrl = platform.apple ? event.metaKey : event.ctrlKey;
  const meta = platform.apple ? event.ctrlKey : event.metaKey;

  const held: Modifier[] = [];
  if (meta) held.push("Meta");
  if (ctrl) held.push("Ctrl");
  if (event.altKey) held.push("Alt");
  if (event.shiftKey) held.push("Shift");
  return held;
}

/** A key string the way Qt writes one: the modifiers in order, then the key. "Ctrl++" for Ctrl and +. */
function spell(modifiers: readonly Modifier[], key: string): string {
  return [...modifiers, key].join("+");
}

/** Whether the key is on the numeric keypad, which Qt marks with its keypad modifier. */
function onKeypad(event: Pick<KeyboardEvent, "code">): boolean {
  return (event.code ?? "").startsWith("Numpad");
}

function baseKeyFor(event: Pick<KeyboardEvent, "code" | "key">): string | null {
  const code = event.code ?? "";
  const key = event.key ?? "";

  // A keypad digit or point with NumLock off is the key it then moves by: Qt's Num+Left, Num+Del.
  if (/^Numpad[0-9]$/.test(code) || code === "NumpadDecimal") {
    const moved = KEYPAD_WITHOUT_NUMLOCK[key];
    if (moved !== undefined) return moved;
    // A keypad point types a comma on some layouts, and Qt names the key by what it types.
    if (code === "NumpadDecimal") return key === "," ? "," : ".";
    return code.slice(6);
  }

  if (code in NAMED_CODES) return NAMED_CODES[code]!;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

  // A modifier on its own is not a binding.
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(code)) return null;
  if (["Control", "Alt", "Shift", "Meta", "Dead"].includes(key)) return null;

  // Anything left is a key this table does not name. Fall back to the layout's own character so an
  // unusual keyboard is still bindable, rather than silently unable to trigger anything.
  if (key.length === 1) return key.toUpperCase();
  return key === "" ? null : key;
}

/**
 * The character Shift typed on this key, in Qt's name, or null when Shift typed nothing Qt would
 * call a different key: a letter is the same key either way, and so is Space.
 */
function shiftedCharacter(event: KeyEventFields, base: string): string | null {
  if (!event.shiftKey || onKeypad(event)) return null;
  const typed = event.key ?? "";
  if ([...typed].length !== 1 || typed === " " || /\p{L}/u.test(typed)) return null;
  return typed === base ? null : typed;
}

/** Qt's modifier names, read in any case (`QKeySequence` reads "ctrl+z" as Ctrl+Z). */
const MODIFIER_NAMES: Readonly<Record<string, Modifier>> = {
  meta: "Meta",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  num: "Num",
};

/**
 * Qt's name for a key, by the spellings `QKeySequence` reads for it (it ignores case, and reads
 * "Escape" as Esc and "Page Down" as PgDown), and by the ones this app used to write: "PageDown",
 * "Delete", "Insert", and the "Plus" and "Minus" of legacy's default zoom keys, which Qt cannot
 * read at all but the web gives the meaning they were written with.
 */
const KEY_NAMES: Readonly<Record<string, string>> = {
  esc: "Esc",
  escape: "Esc",
  del: "Del",
  delete: "Del",
  ins: "Ins",
  insert: "Ins",
  pgup: "PgUp",
  "page up": "PgUp",
  pageup: "PgUp",
  pgdown: "PgDown",
  "page down": "PgDown",
  pagedown: "PgDown",
  plus: "+",
  minus: "-",
  return: "Return",
  enter: "Enter",
  space: "Space",
  backspace: "Backspace",
  tab: "Tab",
  backtab: "Backtab",
  home: "Home",
  end: "End",
  left: "Left",
  right: "Right",
  up: "Up",
  down: "Down",
  clear: "Clear",
};

/**
 * A stored key string in the form `keyStringFor` writes, so a binding matches however it was
 * spelled: "Shift+Ctrl+Z" and "ctrl+z" are Ctrl+Z, "Escape" is Esc, "Ctrl+Plus" is Ctrl++.
 *
 * A string Qt cannot read either -- "Cmd+Z", say -- comes back unchanged, and so matches nothing,
 * as legacy's shortcut for it would fire on nothing.
 */
export function normalizeKeyString(text: string): string {
  const trimmed = text.trim();

  // "+" is a key as well as the separator: "Ctrl++" is Ctrl and +, "Num++" the keypad's +.
  let key: string;
  let modifiers: string[];
  if (trimmed === "+") {
    key = "+";
    modifiers = [];
  } else if (trimmed.endsWith("++")) {
    key = "+";
    modifiers = trimmed.slice(0, -2).split("+");
  } else {
    const parts = trimmed.split("+");
    key = parts.pop()!.trim();
    modifiers = parts;
  }
  if (key === "") return text;

  const held = new Set<Modifier>();
  for (const part of modifiers) {
    const modifier = MODIFIER_NAMES[part.trim().toLowerCase()];
    if (modifier === undefined) return text;
    held.add(modifier);
  }

  const upper = key.toUpperCase();
  const named =
    KEY_NAMES[key.toLowerCase()]
    ?? (/^F\d{1,2}$/.test(upper) || [...upper].length === 1 ? upper : key);
  return spell(
    MODIFIER_ORDER.filter((modifier) => held.has(modifier)),
    named,
  );
}

/**
 * Keys the browser keeps for itself. In a browser tab they close it, open another or switch tabs,
 * and the page is never sent the keystroke, so a hotkey bound to one could never fire.
 *
 * WEB-ONLY. The desktop app can use these, and legacy's dialog binds all but the Tab ones, which
 * it never binds.
 *
 * The list is Chromium's reserved commands (`BrowserCommandController::IsReservedCommandOrKey`):
 * close tab, close window, new tab, reopen closed tab, new window, new incognito window, next and
 * previous tab, and quit.
 */
const RESERVED: readonly string[] = [
  // At their Windows and Linux keys. On a Mac, where Qt's "Ctrl" is Command, most of the Ctrl ones
  // are the same commands' Command keys, and Ctrl+Tab is Command+Tab, which macOS takes.
  "Ctrl+W",
  "Ctrl+F4",
  "Ctrl+Shift+W",
  "Alt+F4",
  "Ctrl+T",
  "Ctrl+Shift+T",
  "Ctrl+N",
  "Ctrl+Shift+N",
  "Ctrl+Tab",
  "Ctrl+Shift+Tab",
  "Ctrl+PgDown",
  "Ctrl+PgUp",
];

/**
 * The same commands at the keys only a Mac's browser keeps, as Qt names them there: Command is
 * "Ctrl", Option "Alt" and Control "Meta". Refused on every platform, because a binding follows its
 * user from one computer to another, and one made on Windows must not be a key a Mac never sends.
 */
const RESERVED_ON_A_MAC: readonly string[] = [
  "Ctrl+Q", // Command+Q: quit
  "Ctrl+Alt+Right", // Command+Option+Right: next tab
  "Ctrl+Alt+Left", // Command+Option+Left: previous tab
  "Ctrl+Shift+]", // Command+Shift+]: next tab
  "Ctrl+Shift+[", // Command+Shift+[: previous tab
  "Meta+Tab", // Control+Tab: next tab
  "Meta+Shift+Tab", // Control+Shift+Tab: previous tab
  "Meta+PgDown", // Control+PageDown: next tab
  "Meta+PgUp", // Control+PageUp: previous tab
];

/** Whether a browser keeps a key from the page, and whether only a Mac's does. */
export interface BrowserReservation {
  readonly onlyOnAMac: boolean;
}

const BROWSER_RESERVED: ReadonlyMap<string, BrowserReservation> = new Map<string, BrowserReservation>([
  ...RESERVED_ON_A_MAC.map((key): [string, BrowserReservation] => [normalizeKeyString(key), { onlyOnAMac: true }]),
  ...RESERVED.map((key): [string, BrowserReservation] => [normalizeKeyString(key), { onlyOnAMac: false }]),
]);

/**
 * Whether the browser keeps this key string from every page -- null when it does not -- and
 * whether only a Mac's does. Read however the string is spelled, as a stored binding is.
 */
export function browserReservation(key: string): BrowserReservation | null {
  return BROWSER_RESERVED.get(normalizeKeyString(key)) ?? null;
}

/**
 * Whether a keystroke was aimed at a modal dialog, which the page behind it must not hear.
 *
 * The dialog stops its keys from bubbling to the document, which keeps them from the dispatcher.
 * A listener in the CAPTURE phase hears them first, though, so the AI and polygon layers -- which
 * capture on purpose, to run before the dispatcher -- cleared their points on the Escape that closed
 * the hotkey dialog, and finished a polygon on an Enter pressed on its Close button. Legacy's modal
 * dialogs block the window's shortcuts, and so does a menu it opens: Escape closes the file list's
 * menu and does nothing else.
 */
export function isInModal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[aria-modal="true"], [role="menu"]') !== null;
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
