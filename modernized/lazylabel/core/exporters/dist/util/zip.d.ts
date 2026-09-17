/**
 * The slice of the zip format an .npz file needs: a flat archive of stored or deflated members,
 * no directories, no encryption, no zip64.
 *
 * Uses the platform's CompressionStream("deflate-raw"), which Node 22 and current browsers both
 * provide, so the library stays free of native dependencies and runs unchanged in the web app.
 * NumPy writes .npz with deflate (np.savez_compressed) or stored (np.savez); both are read here.
 */
import { type AnnotationLimits } from "../limits.js";
export interface ZipEntry {
    readonly name: string;
    readonly data: Uint8Array;
}
export declare function writeZip(entries: readonly ZipEntry[]): Promise<Uint8Array>;
export declare function readZip(bytes: Uint8Array, limits?: AnnotationLimits): Promise<ZipEntry[]>;
/** A zip member that could not be inflated: damaged, truncated, or not deflate data at all. */
export declare class CompressionError extends Error {
    readonly cause: unknown;
    constructor(message: string, cause: unknown);
}
export declare function crc32(data: Uint8Array): number;
//# sourceMappingURL=zip.d.ts.map