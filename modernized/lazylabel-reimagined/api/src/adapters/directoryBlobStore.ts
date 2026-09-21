/**
 * The default blob store: a mounted directory of the user's images and their sidecars.
 *
 * Decision 5. This is the adapter that makes the promise the desktop app kept and a database-backed
 * design silently gives up: the annotations are files in the user's folder, which they can copy,
 * diff and back up without this system.
 *
 * Atomicity comes from writing a temporary file in the SAME directory and renaming it over the
 * target. Same directory matters: a rename across filesystems is a copy, which is not atomic, and
 * the dataset folder is exactly the kind of path that is a network mount. `fs.rename` replaces an
 * existing target on both POSIX and Windows, so a reader sees either the old bytes or the new ones.
 */

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  InvalidKeyError,
  RevisionConflictError,
  type BlobStat,
  type BlobStore,
} from "../ports/blobStore.js";

/**
 * Windows device names. Opening one of these by name talks to a device, not a file, and the name is
 * reserved with ANY extension, so "CON.txt" is still the console. An image named `con.png` would
 * otherwise make the API write a sidecar to the console device.
 */
const WINDOWS_RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

export class DirectoryBlobStore implements BlobStore {
  /** @param root Absolute path of the mounted dataset directory. */
  constructor(private readonly root: string) {
    if (!path.isAbsolute(root)) {
      throw new TypeError(`the dataset root must be an absolute path, got ${JSON.stringify(root)}`);
    }
  }

  async read(key: string): Promise<Uint8Array | null> {
    const full = this.resolve(key);
    if (!(await isPlainFile(full))) return null;
    try {
      return new Uint8Array(await fs.readFile(full));
    } catch (cause) {
      if (isMissing(cause)) return null;
      throw cause;
    }
  }

  async stat(key: string): Promise<BlobStat | null> {
    const full = this.resolve(key);
    try {
      // lstat, not stat: stat follows a symbolic link and would describe its target.
      const info = await fs.lstat(full);
      if (info.isSymbolicLink()) throw new InvalidKeyError(key, "it is a symbolic link");
      if (!info.isFile()) return null;
      return {
        size: info.size,
        revision: revisionOf(info.size, info.mtimeMs, info.ino),
        modified: info.mtimeMs,
      };
    } catch (cause) {
      if (cause instanceof InvalidKeyError) throw cause;
      if (isMissing(cause)) return null;
      throw cause;
    }
  }

  async list(prefix: string): Promise<readonly string[]> {
    const full = this.resolve(prefix === "" ? "." : prefix);
    let entries;
    try {
      entries = await fs.readdir(full, { withFileTypes: true });
    } catch (cause) {
      if (isMissing(cause)) return [];
      throw cause;
    }
    const base = prefix === "" || prefix === "." ? "" : `${prefix.replace(/\/+$/, "")}/`;
    // `withFileTypes` reports link entries as links rather than as the files they point at, so a
    // symbolic link is simply not listed: it is not offered, and it could not be read if it were.
    return entries.filter((entry) => entry.isFile()).map((entry) => `${base}${entry.name}`);
  }

