#!/usr/bin/env python3
"""Dependency and topology map of the LazyLabel legacy snapshot.

Run (Python 3.10+, standard library only; PyQt6 is used if importable, to tell
inherited QMainWindow members apart from members that are never defined):

    E:/venv/lazylabel/Scripts/python.exe E:/GitHub/LazyLabel/analysis/lazylabel/extract_topology.py

Reads the frozen legacy tree at <repo>/legacy/lazylabel (first argument overrides
it) and never writes there. Writes next to this script:

    topology.json      machine-readable map consumed by TOPOLOGY.html
    call-graph.mmd     domain-level call graph with entry points highlighted
    data-lineage.mmd   code -> data stores, read vs write marked
    critical-path.mmd  the primary persona flow

How edges are found:
  call      Runtime imports, including lazy imports inside functions. Imports under
            `if TYPE_CHECKING:` never execute and are excluded. Names imported through
            a package __init__ are resolved to the module that defines them; the
            package's own re-export imports are kept but flagged, and they do not count
            as "use" when looking for dead ends.
  dispatch  (a) Qt signal connections, emitter module -> slot module, with object types
            resolved from constructor assignments (self.x = Cls(...)), local variables,
            MainWindow back-references and property aliases.
            (b) Attribute reads and calls through a MainWindow back-reference
            (self.mw, self.main_window, or a local `mw` alias), plus one hop into the
            class stored on that MainWindow attribute.
            (c) The exporter registry: every `_register(ExportFormat.X, ...)` call.
            (d) The SAM model factory: SamModel / Sam2Model chosen by checkpoint filename.
            (e) getattr proxies whose object type is known.
            (f) Launchers declared in pyproject.toml, __main__.py and the PyInstaller spec.
  read/write
            Data stores joined through the code's own tables where they exist (exporter
            `_register` suffixes, FileManager._LOAD_CHAIN, CustomFileSystemModel.
            _FORMAT_COLUMNS, FastFileManager suffix literals) and through audited regex
            rules elsewhere. Every rule must match its module, or the script exits non-zero.
"""

from __future__ import annotations

import ast
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
LEGACY = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else REPO / "legacy" / "lazylabel"
SRC = LEGACY / "src"
PKG = "lazylabel"
MAIN_WINDOW = "lazylabel.ui.main_window"
MAIN_WINDOW_CLASS = "MainWindow"
BACKREF_ATTRS = {"mw", "main_window", "_main_window"}
# Module loading by name. importlib.metadata version lookups are not module loading.
LOADER_PATTERN = r"importlib\.import_module|__import__\(|entry_points\(|load_entry_point|pkg_resources\."

# --------------------------------------------------------------------------------------
# Domains: the ten verified domains from analysis/lazylabel/ASSESSMENT.md (Section 3).
# Paths are relative to src/lazylabel. The script fails if a module is missing or doubled.
# --------------------------------------------------------------------------------------
DOMAINS: dict[str, tuple[str, list[str]]] = {
    "runtime_platform": ("Bootstrap and runtime support", [
        "__init__.py", "__main__.py", "_version.py", "main.py", "utils/__init__.py",
        "utils/logger.py", "utils/startup.py", "utils/utils.py", "core/exceptions.py",
        "ui/utils/__init__.py", "ui/utils/scene_utils.py", "ui/utils/worker_utils.py",
    ]),
    "settings_prefs": ("Settings, hotkeys and paths", [
        "config/__init__.py", "config/hotkeys.py", "config/paths.py", "config/settings.py",
        "ui/hotkey_dialog.py", "ui/widgets/settings_widget.py",
    ]),
    "annotation_model": ("Annotation model and undo-redo", [
        "core/__init__.py", "core/segment_manager.py", "core/undo_redo_manager.py",
        "core/app_context.py", "core/protocols.py",
    ]),
    "annotation_io": ("Annotation file IO and export formats", [
        "core/file_manager.py", "core/exporters/__init__.py", "core/exporters/coco.py",
        "core/exporters/createml.py", "core/exporters/npz.py", "core/exporters/npz_class_map.py",
        "core/exporters/pascal_voc.py", "core/exporters/yolo_detection.py",
        "core/exporters/yolo_segmentation.py", "ui/managers/save_export_manager.py",
        "ui/workers/save_worker.py", "ui/widgets/export_format_widget.py",
    ]),
    "app_shell": ("Main window shell and panels", [
        "ui/__init__.py", "ui/main_window.py", "ui/control_panel.py", "ui/right_panel.py",
        "ui/theme.py", "ui/theme_data.py", "ui/managers/__init__.py",
        "ui/managers/notification_manager.py", "ui/managers/panel_popout_manager.py",
        "ui/modes/__init__.py", "ui/widgets/__init__.py", "ui/widgets/status_bar.py",
        "ui/workers/__init__.py", "viewmodels/__init__.py", "viewmodels/single_view_viewmodel.py",
    ]),
    "canvas_editing": ("Canvas, drawing and editing tools", [
        "ui/photo_viewer.py", "ui/editable_vertex.py", "ui/hoverable_ellipse_item.py",
        "ui/hoverable_pixelmap_item.py", "ui/hoverable_polygon_item.py", "ui/handlers/__init__.py",
        "ui/handlers/single_view_mouse_handler.py", "ui/managers/drawing_state_manager.py",
        "ui/managers/edit_mode_manager.py", "ui/managers/keyboard_event_manager.py",
        "ui/managers/mode_manager.py", "ui/managers/multi_view_coordinator.py",
        "ui/managers/polygon_drawing_manager.py", "ui/managers/segment_display_manager.py",
        "ui/managers/segment_table_manager.py", "ui/managers/ui_layout_manager.py",
        "ui/managers/viewport_manager.py", "ui/modes/base_mode.py", "ui/modes/single_view_mode.py",
        "ui/numeric_table_widget_item.py", "ui/reorderable_class_table.py",
        "ui/widgets/annotation_settings_widget.py",
    ]),
    "image_processing": ("Image adjustments, crop and thresholds", [
        "ui/managers/crop_manager.py", "ui/managers/image_adjustment_manager.py",
        "ui/widgets/adjustments_widget.py", "ui/widgets/border_crop_widget.py",
        "ui/widgets/channel_threshold_widget.py", "ui/widgets/fft_threshold_widget.py",
        "ui/widgets/rescale_histogram_dialog.py", "ui/widgets/rescale_widget.py",
    ]),
    "file_navigation": ("Folder browsing and preloading", [
        "utils/custom_file_system_model.py", "utils/fast_file_manager.py",
        "ui/managers/file_navigation_manager.py", "ui/managers/image_preload_manager.py",
        "ui/workers/image_discovery_worker.py", "ui/workers/image_preload_worker.py",
    ]),
    "sequence_timeline": ("Sequence mode and timeline", [
        "ui/modes/sequence_view_mode.py", "ui/widgets/sequence_widget.py",
        "ui/widgets/timeline_widget.py",
    ]),
    "ai_segmentation": ("SAM segmentation and SAM 2 propagation", [
        "ai_availability.py", "core/model_manager.py", "models/__init__.py", "models/sam_model.py",
        "models/sam2_model.py", "ui/managers/ai_segment_manager.py",
        "ui/managers/coordinate_transformer.py", "ui/managers/embedding_cache_manager.py",
        "ui/managers/propagation_manager.py", "ui/managers/sam_multi_view_manager.py",
        "ui/managers/sam_preload_scheduler.py", "ui/managers/sam_single_view_manager.py",
        "ui/managers/sam_worker_manager.py", "ui/widgets/confidence_histogram_dialog.py",
        "ui/widgets/fragment_threshold_widget.py", "ui/widgets/model_selection_widget.py",
        "ui/workers/multi_view_sam_init_worker.py", "ui/workers/propagation_worker.py",
        "ui/workers/reference_finder_worker.py", "ui/workers/sam_update_worker.py",
        "ui/workers/single_view_sam_init_worker.py",
    ]),
}

# --------------------------------------------------------------------------------------
# Data stores that no code table describes. Location strings are logical patterns, not
# raw config values. Sidecar stores are derived from the exporter registry below.
# --------------------------------------------------------------------------------------
STATIC_STORES: dict[str, tuple[str, str]] = {
    "ds:image_files": ("Image folder (png, jpg, jpeg, tiff, tif)", "user-selected folder"),
    "ds:settings_json": ("settings.json", "~/.config/lazylabel/settings.json"),
    "ds:hotkeys_json": ("hotkeys.json", "~/.config/lazylabel/hotkeys.json"),
    "ds:app_log": ("lazylabel.log", "~/.lazylabel/logs/lazylabel.log"),
    "ds:model_checkpoints": ("Model checkpoints (*.pth, *.pt)", "models/ inside the package"),
    "ds:sam2_frame_cache": ("SAM 2 frame staging (JPEG)", "%TEMP%/sam2_video_*/"),
    "ds:theme_icon_cache": ("Theme icon cache (SVG)", "~/.cache/lazylabel/theme-icons/"),
    "ds:pyproject_toml": ("pyproject.toml (version fallback)", "repository root"),
    "ds:legacy_alias_json": ("*.json class-alias file (removed format)", "beside each image"),
}

# Hosts are added only when the host_regex finds the host name in the module source,
# except where the note says the URL lives inside a third-party library.
HOST_RULES = [
    # (kind, module, call evidence regex, host regex or None, fixed host, note)
    ("read", "lazylabel.models.sam_model", r"requests\.get\(url", r"https://([A-Za-z0-9.-]+)/segment_anything", None,
     "SAM 1 checkpoint download"),
    ("read", "lazylabel.ui.workers.reference_finder_worker", r"MobileNet_V3_Small_Weights\.IMAGENET1K_V1", None,
     "download.pytorch.org", "MobileNetV3 weights, URL defined inside torchvision"),
]

