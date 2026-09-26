/**
 * Translating browser keyboard events into the key strings `hotkeys.json` stores.
 *
 * The strings are Qt key sequences, because decision 5 keeps existing config files working. Every
 * mismatch here is a hotkey that silently stops working after the port.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_HOTKEYS } from "@lazylabel/settings-schema";

import {
  browserReservation,
  isTypingTarget,
  keyCandidatesFor,
  keyStringFor,
  normalizeKeyString,
  type KeyEventFields,
} from "../../src/hotkeys/keyEvent.js";

afterEach(() => {
  vi.restoreAllMocks();
});

type Modifiers = Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">>;

const WINDOWS = { apple: false } as const;
const MAC = { apple: true } as const;

function keystroke(code: string, key: string, modifiers: Modifiers = {}): KeyEventFields {
  return { code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers };
}

/** What the hotkey editor records for this keystroke, on Windows unless told otherwise. */
function press(code: string, key: string, modifiers: Modifiers = {}, platform: { apple: boolean } = WINDOWS): string | null {
  return keyStringFor(keystroke(code, key, modifiers), platform);
}

/** The stored keys this keystroke answers to, the most particular first. */
function answers(
  code: string,
  key: string,
  modifiers: Modifiers = {},
  platform: { apple: boolean } = WINDOWS,
): readonly string[] {
  return keyCandidatesFor(keystroke(code, key, modifiers), platform);
}

