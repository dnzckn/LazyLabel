/**
 * The one-time import of the desktop app's settings: Phase 4 exit criterion 3, made reachable.
 *
 * `importLegacySettings` was written, tested against files the legacy app itself wrote, and called
 * by nothing. The architecture's "imported once" (REIMAGINED_ARCHITECTURE.md section 4) had no
 * caller, so a user moving from the desktop app started from defaults, and PROGRESS recorded the
 * criterion as met because a test of the function passed. It is this project's recurring defect at
 * the process level: a thing that works, a test that proves it, and nothing calling it.
 *
 * WHEN. At startup, and only while this database holds no settings. Once anything is stored, by
 * this import or by the user saving, the stored settings are the truth and the desktop files are
 * never read again, so nothing the web app holds is ever overwritten by them.
 *
 * WHAT. `settings.json` and `hotkeys.json` from the directory the configuration names, which is
 * legacy's own config directory by default. Either may be absent. A file that is there and is not
 * JSON is reported and NOT replaced by defaults in the store: storing defaults would close the
 * one-time window, and the user could never import the file after fixing it.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";

import { importLegacySettings } from "@lazylabel/settings-schema";

import type { Logger } from "../http/log.js";
import type { MetadataStore } from "../ports/metadataStore.js";

export type DesktopImportOutcome =
  | "imported"
  | "already-stored"
  | "nothing-found"
  | "unreadable"
  | "disabled";

export async function importDesktopSettingsOnce(options: {
  readonly store: MetadataStore;
  /** The desktop app's config directory, or null when the import is turned off. */
  readonly directory: string | null;
  readonly logger: Logger;
}): Promise<DesktopImportOutcome> {
  const { store, directory, logger } = options;
  if (directory === null) return "disabled";

  if ((await store.getSettings("me")) !== null) return "already-stored";

  const settingsText = await readIfPresent(path.join(directory, "settings.json"), logger);
  const hotkeysText = await readIfPresent(path.join(directory, "hotkeys.json"), logger);
  if (settingsText === null && hotkeysText === null) {
    logger.log("info", "no desktop LazyLabel settings to import", { from: directory });
    return "nothing-found";
  }

  const { settings, warnings } = importLegacySettings(settingsText, hotkeysText);

  const present = Number(settingsText !== null) + Number(hotkeysText !== null);
  const unparsable = warnings.filter((warning) => warning.kind === "unparsable").length;
  if (unparsable === present) {
    logger.log("warn", "found desktop LazyLabel settings that are not JSON; nothing was imported", {
      from: directory,
    });
    return "unreadable";
  }

  await store.putSettings("me", settings);
  logger.log("info", "imported the desktop app's settings", {
    from: directory,
    warnings: warnings.length,
  });
  // Each one individually. "3 warnings" tells the user something changed and not what; the whole
  // point of reporting instead of silently correcting is that they can see which preference moved.
  for (const warning of warnings) {
    logger.log("warn", "desktop settings import", {
      kind: warning.kind,
      key: warning.key,
      detail: warning.detail,
    });
  }
  return "imported";
}

async function readIfPresent(file: string, logger: Logger): Promise<string | null> {
  try {
    return await readFile(file, "utf-8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    // There but unreadable, which is not the same as absent, so it is said.
    logger.log("warn", "a desktop settings file could not be read", {
      file,
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}