STORE_RULES = [
    # (store, kind, module, evidence regex)
    ("ds:settings_json", "read", "lazylabel.config.settings", r"json\.load\(f\)"),
    ("ds:settings_json", "write", "lazylabel.config.settings", r"json\.dump\(asdict\(self\)"),
    ("ds:hotkeys_json", "read", "lazylabel.config.hotkeys", r"json\.load\(f\)"),
    ("ds:hotkeys_json", "write", "lazylabel.config.hotkeys", r"json\.dump\(data, f"),
    ("ds:app_log", "write", "lazylabel.utils.logger", r"logging\.FileHandler\(log_path\)"),
    ("ds:model_checkpoints", "read", "lazylabel.core.model_manager", r"os\.walk\(folder_path\)"),
    ("ds:model_checkpoints", "read", "lazylabel.models.sam_model",
     r"sam_model_registry\[model_type\]\(checkpoint=model_path\)"),
    ("ds:model_checkpoints", "write", "lazylabel.models.sam_model", r'open\(download_path, "wb"\)'),
    ("ds:model_checkpoints", "read", "lazylabel.models.sam2_model", r"torch\.load\("),
    ("ds:model_checkpoints", "read", "lazylabel.ui.workers.reference_finder_worker", r"torch\.load\("),
    ("ds:model_checkpoints", "write", "lazylabel.ui.workers.reference_finder_worker", r"torch\.save\("),
    ("ds:sam2_frame_cache", "write", "lazylabel.models.sam2_model", r'tempfile\.mkdtemp\(prefix="sam2_video_"\)'),
    ("ds:sam2_frame_cache", "read", "lazylabel.models.sam2_model", r"video_predictor\.init_state\("),
    ("ds:theme_icon_cache", "write", "lazylabel.ui.theme", r"write_bytes\(data\)"),
    ("ds:theme_icon_cache", "read", "lazylabel.ui.theme", r"target\.exists\(\) and target\.stat\(\)"),
    ("ds:pyproject_toml", "read", "lazylabel", r"pyproject_path\.read_text\("),
    ("ds:legacy_alias_json", "write", "lazylabel.ui.managers.save_export_manager", r"os\.remove\(json_path\)"),
]

# Reading image pixels or listing image files, detected in every module.
IMAGE_READ_PATTERNS = [
    r"cv2\.imread\(",
    r"Image\.open\(",
    r"QPixmap\([^()]*path[^()]*\)",
    r"QImage\([^,()]*path[^,()]*\)",
    r"os\.scandir\(",
    r"setNameFilters\(",
]

# --------------------------------------------------------------------------------------
# Screens: user-facing surfaces. implemented_by rows must match their module's source.
# readers are modules that consume user input from the surface outside signal wiring.
# Hosted widgets of the two side panels are added automatically from constructor calls.
# --------------------------------------------------------------------------------------
SCREENS = [
    {"id": "scr:main_window", "name": "Main window",
     "implemented_by": [(MAIN_WINDOW, r"class MainWindow\(QMainWindow\)")],
     "readers": [("lazylabel.ui.managers.keyboard_event_manager", r"def handle_space_press\(")]},
    {"id": "scr:tab_single", "name": "Single view tab",
     "implemented_by": [(MAIN_WINDOW, r'addTab\(self\.single_view_widget, "Single"\)'),
                        ("lazylabel.ui.photo_viewer", r"class PhotoViewer\(QGraphicsView\)")],
     "readers": [("lazylabel.ui.handlers.single_view_mouse_handler", r"def handle_mouse_press\(")]},
    {"id": "scr:tab_multi", "name": "Multi view tab (two viewers)",
     "implemented_by": [(MAIN_WINDOW, r'addTab\(self\.multi_view_widget, "Multi"\)'),
                        ("lazylabel.ui.photo_viewer", r"class PhotoViewer\(QGraphicsView\)")],
     "readers": [(MAIN_WINDOW, r"def eventFilter\(")]},
    {"id": "scr:tab_sequence", "name": "Sequence tab (timeline and propagation)",
     "implemented_by": [(MAIN_WINDOW, r'addTab\(self\.sequence_view_widget, "Sequence"\)'),
                        ("lazylabel.ui.widgets.sequence_widget", r"class SequenceWidget\("),
                        ("lazylabel.ui.widgets.timeline_widget", r"class ZoomableTimeline\("),
                        ("lazylabel.ui.photo_viewer", r"class PhotoViewer\(QGraphicsView\)")],
     "readers": [("lazylabel.ui.handlers.single_view_mouse_handler", r"def handle_mouse_press\(")]},
    {"id": "scr:control_panel", "name": "Control panel (Global and Image tabs)",
     "implemented_by": [("lazylabel.ui.control_panel", r'addTab\(ai_tab, "Global"\)')],
     "host_module": "lazylabel.ui.control_panel", "readers": []},
    {"id": "scr:right_panel", "name": "Right panel (file table, segments, classes)",
     "implemented_by": [("lazylabel.ui.right_panel", r"class RightPanel\(QWidget\)")],
     "host_module": "lazylabel.ui.right_panel", "readers": []},
    {"id": "scr:status_bar", "name": "Status bar",
     "implemented_by": [("lazylabel.ui.widgets.status_bar", r"class StatusBar\(QStatusBar\)")], "readers": []},
    {"id": "scr:hotkey_dialog", "name": "Hotkey editor dialog",
     "implemented_by": [("lazylabel.ui.hotkey_dialog", r"class HotkeyDialog\(QDialog\)")],
     "readers": [(MAIN_WINDOW, r"dialog = HotkeyDialog\(")]},
    {"id": "scr:popout_window", "name": "Pop-out panel window",
     "implemented_by": [("lazylabel.ui.managers.panel_popout_manager", r"class PanelPopoutWindow\(QDialog\)")],
     "readers": []},
    {"id": "scr:confidence_histogram", "name": "Confidence histogram dialog",
     "implemented_by": [("lazylabel.ui.widgets.confidence_histogram_dialog", r"class ConfidenceHistogramDialog\(QDialog\)")],
     "readers": [(MAIN_WINDOW, r"dlg\.exec\(\) == ConfidenceHistogramDialog")]},
    {"id": "scr:rescale_histogram", "name": "Rescale histogram dialog",
     "implemented_by": [("lazylabel.ui.widgets.rescale_histogram_dialog", r"class RescaleHistogramDialog\(QDialog\)")],
     "readers": [(MAIN_WINDOW, r"RescaleHistogramDialog")]},
    {"id": "scr:pick_image_folder", "name": "Select Image Folder picker",
     "implemented_by": [], "readers": [(MAIN_WINDOW, r'QFileDialog\.getExistingDirectory\(self, "Select Image Folder"\)')]},
    {"id": "scr:pick_models_folder", "name": "Select Models Folder picker",
     "implemented_by": [], "readers": [(MAIN_WINDOW, r'QFileDialog\.getExistingDirectory\(self, "Select Models Folder"\)')]},
]

# The factory that picks a model class from the checkpoint filename (ASSESSMENT.md 5.7).
FACTORIES = [
    ("lazylabel.core.model_manager", r"def detect_model_type\(", ["SamModel", "Sam2Model"]),
    ("lazylabel.ui.workers.multi_view_sam_init_worker", r"def _is_sam2_model\(", ["SamModel", "Sam2Model"]),
]

# --------------------------------------------------------------------------------------
# Persona flows. Node ids are validated against the tree; the step order follows the code
# paths cited in the comments (verified against source).
# --------------------------------------------------------------------------------------
FLOWS = []  # filled in below the analysis so the ids can be validated; see define_flows()

# ======================================================================================
# Parsing
# ======================================================================================


@dataclass
class Module:
    name: str
    rel: str  # relative to src/lazylabel
    path: Path
    is_package: bool
    source: str
    tree: ast.Module
    loc: int
    domain: str = ""
    type_checking_lines: set[int] = field(default_factory=set)
    code: str = ""  # source with docstrings and comments blanked, line numbers preserved


def strip_docs_and_comments(text: str, tree: ast.Module) -> str:
    import io
    import tokenize

    lines = text.splitlines(keepends=True)
    kill: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            kill.update(range(node.lineno, (node.end_lineno or node.lineno) + 1))
    out = ["\n" if i in kill else line for i, line in enumerate(lines, 1)]
    try:
        for tok in tokenize.generate_tokens(io.StringIO("".join(out)).readline):
            if tok.type == tokenize.COMMENT:
                row, col = tok.start
                line = out[row - 1]
                out[row - 1] = line[:col].rstrip() + ("\n" if line.endswith("\n") else "")
    except (tokenize.TokenError, IndentationError):
        pass
    return "".join(out)


@dataclass
class ClassInfo:
    module: str
    name: str
    bases: list[str]
    node: ast.ClassDef
    raw_attr_calls: dict[str, list[str]] = field(default_factory=dict)  # attr -> constructor names seen
    backref_attrs: set[str] = field(default_factory=set)
    prop_alias: dict[str, list[str]] = field(default_factory=dict)  # property -> attribute chain from MainWindow
    self_alias: dict[str, str] = field(default_factory=dict)  # property -> own attribute it returns
    method_returns: dict[str, str] = field(default_factory=dict)  # method -> own attribute it returns
    methods: set[str] = field(default_factory=set)
    assigned_attrs: set[str] = field(default_factory=set)
    class_attrs: set[str] = field(default_factory=set)


def discover_modules() -> dict[str, Module]:
    pkg_dir = SRC / PKG
    if not pkg_dir.is_dir():
        sys.exit(f"legacy source not found: {pkg_dir}")
    mods: dict[str, Module] = {}
    for path in sorted(pkg_dir.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        parts = list(path.relative_to(SRC).with_suffix("").parts)
        is_pkg = parts[-1] == "__init__"
        if is_pkg:
            parts = parts[:-1]
        text = path.read_text(encoding="utf-8")
        tree = ast.parse(text, str(path))
        mod = Module(
            name=".".join(parts),
            rel=path.relative_to(pkg_dir).as_posix(),
            path=path,
            is_package=is_pkg,
            source=text,
            tree=tree,
            loc=len(text.splitlines()),
        )
        mod.type_checking_lines = type_checking_lines(tree)
        mod.code = strip_docs_and_comments(text, tree)
        mods[mod.name] = mod
    return mods


def type_checking_lines(tree: ast.Module) -> set[int]:
    lines: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.If):
            test = node.test
            name = test.id if isinstance(test, ast.Name) else getattr(test, "attr", None)
            if name == "TYPE_CHECKING":
                for stmt in node.body:
                    for sub in ast.walk(stmt):
                        if hasattr(sub, "lineno"):
                            lines.add(sub.lineno)
    return lines


def assign_domains(mods: dict[str, Module]) -> None:
    seen: Counter[str] = Counter()
    by_rel = {m.rel: m for m in mods.values()}
    for dom, (_, files) in DOMAINS.items():
        for rel in files:
            if rel not in by_rel:
                sys.exit(f"domain {dom} lists {rel}, which is not in the source tree")
            by_rel[rel].domain = dom
            seen[rel] += 1
    missing = [m.rel for m in mods.values() if not m.domain]
    doubled = [r for r, c in seen.items() if c > 1]
    if missing or doubled:
        sys.exit(f"domain assignment broken: missing={missing} doubled={doubled}")


