/**
 * Reading the class-alias table out of an NPZ archive, shared by both NPZ formats.
 *
 * Two member names are accepted. `class_aliases` is legacy's own member, a pickled Python dict,
 * which every NPZ the desktop app writes carries and, since the owner's decision of 2026-09-25,
 * this library writes too. It is parsed as data by legacyAliases.ts and never executed. A table
 * that is not the shape legacy writes is refused and reported as unreadable, not guessed at.
 *
 * `class_aliases_json` is the JSON table this library wrote before that decision (decision 4), and
 * that the converter still writes. It is only read, never written. It lived under its own name
 * because legacy's _restore_aliases (file_manager.py:335-343) calls `.item()` on the member inside
 * a try and then `.items()` on the result outside it, so a unicode scalar under legacy's name would
 * raise and take the entire legacy load down with it.
 */

import { decodeNpy } from "../util/npy.js";
import { readLegacyAliasNpy } from "./legacyAliases.js";

export const ALIAS_MEMBER = "class_aliases_json";
export const LEGACY_ALIAS_MEMBER = "class_aliases";

export interface AliasTable {
  readonly aliases: Map<number, string>;
  /**
   * The archive carries a class-name table this reader will not read.
   *
   * A pickle that is not the shape the desktop app writes, or a JSON table that is not ids to names.
   * The masks in such a file are perfectly readable; only the NAMES are not, and the difference is
   * invisible unless it is said. A conversion that loses it writes "3" where the original said
   * "stop sign", in formats that carry names instead of ids, and nothing about the output looks
   * wrong.
   */
  readonly unreadable: boolean;
}

export function readAliasMember(members: ReadonlyMap<string, Uint8Array>): AliasTable {
  const empty = (unreadable: boolean): AliasTable => ({ aliases: new Map(), unreadable });

  // Legacy's own table first: every NPZ the desktop app writes carries it, and since 2026-09-25 this
  // library writes it too. Read as data, never executed (legacyAliases.ts); only a table that is not
  // the shape legacy writes is refused, and then reported.
  const legacy = members.get(LEGACY_ALIAS_MEMBER);
  if (legacy) {
    const names = readLegacyAliasNpy(legacy);
    if (names !== null) return { aliases: names, unreadable: false };
    if (!members.has(ALIAS_MEMBER)) return empty(true);
  }

  // The JSON table this library wrote before 2026-09-25, and the converter writes.
  const raw = members.get(ALIAS_MEMBER);
  if (!raw) return empty(false); // no table at all is not the same as one we cannot read

  let decoded;
  try {
    decoded = decodeNpy(raw);
  } catch {
    return empty(true);
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
