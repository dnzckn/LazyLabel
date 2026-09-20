# Progress

Where the conversion stands, on branch `main-web`. `MODERNIZATION_BRIEF.md` is the plan and does
not change as work lands; this file is the log against it, and is the one to read first.

Last updated: 2026-09-19.

## Short answer

**The app cannot be launched on the web yet.** Phases 1–4 have met their exit criteria and
Phase 5 has started,
Phases 5 and 6 have not started. The pieces that exist are proven against legacy; what is missing
is most of the user interface and the whole cutover.

By the brief's own weighting of the six phases: **about 45% of the conversion is done** — 6.0,
5.5, 5.8, most of 29.4, and the beginning of 27.4.

Phase 4 has met all four of its exit criteria, but calling it finished would overstate things: its
left and right panels exist as frames and the tools that fill them are Phase 5's by the brief's own
split. What is genuinely done is everything those tools will stand on — the store, the save
semantics, the layout, the undo stack.

The remaining 53% is Phases 5 and 6, and it is the part a user actually sees.

| Phase | Share | State |
|---|---|---|
| P1 — format library | 6.0% | **complete** |
| P2 — architecture and scaffolds | 5.5% | **complete** |
| P3 — inference service | 5.8% | **complete** |
| P4 — workspace, dataset browser, persistence | 29.4% | **exit criteria met**; tool-hosting panels wait on P5 |
| P5 — tools | 27.4% | entry criteria met; pilot slice under way |
| P6 — sequence and cutover | 25.9% | not started |

## What is done, and what proves it

Nothing below is claimed on the strength of the code reading correctly. Each line names the test
that holds it.

### Phase 1 — annotation formats (complete)

All seven export formats plus the NPZ reader/writer, byte-identical to legacy after EOL
normalization (decision 10). 1,971 tests in `modernized/lazylabel/core/exporters`, including golden
files stored verbatim with their CRLF line endings, and Python-parity tests for float repr, JSON
formatting and rounding — the three places a JavaScript port silently differs.

No pickle anywhere in the read path (SEC-01). Pickled alias tables are refused and *reported* as
unreadable rather than treated as absent, so a dataset does not quietly lose its class names.

### Phase 2 — architecture and scaffolds (complete)

All four exit criteria met. API, web app and inference service scaffolded, with the wire contract
shared rather than duplicated. Settings schema shared between API and web (37 tests).

Storage settled as **local-first behind two ports** (decision 5, owner-confirmed): a blob port
defaulting to a mounted directory, and a metadata port defaulting to SQLite. A hosted deployment
can point them at S3 and PostgreSQL instead. Annotation sidecars remain the source of truth on
every adapter, so a dataset stays readable by the desktop app and by hand.

### Phase 3 — inference service (complete: all four exit criteria)

1. **Masks match legacy.** Both families, against the real weights, with both models loaded at
   once — `test_differential_sam1.py` (9 cases vs legacy `SamModel`) and `test_differential_sam2.py`
   (vs `Sam2Model`). Agreement is exact; decision 10's IoU ≥ 0.98 is headroom.
2. **Propagation matches legacy** frame for frame, and flags *the same frames* at the 0.99
   threshold — `test_differential_propagation.py`.
3. **Checkpoints load only through the manifest**, hash-checked and weights-only (SEC-03, SEC-05,
   SEC-17). Nothing downloads a model at runtime, including the Find Archetypes embedder, which
   legacy fetched from torchvision on first use.
4. **Failures are typed errors, never success** — the pattern `ASSESSMENT.md` 5.4 records, where
   legacy returns `None` for "the model raised", "no points were given" and "the object has no
   pixels" alike.

Find Archetypes is complete: MobileNetV3-small embedding, HDBSCAN clustering, medoid selection, and
the allocation arithmetic RULE-022 specifies to the frame.

255 tests. The live suites skip without a checkpoint, so **a green CI run is not evidence they
ran** — see "Running the live suites" below.

### Phase 4 — workspace (in progress)

Done: the four exit criteria, the dataset-browser pilot, the canvas in legacy's class colours, the
explicit save path (a cleared image writes an empty file rather than nothing — decision 7), the
image pipeline proven pixel-for-pixel against OpenCV, dataset conversion byte-identical to legacy
on every golden, the alias converter, the undo stack with its two recorded defects designed out,
the save decision logic (`workspace/saveState.ts`), the notification system, the status bar, the
theme, and the three-pane workspace layout.

Three of those are worth naming because they are where legacy loses work:

- **`saveState.ts`** decides whether navigating away saves, asks or proceeds. An empty image writes
  empty files rather than having its annotations deleted; an image whose annotations could not be
  READ is never written back over them; closing asks and names what would be lost.
