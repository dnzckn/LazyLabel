# PREFLIGHT — `lazylabel` (PyQt6 desktop app → React / Node.js web app)

| | |
|---|---|
| System | LazyLabel — `lazylabel-gui` 2.0.8, Python 3.10 / PyQt6 image-segmentation GUI with SAM 1 / SAM 2.1 |
| System dir for `/modernize-*` commands | `lazylabel` — run `/code-modernization:modernize-assess lazylabel`, `/code-modernization:modernize-map lazylabel`, … from `E:\GitHub\LazyLabel`. In this app the `code-modernization:` prefix is required; the short `/modernize-assess` form returns "Unknown command". Short names elsewhere in this report refer to these commands |
| Legacy source | `legacy/lazylabel/` = linked `git worktree` at detached HEAD **2a7d5d8** (verify: `git -C E:/GitHub/LazyLabel worktree list`); ignored via `.gitignore` rule `/legacy/`; **read-only — never edit files in it, never run `git switch`/`git checkout` inside it** |
| Live checkout | `E:\GitHub\LazyLabel` on branch **`main-web`** — every modernization change goes here; `main` is untouched |
| Artifacts | `analysis/lazylabel/` (this file); new code goes in `modernized/lazylabel/` |
| Target stack | React + TypeScript + Vite + Vitest on Node 22 (web-hosted) |
| Run date | 2026-09-14, Windows 11, Claude Code (Git Bash for shell commands) |
| Overall verdict | **Ready-with-gaps** — nothing red; both toolchains proven end to end; analysis tools installed and on PATH (2026-09-14); the only gap is one open Check 0 sub-question (fate of the PyPI package), decided in the brief |

---

## Check 0 — Human answers (verbatim)

Asked in-session on 2026-09-14. The human answered in one message; the exact text is quoted, nothing paraphrased.

| # | Question | Answer (verbatim) |
|---|---|---|
| 1 | **Scope** — Is `E:\GitHub\LazyLabel` the complete system, or one slice of a larger codebase? If a slice: what *outside* it depends on code *inside* it, and is breaking those consumers acceptable? | "so the whole idea is to convert from pyqwt6 into react/node.js framework so that the full app can be webhosted eventually" and "so ideally you put changes to a new branch called main-web" |
| 2 | **Build & test locally** — Can this environment restore, build, and run the tests? Roughly how long does the full CI pipeline take? | "everything else is n/a on the questions" — plus, unprompted: "there's a lazylabel uv venv that this app runs in previously" |
| 3 | **Bespoke build infrastructure** — organization-specific build or dependency-resolution machinery someone new would not guess? Where documented? | "everything else is n/a on the questions" |
| 4 | **Prior attempts** — Has anyone tried to modernize any of this before? What went wrong? | "everything else is n/a on the questions" |
| 5 | **Off limits** — Is anything under the repo not allowed to change in this pass? | "everything else is n/a on the questions" |

**Open item the human must fill in (Q1, second half — not answered):** "If a slice: what *outside* it depends on code *inside* it, and is breaking those consumers acceptable?" — Check 6 found one inbound consumer independently: the public PyPI package `lazylabel-gui` (console entry point `lazylabel-gui = lazylabel.main:main`, `pyproject.toml:6,35`; `README.md:16,22`). The human has not said whether breaking, freezing, or replacing that package is acceptable. **Answer needed at the `/modernize-brief` approval checkpoint; until then the brief carries it as an undecided line item** (options in Check 6).

Additional statement from the human, outside the five questions (verbatim): "once you have the plan in place I will switch the model to something cheaper". Consequence for this report and every artifact after it: instructions must be executable literally — exact commands, absolute paths, expected output, explicit acceptance criteria.

Interpretation used by this report. It is final unless the human writes a correction directly under this list in this file before `/modernize-assess lazylabel` runs; downstream commands must not re-ask the Check 0 questions.
- Q1: the repo is the whole system and the *entire* app is in scope for conversion; changes land on `main-web`; `main` stays the frozen legacy.
- Q2: measured locally instead — 976 tests: 933 unit in 20.5 s + 43 integration in 3.0 s (commands in Check 3b; one full run is about 30 s wall). Restore time was not timed; no CI timing exists (the human answered n/a). No hours-long pipeline, so validation runs locally on every step.
- Q3–Q5: no bespoke infra, no prior attempts, nothing off limits. Check 3a found the only non-obvious build machinery on its own (git-sourced `sam2`, PyTorch CUDA index, hand-placed checkpoints).

---

## Check 6 — Scope boundary (leads because every downstream command assumes `legacy/lazylabel` *is* the system)

**Finding: `E:\GitHub\LazyLabel` is a standalone repository for source-code purposes. No sibling repository imports it or references its path. The crossings that exist are environmental (a shared venv) and public (the package is on PyPI), not shared source.**

Verified from the source, independently of the human's answer:
- `git rev-parse --show-toplevel` is the repo itself; no `.gitmodules`, no symlinks, no parent build file, no `../` references escaping the tree.
- Swept every sibling git repository under `E:\GitHub` for references to this package — zero hits. Reproduce (about 2 s; expected output: nothing):

```bash
for d in /e/GitHub/*/; do [ "$d" = "/e/GitHub/LazyLabel/" ] && continue; [ -e "$d.git" ] || continue; git -C "$d" grep -lIE '(import|from) lazylabel\b|lazylabel-gui|lazylabel\.main' | sed "s|^|$d|"; done
```

  The 20 siblings are BasicBO, BusyBee, LazyLabelText, MCP, MIT_DL_Course, ML_Telephone, ML_demos, MusicWars, PASCAL, PASCAL_TrainView, Python-Utilities, SAMRefiner, aaron_homework, autogluon, llama, sam2, segment-anything-ui, src, transformers, triton. The four non-git folders (`MCP/`, `ML_demos/`, `aaron_homework/`, `src/`) were checked with ripgrep for the same pattern: zero hits. `E:\GitHub\LazyLabelText` shares the venv but has no dependency on LazyLabel (`E:/venv/lazylabel/Scripts/python.exe -m pip show lazylabeltext` lists no `lazylabel-gui` under Requires).
