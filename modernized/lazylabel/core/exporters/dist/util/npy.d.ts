/**
 * Minimal reader and writer for NumPy's .npy array format, version 1.0.
 *
 * An .npz file is a zip of .npy members, so this plus src/util/zip.ts is all the NPZ formats need.
 * Only the dtypes LazyLabel actually stores are supported: uint8 masks and 64-bit integer class
 * lists. Anything else is refused loudly rather than guessed at, because a silently misread mask
 * would corrupt annotations.
 *
 * Format reference: a 6-byte magic, a version pair, a 2-byte little-endian header length, then a
 * Python dict literal padded so the data starts on a 64-byte boundary.
 */
import { type AnnotationLimits } from "../limits.js";
export type NpyDType = "uint8" | "int64" | "bool" | "str";
export interface NpyArray {
    readonly dtype: NpyDType;
    readonly shape: readonly number[];
    /**
     * Row-major values. int64 arrays come back as numbers, since LazyLabel never stores ids beyond
     * 2^53, and a "str" array comes back as the string itself.
     */
    readonly data: Uint8Array | Float64Array | string;
}
/**
 * A 0-dimensional NumPy unicode scalar, which is what `np.array("some text")` produces.
 *
 * NumPy stores unicode as UTF-32 little-endian code points, so Python reads the value back with a
 * plain `str(data["key"])`. This is how class aliases travel now that pickle is banned: the alias
 * table is JSON inside one of these (MODERNIZATION_BRIEF.md decision 4).
 */
export declare function encodeNpyString(value: string): Uint8Array;
export declare function encodeNpy(array: NpyArray): Uint8Array;
export declare function decodeNpy(bytes: Uint8Array, limits?: AnnotationLimits): NpyArray;
//# sourceMappingURL=npy.d.ts.map