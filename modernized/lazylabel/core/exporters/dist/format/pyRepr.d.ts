/**
 * Reproduce Python's float repr, which is how every YOLO coordinate reaches the file.
 *
 * The legacy writers interpolate a float straight into an f-string, so the bytes follow Python's
 * layout rules, not JavaScript's:
 *   - whole numbers keep a trailing ".0"      Python "1.0"                JS String() "1"
 *   - exponential form starts at 1e-4         Python "6.103515625e-05"    JS "0.00006103515625"
 *   - exponents are signed and 2-digit padded Python "1e-05"              JS "1e-7" style
 * Both languages choose the same shortest round-trip digits; only the layout differs.
 *
 * Verified by the RULE-005 review against 8013 values produced by real (x + w/2)/W computations
 * across image widths from 1 to 1e7: plain String(v) diverged on 421 of them, this function on none.
 */
export declare function pyRepr(value: number): string;
//# sourceMappingURL=pyRepr.d.ts.map