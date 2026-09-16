# MODERNIZATION BRIEF: `lazylabel` to a web-hosted React/TypeScript and Node.js application

| | |
|---|---|
| System | LazyLabel 2.0.8, a PyQt6 desktop app (`legacy/lazylabel` at 2a7d5d8), becoming LazyLabel web |
| Target stack | `react/node.js`: React 19 + TypeScript web app, Node.js 22 API, plus the inference and storage choices in §7 |
| Status | **DRAFT, not approved.** No phase in §3 may start until §8 is filled in. |
| Branch | `main-web` |
| Built from | {{INPUTS}} |
| How to steer | Edit this file. `/code-modernization:modernize-transform` and `/code-modernization:modernize-reimagine` read §3's scope, entry criteria and exit criteria as binding gates. An edited criterion is honored; a note in chat is not. |
| Commands | In this app every plugin command needs the `code-modernization:` prefix |

---

## 1. Objective

LazyLabel today is a single-maintainer Python 3.10 / PyQt6 desktop tool for SAM-assisted image and image-sequence annotation, shipped through PyPI and a Windows build: 110 modules and 24.2K code lines, two-thirds of them PyQt6 interface code around one 7,446-line window. The goal, in the owner's words, is to "convert from pyqwt6 into react/node.js framework so that the full app can be webhosted eventually" (`PREFLIGHT.md`, Check 0). This plan rebuilds it as a browser app with a Node.js API, keeping the seven annotation file formats and the four persona workflows as the contract. Now is the time because the interpreter is ageing out (CPython 3.10 support ends October 2026 and the bundled expat and OpenSSL cannot be patched), and because hosting turns today's desktop-grade file-parsing flaws, such as code execution from an `.npz` annotation file, into critical server risks that must be designed out rather than ported.

---

## 2. Target Architecture

```mermaid
{{C4}}
```

Binding design rules, each traced to a finding:
- **One format library.** The seven annotation formats, their load priority and their input limits live in one TypeScript package used by both the web app and the API. Today the suffix-to-format mapping is written out four times (`ASSESSMENT.md` 5.10; `topology.json` observations).
- **No pickle, anywhere.** Class aliases in NPZ files use the encoding chosen in decision 4. Existing pickled files enter only through an offline converter (SEC-01, `ASSESSMENT.md` 5.3).
- **Explicit saves.** Annotation files are deleted only on explicit user intent, and a load failure never looks like "no annotations" (`ASSESSMENT.md` 5.1, SEC-04).
- **Pinned models.** Checkpoints load from a manifest with SHA-256 checks and no runtime downloads (SEC-03, SEC-05, SEC-17, `ASSESSMENT.md` 5.7).
- **Hostile uploads by default.** Pixel, object, class and array-shape caps apply, image decoders are restricted by content, and XML parsing rejects DTDs (SEC-02, SEC-06, SEC-07, SEC-09).
- **Behavior comes from §5, not the old docs.** `ARCHITECTURE.md` and `USAGE_MANUAL.md` contradict the code in 44 places (`ASSESSMENT.md` Appendix A).

