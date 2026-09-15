# ASSESSMENT: `lazylabel`

| | |
|---|---|
| System | LazyLabel, package `lazylabel-gui` 2.0.8: a Python 3.10 / PyQt6 desktop app for SAM-assisted image and image-sequence segmentation |
| Snapshot assessed | `legacy/lazylabel` = git worktree of `main` at **2a7d5d8** (2026-07-25) |
| Produced | 2026-09-15 on branch `main-web` by `/code-modernization:modernize-assess lazylabel` |
| Planned target | Web-hosted React + TypeScript front end with a Node.js back end (`PREFLIGHT.md`, Check 0) |
| Inputs | `analysis/lazylabel/PREFLIGHT.md` (commit 21d8aed, 2026-09-14) and the source; no production telemetry |
| Tools | scc 4.1.0; lizard 1.24.0; pytest 9.1.1 with pytest-cov 7.1.0 (coverage.py 7.16.1); bandit and pip-audit via `uvx`; Python AST scripts |
| Method | Four independent analysts (domain map, technical debt, security, documentation), each re-checked by a refute-first verifier. Domain import edges were re-derived mechanically. Findings the verifiers added were spot-checked against source before inclusion |
| Companion file | `analysis/lazylabel/ARCHITECTURE.mmd`, the domain dependency diagram (parses as Mermaid `flowchart-v2`) |

Verification tally, with every correction applied below:

| Analysis | Items | Confirmed | Corrected | Refuted |
|---|---|---|---|---|
| Technical debt | 14 | 12 | 2 | 0 |
| Security (code + dependency) | 57 | 52 | 5 | 0 |
| Documentation (gaps + stale statements) | 52 | 41 | 11 | 0 |

---

## 1. Executive Summary

LazyLabel 2.0.8 is a single-maintainer Python 3.10 / PyQt6 desktop tool for SAM-assisted annotation: 110 production modules (24.2 KSLOC) and 976 passing tests, with two-thirds of the production code in a PyQt6 user interface built around a 7,446-line `MainWindow`. Risk is moderate for today's desktop users and high for a web-hosted system: tests cover 45% of lines and 19% of branches, the save path can silently delete annotation files, and opening a crafted `.npz` sidecar executes code, which becomes a critical server-side flaw once uploads are accepted. The durable asset is the file-format contract, seven round-trippable sidecar formats whose exporters have 98% test coverage, while the UI, threading and persistence model cannot move to a browser. Recommendation: **Rebuild** through `/code-modernization:modernize-reimagine`, treating the legacy app as the specification and its sidecar formats as acceptance tests, and deciding explicitly not to port the defects in Section 5.

---

## 2. System Inventory

### 2.1 Size (scc)

```text
scc legacy/lazylabel          scc 4.1.0; cost and schedule estimate lines deliberately omitted (see Section 8)
Language   Files    Lines   Blanks  Comments    Code  Complexity
Python       176   52,487    9,102     9,392  33,993       5,514
Markdown       6    3,137      879         0   2,258           0
YAML           2       74        3         0      71           0
License        1      191       31         0     160           0
TOML           1       94        9         0      85           0
Total        186   55,983   10,024     9,392  36,567       5,514
```

Split of the Python code:

| Part | Files | Lines | Code lines | scc complexity |
|---|---|---|---|---|
| Production, `src/lazylabel` | 110 | 37,173 | 24,204 | 4,921 |
| Tests, `tests/` | 65 | 14,971 | 9,557 | 561 |
| Build script, `build_system/windows/build_windows.py` | 1 | 343 | 232 | 32 |

### 2.2 Highest-complexity files and functions

`scc --by-file -s complexity legacy/lazylabel | head -25`, top 10 (scc truncates names; full paths shown):

| File | Lines | Code | Complexity |
|---|---|---|---|
| src/lazylabel/ui/main_window.py | 7,446 | 4,832 | 1,129 |
| src/lazylabel/utils/fast_file_manager.py | 1,999 | 1,406 | 285 |
| src/lazylabel/models/sam2_model.py | 1,106 | 762 | 223 |
| src/lazylabel/ui/managers/propagation_manager.py | 1,291 | 775 | 177 |
| src/lazylabel/core/segment_manager.py | 954 | 581 | 170 |
| src/lazylabel/core/file_manager.py | 743 | 512 | 163 |
| src/lazylabel/core/undo_redo_manager.py | 683 | 518 | 147 |
| src/lazylabel/ui/modes/sequence_view_mode.py | 747 | 433 | 134 |
| src/lazylabel/ui/managers/keyboard_event_manager.py | 375 | 258 | 125 |
| src/lazylabel/ui/managers/image_adjustment_manager.py | 671 | 391 | 120 |

Function level, from `lizard -l python --csv legacy/lazylabel/src/lazylabel`: 1,751 functions, mean cyclomatic complexity (CCN) 3.37, median 2, maximum 33.

| Functions with CCN above | 10 | 15 | 25 | 50 |
|---|---|---|---|---|
| Count | 106 | 48 | 7 | 0 |

`main_window.py` holds 16 of the 48 functions above CCN 15.

| CCN | Function | Location |
|---|---|---|
| 33 | `_run_analysis` (Find Archetypes) | src/lazylabel/ui/workers/reference_finder_worker.py:62 |
| 33 | `_trim_frames_unlocked` | src/lazylabel/ui/modes/sequence_view_mode.py:616 |
| 28 | `Sam2Model.__init__` | src/lazylabel/models/sam2_model.py:31 |
| 28 | `load_coco_json` | src/lazylabel/core/file_manager.py:602 |
| 27 | `_process_chunk` (streaming propagation) | src/lazylabel/ui/managers/propagation_manager.py:958 |
| 26 | `_auto_detect_config` | src/lazylabel/models/sam2_model.py:264 |
| 26 | `_clear_multi_view_points` | src/lazylabel/ui/managers/keyboard_event_manager.py:315 |
| 24 | `load_selected_image` (unreachable, see debt item 5) | src/lazylabel/ui/managers/file_navigation_manager.py:135 |

### 2.3 Technology fingerprint

Paths are relative to `legacy/lazylabel`; `src/lazylabel/` is omitted where the context is clear.

| Aspect | Finding | Evidence |
|---|---|---|
| Language and runtime | Python ≥3.10, CI tests 3.10 only. The development venv runs the Microsoft Store CPython 3.10.11 build, which bundles expat 2.5.0 and OpenSSL 1.1.1t (SEC-08). CPython 3.10 reaches end of life in October 2026 | pyproject.toml:14; .github/workflows/tests.yml:14 |
| GUI framework | PyQt6 `>=6.7.1,<6.10`, installed 6.9.1 on the Qt 6.9.2 runtime | pyproject.toml:22 |
| Imaging and numerics | numpy, opencv-python, scipy (FFT thresholds); Pillow used only by Find Archetypes | pyproject.toml:23-25; ui/widgets/fft_threshold_widget.py:18; ui/workers/reference_finder_worker.py:142 |
| AI, optional `include-ai` extra | torch and torchvision from the PyTorch CUDA 12.6 index; segment-anything 1.0 (SAM 1); sam2 installed from git at commit 2b90b9f5 (SAM 2.1, Hydra configs); scikit-learn HDBSCAN with MobileNetV3 for Find Archetypes. `AI_AVAILABLE` requires segment_anything and torch ≥2.7.1 and is evaluated at import time | pyproject.toml:37-43; ai_availability.py:8, 18-39 |
| Undeclared direct imports | sam2, hydra-core, omegaconf, pillow | models/sam2_model.py:18, 116-117, 137, 657; ui/workers/reference_finder_worker.py:142 |
| Build and packaging | setuptools; console script `lazylabel-gui = lazylabel.main:main`; no lock file; published on PyPI; Windows PyInstaller one-dir build plus NSIS installer, which currently cannot complete (`PREFLIGHT.md` Check 3a) | pyproject.toml:1-3, 35; build_system/windows/ |
| Dependency manifests | `pyproject.toml` only: no requirements files, no `uv.lock` | repository root |
| Data stores | No database. Seven annotation sidecar formats written beside each image, read back in a fixed priority order; `settings.json` and `hotkeys.json` under `~/.config/lazylabel`; log under `~/.lazylabel/logs`; model checkpoints inside the package `models/` directory | core/exporters/__init__.py:73-81; core/file_manager.py:128-136; config/paths.py:19-21; utils/logger.py:43 |
| Integration points | Local filesystem only (Qt folder dialogs, `os.scandir`) plus outbound HTTPS for the SAM 1 checkpoint and the torchvision MobileNetV3 weights. No queues, network API, batch interface, IPC or command-line arguments | ui/main_window.py:1197, 1433; models/sam_model.py:25; ui/workers/reference_finder_worker.py:104; main.py:61 |
| UI surface | One `QMainWindow` with Single, Multi and Sequence tabs; left ControlPanel with Global and Image tabs; RightPanel with the file table and the segment and class tables; `PhotoViewer` canvas (`QGraphicsView`); status bar; sequence and timeline widgets. 22 `QWidget` and 4 `QDialog` subclasses, 195 `pyqtSignal` declarations | ui/main_window.py:77; ui/control_panel.py:123, 228, 232; ui/right_panel.py:23; ui/photo_viewer.py:8 |
| Concurrency | 12 `QThread` subclasses in 10 files for model init, image embedding, propagation, folder scanning, preloading and Find Archetypes. Annotation loads and exports run synchronously on the GUI thread. Cancellation uses `QThread.terminate()` | ui/workers/; ui/managers/sam_single_view_manager.py:303, 378 |
| Tests | 976 tests, all passing: 675 UI unit, 230 core unit, 19 config, 5 utils, 4 models, 43 integration. pytest-qt with an offscreen Qt platform | Section 2.4 |

