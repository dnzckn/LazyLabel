"""Annotate rule cards with (a) the brief phase(s) that replace their cited code and (b) a dead-code flag.

Usage: python annotate.py <rules.json> <phase_sizes.json> <out.json>

Dead code comes from ASSESSMENT.md (Appendix B, sections 5.5 and 5.6); function line ranges are computed from
the legacy AST so the check follows the source, not remembered line numbers. A rule is flagged only when every
citation lies inside unreachable code.
"""

import ast
import json
import re
import sys
from pathlib import Path


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1)

LEGACY = Path(r"E:\GitHub\LazyLabel\legacy\lazylabel")
rules_path, sizes_path, out_path = sys.argv[1:4]
res = load_json(rules_path)
sizes = load_json(sizes_path)

DEAD_MODULES = {
    "src/lazylabel/core/app_context.py", "src/lazylabel/core/protocols.py", "src/lazylabel/ui/modes/single_view_mode.py",
    "src/lazylabel/ui/modes/base_mode.py", "src/lazylabel/ui/workers/save_worker.py", "src/lazylabel/ui/utils/scene_utils.py",
}
DEAD_SYMBOLS = {
    "src/lazylabel/core/file_manager.py": ["save_npz", "save_bb_txt"],
    "src/lazylabel/ui/managers/file_navigation_manager.py": ["load_selected_image", "load_selected_image_multi_view"],
    "src/lazylabel/ui/managers/propagation_manager.py": ["get_frame_status", "add_reference_frames", "add_reference_annotations_from_segments",
                                                         "get_next_flagged_frame", "get_prev_flagged_frame", "get_image_path_for_frame"],
    "src/lazylabel/ui/modes/sequence_view_mode.py": ["to_dict", "from_dict"],
    "src/lazylabel/models/sam2_model.py": ["add_video_points"],
    "src/lazylabel/ui/managers/save_export_manager.py": ["_save_viewer_output", "_delete_multi_view_files"],
    "src/lazylabel/ui/managers/crop_manager.py": ["reset_state", "get_crop_for_image_size"],
    "src/lazylabel/core/exporters/__init__.py": ["get_all_output_extensions"],
    "src/lazylabel/core/segment_manager.py": ["convert_ai_segments_to_polygons", "get_class_to_toggle_with_hotkey"],
    "src/lazylabel/ui/workers/propagation_worker.py": ["PropagationSaveWorker"],
    "src/lazylabel/ui/utils/worker_utils.py": ["cleanup_worker_thread_strict", "delete_worker_later", "cleanup_worker_and_thread", "WorkerCleanupContext"],
    "src/lazylabel/ui/main_window.py": ["_enable_sam_functionality", "_toggle_mode", "_get_index_for_path", "_get_next_image_from_file_model",
                                       "_get_next_image_index_from_file_model", "_save_multi_view_ai_predictions", "_get_sequence_image_paths"],
}

dead_ranges: dict[str, list[tuple[int, int, str]]] = {}
for rel, names in DEAD_SYMBOLS.items():
    tree = ast.parse((LEGACY / rel).read_text(encoding="utf-8"))
    found = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name in names:
            found.append((node.lineno, node.end_lineno or node.lineno, node.name))
    missing = set(names) - {f[2] for f in found}
    if missing:
        sys.exit(f"dead symbols not found in {rel}: {sorted(missing)}")
    dead_ranges[rel] = found

# MainWindow method feature groups (same rules as the phase sizing).
mw_rel = "src/lazylabel/ui/main_window.py"
mw_tree = ast.parse((LEGACY / mw_rel).read_text(encoding="utf-8"))
mw_cls = next(n for n in mw_tree.body if isinstance(n, ast.ClassDef) and n.name == "MainWindow")
seq_re = re.compile(r"sequence|propagat|timeline|reference|archetype|frame|trim|flagged|confidence|skip_labeled|save_all")
mv_re = re.compile(r"multi_view|multiview|_mv_|link")
mw_groups = []
for fn in mw_cls.body:
    if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
        g = "P6" if mv_re.search(fn.name.lower()) or seq_re.search(fn.name.lower()) else "P4"
        mw_groups.append((fn.lineno, fn.end_lineno or fn.lineno, g))

file_phase = {f: p for p, files in sizes["phase_files"].items() for f in files}


def citations(src: str):
    out = []
    for part in src.split(";"):
        m = re.search(r"(src/lazylabel/[\w./-]+\.py):(\d+)(?:-(\d+))?", part)
        if m:
            a, b = int(m.group(2)), int(m.group(3) or m.group(2))
            out.append((m.group(1), min(a, b), max(a, b)))
    return out


def phase_of(rel: str, a: int, b: int) -> str | None:
    if rel == mw_rel:
        hits = [g for s, e, g in mw_groups if not (e < a or s > b)]
        return max(set(hits), key=hits.count) if hits else "P4"
    return file_phase.get(rel)


def is_dead(rel: str, a: int, b: int) -> str | None:
    if rel in DEAD_MODULES:
        return rel
    for s, e, name in dead_ranges.get(rel, []):
        if s <= a and b <= e:
            return f"{rel}:{name}"
    return None


flagged = 0
for r in res["confirmedRules"]:
    cites = citations(r["source"])
    phases = sorted({p for c in cites if (p := phase_of(*c))})
    r["phases"] = phases or ["P4"]
    dead = [is_dead(*c) for c in cites]
    if cites and all(dead):
        flagged += 1
        r["deadCode"] = True
        note = ("Every cited implementation is unreachable in production (" + ", ".join(sorted(set(dead)))
                + "; see ASSESSMENT.md Appendix B). Do not port this behavior unless an SME says it is intended.")
        r["suspectedDefect"] = (r.get("suspectedDefect", "") + " | " + note).strip(" |")
dump_json(res, out_path)
print(f"annotated {len(res['confirmedRules'])} rules; dead-code flagged {flagged}")