def line_of(mod: Module, pattern: str) -> int | None:
    """First line matching `pattern` in code (docstrings and comments ignored)."""
    m = re.search(pattern, mod.code)
    return mod.code.count("\n", 0, m.start()) + 1 if m else None


# ======================================================================================
# Import resolution and symbol tables
# ======================================================================================


def base_of_import(mod: Module, level: int, modname: str | None) -> str:
    if level == 0:
        return modname or ""
    parts = mod.name.split(".") if mod.is_package else mod.name.split(".")[:-1]
    if level > 1:
        parts = parts[: len(parts) - (level - 1)]
    return ".".join(parts + ([modname] if modname else []))


def enclosing_function_lines(tree: ast.Module) -> set[int]:
    lines: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for sub in ast.walk(node):
                if isinstance(sub, (ast.Import, ast.ImportFrom)):
                    lines.add(sub.lineno)
    return lines


class Index:
    def __init__(self, mods: dict[str, Module]):
        self.mods = mods
        self.classes: dict[tuple[str, str], ClassInfo] = {}
        self.class_by_name: dict[str, list[str]] = defaultdict(list)
        self.top_defs: dict[str, set[str]] = defaultdict(set)
        self.exports: dict[str, dict[str, tuple[str, str]]] = defaultdict(dict)
        self.local_names: dict[str, dict[str, tuple[str, str | None]]] = defaultdict(dict)
        self.type_names: dict[str, dict[str, tuple[str, str | None]]] = defaultdict(dict)
        self.imports: list[dict] = []
        self._build()

    # -- building --------------------------------------------------------------------
    def _build(self) -> None:
        for mod in self.mods.values():
            for node in mod.tree.body:
                if isinstance(node, ast.ClassDef):
                    self.top_defs[mod.name].add(node.name)
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    self.top_defs[mod.name].add(node.name)
                elif isinstance(node, ast.Assign):
                    for t in node.targets:
                        if isinstance(t, ast.Name):
                            self.top_defs[mod.name].add(t.id)
            for node in ast.walk(mod.tree):
                if isinstance(node, ast.ClassDef):
                    self._index_class(mod, node)
        for mod in self.mods.values():
            if mod.is_package:
                self._index_barrel(mod)
        for mod in self.mods.values():
            self._index_imports(mod)

    def _index_class(self, mod: Module, node: ast.ClassDef) -> None:
        info = ClassInfo(module=mod.name, name=node.name, bases=[ast.unparse(b) for b in node.bases], node=node)
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                info.methods.add(item.name)
                kind, value = returned_attribute(item)
                if kind == "backref_chain":
                    info.prop_alias[item.name] = value
                elif kind == "self_attr":
                    if is_property(item):
                        info.self_alias[item.name] = value[0]
                    else:
                        info.method_returns[item.name] = value[0]
            elif isinstance(item, (ast.Assign, ast.AnnAssign)):
                targets = item.targets if isinstance(item, ast.Assign) else [item.target]
                for t in targets:
                    if isinstance(t, ast.Name):
                        info.class_attrs.add(t.id)
        for sub in ast.walk(node):
            if isinstance(sub, (ast.Assign, ast.AnnAssign)):
                targets = sub.targets if isinstance(sub, ast.Assign) else [sub.target]
                value = sub.value
                for t in targets:
                    if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id == "self":
                        info.assigned_attrs.add(t.attr)
                        if t.attr in BACKREF_ATTRS:
                            info.backref_attrs.add(t.attr)
                        if isinstance(value, ast.Call):
                            cname = call_name(value.func)
                            if cname and cname.split(".")[-1][:1].isupper():
                                seen = info.raw_attr_calls.setdefault(t.attr, [])
                                if cname not in seen:
                                    seen.append(cname)
        self.classes[(mod.name, node.name)] = info
        self.class_by_name[node.name].append(mod.name)

    def _index_barrel(self, mod: Module) -> None:
        for node in mod.tree.body:
            if isinstance(node, ast.ImportFrom) and node.lineno not in mod.type_checking_lines:
                base = base_of_import(mod, node.level, node.module)
                for alias in node.names:
                    if alias.name != "*":
                        self.exports[mod.name][alias.asname or alias.name] = (base, alias.name)

    def resolve_symbol(self, base: str, name: str, depth: int = 0) -> str | None:
        """Module that defines `name` when imported from `base` (None when external)."""
        if not (base == PKG or base.startswith(PKG + ".")):
            return None
        sub = f"{base}.{name}"
        if sub in self.mods:
            return sub
        if base in self.mods:
            mod = self.mods[base]
            if name in self.top_defs[base] or not mod.is_package:
                return base
            if name in self.exports.get(base, {}) and depth < 8:
                src_base, src_name = self.exports[base][name]
                return self.resolve_symbol(src_base, src_name, depth + 1) or base
            return base
        return None

    def _index_imports(self, mod: Module) -> None:
        lazy_lines = enclosing_function_lines(mod.tree)
        barrel_uses = names_used(mod.tree) if mod.is_package else set()
        for node in ast.walk(mod.tree):
            if not isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            type_only = node.lineno in mod.type_checking_lines
            lazy = node.lineno in lazy_lines
            targets: list[tuple[str, str, str | None]] = []  # (local, target module, original name)
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == PKG or alias.name.startswith(PKG + "."):
                        parts = alias.name.split(".")
                        while parts and ".".join(parts) not in self.mods:
                            parts.pop()
                        if parts:
                            targets.append((alias.asname or alias.name.split(".")[0], ".".join(parts), None))
            else:
                base = base_of_import(mod, node.level, node.module)
                if not (base == PKG or base.startswith(PKG + ".")):
                    continue
                for alias in node.names:
                    if alias.name == "*":
                        targets.append(("*", base, "*"))
                        continue
                    target = self.resolve_symbol(base, alias.name)
                    if target:
                        targets.append((alias.asname or alias.name, target, alias.name))
            for local, target, orig in targets:
                table = self.type_names if type_only else self.local_names
                table[mod.name][local] = (target, orig)
                if type_only:
                    self.type_names[mod.name][local] = (target, orig)
                reexport = (
                    mod.is_package
                    and not lazy
                    and not type_only
                    and local not in barrel_uses
                    and isinstance(node, ast.ImportFrom)
                )
                self.imports.append({
                    "source": mod.name, "target": target, "line": node.lineno, "name": orig,
                    "type_only": type_only, "lazy": lazy, "reexport": reexport,
                })

    # -- lookups ---------------------------------------------------------------------
    def resolve_class(self, module: str, name: str) -> tuple[str | None, str]:
        """(defining module or None for external, class name) for a name used in `module`."""
        head = name.split(".")[0]
        if name in self.top_defs[module] and (module, name) in self.classes:
            return module, name
        for table in (self.local_names, self.type_names):
            if head in table[module]:
                target, orig = table[module][head]
                cls = orig if (orig and "." not in name) else name.split(".")[-1]
                if (target, cls) in self.classes:
                    return target, cls
                owners = [m for m in self.class_by_name.get(cls, []) if m.startswith(target)]
                if owners:
                    return owners[0], cls
        for (mname, cname), _ in self.classes.items():
            if mname == module and cname == name:
                return module, name
        return None, name

    def attr_types(self, owner: tuple[str | None, str] | None, attr: str, depth: int = 0) -> list[tuple[str | None, str]]:
        """Every class an attribute can hold (several when a factory assigns different classes)."""
        if not owner or owner[0] is None or depth > 6:
            return []
        info = self.classes.get(owner)
        if not info:
            return []
        if attr in info.backref_attrs:
            return [(MAIN_WINDOW, MAIN_WINDOW_CLASS)]
        if attr in info.prop_alias:
            types = [(MAIN_WINDOW, MAIN_WINDOW_CLASS)]
            for step in info.prop_alias[attr]:
                types = [t for o in types for t in self.attr_types(o, step, depth + 1)]
            return types
        if attr in info.self_alias:
            return self.attr_types(owner, info.self_alias[attr], depth + 1)
        if attr in info.raw_attr_calls:
            return [self.resolve_class(owner[0], c) for c in info.raw_attr_calls[attr]]
        return []

    def attr_type(self, owner: tuple[str | None, str] | None, attr: str) -> tuple[str | None, str] | None:
        types = self.attr_types(owner, attr)
        return types[0] if types else None

    def method_return_types(self, owner: tuple[str | None, str] | None, method: str) -> list[tuple[str | None, str]]:
        info = self.classes.get(owner) if owner and owner[0] else None
        if info and method in info.method_returns:
            return self.attr_types(owner, info.method_returns[method])
        return []


def call_name(func: ast.expr) -> str | None:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        inner = call_name(func.value)
        return f"{inner}.{func.attr}" if inner else None
    return None


def is_property(fn: ast.FunctionDef) -> bool:
    return any(isinstance(d, ast.Name) and d.id == "property" for d in fn.decorator_list)


def attribute_chain(expr: ast.expr) -> tuple[str | None, list[str]]:
    """`self.a.b.c` -> ("self", ["a", "b", "c"])."""
    chain: list[str] = []
    while isinstance(expr, ast.Attribute):
        chain.append(expr.attr)
        expr = expr.value
    root = expr.id if isinstance(expr, ast.Name) else None
    return root, list(reversed(chain))


def returned_attribute(fn: ast.FunctionDef) -> tuple[str | None, list[str]]:
    """Classify `return self.mw.a.b` (backref_chain [a, b]) and `return self.x` (self_attr [x])."""
    returns = [s for s in ast.walk(fn) if isinstance(s, ast.Return) and s.value is not None]
    for stmt in returns:
        if isinstance(stmt.value, ast.Attribute):
            root, chain = attribute_chain(stmt.value)
            if root != "self" or not chain:
                continue
            if chain[0] in BACKREF_ATTRS and len(chain) > 1:
                return "backref_chain", chain[1:]
            if len(chain) == 1 and len(returns) == 1:
                return "self_attr", chain
    return None, []


def names_used(tree: ast.Module) -> set[str]:
    used: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            used.add(node.id)
    return used


# ======================================================================================
# Runtime edges: back-references, signals, proxies, registry, factory
# ======================================================================================


class Graph:
    def __init__(self) -> None:
        self.edges: dict[tuple[str, str, str], dict] = {}

    def add(self, source: str, target: str, kind: str, evidence: str, **extra) -> None:
        if source == target:
            return
        key = (source, target, kind)
        rec = self.edges.setdefault(key, {"source": source, "target": target, "kind": kind,
                                          "evidence": [], "count": 0, **extra})
        rec["count"] += 1
        if len(rec["evidence"]) < 3 and evidence not in rec["evidence"]:
            rec["evidence"].append(evidence)
        for k, v in extra.items():
            if k == "reexport":
                rec["reexport"] = rec.get("reexport", True) and v


