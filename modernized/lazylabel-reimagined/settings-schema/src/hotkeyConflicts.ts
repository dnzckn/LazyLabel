/**
 * RULE-049: a key already bound to another action cannot be assigned to a second one.
 *
 * Lives in the shared package because both sides need it and they must not disagree. The rebinding
 * dialog has to refuse a conflicting key WHILE THE USER IS TYPING — a round trip to the server to
 * find out that M is taken is the wrong shape for that interaction — and the API has to refuse the
 * same assignment when a settings PUT arrives, because a client is not a permission.
 *
 * Three clauses from the card:
 *   - a key used as primary OR secondary by any other action is taken;
 *   - mouse bindings can be neither changed nor saved;
 *   - a secondary key may be cleared (null is always a legal secondary).
 *
 * And one edge case worth preserving deliberately: legacy does NOT check conflicts when loading a
 * hand-edited `hotkeys.json`, so a file can hold a conflict the dialog would have refused. That is
 * kept — rejecting the file outright would lock a user out of their own configuration over a key
 * they can simply rebind — but unlike legacy the conflict is REPORTED rather than swallowed.
 */

import { DEFAULT_HOTKEYS, type HotkeyBinding } from "./schema.js";

export interface HotkeyConflict {
  readonly action: string;
  readonly key: string;
  /** The action that already holds this key. */
  readonly heldBy: string;
  readonly slot: "primary" | "secondary";
}

/** Whether this action's binding may be changed at all. */
export function canRebind(action: string): boolean {
  const known = DEFAULT_HOTKEYS[action];
  return known !== undefined && !known.mouseRelated;
}

/**
 * The action already holding `key`, or null when it is free.
 *
 * `exclude` is the action being edited, so re-assigning an action its own current key is not a
 * conflict with itself.
 */
export function actionHolding(
  bindings: Readonly<Record<string, HotkeyBinding>>,
  key: string,
  exclude?: string,
): string | null {
  for (const [action, binding] of Object.entries(bindings)) {
    if (action === exclude) continue;
    if (binding.primary === key || binding.secondary === key) return action;
  }
  return null;
}

/**
 * Check one proposed assignment.
 *
 * Returns null when it is allowed. A null `key` in the secondary slot always is: clearing a
 * secondary binding is explicitly permitted, and an action with no secondary key is the norm.
 */
export function checkAssignment(
  bindings: Readonly<Record<string, HotkeyBinding>>,
  action: string,
  slot: "primary" | "secondary",
  key: string | null,
): HotkeyConflict | { readonly reason: string } | null {
  if (!canRebind(action)) {
    return {
      reason:
        DEFAULT_HOTKEYS[action] === undefined
          ? `there is no action called ${JSON.stringify(action)}`
          : `${action} is a mouse binding and cannot be reassigned`,
    };
  }

  if (key === null) {
    if (slot === "primary") return { reason: `${action} must keep a primary key` };
    return null; // clearing a secondary is always allowed
  }
  if (key === "") return { reason: "a binding cannot be the empty string" };

  const heldBy = actionHolding(bindings, key, action);
  return heldBy === null ? null : { action, key, heldBy, slot };
}

/**
 * Every conflict in a complete set of bindings.
 *
 * Used on import, where the answer is reported rather than enforced. Each pair is listed once: a
 * conflict between two actions is one problem, not two.
 */
export function findConflicts(
  bindings: Readonly<Record<string, HotkeyBinding>>,
): readonly HotkeyConflict[] {
  const holder = new Map<string, { action: string; slot: "primary" | "secondary" }>();
  const conflicts: HotkeyConflict[] = [];

  // Sorted so the report is stable regardless of object key order.
  for (const action of Object.keys(bindings).sort()) {
    const binding = bindings[action]!;
    if (DEFAULT_HOTKEYS[action]?.mouseRelated) continue;

    for (const slot of ["primary", "secondary"] as const) {
      const key = slot === "primary" ? binding.primary : binding.secondary;
      if (key === null || key === "") continue;

      const first = holder.get(key);
      if (first === undefined) holder.set(key, { action, slot });
      else if (first.action !== action) conflicts.push({ action, key, heldBy: first.action, slot });
    }
  }

  return conflicts;
}