describe("keyStringFor", () => {
  it("names a letter by its physical key, regardless of shift", () => {
    // event.key would be "z" unshifted and "Z" shifted; Qt calls the key Z either way and lists
    // Shift separately.
    expect(press("KeyZ", "z")).toBe("Z");
    expect(press("KeyZ", "Z", { shiftKey: true })).toBe("Shift+Z");
  });

  it("answers every shipped default binding", () => {
    // Each of these is a string that appears in the legacy defaults. If the translation disagrees,
    // the binding is dead. Most are the string the editor records for the key; "Escape" is read as
    // Qt reads it, as Esc.
    const shipped: readonly (readonly [string, string, Modifiers, string])[] = [
      ["KeyZ", "z", { ctrlKey: true }, "Ctrl+Z"],
      ["KeyZ", "Z", { ctrlKey: true, shiftKey: true }, "Ctrl+Shift+Z"],
      ["Space", " ", {}, "Space"],
      ["Space", " ", { shiftKey: true }, "Shift+Space"],
      ["ArrowRight", "ArrowRight", {}, "Right"],
      ["ArrowLeft", "ArrowLeft", {}, "Left"],
      ["Period", ".", {}, "."],
      ["Escape", "Escape", {}, "Escape"],
      ["Backspace", "Backspace", {}, "Backspace"],
      ["KeyA", "a", { ctrlKey: true }, "Ctrl+A"],
      ["KeyN", "N", { shiftKey: true }, "Shift+N"],
      ["Digit1", "1", {}, "1"],
      ["KeyH", "h", { ctrlKey: true }, "Ctrl+H"],
    ];
    for (const [code, key, modifiers, binding] of shipped) {
      expect(answers(code, key, modifiers), binding).toContain(normalizeKeyString(binding));
    }
    expect(press("KeyZ", "z", { ctrlKey: true })).toBe("Ctrl+Z");
    expect(press("Space", " ", { shiftKey: true })).toBe("Shift+Space");
    expect(press("Escape", "Escape")).toBe("Esc");
  });

  it("separates the main Enter key from the keypad's, as Qt does", () => {
    // Legacy binds Save Output to both "Return" and "Enter". event.key calls them both "Enter";
    // only event.code tells them apart, which is why this reads the code. The keypad's is recorded
    // with Num, as legacy's dialog records it, and still answers the "Enter" binding.
    expect(press("Enter", "Enter")).toBe("Return");
    expect(press("NumpadEnter", "Enter")).toBe("Num+Enter");
    expect(answers("NumpadEnter", "Enter")).toEqual(["Num+Enter", "Enter"]);
    expect(answers("Enter", "Enter")).toEqual(["Return"]);
  });

  it("records the zoom keys as legacy's dialog does, and answers the zoom bindings with them", () => {
    // Qt's names, read from PyQt6 6.9.1: `QKeySequence(Key_Equal | Ctrl).toString()` is "Ctrl+=",
    // the keypad's plus with Ctrl "Ctrl+Num++".
    expect(press("Equal", "=", { ctrlKey: true })).toBe("Ctrl+=");
    expect(press("NumpadAdd", "+", { ctrlKey: true })).toBe("Ctrl+Num++");
    expect(press("Minus", "-", { ctrlKey: true })).toBe("Ctrl+-");
    expect(press("NumpadSubtract", "-", { ctrlKey: true })).toBe("Ctrl+Num+-");

    // The shipped zoom bindings, "Ctrl+Plus" and "Ctrl+Minus", are Ctrl++ and Ctrl+-.
    const zoomIn = normalizeKeyString("Ctrl+Plus");
    const zoomOut = normalizeKeyString("Ctrl+Minus");
    expect(answers("NumpadAdd", "+", { ctrlKey: true })).toContain(zoomIn);
    expect(answers("Equal", "=", { ctrlKey: true })).toContain(zoomIn); // web-only: the owner's zoom
    expect(answers("Minus", "-", { ctrlKey: true })).toContain(zoomOut);
    expect(answers("NumpadSubtract", "-", { ctrlKey: true })).toContain(zoomOut);
  });

  it("zooms in on Ctrl+Shift+=, where Shift types the +, as a + binding answers in Qt", () => {
    // CONTROL_PARITY.md CP-66. Qt offers the character Shift typed with the Shift taken off
    // (`qwindowskeymapper.cpp`, `possibleKeyCombinations`), so Ctrl+Shift+= on a US keyboard is
    // Ctrl++ as well.
    expect(answers("Equal", "+", { ctrlKey: true, shiftKey: true })).toEqual(["Ctrl+Shift+=", "Ctrl++"]);
    expect(answers("Equal", "+", { ctrlKey: true, shiftKey: true })).toContain(
      normalizeKeyString("Ctrl+Plus"),
    );
  });

  it("offers the character Shift typed only where it is another key to Qt", () => {
    expect(answers("Digit1", "!", { shiftKey: true })).toEqual(["Shift+1", "!"]);
    // A letter is the same key either way, and so is Space: Shift+N is not N.
    expect(answers("KeyN", "N", { shiftKey: true })).toEqual(["Shift+N"]);
    expect(answers("Space", " ", { shiftKey: true })).toEqual(["Shift+Space"]);
  });

  it("orders modifiers the way Qt writes them", () => {
    // `QKeySequence(Key_K | Ctrl | Alt | Shift | Meta).toString()` is "Meta+Ctrl+Alt+Shift+K",
    // read from PyQt6 6.9.1. The order this used to write, Meta last, is not one Qt writes.
    expect(press("KeyK", "k", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })).toBe(
      "Meta+Ctrl+Alt+Shift+K",
    );
  });

  it("reads a Mac's Command key as Ctrl and its Control key as Meta, as Qt does there", () => {
    // Qt swaps them on macOS (`qapplekeymapper.mm`), and legacy leaves that on: its "Ctrl+Z" is
    // Command+Z on a Mac. The web recorded Command as "Meta", so a binding made on a Mac meant the
    // Windows key on Windows, and Command+Z was not Undo.
    expect(press("KeyZ", "z", { metaKey: true }, MAC)).toBe("Ctrl+Z");
    expect(press("KeyZ", "z", { ctrlKey: true }, MAC)).toBe("Meta+Z");
    expect(press("KeyK", "k", { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }, MAC)).toBe(
      "Meta+Ctrl+Alt+Shift+K",
    );
    // Elsewhere Ctrl is Ctrl and the Windows key is Meta.
    expect(press("KeyZ", "z", { ctrlKey: true })).toBe("Ctrl+Z");
    expect(press("KeyZ", "z", { metaKey: true })).toBe("Meta+Z");
  });

  it("asks the browser which platform it is on when not told", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(keyStringFor(keystroke("KeyZ", "z", { metaKey: true }))).toBe("Ctrl+Z");

    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    expect(keyStringFor(keystroke("KeyZ", "z", { metaKey: true }))).toBe("Meta+Z");
  });

  it("records a keypad key with Num, as legacy's dialog does", () => {
    // `QKeySequence(Key_1 | KeypadModifier).toString()` is "Num+1" (PyQt6 6.9.1).
    expect(press("Numpad1", "1")).toBe("Num+1");
    expect(press("NumpadDecimal", ".")).toBe("Num+.");
    expect(press("NumpadMultiply", "*")).toBe("Num+*");
    expect(press("NumpadDivide", "/")).toBe("Num+/");
    // With NumLock off a keypad key is the key it then moves by, still on the keypad: Qt's Num+Left.
    expect(press("Numpad4", "ArrowLeft")).toBe("Num+Left");
    expect(press("NumpadDecimal", "Delete")).toBe("Num+Del");
  });

  it("lets a keypad key answer its Num binding first and the plain one after, as Qt's shortcuts do", () => {
    // `qshortcutmap.cpp`, `nextState`: no match with the keypad modifier, try without it. That is
    // how a keypad digit works as a plain digit in legacy -- and why a "Num+1" binding, when there is
    // one, wins over "1" on the keypad and is never reached from the digit row.
    expect(answers("Numpad1", "1")).toEqual(["Num+1", "1"]);
    expect(answers("Digit1", "1")).toEqual(["1"]);
    expect(answers("Numpad4", "ArrowLeft")).toEqual(["Num+Left", "Left"]);
  });

  it("on a Mac, lets an arrow key answer a Num binding too, but records it without one", () => {
    // macOS marks the arrows as keypad keys, so legacy's dialog there records "Num+Right" and it
    // works there. Recorded here without Num: "Num+Right" answers no other computer's arrow keys.
    expect(answers("ArrowRight", "ArrowRight", {}, MAC)).toEqual(["Num+Right", "Right"]);
    expect(press("ArrowRight", "ArrowRight", {}, MAC)).toBe("Right");
    expect(answers("ArrowRight", "ArrowRight")).toEqual(["Right"]);
  });

  it("writes every key the way it reads one back", () => {
    for (const [code, key, modifiers] of [
      ["KeyK", "k", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }],
      ["NumpadAdd", "+", { ctrlKey: true }],
      ["Equal", "=", { ctrlKey: true }],
      ["PageDown", "PageDown", { ctrlKey: true }],
      ["Numpad4", "ArrowLeft", {}],
      ["Delete", "Delete", {}],
      ["F5", "F5", { shiftKey: true }],
    ] as const) {
      const written = press(code, key, modifiers)!;
      expect(normalizeKeyString(written), written).toBe(written);
    }
  });

  it("keeps the WASD cluster physical rather than following the layout", () => {
    // On AZERTY the key where W sits reports event.key "z". A movement binding should move the
    // direction the user's finger is over, so the code decides.
    expect(press("KeyW", "z")).toBe("W");
    expect(press("KeyA", "q")).toBe("A");
  });

  it("returns null for a modifier pressed on its own", () => {
    expect(press("ControlLeft", "Control", { ctrlKey: true })).toBeNull();
    expect(press("ShiftRight", "Shift", { shiftKey: true })).toBeNull();
    expect(press("AltLeft", "Alt", { altKey: true })).toBeNull();
    expect(press("MetaLeft", "Meta", { metaKey: true })).toBeNull();
  });

  it("falls back to the typed character for a key it does not name", () => {
    expect(press("IntlRo", "ろ")).toBe("ろ");
  });

  it("names function keys", () => {
    expect(press("F5", "F5")).toBe("F5");
    expect(press("F12", "F12", { ctrlKey: true })).toBe("Ctrl+F12");
  });
});

