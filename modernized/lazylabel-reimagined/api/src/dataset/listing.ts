/**
 * Listing a folder of images, with what each one already carries.
 *
 * Capability C1, and the Phase 4 pilot slice. Three rules meet here:
 *
 *   RULE-051  which files count as images, and that only the folder's DIRECT children are listed
 *   RULE-036  which annotation files each image has, matched by base name and exact suffix
 *   RULE-080  sidecar naming, and the collision that naming scheme allows (P0)
 *
 * ONE PASS, NOT SEVEN PER IMAGE. The obvious implementation stats each image's seven candidate
 * sidecars; on a folder of 5,000 images that is 35,000 filesystem round trips before anything
 * appears on screen, and the dataset browser is the first thing a user touches. The folder is
 * listed once and membership tested against a set instead.
 */

import { FORMAT_SUFFIX, LOAD_PRIORITY, stripExtension } from "@lazylabel/annotation-formats";
import type { AnnotationFormat } from "@lazylabel/annotation-formats";

import type { BlobStore } from "../ports/blobStore.js";
import { isImageKey, isSidecarKey, sidecarKeysFor } from "../annotations/sidecars.js";

export interface DatasetImage {
  /** Store key, e.g. "frames/frame_012.png". */
  readonly key: string;
  /** File name alone, which is what the browser shows. */
  readonly name: string;
  /** Which annotation files exist for this image, by format. */
  readonly sidecars: Readonly<Record<AnnotationFormat, boolean>>;
  /** True when any sidecar exists. The "already labelled" marker. */
  readonly annotated: boolean;
  /**
   * Other images in this folder that share every sidecar with this one (RULE-080).
   *
   * `frame_012.png` and `frame_012.jpg` have the same base name, so they have the same seven
   * sidecar paths. Annotating one overwrites the other's work, and legacy never mentions it. The
   * listing is the first place a user could possibly be told, which is why it is reported here
   * rather than waiting for a save to collide.
   */
  readonly sharesSidecarsWith: readonly string[];
  /**
   * The image file's size in bytes, and when it was last written — only when DETAILS were asked
   * for.
   *
   * Absent by default and that is the point. The listing is one pass over a directory read;
   * filling these in costs a `stat` PER IMAGE, which a folder of ten thousand frames pays on every
   * listing for two columns most datasets never show. So the client asks for them when a visible
   * column or a chosen sort needs them, and not otherwise.
   */
  readonly size?: number;
  /** Epoch milliseconds, or null when the store cannot say. */
  readonly modified?: number | null;
}

export interface DatasetListing {
  readonly folder: string;
  /**
   * Folder names directly below this one, so a dataset can be walked.
   *
   * RULE-051 makes the listing non-recursive, which is legacy's behaviour and is deliberate --
   * changing it would change which images a dataset contains. But non-recursive without
   * navigation is not a restriction, it is a dead end: a dataset whose images live in `frames/`
   * shows an empty root and no way down.
   */
  readonly folders: readonly string[];
  readonly images: readonly DatasetImage[];
  /** How many images carry at least one annotation file. */
  readonly annotatedCount: number;
  /**
   * Files that are neither a supported image nor a recognized sidecar.
   *
   * Counted rather than listed, and never silently dropped: a folder whose images are all .avif
   * should say "18 files were not recognized" instead of appearing empty.
   */
  readonly unrecognized: number;
}

/**
 * List one folder.
 *
 * Not recursive, per RULE-051: only the direct children of the chosen folder are listed and
 * loadable. Legacy does the same, and changing it would change which images a dataset contains.
 */
export async function listDataset(
  store: BlobStore,
  folder: string,
  details = false,
): Promise<DatasetListing> {
  const [entries, folders] = await Promise.all([store.list(folder), store.listFolders(folder)]);

  // One set for membership, so each image's seven lookups are seven map probes rather than seven
  // filesystem calls.
  const present = new Set(entries);

  const images: string[] = [];
  let unrecognized = 0;
  for (const key of entries) {
    if (isImageKey(key)) images.push(key);
    else if (!isSidecarKey(key)) unrecognized += 1;
  }

  // RULE-080's collision, grouped before the rows are built so each side can name the other.
  const byBase = new Map<string, string[]>();
  for (const key of images) {
    const base = stripExtension(key);
    const group = byBase.get(base);
    if (group) group.push(key);
    else byBase.set(base, [key]);
  }

  const rows = images.map((key) => {
    const sidecars = {} as Record<AnnotationFormat, boolean>;
    let annotated = false;
    for (const [format, sidecarKey] of sidecarKeysFor(key)) {
      const exists = present.has(sidecarKey);
      sidecars[format] = exists;
      annotated ||= exists;
    }

    return {
      key,
      name: baseName(key),
      sidecars,
      annotated,
      sharesSidecarsWith: (byBase.get(stripExtension(key)) ?? []).filter((other) => other !== key).sort(),
    };
  });

  /*
   * THE ONLY PLACE THIS FUNCTION STATS, and only when asked. The comment at the top of this file
   * is about the SIDECARS -- seven lookups per image answered from one directory read rather than
   * seven filesystem calls -- and that stands: this adds one call per IMAGE, not seven, and only
   * for a client that has a column or a sort needing it.
   *
   * In parallel, because a folder of ten thousand frames issued one after another would take
   * longer than the listing it belongs to. A stat that fails leaves the fields absent rather than
   * failing the listing: a file that vanished between the directory read and the stat should not
   * take the whole folder down with it.
   */
  const detailed = details
    ? await Promise.all(
        rows.map(async (row) => {
          const info = await store.stat(row.key).catch(() => null);
          return info === null ? row : { ...row, size: info.size, modified: info.modified };
        }),
      )
    : rows;

  detailed.sort(byLowercasedName);

  return {
    folder,
    folders: [...folders].sort(byLowercased),
    images: detailed,
    annotatedCount: rows.filter((row) => row.annotated).length,
    unrecognized,
  };
}

/**
 * Legacy's sort: `left.name.lower() < right.name.lower()`
 * (`utils/fast_file_manager.py:840`), a plain lexicographic comparison on the lowercased name.
 *
 * Reproduced exactly, and it is worth knowing what it costs: `frame_10.png` sorts BEFORE
 * `frame_2.png`, because "1" precedes "2". A natural sort would be friendlier, and it would also
 * change which image "next" goes to on a numbered sequence — so it is a product decision with a
 * user-visible consequence, not a port fix to slip in. Flagged for Phase 4's browser rather than
 * decided here.
 *
 * `localeCompare` is deliberately avoided: it would order by the server's locale, so the same
 * folder could list differently on two machines.
 */
/** The same ordering for folder names, which are plain strings rather than rows. */
function byLowercased(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function byLowercasedName(a: DatasetImage, b: DatasetImage): number {
  const left = a.name.toLowerCase();
  const right = b.name.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  // Two names that differ only in case would otherwise tie and take an unspecified order; fall
  // back to the raw key so the listing is stable between calls.
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function baseName(key: string): string {
  const cut = key.lastIndexOf("/");
  return cut < 0 ? key : key.slice(cut + 1);
}

/** Every format, in load-priority order, for a client rendering status columns. */
export const SIDECAR_COLUMNS: readonly { format: AnnotationFormat; suffix: string }[] =
  LOAD_PRIORITY.map((format) => ({ format, suffix: FORMAT_SUFFIX[format] }));
