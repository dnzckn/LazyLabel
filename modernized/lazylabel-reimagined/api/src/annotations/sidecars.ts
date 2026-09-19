/**
 * Which files belong to an image.
 *
 * Decision 15e keeps the legacy scheme: a sidecar's name is the image's base name plus the format's
 * suffix, so `frame_012.png` owns `frame_012.npz`, `frame_012_seg.txt`, `frame_012_coco.json` and
 * the rest. Keeping it means existing datasets keep loading the same files, which is the whole
 * point of decision 5.
 *
 * It also keeps the hazard decision 15e told us to record: the base name carries no extension, so
 * `frame_012.png` and `frame_012.jpg` in one folder SHARE every sidecar. Annotating one silently
 * overwrites the other's work. Legacy never noticed; here the save response names the collision, so
 * a user can see it before it costs them a day's labelling.
 */

import { FORMAT_SUFFIX, LOAD_PRIORITY, outputPathFor, stripExtension } from "@lazylabel/annotation-formats";
import type { AnnotationFormat } from "@lazylabel/annotation-formats";

/**
 * Image extensions the API accepts.
 *
 * Decision 9 adds .bmp, .gif and .webp to the legacy set. "The legacy set" needs a footnote,
 * because legacy has FOUR different lists and they disagree:
 *
 *   - `core/file_manager.py:743`        png jpg jpeg tiff tif
 *   - `utils/custom_file_system_model.py:30`  the same five, as name filters
 *   - `ui/main_window.py:5386`          the five plus bmp
 *   - `ui/workers/image_discovery_worker.py:8`  all eight, bmp gif webp included
 *
 * So a .webp is discovered by the sequence worker and then rejected as "not an image" by the file
 * manager. The list below is the union, which is what decision 9 settles on, and it is the only
 * list in this system.
 *
 * Note this decides which files are OFFERED as images. What they actually contain is checked by
 * decoding, never by the extension (`AI_NATIVE_SPEC.md` NFR "Hostile input").
 */
export const IMAGE_EXTENSIONS: readonly string[] = [
  ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif", ".webp",
];

/** Every suffix a sidecar can have, longest first so `_seg.txt` is tested before `.txt`. */
const SIDECAR_SUFFIXES: readonly string[] = [...new Set(Object.values(FORMAT_SUFFIX))].sort(
  (a, b) => b.length - a.length,
);

export function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * True when the key is a sidecar rather than an image.
 *
 * Used to keep sidecars out of the dataset listing. `_seg.txt` must be tested before `.txt`, which
 * is why the suffix list is sorted by length.
 */
export function isSidecarKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SIDECAR_SUFFIXES.some((suffix) => lower.endsWith(suffix.toLowerCase()));
}

/** Where each format's sidecar for this image would live, in load-priority order. */
export function sidecarKeysFor(imageKey: string): ReadonlyMap<AnnotationFormat, string> {
  const keys = new Map<AnnotationFormat, string>();
  for (const format of LOAD_PRIORITY) {
    keys.set(format, outputPathFor(imageKey, format));
  }
  return keys;
}

/**
 * Images in one folder that would share sidecars, keyed by the base name they collide on.
 *
 * Only groups of two or more are returned, so an ordinary folder yields an empty map.
 */
export function sidecarCollisions(
  imageKeys: Iterable<string>,
): ReadonlyMap<string, readonly string[]> {
  const byBase = new Map<string, string[]>();
  for (const key of imageKeys) {
    if (!isImageKey(key)) continue;
    const base = stripExtension(key);
    const group = byBase.get(base);
    if (group) group.push(key);
    else byBase.set(base, [key]);
  }

  const collisions = new Map<string, readonly string[]>();
  for (const [base, group] of byBase) {
    if (group.length > 1) collisions.set(base, [...group].sort());
  }
  return collisions;
}