describe("normalizeKeyString", () => {
  // Legacy binds with `QShortcut(QKeySequence(text))` (main_window.py:1036-1056), and Qt reads a
  // key string in any order and any case, and by its other names. Each of these was read with
  // PyQt6 6.9.1.
  it("reads the modifiers in any order and any case, as QKeySequence does", () => {
    expect(normalizeKeyString("Shift+Ctrl+Z")).toBe("Ctrl+Shift+Z");
    expect(normalizeKeyString("ctrl+z")).toBe("Ctrl+Z");
    expect(normalizeKeyString("Ctrl+Meta+Z")).toBe("Meta+Ctrl+Z");
    expect(normalizeKeyString("num+1")).toBe("Num+1");
    expect(normalizeKeyString("Ctrl + Z")).toBe("Ctrl+Z");
  });

  it("reads Qt's other names for a key, and the ones this app used to write", () => {
    expect(normalizeKeyString("Escape")).toBe("Esc");
    expect(normalizeKeyString("Delete")).toBe("Del");
    expect(normalizeKeyString("Insert")).toBe("Ins");
    expect(normalizeKeyString("Page Down")).toBe("PgDown");
    expect(normalizeKeyString("PageDown")).toBe("PgDown");
    expect(normalizeKeyString("pgup")).toBe("PgUp");
    expect(normalizeKeyString("f5")).toBe("F5");
    expect(normalizeKeyString("RETURN")).toBe("Return");
  });

  it("reads + as a key as well as the separator", () => {
    expect(normalizeKeyString("Ctrl++")).toBe("Ctrl++");
    expect(normalizeKeyString("Num++")).toBe("Num++");
    expect(normalizeKeyString("Ctrl+Num++")).toBe("Ctrl+Num++");
    expect(normalizeKeyString("+")).toBe("+");
    // Legacy's shipped zoom keys, which Qt cannot read at all (`QKeySequence("Ctrl+Plus")` is
    // empty); the web reads them as written.
    expect(normalizeKeyString("Ctrl+Plus")).toBe("Ctrl++");
    expect(normalizeKeyString("Ctrl+Minus")).toBe("Ctrl+-");
  });

  it("leaves a string Qt cannot read unchanged, so it matches nothing, as legacy's shortcut would", () => {
    expect(normalizeKeyString("Cmd+Z")).toBe("Cmd+Z");
    expect(normalizeKeyString("Ctrl+")).toBe("Ctrl+");
  });
});

