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
export declare const ALIAS_MEMBER = "class_aliases_json";
export declare const LEGACY_ALIAS_MEMBER = "class_aliases";
export declare function readAliasMember(members: ReadonlyMap<string, Uint8Array>): Map<number, string>;
//# sourceMappingURL=aliases.d.ts.map