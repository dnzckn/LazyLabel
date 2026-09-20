/**
 * An in-memory blob store, for tests that are about something other than the filesystem.
 *
 * It is also the conformance target: anything the port promises, this implements the simple way, so
 * a test can be written against it and then run against `DirectoryBlobStore` unchanged. That is how
 * an S3 adapter should arrive too — the shared conformance suite in `test/adapters/` first.
 *
 * Not a cache and not a fixture loader: it holds exactly what was written to it.
 */

import { createHash } from "node:crypto";

import {
  InvalidKeyError,
  RevisionConflictError,
  type BlobStat,
  type BlobStore,
} from "../ports/blobStore.js";

export class MemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();
  private sequence = 0;
  private readonly revisions = new Map<string, string>();

  constructor(initial: Readonly<Record<string, Uint8Array | string>> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.put(key, typeof value === "string" ? new TextEncoder().encode(value) : value);
    }
  }

  async read(key: string): Promise<Uint8Array | null> {
    check(key);
    const found = this.blobs.get(key);
    return found === undefined ? null : Uint8Array.from(found);
  }

  async stat(key: string): Promise<BlobStat | null> {
    check(key);
    const found = this.blobs.get(key);
    if (found === undefined) return null;
    return { size: found.length, revision: this.revisions.get(key)! };
  }

  async list(prefix: string): Promise<readonly string[]> {
    const base = prefix === "" || prefix === "." ? "" : `${prefix.replace(/\/+$/, "")}/`;
    return [...this.blobs.keys()].filter(
      (key) => key.startsWith(base) && !key.slice(base.length).includes("/"),
    );
  }

  async listFolders(prefix: string): Promise<readonly string[]> {
    const base = prefix === "" ? "" : `${prefix.replace(/\/+$/, "")}/`;
    const folders = new Set<string>();
    for (const key of this.blobs.keys()) {
      if (!key.startsWith(base)) continue;
      const rest = key.slice(base.length);
      const slash = rest.indexOf("/");
      // A key with a slash left in it sits in a subfolder, and its first segment names it.
      if (slash > 0) folders.add(rest.slice(0, slash));
    }
    return [...folders];
  }

  async writeAtomic(
    key: string,
    bytes: Uint8Array,
    expectedRevision?: string | null,
  ): Promise<BlobStat> {
    check(key);
    if (expectedRevision !== undefined) {
      const actual = this.revisions.get(key) ?? null;
      if (actual !== expectedRevision) throw new RevisionConflictError(key, expectedRevision, actual);
    }
    return this.put(key, bytes);
  }

  async remove(key: string): Promise<void> {
    check(key);
    this.blobs.delete(key);
    this.revisions.delete(key);
  }

  async healthy(): Promise<boolean> {
    return true;
  }

  /** Every key currently held, for assertions about what a save did and did not write. */
  keys(): readonly string[] {
    return [...this.blobs.keys()].sort();
  }

  private put(key: string, bytes: Uint8Array): BlobStat {
    const stored = Uint8Array.from(bytes);
    this.blobs.set(key, stored);
    // A counter, not a content hash: writing the same bytes twice is still a new revision, which is
    // what the filesystem adapter does and what a conditional write has to agree with.
    this.sequence += 1;
    const revision = createHash("sha256").update(`${key}:${this.sequence}`).digest("base64url").slice(0, 22);
    this.revisions.set(key, revision);
    return { size: stored.length, revision };
  }
}

/** The same key rules the directory adapter enforces, so tests cannot pass on paths it would refuse. */
function check(key: string): void {
  if (key === "" || key.includes("\0") || key.includes("\\")) {
    throw new InvalidKeyError(key, "empty, or it contains a NUL byte or a backslash");
  }
  const segments = key.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new InvalidKeyError(key, "it walks the directory tree or has an empty segment");
  }
}
