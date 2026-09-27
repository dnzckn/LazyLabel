/**
 * What the app tells the user after it does something, and for how long: legacy's status bar
 * messages (CONTROL_PARITY.md CP-64).
 *
 * Legacy has no notification surface of its own. Its NotificationManager puts every message in the
 * status bar's centre label (L ui/managers/notification_manager.py:11-74), one at a time: a new one
 * replaces the one showing and restarts the timer, and when the timer runs out the label goes blank
 * (L ui/widgets/status_bar.py:159-232). The web stacked boxed banners above the status bar instead,
 * kept failures, warnings and deletions until dismissed, and counted repeats. The owner asked on
 * 2026-09-25 for every feature to behave as in the desktop app, so this is legacy's again.
 */

export type Severity = "info" | "success" | "warning" | "error";

export interface Notification {
  readonly id: string;
  readonly severity: Severity;
  readonly message: string;
  /** More than the line says: the message's tooltip, never its text. */
  readonly detail?: string;
  /** How long it shows, or null to show until the next message replaces it. */
  readonly autoDismissMs: number | null;
}

/**
 * Legacy's timers, by kind: `_show_notification` 3 s, success 3 s, warning 5 s, error 8 s
 * (L ui/main_window.py:2014-2028; L ui/managers/notification_manager.py:18-22).
 */
export const DURATION_MS: Readonly<Record<Severity, number>> = {
  info: 3_000,
  success: 3_000,
  warning: 5_000,
  error: 8_000,
};

export interface CreateOptions {
  readonly severity: Severity;
  readonly message: string;
  readonly detail?: string;
  /**
   * The duration a legacy call passes itself, where it passes one, such as the 2 s of "AI model is
   * updating, please wait...". 0 shows it until the next message, as legacy's 0 does
   * (L ui/widgets/status_bar.py:169-171).
   */
  readonly durationMs?: number;
}

export function create(id: string, options: CreateOptions): Notification {
  const duration = options.durationMs ?? DURATION_MS[options.severity];

  return {
    id,
    severity: options.severity,
    message: options.message,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    autoDismissMs: duration > 0 ? duration : null,
  };
}

/**
 * The line the status bar shows: legacy's "Error: " and "Warning: " before those two kinds, and the
 * message as it is before the others (L ui/widgets/status_bar.py:173-213).
 */
export function statusText(notification: Notification): string {
  if (notification.severity === "error") return `Error: ${notification.message}`;
  if (notification.severity === "warning") return `Warning: ${notification.message}`;
  return notification.message;
}
