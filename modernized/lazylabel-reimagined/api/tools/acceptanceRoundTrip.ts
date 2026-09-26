/**
 * Phase 6's fourth exit criterion, as a command you can run against your own datasets.
 *
 * "Every dataset in the acceptance corpus imports and re-exports identically, pickled NPZ files
 * included, via the converter." The corpus is the owner's — real folders of real annotations, of
 * the kinds this tool is actually used on — and no synthetic fixture substitutes for it. What can
 * exist before the corpus does is the harness, so the criterion is one command rather than a
 * research task. Since the owner's decision of 2026-09-25 the pickled NPZ files need no converter:
 * the stack reads the desktop app's pickled class names as data, so they are read as they are.
 *
 *     npm run acceptance -- /path/to/corpus
 *
 * WHAT IT PROVES, AND WHAT IT CANNOT. It reads every annotation file the way the app does, rebuilds
 * the export context from what it read, writes every format the file's own set contained, and
 * compares the new bytes with the old. Identical means the rewrite round-trips that dataset. It
 * does NOT prove the rewrite reads the file the same way legacy does — that is Phase 1's golden
 * suite, against files legacy itself wrote — and a dataset that fails here has found a defect in
 * the round trip rather than in the reader alone.
 *
 * NOTHING IS WRITTEN INTO THE CORPUS. Every write goes to a scratch copy of the folder, so a run
 * against a real dataset cannot damage it. That is not caution for its own sake: this tool exists
 * to be pointed at the annotations somebody cares most about.
 *
 * DECISION 10's EOL NORMALIZATION APPLIES. The text formats are compared after normalising line
 * endings, because a file written on Windows and one written on Linux differ by bytes that mean
 * nothing — the same normalisation Phase 1's goldens use.
 *
 * THE NPZ FORMATS ARE COMPARED ARRAY BY ARRAY, every member's dtype, shape and values, and the
 * class names by value. Byte equality was never the claim: both archives carry legacy's pickled
 * `class_aliases` table, but NumPy pickles it as protocol 4 and the port as protocol 2, so the two
 * zips differ even when every array and every name in them is the same. An archive the port wrote
 * before 2026-09-25 carries the names as JSON in `class_aliases_json` instead, and its names are
 * compared the same way. Phase 1's NPZ goldens are held to legacy the same way.
 *
 * LEGACY'S OWN FILES DO NOT SURVIVE LEGACY'S OWN ROUND TRIP, found 2026-09-25 on the synthetic
 * corpus. The NPZ holds one mask per CLASS, so opening an image merges every instance of a class,
 * and the instance formats written after that -- YOLO, COCO, Pascal VOC, CreateML -- list one entry
 * per class region, in class order, where the file had one per drawn shape. Comparing the port's
 * rewrite with the original therefore fails wherever an image has more than one shape, for legacy
 * too. `--oracle <folder>` compares with what LEGACY writes when it opens and saves the same image
 * instead (tools/generate_acceptance_corpus.py writes one), which is the claim that matters: the web
 * app does to a dataset exactly what the desktop app does.
 *
 *     npm run acceptance -- /path/to/corpus --oracle /path/to/legacy-resaves
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  createFinalMaskTensor,
  createInstanceContours,
  readLegacyAliasNpy,
  readZip,
  type ExportContext,
} from "@lazylabel/annotation-formats";

import { readAnnotations, writeAnnotations } from "../src/annotations/service.js";
import { DirectoryBlobStore } from "../src/adapters/directoryBlobStore.js";
import { listDataset } from "../src/dataset/listing.js";
import { decodeImage } from "../src/images/pipeline.js";

/** Binary formats are compared byte for byte; text ones after decision 10's EOL normalisation. */
const TEXT_FORMATS = new Set(["YOLO_DETECTION", "YOLO_SEGMENTATION", "COCO_JSON", "PASCAL_VOC", "CREATEML"]);

export interface ImageOutcome {
  readonly key: string;
  readonly status: "identical" | "differs" | "unreadable" | "skipped" | "names-unread";
  readonly detail: string;
  /** Which formats were compared, and which of them differed. */
  readonly formats: readonly string[];
  readonly differing: readonly string[];
}

export interface DatasetOutcome {
  readonly folder: string;
  readonly images: readonly ImageOutcome[];
}

