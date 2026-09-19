/**
 * Importing a legacy `settings.json` and `hotkeys.json` into the versioned schema.
 *
 * Phase 2 exit criterion 3. The behavior that matters is what happens to a key the schema does not
 * recognize, because that is where the legacy loader loses everything:
 *
 *     data = json.load(f)
 *     return cls(**data)          # one unknown key -> TypeError
 *     except (json.JSONDecodeError, TypeError):
 *         return cls()            # ...and every preference is gone
 *
 * (`config/settings.py` at 2a7d5d8, RULE-088.) A settings file written by a newer build, or one
 * carrying a key from a feature that was later renamed, silently resets the user's entire
 * configuration. Nothing tells them. Here an unrecognized key is KEPT verbatim and reported, a key
 * whose value has the wrong type falls back to its own default and is reported, and a file that is
 * not JSON at all is the only thing that yields defaults wholesale.
 */

import { normalizeExportFormats } from "./exportFormats.js";
import { findConflicts } from "./hotkeyConflicts.js";
import {
  DEFAULT_HOTKEYS,
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  defaultSettings,
  type HotkeyBinding,
  type StoredSettings,
} from "./schema.js";

export interface ImportWarning {
  readonly kind:
    | "unknown-key"
    | "wrong-type"
    | "unparsable"
    | "unknown-hotkey"
    | "malformed-hotkey"
    | "export-formats"
    | "hotkey-conflict";
  readonly key: string;
  readonly detail: string;
}

export interface ImportResult {
  readonly settings: StoredSettings;
  readonly warnings: readonly ImportWarning[];
}

/**
 * Build stored settings from the two legacy files. Either may be absent.
 *
 * @param settingsJson Raw text of `settings.json`, or null when there is none.
 * @param hotkeysJson  Raw text of `hotkeys.json`, or null when there is none.
 */
export function importLegacySettings(
  settingsJson: string | null,
  hotkeysJson: string | null,
): ImportResult {
  const warnings: ImportWarning[] = [];
  const base = defaultSettings();

  const values = { ...base.values, ...importValues(settingsJson, warnings) };
  const hotkeys = { ...base.hotkeys, ...importHotkeys(hotkeysJson, warnings) };

  // RULE-088's second half. Legacy enforces this in the export widget rather than in the loader, so
  // a settings file can hold a list the app would never have let the user choose - including an
  // empty one, which makes a save write no files at all while reporting success.
  const exportFormats = normalizeExportFormats(values["export_formats"]);
  values["export_formats"] = exportFormats.formats;
  for (const detail of exportFormats.warnings) {
    warnings.push({ kind: "export-formats", key: "export_formats", detail });
  }

  // RULE-049's edge case, kept deliberately: a hand-edited file is not rejected for holding a
  // conflict the dialog would have refused, because locking someone out of their configuration
  // over a rebindable key is worse than the conflict. Unlike legacy, it is reported.
  for (const conflict of findConflicts(hotkeys)) {
    warnings.push({
      kind: "hotkey-conflict",
      key: conflict.action,
      detail: `its ${conflict.slot} key ${conflict.key} is already bound to ${conflict.heldBy}; both were kept, and one needs rebinding`,
    });
  }

  return {
    settings: { schemaVersion: SETTINGS_SCHEMA_VERSION, values, hotkeys },
    warnings,
  };
}

function importValues(
  json: string | null,
  warnings: ImportWarning[],
): Record<string, unknown> {
  if (json === null) return {};

  const parsed = parseObject(json);
  if (parsed === null) {
    warnings.push({
      kind: "unparsable",
      key: "settings.json",
      detail: "not a JSON object; the defaults were used",
    });
    return {};
  }

  const migrated = migrateSaveFlags(parsed, warnings);
  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(migrated)) {
    if (!(key in DEFAULT_SETTINGS)) {
      // The legacy loader dies here. Keep it: a key this build does not know is usually a key a
      // NEWER build does, and discarding it turns a downgrade into data loss.
      values[key] = value;
      warnings.push({
        kind: "unknown-key",
        key,
        detail: "not a setting this version knows; kept unchanged",
      });
      continue;
    }

    const expected = DEFAULT_SETTINGS[key];
    if (sameShape(value, expected)) {
      values[key] = value;
    } else {
      warnings.push({
        kind: "wrong-type",
        key,
        detail: `expected ${describe(expected)}, found ${describe(value)}; the default was used`,
      });
    }
  }

  return values;
}