| Legacy component (domain, key modules) | Target component | Phase |
|---|---|---|
| annotation_io: `core/exporters/*`, `core/file_manager.py` (seven formats, load chain) | Annotation format library; API import and export jobs | P1, P4 |
| annotation_model: `core/segment_manager.py` (segments, classes, one-hot mask tensor) | Format library domain model; web app annotation store | P1, P5 |
| annotation_model: `core/undo_redo_manager.py` | Web app undo and redo stack in the workspace store | P4, P5 |
| annotation_io: `ui/managers/save_export_manager.py`, `ui/workers/save_worker.py`, `ui/widgets/export_format_widget.py` | API save and export endpoints; web app export settings | P4 |
| ai_segmentation core: `models/sam_model.py`, `models/sam2_model.py`, `core/model_manager.py`, `ui/managers/embedding_cache_manager.py`, `ui/workers/reference_finder_worker.py` | Inference service: image prompts, propagation jobs, archetypes, model manifest | P3 |
| ai_segmentation interface: `ui/managers/ai_segment_manager.py`, `sam_single_view_manager.py`, `sam_worker_manager.py`, AI workers and widgets | Web app AI tools; API inference proxy | P5 |
| app_shell: `ui/main_window.py` (single-view part), `control_panel.py`, `right_panel.py`, `status_bar.py`, theme, notifications | Web app shell, panels, routing, workspace store | P4 |
| file_navigation: `utils/fast_file_manager.py`, `ui/managers/file_navigation_manager.py`, discovery and preload workers | Web app dataset browser; API image listing, upload, thumbnails | P4 |
| canvas_editing: `ui/photo_viewer.py`, graphics items, mouse and keyboard handlers, polygon, edit and mode managers, segment display and table | Web app canvas editor and drawing tools | P5 |
| image_processing: adjustments, channel and FFT thresholds, rescale, crop | Web app image pipeline; API applies crop on export | P5 |
| sequence_timeline: `ui/modes/sequence_view_mode.py`, `ui/widgets/sequence_widget.py`, `timeline_widget.py`, plus `ui/managers/propagation_manager.py`, `ui/workers/propagation_worker.py` and MainWindow's sequence methods | Web app timeline; API sequence endpoints; inference propagation jobs | P6 |
| Multi-view: MainWindow's multi-view methods, `sam_multi_view_manager.py`, `multi_view_coordinator.py`, `ui_layout_manager.py` | Per decision 8: web split view, redesign, or dropped | P6 |
| settings_prefs: `config/settings.py`, `config/hotkeys.py`, `config/paths.py`, settings and hotkey dialogs | Versioned per-user settings in the API; web settings and hotkey editor | P2, P4 |
| runtime_platform: `main.py`, logger, PyInstaller and NSIS packaging, CI | Container images, CI/CD, structured logging | P2 |
| Data: seven annotation files beside each image | Segments in the database; export files in object storage; import of existing files | P1, P4 |
| Data: `settings.json`, `hotkeys.json` | Per-user settings rows; one-time import | P4 |
| Data: `models/` checkpoints, SAM 2 frame staging, theme icon cache, `lazylabel.log` | Manifest-pinned model artifacts; job-scoped staging; static web assets; central logs | P3, P6, P2 |
| Launchers: `lazylabel-gui` console script, `python -m lazylabel`, `LazyLabel.exe` | Web deployment; the PyPI package handled per decision 1 | P6 |

---

## 3. Phased Sequence

This is a cross-stack rebuild, so the order is **strangler-fig**: the lowest-risk, least-dependent piece first (the format library, which needs no architecture decision), then the architecture, then capabilities in the order the persona flows need them.

**Phase 1 is a pilot, and this brief is a hypothesis.** Every phase names one representative slice to take all the way through before the rest. What a pilot surfaces, such as a format detail the analysis missed, a prerequisite that reorders phases, or an environment fact nobody wrote down, is expected to revise this brief. Regenerating the brief after a pilot is the normal path, not a correction. Legacy systems hide their surprises in the build and the runtime, and no amount of reading substitutes for one unit taken all the way through.

```mermaid
{{PHASES_MMD}}
```

**Relative scale.** Sizes rank phases against each other by their share of LazyLabel's production code: 18,428 statements, COCOMO-II relative index 97.9 (`ASSESSMENT.md` Section 8). MainWindow's statements are split by method feature: 1,634 shell, 1,117 sequence, 1,109 multi-view. **These are not durations.** This plan makes no person-month, week, date or delivery estimate, because agentic transformation does not follow the human-team productivity curves those units assume.

{{SIZE_TABLE}}

### Phase 1: Annotation format library (pilot phase)

