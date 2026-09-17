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
export const DEFAULT_LIMITS = {
    maxPixels: 100_000_000,
    maxChannels: 1024,
    maxObjects: 100_000,
    maxArchiveMembers: 64,
    maxUncompressedBytes: 512 * 1024 * 1024,
};
/** Raised when a file claims more than the limits allow. Distinct from a malformed file. */
export class AnnotationTooLargeError extends Error {
    constructor(message) {
        super(message);
        this.name = "AnnotationTooLargeError";
    }
}
export function assertWithin(condition, message) {
    if (!condition)
        throw new AnnotationTooLargeError(message);
}
/** Check an image area before anything allocates a buffer that size. */
export function assertPixels(height, width, limits = DEFAULT_LIMITS) {
    assertWithin(Number.isFinite(height) && Number.isFinite(width) && height >= 0 && width >= 0, `an image size of ${height}x${width} is not a real size`);
    assertWithin(height * width <= limits.maxPixels, `an image of ${height}x${width} is ${height * width} pixels, over the ${limits.maxPixels} limit`);
}
export function assertObjects(count, limits = DEFAULT_LIMITS) {
    assertWithin(count <= limits.maxObjects, `this file holds ${count} objects, over the ${limits.maxObjects} limit`);
}
//# sourceMappingURL=limits.js.map