  async listFolders(prefix: string): Promise<readonly string[]> {
    const full = this.resolve(prefix === "" ? "." : prefix);
    let entries;
    try {
      entries = await fs.readdir(full, { withFileTypes: true });
    } catch (cause) {
      if (isMissing(cause)) return [];
      throw cause;
    }
    return entries
      .filter((entry) => entry.isDirectory())
      // The app's own store lives here and is not a folder of images. Hiding it is not cosmetic:
      // offering it invites a user to open it and find nothing, every time they browse a dataset.
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => entry.name);
  }

  async writeAtomic(
    key: string,
    bytes: Uint8Array,
    expectedRevision?: string | null,
  ): Promise<BlobStat> {
    const full = this.resolve(key);

    if (expectedRevision !== undefined) {
      const current = await this.stat(key);
      const actual = current?.revision ?? null;
      if (actual !== expectedRevision) {
        throw new RevisionConflictError(key, expectedRevision, actual);
      }
    }

    // SEC-09. A symbolic link left beside an image would otherwise make the rename write
    // wherever it points, and the rename does not care that the target is outside the dataset.
    if (await isSymlink(full)) throw new InvalidKeyError(key, "it is a symbolic link");
    await fs.mkdir(path.dirname(full), { recursive: true });

    // The temporary name carries a random component so two concurrent writers cannot collide on it,
    // and lives beside the target so the rename stays within one filesystem.
    const temporary = `${full}.${randomSuffix()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporary, "wx", 0o600);
      await handle.writeFile(bytes);
      // Without the flush the rename can land before the data does, so a crash between the two
      // leaves a correctly named, empty sidecar: the shape of loss decision 7 exists to prevent.
      await handle.sync();
    } catch (cause) {
      await handle?.close().catch(() => {});
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw cause;
    }
    await handle.close();

    try {
      await fs.rename(temporary, full);
    } catch (cause) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw cause;
    }

    const written = await this.stat(key);
    if (written === null) throw new Error(`${key} vanished immediately after being written`);
    return written;
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  /** True when the root exists and is a readable directory. Drives the health endpoint. */
  async healthy(): Promise<boolean> {
    try {
      await fs.access(this.root, fsConstants.R_OK);
      return (await fs.stat(this.root)).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Turn a store key into an absolute path, refusing anything that escapes the root.
   *
   * Keys are relative POSIX-style paths. Everything else is refused rather than normalized: a
   * request that asks for `../../etc/passwd` is not a request with a typo, and answering it with a
   * best-effort interpretation is how traversal bugs get written.
   */
  private resolve(key: string): string {
    if (key === "" || key === ".") return this.root;
    if (key.includes("\0")) throw new InvalidKeyError(key, "it contains a NUL byte");
    if (key.includes("\\")) throw new InvalidKeyError(key, "use / as the separator, not a backslash");
    if (path.isAbsolute(key) || /^[a-zA-Z]:/.test(key)) {
      throw new InvalidKeyError(key, "it is absolute; keys are relative to the dataset root");
    }

    const segments = key.split("/").filter((segment) => segment !== "");
    for (const segment of segments) {
      if (segment === "." || segment === "..") {
        throw new InvalidKeyError(key, "it walks the directory tree");
      }
      // A trailing dot or space is stripped by the Win32 layer, so "foo.txt." and "foo.txt" open the
      // same file while comparing as different keys. That mismatch is enough to defeat a revision
      // check, so the names are refused rather than silently folded together.
      if (/[ .]$/.test(segment)) {
        throw new InvalidKeyError(key, "a path segment ends with a dot or a space");
      }
      if (segment.includes(":")) {
        throw new InvalidKeyError(key, "a path segment contains a colon");
      }
      const stem = segment.split(".")[0]!.toLowerCase();
      if (WINDOWS_RESERVED.has(stem)) {
        throw new InvalidKeyError(key, `${stem} is a reserved device name`);
      }
    }

    const full = path.resolve(this.root, ...segments);
    // Belt and braces: the checks above should make this unreachable, but a symlink inside the root
    // can still point outside it, and the cost of being wrong here is reading the user's whole disk.
    const relative = path.relative(this.root, full);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new InvalidKeyError(key, "it resolves outside the dataset root");
    }
    return full;
  }
}

/**
 * Whether the path is a symbolic link — SEC-09.
 *
 * `lstat` rather than `stat`, because `stat` follows the link and would describe its target. A link
 * that points nowhere is still a link, and is still refused.
 */
async function isSymlink(full: string): Promise<boolean> {
  try {
    return (await fs.lstat(full)).isSymbolicLink();
  } catch (cause) {
    if (isMissing(cause)) return false; // nothing there at all: a fresh write, which is fine
    throw cause;
  }
}

/** A real file, not a link, a directory or a device. */
async function isPlainFile(full: string): Promise<boolean> {
  try {
    return (await fs.lstat(full)).isFile();
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

function isMissing(cause: unknown): boolean {
  const code = (cause as { code?: string } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function randomSuffix(): string {
  return createHash("sha256")
    .update(`${process.pid}:${process.hrtime.bigint()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * An opaque token that changes when the bytes change.
 *
 * Size, mtime and inode together, hashed so callers cannot be tempted to parse it. mtime alone is
 * too coarse: a filesystem with one-second timestamps would call two writes in the same second
 * identical, and losing a concurrent edit is exactly what the revision check exists to prevent.
 */
function revisionOf(size: number, mtimeMs: number, inode: number | bigint): string {
  return createHash("sha256")
    .update(`${size}:${mtimeMs}:${inode}`)
    .digest("base64url")
    .slice(0, 22);
}