### 2.4 Test coverage signal

Measured on 2026-09-15 with the full suite, run from the live checkout (its Python sources are identical to the snapshot):

```bash
cd E:/GitHub/LazyLabel && QT_QPA_PLATFORM=offscreen E:/venv/lazylabel/Scripts/python.exe -m pytest -q -p no:cacheprovider --cov=lazylabel --cov-branch --cov-report=term | tail -3
```

| Measure | Covered | Total | Percent |
|---|---|---|---|
| Statements | 8,295 | 18,428 | 45.0% |
| Branches | 1,088 | 5,716 | 19.0% |

Coverage is uneven. It is highest on the file-format contract and lowest on editing logic and the AI models:

| File or package | Line coverage |
|---|---|
| core/exporters (all seven writers) | 97.9% |
| config (settings, hotkeys, paths) | 95.3% |
| ui/widgets/sequence_widget.py | 88.1% |
| core/file_manager.py (load chain) | 85.1% |
| core/segment_manager.py | 34.0% |
| core/undo_redo_manager.py | 30.3% |
| ui/main_window.py | 30.2% |
| models/sam2_model.py | 6.5% |

Four files are never executed by tests: `__main__.py`, `_version.py`, `ui/theme.py`, `ui/theme_data.py`. Coverage per domain is in Section 3. CI uploads coverage to Codecov with no threshold (.github/workflows/tests.yml:54-57).

### 2.5 Dependency freshness

Newest versions come from `pip index versions` run in the project venv, so they are the newest releases installable on Python 3.10.

| Package | Declared | Installed | Newest for Python 3.10 |
|---|---|---|---|
| PyQt6 | `>=6.7.1,<6.10` | 6.9.1 | 6.11.0, blocked by the cap |
| numpy | `>=2.1.2` | 2.2.6 | 2.2.6 |
| opencv-python | `>=4.11.0.86` | 4.12.0.88 | 5.0.0.93 |
| scipy | `>=1.15.3` | 1.15.3 | 1.15.3 |
| requests | `>=2.32.4` | 2.32.5 | 2.34.2 |
| tqdm | `>=4.67.1` | 4.67.1 | 4.70.1 |
| torch | `>=2.7.1` | 2.7.1+cu126 | 2.14.0 |
| torchvision | `>=0.22.1` | 0.22.1+cu126 | 0.29.0 |
| segment-anything | `==1.0` | 1.0 | 1.0 |
| scikit-learn | `>=1.3.0` | 1.7.2 | 1.7.2 |
| pillow | undeclared | 12.1.1 | 12.3.0 |
| hydra-core | undeclared | 1.3.2 | 1.3.7 |
| omegaconf | undeclared | 2.3.0 | 2.3.1 |
| sam2 | undeclared, git install | commit 2b90b9f5 (2024-12-15) | not on PyPI |

`pyproject.toml` was first committed on 2025-06-14 and last changed on 2026-07-25. numpy, scipy and scikit-learn already sit at the last releases that support Python 3.10, so the interpreter is now the freshness ceiling.

---

## 3. Architecture-at-a-Glance

Ten functional domains cover all 110 production modules, each module exactly once (checked mechanically). The diagram is `analysis/lazylabel/ARCHITECTURE.mmd`: solid arrows are imports or direct calls, dotted arrows are shared state reached without an import.

| # | Domain id | Name | Cluster | Files | Lines | Statements | Line cov. | Branch cov. | Feature gate | What it does |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | app_shell | Main window shell and panels | ui | 15 | 10,298 | 5,176 | 38.4% | 8.5% | AI controls disabled without the AI extra | Composition root. `MainWindow` builds every manager with a back-reference to itself and runs multi-view and sequence orchestration inline; also ControlPanel, RightPanel, status bar, theme |
| 2 | canvas_editing | Canvas, drawing and editing tools | ui | 22 | 4,620 | 2,261 | 39.7% | 15.8% | none | `PhotoViewer` canvas, hoverable graphics items and vertex handles, per-mode mouse and keyboard dispatch, drawing state, polygon and edit modes, segment display and tables |
| 3 | image_processing | Image adjustments, crop and thresholds | ui | 8 | 3,682 | 2,073 | 44.2% | 18.7% | none | Brightness, contrast, gamma, saturation; channel and FFT thresholds; rescale; border crop applied to exports; feeds SAM when "operate on view" is on |
| 4 | file_navigation | Folder browsing and preloading | ui | 6 | 2,937 | 1,585 | 33.7% | 8.8% | none | `FastFileManager` file table (1,999 lines) with per-format status columns; image loading; folder scan and preload workers |
| 5 | sequence_timeline | Sequence mode and timeline | ui | 3 | 2,402 | 1,270 | 83.6% | 57.3% | partial: propagation needs SAM 2 | Ordered frames, per-frame status, reference snapshots, trim, timeline widgets; state held in memory only |
| 6 | ai_segmentation | SAM segmentation and SAM 2 propagation | ai | 21 | 6,427 | 3,060 | 40.2% | 19.5% | `include-ai` extra (`AI_AVAILABLE`) | Checkpoint discovery and routing, SAM 1 and SAM 2 wrappers, init and update workers, embedding cache, click and box prediction to segments, video propagation, Find Archetypes |
| 7 | annotation_model | Annotation model and undo-redo | core | 5 | 2,222 | 965 | 37.5% | 19.3% | none, but the `core` package imports the AI probe | `SegmentManager` (segments, classes, aliases, one-hot mask tensor, per-instance contours); `UndoRedoManager`, which replays actions through `MainWindow`; unused dependency-injection scaffolding |
| 8 | annotation_io | Annotation file IO and export formats | core | 12 | 2,284 | 1,031 | 72.8% | 61.8% | none | Exporter registry and seven writers, the `FileManager` load chain, `SaveExportManager` (which also hosts AI-accept and fragment filtering) |
| 9 | settings_prefs | Settings, hotkeys and paths | platform | 6 | 1,101 | 508 | 68.3% | 46.0% | none | `Settings` dataclass (37 fields), `HotkeyManager`, `Paths`, settings and hotkey dialogs |
| 10 | runtime_platform | Bootstrap and runtime support | platform | 12 | 1,200 | 499 | 41.9% | 17.6% | none | `main()`, version lookup, logger, exception classes, worker and scene helpers; owns the packaging and CI files |

Share of the 18,428 production statements by cluster:

| Cluster | Statements | Share |
|---|---|---|
| PyQt6 user interface (domains 1-5) | 12,365 | 67% |
| AI extra (domain 6) | 3,060 | 17% |
| Core annotation logic (domains 7-8) | 1,996 | 11% |
| Platform (domains 9-10) | 1,007 | 5% |