- No installed copy on this machine (no Program Files dir, Start Menu entry, uninstall registry key, or `dist/`).

### Inbound (things outside the repo that depend on things inside it)

| Consumer | Kind | Evidence | Breaks if the Python source is removed or moved? | Decision needed |
|---|---|---|---|---|
| **PyPI package `lazylabel-gui` + README `pip install lazylabel-gui[include-ai]`** (public users) | public package + console entry point `lazylabel-gui = lazylabel.main:main` | `pyproject.toml:6,35`; `README.md:3,16,22` | **Yes** | **Yes.** Decided by: the human, at the `/modernize-brief` approval checkpoint. Recorded in: `analysis/lazylabel/MODERNIZATION_BRIEF.md`, a line item titled `PyPI package lazylabel-gui`, choosing exactly one of: (a) the web app replaces the package — 2.0.8 is the last PyPI release; (b) coexist — Python kept as an inference backend and still published; (c) frozen at 2.0.8, no further releases. The brief must not be approved without one of these written down. This is the only inbound consumer that matters. |
| `E:\venv\lazylabel` editable install (`__editable__.lazylabel_gui-2.0.8.pth` → `E:\GitHub\LazyLabel\src`) and `Scripts\lazylabel-gui.exe` shim | dev environment | `site-packages/lazylabel_gui-2.0.8.dist-info/direct_url.json` | Yes, but trivially re-created with `cd E:/GitHub/LazyLabel && uv pip install --python E:/venv/lazylabel/Scripts/python.exe -e .` | No |
| `E:\GitHub\LazyLabelText` (sibling repo, second editable install in the same venv) | shared venv only | `pip show lazylabeltext` → no `lazylabel-gui` in Requires; 0 import hits | No | No |
| `E:\GitHub\aaron_homework\*.ipynb` (Jupyter kernel named `lazylabel`) | references the venv *name* | notebook metadata only | No | No |

Footnote, not a consumer: `E:\GitHub\src\lazylabel\demo_pictures\bw_test.png` is an orphan stray directory (no code, no git, referenced by nothing) — safe to delete outside this effort.

### Outbound (things inside the repo that depend on things outside it)

