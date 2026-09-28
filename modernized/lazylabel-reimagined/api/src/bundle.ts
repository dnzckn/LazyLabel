/**
 * The AI bundle, DEPLOYABILITY.md R12: the release zip with the AI tools in it, and its own Python.
 *
 * `scripts/build-release.mjs --ai` builds it and `scripts/pack_parts.py` splits it, because GitHub
 * takes no release file of 2 GiB and PyTorch's CUDA build alone is 2.9 GB. `bundle.json`, at the top
 * of the bundle's folder, names the parts, and each part's last entry leaves its mark,
 * `.lazylabel/part-<i>-of-<n>`. A person unzips part 1, which holds Node, the app and Python, and
 * starts it. The other parts are found where a download leaves them and unpacked by the bundle's
 * own Python into the same folder. Until every part is in, the app runs without AI and says which
 * files to put where.
 *
 * The decisions are here, as functions of what is on disk; `cli.ts` runs the unpacking.
 */

import * as path from "node:path";

export interface Bundle {
  /** The bundle's folder, where `bundle.json` is. */
  readonly root: string;
  /** Its parts' file names, part 1 first. One when it is a single zip. */
  readonly parts: readonly string[];
  /** Its own Python, with PyTorch, SAM 2 and the embedder installed in it. */
  readonly python: string;
  /** Its model folder, with the `manifest.json` the inference service reads. */
  readonly models: string;
}

/**
 * `bundle.json` in `root`, or null when there is none, which is every install but the AI bundle.
 * Throws when the file is there and is not one `pack_parts.py` wrote.
 */
export function readBundle(root: string, read: (file: string) => string | null): Bundle | null {
  const file = path.join(root, "bundle.json");
  const text = read(file);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const field = (name: string): unknown =>
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>)[name] : undefined;
  const parts = field("parts");
  const python = field("python");
  const models = field("models");
  if (!Array.isArray(parts) || parts.length === 0 || !parts.every(isZipName) || !isInside(python) || !isInside(models)) {
    throw new Error(`${file} is damaged`);
  }
  return { root, parts, python: path.join(root, ...python.split("/")), models: path.join(root, ...models.split("/")) };
}

/** A part's file name, with nothing in it that could reach another folder. */
function isZipName(value: unknown): value is string {
  return typeof value === "string" && /^[\w.-]+\.zip$/.test(value) && !value.startsWith(".");
}

/** A path relative to the bundle's folder that stays inside it. */
function isInside(value: unknown): value is string {
  return (
    typeof value === "string"
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.includes(":")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}

/** The mark a part's last entry leaves in the bundle's folder once the part is unpacked. */
export function partMark(bundle: Bundle, index: number): string {
  return path.join(bundle.root, ".lazylabel", `part-${index}-of-${bundle.parts.length}`);
}

/** The parts, numbered from 1, not unpacked into the bundle's folder yet. */
export function missingParts(bundle: Bundle, exists: (file: string) => boolean): number[] {
  return bundle.parts.map((_, index) => index + 1).filter((index) => !exists(partMark(bundle, index)));
}

/**
 * Where a part's zip may be, nearest first: the bundle's folder, the three above it, and Downloads.
 * A browser saves every part to one folder, and unzipping part 1 there leaves the bundle one folder
 * below it (the Finder, `unzip`) or two (Explorer's "Extract All", which adds a folder named after
 * the zip).
 */
export function partFolders(bundle: Bundle, home: string): string[] {
  const folders: string[] = [];
  let folder = bundle.root;
  for (let step = 0; step < 4; step += 1) {
    folders.push(folder);
    const parent = path.dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  folders.push(path.join(home, "Downloads"));
  return [...new Set(folders)];
}

/** Each missing part's zip, by part number, where it was found. A part found nowhere is left out. */
export function findParts(
  bundle: Bundle,
  missing: readonly number[],
  home: string,
  exists: (file: string) => boolean,
): Map<number, string> {
  const found = new Map<number, string>();
  for (const index of missing) {
    const name = bundle.parts[index - 1];
    if (name === undefined) continue;
    const folder = partFolders(bundle, home).find((candidate) => exists(path.join(candidate, name)));
    if (folder !== undefined) found.set(index, path.join(folder, name));
  }
  return found;
}

/** Why the AI tools are off while parts are missing: which files, and where they go. */
export function missingPartsReason(bundle: Bundle, missing: readonly number[]): string {
  const count = bundle.parts.length;
  const which = missing.length === 1 ? `part ${missing[0]} of ${count} is` : `parts ${listed(missing.map(String))} of ${count} are`;
  const files = listed(missing.map((index) => bundle.parts[index - 1] ?? `part ${index}`));
  return `${which} not unpacked yet: put ${files} in ${path.dirname(bundle.root)} and start LazyLabel again`;
}

function listed(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The bundle's Python, told to unpack `zips` into the bundle's folder.
 *
 * Each entry's first folder, the bundle's name, is dropped, and an entry that would land outside
 * the folder stops it. zipfile checks every file's CRC as it reads it. Each file is written beside
 * its place and then moved in, so a stop half-way leaves no half-written file; the part's mark is
 * its last entry, so a part stopped half-way reads as not unpacked and is unpacked again next time.
 */
export function unpackCommand(bundle: Bundle, zips: readonly string[]): { command: string; args: string[] } {
  return { command: bundle.python, args: ["-I", "-c", UNPACK, bundle.root, ...zips] };
}

const UNPACK = [
  "import os, shutil, sys, zipfile",
  "root = os.path.abspath(sys.argv[1])",
  "for part in sys.argv[2:]:",
  "    print(f'Unpacking {os.path.basename(part)}', flush=True)",
  "    with zipfile.ZipFile(part) as archive:",
  "        for entry in archive.infolist():",
  "            name = entry.filename.replace(chr(92), '/')",
  "            inner = name.partition('/')[2]",
  "            if not inner or name.endswith('/'):",
  "                continue",
  "            target = os.path.abspath(os.path.join(root, *inner.split('/')))",
  "            if os.path.commonpath([root, target]) != root:",
  "                sys.exit(f'{part} names {name}, which is outside {root}')",
  "            os.makedirs(os.path.dirname(target), exist_ok=True)",
  "            with archive.open(entry) as source, open(target + '.partial', 'wb') as out:",
  "                shutil.copyfileobj(source, out, 1 << 20)",
  "            os.replace(target + '.partial', target)",
  "            mode = (entry.external_attr >> 16) & 0o777",
  "            if mode and os.name != 'nt':",
  "                os.chmod(target, mode)",
].join("\n");