Structural shape:
- **Hub and spoke around `MainWindow`.** 709 attribute accesses from 24 UI modules reach 133 `MainWindow` members, and 28 modules dereference it once local aliases are counted. 26 modules import `MainWindow` under `TYPE_CHECKING`, so the type-level graph is cyclic. Nearly every cross-domain data flow runs through `MainWindow` properties instead of interfaces.
- **"Core" is not UI-free.** `core/__init__.py:28` imports `ModelManager`, which runs the AI availability probe at import. `core/undo_redo_manager.py` calls 20 private `MainWindow` methods.
- **`Settings` is a shared mutable hub.** Four domains read and write the single instance through the back-reference, and export formats are read from live ControlPanel widgets at save time (ui/managers/save_export_manager.py:112).
- **Multi-view is half-migrated.** Eight referenced members have no definition, such as `multi_view_images`, `_multi_view_mouse_release` and `MultiViewViewModel`. Most sit behind `hasattr` checks and degrade silently. Static reading shows unguarded reads at ui/managers/crop_manager.py:51, 80 and ui/handlers/single_view_mouse_handler.py:282; these were not executed.
- **Duplicate data types.** `FrameStatus` is defined twice with different members (ui/modes/sequence_view_mode.py:20-29 and ui/managers/propagation_manager.py:37-44), and so is `ReferenceAnnotation`. Propagated segments use the type `ai` while other paths use `AI`.

Edge verification: all 30 import edges in the diagram were re-derived from the AST with matching counts. 11 further import edges were left out to stay near 40 edges; they are logger and package re-export imports. Two of the omitted edges matter for a port: `core/__init__.py:28` (the AI probe inside core) and `ui/widgets/sequence_widget.py:22` (sequence UI reading AI availability).

Dangling references, 52 in total and all verified by search; the full list is Appendix B:

| Kind | Count | Examples |
|---|---|---|
| Wrong `TYPE_CHECKING` import path | 5 | ui/managers/image_adjustment_manager.py:22 imports a nonexistent `ui/settings.py` |
| Referenced but never defined | 8 | `MainWindow.multi_view_images`, `_multi_view_mouse_release`, `MultiViewViewModel` |
| Unused module | 6 | `core/app_context.py`, `core/protocols.py`, `ui/workers/save_worker.py` |
| Uncalled symbol clusters | 15 | 27 private `MainWindow` methods; `PropagationSaveWorker`; 7 signals emitted but never connected |
| Orphan asset | 18 | 8 unreferenced images and a committed `.DS_Store`, bundled into the Windows build anyway |

---

## 4. Production Runtime Profile

**No telemetry available.** LazyLabel has no telemetry, crash reporting or update check, and no observability source is connected to this session. `PREFLIGHT.md` Check 5 asked whether to read the local application log as a usage signal. The human did not answer, so the recorded default, NO, was applied. The log exists at `C:/Users/Deniz/.lazylabel/logs/lazylabel.log` (757 KB) and was not read; it could show feature usage frequency but not latency percentiles.

Consequently there are no p50, p95 or p99 figures and no telemetry-grounded highest-variance domain. The strongest static proxies for operational risk are `ai_segmentation` (26 of the 99 broad exception handlers sit in `models/sam2_model.py`, which has 6.5% test coverage) and the sequence propagation path (functions at CCN 27-33, Save All on the GUI thread). If the human later answers yes, replace this section with what the log shows.

---

## 5. Technical Debt (top 10, ranked by remediation value)

Ranked for two audiences: the desktop app still in use, and the React/Node rewrite that will treat this code as its specification. Debt that would be copied into the new system, or that hides behavior the rewrite must preserve, ranks higher. Items 1 and 6 each merge closely related verified findings.

| Rank | Finding | Category | Severity | Key metric | Rewrite action |
|---|---|---|---|---|---|
| 1 | No save or dirty model: saves infer deletion, and four routes silently lose annotations | error handling | High | 0 dirty or load-succeeded flags; all 7 sidecar formats deleted per event; Auto-Save on by default | Redesign |
| 2 | `MainWindow` god object with back-referencing managers | god object | High | 7,446 lines; 360 methods; 709 back-reference accesses | Redesign; extract rules, not structure |
| 3 | NPZ sidecars embed a pickled Python dict | data format | High | 2 writers; 2 `allow_pickle=True` readers | Port with fix |
| 4 | Failures are reported as success | error handling | Medium | 99 broad `except Exception`; 57 only pass or log | Redesign the error contract |
| 5 | The test oracle pins an unreachable loader; the live loader has no tests | dead code | Medium | 0 tests reach `load_image_by_path` | Do not port the dead path |
| 6 | Dead code presented as the architecture | dead code | Medium | ~1,037 lines of never-wired scaffolding plus ~500 lines of orphaned production code | Do not port |
| 7 | SAM checkpoint routing implemented five times with divergent rules | duplication | Medium | 3 of 8 sample names route differently for clicks and propagation | Redesign as a model manifest |
| 8 | Settings loader resets every preference on one unknown key | error handling | Medium | 37 fields reset by 1 key; files from 9 releases affected | Port with fix |
| 9 | Output-shaping constants hardcoded and duplicated | hardcoded config | Medium | the 0.99 threshold in 7 places, never persisted | Port the values, centralized |
| 10 | Image and sidecar format definitions duplicated with diverging sets | duplication | Medium | 5 extension lists in 3 variants; 4 sidecar tables | Port with fix as one registry |

### 5.1 No save or dirty model: four routes to silent annotation loss (High)

Every save rebuilds the sidecars from the in-memory segment list, and an empty list deletes all seven formats (ui/managers/save_export_manager.py:106-109, then core/exporters/__init__.py:209-215). Nothing records whether the user changed anything or whether the load succeeded. Auto-Save defaults to on (config/settings.py:45).
- **Failed image load.** `load_image_by_path` sets `current_image_path` and clears segments before it decodes the image (ui/managers/file_navigation_manager.py:276-289, 299-302). On the next navigation Auto-Save deletes that image's sidecars. `cv2.imread` returns `None` for non-ASCII paths on Windows (measured with OpenCV 4.12.0), so every image under such a folder is exposed.
- **Damaged or foreign sidecar.** Five of the seven loaders swallow their own parse errors and return, which ends the load chain (core/file_manager.py:202-205, 426-428, 468-470, 505-507, 556-558, 617-619). A corrupt `_coco.json` hides a valid `.txt`, and a caption file named `<stem>.txt` loads as zero segments; the next Auto-Save deletes them (both reproduced).
- **Multi-view ignores Auto-Save.** Pair navigation always saves or deletes both viewers (ui/managers/file_navigation_manager.py:401-403; ui/main_window.py:6497, 6530, 6589-6590).
- **Closing and switching tabs never save.** `closeEvent` persists settings only (ui/main_window.py:2064-2108), and leaving a tab discards unsaved segments (ui/main_window.py:3043-3060).

Legacy fix: assign path state only after a successful decode, decode with `cv2.imdecode(np.fromfile(path, np.uint8), ...)`, track per-image loaded-ok and dirty flags, and delete sidecars only when the user removed segments. Rewrite: the save API must carry explicit client intent and a successful-load token, and must never infer "delete everything" from an empty list.

### 5.2 `MainWindow` god object (High)

`ui/main_window.py` has 7,446 lines, 4,832 NLOC, 360 methods, 143 instance attributes, 66 property accessors, 90 one-line delegation shims and 16 of the tree's 48 functions above CCN 15; 79 of 282 commits touched it. About 49% of the file is multi-view orchestration (about 2,240 lines) and sequence/propagation orchestration (1,414 lines). Business rules such as the fragment threshold, AI-to-polygon conversion, undo semantics and per-mode saving live in UI callbacks reached through back-references (ui/managers/ai_segment_manager.py:137; core/undo_redo_manager.py:24). Rewrite: build React components over a typed state store and port only the extracted rules, not the manager and back-reference topology or the delegation shims.

### 5.3 Pickled class aliases inside NPZ files (High; also SEC-01)

The writers store `class_aliases` as a zero-dimensional object array (core/exporters/npz.py:25; core/exporters/npz_class_map.py:42), so the readers need `np.load(..., allow_pickle=True)` (core/file_manager.py:231, 297, 340). Measured: the member's dtype is `|O` and its body starts with pickle opcode `0x80`; `allow_pickle=False` raises. Opening an image therefore unpickles data from its sidecar, and a JavaScript reader cannot recover class names without a pickle decoder. Rewrite: define a non-pickle alias encoding, for example a JSON string stored in a unicode array, and ship a one-time Python converter for existing files; never unpickle uploads on a server.

### 5.4 Failures reported as success (Medium)