describe("browserReservation", () => {
  /** Whether the browser keeps the key at all, wherever. */
  const browserReserves = (key: string): boolean => browserReservation(key) !== null;

  it("names the keys a browser tab never sends its page", () => {
    // Close, new and reopen tab; new and incognito window; close window; next and previous tab.
    for (const key of [
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
      "Ctrl+PageDown",
      "Ctrl+PageUp",
    ]) {
      expect(browserReserves(key), key).toBe(true);
    }
  });

  it("recognises them as a keystroke spells them", () => {
    // The check reads the capture's own vocabulary, so the two cannot disagree about Ctrl+W.
    expect(browserReserves(press("KeyW", "w", { ctrlKey: true })!)).toBe(true);
    expect(browserReserves(press("Tab", "Tab", { ctrlKey: true, shiftKey: true })!)).toBe(true);
    expect(browserReserves(press("PageDown", "PageDown", { ctrlKey: true })!)).toBe(true);
    // And as Qt spells them, so an imported legacy binding is recognised too.
    expect(browserReserves("Ctrl+PgDown")).toBe(true);
    expect(browserReserves("shift+ctrl+t")).toBe(true);
  });

  it("names the keys only a Mac's browser keeps, as Qt names them there", () => {
    // CONTROL_PARITY.md CP-66. Command is "Ctrl" on a Mac, Option "Alt" and Control "Meta": quit;
    // next and previous tab by Command+Option+arrow, by Command+Shift+] and [, by Control+Tab and
    // by Control+PageDown and PageUp. Refused everywhere, since a binding follows its user to a Mac.
    for (const key of [
      "Ctrl+Q",
      "Ctrl+Alt+Right",
      "Ctrl+Alt+Left",
      "Ctrl+Shift+]",
      "Ctrl+Shift+[",
      "Meta+Tab",
      "Meta+Shift+Tab",
      "Meta+PgDown",
      "Meta+PgUp",
    ]) {
      expect(browserReservation(key), key).toEqual({ onlyOnAMac: true });
    }
    expect(browserReservation("Ctrl+W")).toEqual({ onlyOnAMac: false });
    expect(browserReservation("M")).toBeNull();
  });

  it("recognises a Mac's keystrokes for them, Command+W as much as Ctrl+W", () => {
    expect(browserReserves(press("KeyW", "w", { metaKey: true }, MAC)!)).toBe(true);
    expect(browserReserves(press("KeyQ", "q", { metaKey: true }, MAC)!)).toBe(true);
    expect(browserReserves(press("ArrowRight", "ArrowRight", { metaKey: true, altKey: true }, MAC)!)).toBe(true);
    expect(browserReserves(press("BracketRight", "}", { metaKey: true, shiftKey: true }, MAC)!)).toBe(true);
    expect(browserReserves(press("Tab", "Tab", { ctrlKey: true }, MAC)!)).toBe(true);
  });

  it("leaves every default binding alone, the sequence's Ctrl+H and Ctrl+P included", () => {
    // The browser's history and print keys reach the page, which is why the shell keeps them from
    // the browser (`CONTROL_PARITY.md` CP-02). Reserved means the page is never told at all.
    for (const [action, binding] of Object.entries(DEFAULT_HOTKEYS)) {
      for (const key of [binding.primary, binding.secondary]) {
        if (key !== null) expect(browserReserves(key), `${action}: ${key}`).toBe(false);
      }
    }
  });

  it("is not a letter's business without the modifier", () => {
    expect(browserReserves("W")).toBe(false);
    expect(browserReserves("Shift+T")).toBe(false);
    expect(browserReserves("Tab")).toBe(false);
  });
});

