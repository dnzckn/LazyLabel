/**
 * Holding the message the status bar shows, and clearing it when its time is up.
 *
 * One message at a time, as legacy's status bar has one label: a new message replaces the one
 * showing and restarts the timer, and an expired one leaves the bar to what it shows at rest
 * (L ui/widgets/status_bar.py:159-232). The policy -- how long each kind lasts, what it is prefixed
 * with -- is in `notifications.ts`; this owns the part that needs a running app, the timer, and
 * cancels it when the component goes away so it cannot fire into an unmounted tree.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { create, statusText, type CreateOptions, type Notification } from "./notifications.js";

export interface NotificationContextValue {
  /** The message showing, or null when the status bar shows what it shows at rest. */
  readonly current: Notification | null;
  /** Show one, replacing the one showing. Returns its id. */
  readonly notify: (options: CreateOptions) => string;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [current, setCurrent] = useState<Notification | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const notify = useCallback(
    (options: CreateOptions): string => {
      nextId.current += 1;
      const id = `n${nextId.current}`;
      const notification = create(id, options);

      // Legacy stops the running timer and starts the new message's (status_bar.py:166-171).
      stopTimer();
      setCurrent(notification);
      if (notification.autoDismissMs !== null) {
        timer.current = setTimeout(() => {
          timer.current = null;
          setCurrent((showing) => (showing?.id === id ? null : showing));
        }, notification.autoDismissMs);
      }

      return id;
    },
    [stopTimer],
  );

  // A timer outlives React's tree unless something stops it.
  useEffect(() => stopTimer, [stopTimer]);

  const value = useMemo(() => ({ current, notify }), [current, notify]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (value === null) {
    throw new Error("useNotifications needs a NotificationProvider above it");
  }
  return value;
}

/**
 * The notifications, or null with no provider above.
 *
 * For the settings provider, which reports a failed save when it can and is mounted without
 * notifications by every test of a component that merely READS settings, and for the status bar.
 * Anything that must tell the user something uses `useNotifications`, which throws, so a missing
 * provider cannot hide it.
 */
export function useOptionalNotifications(): NotificationContextValue | null {
  return useContext(NotificationContext);
}

/**
 * The message showing, as legacy's status bar draws it: one centred line, coloured by kind, with
 * "Error: " or "Warning: " before those two (L ui/widgets/status_bar.py:159-213). The status bar
 * puts it where its summary of the open image sits at rest.
 *
 * Failures and warnings are `role="alert"`, so a screen reader announces them at once;
 * confirmations are `role="status"`, which waits for a pause.
 */
export function NotificationHost(): ReactNode {
  const { current } = useNotifications();
  if (current === null) return null;

  const text = statusText(current);
  return (
    <span
      className={`status-bar__message status-bar__message--${current.severity}`}
      role={current.severity === "error" || current.severity === "warning" ? "alert" : "status"}
      title={current.detail === undefined ? text : `${text}\n${current.detail}`}
    >
      {text}
    </span>
  );
}
