/**
 * Caps on what an annotation file may claim, so a hostile or damaged file cannot exhaust memory.
 *
 * Section 2 of the brief makes hostile uploads the default assumption, and Phase 1's exit criteria
 * require these limits here rather than in each consumer: the web app and the API share one library
 * precisely so they cannot drift apart on a security control.
 *
 * The defaults are generous for real annotation work and still bound the damage. Measured before
 * they existed: a 204-byte archive declaring a 30000x30000 class map allocated 1.8 GB before
 * failing on a bounds error.
 */

export interface AnnotationLimits {
  /** Largest image area a file may declare, in pixels. 100 megapixels is a 10000x10000 image. */
  readonly maxPixels: number;
  /** Largest number of class channels in a one-hot tensor. */
  readonly maxChannels: number;
  /** Largest number of objects or lines a single file may contribute. */
  readonly maxObjects: number;
  /** Largest number of members in one archive. LazyLabel writes four. */
  readonly maxArchiveMembers: number;
  /**
   * Largest total size of an archive after decompression.
   *
   * This, with maxArchiveMembers, is the whole defence against a zip bomb. An expansion-RATIO guard
   * was tried and removed: annotation masks are mostly zeros and legitimately compress about 1027
   * to 1, while raw deflate cannot exceed roughly 1032 to 1 in the first place. A ratio threshold
   * high enough to admit real data therefore never fires, and a lower one rejects ordinary files.
   */
  readonly maxUncompressedBytes: number;
}

export const DEFAULT_LIMITS: AnnotationLimits = {
  maxPixels: 100_000_000,
  maxChannels: 1024,
  maxObjects: 100_000,
  maxArchiveMembers: 64,
  maxUncompressedBytes: 512 * 1024 * 1024,
};

/** Raised when a file claims more than the limits allow. Distinct from a malformed file. */
export class AnnotationTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnotationTooLargeError";
  }
}

export function assertWithin(condition: boolean, message: string): void {
  if (!condition) throw new AnnotationTooLargeError(message);
}

/** Check an image area before anything allocates a buffer that size. */
export function assertPixels(
  height: number,
  width: number,
  limits: AnnotationLimits = DEFAULT_LIMITS,
): void {
  assertWithin(
    Number.isFinite(height) && Number.isFinite(width) && height >= 0 && width >= 0,
    `an image size of ${height}x${width} is not a real size`,
  );
  assertWithin(
    height * width <= limits.maxPixels,
    `an image of ${height}x${width} is ${height * width} pixels, over the ${limits.maxPixels} limit`,
  );
}

export function assertObjects(count: number, limits: AnnotationLimits = DEFAULT_LIMITS): void {
  assertWithin(count <= limits.maxObjects, `this file holds ${count} objects, over the ${limits.maxObjects} limit`);
}
