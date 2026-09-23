/**
 * What a stored value must look like, asked in one place by the import and by every save.
 *
 * The import had this check and the API's save did not, so `PUT /users/me/settings` stored
 * `gamma: "abc"` as given, and a binding of `null` reached `findConflicts` and answered 500. SEC-16
 * is exactly that pair: legacy validated neither file, and one malformed hotkey crashed it on every
 * launch. The web app reads its settings back on every launch too, so a save is the place to refuse
 * what it could not act on.
 */

import { DEFAULT_SETTINGS } from "./schema.js";

/**
 * Whether a value could stand in for the default.
 *
 * Deliberately loose about numbers: JSON has one number type, and legacy stores `gamma: 1.0` which
 * round-trips as `1`. Refusing an integer where a float is expected would reject a file the legacy
 * app itself wrote.
 */
export function sameShape(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(value);
  if (typeof expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === typeof expected;
}

export function describeShape(value: unknown): string {
  if (Array.isArray(value)) return "an array";
  if (value === null) return "null";
  return `a ${typeof value}`;
}

/**
 * Every reason these values and bindings could not be stored as they are. Empty means they can.
 *
 * UNKNOWN KEYS ARE NOT A REASON. RULE-088's whole fix is keeping a key this version does not know,
 * because it is usually one a newer version does; only a KNOWN key with the wrong shape is refused.
 * `export_formats` is left to `normalizeExportFormats`, which corrects an unusable list and says so
 * rather than refusing it.
 */
export function shapeProblems(values: unknown, hotkeys: unknown): readonly string[] {
  const problems: string[] = [];

  if (!isRecord(values)) {
    problems.push(`values must be an object, not ${describeShape(values)}`);
  } else {
    for (const [key, value] of Object.entries(values)) {
      if (key === "export_formats" || !(key in DEFAULT_SETTINGS)) continue;
      const expected = DEFAULT_SETTINGS[key];
      if (!sameShape(value, expected)) {
        problems.push(`${key} must be ${describeShape(expected)}, not ${describeShape(value)}`);
      }
    }
  }

  if (!isRecord(hotkeys)) {
    problems.push(`hotkeys must be an object, not ${describeShape(hotkeys)}`);
  } else {
    for (const [action, binding] of Object.entries(hotkeys)) {
      if (!isRecord(binding)) {
        problems.push(`the binding for ${action} must be an object, not ${describeShape(binding)}`);
        continue;
      }
      if (typeof binding["primary"] !== "string") {
        problems.push(`the binding for ${action} needs a primary key as text`);
      }
      // Missing reads as unbound, like null. Only a secondary that is there and is not text is wrong.
      const secondary = binding["secondary"];
      if (secondary !== undefined && secondary !== null && typeof secondary !== "string") {
        problems.push(`the secondary key for ${action} must be text or null`);
      }
    }
  }

  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