There are 99 `except Exception` handlers and no bare excepts: 7 only `pass`, 25 only log, 25 log and then return, 12 re-raise; 26 of them are in `models/sam2_model.py`. Verified chain: `set_image_from_path` catches the error and returns `False` (models/sam_model.py:197-204), the worker ignores the return value (ui/workers/sam_update_worker.py:56-59), and the UI announces "AI model ready for prompting" (ui/managers/sam_single_view_manager.py:316-338). A SAM 2.1 checkpoint silently falls back to a SAM 2.0 config with only a log warning (models/sam2_model.py:161-163). On Windows the log handler drops records containing non-cp1252 filenames (utils/logger.py:59, measured), so the only error channel loses entries. Rewrite: typed inference errors (decode failure, out of memory, model not loaded, config mismatch) that never map to a success message.

### 5.5 Tests pin an unreachable loader (Medium)

`load_selected_image` (118 lines, CCN 24) is reachable only from a `QTreeView` that is created hidden and never shown (ui/right_panel.py:121, 206). The auto-save and first-load tests drive that dead path (tests/unit/ui/test_main_window.py), no test reaches the live `load_image_by_path`, and tests/unit/core/test_file_manager.py:1079 copies line numbers that have since moved. Per-image-size crop restore works only in the dead loader. Rewrite: specify image loading from `load_image_by_path` only, and treat crop memory per image size as an open product decision. Legacy: retarget these tests before the suite is used as an equivalence oracle.

### 5.6 Dead code presented as the architecture (Medium)

Never wired: `core/app_context.py` (259 lines), `core/protocols.py` (227 lines, 13 Protocol classes), `core/exceptions.py` (202 lines, 22 exception classes that nothing catches), and `ui/modes/single_view_mode.py` with `ui/modes/base_mode.py` (349 lines). `src/lazylabel/ARCHITECTURE.md:589` describes `SingleViewModeHandler.handle_ai_click()` as the click flow, but presses go straight to `MainWindow` (ui/handlers/single_view_mouse_handler.py:127). Orphaned production code: `FileManager.save_npz` and `save_bb_txt` (103 lines, no production callers, 18 test calls) write a YOLO variant with label names where the live exporter writes numeric ids (core/file_manager.py:112 versus core/exporters/yolo_detection.py:33). Undo handlers for `delete_segments` exist but nothing records that action, so deletions cannot be undone (core/undo_redo_manager.py:81). 27 private `MainWindow` methods have no callers. Rewrite: take the architecture from the traced runtime path and the output formats only from `core/exporters/`.

### 5.7 SAM checkpoint routing implemented five times (Medium)

`ModelManager.detect_model_type` (core/model_manager.py:74) is copied verbatim into ui/workers/multi_view_sam_init_worker.py:56, and `models/sam2_model.py` adds three more config resolvers with different substring rules (lines 211-236, 280-292, 608-629). Measured on 8 sample checkpoint names, 3 get a different architecture for the image predictor than for the video predictor; for example `sam2.1_hiera_large_ft_satellite.pt` resolves to "small" for clicks and "large" for propagation. Weights load with `strict=False` (models/sam2_model.py:152). Rewrite: ship a model manifest (variant, version, config, checksum) instead of parsing filenames.

### 5.8 Settings loader resets every preference on one unknown key (Medium; corrected from High)

`Settings.load_from_file` calls `cls(**data)` and falls back to defaults on `TypeError` (config/settings.py:96-98). The legacy-key migration (config/settings.py:103) misses `yolo_use_alias`, which releases v1.3.8 through v1.5.0 wrote, so those settings files load as defaults, and `closeEvent` then saves the reset (ui/main_window.py:2107). Wrong value types are accepted, and a non-dict entry in `hotkeys.json` crashes startup on every launch (config/hotkeys.py:271; SEC-16). Preferences are lost, not annotations, which is why the verifier lowered the severity. Rewrite: a versioned settings schema with per-field validation that tolerates unknown keys and carries the legacy migration, including `yolo_use_alias`.

### 5.9 Output-shaping constants hardcoded and duplicated (Medium)

The propagation confidence threshold 0.99 appears in 7 places (ui/managers/propagation_manager.py:94, 283; ui/modes/sequence_view_mode.py:90, 727; ui/widgets/sequence_widget.py:388; ui/main_window.py:4501, 4588). It is not a setting, and `init_sequence` resets it, which `MainWindow` works around (ui/main_window.py:4164-4170). YOLO segmentation simplifies polygons with epsilon 0.001 × perimeter (core/exporters/yolo_segmentation.py:34), while COCO exports unsimplified contours (core/exporters/coco.py:60-62). `max_editable_vertices = 200` is duplicated. Rewrite: carry the exact values into one typed config module, because dual-run equivalence of `_seg.txt` files, COCO polygons and flagged-frame lists depends on them.

### 5.10 Format definitions duplicated with diverging sets (Medium)

Image extensions are defined five times in three variants: png, jpg, jpeg, tiff and tif in core/file_manager.py:743, utils/fast_file_manager.py:37 and utils/custom_file_system_model.py:30; six in the uncalled ui/main_window.py:5386; eight, adding bmp, gif and webp, in ui/workers/image_discovery_worker.py:8, whose comment claims parity. Sidecar suffixes are encoded in four independent tables. Rewrite: one shared TypeScript format registry (extension and MIME allow-list, sidecar suffixes, load priority) used by both client and server.

### 5.11 Verified but below the cut

- The SAM 1 download writes in place without a hash, and a truncated file disables SAM until it is deleted by hand (models/sam_model.py:31, 42-57, 134; SEC-05).
- The version is recorded three ways: 2.0.8 in pyproject.toml:7, 1.6.17 in src/lazylabel/_version.py:7, and 1.4.0 in build_system/windows/installer/installer.nsi:16.
- User state is spread over three dot-directory roots with an unrotated log (config/paths.py:20-21; utils/logger.py:43, 59).
- `QThread.terminate()` is called immediately after a cooperative stop request (ui/managers/sam_single_view_manager.py:303, 378; ui/main_window.py:2962).
- 27 calls to the deprecated Qt6 `event.pos()`; irrelevant once the UI is rewritten.

### 5.12 Questions for a subject-matter expert

These decide what the rewrite preserves:
1. Is per-image-size crop restore a feature? It only works in the unreachable loader.
2. Should segment deletion be undoable? Handlers exist, but nothing records the action.
3. Are .bmp, .gif and .webp supported image types?
4. Is COCO meant to be unsimplified while YOLO segmentation is simplified?
5. Should the propagation confidence threshold persist across sessions?

---

## 6. Security Findings

No hardcoded credentials exist in any tracked file or anywhere in the git history (285 commits, all refs), so no `SECRETS.local.md` was created. Severity is given for today's desktop app, where an attacker must get the user to open a crafted file or folder, and for the planned web-hosted system, where the same parsers would run on files uploaded by untrusted users.

