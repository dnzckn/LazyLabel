/**
 * Dispatching keystrokes to registered actions.
 */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { defaultSettings } from "@lazylabel/settings-schema";

import {
  HotkeyProvider,
  useHotkey,
  useHotkeyContext,
  useHotkeyFallback,
} from "../../src/hotkeys/HotkeyProvider.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const bindings = defaultSettings().hotkeys;

function Listener({ action, onFire }: { readonly action: string; readonly onFire: () => void }): ReactNode {
  useHotkey(action, onFire);
  return null;
}

function press(
  code: string,
  key: string,
  init: Partial<KeyboardEventInit> = {},
  target: EventTarget = document,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { code, key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("HotkeyProvider", () => {
  it("calls the handler registered for the action a key is bound to", () => {
    const onFire = vi.fn();
    render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="merge_segments" onFire={onFire} />
      </HotkeyProvider>,
    );

    press("KeyM", "m");
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("matches a secondary binding too", () => {
    const onFire = vi.fn();
    render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="redo" onFire={onFire} />
      </HotkeyProvider>,
    );

    // Redo's secondary is Ctrl+Shift+Z.
    press("KeyZ", "Z", { ctrlKey: true, shiftKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("prevents the browser default only when something handled the key", () => {
    const onFire = vi.fn();
    render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="select_all" onFire={onFire} />
      </HotkeyProvider>,
    );

    const handled = press("KeyA", "a", { ctrlKey: true });
    expect(handled.defaultPrevented).toBe(true);

    // Undo is bound but nothing registered a handler, so Ctrl+Z must still do whatever the browser
    // would do. Swallowing keys for unimplemented actions is how a web app breaks text editing.
    const unhandled = press("KeyZ", "z", { ctrlKey: true });
    expect(unhandled.defaultPrevented).toBe(false);
  });

  it("keeps a key with a FALLBACK from the browser, and runs the fallback only while nothing handles it", () => {
    // The sequence's Ctrl+H and Ctrl+P reached the browser's history and print dialogs until the
    // Sequence tab was opened; the shell now registers fallbacks for them.
    const onFallback = vi.fn();
    const onFire = vi.fn();
    function Fallback(): ReactNode {
      useHotkeyFallback("find_archetypes", onFallback);
      return null;
    }
    const { rerender } = render(
      <HotkeyProvider bindings={bindings}>
        <Fallback />
      </HotkeyProvider>,
    );

    const alone = press("KeyH", "h", { ctrlKey: true });
    expect(alone.defaultPrevented).toBe(true);
    expect(onFallback).toHaveBeenCalledTimes(1);

    rerender(
      <HotkeyProvider bindings={bindings}>
        <Fallback />
        <Listener action="find_archetypes" onFire={onFire} />
      </HotkeyProvider>,
    );
    press("KeyH", "h", { ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("does not count a fallback as the action being live", () => {
    // `isLive` answers "will this do something if I press it now"; a fallback only says why it
    // will not.
    let live: boolean | undefined;
    function Probe(): ReactNode {
      useHotkeyFallback("propagate", () => undefined);
      live = useHotkeyContext().isLive("propagate");
      return null;
    }
    render(
      <HotkeyProvider bindings={bindings}>
        <Probe />
      </HotkeyProvider>,
    );

    expect(live).toBe(false);
  });

  it("ignores a keystroke aimed at a text field", () => {
    const onFire = vi.fn();
    render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="delete_segments" onFire={onFire} />
        <input type="text" data-testid="name" />
      </HotkeyProvider>,
    );

    const input = document.querySelector("input")!;
    // V deletes the selected segments — unless the user is typing a class name.
    press("KeyV", "v", {}, input);
    expect(onFire).not.toHaveBeenCalled();

    press("KeyV", "v");
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a key nothing is bound to", () => {
    const onFire = vi.fn();
    render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="merge_segments" onFire={onFire} />
      </HotkeyProvider>,
    );

    const event = press("F13", "F13");
    expect(onFire).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops calling a handler once its component unmounts", () => {
    const onFire = vi.fn();
    const { rerender } = render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="merge_segments" onFire={onFire} />
      </HotkeyProvider>,
    );

    press("KeyM", "m");
    expect(onFire).toHaveBeenCalledTimes(1);

    rerender(<HotkeyProvider bindings={bindings} />);
    press("KeyM", "m");
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("follows a rebinding without a reload", () => {
    const onFire = vi.fn();
    const { rerender } = render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="merge_segments" onFire={onFire} />
      </HotkeyProvider>,
    );

    const rebound = { ...bindings, merge_segments: { primary: "F19", secondary: null } };
    rerender(
      <HotkeyProvider bindings={rebound}>
        <Listener action="merge_segments" onFire={onFire} />
      </HotkeyProvider>,
    );

    press("KeyM", "m");
    expect(onFire).not.toHaveBeenCalled();
    press("F19", "F19");
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("reports which action holds a key, for the rebinding dialog", () => {
    let held: string | null = "not read";
    function Probe(): ReactNode {
      held = useHotkeyContext().actionFor("M");
      return null;
    }
    render(
      <HotkeyProvider bindings={bindings}>
        <Probe />
      </HotkeyProvider>,
    );

    expect(held).toBe("merge_segments");
  });

  it("reads a stored binding in any order and case, and by Qt's names, as legacy's shortcuts do", () => {
    // Legacy binds with `QShortcut(QKeySequence(text))` (main_window.py:1036-1056), and Qt reads
    // "shift+ctrl+m" as Ctrl+Shift+M and "Del" as the Delete key -- which is what its hotkey dialog
    // writes for it. Such a binding was dead here (CONTROL_PARITY.md CP-66).
    const merge = vi.fn();
    const remove = vi.fn();
    const rebound = {
      ...bindings,
      merge_segments: { primary: "shift+ctrl+m", secondary: null },
      delete_segments_alt: { primary: "Del", secondary: null },
    };
    render(
      <HotkeyProvider bindings={rebound}>
        <Listener action="merge_segments" onFire={merge} />
        <Listener action="delete_segments_alt" onFire={remove} />
      </HotkeyProvider>,
    );

    press("KeyM", "M", { ctrlKey: true, shiftKey: true });
    press("Delete", "Delete");

    expect(merge).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("zooms in on Ctrl+Shift+=, as legacy's Qt answers a + binding with it", () => {
    // Qt offers the character Shift typed, with the Shift taken off (`qwindowskeymapper.cpp`,
    // `possibleKeyCombinations`): on a US keyboard, Ctrl+Shift+= is Ctrl++. It fell through to the
    // browser's page zoom here. Ctrl+= and the keypad's Ctrl++ still zoom as they did.
    const onFire = vi.fn();
    render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="zoom_in" onFire={onFire} />
      </HotkeyProvider>,
    );

    const shifted = press("Equal", "+", { ctrlKey: true, shiftKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(shifted.defaultPrevented).toBe(true);

    press("Equal", "=", { ctrlKey: true });
    press("NumpadAdd", "+", { ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(3);
  });

  it("answers a keypad key's Num binding first, and the plain one when there is none", () => {
    // Qt's shortcut map tries the keypad modifier, then without it (`qshortcutmap.cpp`,
    // `nextState`), so a keypad digit is the digit -- unless a "Num+" binding claims it, which legacy's
    // dialog records when the keypad key is pressed.
    const ai = vi.fn();
    const polygon = vi.fn();
    const { rerender } = render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="sam_mode" onFire={ai} />
        <Listener action="polygon_mode" onFire={polygon} />
      </HotkeyProvider>,
    );

    press("Numpad1", "1");
    expect(ai).toHaveBeenCalledTimes(1);

    const rebound = { ...bindings, polygon_mode: { primary: "Num+1", secondary: null } };
    rerender(
      <HotkeyProvider bindings={rebound}>
        <Listener action="sam_mode" onFire={ai} />
        <Listener action="polygon_mode" onFire={polygon} />
      </HotkeyProvider>,
    );

    press("Numpad1", "1");
    expect(polygon).toHaveBeenCalledTimes(1);
    expect(ai).toHaveBeenCalledTimes(1);

    press("Digit1", "1");
    expect(ai).toHaveBeenCalledTimes(2);
    expect(polygon).toHaveBeenCalledTimes(1);
  });

  it("takes a Mac's Command+Z for legacy's Ctrl+Z, and its Control+Z for Meta+Z", () => {
    // On a Mac, Qt's "Ctrl" is the Command key (`qapplekeymapper.mm`), so legacy's Undo is
    // Command+Z there. Command reached this as "Meta", and Undo answered only the Control key.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const onFire = vi.fn();
    render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="undo" onFire={onFire} />
      </HotkeyProvider>,
    );

    press("KeyZ", "z", { metaKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);

    press("KeyZ", "z", { ctrlKey: true });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("calls every handler registered for one action", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <HotkeyProvider bindings={bindings}>
        <Listener action="fit_view" onFire={first} />
        <Listener action="fit_view" onFire={second} />
      </HotkeyProvider>,
    );

    press("Period", ".");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