| Dependency | Real source | Declared in `pyproject.toml`? | Evidence |
|---|---|---|---|
| **`sam2` (SAM-2 1.0)** | `git+https://github.com/facebookresearch/sam2.git@2b90b9f5ceec907a1c18123530e92e794ad901a4` — a **git install, not PyPI** | **No** (only a log hint at `src/lazylabel/core/model_manager.py:20`) | `site-packages/sam_2-1.0.dist-info/direct_url.json`; imported at `src/lazylabel/models/sam2_model.py:18` |
| `hydra-core` 1.3.2, `omegaconf` 2.3.0 | PyPI, transitively via sam2 | **No** — imported directly at `src/lazylabel/models/sam2_model.py:116,117,137,657` | `pip show hydra-core` → Required-by: SAM-2 |
| `pillow` 12.1.1 | PyPI, transitively via torchvision | **No** — imported directly at `src/lazylabel/ui/workers/reference_finder_worker.py:142` | `pip show pillow` |
| `torch` 2.7.1+cu126, `torchvision` 0.22.1+cu126 | **PyTorch CUDA index** `https://download.pytorch.org/whl/cu126`, not PyPI | Yes (`include-ai`, no index pin) | uv cache wheel URLs |
| NSIS `makensis.exe` | hard-coded `C:\Program Files (x86)\NSIS\` | build-time only | `build_system/windows/build_windows.py:99-100` |
| User-profile state | `~/.config/lazylabel`, `~/.cache/lazylabel`, `~/.lazylabel/logs` | runtime | `src/lazylabel/config/paths.py:20-21`, `src/lazylabel/utils/logger.py:43` |

Consequence for downstream commands: `/modernize-map` will see every import resolve (the venv has them all), but the **dependency manifest is incomplete** — four directly-imported packages are undeclared, and one comes from git. Any characterization harness or Docker image for the Python side must install `sam2` from git explicitly, pinned to the commit in this venv:

```bash
pip install "git+https://github.com/facebookresearch/sam2.git@2b90b9f5ceec907a1c18123530e92e794ad901a4"
```

(Already installed in this machine's venv — verify with `E:/venv/lazylabel/Scripts/python.exe -c "import sam2; print('ok')"`.)

---

## Status table

| Check | Status | Found | Fix (if not green) |
|---|---|---|---|
| 0 Human answers | ⚠️ | Q1 first half + Q2–Q5 answered verbatim ("everything else is n/a on the questions"); Q1 second half (is breaking the PyPI consumer acceptable?) is **OPEN** | Human fills in the open item in Check 0 before approving `/modernize-brief` |
| 1 Stack detection | ✅ | Python 3.10 / PyQt6 desktop GUI; setuptools + pytest-qt + ruff; PyInstaller + NSIS for Windows; 110 src files / 37,173 lines, 65 test files / 14,971 lines | — |
| 2 Analysis tooling | ✅ | scc 4.1.0, cloc 2.10, glow 3.0.0, delta 0.19.2, lizard 1.24.0 installed on 2026-09-14; all five resolve on the Bash tool's PATH via shims in `C:\Users\Deniz\bin` (Check 2) | — |
| 3a Build definition | ✅ | `.github/workflows/tests.yml` is the ground truth (Ubuntu, Python 3.10 only, PyPI, no private feed); Windows packaging in `build_system/windows/` is bespoke and currently cannot complete (missing 2.56 GB checkpoint) | Packaging is not needed for the web conversion; note only |
| 3b Legacy smoke (Level 2) | ✅ | Restore OK (uv, 8 dev packages added), `ruff check` clean, **976/976 tests pass**; `ruff format --check` failed on 3 Markdown files as it would in CI — **fixed on `main-web`** during preflight (one-line `pyproject.toml` change, Check 3b), now exit 0 | — (whether to port the one-line fix to `main` is a brief line item; default: leave `main` untouched) |
| 3b Target smoke (React/Node) | ✅ | Node v22.17.0, npm 11.4.2, registry reachable; Vite 8.3.0 + React 19.3.0 + TS 6.0.3 scaffold installs (8 s), builds (4 s), type-checks, Vitest 5.0.0 runs 2/2 (1.4 s) | — |
| 4 Source completeness | ✅ | 0 unresolved imports (5 flagged relative imports are all inside `if TYPE_CHECKING:` blocks); all config descriptors present; 7 annotation formats documented; 1 model checkpoint missing on disk (auto-downloads at runtime); **no checkpoints at all inside `legacy/lazylabel`** (gitignored) | — |
| 5 Optional context | ⚠️ | No telemetry/APM (none connected, app has none); git history is rich (282 commits over ≈13.5 months, 2025-06-13 → 2026-07-25; 42 tags v1.3.8 … v2.0.8); a 723 KB local app log exists | Decision in Check 5 (default: skip the runtime overlay) |
| 6 Scope boundary | ⚠️ | Standalone source; one public inbound consumer (PyPI package) needs a brief-level decision; one undeclared git-sourced dependency (`sam2`) | Record the PyPI decision as its own line item in `/modernize-brief` |

Working-tree state at the end of this preflight: `.gitignore` (workspace rules), `pyproject.toml` (ruff `*.md` exclude) and this file are committed on `main-web`. Verify: `git -C E:/GitHub/LazyLabel status --short` prints nothing. No pre-commit hook is installed in this checkout (`.git/hooks/pre-commit` is absent), so commits do not trigger the full pytest run that `.pre-commit-config.yaml` declares.

---

## Check 1 — Stack detected

**Languages / file split** (212 tracked files at 2a7d5d8):

| Kind | Count | Notes |
|---|---|---|
| Python `.py` | 176 | 110 in `src/lazylabel` (37,173 lines), 65 under `tests/` (14,971 lines), 1 build script |
| Media (`.gif`, `.png`, `.ico`) | 19 | README animations in `src/lazylabel/media` (2.4 MB) + demo pictures / logos (4.3 MB). No package-data or `MANIFEST.in` declares them, so they do **not** ship in the wheel (`src/lazylabel_gui.egg-info/SOURCES.txt` lists none) |
| Markdown | 6 | README, CHANGELOG, build docs, `src/lazylabel/ARCHITECTURE.md`, `src/lazylabel/USAGE_MANUAL.md` (the last two also do not ship in the wheel) |
| Config | 6 | `pyproject.toml`, `.github/workflows/tests.yml`, `.pre-commit-config.yaml`, `build_system/windows/lazylabel.spec`, `build_system/windows/installer/installer.nsi`, `CITATION.cff` |
| Other | 5 | `.gitignore`, `LICENSE`, `NOTICE`, `src/lazylabel/demo_pictures/.DS_Store` (stray, committed before the ignore rule), `tests/data/.gitkeep` |

Commands that produced these numbers (run as one Bash call):

```bash
cd E:/GitHub/LazyLabel
git ls-tree -r --name-only 2a7d5d8 | wc -l                   # 212 tracked files
git ls-tree -r --name-only 2a7d5d8 | grep -c '\.py$'         # 176 .py
git ls-files 'src/lazylabel/*.py' | wc -l                    # 110
git ls-files 'src/lazylabel/*.py' | xargs cat | wc -l        # 37173 lines
git ls-files 'tests/*.py' | wc -l                            # 65
git ls-files 'tests/*.py' | xargs cat | wc -l                # 14971 lines
uvx lizard -l python src/lazylabel | tail -4                 # 24204 NLOC, 1751 functions, AvgCCN 3.4, 48 warnings (= functions with CCN > 15); uvx downloads lizard into the uv cache on first use
```

**Complexity snapshot** (`uvx lizard`, above): 1,751 functions, 24,204 NLOC, average CCN 3.4, 48 functions over CCN 15. The largest file is `src/lazylabel/ui/main_window.py` at 7,446 lines (20 % of the source). `src/lazylabel/ui/managers/` holds 25 modules plus `__init__.py`; 22 of them are `*Manager` delegation shims holding a back-reference to `MainWindow` (the other three: `coordinate_transformer.py`, `multi_view_coordinator.py`, `sam_preload_scheduler.py`), so the reusable domain logic lives in `src/lazylabel/core/` (`segment_manager`, `file_manager`, `exporters/`, `undo_redo_manager`, `model_manager`).

**Build system**: setuptools via `pyproject.toml` (`lazylabel-gui` 2.0.8, `requires-python >=3.10`). Runtime deps: PyQt6 ≥6.7.1,<6.10, numpy ≥2.1.2, opencv-python, scipy, requests, tqdm. Optional `include-ai`: torch ≥2.7.1, torchvision, segment-anything==1.0, scikit-learn. `dev`: pytest, pytest-cov, pytest-mock, pytest-qt, ruff.

**Deployment / config descriptors**: console script `lazylabel-gui = lazylabel.main:main`; `python -m lazylabel`; PyInstaller one-dir `LazyLabel.exe` (`build_system/windows/lazylabel.spec`) + NSIS installer (`build_system/windows/installer/installer.nsi`, targets `%ProgramFiles%\LazyLabel`); GitHub Actions `Tests` workflow; pre-commit (ruff + full pytest on every commit, when the hook is installed).

**Architecture shape relevant to the target**: Qt-signal driven; long operations in `QThread` workers under `src/lazylabel/ui/workers/`; a `src/lazylabel/viewmodels/` MVVM layer; SAM/SAM2 inference through PyTorch (Hydra-config-driven `sam2.build_sam`). There is **no CLI surface** (no argparse; `sys.argv` goes straight to `QApplication`, `src/lazylabel/main.py:61`) and **no network API** — the web rewrite has nothing to wrap, it must re-implement.

---

## Check 2 — Analysis tooling

| Tool | Status (2026-09-14) | Version | Used by | Without it | Installed by |
|---|---|---|---|---|---|
| `scc` | ✅ installed | 4.1.0 | assess | LOC/complexity fall back to `find`+`wc`; COCOMO index coarser | `winget install --exact --id BenBoyter.scc` |
| `cloc` | ✅ installed | 2.10 | assess (fallback for scc) | same as above | `winget install --exact --id AlDanial.Cloc` |
| `lizard` | ✅ installed | 1.24.0 | assess --portfolio (calls bare `lizard`) | complexity estimated from decision-keyword counts | `uv tool install lizard` + `uv tool update-shell` |
| `glow` | ✅ installed | 3.0.0 | all | markdown artifacts render as plain text (cosmetic) | `winget install --exact --id charmbracelet.glow` |
| `delta` | ✅ installed | 0.19.2 | transform | side-by-side diffs fall back to `diff -y` | `winget install --exact --id dandavison.delta` |

winget could not create symlinks (no symlink privilege), so it added each package directory to the **user** PATH (registry) instead. The Claude Code desktop process (`claude.exe`) does not pick up user-PATH changes even after a restart, so its Bash tool never saw them. Fix applied 2026-09-14: five one-line bash shims in `C:\Users\Deniz\bin` (Git Bash puts `~/bin` first on PATH), each `exec`-ing the real executable. Verify — expected five paths under `/c/Users/Deniz/bin/`:

```bash
which scc cloc glow delta lizard
```

Real executable locations, should a shim ever need recreating:

```bash
P=/c/Users/Deniz/AppData/Local/Microsoft/WinGet/Packages
"$P/BenBoyter.scc_Microsoft.Winget.Source_8wekyb3d8bbwe/scc.exe" --version                                   # scc version 4.1.0
"$P/AlDanial.Cloc_Microsoft.Winget.Source_8wekyb3d8bbwe/cloc.exe" --version                                  # 2.10
"$P/charmbracelet.glow_Microsoft.Winget.Source_8wekyb3d8bbwe/glow_3.0.0_Windows_x86_64/glow.exe" --version   # glow version 3.0.0
"$P/dandavison.delta_Microsoft.Winget.Source_8wekyb3d8bbwe/delta-0.19.2-x86_64-pc-windows-msvc/delta.exe" --version   # delta 0.19.2
/c/Users/Deniz/.local/bin/lizard --version                                                                   # 1.24.0
```

Functional check already run: `scc --no-cocomo E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel` → Python 110 files, 37,173 lines, 24,204 code, complexity 4,921 (agrees with the Check 1 numbers).

Install block (already run on this machine; rerun only on a new machine, as one Bash call — winget accepts only one `--id` per invocation):

```bash
winget install --exact --id BenBoyter.scc --accept-package-agreements --accept-source-agreements
winget install --exact --id AlDanial.Cloc --accept-package-agreements --accept-source-agreements
winget install --exact --id charmbracelet.glow --accept-package-agreements --accept-source-agreements
winget install --exact --id dandavison.delta --accept-package-agreements --accept-source-agreements
uv tool install lizard
uv tool update-shell
```

On a new machine, after the install block, recreate the `~/bin` shims (one Bash call; adjust the versioned directory names to what winget created):

```bash
B=/c/Users/Deniz/bin; P=/c/Users/Deniz/AppData/Local/Microsoft/WinGet/Packages; mkdir -p "$B"
mk() { printf '#!/bin/bash\nexec "%s" "$@"\n' "$2" > "$B/$1"; chmod +x "$B/$1"; }
mk scc    "$P/BenBoyter.scc_Microsoft.Winget.Source_8wekyb3d8bbwe/scc.exe"
mk cloc   "$P/AlDanial.Cloc_Microsoft.Winget.Source_8wekyb3d8bbwe/cloc.exe"
mk glow   "$P/charmbracelet.glow_Microsoft.Winget.Source_8wekyb3d8bbwe/glow_3.0.0_Windows_x86_64/glow.exe"
mk delta  "$P/dandavison.delta_Microsoft.Winget.Source_8wekyb3d8bbwe/delta-0.19.2-x86_64-pc-windows-msvc/delta.exe"
mk lizard "/c/Users/Deniz/.local/bin/lizard.exe"
which scc cloc glow delta lizard      # expect five paths under /c/Users/Deniz/bin/
```

Stack-specific SAST for `/modernize-harden` (none installed; all runnable without touching the venv):

```bash
uvx bandit -r E:/GitHub/LazyLabel/src/lazylabel
PIPAPI_PYTHON_LOCATION=E:/venv/lazylabel/Scripts/python.exe uvx pip-audit
cd <react project dir> && npm audit        # target side; the smoke scaffold audited clean (0 vulnerabilities)
```

`semgrep` is not installed and is not required.

---

## Check 3 — Build toolchain

### 3a — Build definition (ground truth)

`.github/workflows/tests.yml` (the only pipeline):

1. `ubuntu-latest`, Python matrix `["3.10"]` only (no 3.11/3.12 coverage).
2. `apt-get install` Qt6 runtime libs + `xvfb`.
3. `pip install -e ".[dev]"` — **PyPI only**, no `--index-url`, no private feed, no lock file.
4. `ruff check --output-format=github .` then `ruff format --check .`
5. `QT_QPA_PLATFORM=offscreen xvfb-run -a pytest --cov=lazylabel`; Codecov upload is non-fatal.

Pinned toolchain: Python 3.10 (matrix) and nothing else — `ruff>=0.8.0` has **no upper bound**, which is the root cause of the 3b lint failure below. `.pre-commit-config.yaml` pins `ruff-pre-commit v0.12.2` and runs the *entire* pytest suite on every commit (hook not installed in this checkout).

Bespoke machinery a newcomer would not guess (all found in the source, none documented centrally):
- **`sam2` is installed from git**, not PyPI, and is not declared anywhere (`build_system/windows/BUILD_WINDOWS.md:68` is the only mention). Fresh environments that only run `pip install -e ".[include-ai]"` get SAM 1 but silently lack SAM 2.1.
- **torch comes from the PyTorch CUDA index** (`+cu126` builds); a plain PyPI install yields CPU wheels.
- **Windows packaging** (`build_system/windows/build_windows.py` → PyInstaller spec → NSIS) requires two checkpoints placed by hand in `src/lazylabel/models/` (`sam_vit_h_4b8939.pth` ≈2.56 GB / 2.39 GiB, `sam2.1_hiera_large.pt` 898 MB / 857 MiB), a hard-coded NSIS path, and generates `src/lazylabel/_version.py` + `version_info.txt` on the fly. It currently **cannot complete** on this machine: `sam_vit_h_4b8939.pth` is absent and PyInstaller aborts at `build_system/windows/lazylabel.spec:26`. NSIS also cannot package files over 2 GB, so the documented ~8 GB installer is aspirational (the script itself says to ship a ZIP).
- **Version drift in three places**: `pyproject.toml:7` = 2.0.8 (authoritative) · committed `src/lazylabel/_version.py:7` = 1.6.17 (stale generated file) · `build_system/windows/installer/installer.nsi:16` = 1.4.0 (hard-coded, never rewritten).

### 3b — Smoke test, legacy stack (Python / PyQt6)

Environment used: the uv venv `E:\venv\lazylabel` (Python 3.10.11). The test ran in the live checkout `E:\GitHub\LazyLabel` (the editable install points at `E:\GitHub\LazyLabel\src`); `legacy/lazylabel` is the identical tree at 2a7d5d8 apart from `.gitignore` and the `pyproject.toml` ruff exclude below.

| Level | Command | Result |
|---|---|---|
| 1 — byte-compile all 110 source files | `E:/venv/lazylabel/Scripts/python.exe -m compileall -q src/lazylabel` | ✅ OK |
| 1 — import the 7,446-line main window headless | `QT_QPA_PLATFORM=offscreen E:/venv/lazylabel/Scripts/python.exe -c "import lazylabel.ui.main_window"` | ✅ OK — **53.7 s cold** (torch + sam2 import at module load) |
| 2 — restore exactly as CI | `uv pip install --python E:/venv/lazylabel/Scripts/python.exe -e ".[dev]"` | ✅ 8 packages added (pytest 9.1.1, pytest-qt 4.5.0, pytest-cov 7.1.0, pytest-mock 3.15.1, ruff 0.16.7, coverage, iniconfig, pluggy); editable `lazylabel-gui` refreshed 2.0.1 → 2.0.8; nothing else changed (`pip freeze` diff verified); wall time not measured (a few seconds) |
| 2 — lint | `E:/venv/lazylabel/Scripts/python.exe -m ruff check .` | ✅ "All checks passed!" |
| 2 — format check (before fix) | `E:/venv/lazylabel/Scripts/python.exe -m ruff format --check .` | ❌ **exit 1 — 3 files would be reformatted**, all Markdown: `README.md:106`, `build_system/windows/BUILD_WINDOWS.md:168`, `src/lazylabel/USAGE_MANUAL.md:435`. Observed on ruff 0.16.7: fenced ```python blocks in `.md` files are formatted (single → double quotes) and `[tool.ruff] exclude` did not list `*.md`. **Every `.py` file was already formatted.** Reproduces on a fresh CI runner because the pin is `ruff>=0.8.0`. |
| 2 — format check (after fix, `main-web`) | same command | ✅ exit 0 — "176 files already formatted" |
| 2 — collect | `QT_QPA_PLATFORM=offscreen E:/venv/lazylabel/Scripts/python.exe -m pytest --co -q -p no:cacheprovider` | ✅ 976 tests, no collection errors |
| 2 — unit suite | `QT_QPA_PLATFORM=offscreen E:/venv/lazylabel/Scripts/python.exe -m pytest tests/unit -q -p no:cacheprovider` | ✅ **933 passed**, 0 failed, 0 skipped — 20.5 s |
| 2 — integration suite | `QT_QPA_PLATFORM=offscreen E:/venv/lazylabel/Scripts/python.exe -m pytest tests/integration -q -p no:cacheprovider` | ✅ **43 passed** — 3.0 s |
| 2 — packaging | PyInstaller build | ⏭️ not run — would fail on the missing checkpoint (3a); irrelevant to the web target |