/** Line endings normalised, so a file written on Windows matches the same file written on Linux. */
export function normalizeEol(bytes: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(bytes).replace(/\r\n/g, "\n");
  return new TextEncoder().encode(text);
}

export function sameBytes(format: string, before: Uint8Array, after: Uint8Array): boolean {
  const [a, b] = TEXT_FORMATS.has(format)
    ? [normalizeEol(before), normalizeEol(after)]
    : [before, after];

  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** The archive formats, compared array by array rather than byte by byte. */
const ARCHIVE_FORMATS = new Set(["NPZ", "NPZ_CLASS_MAP"]);

/** One .npy member, split into what its header declares and the raw values after it. */
interface NpyParts {
  readonly descr: string;
  readonly shape: string;
  readonly fortran: string;
  readonly body: Uint8Array;
}

/**
 * Read an .npy header without decoding the values: any dtype can then be compared, including the
 * class map's uint16, which the library's decoder does not take because no reader needs it to.
 */
function npyParts(bytes: Uint8Array): NpyParts {
  if (bytes.length < 10 || bytes[0] !== 0x93 || String.fromCharCode(...bytes.subarray(1, 6)) !== "NUMPY") {
    throw new Error("not an .npy member");
  }
  const major = bytes[6]!;
  const lengthBytes = major === 1 ? 2 : 4;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = lengthBytes === 2 ? view.getUint16(8, true) : view.getUint32(8, true);
  const start = 8 + lengthBytes;
  const header = new TextDecoder("latin1").decode(bytes.subarray(start, start + headerLength));
  const field = (pattern: RegExp) => pattern.exec(header)?.[1]?.replace(/\s+/g, "") ?? "";
  return {
    descr: field(/'descr':\s*'([^']+)'/),
    shape: field(/'shape':\s*\(([^)]*)\)/),
    fortran: field(/'fortran_order':\s*(True|False)/),
    body: bytes.subarray(start + headerLength),
  };
}

/** An NPZ's arrays, split, and its class names, whichever table carries them. */
interface ArchiveContents {
  readonly arrays: Map<string, NpyParts>;
  /** Null when the archive has a name table that cannot be read. */
  readonly names: ReadonlyMap<number, string> | null;
}

async function archiveContents(archive: Uint8Array): Promise<ArchiveContents> {
  const arrays = new Map<string, NpyParts>();
  // undefined: no such table; null: a table that cannot be read.
  let pickled: Map<number, string> | null | undefined;
  let json: Map<number, string> | null | undefined;
  for (const entry of await readZip(archive)) {
    const name = entry.name.replace(/\.npy$/, "");
    if (name === "class_aliases") pickled = readLegacyAliasNpy(entry.data);
    else if (name === "class_aliases_json") json = jsonNames(npyParts(entry.data));
    else arrays.set(name, npyParts(entry.data));
  }
  // The table the library itself reads: legacy's when it is readable, then the JSON one.
  const names = pickled ?? json ?? (pickled === null || json === null ? null : new Map<number, string>());
  return { arrays, names };
}

/**
 * Whether two NPZ archives hold the same arrays: the same members, each with the same dtype, shape
 * and memory order and the same values, and the same class names. An archive that cannot be read,
 * or whose names cannot be, is never the same as anything.
 */
export async function sameArchive(before: Uint8Array, after: Uint8Array): Promise<boolean> {
  let a: ArchiveContents;
  let b: ArchiveContents;
  try {
    [a, b] = await Promise.all([archiveContents(before), archiveContents(after)]);
  } catch {
    return false;
  }
  if (a.names === null || b.names === null || !sameNames(a.names, b.names)) return false;
  if (a.arrays.size !== b.arrays.size) return false;
  for (const [name, x] of a.arrays) {
    const y = b.arrays.get(name);
    if (y === undefined) return false;
    if (x.descr !== y.descr || x.shape !== y.shape || x.fortran !== y.fortran) return false;
    if (x.body.length !== y.body.length) return false;
    for (let i = 0; i < x.body.length; i += 1) if (x.body[i] !== y.body[i]) return false;
  }
  return true;
}

function sameNames(a: ReadonlyMap<number, string>, b: ReadonlyMap<number, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, name] of a) if (b.get(id) !== name) return false;
  return true;
}