| ID | CWE | Finding | Desktop | Web | Evidence | Fix |
|---|---|---|---|---|---|---|
| SEC-01 | CWE-502 | Opening an image loads its `.npz` or `_CM.npz` sidecar with `allow_pickle=True`, which executes code embedded in the file (reproduced with a harmless payload) | High | Critical | core/file_manager.py:231, 297, 340 | `allow_pickle=False` plus a zip signature check; store aliases as JSON; convert legacy files offline |
| SEC-02 | CWE-1395 (CWE-787, CWE-125) | Pillow 12.1.1 decoders carry reachable memory-corruption and denial-of-service CVEs, and `Image.open` picks the decoder from file content, not the extension | Medium | High | ui/workers/reference_finder_worker.py:161; models/sam2_model.py:791 | pillow ≥12.3.0, declared; `Image.open(path, formats=[...])` |
| SEC-03 | CWE-502 | SAM 2 checkpoints load through `torch.load` without an explicit `weights_only`. torch 2.7.1's weights-only unpickler has CVE-2026-24747, and the `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` environment variable silently turns the call into a full pickle load. segment_anything's builder uses a bare `torch.load` | Medium | High | models/sam2_model.py:144, 532, 700 | pass `weights_only=True`; torch ≥2.10.0; load SAM 1 state dicts directly |
| SEC-04 | CWE-754 (CWE-73) | Auto-Save deletes every sidecar format of an image whose annotations failed to load, including another image's files when stems collide (`img_seg.png` versus the `_seg.txt` of `img.png`) | Medium | High | ui/managers/save_export_manager.py:107-108; ui/main_window.py:6589-6590 | dirty and loaded-ok flags; loaders raise on parse errors (debt 5.1) |
| SEC-05 | CWE-494 | The SAM 1 checkpoint download has no hash check or size cap, writes in place, and a partial file is loaded on the next start | Low | Medium | models/sam_model.py:25, 31, 37, 134 | pinned SHA-256; download to a temp file, then `os.replace` |
| SEC-06 | CWE-770 (CWE-409) | No limits on pixels, objects or array shapes: a ~450 KB `_seg.txt` with 20,000 polygons beside a 12 MP image requests about 240 GB, and NPZ members allocate straight from header shapes | Low | High | ui/managers/file_navigation_manager.py:299; core/file_manager.py:248, 583-598 | header-only dimension caps; limits on objects, classes and array shapes |
| SEC-07 | CWE-776 (CWE-400) | Pascal VOC `.xml` sidecars are parsed by ElementTree on expat 2.5.0. Nested entities crashed the interpreter with a stack overflow (CVE-2024-8176, reproduced), and two more parser denial-of-service CVEs apply. XXE itself is not exploitable | Low | Medium | core/file_manager.py:467 | `defusedxml` with `forbid_dtd=True`; newer interpreter |
| SEC-08 | CWE-1104 | The development interpreter (Microsoft Store CPython 3.10.11) bundles expat 2.5.0 and OpenSSL 1.1.1t with no newer 3.10 Windows builds; PyQt6 is capped below 6.10; CPython 3.10 ends support in October 2026 | Low | Low | pyproject.toml:14, 22; .github/workflows/tests.yml:14 | move any retained Python to 3.12 or 3.13 |
| SEC-09 | CWE-59 | Sidecar reads and writes follow symbolic links placed next to images | Low | Medium | core/exporters/yolo_detection.py:40; core/exporters/coco.py:95; core/exporters/pascal_voc.py:59 | refuse symlinks and reparse points; write through exclusive, no-follow temp files |
| SEC-10 | CWE-401 | Each `Sam2Model` is kept alive by an `atexit` bound method, leaking a checkpoint of memory per model switch or multi-view re-init. Reliability bug with no attacker input | Info | Low | models/sam2_model.py:76 | `weakref.finalize` instead of a bound method |
| SEC-11 | CWE-829 | CI uses actions pinned by mutable tags, has no `permissions:` block, and uses the deprecated codecov-action v3 | Low | Medium once deploy secrets exist | .github/workflows/tests.yml:17, 19, 54 | pin actions to commit SHAs; `permissions: contents: read` |
| SEC-12 | CWE-1357 (CWE-494) | The release build bundles an unpinned sam2 HEAD and unverified checkpoints into an unsigned installer | Low | Medium | build_system/windows/BUILD_WINDOWS.md:68, 85; build_system/windows/lazylabel.spec:26 | pin the sam2 commit; checksums; code signing |
| SEC-13 | CWE-117 (CWE-150) | Filenames and exception text are logged without neutralization to an unrotated file and to the ANSI console | Low | Low | utils/logger.py:37, 43, 59 | escape control characters; rotating UTF-8 handler |
| SEC-14 | CWE-377 (CWE-459) | Theme icons fall back to a fixed shared temp directory whose files are trusted by size; SAM 2 frame copies can outlive the process | Low | Low | ui/theme.py:61, 69, 72; models/sam2_model.py:768 | private `mkdtemp`; exclusive, no-follow writes |
| SEC-15 | CWE-283 (CWE-428) | The NSIS uninstaller runs `RMDir /r` on a user-chosen install folder, and uninstall paths are unquoted | Low | Info | build_system/windows/installer/installer.nsi:50, 93, 110 | remove only installed files; quote paths |
| SEC-16 | CWE-20 | `settings.json` and `hotkeys.json` are not validated: a non-dict hotkey value crashes startup on every launch, and `cls(**data)` becomes mass assignment if ported to a server | Info | Low | config/settings.py:96-97; config/hotkeys.py:271 | per-field validation |
| SEC-17 | CWE-502 (CWE-494) | Find Archetypes downloads MobileNetV3 weights through `torch.hub.load_state_dict_from_url`, whose `weights_only` defaults to `False`; integrity rests on a short filename hash-prefix check over HTTPS. Found by the security verifier; the defaults were confirmed in the installed torch (torch/hub.py:814, 875) | Low | Low | ui/workers/reference_finder_worker.py:104 | ship pinned weights with a full SHA-256 and load with `weights_only=True` |

**Dependency vulnerabilities.** `pip-audit --no-deps --disable-pip` over the 17 pinned runtime packages (Appendix C) reported 58 advisories in 6 packages: pillow 35, torch 10, urllib3 8, requests 2, idna 2, hydra-core 1. The expat library bundled in the interpreter was checked separately. Each advisory was traced against LazyLabel's call paths:

| Package | Version | Reachable | Fixed in | Not reachable |
|---|---|---|---|---|
| torch | 2.7.1 | CVE-2026-24747 (weights-only unpickler memory corruption) | 2.10.0 | 8 CVEs in operators LazyLabel never calls or in the `.pt2` loader |
| pillow | 12.1.1 | CVE-2026-42311 (PSD), CVE-2026-40192 (FITS decompression bomb), CVE-2026-54058 (McIdas), CVE-2026-59203 (EPS hang), CVE-2026-59204 (JPEG 2000) | 12.2.0 or 12.3.0 | 13 CVEs in fonts, drawing, PDF and save-only encoders |
| urllib3 | 2.5.0 | CVE-2025-66471 and CVE-2025-66418 (decompression denial of service on the checkpoint download; needs control of the HTTPS response) | 2.6.0 | 2 CVEs |
| expat, bundled | 2.5.0 | CVE-2024-8176 (crash reproduced), CVE-2023-52425, CVE-2025-59375 | 2.7.2 | 4 CVEs: 32-bit only, or APIs pyexpat never calls |
| requests | 2.32.5 | none | not applicable | CVE-2026-25645 |
| idna | 3.11 | none | not applicable | CVE-2026-45409 |
| hydra-core | 1.3.2 | none | not applicable | CVE-2026-68508; configs come only from sam2's bundled YAML |

`sam2` (git commit 2b90b9f5) is outside pip-audit's coverage; its reachable checkpoint load uses `weights_only=True` (sam2/build_sam.py:166). Native codecs inside the PyQt6-Qt6 and opencv-python wheels (libtiff 4.6.0, libpng 1.6.43, OpenJPEG 2.5.3, OpenEXR 2.3.0) are not tracked by pip-audit either.

**Static analysis.** `bandit -r src/lazylabel` produced 10 high, 4 medium and 12 low results. All 10 high results are B324 (MD5 used as an in-memory cache key), which are false positives. The medium results are B614 `torch.load` three times (reported as SEC-03) and B314 ElementTree (reported as SEC-07). The low results are 7 try/except/pass blocks, 2 XML imports, 1 assert, 1 random choice of a startup tip, and 1 stylesheet placeholder mistaken for a password.

**Web-port hazards with no legacy counterpart.** The app has no authentication, authorization, session or tenant concept to reuse. Filenames and class aliases reach Qt labels as rich text (ui/widgets/status_bar.py:161; ui/main_window.py:6073-6075), which becomes an HTML injection risk if React renders them the same way. Absolute paths written to logs would become tenant data in shared server logs.

For the brief: SEC-01, SEC-02, SEC-03, SEC-04 and SEC-06 rate High or Critical once parsers accept uploads, so they must be designed out rather than ported.

---

## 7. Documentation Gaps (top 5)

In-code documentation is good: 98 of 110 modules (89%) have a module docstring, and 1,072 of 1,237 public functions, classes and methods (87%) have one. The prose documents are the problem. 44 statements in `src/lazylabel/ARCHITECTURE.md`, `src/lazylabel/USAGE_MANUAL.md`, the build documents and some docstrings contradict the code (Appendix A), so neither document should be used as a rewrite specification without checking the source.