Diagnosis of the one failure: pre-existing on `main`, Markdown-only, unrelated to modernization. Fix **applied on `main-web` during this preflight** (do NOT edit `main` or `legacy/lazylabel`): in `E:/GitHub/LazyLabel/pyproject.toml`, the `exclude = [ ... ]` list under `[tool.ruff]` now reads:

```toml
exclude = [
    ".git",
    ".pytest_cache",
    "__pycache__",
    "dist",
    "build",
    "*.egg-info",
    "*.md",
]
```

Verify:

```bash
cd E:/GitHub/LazyLabel && E:/venv/lazylabel/Scripts/python.exe -m ruff format --check .
```

Expected: exit 0 and no "would be reformatted" line. Whether the same one-line change is also applied to `main` is the human's decision; record it in `analysis/lazylabel/MODERNIZATION_BRIEF.md` under a line item `Legacy hygiene (ruff *.md exclude on main)`. Default if unanswered: leave `main` untouched.

Side effects of this check, disclosed: `E:\venv\lazylabel` now contains the `[dev]` extras; `.ruff_cache/` was created in the repo (it ships its own `.gitignore`, so `git status` is unaffected).

### 3b — Smoke test, target stack (React / Node.js)

| Level | Command | Result |
|---|---|---|
| 0 — runtime | `node -v` / `npm -v` / `npm config get registry` | v22.17.0 / 11.4.2 / `https://registry.npmjs.org/` reachable; no `.npmrc` |
| 1 — scaffold + type-check | `npm create vite@latest ll-web-smoke -- --template react-ts` then `npx tsc --noEmit -p tsconfig.app.json` | ✅ create-vite 9.2.1, non-interactive; tsc exit 0 |
| 2 — install | `npm install` | ✅ 8 s, 0 vulnerabilities (70 packages before test deps; 153 in the lock file after) |
| 2 — build | `npm run build` (`tsc -b && vite build`) | ✅ 4 s cold / 2 s warm; 222 kB bundle (69 kB gzip) |
| 2 — test | `npx vitest run` with jsdom + Testing Library | ✅ 2/2 in 1.4 s (cold jsdom start was ~26 s once) |

