/**
 * NPZ: the one-hot mask tensor, first in the load priority and the only lossless format.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/npz.py:15-30.
 * Reader ported from FileManager._load_npz (file_manager.py:224-280) and _add_mask_stack (:268-280).
 *
 * One deliberate deviation, approved as decision 4: the legacy writer stores `class_aliases` as a
 * pickled Python dict, so loading one executes arbitrary code (SEC-01). Here the aliases travel as
 * JSON inside a NumPy unicode scalar, and a pickled member is refused rather than unpickled.
 *
 * The JSON lives under the name `class_aliases_json`, NOT `class_aliases`, and that detail is
 * load-bearing. Legacy's _restore_aliases (file_manager.py:335-343) calls `.item()` on the member
 * inside a try and then `.items()` on the result OUTSIDE it; for a unicode scalar `.item()` returns
 * a str, so `.items()` raises and the whole legacy load fails with zero segments. Under the new
 * name legacy takes its `if "class_aliases" not in data: return` early exit and reads the masks
 * normally, losing only the alias names. Both names are accepted on read.
 */
import type { ExportContext, LoadedAnnotations } from "../types.js";
/** Render the archive, or null where the legacy exporter writes no file (an empty tensor). */
export declare function renderNpz(ctx: ExportContext): Promise<Uint8Array | null>;
/**
 * Parse an NPZ into segments, one per non-empty channel.
 *
 * Three layouts are accepted, as the legacy loader accepts them: the current `mask` (H, W, C)
 * tensor, a legacy `masks` key holding the same, and a legacy `masks` (N, H, W) stack paired with
 * `class_ids`. A channel maps to a class id through `class_order` when present; without it the
 * channel index is the id, which is only correct for files written before that key existed.
 */
export declare function parseNpz(bytes: Uint8Array): Promise<LoadedAnnotations>;
//# sourceMappingURL=npz.d.ts.map