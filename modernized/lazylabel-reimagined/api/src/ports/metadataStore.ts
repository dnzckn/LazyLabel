/**
 * Everything that is not a file in the user's folder.
 *
 * Settings, hotkeys, projects, sequences, job records and the dataset index: a few thousand rows
 * for one user (decision 3), which is why the default adapter is a SQLite file rather than a
 * database server. A hosted deployment with PostgreSQL nearby points this port at it instead
 * (`REIMAGINED_ARCHITECTURE.md` section 3.1).
 *
 * What this port must never hold is annotations. The architecture review's central finding was that
 * a segment table beside the file chain creates two sources of truth for the same data; decision 5
 * settles that the sidecars are the source of truth on every adapter. If a future change wants to
 * cache segments here for a dataset-wide query, it is a cache with an invalidation story, and it
 * says so in its own name.
 *
 * Only the settings slice is defined in this scaffold. Projects, sequences and job records arrive
 * with the phases that build them (P4 and P6), and `capabilities.ts` records which.
 */

import type { StoredSettings } from "@lazylabel/settings-schema";

export interface MetadataStore {
  /** The user's settings, or null when they have never been saved. */
  getSettings(userId: string): Promise<StoredSettings | null>;

  /** Replace the user's settings wholesale. Unknown keys inside are preserved, never reset. */
  putSettings(userId: string, settings: StoredSettings): Promise<void>;

  /** True when the store is reachable. Drives the health endpoint's degraded state. */
  healthy(): Promise<boolean>;

  close(): Promise<void>;
}