| Rank | Behavior | What the code does | What the docs say |
|---|---|---|---|
| 1 | When sidecars are saved and deleted | No dirty tracking; an empty segment list deletes all 7 formats. Single view and sequence mode save on navigation only when Auto-Save is on, multi-view always saves, and tab switches and closing never save (ui/managers/save_export_manager.py:106-122; ui/managers/file_navigation_manager.py:156-160, 401-403; ui/main_window.py:2064-2108, 3043-3060) | ARCHITECTURE.md:193 says deletion happens only when the user cleared the annotations; USAGE_MANUAL.md:458-460 promises configurable auto-save and no data loss; CHANGELOG.md:12 presents the failed-load deletion as fixed, but only one of its causes was |
| 2 | What happens when a sidecar fails to parse | The chain moves to the next format only when a loader raises, which happens for a damaged `.npz` or `_CM.npz`. The COCO, YOLO, VOC and CreateML loaders swallow errors and stop the chain with zero segments. "Annotated" only means a matching filename exists (core/file_manager.py:138-151, 171-205, 426-428, 614-623) | ARCHITECTURE.md:206-207, CHANGELOG.md:24 and the docstring at core/file_manager.py:161-163 all say the chain continues past a broken file |
| 3 | Class ids are scoped to one image | Each image load clears the alias table; channel order is the sorted ids present in that image; named labels take the lowest free id in order of first appearance; YOLO keeps only ids while VOC and CreateML keep only names, so round-trips preserve masks but not ids (core/file_manager.py:345-379; ui/managers/save_export_manager.py:400) | The resolution order appears in CHANGELOG.md:17 and the `_build_label_map` docstring (core/file_manager.py:345-354). Per-image scoping and renumbering are documented nowhere, and README.md:100 and CHANGELOG.md:392 promise lossless round-trips |
| 4 | The sequence propagation lifecycle | Build Timeline takes files in browser sort order; three chained QThreads run; frames are staged as JPEG quality 95 in `%TEMP%/sam2_video_*`, so PNG and TIFF frames propagate on lossy 8-bit copies; results are buffered per frame and persisted either by scrubbing with Auto-Save on (merged per class, no flagged check) or by Save All (skips flagged frames, keeps objects separate, runs on the GUI thread); leaving the tab discards them (ui/main_window.py:3324, 4741-4846, 4949-5016; models/sam2_model.py:759-803) | USAGE_MANUAL.md:275-276, 305-307 and 371-385 describe a mode dropdown, a "Skip Low Conf" option defaulting to 0.95 and a "Load to Memory" setting, none of which exist (the default is 0.99). ARCHITECTURE.md:432 and 451 name a nonexistent `add_points_to_frame()` and the wrong timeline colors. Several rules appear only in CHANGELOG.md |
| 5 | Multi-view mode | Exactly two viewers, each with its own `SegmentManager` (separate class ids) and its own SAM model instance (double GPU memory); linked clicks reuse the same raw pixel in both images regardless of their sizes; pair navigation always saves (ui/main_window.py:3062-3125, 6491-6594, 6662-6675; ui/managers/sam_multi_view_manager.py:123-125) | USAGE_MANUAL.md:177-187 describes activation in settings, a 4-view grid and per-panel unlink buttons, which exist only in never-called code (ui/managers/ui_layout_manager.py:57-155) |

Also verified, just below the top five:
- Where settings, hotkeys, logs and models live: USAGE_MANUAL.md:793 points to `~/.lazylabel/models/`, which no code uses.
- Model family, version and size are inferred from filename substrings (core/model_manager.py:58-104), which is undocumented.
- The threading model: ARCHITECTURE.md:489 and 495-496 list `SaveWorker` and `PropagationSaveWorker` as asynchronous savers, but neither is ever instantiated and every export runs on the GUI thread.

---

## 8. Relative Scale

| Measure | Code lines (scc) | KSLOC | COCOMO-II index, 2.94 × KSLOC^1.10 |
|---|---|---|---|
| Production Python, `src/lazylabel` (110 files) | 24,204 | 24.204 | 97.9 |
| Whole repository: all code except Markdown and license text (Python 33,993 + TOML 85 + YAML 71) | 34,149 | 34.149 | 142.9 |

Inputs come from `scc legacy/lazylabel` and `scc legacy/lazylabel/src/lazylabel`, with nominal scale factors. Use the whole-repository figure when ranking against other directories measured the same way, and the production figure when comparing application code alone.

**This is a relative size measure, not a timeline or a cost.** The COCOMO model assumes traditional human-team productivity, which agentic transformation does not follow. Do not convert this index into person-months, a schedule, a budget or a date. scc's own cost and schedule estimate lines were left out of this document for the same reason.

---

## 9. Recommended Modernization Pattern

**Rebuild**, routed to `/code-modernization:modernize-reimagine` after `/code-modernization:modernize-brief` is approved.

The goal is a web-hosted React/TypeScript and Node.js application, and almost nothing structural survives that move. Two-thirds of the production statements are PyQt6 UI organized around a 7,446-line `MainWindow` that 28 modules dereference directly, another 17% is AI plumbing that mixes Qt workers with PyTorch, and even the 11% labeled "core" imports the AI probe and replays undo through `MainWindow`. The web target also needs capabilities the legacy has no notion of: storage and upload instead of sidecars written beside local files, authentication and tenancy, an inference service (SAM 2 video propagation has no browser equivalent), and background jobs instead of QThreads. What survives is behavior, and it is well specified in a few places: the seven sidecar formats and their load priority (98% exporter coverage with round-trip tests), the settings and hotkey inventory, checkpoint routing, and the sequence propagation rules. A rebuild that treats the legacy as the specification source and those file formats as executable acceptance tests fits this shape. A module-by-module port would carry the back-reference topology and the dead architecture into the new code.

Alternatives considered:
- **Rehost** (run the Qt app on a server and stream it to a browser): the fastest route to "web-hosted", but it keeps PyQt6, adds a desktop session per user and latency on pixel-level editing, and does not meet the React/Node goal.
- **Rearchitect** through `/code-modernization:modernize-transform`: right for modules with clean seams. It fits the file-format layer (`core/exporters` and the load chain), so the brief may route that layer through transform for golden-file equivalence inside the rebuilt system. It does not fit the UI, which has no module seam to strangle.
- **Replace** with an existing web annotation platform such as CVAT or Label Studio: not evaluated in depth, because it conflicts with the stated goal of converting LazyLabel itself and would give up its sequence propagation, archetype finding and seven-format round-trip workflow.

Decisions `/code-modernization:modernize-brief` must record, each as its own line item, before reimagine runs:
1. **PyPI package `lazylabel-gui`**, the open `PREFLIGHT.md` Check 0 item: replace it, keep it alongside a retained Python inference backend, or freeze it at 2.0.8.
2. **SAM inference hosting**: ONNX models in the browser or in Node, or a retained Python/PyTorch service. SAM 2 video propagation realistically needs server-side GPU inference.
3. **NPZ alias encoding and migration of existing files** (debt 5.3, SEC-01).
4. **Save semantics**: an explicit save and dirty model instead of auto-save on navigation. The legacy deletion behavior is a defect; recommend not preserving it (debt 5.1).
5. **Scope of half-finished or questionable behavior**: multi-view (two viewers; the 4-view grid exists only in dead code), per-size crop memory, undoable deletion, .bmp/.gif/.webp support, COCO simplification, and a persisted confidence threshold (Section 5.12).
6. **Security baseline for uploads**: design out SEC-01, SEC-02, SEC-03, SEC-04 and SEC-06.

Preconditions for equivalence testing: characterize the live code paths, not the dead ones. The priority targets are `load_image_by_path` and the save and delete lifecycle (no tests today), `core/segment_manager.py` (34% line coverage) and `core/undo_redo_manager.py` (30%). Execute the Python legacy app from the live checkout, because `legacy/lazylabel` carries no model weights.

---

## 10. Next steps

Run these from `E:\GitHub\LazyLabel` on branch `main-web`. In this app the plugin's commands need the `code-modernization:` prefix; the short `/modernize-...` form is not registered.

```text
/code-modernization:modernize-map lazylabel
/code-modernization:modernize-extract-rules lazylabel
/code-modernization:modernize-brief lazylabel react/node.js
```

The brief reads this file, `topology.json` from map and `BUSINESS_RULES.md` from extract-rules, and stops if any is missing. Reimagine runs only after the brief is approved.

---

## Appendix A. Documentation statements contradicted by the code (44, verified)

Doc paths under `src/lazylabel/` are shortened to the file name; code paths are relative to `src/lazylabel/` unless they start with a top-level folder.