describe("isTypingTarget", () => {
  function element(html: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host.firstElementChild!;
  }

  it("is true for text inputs, textareas and selects", () => {
    // Pressing V in a class-name field must write a V, not delete the selected segments.
    expect(isTypingTarget(element('<input type="text">'))).toBe(true);
    expect(isTypingTarget(element("<textarea></textarea>"))).toBe(true);
    expect(isTypingTarget(element("<select></select>"))).toBe(true);
    expect(isTypingTarget(element('<input type="number">'))).toBe(true);
  });

  it("is true for a contenteditable element", () => {
    const div = element('<div contenteditable="true"></div>') as HTMLElement;
    expect(isTypingTarget(div)).toBe(true);
  });

  it("is false for controls that do not swallow text", () => {
    expect(isTypingTarget(element('<input type="checkbox">'))).toBe(false);
    expect(isTypingTarget(element('<input type="radio">'))).toBe(false);
    expect(isTypingTarget(element('<input type="range">'))).toBe(false);
    expect(isTypingTarget(element("<button></button>"))).toBe(false);
  });

  it("is false for ordinary elements and for nothing at all", () => {
    expect(isTypingTarget(element("<div></div>"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("keeps only a select's own keys for it, leaving every other key a hotkey", () => {
    // A focused select took every key, so after choosing a Filter Class nothing worked until focus
    // moved. Legacy's window shortcuts keep working with a combo box focused (CONTROL_PARITY.md
    // CP-18); the select keeps what moves through its options.
    const select = element("<select></select>");
    for (const key of ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]) {
      expect(isTypingTarget(select, key), key).toBe(true);
    }
    for (const key of ["v", "m", "1", "ArrowRight", "Enter", " "]) {
      expect(isTypingTarget(select, key), key).toBe(false);
    }
    // A text field keeps every key whatever it is.
    expect(isTypingTarget(element('<input type="text">'), "v")).toBe(true);
  });
});