class RuntimeScanner(ast.NodeVisitor):
    """Finds dispatch edges: back-reference access, signal wiring, attribute chains, proxies."""

    def __init__(self, index: Index, mod: Module, graph: Graph, stats: dict, mw_members: set[str]):
        self.ix = index
        self.mod = mod
        self.g = graph
        self.stats = stats
        self.mw_members = mw_members
        self.class_stack: list[ClassInfo] = []
        # local name -> (candidate types, "ctor" when built here so an import edge exists, else "chain")
        self.local_types: list[dict[str, tuple[list[tuple[str | None, str]], str]]] = [{}]
        self.aliases: list[set[str]] = [set()]

    # -- helpers ---------------------------------------------------------------------
    def ev(self, node: ast.AST) -> str:
        return f"src/lazylabel/{self.mod.rel}:{node.lineno}"

    def current_class(self) -> tuple[str | None, str] | None:
        return (self.mod.name, self.class_stack[-1].name) if self.class_stack else None

    def is_backref(self, expr: ast.expr) -> bool:
        if isinstance(expr, ast.Attribute) and expr.attr in BACKREF_ATTRS \
                and isinstance(expr.value, ast.Name) and expr.value.id == "self":
            return True
        return isinstance(expr, ast.Name) and expr.id in self.aliases[-1]

    def expr_types(self, expr: ast.expr) -> list[tuple[str | None, str]]:
        if isinstance(expr, ast.Name):
            if expr.id == "self":
                cur = self.current_class()
                return [cur] if cur else []
            if expr.id in self.aliases[-1]:
                return [(MAIN_WINDOW, MAIN_WINDOW_CLASS)]
            entry = self.local_types[-1].get(expr.id)
            return list(entry[0]) if entry else []
        if isinstance(expr, ast.Attribute):
            if self.is_backref(expr):
                return [(MAIN_WINDOW, MAIN_WINDOW_CLASS)]
            return [t for owner in self.expr_types(expr.value) for t in self.ix.attr_types(owner, expr.attr)]
        if isinstance(expr, ast.Call) and isinstance(expr.func, ast.Attribute):
            owners = self.expr_types(expr.func.value)
            if expr.func.attr == "scene":
                return owners
            return [t for owner in owners for t in self.ix.method_return_types(owner, expr.func.attr)]
        return []

    def expr_type(self, expr: ast.expr) -> tuple[str | None, str] | None:
        types = self.expr_types(expr)
        return types[0] if types else None

    def via_chain(self, expr: ast.expr) -> bool:
        """True when the object's type was not constructed in this module, so no import edge covers it."""
        if isinstance(expr, ast.Name):
            entry = self.local_types[-1].get(expr.id)
            return bool(entry) and entry[1] == "chain"
        root, chain = attribute_chain(expr)
        if root == "self" and len(chain) == 1:
            info = self.class_stack[-1] if self.class_stack else None
            return bool(info) and (chain[0] in info.prop_alias or chain[0] in info.self_alias)
        return root is not None and len(chain) >= 1

    def slot_module(self, slot: ast.expr) -> str | None:
        if isinstance(slot, ast.Call) and call_name(slot.func) in {"partial", "functools.partial"} and slot.args:
            return self.slot_module(slot.args[0])
        if isinstance(slot, ast.Lambda):
            for sub in ast.walk(slot.body):
                if isinstance(sub, ast.Call):
                    return self.slot_module(sub.func)
            return self.mod.name
        if isinstance(slot, ast.Name):
            return self.mod.name
        if isinstance(slot, ast.Attribute):
            root, chain = attribute_chain(slot)
            if root == "self" and len(chain) == 2 and chain[1] == "emit":
                return self.mod.name  # forwarding to one of this class's own signals
            owner = self.expr_type(slot.value)
            if owner:
                return owner[0]
        return None

    # -- scope tracking --------------------------------------------------------------
    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        info = self.ix.classes.get((self.mod.name, node.name))
        if info:
            self.class_stack.append(info)
        self.generic_visit(node)
        if info:
            self.class_stack.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.local_types.append({})
        self.aliases.append(set())
        self.generic_visit(node)
        self.local_types.pop()
        self.aliases.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Assign(self, node: ast.Assign) -> None:
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            value = node.value
            ctor = call_name(value.func) if isinstance(value, ast.Call) else None
            if self.is_backref(value):
                self.aliases[-1].add(name)
            elif ctor and ctor.split(".")[-1][:1].isupper():
                self.local_types[-1][name] = ([self.ix.resolve_class(self.mod.name, ctor)], "ctor")
            elif isinstance(value, (ast.Attribute, ast.Call)):
                types = self.expr_types(value)
                if types:
                    self.local_types[-1][name] = (types, "chain")
        self.generic_visit(node)

    # -- edges -----------------------------------------------------------------------
    def visit_Attribute(self, node: ast.Attribute) -> None:
        value = node.value
        if self.mod.name != MAIN_WINDOW and self.is_backref(value):
            self.stats["backref_accesses"] += 1
            self.stats["backref_members"][node.attr].add(self.mod.name)
            self.g.add(self.mod.name, MAIN_WINDOW, "dispatch", self.ev(node), via="back-reference")
            if node.attr not in self.mw_members:
                self.stats["ghost_members"][node.attr].append(self.ev(node))
        elif isinstance(value, (ast.Attribute, ast.Name)) and not (isinstance(value, ast.Name) and value.id == "self") \
                and self.via_chain(value):
            for t in self.expr_types(value):
                if t[0] and t[0] != self.mod.name:
                    self.stats["chain_accesses"] += 1
                    self.g.add(self.mod.name, t[0], "dispatch", self.ev(node), via=f"attribute chain .{node.attr}")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        # Qt signal connection: <emitter>.<signal>.connect(<slot>)
        if isinstance(func, ast.Attribute) and func.attr == "connect" and isinstance(func.value, ast.Attribute) and node.args:
            self.stats["connections"] += 1
            emitter_expr = func.value.value
            emitters = self.expr_types(emitter_expr)
            receiver = self.slot_module(node.args[0])
            root, _chain = attribute_chain(emitter_expr)
            backref_rooted = self.is_backref(emitter_expr) or (
                isinstance(emitter_expr, ast.Attribute) and self.is_backref(emitter_expr.value))
            if emitters and all(e[0] is None for e in emitters):
                self.stats["connections_external"] += 1
            elif emitters and receiver:
                self.stats["connections_resolved"] += 1
                for emitter in emitters:
                    if emitter[0]:
                        self.stats["signal_pairs"].append((emitter[0], receiver))
                        self.g.add(emitter[0], receiver, "dispatch", self.ev(node), via=f"signal {func.value.attr}")
            elif not emitters and receiver == self.mod.name and not backref_rooted \
                    and (root == "self" or isinstance(emitter_expr, ast.Name)):
                self.stats["connections_internal_untyped"] += 1
            else:
                self.stats["connections_unresolved"].append(self.ev(node))
        name = call_name(func)
        if name in {"getattr", "hasattr", "setattr"} and len(node.args) > 1:
            obj = node.args[0]
            literal = node.args[1].value if isinstance(node.args[1], ast.Constant) else None
            if self.mod.name != MAIN_WINDOW and self.is_backref(obj):
                if isinstance(literal, str):
                    self.stats["backref_members"][literal].add(self.mod.name)
                    if literal not in self.mw_members:
                        self.stats["ghost_members"][literal].append(self.ev(node))
            elif literal is None:
                for t in self.expr_types(obj):
                    if t[0] and t[0] != self.mod.name:
                        self.stats["proxies"].append(self.ev(node))
                        self.g.add(self.mod.name, t[0], "dispatch", self.ev(node), via=f"{name} proxy")
        if name and name.endswith("singleShot") and len(node.args) >= 2:
            target = self.slot_module(node.args[1])
            if target and target != self.mod.name:
                self.g.add(self.mod.name, target, "dispatch", self.ev(node), via="QTimer.singleShot")
        self.generic_visit(node)


def mainwindow_members(index: Index) -> set[str]:
    info = index.classes.get((MAIN_WINDOW, MAIN_WINDOW_CLASS))
    members = set(info.methods | info.assigned_attrs | info.class_attrs) if info else set()
    # Attributes other modules assign onto MainWindow through a back-reference also exist.
    for mod in index.mods.values():
        for node in ast.walk(mod.tree):
            if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                for t in targets:
                    if isinstance(t, ast.Attribute):
                        v = t.value
                        if (isinstance(v, ast.Attribute) and v.attr in BACKREF_ATTRS
                                and isinstance(v.value, ast.Name) and v.value.id == "self") \
                                or (isinstance(v, ast.Name) and v.id in {"mw", "main_window"}):
                            members.add(t.attr)
    try:  # inherited Qt members are defined, not ghosts
        from PyQt6.QtWidgets import QMainWindow  # noqa: PLC0415

        members |= set(dir(QMainWindow))
    except Exception:  # noqa: BLE001 - PyQt6 is optional for this script
        pass
    return members


# ======================================================================================
# Data stores
# ======================================================================================


def registry(mods: dict[str, Module]) -> tuple[dict[str, tuple[str, str, int]], dict[str, str]]:
    reg: dict[str, tuple[str, str, int]] = {}
    for mod in mods.values():
        if not mod.name.startswith("lazylabel.core.exporters."):
            continue
        for m in re.finditer(r'_register\(\s*ExportFormat\.(\w+),\s*\w+\(\),\s*\{"([^"]+)"\}\s*\)', mod.source):
            reg[mod.name] = (m.group(1), m.group(2), mod.source.count("\n", 0, m.start()) + 1)
    labels: dict[str, str] = {}
    init = mods["lazylabel.core.exporters"].source
    for m in re.finditer(r'ExportFormat\.(\w+): "([^"]+)"', init):
        labels.setdefault(m.group(1), m.group(2))
    if len(reg) != 7:
        sys.exit(f"expected 7 registered exporters, found {len(reg)}: {sorted(reg)}")
    return reg, labels


