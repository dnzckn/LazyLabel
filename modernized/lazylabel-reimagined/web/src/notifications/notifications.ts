/**
 * What the app tells the user after it does something, and for how long.
 *
 * Legacy has one notification style and uses it for everything, which is how the single most
 * destructive act in the application — deleting every annotation file for an image, with no prompt
 * and no undo (RULE-083) — is announced as a NEUTRAL, TRANSIENT notice reading
 * `Deleted: cat_coco.json, cat.npz, cat.txt`. It looks exactly like `Saved: cat.npz, cat.txt` and
 * it disappears on a timer. A user who steps away has no way to learn it happened.
 *
 * Two rules follow, and they are the whole module:
 *
 *   1. SEVERITY TRACKS CONSEQUENCE, not tone. Deleting files is not neutral because its message is
 *      calmly worded.
 *   2. ANYTHING THE USER MIGHT NEED TO ACT ON STAYS until dismissed. A timer is for confirmations
 *      the user can afford to miss. Nothing irreversible is in that category, and neither is any
 *      failure.
 *
 * A third comes from the same family of defects. Legacy reports `Multi-view annotations saved!`
 * from a path that may have only DELETED files — the message describes the intent rather than the
 * outcome. So notifications here are constructed from results, and `summarizeSave` is the one
 * place that turns a save response into words, rather than each caller writing its own optimistic
 * sentence.
 */

export type Severity = "info" | "success" | "warning" | "error";

export interface Notification {
  readonly id: string;
  readonly severity: Severity;
  readonly message: string;
  /** What the user can do about it. Shown with the message, never instead of it. */
  readonly detail?: string;
  /**
   * How long before it clears itself, or null to stay until dismissed.
   *
   * Never set directly by callers — `create` derives it, so "this one should linger" cannot be
   * decided case by case and then forgotten on the one path that matters.
   */
  readonly autoDismissMs: number | null;
  /** Repeats of the same message, coalesced rather than stacked. */
  readonly count: number;
}

/** Long enough to read a short confirmation without watching for it. */
export const TRANSIENT_MS = 5_000;

export interface CreateOptions {
  readonly severity: Severity;
  readonly message: string;
  readonly detail?: string;
  /**
   * True when this describes a change that cannot be undone from inside the app.
   *
   * Set it on the act, not on the wording. A cheerful sentence about a permanent deletion is still
   * about a permanent deletion.
   */
  readonly irreversible?: boolean;
}

export function create(id: string, options: CreateOptions): Notification {
  const sticky =
    options.severity === "error" || options.severity === "warning" || options.irreversible === true;

  return {
    id,
    severity: options.severity,
    message: options.message,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    autoDismissMs: sticky ? null : TRANSIENT_MS,
    count: 1,
  };
}

/**
 * Add a notification, coalescing an immediate repeat instead of stacking it.
 *
 * The annotator's loop is click, accept, next, so the same confirmation can arrive dozens of times
 * a minute. Stacking them buries everything else — including the one warning that mattered — under
 * identical lines. Coalescing only applies to the MOST RECENT entry: an older identical message
 * that something else has since been said after is a separate event, and collapsing them would
 * claim two things happened at one moment.
 */
export function push(
  existing: readonly Notification[],
  notification: Notification,
): readonly Notification[] {
  const last = existing[existing.length - 1];

  if (
    last !== undefined
    && last.severity === notification.severity
    && last.message === notification.message
    && last.detail === notification.detail
  ) {
    const merged: Notification = { ...last, count: last.count + 1 };
    return [...existing.slice(0, -1), merged];
  }

  return [...existing, notification];
}

export function dismiss(
  existing: readonly Notification[],
  id: string,
): readonly Notification[] {
  return existing.filter((entry) => entry.id !== id);
}

/** Everything that will not clear itself, which is what a "dismiss all" should act on. */
export function sticky(existing: readonly Notification[]): readonly Notification[] {
  return existing.filter((entry) => entry.autoDismissMs === null);
}