| # | Doc location | Doc says | Code does |
|---|---|---|---|
| 1 | ARCHITECTURE.md:206-207; CHANGELOG.md:24; core/file_manager.py:161-163 | A sidecar that fails to parse is logged and the chain continues | Continues only for a damaged `.npz` or `_CM.npz`; the other loaders return with zero segments (core/file_manager.py:202-205, 426-428, 466-470, 502-507, 614-619) |
| 2 | ARCHITECTURE.md:193 | `delete_all_outputs` runs only when the user cleared the annotations | Runs whenever the list is empty at any save, including after a failed load (ui/managers/save_export_manager.py:106-109) |
| 3 | USAGE_MANUAL.md:456-460 | Auto-save is configurable and nothing is lost in normal use | Multi-view ignores Auto-Save; tab switches and closing never save (ui/managers/file_navigation_manager.py:401-403; ui/main_window.py:2064-2108) |
| 4 | USAGE_MANUAL.md:272-276 | Sequence is chosen from a control-panel dropdown and the timeline appears | Sequence is a tab; the timeline exists only after Set Start, Set End and Build Timeline (ui/main_window.py:3324, 5346-5382) |
| 5 | USAGE_MANUAL.md:305, 307, 325, 371, 373-376; ARCHITECTURE.md:462 | A "Skip Low Conf" option with Min Conf defaulting to 0.95 | The controls are Keep Flagged Masks (off), Skip Labeled (on) and Streaming (on); the confidence default is 0.99 (ui/widgets/sequence_widget.py:334-358, 388) |
| 6 | USAGE_MANUAL.md:66-71, 75, 378-385 | An AI tab with Sequence Settings and "Load to Memory", and a Tools tab | The tabs are Global and Image; there is no Sequence Settings section, and the preload cache is never assigned (ui/control_panel.py:228, 232, 384-471) |
| 7 | USAGE_MANUAL.md:300 | "+ All Labeled" adds frames that have NPZ labels | Adds frames that have any of the 7 sidecar filenames (ui/main_window.py:3955-3967) |
| 8 | USAGE_MANUAL.md:391 | The Add Reference hotkey is F | The default is G (config/hotkeys.py:116-121) |
| 9 | USAGE_MANUAL.md:177-187; ARCHITECTURE.md:260 | Multi-view is enabled in settings, offers 2 or 4 views with per-panel unlink, and coordinates saves | A Multi tab with exactly two viewers and one Linked toggle; the 4-view code is never called (ui/main_window.py:3062-3125) |
| 10 | ARCHITECTURE.md:345; ui/managers/ui_layout_manager.py:1-7 | `UILayoutManager` builds 2- or 4-view layouts | `MainWindow` builds the fixed two-viewer layout; the `UILayoutManager` builders are unused (ui/main_window.py:3062-3255) |
| 11 | ARCHITECTURE.md:353, 386 | `SingleViewMouseHandler` delegates multi-view releases through `MainWindow` | It calls the undefined `_multi_view_mouse_release`; multi-view input goes through `MainWindow.eventFilter` (ui/handlers/single_view_mouse_handler.py:276-285) |
| 12 | ARCHITECTURE.md:366-386, 583-606 | Clicks flow through `SingleViewModeHandler` | Never instantiated; presses go straight to `MainWindow` (ui/handlers/single_view_mouse_handler.py:114-142) |
| 13 | ARCHITECTURE.md:108-111; core/app_context.py:7-19; core/protocols.py:13 | Dependencies are injected through AppContext, UIContext and FullContext | None is constructed outside a docstring; managers reach `MainWindow` instead |
| 14 | ARCHITECTURE.md:99-101; viewmodels/single_view_viewmodel.py:1-6 | UI components subscribe to ViewModel signals; `MultiViewViewModel` exists | No ViewModel signal is connected, and `MultiViewViewModel` does not exist (ui/main_window.py:468-510, 597-600) |
| 15 | ARCHITECTURE.md:127-130 | `FileManager` provides NPZ and TXT export and JSON alias persistence | Its writers have no production callers, aliases live inside sidecars, and writes go through `exporters.export_all` |
| 16 | USAGE_MANUAL.md:444-447, 828 | A JSON file holds class aliases | There is no alias JSON; the seven formats are NPZ, NPZ class map, YOLO detection and segmentation, COCO, VOC, CreateML (core/exporters/__init__.py:14-23, 224-230) |
| 17 | USAGE_MANUAL.md:439 | NPZ background is `mask[:, :, 0]` | Channels are the image's class ids in ascending order; there is no background channel (ui/managers/save_export_manager.py:400) |
| 18 | ARCHITECTURE.md:135; USAGE_MANUAL.md:623 | Undo history depth is limited | No cap; erase actions store whole segment copies (core/undo_redo_manager.py:28-36) |
| 19 | ARCHITECTURE.md:431-433 | `ReferenceAnnotationWorker` calls `add_points_to_frame()` | No such function; references are stored, then registered as SAM 2 mask prompts by the propagation worker (ui/managers/propagation_manager.py:380-383, 1043-1049) |
| 20 | ARCHITECTURE.md:401, 451 | Five frame statuses; green is reference, blue is propagated | Seven statuses; gold is reference, green propagated, cyan saved, brown skipped, purple suggested, and blue marks the current frame (ui/widgets/timeline_widget.py:31-39) |
| 21 | ARCHITECTURE.md:469-472 | `frame_done(frame_idx, masks, confidence)` | `frame_done(int, object)` fires once per object, carrying a result or a bare float for a failed object (ui/workers/propagation_worker.py:25-30, 79-97) |
| 22 | ARCHITECTURE.md:489, 495-496 | `PropagationSaveWorker` and `SaveWorker` save asynchronously | Neither is instantiated; Save All and exports run on the GUI thread (ui/main_window.py:4741-4846) |
| 23 | ARCHITECTURE.md:23-30, 189 | Six exporter modules are registered | `npz_class_map` is registered as well (core/exporters/__init__.py:224-230) |
| 24 | ARCHITECTURE.md:141 | Eight hotkey categories | A ninth, Sequence, adds 9 actions (config/hotkeys.py:115-169) |
| 25 | ARCHITECTURE.md:566, 570 | Development setup is `pip install -e .` then pytest | pytest and pytest-qt are only in the `[dev]` extra (pyproject.toml:44-50) |
| 26 | USAGE_MANUAL.md:114, 116 | Double-click completes a polygon; right-click deletes the last vertex | There is no double-click handler; a polygon closes on a click near its first vertex or on Space, and only left presses are handled (ui/managers/keyboard_event_manager.py:93-98; ui/handlers/single_view_mouse_handler.py:140-142) |
| 27 | USAGE_MANUAL.md:133 | Space saves the bounding box | The box segment is created on mouse release (ui/handlers/single_view_mouse_handler.py:370-438) |
| 28 | USAGE_MANUAL.md:145 | M merges selected segments | M only reassigns the selected segments to the lowest selected class id (core/segment_manager.py:65-85) |
| 29 | USAGE_MANUAL.md:146 | Delete or V removes selected segments | Only V and Backspace are bound (config/hotkeys.py:85-93) |
| 30 | USAGE_MANUAL.md:490, 502, 576-578 | Edit mode works only on polygons; boxes are not editable; loaded segments lose vertices | Polygon and Circle are editable, boxes are 4-vertex polygons, and YOLO segmentation and COCO loads keep vertices (ui/managers/mode_manager.py:59; core/file_manager.py:590-597) |
| 31 | USAGE_MANUAL.md:192 | Auto-discovery scans directories recursively | Only the opened folder is scanned (utils/fast_file_manager.py:186-213) |
| 32 | USAGE_MANUAL.md:206-207 | Contrast ranges 0.5-2.0 and gamma 0.1-3.0 | Contrast is 0.0-2.0 and gamma 0.01-2.0 (ui/widgets/adjustments_widget.py:76, 80-84) |
| 33 | USAGE_MANUAL.md:793 | Cached models can live in `~/.lazylabel/models/` | Models are read from the package `models/` folder; a copy in `~/.cache/lazylabel` is moved there (config/paths.py:12-19; models/sam_model.py:105-136) |
| 34 | USAGE_MANUAL.md:746-748, 753-755, 772-775, 780 | Settings for performance, threads, caches, multi-view, export locations and themes | None exist; sidecars are always written beside the image and theming is a dark/light toggle (config/settings.py:16-75) |
| 35 | USAGE_MANUAL.md:35, 171 | An Open Folder button in the control panel; recent files in the explorer | The button is in the right panel, and there is no recent-files feature (ui/right_panel.py:112) |
| 36 | ui/managers/save_export_manager.py:39-47, 87; ui/main_window.py:1993-1996 (docstrings) | Saving writes NPZ and bounding-box TXT | Writes every format selected in Export Formats, NPZ plus YOLO detection by default (ui/managers/save_export_manager.py:117-122; config/settings.py:8-9) |
| 37 | ui/main_window.py:3481, 3580-3583, 3956, 4742 (docstrings); tooltips at ui/main_window.py:3298-3300 and ui/widgets/sequence_widget.py:349-352 | Sequence saving, deleting and "labeled" checks concern NPZ; a Load to Memory cache feeds frames | All selected formats are written, all 7 are deleted, any sidecar counts as labeled, and the cache is never assigned |
| 38 | ui/utils/worker_utils.py:10 | Usage `cleanup_worker_thread(thread, timeout=1000)` | The parameter is `timeout_ms`, so the documented call raises `TypeError` (ui/utils/worker_utils.py:50-54) |
| 39 | README.md:175-189 | The Windows build only needs Python and PyInstaller, then `build_windows.py` | The script aborts without PyQt6, torch and segment_anything, and PyInstaller needs both checkpoints present (build_system/windows/build_windows.py:83-95; build_system/windows/lazylabel.spec:25-28) |
| 40 | build_system/windows/BUILD_WINDOWS.md:64-65 | `pip install -e .` installs all dependencies | The AI packages are in the `[include-ai]` extra (pyproject.toml:37-43) |
| 41 | build_system/windows/BUILD_WINDOWS.md:67-68 | SAM 2 support is optional | The spec always collects sam2 and bundles the SAM 2.1 checkpoint (build_system/windows/lazylabel.spec:20, 25-28, 69-72) |
| 42 | build_system/windows/BUILD_WINDOWS.md:93-97 | Run `python build_windows.py` from the repository root | The script lives in `build_system/windows/` (build_system/windows/build_windows.py:27-28) |
| 43 | build_system/windows/BUILD_WINDOWS.md:8, 124, 146; build_system/README.md:39-43 | The installer is named `LazyLabel-<version>-Setup.exe` | `installer.nsi` hard-codes 1.4.0 (build_system/windows/installer/installer.nsi:16, 23, 86-87) |
| 44 | build_system/windows/BUILD_WINDOWS.md:223-231 | Replace `logo2.png` with an `.ico` for a custom icon | The spec and installer already use `logo2.ico` (build_system/windows/lazylabel.spec:158; build_system/windows/installer/installer.nsi:38-39) |

