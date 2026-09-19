/**
 * The default metadata store: one SQLite file.
 *
 * Decision 5. Settings, hotkeys, projects, sequences and job records are a few thousand rows for
 * one user, so a database server would be operational burden for state that fits in a file. A
 * hosted deployment with PostgreSQL nearby implements the same port against it
 * (`REIMAGINED_ARCHITECTURE.md` section 3.1).
 *
 * Settings are stored as one JSON document per user rather than a column per setting, and that is
 * deliberate: the schema's job is to PRESERVE keys it does not recognize (RULE-088), and a table
 * with a column per known setting is a design that cannot do that. Migrations live in `MIGRATIONS`
 * and run in order on open.
 *
 * `node:sqlite` is marked experimental, so it prints a warning on first use. It is in the standard
 * library, which keeps the API's runtime dependency count at zero; if the API ever needs to move
 * off it, this file is the only one that changes.
 */

import { DatabaseSync } from "node:sqlite";

import type { MetadataStore } from "../ports/metadataStore.js";
import type { StoredSettings } from "@lazylabel/settings-schema";

/** Applied in order; `user_version` records how many have run. Never edit one that has shipped. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE settings (
     user_id     TEXT PRIMARY KEY,
     document    TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   ) STRICT;`,
];

export class SqliteMetadataStore implements MetadataStore {
  private readonly db: DatabaseSync;

  /** @param location A file path, or ":memory:" for a database that lives only as long as the process. */
  constructor(location: string) {
    this.db = new DatabaseSync(location);
    // WAL lets a reader and a writer coexist, which matters once export runs on a worker thread.
    // An in-memory database has no journal to speak of, so the pragma is skipped there.
    if (location !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    const row = this.db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
    const applied = row?.user_version ?? 0;

    for (let version = applied; version < MIGRATIONS.length; version += 1) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(MIGRATIONS[version]!);
        // PRAGMA will not take a bound parameter, and `version + 1` is a number this code computed,
        // never anything from a request.
        this.db.exec(`PRAGMA user_version = ${version + 1}`);
        this.db.exec("COMMIT");
      } catch (cause) {
        this.db.exec("ROLLBACK");
        throw cause;
      }
    }
  }

  async getSettings(userId: string): Promise<StoredSettings | null> {
    const row = this.db.prepare("SELECT document FROM settings WHERE user_id = ?").get(userId) as
      | { document: string }
      | undefined;
    if (row === undefined) return null;

    try {
      return JSON.parse(row.document) as StoredSettings;
    } catch (cause) {
      // Defaults rather than a crash, and loudly: the user loses preferences, not the ability to
      // annotate, which is the failure-mode table's line for the database being unavailable.
      throw new Error(
        `the stored settings for ${userId} are not valid JSON: ${cause instanceof Error ? cause.message : cause}`,
      );
    }
  }

  async putSettings(userId: string, settings: StoredSettings): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO settings (user_id, document, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET document = excluded.document, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(settings), new Date().toISOString());
  }

  async healthy(): Promise<boolean> {
    try {
      this.db.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
