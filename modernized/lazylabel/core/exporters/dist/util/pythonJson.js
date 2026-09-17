/**
 * Serialize JSON the way Python's `json.dump(..., indent=2)` does, so the JSON exports stay
 * byte-comparable with the legacy files.
 *
 * Three differences from JSON.stringify, all confirmed against real legacy output:
 *   - `ensure_ascii` defaults to True, so non-ASCII is escaped: a class named "細胞" is written
 *     "細胞", where JSON.stringify emits the characters themselves.
 *   - Python distinguishes int from float. A float that happens to be whole still prints "20.0",
 *     and JavaScript has one number type, so callers mark genuine floats with `pyFloat()`.
 *     CreateML centres are the case that matters: `int(x) + int(bw) / 2` is always a float there.
 *   - Layout otherwise matches JSON.stringify's 2-space indent, empty containers included.
 *
 * Key order follows insertion order in both languages, so callers control field order by building
 * their objects in the legacy writer's order.
 */
import { pyRepr } from "../format/pyRepr.js";
const FLOAT = Symbol("python float");
/** Mark a number that Python would hold as a float, so it prints with a decimal point. */
export function pyFloat(value) {
    return { [FLOAT]: value };
}
export function pythonJsonDumps(value, indent = 2) {
    return serialize(value, indent, 0);
}
function serialize(value, indent, depth) {
    if (value === null)
        return "null";
    if (typeof value === "boolean")
        return value ? "true" : "false";
    if (typeof value === "number")
        return serializeNumber(value);
    if (typeof value === "string")
        return serializeString(value);
    if (typeof value === "object") {
        const marked = value[FLOAT];
        if (typeof marked === "number")
            return pyRepr(marked);
        const pad = " ".repeat(indent * (depth + 1));
        const closePad = " ".repeat(indent * depth);
        if (Array.isArray(value)) {
            if (value.length === 0)
                return "[]";
            const items = value.map((item) => pad + serialize(item, indent, depth + 1));
            return `[\n${items.join(",\n")}\n${closePad}]`;
        }
        const entries = Object.entries(value).filter(([, item]) => item !== undefined);
        if (entries.length === 0)
            return "{}";
        const items = entries.map(([key, item]) => `${pad}${serializeString(key)}: ${serialize(item, indent, depth + 1)}`);
        return `{\n${items.join(",\n")}\n${closePad}}`;
    }
    throw new TypeError(`value of type ${typeof value} is not JSON-serializable`);
}
/**
 * Integers print bare; anything else follows Python's float repr, which is also how Python's json
 * module writes floats.
 */
function serializeNumber(value) {
    if (!Number.isFinite(value)) {
        // Python's json writes NaN and Infinity unquoted by default; annotations should never contain
        // them, so refuse rather than emit a document other readers will reject.
        throw new RangeError(`cannot serialize ${value} to JSON`);
    }
    return Number.isInteger(value) ? String(value) : pyRepr(value);
}
function serializeString(value) {
    return escapeNonAscii(JSON.stringify(value));
}
/** Escape every code unit above ASCII, exactly as Python's ensure_ascii does, surrogates included. */
export function escapeNonAscii(text) {
    let out = "";
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const code = char.charCodeAt(0);
        out += code > 0x7f ? `\\u${code.toString(16).padStart(4, "0")}` : char;
    }
    return out;
}
//# sourceMappingURL=pythonJson.js.map