- **Command:** `/code-modernization:modernize-transform lazylabel core/exporters "TypeScript library on Node.js 22"`
- **Scope:** `src/lazylabel/core/exporters/` (8 modules), the live readers and load chain in `src/lazylabel/core/file_manager.py` (not the dead `save_npz` and `save_bb_txt`), and the mask-tensor, contour and class-alias logic in `src/lazylabel/core/segment_manager.py`. Target: a TypeScript package with its own tests, later embedded in the web app and the API.
- **Pilot slice:** YOLO Segmentation, both writer (`core/exporters/yolo_segmentation.py`) and reader (`FileManager.load_yolo_seg_txt`), taken end to end before any other format.
- **Entry criteria:**
  1. §8 is filled in, covering "Phase 1 only" or "Full plan".
  2. §7 decision 4 (NPZ class-alias encoding) is ticked, with the chosen encoding written beside it.
  3. §7 decision 10 (equivalence tolerances) is ticked.
  4. §7 decision 14 (P0 scope) is ticked, and every rule it restores to P0 is marked P0 in `analysis/lazylabel/BUSINESS_RULES.md`.
  5. Every §5 rule assigned to P1 has Confidence High or an answered SME question in `analysis/lazylabel/BUSINESS_RULES.md`.
  6. `node -v` prints v22 and the Vitest recipe in `PREFLIGHT.md` Check 3b passes.
- **Exit criteria:**
  1. Pilot: for every fixture, the TypeScript writer's `_seg.txt` is byte-identical to the legacy exporter's, and the TypeScript reader returns the same segments (class ids, pixel masks) as `FileManager.load_yolo_seg_txt`.
  2. All seven formats pass differential tests against the legacy Python code on generated masks: text, JSON and XML outputs are byte-identical, and NPZ members are array-identical except for the alias encoding set by decision 4.
  3. The load-priority chain and legacy fallbacks match legacy on the fixture corpus, including damaged-file cases; any intentional change is recorded under decision 7.
  4. Every §5 rule assigned to P1 has a passing test.
  5. No code path deserializes pickle, and input limits are enforced.
- **Relative scale:** S.
- **Risk:** Medium.
  1. Contour tracing and polygon simplification differ from OpenCV, so exported polygons drift. *Mitigation:* port the exact algorithms (or use an OpenCV build with the same version), and run differential tests on randomized masks.
  2. JavaScript cannot read the pickled class aliases in existing NPZ files. *Mitigation:* decision 4, plus an offline Python converter tested on real legacy files.

### Phase 2: Target architecture and service scaffold

- **Command:** `/code-modernization:modernize-reimagine lazylabel web-hosted LazyLabel with a React/TypeScript web app, a Node.js API, the Phase 1 annotation format library, and a SAM inference service`
- **Scope:** Run the reimagine specification and architecture phases with both human checkpoints. Scaffold the web app, API and inference service with acceptance tests generated from §5. Cover bootstrap, logging, configuration and a versioned settings and hotkey schema, replacing the runtime_platform and settings_prefs domains. **Capability scope is today's behavior:** new AI-native features are out of scope for this plan and are refused at reimagine's first checkpoint.
- **Pilot slice:** the API service scaffold first, with one acceptance test from §5 wired to the Phase 1 library, before the web app and inference scaffolds.
- **Entry criteria:**
  1. Phase 1's exit criteria are met and recorded in its transformation notes.
  2. §7 decisions 1 (PyPI package), 2 (inference hosting), 3 (hosting and tenancy), 5 (storage) and 6 (class scope) are ticked.
  3. §7 decision 12 (agent budget) is ticked. Reimagine fans out many agents.
- **Exit criteria:**
  1. Both reimagine human checkpoints are approved, and `REIMAGINED_ARCHITECTURE.md` matches §2, or this brief has been regenerated to match it.
  2. Each scaffold builds and its test command runs. Acceptance tests for capabilities not built yet fail and are tagged with the phase that builds them.
  3. The settings schema imports a legacy `settings.json` and `hotkeys.json` in a test, tolerating unknown keys (`ASSESSMENT.md` 5.8).
  4. CI builds and tests all services on every push to `main-web`.
- **Relative scale:** S.
- **Risk:** Medium.
  1. The architecture over-reaches beyond a conversion. *Mitigation:* capability scope limited at checkpoint 1, plus the architecture-critic review.
  2. Reimagine re-mines specifications that `BUSINESS_RULES.md` already holds, costing tokens and creating conflicting specs. *Mitigation:* point its specification phase at `BUSINESS_RULES.md` and `DATA_OBJECTS.md`, under decision 12.

### Phase 3: Inference service

