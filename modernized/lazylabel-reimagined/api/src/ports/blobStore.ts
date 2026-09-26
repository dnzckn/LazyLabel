/**
 * Where images and their annotation sidecars live.
 *
 * Decision 5, as the owner refined it on 2026-09-18: the mounted dataset directory is the default
 * and the only adapter built, and this port is what lets a hosted deployment point at object
 * storage instead without a redesign. `REIMAGINED_ARCHITECTURE.md` section 3.1.
 *
 * Two properties are the port's whole point, and an adapter that cannot provide them is not a
 * conforming adapter:
 *
 * 1. `writeAtomic` must be all-or-nothing. A reader must never observe a half-written sidecar, and
 *    a failed write must leave the previous content intact. The directory adapter gets this from
 *    write-to-temp-then-rename. Object storage has no rename, so an S3 adapter must reach it by a
 *    conditional put on the object version; section 3.1 records that as a known cost of that
 *    adapter rather than a surprise inside it.
 *
 * 2. `revision` must change whenever the bytes change. It is what makes the PUT contract's 409
 *    ("the file changed on disk since it was read; nothing was written") implementable. An adapter
 *    may use an ETag, a version id, or size and mtime; callers treat it as opaque.
 *
 * The port moves bytes and never interprets them. Deciding what a sidecar CONTAINS belongs to the
 * format library, which is the brief's first binding design rule.
 */

export interface BlobStat {
  readonly size: number;
  /** Opaque token that changes whenever the bytes change. Never parsed by callers. */
  readonly revision: string;
  /**
   * When the bytes were last written, as epoch milliseconds, or null when the store cannot say.
   *
   * NULLABLE because not every store has one. A directory does; an object store usually does; a
   * store that keeps blobs in memory has no more than the moment it was handed them. A caller that
   * sorts by it has to cope with its absence, which is better than inventing `0` and putting every
   * file of an unknown age at the top of the list.
   */
  readonly modified: number | null;
}

export interface BlobStore {
  /** The bytes, or null when the key does not exist. Never throws for absence alone. */
  read(key: string): Promise<Uint8Array | null>;

  /** Size and revision, or null when the key does not exist. */
  stat(key: string): Promise<BlobStat | null>;

  /** Keys directly under `prefix`, not recursive, in no guaranteed order. */
  list(prefix: string): Promise<readonly string[]>;

  /**
   * Folder names directly under `prefix`, not recursive, in no guaranteed order.
   *
   * Separate from {@link list}, which returns FILES, because the two answer different questions
   * and a caller almost always wants one or the other. RULE-051 makes the listing non-recursive,
   * so without this a dataset organised into subfolders -- which is the ordinary layout -- has no
   * way to be walked at all: the root lists nothing and nothing names what is below it.
   *
   * Names, not keys: "frames", not "frames/". The caller joins them.
   */
  listFolders(prefix: string): Promise<readonly string[]>;

  /**
   * Replace the key's content atomically, returning the new revision.
   *
   * `expectedRevision` makes the write conditional: pass the revision the caller last read to have
   * the write refused with {@link RevisionConflictError} if anything changed since, or null to
   * require that the key does not yet exist. Omit it only when the caller genuinely does not care
   * what it overwrites.
   */
  writeAtomic(
    key: string,
    bytes: Uint8Array,
    expectedRevision?: string | null,
  ): Promise<BlobStat>;

  /**
   * Delete the key. Missing is not an error.
   *
   * One annotation path calls this: deleting an image's seven sidecars, legacy's
   * `delete_all_outputs`, which the app does where legacy's save finds no segments (the owner's
   * decision of 2026-09-26; `annotations/service.ts`). A WRITE still never deletes: a stale sidecar
   * in a format the user did not select is reported, not removed (decision 15f).
   */
  remove(key: string): Promise<void>;
}

/** The stored bytes are not at the revision the caller expected, so nothing was written. */
export class RevisionConflictError extends Error {
  constructor(
    readonly key: string,
    readonly expected: string | null,
    readonly actual: string | null,
  ) {
    super(
      `${key} changed since it was read (expected ${expected ?? "it to be absent"}, found ${actual ?? "it absent"}); nothing was written`,
    );
    this.name = "RevisionConflictError";
  }
}

/** The key is not one this store will accept: traversal, absolute, or reserved. */
export class InvalidKeyError extends Error {
  constructor(
    readonly key: string,
    reason: string,
  ) {
    super(`refusing the path ${JSON.stringify(key)}: ${reason}`);
    this.name = "InvalidKeyError";
  }
}
