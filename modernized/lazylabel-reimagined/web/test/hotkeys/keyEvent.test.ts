/**
 * Translating browser keyboard events into the key strings `hotkeys.json` stores.
 *
 * The strings are Qt key sequences, because decision 5 keeps existing config files working. Every
 * mismatch here is a hotkey that silently stops working after the port.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_HOTKEYS } from "@lazylabel/settings-schema";

import { browserReserves, isTypingTarget, keyStringFor } from "../../src/hotkeys/keyEvent.js";

function press(
  code: string,
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">> = {},
): string | null {
  return keyStringFor({
    code,
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  });
}

describe("keyStringFor", () => {
  it("names a letter by its physical key, regardless of shift", () => {
    // event.key would be "z" unshifted and "Z" shifted; Qt calls the key Z either way and lists
    // Shift separately.
    expect(press("KeyZ", "z")).toBe("Z");
    expect(press("KeyZ", "Z", { shiftKey: true })).toBe("Shift+Z");
  });

  it("matches the shipped default bindings exactly", () => {
    // Each of these is a string that appears in the legacy defaults. If the translation disagrees,
    // the binding is dead.
    expect(press("KeyZ", "z", { ctrlKey: true })).toBe("Ctrl+Z");
    expect(press("KeyZ", "Z", { ctrlKey: true, shiftKey: true })).toBe("Ctrl+Shift+Z");
    expect(press("Space", " ")).toBe("Space");
    expect(press("Space", " ", { shiftKey: true })).toBe("Shift+Space");
    expect(press("ArrowRight", "ArrowRight")).toBe("Right");
    expect(press("ArrowLeft", "ArrowLeft")).toBe("Left");
    expect(press("Period", ".")).toBe(".");
    expect(press("Escape", "Escape")).toBe("Escape");
    expect(press("Backspace", "Backspace")).toBe("Backspace");
    expect(press("KeyA", "a", { ctrlKey: true })).toBe("Ctrl+A");
    expect(press("KeyN", "N", { shiftKey: true })).toBe("Shift+N");
    expect(press("Digit1", "1")).toBe("1");
    expect(press("KeyH", "h", { ctrlKey: true })).toBe("Ctrl+H");
  });

  it("separates the main Enter key from the keypad's, as Qt does", () => {
    // Legacy binds Save Output to both "Return" and "Enter". event.key calls them both "Enter";
    // only event.code tells them apart, which is why this reads the code.
    expect(press("Enter", "Enter")).toBe("Return");
    expect(press("NumpadEnter", "Enter")).toBe("Enter");
  });

  it("names the zoom keys the way the bindings spell them", () => {
    expect(press("Equal", "=", { ctrlKey: true })).toBe("Ctrl+Plus");
    expect(press("NumpadAdd", "+", { ctrlKey: true })).toBe("Ctrl+Plus");
    expect(press("Minus", "-", { ctrlKey: true })).toBe("Ctrl+Minus");
    expect(press("NumpadSubtract", "-", { ctrlKey: true })).toBe("Ctrl+Minus");
  });

  it("orders modifiers the way Qt writes them", () => {
    expect(press("KeyK", "k", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })).toBe(
      "Ctrl+Alt+Shift+Meta+K",
    );
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

describe("browserReserves", () => {
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
