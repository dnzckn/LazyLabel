/**
 * The blob store of whichever folder of images is open: a directory adapter for that folder, replaced
 * when the app opens another, and none at all until one is.
 *
 * The owner's request of 2026-09-29, "in the gui the user should be able to select a folder to load",
 * as legacy's Open Image Folder does (right_panel.py:112-114; main_window.py:1431-1438). The folder was
 * fixed at startup until then, and the directory adapter was built once for it (`main.ts`).
 *
 * WITH NO FOLDER OPEN, a listing is empty and a read finds nothing, as in an empty folder; /health
 * says "none" rather than "ok" (`app.ts`), so the app offers Open Image Folder rather than an empty
 * list that reads as "you have no images". A write has nowhere to go, and is refused.
 *
 * A call works on the folder that was open when it began. A save is several calls, one per file, and
 * the app finishes its save of the image it is leaving before it asks for another folder, taking no
 * input meanwhile, so its own saves and switches do not overlap (`web/src/shell/App.tsx`).
 */

import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { DirectoryBlobStore } from "./directoryBlobStore.js";
import type { BlobStat, BlobStore } from "../ports/blobStore.js";

/** A write, or a delete, with no folder open. The API answers 409 (`app.ts`). */
export class NoFolderOpenError extends Error {
  constructor() {
    super("no folder of images is open");
    this.name = "NoFolderOpenError";
  }
}

/** The folder asked for is not one that can be opened, and why, in a few words. The API answers 400. */
export class FolderUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolderUnreadableError";
  }
}

export class FolderBlobStore implements BlobStore {
  private current: { readonly root: string; readonly store: BlobStore } | null = null;

  /**
   * @param root The folder open at start, an absolute path, or null for none.
   * @param storeFor The store for an open folder: the directory adapter, which a test replaces with
   *   one whose revisions it controls.
   */
  constructor(
    root: string | null,
    private readonly storeFor: (root: string) => BlobStore = (folder) => new DirectoryBlobStore(folder),
  ) {
    if (root !== null) this.current = { root, store: storeFor(root) };
  }

  /** The folder open now, or null. */
  get root(): string | null {
    return this.current?.root ?? null;
  }

  /**
   * Open `folder` from the next call on, once it is found to be an absolute path to a folder this
   * process can read. Returns it resolved, which is the name the API reports it by.
   */
  async open(folder: string): Promise<string> {
    if (!path.isAbsolute(folder)) throw new FolderUnreadableError(`${folder} is not a full path to a folder`);
    const root = path.resolve(folder);
    let isFolder: boolean;
    try {
      isFolder = (await fs.stat(root)).isDirectory();
    } catch {
      throw new FolderUnreadableError(`there is no folder at ${root}`);
    }
    if (!isFolder) throw new FolderUnreadableError(`${root} is a file, not a folder`);
    try {
      await fs.access(root, fsConstants.R_OK);
    } catch {
      throw new FolderUnreadableError(`${root} cannot be read`);
    }
    this.current = { root, store: this.storeFor(root) };
    return root;
  }

  async read(key: string): Promise<Uint8Array | null> {
    return this.current === null ? null : this.current.store.read(key);
  }

  async stat(key: string): Promise<BlobStat | null> {
    return this.current === null ? null : this.current.store.stat(key);
  }

  async list(prefix: string): Promise<readonly string[]> {
    return this.current === null ? [] : this.current.store.list(prefix);
  }

  async listFolders(prefix: string): Promise<readonly string[]> {
    return this.current === null ? [] : this.current.store.listFolders(prefix);
  }

  async writeAtomic(key: string, bytes: Uint8Array, expectedRevision?: string | null): Promise<BlobStat> {
    if (this.current === null) throw new NoFolderOpenError();
    return this.current.store.writeAtomic(key, bytes, expectedRevision);
  }

  async remove(key: string): Promise<void> {
    if (this.current === null) throw new NoFolderOpenError();
    return this.current.store.remove(key);
  }

  /** True when a folder is open and still a readable folder. Drives the health endpoint. */
  async healthy(): Promise<boolean> {
    if (this.current === null) return false;
    try {
      await fs.access(this.current.root, fsConstants.R_OK);
      return (await fs.stat(this.current.root)).isDirectory();
    } catch {
      return false;
    }
  }
}
