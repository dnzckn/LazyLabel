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

export interface AliasTable {
  readonly aliases: Map<number, string>;
  /**
   * The archive carries a class-name table this reader will not read.
   *
   * Almost always a legacy NPZ, whose aliases are a pickled Python dict. The masks in such a file
   * are perfectly readable; only the NAMES are not, and the difference is invisible unless it is
   * said. A conversion that loses it writes "3" where the original said "stop sign", in formats
   * that carry names instead of ids, and nothing about the output looks wrong.
   */
  readonly unreadable: boolean;
}

export function readAliasMember(members: ReadonlyMap<string, Uint8Array>): AliasTable {
  const empty = (unreadable: boolean): AliasTable => ({ aliases: new Map(), unreadable });

  const raw = members.get(ALIAS_MEMBER) ?? members.get(LEGACY_ALIAS_MEMBER);
  if (!raw) return empty(false); // no table at all is not the same as one we cannot read

  let decoded;
  try {
    decoded = decodeNpy(raw);
  } catch {
    return empty(true); // a pickled table: refused, never executed, and reported
  }
  if (decoded.dtype !== "str" || typeof decoded.data !== "string") return empty(true);

  try {
    const parsed: unknown = JSON.parse(decoded.data);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty(true);
    return {
      aliases: new Map(
        Object.entries(parsed as Record<string, unknown>)
          .filter(([id, name]) => /^-?\d+$/.test(id) && typeof name === "string")
          .map(([id, name]) => [Number.parseInt(id, 10), name as string]),
      ),
      unreadable: false,
    };
  } catch {
    return empty(true); // a member that is not the JSON we write is not worth guessing at
  }
}