/** The names in a `class_aliases_json` table, or null when it is not JSON of ids to names. */
function jsonNames(parts: NpyParts): Map<number, string> | null {
  try {
    const parsed: unknown = JSON.parse(unicodeScalar(parts));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const names = new Map<number, string>();
    for (const [id, name] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^-?\d+$/.test(id) || typeof name !== "string") return null;
      names.set(Number.parseInt(id, 10), name);
    }
    return names;
  } catch {
    return null;
  }
}

/** A NumPy unicode scalar's text: UTF-32, little-endian, NUL-padded. */
function unicodeScalar(parts: NpyParts): string {
  if (!/^[<|=]?U\d+$/.test(parts.descr)) return "";
  const view = new DataView(parts.body.buffer, parts.body.byteOffset, parts.body.byteLength);
  let text = "";
  for (let i = 0; i + 4 <= parts.body.length; i += 4) {
    const code = view.getUint32(i, true);
    if (code === 0) break;
    text += String.fromCodePoint(code);
  }
  return text;
}

/** The comparison each format gets: arrays for the archives, bytes after EOL for the rest. */
export async function sameFile(format: string, before: Uint8Array, after: Uint8Array): Promise<boolean> {
  return ARCHIVE_FORMATS.has(format) ? sameArchive(before, after) : sameBytes(format, before, after);
}

/** A one-line summary per dataset, and the exit code that follows from it. */
/**
 * How many annotation files were actually read and re-exported.
 *
 * ITS OWN FUNCTION BECAUSE THE EXIT CODE DEPENDS ON IT, and the exit code is what Phase 6's
 * criterion is checked by. A `skipped` image is one with no annotations beside it, which is a
 * perfectly ordinary thing for an image to be and is NOT evidence of anything -- so a corpus made
 * entirely of them has proven nothing, however cleanly it ran.
 */
export function comparedCount(outcomes: readonly DatasetOutcome[]): number {
  return outcomes.reduce(
    (total, outcome) =>
      total + outcome.images.filter((image) => image.status !== "skipped").length,
    0,
  );
}

export function summarize(outcomes: readonly DatasetOutcome[]): {
  readonly lines: readonly string[];
  readonly failed: number;
} {
  const lines: string[] = [];
  let failed = 0;

  for (const dataset of outcomes) {
    const counts = { identical: 0, differs: 0, unreadable: 0, skipped: 0, "names-unread": 0 };
    for (const image of dataset.images) counts[image.status] += 1;
    // A file whose names could not be read is a FAILURE of this criterion, not a warning: its
    // rewrite puts ids where the names belong, and a corpus that passes only because those files
    // were counted as something else has not been checked.
    failed += counts.differs + counts.unreadable + counts["names-unread"];

    lines.push(
      `${dataset.folder}: ${counts.identical} identical, ${counts.differs} differ, `
        + `${counts["names-unread"]} with unreadable class names, ${counts.unreadable} unreadable, `
        + `${counts.skipped} without annotations`,
    );
    // Only the failures are listed. A corpus of two hundred datasets printing every filename is a
    // report nobody reads, and the ones that matter are the ones that are wrong.
    for (const image of dataset.images) {
      if (image.status === "differs") {
        lines.push(`    ${image.key}: ${image.differing.join(", ")} differ`);
      } else if (image.status === "unreadable" || image.status === "names-unread") {
        lines.push(`    ${image.key}: ${image.detail}`);
      }
    }
  }

  return { lines, failed };
}

/**
 * Round-trip one folder.
 *
 * The scratch copy is a SEPARATE blob store rooted in a temporary directory, into which only the
 * files being rewritten are placed. The original store is opened read-only in the sense that
 * nothing here calls a write on it.
 */
