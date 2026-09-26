/**
 * What one settings save CHANGED, so it can be applied on top of whatever the server holds now.
 *
 * Every control saves the whole document, built from the settings it was rendered with. Two saves
 * made within one round trip were therefore built from the same snapshot, and the one the server
 * wrote second put back the value the first had just changed: type a pan speed, click Operate On
 * View before the first answer arrives, and the pan speed was gone after a reload. Reducing each
 * save to its changes, and applying those to the last document the server confirmed, is what lets
 * the two land together.
 *
 * Compared by value, not by identity: the server answers with new objects, so an export-format list
 * nobody touched is a different array after every save.
 */

import type { HotkeyBinding, StoredSettings } from "@lazylabel/settings-schema";

export interface SettingsChanges {
  /** Each changed key with its new value; `undefined` for a key the caller left out. */
  readonly values: ReadonlyMap<string, unknown>;
  readonly hotkeys: ReadonlyMap<string, HotkeyBinding | undefined>;
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function changed<T>(
  base: Readonly<Record<string, T>>,
  next: Readonly<Record<string, T>>,
): Map<string, T | undefined> {
  const out = new Map<string, T | undefined>();
  for (const [key, value] of Object.entries(next)) {
    if (!(key in base) || !same(base[key], value)) out.set(key, value);
  }
  for (const key of Object.keys(base)) {
    if (!(key in next)) out.set(key, undefined);
  }
  return out;
}

/** What `next` changes relative to `base`, the settings its caller was shown. */
export function changesBetween(base: StoredSettings, next: StoredSettings): SettingsChanges {
  return {
    values: changed(base.values, next.values),
    hotkeys: changed(base.hotkeys, next.hotkeys),
  };
}

/** Both sets of changes, the later one winning where they touch the same key. */
export function mergeChanges(earlier: SettingsChanges, later: SettingsChanges): SettingsChanges {
  return {
    values: new Map([...earlier.values, ...later.values]),
    hotkeys: new Map([...earlier.hotkeys, ...later.hotkeys]),
  };
}

function applied<T>(
  base: Readonly<Record<string, T>>,
  changes: ReadonlyMap<string, T | undefined>,
): Readonly<Record<string, T>> {
  if (changes.size === 0) return base;
  const out: Record<string, T> = { ...base };
  for (const [key, value] of changes) {
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
  return out;
}

/** `base` with the changes made. A part nothing changed keeps its identity. */
export function applyChanges(base: StoredSettings, changes: SettingsChanges): StoredSettings {
  return {
    schemaVersion: base.schemaVersion,
    values: applied(base.values, changes.values),
    hotkeys: applied(base.hotkeys, changes.hotkeys),
  };
}
