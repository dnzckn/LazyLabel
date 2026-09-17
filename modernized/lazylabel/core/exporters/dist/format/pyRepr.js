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
export function pyRepr(value) {
    if (!Number.isFinite(value))
        return Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf";
    const negative = value < 0 || Object.is(value, -0);
    const magnitude = Math.abs(value);
    if (magnitude === 0)
        return negative ? "-0.0" : "0.0";
    // toExponential() with no argument yields the shortest round-trip digit string.
    const [mantissa, exponent] = magnitude.toExponential().split("e");
    const digits = mantissa.replace(".", "");
    const decpt = Number.parseInt(exponent, 10) + 1; // Python's decimal point position
    let out;
    if (decpt <= -4 || decpt > 16) {
        const head = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits[0];
        const e = decpt - 1;
        out = `${head}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
    }
    else if (decpt <= 0) {
        out = `0.${"0".repeat(-decpt)}${digits}`;
    }
    else if (decpt >= digits.length) {
        out = `${digits}${"0".repeat(decpt - digits.length)}.0`;
    }
    else {
        out = `${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
    }
    return negative ? `-${out}` : out;
}
//# sourceMappingURL=pyRepr.js.map