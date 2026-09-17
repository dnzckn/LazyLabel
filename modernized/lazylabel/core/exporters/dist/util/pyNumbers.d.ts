/**
 * Numeric helpers that reproduce Python semantics exactly.
 *
 * The legacy code rounds and truncates in several places where the JavaScript default differs.
 * Getting these wrong moves annotation pixels, so they live in one place with their own tests.
 */
/**
 * Python's round() and numpy's rint: ties go to the EVEN integer.
 *
 * JavaScript's Math.round sends ties upward (and -0.5 to -0), so round(0.5) is 0 here but 1 there,
 * and round(2.5) is 2 here but 3 there. The importers use int(round(v * size)) on every coordinate,
 * so a tie that rounds the wrong way shifts a box edge by a pixel, and can drop a one-pixel object.
 */
export declare function roundHalfToEven(value: number): number;
/**
 * Truncation toward zero, as a C cast does: what `np.array(x, dtype=np.int32)` performs on a float.
 *
 * Not Math.floor: -0.7 becomes 0 here and -1 under floor. Polygon vertices can be negative when a
 * shape is drawn past the top or left edge of the image.
 */
export declare function truncToward0(value: number): number;
//# sourceMappingURL=pyNumbers.d.ts.map