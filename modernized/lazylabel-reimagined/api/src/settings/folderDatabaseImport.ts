/**
 * The settings an earlier version kept in the dataset folder, brought across once.
 *
 * Until 2026-09-26 the settings database defaulted to `<datasetRoot>/.lazylabel/lazylabel.db`, one
 * per folder. It is per user now (`config.ts`, DEPLOYABILITY.md R5), so without this a user who had
 * set things up in the web app would start from defaults, with their settings still sitting in a
 * folder nothing reads any more.
 *
 * WHEN. At startup, while the per-user store holds no settings, exactly like the desktop import, and
 * BEFORE it: the folder's database is this app's own record, and on its own first start it will
 * already have taken in the desktop app's files. Once anything is stored, by this import, by the
 * desktop import or by the user saving, the store is the truth, and a folder database found later
 * is left alone and said to be no longer read.
 *
 * WHAT. The one settings document, copied as the old API would have served it; the route that
 * serves settings normalises it like any stored document. The folder's file is only read.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";

import { readSettingsFile } from "../adapters/sqliteMetadataStore.js";
import type { Logger } from "../http/log.js";
import type { MetadataStore } from "../ports/metadataStore.js";

export type FolderImportOutcome =
  | "imported"
  | "already-stored"
  | "nothing-found"
  | "same-database"
  | "unreadable";

export async function importFolderSettingsOnce(options: {
  readonly store: MetadataStore;
  /** Where the store itself is, or ":memory:". */
  readonly databasePath: string;
  readonly datasetRoot: string;
  readonly logger: Logger;
}): Promise<FolderImportOutcome> {
  const { store, databasePath, datasetRoot, logger } = options;
  const folderDatabase = path.join(datasetRoot, ".lazylabel", "lazylabel.db");

  // A deployment that points LAZYLABEL_DB at the folder on purpose, as the Docker image does,
  // already reads it: there is nothing to bring across.
  if (databasePath !== ":memory:" && samePath(databasePath, folderDatabase)) return "same-database";
  if (!existsSync(folderDatabase)) return "nothing-found";

  if ((await store.getSettings("me")) !== null) {
    logger.log("info", "this folder holds a settings database from an earlier version, which is no longer read", {
      found: folderDatabase,
      settings: databasePath,
    });
    return "already-stored";
  }

  let settings;
  try {
    settings = readSettingsFile(folderDatabase, "me");
  } catch (cause) {
    // Not fatal, and nothing stored, so the desktop import after this still gets its chance.
    logger.log("warn", "the settings database in this folder could not be read; nothing was imported from it", {
      from: folderDatabase,
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return "unreadable";
  }
  if (settings === null) return "nothing-found";

  await store.putSettings("me", settings);
  logger.log("info", "imported the settings an earlier version kept in this folder; they are kept per user now", {
    from: folderDatabase,
    to: databasePath,
  });
  return "imported";
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
