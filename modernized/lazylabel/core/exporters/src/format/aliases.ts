/**
 * Reading the class-alias table out of an NPZ archive, shared by both NPZ formats.
 *
 * Two member names are accepted. `class_aliases_json` is what this library writes: JSON in a NumPy
 * unicode scalar, per decision 4. `class_aliases` is the legacy member, a pickled Python dict,
 * which is refused rather than executed (SEC-01) and therefore read as absent.
 *
 * Writing under the new name is what keeps legacy LazyLabel able to read these files at all: its
 * _restore_aliases (file_manager.py:335-343) calls `.item()` on the member inside a try and then
 * `.items()` on the result outside it, so a unicode scalar under the old name raises and takes the
 * entire legacy load down with it.
 */

import { decodeNpy } from "../util/npy.js";

export const ALIAS_MEMBER = "class_aliases_json";
export const LEGACY_ALIAS_MEMBER = "class_aliases";

export function readAliasMember(members: ReadonlyMap<string, Uint8Array>): Map<number, string> {
  const raw = members.get(ALIAS_MEMBER) ?? members.get(LEGACY_ALIAS_MEMBER);
  if (!raw) return new Map();

  let decoded;
  try {
    decoded = decodeNpy(raw);
  } catch {
    return new Map(); // a pickled table: treated as absent, never executed
  }
  if (decoded.dtype !== "str" || typeof decoded.data !== "string") return new Map();

  try {
    const parsed: unknown = JSON.parse(decoded.data);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    return new Map(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([id, name]) => /^-?\d+$/.test(id) && typeof name === "string")
        .map(([id, name]) => [Number.parseInt(id, 10), name as string]),
    );
  } catch {
    return new Map(); // a member that is not the JSON we write is not worth guessing at
  }
}
