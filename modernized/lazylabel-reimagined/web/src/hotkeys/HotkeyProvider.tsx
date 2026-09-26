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
 *     visible reason. The exception is an action something registered a FALLBACK for: the
 *     sequence's Ctrl+H and Ctrl+P, which fell through to the browser's history and print dialogs
 *     while the Sequence tab had not been opened.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  useState,
} from "react";

import type { HotkeyBinding } from "@lazylabel/settings-schema";

import { isTypingTarget, keyStringFor } from "./keyEvent.js";

export type HotkeyHandler = (event: KeyboardEvent) => void;

export interface HotkeyContextValue {
  /** Register a handler for an action. Returns the function that unregisters it. */
  readonly register: (action: string, handler: HotkeyHandler) => () => void;
  /**
   * Register what an action does while NOTHING else handles it, and keep its key from the browser
   * meanwhile. Not a handler for `isLive`: a fallback says why nothing happened, it does not make
   * the action work.
   */
  readonly registerFallback: (action: string, handler: HotkeyHandler) => () => void;
  /** Which action a key string is bound to, or null. Drives "that key is taken" in the UI. */
  readonly actionFor: (key: string) => string | null;
  readonly bindings: Readonly<Record<string, HotkeyBinding>>;
  /**
   * The actions something is actually listening for, right now.
   *
   * Exposed so the hotkey reference can stop promising keys that do nothing. FORTY of the
   * forty-three in the schema had no handler, and the reference listed every one of them with its
   * key as though pressing it would work -- which is a worse lie than a missing feature, because
   * the user is told where to find it.
   *
   * Runtime truth rather than a hand-kept list, so it cannot go stale: an action wired up
   * tomorrow stops being marked the moment it is. It is genuinely live state -- a hotkey
   * registered only while an image is open is listed as unavailable when none is -- and that is
   * the honest answer to "will this key do something if I press it now".
   */
  readonly isLive: (action: string) => boolean;
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
  const fallbacks = useRef(new Map<string, Set<HotkeyHandler>>());

  // Rebuilt whenever the bindings change, so a rebinding takes effect without a reload.
  const byKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const [action, binding] of Object.entries(bindings)) {
      if (binding.primary) map.set(binding.primary, action);
      if (binding.secondary) map.set(binding.secondary, action);
    }
    return map;
  }, [bindings]);

  // A rendered mirror of `handlers`, which is a ref and therefore invisible to React. The ref
  // stays the dispatch path -- it must not re-render on every keystroke -- and this exists only so
  // the reference table can redraw when an action gains or loses its last listener.
  const [live, setLive] = useState<ReadonlySet<string>>(() => new Set());

  const register = useCallback((action: string, handler: HotkeyHandler) => {
    const existing = handlers.current.get(action) ?? new Set<HotkeyHandler>();
    existing.add(handler);
    handlers.current.set(action, existing);
    setLive((current: ReadonlySet<string>) => (current.has(action) ? current : new Set(current).add(action)));

    return () => {
      const current = handlers.current.get(action);
      current?.delete(handler);
      if (current?.size === 0) {
        handlers.current.delete(action);
        setLive((shown: ReadonlySet<string>) => {
          if (!shown.has(action)) return shown;
          const next = new Set(shown);
          next.delete(action);
          return next;
        });
      }
    };
  }, []);

  const registerFallback = useCallback((action: string, handler: HotkeyHandler) => {
    const existing = fallbacks.current.get(action) ?? new Set<HotkeyHandler>();
    existing.add(handler);
    fallbacks.current.set(action, existing);
    return () => {
      fallbacks.current.get(action)?.delete(handler);
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
      // than swallowing it for an action this screen does not implement -- unless something
      // registered a fallback, which says why nothing happened and keeps the key from the browser.
      const answering =
        registered !== undefined && registered.size > 0 ? registered : fallbacks.current.get(action);
      if (answering === undefined || answering.size === 0) return;

      keyboardEvent.preventDefault();
      for (const handler of answering) handler(keyboardEvent);
    };

    listenOn.addEventListener("keydown", onKeyDown);
    return () => listenOn.removeEventListener("keydown", onKeyDown);
  }, [byKey, target]);

  const value = useMemo<HotkeyContextValue>(
    () => ({
      register,
      registerFallback,
      actionFor: (key) => byKey.get(key) ?? null,
      bindings,
      isLive: (action) => live.has(action),
    }),
    [register, registerFallback, byKey, bindings, live],
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

/**
 * Run `handler` when the user triggers `action` and nothing else handles it, keeping the key from
 * the browser either way. The action still reads as not live in the hotkey reference.
 */
export function useHotkeyFallback(action: string, handler: HotkeyHandler): void {
  const { registerFallback } = useHotkeyContext();
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => registerFallback(action, (event) => latest.current(event)), [registerFallback, action]);
}
