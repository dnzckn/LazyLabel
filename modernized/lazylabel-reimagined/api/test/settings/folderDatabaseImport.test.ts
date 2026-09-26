/**
 * The per-folder settings database earlier versions kept, brought across once (DEPLOYABILITY.md R5).
 *
 * The default moved from `<dataset>/.lazylabel/lazylabel.db` to one file per user. Without this, a
 * user who had set the web app up would start from defaults, with their settings still sitting in a
 * folder nothing reads any more.
 */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import type { Logger, LogLevel } from "../../src/http/log.js";
import { importFolderSettingsOnce } from "../../src/settings/folderDatabaseImport.js";

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

function settingsWith(width: number): StoredSettings {
  const defaults = defaultSettings();
  return { ...defaults, values: { ...defaults.values, window_width: width } };
}

let dataset: string;
let folderDatabase: string;
let store: SqliteMetadataStore;

beforeEach(async () => {
  dataset = await mkdtemp(path.join(tmpdir(), "lazylabel-folder-db-"));
  folderDatabase = path.join(dataset, ".lazylabel", "lazylabel.db");
  store = new SqliteMetadataStore(":memory:");
});

afterEach(async () => {
  await store.close();
  await rm(dataset, { recursive: true, force: true });
});

/** A folder database as an earlier version left it: written by the same store. */
async function earlierVersionSaved(settings: StoredSettings | null): Promise<void> {
  await mkdir(path.dirname(folderDatabase), { recursive: true });
  const earlier = new SqliteMetadataStore(folderDatabase);
  if (settings !== null) await earlier.putSettings("me", settings);
  await earlier.close();
}

function importing(logger: Logger = recordingLogger(), databasePath = ":memory:") {
  return importFolderSettingsOnce({ store, databasePath, datasetRoot: dataset, logger });
}

describe("a folder an earlier version kept settings in", () => {
  it("gives its settings to the per-user store, and says where they came from", async () => {
    await earlierVersionSaved(settingsWith(1234));
    const logger = recordingLogger();

    expect(await importing(logger)).toBe("imported");
    expect((await store.getSettings("me"))!.values["window_width"]).toBe(1234);
    expect(logger.lines).toContainEqual(
      expect.objectContaining({ level: "info", fields: expect.objectContaining({ from: folderDatabase }) }),
    );
  });

  it("does it once: the next start finds the settings stored and leaves the folder's file alone", async () => {
    await earlierVersionSaved(settingsWith(1234));
    await importing();
    await store.putSettings("me", settingsWith(777));
    const logger = recordingLogger();

    expect(await importing(logger)).toBe("already-stored");
    expect((await store.getSettings("me"))!.values["window_width"]).toBe(777);
    // Said, so a user who wonders why an old folder's settings did not come back can find out.
    expect(logger.lines.map((line) => line.message)).toContain(
      "this folder holds a settings database from an earlier version, which is no longer read",
    );
  });

  it("only reads the folder's file, which may be on a share or read-only", async () => {
    await earlierVersionSaved(settingsWith(1234));
    const before = createHash("sha256").update(await readFile(folderDatabase)).digest("hex");

    await importing();

    expect(createHash("sha256").update(await readFile(folderDatabase)).digest("hex")).toBe(before);
  });
});

describe("when there is nothing to bring across", () => {
  it("does nothing for a folder with no database", async () => {
    expect(await importing()).toBe("nothing-found");
    expect(await store.getSettings("me")).toBeNull();
  });

  it("does nothing for a folder database that never saved any settings", async () => {
    await earlierVersionSaved(null);

    expect(await importing()).toBe("nothing-found");
    expect(await store.getSettings("me")).toBeNull();
  });

  it("does nothing when the store IS the folder's database, as a deployment that sets LAZYLABEL_DB there has it", async () => {
    await earlierVersionSaved(settingsWith(1234));

    expect(await importing(recordingLogger(), folderDatabase)).toBe("same-database");
    expect(await store.getSettings("me")).toBeNull();
  });

  it("stores nothing from a file that is not a database, so the desktop import still gets its turn", async () => {
    await mkdir(path.dirname(folderDatabase), { recursive: true });
    await writeFile(folderDatabase, "not a database at all");
    const logger = recordingLogger();

    expect(await importing(logger)).toBe("unreadable");
    expect(await store.getSettings("me")).toBeNull();
    expect(logger.lines.some((line) => line.level === "warn")).toBe(true);
  });
});
