/**
 * What the directory adapter must get right beyond the shared conformance suite.
 *
 * Mostly path refusal. The dataset root is a folder on the user's machine, and the key comes from a
 * URL, so every one of these is the difference between serving an image and serving the user's
 * private keys.
 */

import { mkdtemp, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { InvalidKeyError } from "../../src/ports/blobStore.js";

describe("DirectoryBlobStore", () => {
  let root: string;
  let store: DirectoryBlobStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-dir-"));
    store = new DirectoryBlobStore(root);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it("insists on an absolute root", () => {
    expect(() => new DirectoryBlobStore("relative/path")).toThrow(TypeError);
  });

  describe("refuses paths that are not simply inside the root", () => {
    const refused: [string, string][] = [
      ["../outside.txt", "the obvious traversal"],
      ["frames/../../outside.txt", "traversal after a real segment"],
      ["./frames/a.png", "a dot segment"],
      ["/absolute.txt", "an absolute POSIX path"],
      ["C:/Windows/System32/config/SAM", "a Windows drive path"],
      ["frames\\a.png", "a backslash separator"],
      ["frames/a\u0000.png", "an embedded NUL"],
      ["frames/con.png", "a Windows device name"],
      ["frames/NUL", "a device name with no extension"],
      ["frames/a.png.", "a trailing dot, which Win32 strips"],
      ["frames/a.png ", "a trailing space, which Win32 strips"],
      ["frames/a.png:stream", "an NTFS alternate data stream"],
    ];

    for (const [key, why] of refused) {
      it(`${why}: ${JSON.stringify(key)}`, async () => {
        await expect(store.read(key)).rejects.toBeInstanceOf(InvalidKeyError);
        await expect(store.stat(key)).rejects.toBeInstanceOf(InvalidKeyError);
        await expect(store.writeAtomic(key, new Uint8Array([1]))).rejects.toBeInstanceOf(InvalidKeyError);
      });
    }
  });

  it("accepts ordinary nested dataset paths", async () => {
    await store.writeAtomic("sequences/run_4/frame_012.png", new Uint8Array([1, 2, 3]));
    expect(await store.read("sequences/run_4/frame_012.png")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("accepts a name that merely starts with a device name", async () => {
    // "console.png" is not "con". Over-refusing would reject real files.
    await store.writeAtomic("console.png", new Uint8Array([7]));
    expect(await store.read("console.png")).toEqual(new Uint8Array([7]));
  });

  it("leaves no temporary file behind after a successful write", async () => {
    await store.writeAtomic("frames/a.txt", new TextEncoder().encode("content"));
    const entries = await readdir(path.join(root, "frames"));
    expect(entries).toEqual(["a.txt"]);
  });

  it("leaves no temporary file behind, and no damage, when a write is refused", async () => {
    await store.writeAtomic("frames/a.txt", new TextEncoder().encode("original"));
    await expect(
      store.writeAtomic("frames/a.txt", new TextEncoder().encode("replacement"), "stale-revision"),
    ).rejects.toThrow();

    // A conditional write that loses must not leave a .tmp next to the file the user can see.
    expect(await readdir(path.join(root, "frames"))).toEqual(["a.txt"]);
    expect(new TextDecoder().decode((await store.read("frames/a.txt"))!)).toBe("original");
  });

  it("creates intermediate directories on write", async () => {
    await store.writeAtomic("a/deeply/nested/file.txt", new Uint8Array([1]));
    expect(await store.read("a/deeply/nested/file.txt")).toEqual(new Uint8Array([1]));
  });

  it("lists only files, not subdirectories", async () => {
    await mkdir(path.join(root, "frames", "sub"), { recursive: true });
    await writeFile(path.join(root, "frames", "a.png"), "a");

    expect(await store.list("frames")).toEqual(["frames/a.png"]);
  });

  it("reports an empty listing for a folder that is not there", async () => {
    expect(await store.list("no/such/folder")).toEqual([]);
  });

  it("reports health from whether the root is a readable directory", async () => {
    expect(await store.healthy()).toBe(true);
    expect(await new DirectoryBlobStore(path.join(root, "missing")).healthy()).toBe(false);
  });

  it("gives two files with the same content different revisions", async () => {
    const first = await store.writeAtomic("a.txt", new TextEncoder().encode("same"));
    const second = await store.writeAtomic("b.txt", new TextEncoder().encode("same"));
    expect(first.revision).not.toBe(second.revision);
  });
});