- **Notifications** separate severity from tone. Legacy announces deleting every annotation file
  for an image — no prompt, no undo — as a neutral notice on a five-second timer, identical in
  appearance to "Saved". Here anything irreversible or failed stays until dismissed.
- **The status bar** shows continuous state only. Legacy's is *also* its notification system, which
  is exactly why the destructive message expires; splitting them is what makes that impossible.
  It also reports the inference server's accelerator, which the browser cannot discover for itself.

Not done:

All four exit criteria are met:

1. Persona flow 4 passes an end-to-end browser test, and the exported files are byte-identical to
   legacy's on every golden.
2. Saving follows decision 7 — nothing is deleted without an explicit user action, and a damaged or
   foreign file never hides or deletes a valid one.
3. Legacy `settings.json` and `hotkeys.json` import correctly.
4. Upload limits and content allow-lists are enforced. SEC-02, SEC-06 and SEC-09 were already
   proven; SEC-07 was argued in a comment and tested nowhere until this session.

**Pop-out panels are deliberately not built.** Legacy detaches its left and right panels into
separate windows (`panel_popout_manager.py`). Four reasons for leaving it out rather than porting
it, recorded here so nobody re-opens it as an oversight:

- No business rule covers it. It does not appear anywhere in `BUSINESS_RULES.md`, so there is no
  extracted behaviour to preserve and no priority attached to it.
- Everything it would detach — the drawing tools, the segment table, the class table — is Phase 5.
  Popping out an empty panel is not a feature.
- It solves a problem Qt has and the browser does not. Legacy's panels are docked in a fixed
  window; a browser window is already resizable and the layout reflows, and a second view is a
  second tab.
- Doing it properly means sharing the workspace store across windows. That is real machinery, and
  it should be designed once the panels have contents worth detaching — not before.

If it is wanted later, the place it attaches is the `Panel` component's header, and the state it
needs is already in one store rather than scattered across managers.

## What remains

1. **Phase 5 — tools** (27.4%). The largest single block of user-facing behaviour. Its three entry
   criteria are met: Phases 3 and 4 exited, decision 9 is ticked, and all 37 P5 rules are answered
   (29 needed no decision, 5 were settled earlier, 3 were answered this session).

   Built so far, all pure logic with tests:
   - **The polygon tool** (`tools/polygon.ts`), Phase 5's pilot slice. RULE-047's close rule,
     including a differential against legacy's own expression over 5,290 click offsets — the part
     a rule card cannot pin, since `<=` instead of `<` is right at the card's example and wrong on
     a ring around it.
   - **Click-to-image coordinates** (`canvas/coordinates.ts`). Fractional, because rounding at
     click time changes the exported polygon and breaks the join threshold; a click outside the
     image is reported rather than clamped onto an edge the user did not click.
   - **Editable annotations in the store**, which is what makes `dirty` real. Every piece of the
     save semantics built in Phase 4 depended on a flag that until now nothing could set.

   - **The drawing layer** (`canvas/PolygonLayer.tsx`) and the tool picker, so the pilot works as a
     user performs it: choose the tool, click, close by the threshold or Space, undo, and the
     polygon lands in the store with the right class and marks the image unsaved.

   The pilot is complete except vertex editing (RULE-046). Still to build: box, circle, selection,
   erase and merge, the AI click and box tools, and the image adjustments.
2. **Phase 6 — sequence and cutover** (25.9%). The timeline, propagation review, the split view,
   the hosted deployment and the actual switch-over.

## Running the live suites

The differential and live suites are the strongest evidence in the project and they **skip
themselves when no checkpoint is configured**. CI has no checkpoints, so CI passing says nothing
about them. Run them locally, deliberately:

```bash
cd modernized/lazylabel-reimagined/inference && LAZYLABEL_TEST_SAM1_CHECKPOINT=/path/to/sam_vit_h_4b8939.pth LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt LAZYLABEL_TEST_EMBEDDER=/path/to/mobilenetv3_small_tv.pth PYTHONPATH=/path/to/legacy/lazylabel/src python -m pytest tests/ -q
```

With all three set, the expected result is **255 passed, 1 xfailed, 0 skipped**. Any `skipped`
count above zero means a checkpoint was not found and that suite did not actually run.

`MODEL_MANIFEST.md` lists the checkpoints and their verified hashes.

## Standing constraints

These hold for every session and are not re-litigated per task:

- `legacy/lazylabel` is a **read-only worktree** pinned at `2a7d5d8`. Never edit it, never `cd` into
  it; use `git -C` and absolute paths. Legacy's own model directory is inside it, which is why the
  differentials pass `custom_model_path` rather than letting legacy resolve its default — the
  default would download a 2.4 GB checkpoint into the worktree.
- Credential values never appear in committed artifacts.
- The converter is the only component permitted to load pickle, through a strict name allow-list of
  six numpy symbols.
- Nothing downloads a model at runtime.