export async function roundTripFolder(
  root: string,
  folder: string,
  /** Where legacy's own re-saves are, at the same paths, when the rewrite is held to those. */
  oracleRoot?: string,
): Promise<DatasetOutcome> {
  const source = new DirectoryBlobStore(root);
  const expected = oracleRoot === undefined ? source : new DirectoryBlobStore(oracleRoot);
  const listing = await listDataset(source, folder);
  const images: ImageOutcome[] = [];

  const scratchRoot = await mkdtemp(path.join(tmpdir(), "lazylabel-acceptance-"));
  const scratch = new DirectoryBlobStore(scratchRoot);

  try {
    for (const row of listing.images) {
      if (!row.annotated) {
        images.push({
          key: row.key,
          status: "skipped",
          detail: "no annotation file",
          formats: [],
          differing: [],
        });
        continue;
      }

      let outcome: ImageOutcome;
      try {
        const present = Object.entries(row.sidecars)
          .filter(([, exists]) => exists === true)
          .map(([format]) => format);
        outcome = await roundTripImage(source, scratch, row.key, present, expected);
      } catch (cause) {
        outcome = {
          key: row.key,
          status: "unreadable",
          detail: cause instanceof Error ? cause.message : String(cause),
          formats: [],
          differing: [],
        };
      }
      images.push(outcome);
    }
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }

  return { folder, images };
}

async function roundTripImage(
  source: DirectoryBlobStore,
  scratch: DirectoryBlobStore,
  key: string,
  present: readonly string[],
  /** What the rewrite should equal: the source itself, or legacy's re-save of it. */
  expected: DirectoryBlobStore,
): Promise<ImageOutcome> {
  // The size comes from the IMAGE, not from a guess: the text formats store normalised
  // coordinates and reading them back at the wrong size rescales every polygon silently.
  const pixels = await source.read(key);
  if (pixels === null) throw new Error("the image itself could not be read");
  const decoded = await decodeImage(pixels);
  const imageSize: readonly [number, number] = [decoded.height, decoded.width];

  const read = await readAnnotations(source, key, imageSize);
  if (read === null) throw new Error("no annotation file after the listing said there was one");

  // `readAnnotations` throws `AnnotationLoadError` when every sidecar failed, so reaching here
  // means one of them supplied annotations. `failures` names the higher-priority files that did
  // not, which is worth reporting rather than swallowing: a damaged newest file beside a healthy
  // older one looks like a clean round trip and is not.
  const outcome = read.outcome;

  // A CLASS-NAME TABLE THAT WAS REFUSED. The desktop app's own pickled table is read as data, so
  // this is a table in some other shape, which is refused rather than executed (SEC-01). The masks
  // load perfectly and the NAMES do not, so a round trip of this file writes ids where the names
  // belong -- in Pascal VOC and CreateML especially, which carry names rather than ids, with
  // nothing about the output looking wrong.
  //
  // Reported as its own outcome rather than as "differs". The bytes DO differ, and saying only
  // that sends someone hunting a rounding bug in the exporters when the cause is the name table.
  if (outcome.unreadableAliases === true) {
    return {
      key,
      status: "names-unread",
      detail:
        "its class-name table is not in the form LazyLabel writes, so the names were not read "
        + "and a rewrite would put class ids where the names belong",
      formats: [...present],
      differing: [],
    };
  }

  const segments = outcome.segments;
  const classAliases = outcome.classAliases;
  const classOrder = [
    ...new Set(segments.map((s) => s.classId).filter((id): id is number => id !== null)),
  ].sort((a, b) => a - b);

  const maskTensor = createFinalMaskTensor(segments, imageSize, classOrder);
  const context: ExportContext = {
    imagePath: key,
    imageSize,
    classOrder,
    classLabels: classOrder.map((id) => classAliases.get(id) ?? String(id)),
    classAliases,
    maskTensor,
    cropCoords: null,
    instances: createInstanceContours(segments, imageSize, classOrder, maskTensor),
  };

  // Only the formats this image actually HAS, taken from the listing rather than from the read:
  // the read reports which file supplied the annotations, not which files exist. Writing a format
  // the original never had and finding it absent would be a difference this tool invented.
  const formats = present.length > 0 ? present : [outcome.format];

  await writeAnnotations(scratch, key, { formats: formats as never, context });

  const differing: string[] = [];
  for (const format of formats) {
    const sidecar = sidecarPathFor(key, format);
    if (sidecar === null) continue;
    const before = await expected.read(sidecar);
    const after = await scratch.read(sidecar);
    if (before === null || after === null || !(await sameFile(format, before, after))) {
      differing.push(format);
    }
  }

  const recovered =
    outcome.failures.length === 0
      ? ""
      : ` (read from ${outcome.format}; ${outcome.failures.map((f) => f.format).join(", ")} `
        + "could not be read)";

  return {
    key,
    status: differing.length === 0 ? "identical" : "differs",
    detail:
      (differing.length === 0 ? "round-tripped" : `${differing.length} format(s) differ`)
      + recovered,
    formats,
    differing,
  };
}

