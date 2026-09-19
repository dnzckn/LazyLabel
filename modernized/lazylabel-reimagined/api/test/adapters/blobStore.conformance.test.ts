/**
 * The blob store conformance suite: one set of tests, run against every adapter.
 *
 * This exists so a second adapter is a known quantity rather than a hope. When the S3 adapter is
 * written, it is added to the list below and these tests decide whether it conforms — including the
 * two properties `ports/blobStore.ts` says are the whole point of the port: an atomic write and a
 * revision that changes when the bytes change.
 *
 * Object storage will find the atomicity test hard, because it has no rename. That is the intended
 * outcome: better to fail here than to discover it from a user's half-written sidecar.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { InvalidKeyError, RevisionConflictError, type BlobStore } from "../../src/ports/blobStore.js";

interface Adapter {
  readonly name: string;
  create(): Promise<{ store: BlobStore; cleanup: () => Promise<void> }>;
}

const ADAPTERS: readonly Adapter[] = [
  {
    name: "MemoryBlobStore",
    async create() {
      return { store: new MemoryBlobStore(), cleanup: async () => {} };
    },
  },
  {
    name: "DirectoryBlobStore",
    async create() {
      const root = await mkdtemp(path.join(tmpdir(), "lazylabel-blob-"));
      return {
        store: new DirectoryBlobStore(root),
        cleanup: () => rm(root, { recursive: true, force: true }),
      };
    },
  },
];

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array | null): string | null =>
  data === null ? null : new TextDecoder().decode(data);

for (const adapter of ADAPTERS) {
  describe(`${adapter.name} conforms to the blob store port`, () => {
    let store: BlobStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      ({ store, cleanup } = await adapter.create());
    });
    afterEach(() => cleanup());

    it("reads back what it wrote", async () => {
      await store.writeAtomic("a/b/c.txt", bytes("hello"));
      expect(text(await store.read("a/b/c.txt"))).toBe("hello");
    });

    it("answers null for a key that does not exist, rather than throwing", async () => {
      expect(await store.read("nothing/here.txt")).toBeNull();
      expect(await store.stat("nothing/here.txt")).toBeNull();
    });

    it("reports a size and a revision", async () => {
      const stat = await store.writeAtomic("x.txt", bytes("12345"));
      expect(stat.size).toBe(5);
      expect(stat.revision).toBeTruthy();
      expect(await store.stat("x.txt")).toEqual(stat);
    });

    it("changes the revision when the bytes change", async () => {
      const first = await store.writeAtomic("x.txt", bytes("one"));
      const second = await store.writeAtomic("x.txt", bytes("two"));
      expect(second.revision).not.toBe(first.revision);
    });

    it("refuses a conditional write when the revision has moved", async () => {
      const first = await store.writeAtomic("x.txt", bytes("one"));
      await store.writeAtomic("x.txt", bytes("two")); // somebody else

      await expect(store.writeAtomic("x.txt", bytes("three"), first.revision)).rejects.toBeInstanceOf(
        RevisionConflictError,
      );
      // And the refusal wrote nothing: the other writer's content is intact.
      expect(text(await store.read("x.txt"))).toBe("two");
    });

    it("honours a conditional write that expects the key to be absent", async () => {
      await store.writeAtomic("fresh.txt", bytes("first"), null);
      await expect(store.writeAtomic("fresh.txt", bytes("again"), null)).rejects.toBeInstanceOf(
        RevisionConflictError,
      );
      expect(text(await store.read("fresh.txt"))).toBe("first");
    });

    it("overwrites an existing key when no revision is named", async () => {
      await store.writeAtomic("x.txt", bytes("one"));
      await store.writeAtomic("x.txt", bytes("two"));
      expect(text(await store.read("x.txt"))).toBe("two");
    });

    it("lists the keys directly under a prefix, and not those deeper", async () => {
      await store.writeAtomic("frames/a.png", bytes("a"));
      await store.writeAtomic("frames/b.png", bytes("b"));
      await store.writeAtomic("frames/nested/c.png", bytes("c"));

      expect([...(await store.list("frames"))].sort()).toEqual(["frames/a.png", "frames/b.png"]);
    });

    it("treats removing a missing key as success", async () => {
      await expect(store.remove("never/existed.txt")).resolves.toBeUndefined();
    });

    it("refuses keys that walk out of the store", async () => {
      for (const key of ["../escape.txt", "a/../../escape.txt", "/etc/passwd", "a\\b.txt"]) {
        await expect(store.read(key), key).rejects.toBeInstanceOf(InvalidKeyError);
      }
    });

    it("keeps the previous bytes when a write is refused", async () => {
      await store.writeAtomic("x.txt", bytes("original"));
      await expect(store.writeAtomic("x.txt", bytes("replacement"), "a-revision-that-is-not-current"))
        .rejects.toBeInstanceOf(RevisionConflictError);
      expect(text(await store.read("x.txt"))).toBe("original");
    });
  });
}