Versions: declared by the template `react ^19.2.8`, `typescript ~6.0.2`, `vite ^8.3.0`; resolved today vite 8.3.0, react 19.3.0, typescript 6.0.3 (the `~6.0.2` range deliberately excludes the registry's current typescript 7.x), vitest 5.0.0, @vitejs/plugin-react 6.1.1.

Every scaffolded React project must do the following, verbatim, before its first test:

```bash
cd <project dir>
npm install -D vitest@5 jsdom @testing-library/react @testing-library/jest-dom
```

Create `vitest.config.ts` next to `vite.config.ts` (Vitest does not read the plugins from `vite.config.ts`; `globals: true` is required for Testing Library auto-cleanup — the first smoke run failed without it):

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
})
```

Create `src/setupTests.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Run `npx vitest run` — expected: all tests pass, exit 0.

Linting: create-vite 9.x ships `oxlint` 1.83 (`npm run lint` passes on the scaffold); **ESLint is absent**. Default: use oxlint; add ESLint only if the brief requires it.

Reference scaffold (session temp directory — may be deleted at any time, do not build on it): `C:/Users/Deniz/AppData/Local/Temp/claude/E--GitHub-LazyLabel/ac9e80f5-5353-4a6f-b6a5-8705236b7073/scratchpad/target-smoke/ll-web-smoke`. To recreate it anywhere:

