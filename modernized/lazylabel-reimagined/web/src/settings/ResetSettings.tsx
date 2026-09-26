/**
 * Reset to Default: every setting back to its default, hotkeys kept.
 *
 * Legacy's Application Settings group ends with this button (`settings_widget.py:104-110`), and it
 * resets that group's five settings without asking (`:197-207`). The owner asked on 2026-09-26 for
 * "a reset to defaults button somewhere" for the app's settings as a whole, so this resets all of
 * them, and asks first, as the hotkey dialog's Reset does (`hotkey_dialog.py:374-385`).
 *
 * Hotkeys are not touched. They have their own reset in the hotkey dialog, in both apps.
 */

import type { ReactNode } from "react";

import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION, type StoredSettings } from "@lazylabel/settings-schema";

import { useSettings } from "./SettingsProvider.jsx";

/** Asked before anything is reset. One sentence, saying what is and is not reset. */
export const RESET_QUESTION = "Reset all settings, except hotkeys, to their defaults?";

/**
 * `settings` with every setting this build knows at its default, and the hotkeys as they were.
 *
 * A key this build does not know is kept. It is usually a newer build's (RULE-088), and resetting
 * this app's settings is no reason to wipe another version's.
 */
export function withDefaultValues(settings: StoredSettings): StoredSettings {
  return {
    ...settings,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    values: { ...settings.values, ...DEFAULT_SETTINGS },
  };
}

export function ResetSettings({
  confirm = (message) => globalThis.confirm(message),
}: {
  /** Asked first. Injectable, so a test can answer it. */
  readonly confirm?: (message: string) => boolean;
}): ReactNode {
  const { settings, save } = useSettings();

  return (
    <button
      type="button"
      title="Reset all settings to their default values"
      onClick={() => {
        if (!confirm(RESET_QUESTION)) return;
        // A refused save is reported by the provider, and the settings stay as they were.
        save(withDefaultValues(settings)).catch(() => undefined);
      }}
    >
      Reset to Default
    </button>
  );
}
