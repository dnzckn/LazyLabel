/**
 * The desktop app's settings, imported once -- Phase 4 exit criterion 3, as a user meets it.
 *
 * PROGRESS recorded this criterion met while nothing called the import: a user moving from the
 * desktop app started from defaults. These tests hold the startup step that now does it, over the
 * files the legacy app itself wrote (the settings-schema package's fixtures), not hand-typed ones.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import type { Logger, LogLevel } from "../../src/http/log.js";
import { importDesktopSettingsOnce } from "../../src/settings/legacyImport.js";

const LEGACY_FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "settings-schema", "test", "fixtures", "legacy-config",
);

interface LogLine {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: unknown;
}

function recordingLogger(): Logger & { readonly lines: LogLine[] } {
  const lines: LogLine[] = [];
  const logger: Logger & { readonly lines: LogLine[] } = {
    lines,
    log(level, message, fields) {
      lines.push({ level, message, fields });
    },
    child: () => logger,
  };
  return logger;
}

let directory: string;
let store: SqliteMetadataStore;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "desktop-config-"));
  store = new SqliteMetadataStore(":memory:");
});

afterEach(async () => {
  await store.close();
  await rm(directory, { recursive: true, force: true });
});

/** Put one of the legacy-written fixtures where the desktop app keeps it. */
async function desktopFile(fixture: string, as: string): Promise<void> {
  await writeFile(path.join(directory, as), await readFile(path.join(LEGACY_FIXTURES, fixture), "utf-8"));
}

describe("a user moving from the desktop app", () => {
  it("brings their preferences and bindings with them", async () => {
    await desktopFile("settings.json", "settings.json");
    await desktopFile("hotkeys.json", "hotkeys.json");
    const legacy = JSON.parse(await readFile(path.join(LEGACY_FIXTURES, "settings.json"), "utf-8"));

    const outcome = await importDesktopSettingsOnce({ store, directory, logger: recordingLogger() });

    expect(outcome).toBe("imported");
    const stored = await store.getSettings("me");
    expect(stored).not.toBeNull();
    for (const [key, value] of Object.entries(legacy as Record<string, unknown>)) {
      expect(stored!.values[key], `setting ${key}`).toEqual(value);
    }
  });

  it("keeps a 1.5.0 user's preferences, which legacy's own loader resets to defaults", async () => {
    // SEC-16's case. The file carries yolo_use_alias, and legacy at 2a7d5d8 reads it as defaults.
    await desktopFile("settings-v1.5.0.json", "settings.json");

    await importDesktopSettingsOnce({ store, directory, logger: recordingLogger() });

    const stored = await store.getSettings("me");
    expect(stored!.values["window_width"]).toBe(1234);
    expect(stored!.values["gamma"]).toBe(1.4);
    expect(stored!.values["yolo_use_alias"]).toBeUndefined();
  });

  it("logs each change the import made, not just how many", async () => {
    await desktopFile("settings-v1.5.0.json", "settings.json");
    const logger = recordingLogger();

    await importDesktopSettingsOnce({ store, directory, logger });

    const keys = logger.lines
      .filter((line) => line.message === "desktop settings import")
      .map((line) => (line.fields as { key: string }).key);
    expect(keys).toContain("yolo_use_alias");
  });
});

describe("once means once", () => {
  it("never overwrites settings already stored, whoever stored them", async () => {
    const mine = defaultSettings();
    await store.putSettings("me", { ...mine, values: { ...mine.values, window_width: 777 } });
    await desktopFile("settings-v1.5.0.json", "settings.json");

    const outcome = await importDesktopSettingsOnce({ store, directory, logger: recordingLogger() });

    expect(outcome).toBe("already-stored");
    expect((await store.getSettings("me"))!.values["window_width"]).toBe(777);
  });

  it("does not import again on the next start", async () => {
    await desktopFile("settings-v1.5.0.json", "settings.json");
    await importDesktopSettingsOnce({ store, directory, logger: recordingLogger() });

    const again = await importDesktopSettingsOnce({ store, directory, logger: recordingLogger() });

    expect(again).toBe("already-stored");
  });
});

describe("when there is nothing usable", () => {
  it("stores nothing when there are no desktop files", async () => {
    const outcome = await importDesktopSettingsOnce({ store, directory, logger: recordingLogger() });

    expect(outcome).toBe("nothing-found");
    expect(await store.getSettings("me")).toBeNull();
  });

  it("stores nothing for a file that is not JSON, so the window stays open for the fixed file", async () => {
    // Storing defaults here would end the one-time import: the user fixes the file, restarts, and
    // finds it ignored because settings now exist.
    await writeFile(path.join(directory, "settings.json"), "}{ not json");

    const outcome = await importDesktopSettingsOnce({ store, directory, logger: recordingLogger() });

    expect(outcome).toBe("unreadable");
    expect(await store.getSettings("me")).toBeNull();
  });

  it("still imports the file that IS readable when only its partner is broken", async () => {
    await desktopFile("hotkeys.json", "hotkeys.json");
    await writeFile(path.join(directory, "settings.json"), "}{ not json");

    const outcome = await importDesktopSettingsOnce({ store, directory, logger: recordingLogger() });

    expect(outcome).toBe("imported");
    expect(await store.getSettings("me")).not.toBeNull();
  });

  it("does nothing at all when the import is turned off", async () => {
    await desktopFile("settings-v1.5.0.json", "settings.json");

    const outcome = await importDesktopSettingsOnce({ store, directory: null, logger: recordingLogger() });

    expect(outcome).toBe("disabled");
    expect(await store.getSettings("me")).toBeNull();
  });
});
