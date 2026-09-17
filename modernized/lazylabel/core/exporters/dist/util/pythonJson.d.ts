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
declare const FLOAT: unique symbol;
/** Mark a number that Python would hold as a float, so it prints with a decimal point. */
export declare function pyFloat(value: number): {
    [FLOAT]: number;
};
export declare function pythonJsonDumps(value: unknown, indent?: number): string;
/** Escape every code unit above ASCII, exactly as Python's ensure_ascii does, surrogates included. */
export declare function escapeNonAscii(text: string): string;
export {};
//# sourceMappingURL=pythonJson.d.ts.map