/** The sidecar suffixes, mirrored from the format library so the tool reads what it wrote. */
const SUFFIXES: Readonly<Record<string, string>> = {
  NPZ: ".npz",
  NPZ_CLASS_MAP: "_CM.npz",
  YOLO_DETECTION: ".txt",
  YOLO_SEGMENTATION: "_seg.txt",
  COCO_JSON: "_coco.json",
  PASCAL_VOC: ".xml",
  CREATEML: "_createml.json",
};

export function sidecarPathFor(imageKey: string, format: string): string | null {
  const suffix = SUFFIXES[format];
  if (suffix === undefined) return null;
  const dot = imageKey.lastIndexOf(".");
  const stem = dot < 0 ? imageKey : imageKey.slice(0, dot);
  return `${stem}${suffix}`;
}

/**
 * The command.
 *
 * Every immediate subdirectory of the corpus root is one dataset, plus the root itself when it
 * holds images directly — because a corpus is as likely to be one folder as a folder of folders,
 * and refusing the simpler shape would make the tool harder to try.
 *
 * Exits non-zero when anything differed or could not be read, so it can gate a release.
 */
export async function main(argv: readonly string[]): Promise<number> {
  const at = argv.indexOf("--oracle");
  const oracleRoot = at < 0 ? undefined : argv[at + 1];
  const root = argv.find((arg, index) => !arg.startsWith("--") && (at < 0 || index !== at + 1));
  if (root === undefined || (at >= 0 && oracleRoot === undefined)) {
    console.error("usage: acceptance-round-trip <corpus-root> [--oracle <legacy re-saves>]");
    console.error("");
    console.error("Every immediate subfolder is one dataset. Nothing is written into the corpus.");
    console.error("With --oracle, each rewrite is compared with legacy's re-save of the same image.");
    return 2;
  }

  const store = new DirectoryBlobStore(root);
  const folders = await store.listFolders("");
  // The root counts as a dataset when it holds images of its own.
  const rootListing = await listDataset(store, "");
  const targets = rootListing.images.length > 0 ? ["", ...folders] : folders;

  if (targets.length === 0) {
    console.error(`no datasets under ${root}: no images here and no subfolders`);
    return 2;
  }

  const outcomes: DatasetOutcome[] = [];
  for (const folder of targets) {
    process.stdout.write(`${folder === "" ? "(root)" : folder}… `);
    const outcome = await roundTripFolder(root, folder, oracleRoot);
    outcomes.push({ ...outcome, folder: folder === "" ? "(root)" : folder });
    process.stdout.write(`${outcome.images.length} images\n`);
  }

  const { lines, failed } = summarize(outcomes);
  console.log("");
  for (const line of lines) console.log(line);

  console.log("");

  /*
   * NOTHING ROUND-TRIPPED IS NOT SUCCESS, and this reported it as success until someone ran the
   * harness against a folder of bare images to see what it would say.
   *
   * It is the exact failure the tool exists to catch, turned on the tool itself: an exit code of
   * zero and "every annotation file round-tripped identically" over a corpus where no annotation
   * file was read at all. Phase 6's exit criterion is checked by running this, so a vacuous pass
   * here is a criterion that can be met by pointing at the wrong directory.
   */
  const compared = comparedCount(outcomes);

  if (compared === 0) {
    console.log(
      "NOTHING WAS COMPARED: no dataset in this corpus has annotation files to round-trip.",
    );
    console.log(
      "This is not a pass. Check the corpus path, and that each dataset folder holds its "
        + "sidecars beside its images.",
    );
    return 2;
  }

  console.log(
    failed === 0
      ? `Every annotation file round-tripped identically (${compared} compared).`
      : `${failed} of ${compared} file(s) did not round-trip. Each is listed above.`,
  );
  return failed === 0 ? 0 : 1;
}

// `process.argv[1]` rather than an import.meta check, so this works the same compiled or run
// through a loader.
if (process.argv[1]?.endsWith("acceptanceRoundTrip.ts") === true
  || process.argv[1]?.endsWith("acceptanceRoundTrip.js") === true) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (cause: unknown) => {
      console.error(cause instanceof Error ? cause.message : String(cause));
      process.exit(1);
    },
  );
}