## Appendix B. Dangling references (52, verified)

Paths are relative to `src/lazylabel/`.

**Wrong `TYPE_CHECKING` import paths (5)**
- ui/managers/ai_segment_manager.py:26 and ui/managers/file_navigation_manager.py:26 import `...models.model_manager`; the class lives in core/model_manager.py.
- ui/managers/file_navigation_manager.py:32 and ui/managers/save_export_manager.py:35 import `.file_manager`; the class lives in core/file_manager.py.
- ui/managers/image_adjustment_manager.py:22 imports `..settings`; the class lives in config/settings.py.

**Referenced but never defined (8)**
- `MultiViewViewModel` (ui/managers/ui_layout_manager.py:24).
- `MainWindow.multi_view_images`, read unguarded at ui/managers/crop_manager.py:51, 80 and ui/managers/image_adjustment_manager.py:146, 172.
- `CropManager.remove_multi_view_crop_visual` (ui/managers/crop_manager.py:88, 426).
- `apply_multi_view_image_processing_fast` and `MainWindow.multi_view_models` (ui/managers/image_adjustment_manager.py:203, 211-212, 256-257).
- `MainWindow._multi_view_mouse_release`, called unguarded at ui/handlers/single_view_mouse_handler.py:282, 284.
- The undo manager's multi-view point hooks (core/undo_redo_manager.py:215-283).
- `MainWindow._current_view_mode` (ui/managers/edit_mode_manager.py:80).
- `multi_view_mode_handler`, `_clear_multi_view_highlights`, `multi_view_rubber_band_lines` and `_update_display` (ui/managers/keyboard_event_manager.py:53-55, 134-137, 174-177; ui/managers/save_export_manager.py:148-149).

**Unused modules (6)**: core/app_context.py; core/protocols.py; ui/modes/single_view_mode.py; ui/modes/base_mode.py; ui/workers/save_worker.py; ui/utils/scene_utils.py.

**Uncalled symbols (15 clusters)**
- `UILayoutManager`, constructed at ui/main_window.py:694 and never used.
- `FileManager.save_npz` and `save_bb_txt` (core/file_manager.py:20, 74).
- `exporters.get_all_output_extensions` (core/exporters/__init__.py:218).
- `SegmentManager.convert_ai_segments_to_polygons` and `get_class_to_toggle_with_hotkey` (core/segment_manager.py:828, 425).
- `PropagationSaveWorker` (ui/workers/propagation_worker.py:295).
- `PropagationManager.get_frame_status` and its duplicate `FrameStatus` enum (ui/managers/propagation_manager.py:1135, 37-44).
- `PropagationManager.add_reference_frames`, `add_reference_annotations_from_segments`, `get_next_flagged_frame`, `get_prev_flagged_frame` and `get_image_path_for_frame` (ui/managers/propagation_manager.py:343-1183).
- `SequenceViewMode.to_dict` and `from_dict` (ui/modes/sequence_view_mode.py:711); only tests call them, so sequence state is never persisted.
- `Sam2Model.add_video_points` (models/sam2_model.py:917).
- `SaveExportManager._save_viewer_output` (ui/managers/save_export_manager.py:454).
- `CropManager.reset_state` and `get_crop_for_image_size` (ui/managers/crop_manager.py:415, 408).
- Signals emitted but never connected: `UndoRedoManager.undo_performed` and `redo_performed` (core/undo_redo_manager.py:19) and five `SingleViewViewModel` signals (viewmodels/single_view_viewmodel.py:74-142).
- Worker helpers `cleanup_worker_thread_strict`, `delete_worker_later`, `cleanup_worker_and_thread` and `WorkerCleanupContext` (ui/utils/worker_utils.py:108-214).
- 27 private `MainWindow` methods, for example `_enable_sam_functionality` (ui/main_window.py:806) and `_toggle_mode` (ui/main_window.py:1190).
- Small helpers `Paths.get_model_path` and `get_old_cache_model_path` (config/paths.py:45, 49), and `HotkeyManager.key_sequence_to_string` and `string_to_key_sequence`.

**Orphan assets (18)**
- Unreferenced by any code or document, but bundled by build_system/windows/lazylabel.spec:32: demo_pictures/gui.PNG, logo.png, logo_black.png, logo_green.png, logo_white.png, scene.png, bw_test.png and a committed .DS_Store.
- Unreferenced anywhere: media/demo_UI.png.
- Used only by README.md through raw.githubusercontent.com URLs: the 9 GIFs in media/.

## Appendix C. Reproduce

Run as one Bash call; the working directory is not kept between calls.

```bash
cd E:/GitHub/LazyLabel
git branch --show-current                                   # expect: main-web
git -C legacy/lazylabel rev-parse --short HEAD              # expect: 2a7d5d8
scc legacy/lazylabel                                        # Section 2.1 (ignore its cost and schedule lines)
scc --by-file -s complexity legacy/lazylabel | head -25     # Section 2.2
scc --no-cocomo legacy/lazylabel/src/lazylabel              # expect Python 110 files, 24,204 code
lizard -l python legacy/lazylabel/src/lazylabel | tail -4   # expect 1751 functions, 48 warnings (CCN > 15)
QT_QPA_PLATFORM=offscreen E:/venv/lazylabel/Scripts/python.exe -m pytest -q -p no:cacheprovider --cov=lazylabel --cov-branch --cov-report=term | tail -3   # expect 976 passed; slower than a plain run
uvx bandit -r legacy/lazylabel/src/lazylabel -q | tail -12  # expect High 10, Medium 4, Low 12
```

Dependency audit: save the list below as `requirements-pinned.txt` in any scratch directory, then run the command after it.

```text
PyQt6==6.9.1
numpy==2.2.6
opencv-python==4.12.0.88
scipy==1.15.3
requests==2.32.5
tqdm==4.67.1
torch==2.7.1
torchvision==0.22.1
segment-anything==1.0
scikit-learn==1.7.2
pillow==12.1.1
hydra-core==1.3.2
omegaconf==2.3.0
urllib3==2.5.0
certifi==2025.11.12
idna==3.11
charset-normalizer==3.4.4
```

```bash
uvx pip-audit --no-deps --disable-pip -r requirements-pinned.txt     # expect 58 known vulnerabilities in 6 packages (as of 2026-09-15)
```