def constant_tuple_suffixes(mod: Module, class_name: str | None, attr: str) -> tuple[list[str], int]:
    for node in ast.walk(mod.tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if any(isinstance(t, ast.Name) and t.id == attr for t in targets) and node.value is not None:
                out = [el.elts[0].value for el in getattr(node.value, "elts", [])
                       if isinstance(el, (ast.Tuple, ast.List)) and isinstance(el.elts[0], ast.Constant)]
                return out, node.lineno
    sys.exit(f"table {attr} not found in {mod.rel}")


def build_stores(mods: dict[str, Module], graph: Graph) -> tuple[list[dict], dict[str, str]]:
    reg, labels = registry(mods)
    stores: list[dict] = []
    suffix_store: dict[str, str] = {}
    for mod_name, (fmt, suffix, line) in sorted(reg.items(), key=lambda kv: kv[1][2]):
        sid = f"ds:sidecar_{fmt.lower()}"
        suffix_store[suffix] = sid
        stores.append({"id": sid, "name": f"*{suffix} ({labels.get(fmt, fmt)})", "kind": "datastore",
                       "file": "beside each image"})
        graph.add(mod_name, sid, "write", f"src/lazylabel/{mods[mod_name].rel}:{line}", via="_register")
    exporters = mods["lazylabel.core.exporters"]
    del_line = line_of(exporters, r"def delete_all_outputs\(")
    for sid in suffix_store.values():
        graph.add(exporters.name, sid, "write", f"src/lazylabel/{exporters.rel}:{del_line}", via="delete_all_outputs")

    fm = mods["lazylabel.core.file_manager"]
    chain, chain_line = constant_tuple_suffixes(fm, "FileManager", "_LOAD_CHAIN")
    for suffix in chain:
        graph.add(fm.name, suffix_store[suffix], "read", f"src/lazylabel/{fm.rel}:{chain_line}", via="_LOAD_CHAIN")
    # Legacy FileManager writers: functions that write and name a sidecar suffix.
    for node in ast.walk(fm.tree):
        if isinstance(node, ast.FunctionDef):
            body = ast.get_source_segment(fm.source, node) or ""
            if re.search(r"np\.savez_compressed\(|open\([^)]*\"w\"", body):
                for const in {c.value for c in ast.walk(node) if isinstance(c, ast.Constant) and isinstance(c.value, str)}:
                    if const in suffix_store:
                        graph.add(fm.name, suffix_store[const], "write", f"src/lazylabel/{fm.rel}:{node.lineno}",
                                  via=f"FileManager.{node.name}")

    cfs = mods["lazylabel.utils.custom_file_system_model"]
    cols, cols_line = constant_tuple_suffixes(cfs, None, "_FORMAT_COLUMNS")
    for suffix in cols:
        graph.add(cfs.name, suffix_store[suffix], "read", f"src/lazylabel/{cfs.rel}:{cols_line}", via="_FORMAT_COLUMNS")

    ffm = mods["lazylabel.utils.fast_file_manager"]
    for suffix, sid in suffix_store.items():
        pat = r'["\']' + re.escape(suffix) + r'["\)]' if suffix.startswith(".") else re.escape(suffix) + r'["\']'
        line = line_of(ffm, pat)
        if line:
            graph.add(ffm.name, sid, "read", f"src/lazylabel/{ffm.rel}:{line}", via="suffix literal")

    for sid, (name, where) in STATIC_STORES.items():
        stores.append({"id": sid, "name": name, "kind": "datastore", "file": where})
    for store, kind, mod_name, pat in STORE_RULES:
        mod = mods[mod_name]
        line = line_of(mod, pat)
        if line is None:
            sys.exit(f"store rule did not match: {store} {kind} {mod_name} /{pat}/")
        graph.add(mod_name, store, kind, f"src/lazylabel/{mod.rel}:{line}", via="rule")
    for kind, mod_name, call_pat, host_pat, fixed_host, note in HOST_RULES:
        mod = mods[mod_name]
        line = line_of(mod, call_pat)
        host = fixed_host
        if host_pat:
            m = re.search(host_pat, mod.source)
            host = m.group(1) if m else None
        if line is None or not host:
            sys.exit(f"host rule did not match: {mod_name} /{call_pat}/")
        sid = f"ds:{host}"
        if not any(s["id"] == sid for s in stores):
            stores.append({"id": sid, "name": host, "kind": "datastore", "file": note})
        graph.add(mod_name, sid, kind, f"src/lazylabel/{mod.rel}:{line}", via="rule")
    for mod in mods.values():
        for pat in IMAGE_READ_PATTERNS:
            line = line_of(mod, pat)
            if line:
                graph.add(mod.name, "ds:image_files", "read", f"src/lazylabel/{mod.rel}:{line}", via="image read")
                break
    return stores, suffix_store


# ======================================================================================
# Screens and launchers
# ======================================================================================


def build_screens(mods: dict[str, Module], index: Index, graph: Graph, signal_pairs: list[tuple[str, str]]) -> list[dict]:
    screens: list[dict] = []
    for spec in SCREENS:
        implementers: set[str] = set()
        for mod_name, pat in spec["implemented_by"]:
            line = line_of(mods[mod_name], pat)
            if line is None:
                sys.exit(f"screen rule did not match: {spec['id']} {mod_name} /{pat}/")
            implementers.add(mod_name)
            graph.add(mod_name, spec["id"], "write", f"src/lazylabel/{mods[mod_name].rel}:{line}", via="renders")
        host = spec.get("host_module")
        if host:
            for node in ast.walk(mods[host].tree):
                if isinstance(node, ast.Call):
                    cname = call_name(node.func)
                    if cname and cname[:1].isupper() and not cname.startswith("Q"):
                        owner, cls = index.resolve_class(host, cname)
                        info = index.classes.get((owner, cls)) if owner else None
                        is_widget = bool(info) and any(
                            b.startswith("Q") and b not in {"QObject", "QThread", "QRunnable"} for b in info.bases)
                        if owner and owner != host and is_widget:
                            implementers.add(owner)
                            graph.add(owner, spec["id"], "write", f"src/lazylabel/{mods[host].rel}:{node.lineno}",
                                      via=f"hosted {cname}")
        for mod_name, pat in spec["readers"]:
            line = line_of(mods[mod_name], pat)
            if line is None:
                sys.exit(f"screen reader rule did not match: {spec['id']} {mod_name} /{pat}/")
            graph.add(mod_name, spec["id"], "read", f"src/lazylabel/{mods[mod_name].rel}:{line}", via="user input")
        for emitter, receiver in signal_pairs:
            if emitter in implementers and receiver not in implementers:
                graph.add(receiver, spec["id"], "read", "signal from " + emitter, via="signal")
        screens.append({"id": spec["id"], "name": spec["name"], "kind": "screen"})
    return screens


def build_launchers(mods: dict[str, Module], graph: Graph) -> tuple[list[dict], list[str]]:
    jobs: list[dict] = []
    entries: list[str] = []
    pyproject = (LEGACY / "pyproject.toml").read_text(encoding="utf-8")
    section = re.search(r"\[project\.scripts\](.*?)(?:\n\[|\Z)", pyproject, re.S)
    for m in re.finditer(r'^([\w-]+)\s*=\s*"([\w.]+):(\w+)"', section.group(1) if section else "", re.M):
        jid = f"job:console_script_{m.group(1)}"
        jobs.append({"id": jid, "name": f"{m.group(1)} console script (pyproject.toml)", "kind": "job"})
        graph.add(jid, m.group(2), "dispatch", "pyproject.toml [project.scripts]", via=f"{m.group(2)}:{m.group(3)}")
        entries += [jid, m.group(2)]
    if re.search(r'if __name__ == "__main__"', mods["lazylabel.__main__"].source):
        jobs.append({"id": "job:python_m", "name": "python -m lazylabel", "kind": "job"})
        graph.add("job:python_m", "lazylabel.__main__", "dispatch", "src/lazylabel/__main__.py", via="runpy")
        entries += ["job:python_m", "lazylabel.__main__"]
    spec = LEGACY / "build_system" / "windows" / "lazylabel.spec"
    m = re.search(r"Analysis\(\s*\[str\(ROOT_DIR / 'src/(lazylabel/[\w/]+)\.py'\)\]", spec.read_text(encoding="utf-8"))
    if m:
        target = m.group(1).replace("/", ".")
        jobs.append({"id": "job:windows_exe", "name": "LazyLabel.exe (PyInstaller spec)", "kind": "job"})
        graph.add("job:windows_exe", target, "dispatch", "build_system/windows/lazylabel.spec", via="PyInstaller Analysis")
        entries += ["job:windows_exe", target]
    hidden = re.findall(r"'(lazylabel(?:\.\w+)*)'", spec.read_text(encoding="utf-8"))
    return jobs, list(dict.fromkeys(entries)) + [f"hidden:{h}" for h in hidden]


# ======================================================================================
# Graph analysis
# ======================================================================================


def tarjan(nodes: list[str], adj: dict[str, set[str]]) -> list[list[str]]:
    index_of: dict[str, int] = {}
    low: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    out: list[list[str]] = []
    counter = [0]

    def strong(v: str) -> None:
        work = [(v, iter(sorted(adj.get(v, ()))))]
        index_of[v] = low[v] = counter[0]
        counter[0] += 1
        stack.append(v)
        on_stack.add(v)
        while work:
            node, it = work[-1]
            advanced = False
            for w in it:
                if w not in index_of:
                    index_of[w] = low[w] = counter[0]
                    counter[0] += 1
                    stack.append(w)
                    on_stack.add(w)
                    work.append((w, iter(sorted(adj.get(w, ())))))
                    advanced = True
                    break
                if w in on_stack:
                    low[node] = min(low[node], index_of[w])
            if advanced:
                continue
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
            if low[node] == index_of[node]:
                comp = []
                while True:
                    w = stack.pop()
                    on_stack.discard(w)
                    comp.append(w)
                    if w == node:
                        break
                out.append(comp)

    for v in nodes:
        if v not in index_of:
            strong(v)
    return out


# ======================================================================================
# Persona flows
# ======================================================================================


def define_flows(sidecars: dict[str, str]) -> list[dict]:
    npz, det = sidecars[".npz"], sidecars[".txt"]
    all_sidecars = [sidecars[s] for s in (".npz", "_seg.txt", "_coco.json", "_CM.npz", ".xml", "_createml.json", ".txt")]
    return [
        {
            "name": "Label an image with AI clicks",
            "persona": "Image annotator preparing training data",
            "description": "An annotator opens a folder, clicks objects so SAM draws their masks, and moves on while labels are saved beside each image.",
            "steps": [
                {"label": "Open a folder of images", "nodes": [
                    "scr:pick_image_folder", MAIN_WINDOW, "lazylabel.utils.fast_file_manager", "ds:image_files", "scr:right_panel"]},
                {"label": "Pick an image; it appears with any labels saved earlier", "nodes": [
                    "lazylabel.ui.managers.file_navigation_manager", "ds:image_files", "lazylabel.core.file_manager", npz,
                    "lazylabel.core.segment_manager", "lazylabel.ui.photo_viewer", "scr:tab_single"]},
                {"label": "The AI model loads once, then prepares each image in the background", "nodes": [
                    "lazylabel.ui.managers.sam_single_view_manager", "lazylabel.ui.workers.single_view_sam_init_worker",
                    "lazylabel.ui.workers.sam_update_worker",
                    "lazylabel.core.model_manager", "lazylabel.models.sam_model", "lazylabel.ui.managers.embedding_cache_manager",
                    "ds:model_checkpoints"]},
                {"label": "Click the object to get a mask preview", "nodes": [
                    "scr:tab_single", "lazylabel.ui.handlers.single_view_mouse_handler", MAIN_WINDOW,
                    "lazylabel.ui.managers.ai_segment_manager", "lazylabel.models.sam_model"]},
                {"label": "Press Space to accept the mask as a labeled object", "nodes": [
                    "lazylabel.ui.managers.keyboard_event_manager", MAIN_WINDOW, "lazylabel.ui.managers.ai_segment_manager",
                    "lazylabel.ui.managers.save_export_manager",
                    "lazylabel.core.segment_manager", "lazylabel.core.undo_redo_manager",
                    "lazylabel.ui.managers.segment_display_manager", "lazylabel.ui.managers.segment_table_manager"]},
                {"label": "Go to the next image; labels are saved automatically", "nodes": [
                    "lazylabel.ui.managers.file_navigation_manager", "lazylabel.ui.managers.save_export_manager",
                    "lazylabel.core.exporters", "lazylabel.core.exporters.npz", "lazylabel.core.exporters.yolo_detection", npz, det]},
            ],
        },
        {
            "name": "Carry labels through an image sequence",
            "persona": "Researcher labeling a time-lapse or video frame sequence",
            "description": "A researcher labels a few reference frames, lets SAM 2 carry the labels through the rest, checks the frames it was unsure about, and saves the results.",
            "steps": [
                {"label": "Choose the first and last frame and build the timeline", "nodes": [
                    "scr:tab_sequence", "lazylabel.ui.widgets.sequence_widget", MAIN_WINDOW, "lazylabel.utils.fast_file_manager",
                    "lazylabel.ui.modes.sequence_view_mode", "lazylabel.ui.widgets.timeline_widget"]},
                {"label": "Mark frames that already have labels as references", "nodes": [
                    "lazylabel.ui.widgets.sequence_widget", MAIN_WINDOW, "lazylabel.core.file_manager",
                    "lazylabel.ui.modes.sequence_view_mode", "lazylabel.core.segment_manager"]},
                {"label": "Start propagation with SAM 2", "nodes": [
                    MAIN_WINDOW, "lazylabel.ui.workers.propagation_worker", "lazylabel.ui.managers.propagation_manager",
                    "lazylabel.models.sam2_model", "ds:image_files", "ds:sam2_frame_cache", "ds:model_checkpoints"]},
                {"label": "Frames fill in on the timeline; unsure frames are flagged", "nodes": [
                    "lazylabel.ui.workers.propagation_worker", MAIN_WINDOW, "lazylabel.ui.modes.sequence_view_mode",
                    "lazylabel.ui.widgets.timeline_widget", "scr:tab_sequence"]},
                {"label": "Tune the confidence threshold from the histogram", "nodes": [
                    "lazylabel.ui.widgets.sequence_widget", MAIN_WINDOW, "scr:confidence_histogram",
                    "lazylabel.ui.widgets.confidence_histogram_dialog", "lazylabel.ui.modes.sequence_view_mode"]},
                {"label": "Save all propagated frames", "nodes": [
                    MAIN_WINDOW, "lazylabel.ui.managers.save_export_manager", "lazylabel.core.exporters",
                    "lazylabel.core.exporters.npz", "lazylabel.core.exporters.yolo_detection", npz, det]},
            ],
        },
        {
            "name": "Trace and correct outlines by hand",
            "persona": "Annotator working without the AI extra",
            "description": "An annotator traces object outlines point by point, drags vertices to fix them, sets the class, and undoes mistakes.",
            "steps": [
                {"label": "Switch to polygon mode with the toolbar button or its hotkey", "nodes": [
                    "scr:control_panel", "lazylabel.ui.control_panel", "scr:main_window", MAIN_WINDOW,
                    "lazylabel.ui.managers.mode_manager"]},
                {"label": "Click points around the object; a click near the first point or Space closes it", "nodes": [
                    "scr:tab_single", "lazylabel.ui.handlers.single_view_mouse_handler", "lazylabel.ui.managers.keyboard_event_manager",
                    "lazylabel.ui.managers.polygon_drawing_manager", "lazylabel.ui.managers.drawing_state_manager"]},
                {"label": "The outline becomes a labeled object", "nodes": [
                    "lazylabel.ui.managers.polygon_drawing_manager", "lazylabel.core.segment_manager", "lazylabel.core.undo_redo_manager",
                    "lazylabel.ui.managers.segment_display_manager", "lazylabel.ui.hoverable_polygon_item",
                    "lazylabel.ui.managers.segment_table_manager"]},
                {"label": "Drag vertices to fix the outline", "nodes": [
                    "lazylabel.ui.managers.edit_mode_manager", "lazylabel.ui.editable_vertex", "lazylabel.core.segment_manager"]},
                {"label": "Rename a class in the class table", "nodes": [
                    "scr:right_panel", "lazylabel.ui.reorderable_class_table", "lazylabel.ui.right_panel", MAIN_WINDOW,
                    "lazylabel.ui.managers.segment_table_manager",
                    "lazylabel.core.segment_manager"]},
                {"label": "Undo a mistake", "nodes": [
                    "scr:main_window", MAIN_WINDOW, "lazylabel.core.undo_redo_manager", "lazylabel.core.segment_manager"]},
            ],
        },
        {
            "name": "Convert existing labels to the formats a training pipeline needs",
            "persona": "ML engineer preparing a dataset",
            "description": "An ML engineer opens a folder labeled in one format, picks the export formats the pipeline needs, and re-saves each image.",
            "steps": [
                {"label": "Open the labeled folder; the file table shows which formats exist", "nodes": [
                    "scr:pick_image_folder", MAIN_WINDOW, "lazylabel.utils.fast_file_manager", "scr:right_panel",
                    "ds:image_files", *all_sidecars]},
                {"label": "Choose the export formats; they are saved to settings.json when the app closes", "nodes": [
                    "scr:control_panel", "lazylabel.ui.widgets.settings_widget", "lazylabel.ui.widgets.export_format_widget",
                    MAIN_WINDOW, "lazylabel.config.settings", "ds:settings_json"]},
                {"label": "Open an image; the most faithful existing file is loaded", "nodes": [
                    "lazylabel.ui.managers.file_navigation_manager", "lazylabel.core.file_manager", *all_sidecars,
                    "lazylabel.core.segment_manager"]},
                {"label": "Save; every chosen format is written beside the image", "nodes": [
                    "lazylabel.ui.managers.keyboard_event_manager", "lazylabel.ui.managers.save_export_manager",
                    "lazylabel.core.segment_manager", "lazylabel.core.exporters",
                    *[m for m in ("lazylabel.core.exporters.npz", "lazylabel.core.exporters.npz_class_map",
                                  "lazylabel.core.exporters.yolo_detection", "lazylabel.core.exporters.yolo_segmentation",
                                  "lazylabel.core.exporters.coco", "lazylabel.core.exporters.pascal_voc",
                                  "lazylabel.core.exporters.createml")], *all_sidecars]},
            ],
        },
    ]


# ======================================================================================
# Mermaid
# ======================================================================================


def mid(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", s)


def mlabel(s: str) -> str:
    return s.replace('"', "'").replace("<", "").replace(">", "")


def write_mermaid(topo: dict, mods: dict[str, Module], module_edges: list[dict], io_edges: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    dom_of = {m.name: m.domain for m in mods.values()}
    dom_names = {k: v[0] for k, v in DOMAINS.items()}
    entry_domains = {dom_of[e] for e in topo["entryPoints"] if e in dom_of}

    # call-graph.mmd -------------------------------------------------------------------
    pair: Counter[tuple[str, str]] = Counter()
    for e in module_edges:
        a, b = dom_of[e["source"]], dom_of[e["target"]]
        if a != b:
            pair[(a, b)] += 1
    merged: list[tuple[str, str, str, int]] = []
    done: set[tuple[str, str]] = set()
    for (a, b), n in pair.most_common():
        if (a, b) in done:
            continue
        back = pair.get((b, a), 0)
        done |= {(a, b), (b, a)}
        merged.append((a, b, f"{n} / {back}" if back else str(n), n + back))
    dropped = merged[40:]
    merged = merged[:40]
    lines = ["graph TD",
             "  %% LazyLabel domain-level call graph from analysis/lazylabel/topology.json (extract_topology.py).",
             "  %% Label = distinct module-to-module call and dispatch edges; 'a / b' = forward / backward when both exist.",
             "  %% Entry points: launchers declared in pyproject.toml, __main__.py and the PyInstaller spec."]
    if dropped:
        lines.append("  %% Dropped to stay at 40 edges: " + ", ".join(f"{a}-{b} ({w})" for a, b, _, w in dropped))
    lines.append('  launchers["Launchers: lazylabel-gui, python -m lazylabel, LazyLabel.exe"]')
    for dom in DOMAINS:
        lines.append(f'  {dom}["{mlabel(dom_names[dom])}"]')
    for dom in sorted(entry_domains):
        lines.append(f"  launchers --> {dom}")
    for a, b, label, _ in merged:
        arrow = "<-->" if "/" in label else "-->"
        lines.append(f'  {a} {arrow}|"{label}"| {b}')
    lines.append("  classDef entry fill:#fff3bf,stroke:#e8590c,stroke-width:3px,color:#000")
    lines.append("  class launchers," + ",".join(sorted(entry_domains)) + " entry")
    (HERE / "call-graph.mmd").write_text("\n".join(lines) + "\n", encoding="utf-8")
    counts["call-graph.mmd"] = len(merged) + len(entry_domains)

    # data-lineage.mmd -----------------------------------------------------------------
    store_names: dict[str, str] = {}
    for d in topo["root"]["children"]:
        for leaf in d["children"]:
            if leaf["kind"] == "datastore":
                store_names[leaf["id"]] = leaf["name"]
    store_edges = [e for e in io_edges if e["target"].startswith("ds:")]
    level = "module" if len(store_edges) <= 40 else "domain"
    agg: dict[tuple[str, str], set[str]] = defaultdict(set)
    for e in store_edges:
        src = e["source"] if level == "module" else dom_of.get(e["source"], e["source"])
        agg[(src, e["target"])].add(e["kind"])
    lines = ["graph LR",
             f"  %% LazyLabel data lineage at {level} level ({len(store_edges)} module-level store edges; domain level is used above 40).",
             "  %% Thick arrow = writes (or reads and writes); thin arrow = reads only. Evidence per edge is in topology_evidence.json."]
    used_sources = sorted({s for s, _ in agg})
    for s in used_sources:
        label = dom_names.get(s, s.replace("lazylabel.", "")) if level == "domain" else s.replace("lazylabel.", "")
        if s.startswith("job:"):
            label = s
        lines.append(f'  {mid(s)}["{mlabel(label)}"]')
    for sid in sorted({t for _, t in agg}):
        lines.append(f'  {mid(sid)}[("{mlabel(store_names.get(sid, sid))}")]')
    n_edges = 0
    for (s, t), kinds in sorted(agg.items()):
        if kinds == {"read"}:
            lines.append(f'  {mid(s)} -->|"reads"| {mid(t)}')
        elif kinds == {"write"}:
            lines.append(f'  {mid(s)} ==>|"writes"| {mid(t)}')
        else:
            lines.append(f'  {mid(s)} ==>|"reads and writes"| {mid(t)}')
        n_edges += 1
    (HERE / "data-lineage.mmd").write_text("\n".join(lines) + "\n", encoding="utf-8")
    counts["data-lineage.mmd"] = n_edges

    # critical-path.mmd ----------------------------------------------------------------
    flow = topo["flows"][0]
    lines = ["flowchart TD",
             f"  %% Primary persona flow: {flow['name']} ({flow['persona']}).",
             "  %% p50 / p99 wall-clock: not available. LazyLabel has no telemetry (analysis/lazylabel/ASSESSMENT.md, Section 4).",
             f'  persona(["{mlabel(flow["persona"])}"])']
    prev = "persona"
    n_edges = 0
    declared: set[str] = set()
    for i, step in enumerate(flow["steps"], 1):
        code = [n.replace("lazylabel.", "") for n in step["nodes"] if not n.startswith(("ds:", "scr:"))]
        label = f"{i}. {mlabel(step['label'])}<br/><small>{mlabel(', '.join(code))}</small>"
        lines.append(f'  s{i}["{label}"]')
        lines.append(f"  {prev} --> s{i}")
        n_edges += 1
        for n in step["nodes"]:
            if n.startswith("ds:"):
                node = mid(n) if n in declared else f'{mid(n)}[("{mlabel(store_names.get(n, n))}")]'
                declared.add(n)
                lines.append(f"  s{i} -.- {node}")
                n_edges += 1
        prev = f"s{i}"
    lines.append('  note["No latency data: add p50 / p99 per step once telemetry exists"]')
    lines.append(f"  {prev} -.- note")
    (HERE / "critical-path.mmd").write_text("\n".join(lines) + "\n", encoding="utf-8")
    counts["critical-path.mmd"] = n_edges + 1
    return counts


# ======================================================================================
# Main
# ======================================================================================


def main() -> None:
    mods = discover_modules()
    assign_domains(mods)
    index = Index(mods)
    graph = Graph()
    stats = {"backref_accesses": 0, "backref_members": defaultdict(set), "chain_accesses": 0,
             "connections_internal_untyped": 0, "ghost_members": defaultdict(list), "connections": 0,
             "connections_resolved": 0, "connections_external": 0, "connections_unresolved": [],
             "proxies": [], "signal_pairs": []}

    # call edges from imports
    type_only = lazy = reexport_edges = 0
    for imp in index.imports:
        if imp["type_only"]:
            type_only += 1
            continue
        lazy += imp["lazy"]
        reexport_edges += imp["reexport"]
        graph.add(imp["source"], imp["target"], "call", f"src/lazylabel/{mods[imp['source']].rel}:{imp['line']}",
                  reexport=imp["reexport"], lazy=imp["lazy"])

    # dispatch edges
    mw_members = mainwindow_members(index)
    for mod in mods.values():
        RuntimeScanner(index, mod, graph, stats, mw_members).visit(mod.tree)
    for mod_name, (fmt, _suffix, line) in registry(mods)[0].items():
        graph.add("lazylabel.core.exporters", mod_name, "dispatch", f"src/lazylabel/{mods[mod_name].rel}:{line}",
                  via=f"exporter registry {fmt}")
    for mod_name, pat, classes in FACTORIES:
        if line_of(mods[mod_name], pat) is None:
            sys.exit(f"factory rule did not match: {mod_name} /{pat}/")
        for cls in classes:
            line = line_of(mods[mod_name], rf"\b{cls}\(")
            owner, _ = index.resolve_class(mod_name, cls)
            if line and owner:
                graph.add(mod_name, owner, "dispatch", f"src/lazylabel/{mods[mod_name].rel}:{line}",
                          via="model factory by checkpoint filename")

    stores, sidecars = build_stores(mods, graph)
    screens = build_screens(mods, index, graph, stats["signal_pairs"])
    jobs, entries_raw = build_launchers(mods, graph)
    hidden = {e.split(":", 1)[1] for e in entries_raw if e.startswith("hidden:")}
    entry_points = [e for e in entries_raw if not e.startswith("hidden:")]

    # -------------------------------------------------------------------------------
    edges = list(graph.edges.values())
    module_ids = set(mods)
    module_edges = [e for e in edges if e["source"] in module_ids and e["target"] in module_ids and not e.get("reexport")]
    inbound: dict[str, set[str]] = defaultdict(set)
    for e in edges:
        if e["target"] in module_ids and not e.get("reexport"):
            inbound[e["target"]].add(e["source"])
    reexport_only = sorted(m for m in module_ids if not inbound[m] and any(
        e["target"] == m and e.get("reexport") for e in edges))
    candidates = sorted(m for m in module_ids if not inbound[m])
    suppressed = {}
    dead_ends = []
    for m in candidates:
        if m in entry_points:
            suppressed[m] = "entry point"
        elif mods[m].is_package:
            suppressed[m] = "package __init__ runs whenever a submodule is imported"
        elif m in hidden:
            suppressed[m] = "named in PyInstaller hiddenimports"
        else:
            dead_ends.append(m)

    adj: dict[str, set[str]] = defaultdict(set)
    for e in edges:
        if e["kind"] in {"call", "dispatch"} and not e.get("reexport"):
            adj[e["source"]].add(e["target"])
    reach: set[str] = set()
    frontier = [e for e in entry_points]
    while frontier:
        n = frontier.pop()
        if n in reach:
            continue
        reach.add(n)
        frontier.extend(adj.get(n, ()))
    unreachable = sorted(m for m in module_ids if m not in reach and not mods[m].is_package)
    only_via_dead = sorted(set(unreachable) - set(dead_ends))

    sccs = [c for c in tarjan(sorted(module_ids), {k: {t for t in v if t in module_ids} for k, v in adj.items()}) if len(c) > 1]
    sccs.sort(key=len, reverse=True)
    biggest = sccs[0] if sccs else []

    fan_in = Counter({m: len(inbound[m]) for m in module_ids})
    fan_out = Counter({m: len({t for t in adj.get(m, ()) if t in module_ids}) for m in module_ids})
    mw_edges = sum(1 for e in module_edges if MAIN_WINDOW in (e["source"], e["target"]))

    writers: dict[str, set[str]] = defaultdict(set)
    readers: dict[str, set[str]] = defaultdict(set)
    for e in edges:
        if e["target"].startswith("ds:"):
            (writers if e["kind"] == "write" else readers)[e["target"]].add(e["source"])

    # -------------------------------------------------------------------------------
    domain_children = []
    for dom, (dname, _files) in DOMAINS.items():
        leaves = [{"id": m.name, "name": m.rel, "kind": "module", "language": "python", "loc": m.loc,
                   "file": f"src/lazylabel/{m.rel}"} for m in sorted(mods.values(), key=lambda x: x.rel) if m.domain == dom]
        domain_children.append({"id": f"dom:{dom}", "name": dname, "kind": "domain", "children": leaves})
    domain_children.append({"id": "dom:screens", "name": "Screens and dialogs", "kind": "domain", "children": screens})
    domain_children.append({"id": "dom:launchers", "name": "Launchers", "kind": "domain", "children": jobs})
    domain_children.append({"id": "dom:data", "name": "Data stores", "kind": "domain", "children": stores})
    leaf_ids = {leaf["id"] for d in domain_children for leaf in d["children"]}

    ghosts = {k: v for k, v in stats["ghost_members"].items()}
    qt_import = re.compile(r"^\s*(from PyQt6|import PyQt6)", re.M)
    io_mods = sorted(m for m in module_ids if mods[m].domain == "annotation_io")
    io_inbound = sorted({e["source"] for e in module_edges
                         if e["target"] in io_mods and mods[e["source"]].domain != "annotation_io"})
    exporter_mods = sorted(m for m in module_ids if m == "lazylabel.core.exporters" or m.startswith("lazylabel.core.exporters."))
    qt_exporters = [m for m in exporter_mods if qt_import.search(mods[m].code)]
    fm_qt_line = line_of(mods["lazylabel.core.file_manager"], r"from PyQt6")
    model_mods = ["lazylabel.models.sam_model", "lazylabel.models.sam2_model"]
    model_inbound = sorted({e["source"] for e in module_edges if e["target"] in model_mods and e["source"] not in model_mods})
    model_stores = sorted({e["target"] for e in edges if e["source"] in model_mods and e["target"].startswith("ds:")})
    store_label = {s["id"]: s["name"] for s in stores}
    sidecar_ids = list(sidecars.values())
    sidecar_writers = set().union(*(writers[s] for s in sidecar_ids))
    sidecar_readers = set().union(*(readers[s] for s in sidecar_ids))
    domains_in_biggest = sorted({mods[m].domain for m in biggest})
    backref_modules = sorted({m for users in stats["backref_members"].values() for m in users})
    settings_users = sorted(stats["backref_members"].get("settings", set()))
    settings_domains = sorted({mods[m].domain for m in settings_users})
    ckpt_writers = sorted(writers["ds:model_checkpoints"])
    unresolved = stats["connections_unresolved"]
    multi_view_ghosts = [g for g in ghosts if "multi_view" in g]
    dynamic_loading = [f"src/lazylabel/{m.rel}:{line_of(m, LOADER_PATTERN)}"
                       for m in mods.values() if line_of(m, LOADER_PATTERN)]
    reexported_dead = [d for d in dead_ends if d in reexport_only]

    def short(names) -> str:
        return ", ".join(n.replace("lazylabel.", "") for n in names)

    observations = [
        (f"MainWindow sits at the center of a {len(biggest)}-module strongly connected component that spans "
         f"{len(domains_in_biggest)} of the 10 domains: {mw_edges} of the {len(module_edges)} module-to-module edges start or "
         f"end at ui/main_window.py, {fan_in[MAIN_WINDOW]} modules call back into it, and it reaches {fan_out[MAIN_WINDOW]}. "
         "Every module in that component depends on MainWindow and MainWindow depends on it, directly or through others, "
         "so none of them can move into a web service until those edges are cut."),
        (f"Back-references carry most of the runtime coupling: {stats['backref_accesses']} reads and calls from "
         f"{len(backref_modules)} modules go through self.mw, self.main_window or a local mw alias. {len(ghosts)} of the "
         f"MainWindow members they use are never defined, {len(multi_view_ghosts)} of them multi-view members such as "
         "multi_view_images; those code paths raise or silently do nothing at runtime."),
        (f"The seven annotation sidecar formats have {len(sidecar_writers)} writer modules and {len(sidecar_readers)} reader "
         "modules, and the suffix-to-format mapping is written out four times: the exporter _register calls, "
         "FileManager._LOAD_CHAIN, CustomFileSystemModel._FORMAT_COLUMNS and FastFileManager's literals. Adding or renaming "
         "a format takes four coordinated edits; the rewrite should own it in one registry."),
        (("The exporter package and its seven writers import no Qt" if not qt_exporters else
          f"Exporter modules importing Qt: {short(qt_exporters)}")
         + f", FileManager's only Qt use is a lazily imported QImageReader for the image size (core/file_manager.py:{fm_qt_line}), "
         f"and annotation_io is entered from {len(io_inbound)} modules outside it ({short(io_inbound)}), which makes it the "
         f"cleanest extraction seam for a file-format library. The SAM wrappers are entered from {len(model_inbound)} modules "
         f"and touch {len(model_stores)} data stores ({', '.join(store_label[s] for s in model_stores)}), the shape of an "
         "inference service."),
        (f"Signal wiring resolves well: of {stats['connections']} connect() calls, {stats['connections_resolved']} were resolved "
         f"to in-package modules, {stats['connections_external']} wire Qt's own widgets, {stats['connections_internal_untyped']} "
         f"wire a module's own helper-built widgets to its own slots, and {len(unresolved)} remain unresolved"
         + (f" ({', '.join(unresolved[:4])})" if unresolved else "")
         + ". " + ("There is no importlib, __import__, entry-point or pkg_resources loading in the package, so the import graph is complete."
                   if not dynamic_loading else f"Dynamic loading sites: {', '.join(dynamic_loading)}.")),
        (f"Dead-end candidates, with no inbound use from any entry point, import, signal or back-reference: {short(dead_ends) or 'none'}. "
         f"Also unreachable because only those modules use it: {short(only_via_dead) or 'none'}. "
         f"{len(reexported_dead)} of the candidates are still re-exported by a package __init__, so they load at import time "
         "without ever being used."),
        (f"Settings is one mutable object on MainWindow, reached through back-references from {len(settings_users)} modules in "
         f"{len(settings_domains)} domains ({', '.join(settings_domains)}), while only config/settings.py writes settings.json. "
         f"Model checkpoints are written by {len(ckpt_writers)} modules ({short(ckpt_writers)}) into the installed package "
         "directory, so a read-only install or container image breaks the SAM 1 download and the Find Archetypes cache."),
    ]

    # Flow sanity check: a code node with no edge to any other node of the same flow is suspicious.
    flow_warnings = []
    for f in define_flows(sidecars):
        members = {n for s in f["steps"] for n in s["nodes"]}
        linked = {x for e in edges for x in (e["source"], e["target"]) if e["source"] in members and e["target"] in members}
        for s in f["steps"]:
            for n in s["nodes"]:
                if n not in linked:
                    flow_warnings.append(f"{f['name']} / {s['label']}: {n} has no edge to another node of this flow")

    topo = {
        "system": "LazyLabel 2.0.8 (legacy/lazylabel @ 2a7d5d8)",
        "root": {"id": "sys", "name": "LazyLabel", "kind": "system", "children": domain_children},
        "edges": [{"source": e["source"], "target": e["target"], "kind": e["kind"]} for e in sorted(
            edges, key=lambda x: (x["kind"], x["source"], x["target"]))],
        "entryPoints": entry_points,
        "deadEnds": dead_ends,
        "observations": observations,
        "flows": define_flows(sidecars),
    }

    # -- validation ------------------------------------------------------------------
    problems = []
    for e in topo["edges"]:
        for end in (e["source"], e["target"]):
            if end not in leaf_ids:
                problems.append(f"edge endpoint not a leaf: {end}")
    for x in topo["entryPoints"] + topo["deadEnds"]:
        if x not in leaf_ids:
            problems.append(f"entry/dead id not a leaf: {x}")
    if not 2 <= len(topo["flows"]) <= 4:
        problems.append("flows must number 2-4")
    for f in topo["flows"]:
        if not 3 <= len(f["steps"]) <= 8:
            problems.append(f"flow {f['name']} must have 3-8 steps")
        for s in f["steps"]:
            for n in s["nodes"]:
                if n not in leaf_ids:
                    problems.append(f"flow node missing: {n}")
    if not 3 <= len(observations) <= 7:
        problems.append("observations must number 3-7")
    if problems:
        sys.exit("topology validation failed:\n  " + "\n  ".join(sorted(set(problems))))

    (HERE / "topology.json").write_text(json.dumps(topo, indent=1) + "\n", encoding="utf-8")
    io_edges = [e for e in edges if e["kind"] in {"read", "write"}]
    mmd_counts = write_mermaid(topo, mods, module_edges, io_edges)

    evidence_file = HERE / "topology_evidence.json"
    evidence_file.write_text(json.dumps({
        "note": "Evidence per edge (first matches) and extraction statistics for audit; not read by the viewer.",
        "edges": [{k: v for k, v in e.items()} for e in sorted(edges, key=lambda x: (x["kind"], x["source"], x["target"]))],
        "ghost_members": ghosts,
        "unresolved_connections": stats["connections_unresolved"],
        "suppressed_dead_end_candidates": suppressed,
        "unreachable_from_entry_points": unreachable,
        "reexport_only_modules": reexport_only,
        "largest_scc": sorted(biggest),
    }, indent=1) + "\n", encoding="utf-8")

    # -- summary ---------------------------------------------------------------------
    kinds = Counter(e["kind"] for e in edges)
    out = []
    p = out.append
    p(f"LazyLabel topology  (source: {LEGACY})")
    p(f"  modules {len(mods)}  |  data stores {len(stores)}  |  screens {len(screens)}  |  launchers {len(jobs)}  |  domains {len(DOMAINS)} + 3")
    p(f"  edges {len(edges)}: " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())))
    p(f"  imports: {len(index.imports)} statements; {type_only} TYPE_CHECKING-only (excluded); {lazy} lazy; {reexport_edges} package re-exports (flagged)")
    p(f"  signals: {stats['connections']} connect() calls; {stats['connections_resolved']} resolved in-package; "
      f"{stats['connections_external']} Qt widgets; {stats['connections_internal_untyped']} same-module helper widgets; "
      f"{len(stats['connections_unresolved'])} unresolved")
    p(f"  back-references: {stats['backref_accesses']} accesses to MainWindow from {len(backref_modules)} modules; "
      f"{len(ghosts)} undefined members; {stats['chain_accesses']} attribute-chain hops; {len(stats['proxies'])} getattr proxies")
    p(f"  annotation_io entered from: {short(io_inbound)}")
    p(f"  SAM wrappers entered from: {short(model_inbound)}")
    p(f"  Settings reached via back-reference from: {short(settings_users)}")
    p("")
    p("Entry points")
    for e in entry_points:
        p(f"  {e}")
    p("")
    p("Top fan-in (distinct modules calling in)          Top fan-out (distinct modules reached)")
    fi, fo = fan_in.most_common(8), fan_out.most_common(8)
    for (a, x), (b, y) in zip(fi, fo):
        p(f"  {x:3d}  {a.replace('lazylabel.', ''):42s}  {y:3d}  {b.replace('lazylabel.', '')}")
    p("")
    p(f"Strongly connected components with more than one module: {len(sccs)}; largest has {len(biggest)} modules across {len(domains_in_biggest)} domains")
    p("  domains: " + ", ".join(domains_in_biggest))
    p("")
    p("Data stores (writers | readers)")
    for s in stores:
        p(f"  {s['name'][:44]:44s} W {len(writers[s['id']]):2d} | R {len(readers[s['id']]):2d}   writers: "
          + ", ".join(sorted(w.replace('lazylabel.', '') for w in writers[s['id']]))[:90])
    p("")
    p("Undefined MainWindow members used through back-references")
    for g, evs in sorted(ghosts.items()):
        p(f"  {g:36s} {len(evs):2d} uses, e.g. {evs[0]}")
    p("")
    p(f"Dead-end candidates ({len(dead_ends)}): " + (", ".join(dead_ends) or "none"))
    p("Suppressed candidates: " + ("; ".join(f"{k} ({v})" for k, v in suppressed.items()) or "none"))
    p(f"Unreachable from entry points ({len(unreachable)}): " + ", ".join(unreachable))
    p("Unresolved connect() sites: " + ", ".join(stats["connections_unresolved"][:12]))
    p("")
    p("Flows")
    for f in topo["flows"]:
        p(f"  {f['name']}  [{f['persona']}]  {len(f['steps'])} steps")
    for w in flow_warnings:
        p("  WARNING " + w)
    p("")
    p("Observations")
    for o in observations:
        p("  - " + o)
    p("")
    p("Mermaid edge counts: " + ", ".join(f"{k} {v}" for k, v in mmd_counts.items()))
    p(f"Wrote {HERE / 'topology.json'}, {evidence_file.name}, call-graph.mmd, data-lineage.mmd, critical-path.mmd")
    print("\n".join(out[:200]))


if __name__ == "__main__":
    main()
