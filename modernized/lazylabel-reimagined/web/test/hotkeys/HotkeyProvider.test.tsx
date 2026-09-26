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

afterEach(cleanup);

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
    // The hotkey reference asks "will this do something if I press it now"; a fallback only says
    // why it will not.
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