- **Command:** `/code-modernization:modernize-transform lazylabel models "inference service per §7 decision 2, inside the Phase 2 scaffold"`
- **Scope:** `models/sam_model.py`, `models/sam2_model.py`, `models/__init__.py`, `core/model_manager.py`, `ai_availability.py`, `ui/managers/embedding_cache_manager.py`, and `ui/workers/reference_finder_worker.py` (Find Archetypes).
- **Pilot slice:** SAM 1 click-to-mask with one checkpoint, taken end to end before SAM 2.1 prompts and propagation jobs.
- **Entry criteria:**
  1. Phase 2's exit criteria are met.
  2. §7 decision 2 is ticked.
  3. `analysis/lazylabel/MODEL_MANIFEST.md` lists every supported checkpoint with family, variant, config, source and SHA-256.
  4. The test machine has the accelerator that decision 2 requires (the CUDA check prints True), or decision 2 records CPU-only acceptance.
  5. Every §5 rule assigned to P3 is answered.
- **Exit criteria:**
  1. On recorded golden prompts, the service's masks match legacy `SamModel` and `Sam2Model` output for the same image and checkpoint within the IoU tolerance set by decision 10.
  2. SAM 2 propagation on the recorded sample sequence meets the per-frame tolerance, and the same frames are flagged at the 0.99 confidence threshold.
  3. Checkpoints load only through the manifest, with hash checks and weights-only loading (closes SEC-03, SEC-05 and SEC-17).
  4. Failures surface as typed errors, never as success (`ASSESSMENT.md` 5.4), and API-to-inference contract tests pass.
- **Relative scale:** S.
- **Risk:** High.
  1. Interactive click latency and GPU cost once hosted. *Mitigation:* a per-image embedding cache in the service, with an in-browser ONNX decoder as the decision 2 fallback.
  2. GPU nondeterminism defeats exact equivalence. *Mitigation:* IoU tolerances approved in decision 10, with CPU reference runs for golden data.

### Phase 4: Workspace shell, dataset browser and persistence

- **Command:** `/code-modernization:modernize-transform lazylabel <slice> "React/TypeScript web app and Node.js API (Phase 2 scaffold)"`, run once per slice in this order: `file_navigation` (pilot), `app_shell`, `annotation_io` save and export, settings UI.
- **Scope:** MainWindow's single-view shell; `control_panel.py`, `right_panel.py`, `status_bar.py`, theme, notifications, pop-outs; the file_navigation domain; `save_export_manager.py`, `export_format_widget.py`; the workspace store including undo and redo (`core/undo_redo_manager.py`).
- **Pilot slice:** the dataset browser. Import a folder of images with existing annotation files, list them with per-format status, and open one with its annotations loaded through the Phase 1 library.
- **Entry criteria:**
  1. Phase 2's exit criteria are met.
  2. §7 decisions 5 (storage), 6 (class scope) and 7 (save semantics) are ticked.
  3. The live image-load path (`FileNavigationManager.load_image_by_path`) has characterization tests in the legacy suite, because today's tests cover an unreachable loader (`ASSESSMENT.md` 5.5).
  4. Every §5 rule assigned to P4 is answered.
- **Exit criteria:**
  1. Persona flow 4 ("Convert existing labels") passes an end-to-end browser test, and its exported files are byte-identical to legacy exports on the fixture datasets.
  2. Saving follows decision 7: no annotation file is deleted without explicit user action, and a damaged or foreign file never hides or deletes a valid one (closes `ASSESSMENT.md` 5.1 and SEC-04).
  3. Legacy `settings.json` and `hotkeys.json` import correctly.
  4. Upload limits and content allow-lists are enforced (SEC-02, SEC-06, SEC-07, SEC-09).
- **Relative scale:** L.
- **Risk:** High.
  1. Moving from files beside images to a database and object storage breaks round-trips users rely on. *Mitigation:* annotation files stay the interchange format, backed by differential export tests.
  2. Large 16-bit TIFF images strain the browser. *Mitigation:* server-side thumbnails and tiling, with a size cap under decision 3.

### Phase 5: Annotation tools, AI tools and image tools