```bash
cd <parent dir>
npm create vite@latest ll-web-smoke -- --template react-ts
cd ll-web-smoke && npm install && npm run build
```

then apply the Vitest block above and run `npx vitest run`.

**SAM inference is the target-stack question preflight cannot answer.** The legacy app runs SAM 1 / SAM 2.1 through PyTorch with CUDA. A pure React/Node target needs one of: an ONNX-exported SAM (encoder + prompt decoder) run in-browser with `onnxruntime-web` 1.30.0 (WebGPU/WASM) or in Node with `onnxruntime-node` 1.30.0 (both installable today, neither benchmarked), or a retained Python inference service behind HTTP/WebSocket. SAM 2.1 *video propagation* has no browser-side equivalent at all. This is a `/modernize-brief` architecture line item, flagged here only.

**Repo-level traps for a Node project inside this repo** (verified with `git check-ignore`):
- `*.json` and `*.txt` are ignored globally (`.gitignore:9,19`) — mitigated on `main-web` by `!/analysis/**/*.json|txt` and `!/modernized/**/*.json|txt` (`.gitignore:56-59`).
- `node_modules/`, `coverage/`, `*.onnx` had **no** rule — added on `main-web` (`.gitignore:60-62`) during this preflight. Keep create-vite's nested `.gitignore` (`dist`, `*.local`) in each scaffolded project.
- Rule for all scaffolding: never create a directory named `env` or `venv` under `modernized/` (`.gitignore:33-34` ignore those names anywhere). If a generator does, change those two lines to `/venv/` and `/env/`, then verify with `git -C E:/GitHub/LazyLabel check-ignore -v modernized/lazylabel/src/env/x` (expected: no output).
- `.env` is ignored everywhere (`.gitignore:35`); ship shared defaults as `.env.example`.
- `.vscode/` is ignored wholesale (`.gitignore:38`); create-vite's `extensions.json` recommendation cannot be committed.

### Uplift-specific signals (asked for by the command; this is *not* a same-stack bump)

- (a) Source runtime (Python 3.10 + venv) and target runtime (Node 22) are **both present and proven** → a true dual-run is possible: the Python app and the web app can be driven side by side on the same inputs to compare exported annotation files byte-for-byte (the 7 sidecar formats in Check 4 are the natural equivalence contract).
- (b) No migration tool exists for PyQt6 → React; the delta-catalog concept does not apply. The equivalent work is `/modernize-transform` (module by module) or `/modernize-reimagine` (greenfield) — the brief decides which.
- (c) Inbound external consumers: **one** — the public PyPI distribution `lazylabel-gui` (installed entry point `lazylabel.main:main`, `pyproject.toml:35`). No sibling *source* repo references this tree, so no in-tree node needs dual-build treatment; but the package identity does need an explicit transition decision (replace / coexist / freeze — Check 6 options) as its own line item in `/modernize-brief`. Ready-with-gaps on this signal, not Not-ready.

---

## Check 4 — Source completeness

**Referenced-but-missing includes: 0.** All 14 third-party top-level modules resolve in the venv (`PIL`, `PyQt6`, `cv2`, `hydra`, `numpy`, `omegaconf`, `requests`, `sam2`, `scipy`, `segment_anything`, `sklearn`, `torch`, `torchvision`, `tqdm`). The AST pass flagged 5 relative imports whose target path does not exist; all five sit inside `if TYPE_CHECKING:` blocks and are never executed (`src/lazylabel/ui/managers/ai_segment_manager.py:26`, `file_navigation_manager.py:26,32`, `image_adjustment_manager.py:22`, `save_export_manager.py:35`). They are wrong paths (e.g. `..settings` instead of `...config.settings`) that ruff does not flag; a type checker would. Harmless at runtime; do not port them.

**Deployment / config descriptors: all present** (Check 1 list). Entry points for `/modernize-map`: `lazylabel.main:main` (console script, `python -m lazylabel`, PyInstaller `Analysis` script) — one GUI bootstrap, nothing else.

**Data definitions — the contracts a web rewrite must preserve.** There is no DDL or ORM; the persistent data is annotation *sidecar files written beside each image* plus two JSON config files. All formats are implemented in `src/lazylabel/core/exporters/` and read back in `src/lazylabel/core/file_manager.py`; round-trips are pinned by `tests/unit/core/exporters/test_bbox_roundtrip.py`.

| Sidecar | Written by | Read back? | Shape |
|---|---|---|---|
| `<stem>.npz` one-hot mask | `exporters/npz.py:15-30` | yes (highest priority) | `mask` (H,W,C) uint8 0/1, `class_order` (C,) int64, `class_aliases` = **pickled Python dict** (`np.load(allow_pickle=True)`) — a Node reader cannot unpickle this without extra work |
| `<stem>_CM.npz` class map | `exporters/npz_class_map.py` | yes (since 2.0.8) | `class_map` (H,W) uint16, `foreground` (H,W) bool, `class_order`, `class_aliases` |
| `<stem>_seg.txt` YOLO segmentation | `exporters/yolo_segmentation.py` | yes | `class_id x1 y1 … xn yn` normalized |
| `<stem>_coco.json` COCO (per image) | `exporters/coco.py` | yes | images / annotations (bbox, polygon segmentation) / categories; supercategory from alias dot-notation |
| `<stem>.xml` Pascal VOC | `exporters/pascal_voc.py` | yes (boxes) | `bndbox` with **exclusive** xmax/ymax |
| `<stem>_createml.json` Apple CreateML | `exporters/createml.py` | yes (boxes) | `[{image, annotations:[{label, coordinates:{x,y,width,height}}]}]` |
| `<stem>.txt` YOLO detection | `exporters/yolo_detection.py` | yes (lossy, boxes) | `class_id cx cy w h` normalized |

