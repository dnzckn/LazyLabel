/**
 * Serialize JSON the way Python's `json.dump` does, so the JSON exports stay byte-comparable.
 *
 * Two differences from JSON.stringify matter, both confirmed against real legacy output:
 *   - `ensure_ascii` defaults to True, so every non-ASCII character is escaped as \uXXXX. A class
 *     named "細胞" reaches the file as "細胞"; JSON.stringify would emit the characters.
 *   - `indent=2` lays out exactly as JSON.stringify's 2-space indent, including "[]" and "{}" for
 *     empty containers, so only the escaping needs fixing.
 *
 * Key order follows insertion order in both languages, so callers control field order by building
 * their objects in the legacy writer's order.
 */
export function pythonJsonDumps(value: unknown, indent = 2): string {
  const text = JSON.stringify(value, null, indent);
  if (text === undefined) throw new TypeError("value is not JSON-serializable");
  return escapeNonAscii(text);
}

/** Escape every code unit above ASCII, exactly as Python's ensure_ascii does, surrogates included. */
export function escapeNonAscii(text: string): string {
  let out = "";
  for (const char of splitCodeUnits(text)) {
    const code = char.charCodeAt(0);
    out += code > 0x7f ? `\\u${code.toString(16).padStart(4, "0")}` : char;
  }
  return out;
}

function* splitCodeUnits(text: string): Generator<string> {
  for (let i = 0; i < text.length; i += 1) yield text[i]!;
}