- **Command:** `/code-modernization:modernize-transform lazylabel <slice> "React/TypeScript web app (Phase 2 scaffold)"`, run once per slice in this order: `canvas_editing` (pilot: polygon tool), box, circle, selection, merge and erase, AI click and box tools, `image_processing`.
- **Scope:** the canvas_editing domain except the multi-view modules; the AI tool interface (`ai_segment_manager.py`, `sam_single_view_manager.py`, `sam_worker_manager.py`, `sam_preload_scheduler.py`, `coordinate_transformer.py`, `model_selection_widget.py`, `fragment_threshold_widget.py`, `sam_update_worker.py`, `single_view_sam_init_worker.py`); the image_processing domain.
- **Pilot slice:** the polygon tool. Draw it, close it by the join threshold or Space, edit vertices, undo, and save.
- **Entry criteria:**
  1. Phase 3 and Phase 4 exit criteria are met.
  2. §7 decision 9 (SME questions on legacy behavior) is ticked.
  3. Every §5 rule assigned to P5 is answered.
- **Exit criteria:**
  1. Persona flows 1 and 3 pass end-to-end browser tests.
  2. Editing rules (join threshold, vertex limits, erase and merge semantics, class assignment, undo of erase) pass tests ported from legacy characterization.
  3. Accepted AI masks match legacy after fragment filtering on golden prompts.
  4. Display adjustments and thresholds match legacy on golden images within the decision 10 pixel tolerance, and crop changes exports exactly as in legacy.
- **Relative scale:** L.
- **Risk:** High.
  1. Canvas performance and hit-testing on dense polygons and large masks. *Mitigation:* WebGL rendering, a spatial index, and performance budgets in the exit tests.
  2. Rules hidden in MainWindow callbacks get lost (`ASSESSMENT.md` 5.2). *Mitigation:* port characterization tests for each rule before building its interface.

### Phase 6: Sequence propagation, multi-view decision and cutover

- **Command:** `/code-modernization:modernize-transform lazylabel <slice> "React/TypeScript web app, Node.js API and inference jobs"`, run once per slice: `sequence_timeline` (pilot), propagation, multi-view per decision 8. The cutover tasks are listed in the exit criteria.
- **Scope:** the sequence_timeline domain; `propagation_manager.py`, `propagation_worker.py`, `confidence_histogram_dialog.py`; MainWindow's sequence and multi-view methods; the multi-view modules; migration of existing datasets; the PyPI and desktop decision.
- **Pilot slice:** build a timeline from a file range and mark references from existing annotations, without propagation, before the propagation jobs.
- **Entry criteria:**
  1. Phase 3 and Phase 5 exit criteria are met.
  2. §7 decisions 1 and 8 are ticked.
  3. At least one recorded image sequence has legacy propagation outputs saved as golden data.
  4. Every §5 rule assigned to P6 is answered.
- **Exit criteria:**
  1. Persona flow 2 passes an end-to-end browser test.
  2. Flagged frames, Keep Flagged Masks, Skip Labeled and Save All outputs match the legacy golden outputs within tolerance.
  3. Multi-view is delivered, redesigned or removed per decision 8.
  4. Every dataset in the acceptance corpus imports and re-exports identically, pickled NPZ files included, via the converter.
  5. The PyPI package and desktop app are handled per decision 1, and the legacy app stays available until this criterion is met.
- **Relative scale:** L.
- **Risk:** High.
  1. Long GPU jobs in a hosted setting (queueing, cancellation, cost). *Mitigation:* a job API with real cancellation (not `QThread.terminate()`) and streaming-window limits.
  2. Users lose work in migration through pickled aliases or per-image class ids. *Mitigation:* an offline converter, a dry-run import report, and the legacy app kept until exit.

---

## 4. Business Walkthroughs

These are the four persona flows from `analysis/lazylabel/topology.json`. Each step's source was checked against the code when the map was built.

{{WALKTHROUGHS}}

---

## 5. Behavior Contract

{{P0_SECTION}}

---

## 6. Validation Strategy

Both runtimes work on this machine (`PREFLIGHT.md` Check 3), so dual execution against the legacy Python code is available, and it is the strongest proof wherever outputs are files or masks.