Load priority (`src/lazylabel/core/exporters/__init__.py:73-81`): NPZ > YOLO-seg > COCO > CM > VOC > CreateML > YOLO-det. Writing never deletes other formats. Legacy-compat rules on read (`src/lazylabel/core/file_manager.py:234-379`): old `masks` key variants, `_CM.npz` without `foreground`, YOLO files whose first token is a *name* rather than an id (`_build_label_map`), COCO RLE degrades to bbox. There is **no separate class-definition file**; aliases travel inside each sidecar.

**Persisted state** (Windows paths are literal dot-dirs under the user profile, not `%APPDATA%`):

| What | Path | Format |
|---|---|---|
| Settings (37 dataclass fields: window geometry, panel widths, point radius, thresholds, image adjustments, default model, stream window size…) | `~/.config/lazylabel/settings.json` (`src/lazylabel/config/paths.py:20`) | JSON; **loader does `cls(**data)` — one unknown key silently resets all preferences** (`src/lazylabel/config/settings.py:96-98`) |
| Hotkeys (24 actions saved of 43 `HotkeyAction(...)` definitions in `src/lazylabel/config/hotkeys.py`) | `~/.config/lazylabel/hotkeys.json` | JSON `{action: {primary_key, secondary_key}}`, tolerant loader |
| App log (INFO, no rotation; 723 KB on this machine) | `~/.lazylabel/logs/lazylabel.log` (`src/lazylabel/utils/logger.py:43`) | text |
| Model checkpoints | `<package>/models/` — i.e. **inside site-packages when pip-installed**; `sys._MEIPASS/models` when frozen (`src/lazylabel/config/paths.py:12-19`) | `*.pth` / `*.pt` |
| Theme icon cache | `~/.cache/lazylabel/theme-icons/` | SVG |
| SAM2 video frames (transient) | `%TEMP%/sam2_video_*/00000.jpg …` | JPEG q95 — sequence mode runs propagation on lossy copies of PNG/TIFF sources |
| Sequence/timeline state (reference frames, flags, archetypes) | **not persisted** — in-memory only | — |
| Recent files / last folder | **not persisted** | — |

**Binary-only artifacts** (all gitignored via `*.pt`, `*.pth`, `*.npz` — `.gitignore:3,4,18`):

| File | Size | On disk? (live checkout / `legacy/lazylabel` worktree) | Referenced by | Status |
|---|---|---|---|---|
| `src/lazylabel/models/sam2.1_hiera_large.pt` | 898 MB (857 MiB) | yes / **no** | `build_system/windows/lazylabel.spec:27`; model discovery by filename | manual download only (no auto-download in code) |
| `src/lazylabel/models/sam_vit_h_4b8939.pth` | ≈2.56 GB (2.39 GiB), expected | **no** / no | `build_system/windows/lazylabel.spec:26`; `src/lazylabel/config/settings.py:41` default model | auto-downloads from `https://dl.fbaipublicfiles.com/segment_anything/` on first run (`src/lazylabel/models/sam_model.py:101-136`); **PyInstaller build fails while absent** |
| `src/lazylabel/models/mobilenetv3_small_tv.pth` | 10 MB | yes / **no** | `src/lazylabel/ui/workers/reference_finder_worker.py:18` ("Find Archetypes") | auto-downloaded via torchvision; not bundled by the spec; also wrongly appears in the SAM model dropdown because discovery accepts any `*.pth` |
| `src/lazylabel/demo_pictures/scene.npz` | 14 KB | yes / **no** | nothing | the app's own auto-save for `scene.png` |

