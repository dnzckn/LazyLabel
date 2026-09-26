/**
 * Holding notifications, and clearing the ones that clear themselves.
 *
 * The policy — which messages linger and which expire — lives in `notifications.ts` and is decided
 * from the event, not here. This owns only the part that needs a running app: the timers, and
 * cancelling them when the component goes away so a dismissed notification cannot come back or
 * a timer cannot fire into an unmounted tree.
 *
 * One timer per notification rather than one sweep over the list. A shared interval would clear
 * things up to its own period late, and would have to be reasoned about every time the list
 * changes; a timer that belongs to one entry is cancelled with that entry.
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

import {
  create,
  dismiss as dismissFrom,
  push,
  type CreateOptions,
  type Notification,
} from "./notifications.js";

export interface NotificationContextValue {
  readonly notifications: readonly Notification[];
  /** Show one. Returns its id, so a caller can dismiss it itself. */
  readonly notify: (options: CreateOptions) => string;
  readonly dismiss: (id: string) => void;
  readonly dismissAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [notifications, setNotifications] = useState<readonly Notification[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setNotifications((existing) => dismissFrom(existing, id));
  }, []);

  const notify = useCallback(
    (options: CreateOptions): string => {
      nextId.current += 1;
      const id = `n${nextId.current}`;
      const notification = create(id, options);

      setNotifications((existing) => push(existing, notification));

      if (notification.autoDismissMs !== null) {
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            setNotifications((existing) => dismissFrom(existing, id));
          }, notification.autoDismissMs),
        );
      }

      return id;
    },
    [],
  );

  const dismissAll = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    setNotifications([]);
  }, []);

  // Timers outlive React's tree unless something stops them. Copied into a local first because the
  // ref's contents can change before the cleanup runs, and clearing the wrong map clears nothing.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ notifications, notify, dismiss, dismissAll }),
    [dismiss, dismissAll, notifications, notify],
  );

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
 * For the settings provider only, which reports a failed save when it can and is mounted without
 * notifications by every test of a component that merely READS settings. Anything that must tell
 * the user something uses `useNotifications`, which throws, so a missing provider cannot hide it.
 */
export function useOptionalNotifications(): NotificationContextValue | null {
  return useContext(NotificationContext);
}

/**
 * Where notifications appear.
 *
 * Errors and warnings are `role="alert"` so a screen reader announces them without being asked;
 * confirmations are `role="status"`, which waits for a pause. That split matters more here than in
 * most apps: the annotator's hands are on the canvas and their eyes are on the image, so a message
 * nobody announces is a message nobody receives.
 */
export function NotificationHost(): ReactNode {
  const { notifications, dismiss } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <ol className="notifications" aria-label="Notifications">
      {notifications.map((notification) => (
        <li key={notification.id} className={`banner banner--${notification.severity}`}>
          {/* The live region goes INSIDE the item, not on it. Putting role="status" on the <li>
              replaces its listitem role, so the list stops being a list to anyone navigating by
              structure -- the announcement would be bought by making the thing unnavigable. */}
          <div
            role={
              notification.severity === "error" || notification.severity === "warning"
                ? "alert"
                : "status"
            }
          >
            <p>
              {notification.message}
              {notification.count > 1 && (
                <span className="notifications__count"> ×{notification.count}</span>
              )}
            </p>

            {notification.detail !== undefined && (
              <p className="notifications__detail">{notification.detail}</p>
            )}
          </div>

          {/* Only what stays needs dismissing. A button on something already leaving is a button
              that vanishes while being aimed at. */}
          {notification.autoDismissMs === null && (
            <button
              type="button"
              onClick={() => dismiss(notification.id)}
              aria-label={`Dismiss: ${notification.message}`}
            >
              Dismiss
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