/**
 * Convert the pre-2.0 save booleans into `export_formats`.
 *
 * Mirrors `Settings._migrate_legacy_save_settings`, including its defaults: a missing `save_npz` or
 * `save_txt` counts as true, and `bb_use_alias` and `save_class_aliases` are dropped because they
 * have no equivalent. Without this, a genuinely old settings file would keep four unknown keys and
 * no export formats.
 */
function migrateSaveFlags(
  data: Readonly<Record<string, unknown>>,
  warnings: ImportWarning[],
): Record<string, unknown> {
  const legacyKeys = ["save_npz", "save_txt", "bb_use_alias", "save_class_aliases"];
  if (!legacyKeys.some((key) => key in data)) return { ...data };

  const out = { ...data };
  const formats: string[] = [];
  if (out["save_npz"] ?? true) formats.push("NPZ");
  if (out["save_txt"] ?? true) formats.push("YOLO_DETECTION");
  for (const key of legacyKeys) delete out[key];

  out["export_formats"] = formats.length > 0 ? formats : ["NPZ"];
  warnings.push({
    kind: "unknown-key",
    key: "save_npz/save_txt",
    detail: `pre-2.0 save flags migrated to export_formats ${JSON.stringify(out["export_formats"])}`,
  });
  return out;
}

function importHotkeys(
  json: string | null,
  warnings: ImportWarning[],
): Record<string, HotkeyBinding> {
  if (json === null) return {};

  const parsed = parseObject(json);
  if (parsed === null) {
    warnings.push({
      kind: "unparsable",
      key: "hotkeys.json",
      detail: "not a JSON object; the default bindings were used",
    });
    return {};
  }

  const hotkeys: Record<string, HotkeyBinding> = {};
  for (const [name, entry] of Object.entries(parsed)) {
    const known = DEFAULT_HOTKEYS[name];
    if (known === undefined) {
      warnings.push({
        kind: "unknown-hotkey",
        key: name,
        detail: "no such action in this version; the binding was dropped",
      });
      continue;
    }
    if (known.mouseRelated) {
      warnings.push({
        kind: "unknown-hotkey",
        key: name,
        detail: "mouse actions cannot be rebound; the binding was dropped",
      });
      continue;
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      warnings.push({ kind: "malformed-hotkey", key: name, detail: "not an object; the default was kept" });
      continue;
    }

    const record = entry as Record<string, unknown>;
    const primary = record["primary_key"];
    const secondary = record["secondary_key"];

    if (typeof primary !== "string") {
      // DELIBERATE DEVIATION from legacy, which does `keys.get("primary_key", "")` and silently
      // binds the action to the empty string: a malformed entry unbinds the action with no message,
      // and the user finds out when a key stops working. Same class of loss as RULE-088.
      warnings.push({
        kind: "malformed-hotkey",
        key: name,
        detail: "no primary key; the default binding was kept rather than unbinding the action",
      });
      continue;
    }

    hotkeys[name] = {
      primary,
      secondary: typeof secondary === "string" ? secondary : null,
    };
  }

  return hotkeys;
}

function parseObject(json: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/**
 * Whether a value could stand in for the default.
 *
 * Deliberately loose about numbers: JSON has one number type, and legacy stores `gamma: 1.0` which
 * round-trips as `1`. Refusing an integer where a float is expected would reject a file the legacy
 * app itself wrote.
 */
function sameShape(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(value);
  if (typeof expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === typeof expected;
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return "an array";
  if (value === null) return "null";
  return `a ${typeof value}`;
}
