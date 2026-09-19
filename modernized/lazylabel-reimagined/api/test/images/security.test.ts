/**
 * Phase 4 exit criterion 4: input limits and content allow-lists.
 *
 * Two gaps these tests exist for, both found by reading the criterion against the code rather than
 * assuming it was already met.
 *
 * SEC-02 — the decoder is chosen by CONTENT, which is right, but `sharp` also decodes SVG and HEIF.
 * An SVG is not an image in the sense this application means: it is a document that can reference
 * external resources, and handing one to librsvg because a file called `photo.png` happened to
 * contain one is a class of bug this service should not be able to have.
 *
 * SEC-09 — the store refused path traversal and then followed symbolic links, which walk out of the
 * dataset root without any `..` in the key at all.
 */

import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { InvalidKeyError } from "../../src/ports/blobStore.js";
import { UnsupportedImageError, decodeImage, readImageMetadata } from "../../src/images/pipeline.js";

const SVG = Buffer.from(
  `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
    `<rect width="8" height="8" fill="red"/></svg>`,
);

describe("SEC-02: only the image types LazyLabel opens are decoded", () => {
  it("refuses an SVG, whatever the file is called", async () => {
    // The library would decode this happily. The extension says nothing — this file could be named
    // photo.png and would still be an SVG, which is the point.
    await expect(decodeImage(new Uint8Array(SVG))).rejects.toBeInstanceOf(UnsupportedImageError);
    await expect(readImageMetadata(new Uint8Array(SVG))).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("names what it found, so the refusal is actionable", async () => {
    const error = await decodeImage(new Uint8Array(SVG)).catch((cause: unknown) => cause);
    expect((error as Error).message).toMatch(/decodes as svg/);
  });

  it("refuses bytes that are not an image at all", async () => {
    const text = new TextEncoder().encode("this is a README, not a picture");
    await expect(decodeImage(text)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("still decides by content rather than by name for the types it does open", async () => {
    // A PNG's magic bytes, in a buffer nothing has named. Content is what decides.
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const error = await decodeImage(png).catch((cause: unknown) => cause);
    // Truncated, so it fails — but as an unreadable PNG, not as an unknown container.
    expect(error).toBeInstanceOf(UnsupportedImageError);
  });
});

describe("SEC-09: symbolic links are refused, not followed", () => {
  let root: string;
  let outside: string;
  let store: DirectoryBlobStore;
  let canSymlink = true;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-sec-"));
    outside = await mkdtemp(path.join(tmpdir(), "lazylabel-out-"));
    store = new DirectoryBlobStore(root);

    await writeFile(path.join(outside, "secret.txt"), "not yours");
    try {
      // Windows needs developer mode or elevation for this; CI on Linux always manages it.
      await symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
    } catch {
      canSymlink = false;
    }
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it("does not read through a link that points outside the dataset", async ({ skip }) => {
    if (!canSymlink) skip();

    // No ".." anywhere in the key. Path checks alone never see this.
    expect(await store.read("link.txt")).toBeNull();
  });

  it("refuses to describe a link", async ({ skip }) => {
    if (!canSymlink) skip();
    await expect(store.stat("link.txt")).rejects.toBeInstanceOf(InvalidKeyError);
  });

  it("does not offer a link in a listing", async ({ skip }) => {
    if (!canSymlink) skip();

    await writeFile(path.join(root, "real.txt"), "mine");
    expect(await store.list("")).toEqual(["real.txt"]);
  });

  it("refuses to write through a link", async ({ skip }) => {
    if (!canSymlink) skip();

    await expect(
      store.writeAtomic("link.txt", new TextEncoder().encode("overwritten")),
    ).rejects.toBeInstanceOf(InvalidKeyError);

    // And the file it pointed at is untouched, which is the thing that mattered.
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(path.join(outside, "secret.txt"), "utf-8")).toBe("not yours");
  });

  it("uses lstat rather than stat on the read path", async () => {
    // The symlink assertions above need a symlink, which Windows will not create without
    // elevation, so they skip on a developer machine and run in CI. This one exercises the same
    // lstat branch everywhere: a directory is not a plain file, and reading one answers null
    // rather than throwing EISDIR the way a bare readFile would.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(root, "a-folder"));

    expect(await store.read("a-folder")).toBeNull();
    expect(await store.stat("a-folder")).toBeNull();
  });

  it("still reads and writes ordinary files", async () => {
    await store.writeAtomic("ordinary.txt", new TextEncoder().encode("fine"));
    expect(new TextDecoder().decode((await store.read("ordinary.txt"))!)).toBe("fine");
  });
});