| Phase | Characterization | Contract | Parallel run / differential | Property-based | Manual UAT | Why this mix |
|---|---|---|---|---|---|---|
| P1 | Golden files produced by the legacy exporters | File-format schemas | Yes: legacy Python and TypeScript on the same generated masks, byte and array compare | Yes: write-then-read round trips on random masks and polygons | No | Outputs are deterministic files, so byte-level proof is possible and cheap |
| P2 | No | Yes: OpenAPI contracts between web app, API and inference | No | No | Architecture checkpoints | A scaffold has no behavior to compare yet; the risk is interface drift |
| P3 | Recorded prompts and sequences | Yes: inference API | Yes: legacy models and the service on the same inputs, IoU compare | No | No | Model output is numeric and may be nondeterministic, so tolerance-based diffing is the right proof |
| P4 | Yes: the live load and save path, first in legacy | Yes: API | Yes: import then export versus legacy files | Yes: import limits fuzzed | Yes | Persistence semantics change on purpose (decision 7), so tests must separate intended from accidental differences |
| P5 | Yes: editing rules ported from legacy tests | No | Yes: exports after scripted edits; pixel diffs for image tools | Yes: polygon and mask operations | Yes | Interaction feel needs people; the rules underneath need automated proof |
| P6 | Recorded sequences | Yes: job API | Yes: legacy propagation outputs versus new jobs | No | Yes | Propagation and migration touch users' existing data |

---

## 7. Open Questions

Tick each box and write the answer beside it. Entry criteria in §3 refer to these numbers.

- [ ] **1. PyPI package `lazylabel-gui`** (open since `PREFLIGHT.md` Check 0). Choose (a) the web app replaces it and 2.0.8 is the last release, (b) it coexists, with Python kept for inference and still published, or (c) it is frozen at 2.0.8 with no further releases.
- [ ] **2. Inference hosting.** *Recommended:* a Python/PyTorch service reusing the legacy model code, because SAM 2 video propagation has no browser equivalent; add an in-browser ONNX decoder later only if click latency needs it. Ticking this accepts that the target is "React/Node.js plus a Python inference service", not Node.js alone.
- [ ] **3. Hosting and tenancy.** Single-user self-hosted, small team, or multi-tenant service. This decides auth, upload limits and cost controls.
- [ ] **4. NPZ class-alias encoding.** *Recommended:* a JSON string in a unicode array, plus an offline converter for existing pickled files.
- [ ] **5. Storage model.** *Recommended:* PostgreSQL for projects, segments, classes and settings, and S3-compatible object storage for images and exports. The alternative is a server filesystem that keeps annotation files beside images.
- [ ] **6. Class identity.** Keep legacy per-image class ids and aliases, or introduce a project-wide label map. This changes exported ids (`ASSESSMENT.md` Section 7, gap 3).
- [ ] **7. Save semantics.** *Recommended:* explicit save with dirty tracking, and do not preserve delete-on-empty or the silent losses on close and multi-view navigation (`ASSESSMENT.md` 5.1).
- [ ] **8. Multi-view.** Keep the two-viewer mode, redesign it, or drop it. Today it is half-migrated, with 14 undefined members.
- [ ] **9. Legacy behavior questions** (`ASSESSMENT.md` 5.12): per-image-size crop restore; undoable deletion; .bmp, .gif and .webp support; COCO unsimplified versus YOLO simplified polygons; persisting the propagation confidence threshold.
- [ ] **10. Equivalence tolerances.** Byte-identical for text, JSON and XML exports; array-identical for NPZ; an IoU threshold for SAM masks (for example 0.98); a pixel tolerance for display adjustments.
- [ ] **11. P0 rules below High confidence.** Answer each question listed in §5 before its phase starts.
- [ ] **12. Agent budget.** `/modernize-reimagine` and multi-slice transforms fan out many agents. {{BUDGET_NOTE}} Approve the budget per phase, or run phases one slice at a time.
- [ ] **13. Legacy hygiene.** Port the `pyproject.toml` ruff `*.md` exclude from `main-web` to `main`? *Default:* no.
- [ ] **14. P0 scope.** {{P0_SCOPE_NOTE}}

---

## 8. Approval Block

```
Approved by: ________________  Date: __________
Approval covers: Phase 1 only | Full plan
```