The legacy worktree contains **no** model weights (gitignored files are not carried by a git worktree). Any characterization run that executes code from `legacy/lazylabel` must point `Paths.models_dir` at `E:\GitHub\LazyLabel\src\lazylabel\models\` or copy the two present files in; the simpler rule is to *read* from `legacy/lazylabel` and *execute* in the live checkout, which is what the 3b smoke test did.

Black boxes for `/modernize-map`: the SAM 1 / SAM 2.1 weights and the `sam2` package (git-sourced, Hydra-configured). Everything else is readable Python.

**Generated files**: `src/lazylabel/_version.py` is tracked but stale (1.6.17 vs 2.0.8) and only rewritten by the Windows build script; runtime falls back to `importlib.metadata`. `build_system/windows/version_info.txt` is generated and gitignored. `src/lazylabel_gui.egg-info/` is the editable-install metadata.

**Dead production code** found on the way (do not port): `FileManager.save_npz` and `FileManager.save_bb_txt` (`src/lazylabel/core/file_manager.py:20-123`) have no callers outside tests; all real writes go through `exporters.export_all`. `tests/data/` is an empty placeholder no test uses.

**External endpoints at runtime**: SAM 1 checkpoint download (`dl.fbaipublicfiles.com`) and the torchvision MobileNet weight fetch. No telemetry, no update check, no auth.

---

## Check 5 — Optional context

- **Production telemetry**: none. No observability/APM MCP server is connected to this session, and the application has no telemetry or crash reporting. The only runtime trace is the local INFO log at `C:/Users/Deniz/.lazylabel/logs/lazylabel.log` (723 KB, no rotation). Decision (human): read that log as a crude feature-usage signal? **Default if unanswered when `/modernize-assess lazylabel` runs: NO** — Step 4 is skipped and `ASSESSMENT.md`'s runtime section says "no telemetry available". Record the answer in `analysis/lazylabel/ASSESSMENT.md`.
- **Version-control history**: rich and usable for risk ranking. 282 commits over ≈13.5 months (2025-06-13 → 2026-07-25; 105 in the last 12 months), 4 author identities that are all the same person, 42 release tags from `v1.3.8` to `v2.0.8` (every release is tagged, so per-release diffs are available), CHANGELOG maintained. Highest-churn source files (commits touching them): `src/lazylabel/ui/main_window.py` 79, `src/lazylabel/main.py` 37, `src/lazylabel/ui/control_panel.py` 26, `src/lazylabel/ui/widgets/sequence_widget.py` 15, `src/lazylabel/ui/managers/propagation_manager.py` 14, `src/lazylabel/models/sam2_model.py` 14.

```bash
cd E:/GitHub/LazyLabel
git rev-list --count main                                          # 282
git rev-list --count --since="12 months ago" main                  # 105
git log main --reverse --format=%as | head -1; git log main -1 --format=%as   # 2025-06-13 / 2026-07-25
git tag | wc -l                                                    # 42
git rev-list --count main -- src/lazylabel/ui/main_window.py      # 79 — repeat with each path for the churn list
```

---

## Verdict per command

| Command | Verdict | Why / what to do first |
|---|---|---|
| `/modernize-assess lazylabel` | **Ready** | Tools installed and on PATH (verified 2026-09-14: `which scc cloc glow delta lizard` prints five paths). Checks 1 and 4 are green. Output: `analysis/lazylabel/ASSESSMENT.md`, `ARCHITECTURE.mmd`. |
| `/modernize-map lazylabel` | **Ready** | Check 2 gap is `glow` only for this command (markdown renders as plain text — cosmetic, no metric degrades); `scc`/`cloc`/`lizard` are not used by it, so the spec's "green-ish" bar is met. Entry point, data formats, persisted state, and black boxes are enumerated above; 0 missing includes. Remember the undeclared `sam2`/`hydra`/`omegaconf`/`pillow` imports when reading the manifest. Output: `analysis/lazylabel/topology.json`, `TOPOLOGY.html`, `call-graph.mmd`, `data-lineage.mmd`, `critical-path.mmd`. |
| `/modernize-extract-rules lazylabel` | **Ready** | Same Check 2 reasoning as map. Domain logic concentrates in `src/lazylabel/core/` (exporters, file_manager load rules, segment_manager, undo_redo_manager) — 976 passing tests are the oracle. Output: `analysis/lazylabel/BUSINESS_RULES.md`, `DATA_OBJECTS.md`. |
| `/modernize-brief lazylabel` | **Ready** once these three files exist: `analysis/lazylabel/ASSESSMENT.md`, `analysis/lazylabel/topology.json`, `analysis/lazylabel/BUSINESS_RULES.md` (check: `ls E:/GitHub/LazyLabel/analysis/lazylabel/ASSESSMENT.md E:/GitHub/LazyLabel/analysis/lazylabel/topology.json E:/GitHub/LazyLabel/analysis/lazylabel/BUSINESS_RULES.md`). Output: `analysis/lazylabel/MODERNIZATION_BRIEF.md`. | Must contain, as separate line items: (1) `PyPI package lazylabel-gui` — the Check 0 open item, one of the three Check 6 options; (2) SAM / SAM 2.1 inference architecture (ONNX in browser/Node vs retained Python service) (Check 3b target); (3) how the pickled `class_aliases` in NPZ files is handled by a JS reader (Check 4); (4) transform vs reimagine choice — `main_window.py` is a 7,446-line god object, which argues for reimagine of the UI layer with transform of `core/`; (5) `Legacy hygiene (ruff *.md exclude on main)` — port the 3b fix to `main` or not (default: not). |
| `/modernize-transform lazylabel` | **Ready** | Both toolchains green → dual execution for equivalence is possible (Python legacy vs web target on the same images, comparing sidecar files). Execute Python from the live checkout, not from `legacy/lazylabel` (no model weights there). |
| `/modernize-reimagine lazylabel` | **Ready** | Target toolchain proven; the scaffolder must use the react-ts + Vitest recipe in Check 3b verbatim. |
| `/modernize-harden lazylabel` | **Ready-with-gaps** | No SAST installed; the three `uvx bandit` / `uvx pip-audit` / `npm audit` commands in Check 2 work without installation. |
| `/modernize-uplift lazylabel` | **Not-ready** | Criterion cannot be met: the passed target (React/TypeScript/Node 22) is a different stack, not a version of Python/PyQt6, so there is no same-stack target version for Check 3 to be green for, and no migration tool exists (signal (b)). Do not run it; use `/modernize-transform` or `/modernize-reimagine` per the brief. Signals (a)–(c) are recorded in Check 3b. |

---

## Reproducing this preflight

```bash
# Run as ONE Bash call (working directory is not kept between calls).
cd E:/GitHub/LazyLabel
git branch --show-current                                   # must print: main-web
git worktree list | grep -q 'legacy/lazylabel' || git worktree add --detach legacy/lazylabel 2a7d5d8
uv pip install --python E:/venv/lazylabel/Scripts/python.exe -e ".[dev]"
E:/venv/lazylabel/Scripts/python.exe -m ruff check .        # expect: All checks passed!
E:/venv/lazylabel/Scripts/python.exe -m ruff format --check .   # expect: exit 0, "176 files already formatted"
QT_QPA_PLATFORM=offscreen E:/venv/lazylabel/Scripts/python.exe -m pytest --co -q -p no:cacheprovider | tail -1   # expect: 976 tests collected
QT_QPA_PLATFORM=offscreen E:/venv/lazylabel/Scripts/python.exe -m pytest -q -p no:cacheprovider                  # expect: 976 passed, about 30 s
uvx lizard -l python src/lazylabel | tail -4                # expect: 24204 NLOC, 1751 functions
node -v && npm -v && npm view vite version                  # expect: v22.17.0, 11.4.2, 8.x
```

---

## The single most important fix

Nothing is red and no fix is outstanding: the Check 2 tools were installed and verified on PATH on 2026-09-14. `/code-modernization:modernize-assess lazylabel` ran on 2026-09-15 and wrote `analysis/lazylabel/ASSESSMENT.md`; its Section 10 lists the next commands.

Not blocking, tracked elsewhere: the open Check 0 item (fate of the PyPI package — decided in `/modernize-brief`) and the optional port of the ruff `*.md` exclude to `main` (brief line item, default: leave `main` untouched).
