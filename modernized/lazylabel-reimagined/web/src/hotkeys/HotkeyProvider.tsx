/**
 * Dispatching keystrokes to actions.
 *
 * The bindings come from the shared settings schema, so this and the API agree about what "Ctrl+Z"
 * means and about which assignments are legal (RULE-049). What lives here is only the browser half:
 * listening, translating a `KeyboardEvent` into a stored key string, and calling the handler a
 * component registered.
 *
 * Two behaviours that are easy to get wrong and expensive to get wrong:
 *
 *   - A keystroke while the user is typing is NOT a hotkey. Pressing V in a class-name field must
 *     write a V, not delete the selected segments.
 *   - An action with no handler registered does nothing AND does not swallow the key. Preventing
 *     the browser's default for a key nothing handles is how Ctrl+A stops selecting text for no
 *     visible reason.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import type { HotkeyBinding } from "@lazylabel/settings-schema";

import { isTypingTarget, keyStringFor } from "./keyEvent.js";

export type HotkeyHandler = (event: KeyboardEvent) => void;

export interface HotkeyContextValue {
  /** Register a handler for an action. Returns the function that unregisters it. */
  readonly register: (action: string, handler: HotkeyHandler) => () => void;
  /** Which action a key string is bound to, or null. Drives "that key is taken" in the UI. */
  readonly actionFor: (key: string) => string | null;
  readonly bindings: Readonly<Record<string, HotkeyBinding>>;
}

const HotkeyContext = createContext<HotkeyContextValue | null>(null);

export function HotkeyProvider({
  bindings,
  children,
  target,
}: {
  readonly bindings: Readonly<Record<string, HotkeyBinding>>;
  readonly children?: ReactNode;
  /** Where to listen. Defaults to the document; injectable for tests. */
  readonly target?: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
}): ReactNode {
  const handlers = useRef(new Map<string, Set<HotkeyHandler>>());

  // Rebuilt whenever the bindings change, so a rebinding takes effect without a reload.
  const byKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const [action, binding] of Object.entries(bindings)) {
      if (binding.primary) map.set(binding.primary, action);
      if (binding.secondary) map.set(binding.secondary, action);
    }
    return map;
  }, [bindings]);

  const register = useCallback((action: string, handler: HotkeyHandler) => {
    const existing = handlers.current.get(action) ?? new Set<HotkeyHandler>();
    existing.add(handler);
    handlers.current.set(action, existing);

    return () => {
      const current = handlers.current.get(action);
      current?.delete(handler);
      if (current?.size === 0) handlers.current.delete(action);
    };
  }, []);

  useEffect(() => {
    const listenOn = target === undefined ? globalThis.document : target;
    if (listenOn === null || listenOn === undefined) return;

    const onKeyDown = (event: Event): void => {
      const keyboardEvent = event as KeyboardEvent;
      if (isTypingTarget(keyboardEvent.target)) return;

      const key = keyStringFor(keyboardEvent);
      if (key === null) return;

      const action = byKey.get(key);
      if (action === undefined) return;

      const registered = handlers.current.get(action);
      // No handler means the key is not ours today. Leave the browser's own behaviour alone rather
      // than swallowing it for an action this screen does not implement.
      if (registered === undefined || registered.size === 0) return;

      keyboardEvent.preventDefault();
      for (const handler of registered) handler(keyboardEvent);
    };

    listenOn.addEventListener("keydown", onKeyDown);
    return () => listenOn.removeEventListener("keydown", onKeyDown);
  }, [byKey, target]);

  const value = useMemo<HotkeyContextValue>(
    () => ({ register, actionFor: (key) => byKey.get(key) ?? null, bindings }),
    [register, byKey, bindings],
  );

  return <HotkeyContext.Provider value={value}>{children}</HotkeyContext.Provider>;
}

export function useHotkeyContext(): HotkeyContextValue {
  const value = useContext(HotkeyContext);
  if (value === null) throw new Error("hotkeys must be used inside a HotkeyProvider");
  return value;
}

/** Run `handler` when the user triggers `action`. */
export function useHotkey(action: string, handler: HotkeyHandler): void {
  const { register } = useHotkeyContext();
  // Kept in a ref so a handler that closes over changing state does not re-register on every
  // render, which would churn the listener map on every keystroke it causes.
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => register(action, (event) => latest.current(event)), [register, action]);
}
