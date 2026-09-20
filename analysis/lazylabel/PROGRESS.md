# Progress

Where the conversion stands, on branch `main-web`. `MODERNIZATION_BRIEF.md` is the plan and does
not change as work lands; this file is the log against it, and is the one to read first.

Last updated: 2026-09-20.

## Short answer

**The app cannot be launched on the web yet.** Phases 1–5 have met their exit criteria. Phase 6
has not started, and three of its four entry criteria are owner decisions or need the legacy app. The pieces that exist are proven against legacy; what is missing is the
sequence work and the whole cutover.

By the brief's own weighting of the six phases: **about 74% of the conversion is done** — 6.0,
5.5, 5.8, 29.4 and 27.4, all complete. The remaining 25.9% is Phase 6.

Phase 4's panels were frames when it exited, because the tools that fill them are Phase 5's by the
brief's own split. They are filled now: drawing tools, AI tools, adjustments, crop, segments and
classes are all built and reachable.

The remaining 26% is all of Phase 6.

| Phase | Share | State |
|---|---|---|
| P1 — format library | 6.0% | **complete** |
| P2 — architecture and scaffolds | 5.5% | **complete** |
| P3 — inference service | 5.8% | **complete** |
| P4 — workspace, dataset browser, persistence | 29.4% | **complete**; its panels are filled by P5's tools |
| P5 — tools | 27.4% | **complete**; all four exit criteria met |
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

### Phase 4 — workspace (complete)

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
   (29 needed no decision, 5 were settled earlier, 3 were answered in an earlier session).

   Three of its four exit criteria are met; the fourth has one open question for the owner and one
   gap that belongs on the server. Both are set out below the build list.

   Built, each with the tests that hold it:
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

   - **Boxes and circles** (`tools/shapes.ts`, `canvas/ShapeLayer.tsx`), RULE-043. A box is stored
     as a four-corner polygon; a circle as its centre and a 3 o'clock radius point, *not* the point
     the drag was released on — the difference is invisible to any test whose drag is horizontal.

   - **Vertex editing** (`tools/edit.ts`, `canvas/EditLayer.tsx`), RULE-046/069. A circle's two
     vertices are a centre and a radius point, so dragging them means different things. Reachable
     on the state that already means it: no drawing tool active and exactly one annotation
     selected, rather than a mode to enter and forget to leave.
   - **Selection** (`tools/selection.ts`, `canvas/SelectLayer.tsx`). Hit-testing goes through the
     rasterizer, so the shape you can click is the shape that gets saved.
   - **Merge** (`tools/merge.ts`), RULE-019, implementing the answer recorded this session.
   - **Erase** (`tools/erase.ts`), RULE-009 — the only P0 rule among the drawing tools.
   - **The segment list**, where selection, merge and delete are reachable.

   Everything a user does by hand now works: draw a polygon, box or circle, select shapes, edit
   their vertices, merge, delete, and erase with any shape by holding shift.

   - **The AI tools** (C3), end to end: the interaction state machine, the canvas layer, the
     `embed`/`segment` round trip, the fragment filter on accept, and a model picker over the
     manifest — so a checkpoint is chosen by NAME rather than by legacy's file-name substring
     matching, which loads `sam2_hiera_large_tuned.pt` as *tiny*.
   - **The class table** (C7), where the order decides the exported channel order.
   - **Display adjustments** (C8), including legacy's negative-brightness fold, reproduced because
     with Operate On View those pixels are what SAM segments.

   - **Image processing** (`tools/imageProcessing.ts`, `tools/adjustments.ts`, `tools/crop.ts`):
     rescale, channel thresholding, the contrast-stretch and equalization presets, the display
     adjustments, and crop — RULE-018, a P0 rule whose off-by-one means the last row and column of
     an image can never be inside a crop.

   - **The adjustment controls** (`workspace/AdjustmentsPanel.tsx`), in legacy's slider units, and
     the canvas that renders them. The sliders were built first and wrote to settings that nothing
     read back, which made the panel the dead control the rest of this codebase refuses to ship;
     the canvas applies them between the image and the overlay, so the image is adjusted and the
     class colours are not.
   - **The crop panel** (`workspace/CropPanel.tsx`), RULE-018 wired end to end: the store holds it,
     the save request carries it, the server applies it to the same mask tensor the exports are
     built from. It counts the pixels a save will blank before anyone presses it, and clears the
     crop when another image opens (decision 9). Legacy does neither.

   **The four exit criteria.**

   1. **Persona flows 1 and 3 pass end-to-end browser tests — met.**
      `test/acceptance/flow1.aiLabel.test.tsx` and `flow3.traceByHand.test.tsx` walk the steps
      `topology.json` records, through the real components with only the HTTP client stubbed.

      Flow 3 found that **vertex editing was unreachable**: `EditLayer` had been built and
      unit-tested for some time and `OpenImageView` never rendered it, so every test it had drove
      the component directly and nothing noticed that a user had no way in. The rule was
      implemented, the component was correct, its tests passed, and the feature did not exist.
      That is what these tests are for, and it is worth expecting more of the same in Phase 6.

   2. **Editing rules pass tests ported from legacy characterization — met.** The join threshold
      has a differential over 5,290 click offsets; vertex limits, erase, merge and class assignment
      have rule tests; RULE-053's undo-of-erase is in `c6.undoRedo`.

   3. **Accepted AI masks match legacy after fragment filtering — met.** Phase 3 proves the mask
      against the real checkpoints; `test/tools/fragments.differential.test.ts` proves what the
      accept path does to it, against the bytes OpenCV produces.

      The fixture found a mistake **in itself**, which is worth recording. Written from the rule
      card, it concluded that a single-pixel mask survives (minimum area 0, `area >= 0` holds).
      The port disagreed. `save_export_manager.py` settled it: there is an explicit
      `if max_area == 0: return None` above the comparison, so the whole mask is dropped. The port
      was right and the transcription had paraphrased the card's own edge-case line away. Golden
      generators are transcribed line for line for exactly this reason.

   4. **Display adjustments and thresholds match legacy, and crop changes exports exactly as in
      legacy — the crop half is met; the thresholds half has one open question and one gap.**

      The crop half: `api/test/acceptance/cropExports.test.ts` saves through the real handler onto
      a real folder and reads the bytes. Uncropped, a 2x2 object at the corner of a 40x40 image
      writes 0.975; cropped to (0, 0, 39, 39), only 0.95 remains — the off-by-one, measured.

   **Criterion 4's other half: CLAHE now matches OpenCV byte for byte, on all six goldens.**

   This was the one open question and it is no longer a question. It used to differ on 3 of 660
   pixels on the uneven-tile case, each by exactly 1, and the note on the test said the residue had
   to be in how OpenCV's interpolation body formulates its arithmetic rather than in the algorithm.
   That was right. Reading `CLAHE_Interpolation_Body` named three things, all of which have to be
   true at once — which is why the previous session's four attempts each moved the count and none
   could finish:

   1. **It is `float`, not double.** Every operation rounds to single precision; the port now
      rounds each step back with `Math.fround`.
   2. **It multiplies by a reciprocal**, `1.0f / tileWidth` computed once. `x * (1/w)` is not
      `x / w` in floating point.
   3. **The weight comes from the unclamped tile index**, which is clamped only afterwards, so the
      half-tile border uses a real fractional weight rather than 0 or 1.

   The differential allows nothing now, and prints the coordinate of the first differing pixel
   rather than only a count.

   **Rescale and channel thresholding now run on the server, and have controls — closed.**

   This was recorded as a UI gap and was not one. RULE-032 fixes the order as rescale → channel
   threshold → FFT → 16-bit to 8-bit → display adjustments, and the browser only ever receives the
   output of the fourth step: the API decodes every image to 8-bit RGB before sending it. A
   rescale applied client-side would quantise a 16-bit image to 256 levels and then stretch those,
   which is worst on exactly the images a rescale exists for — a scan whose data sits between
   3,000 and 5,000 gets 65,536 levels on the server and 8 in the browser.

   The symptom was visible the whole time and looked like nothing: four modules of correct,
   well-tested code that nothing imported, because there was no correct place to call them from.

   What changed:

   - `imageProcessing`, `fft`, `dft` and `clahe` moved to `api/src/images/` with their tests and
     golden fixtures. `decodeImage` takes an optional processing argument and applies it to the
     wide samples **before** `to8Bit`; `/pixels` takes the parameters.
   - The image metadata carries `sourceChannels`. RULE-032 disables rescale for colour and
     RULE-029 offers one Gray channel or three separate ones, and the decoder turns everything
     into RGB — so without this the question is unanswerable and the panel would offer controls
     the server ignores. It names the refusal rather than greying a slider.
   - The marker-spacing limit went the other way, into the browser: it is a widget rule, not
     arithmetic. It is refused with its reason rather than snapped to the minimum as legacy does,
     which silently moves a band boundary the user did not move.
   - The display adjustments stay in the browser, where they belong — last step, on the rendered
     canvas.

   **The frequency filter runs, and its cache is designed against legacy's defect.** RULE-030 is
   the third step of the chain and it now reaches the image. Four things about it:

   - **Its output is always 8-bit**, whatever the source was, because the rule stretches the
     filtered plane to 0..255. So when it runs on a 16-bit image, `to8Bit` must NOT run after it —
     shifting those bytes right by another eight leaves a black image.
   - **Grayscale is decided by the PIXELS, not the header.** The card says "2-D or exactly
     equal-channel images", so a grayscale scan saved as colour qualifies — and that is common.
     The panel warns a colour image that the filter may be skipped, rather than letting a user
     discover it from a slider that does nothing.
   - **The cache is keyed on the whole query**, plus the image's revision. Legacy keys its cached
     spectrum on image DIMENSIONS alone, so moving a rescale handle leaves the FFT answering from
     the input it had before. Keying on the query as sent makes that structurally impossible rather
     than a thing to remember when the next parameter is added. It is bounded by bytes, not
     entries, and least-recently-used.
   - **An image too large is refused, not waited on.** Measured: 1 MP about 0.7 seconds, 2 MP about
     2, 6 MP about 5. Above eight megapixels it is a 413 naming the size and the limit, because a
     minute-long request is indistinguishable from a dead server. Legacy has no limit and freezes
     its window.
2. **Phase 6 — sequence and cutover** (25.9%). The timeline, propagation review, the split view,
   the hosted deployment and the actual switch-over.

   **Two of its four entry criteria are open, and neither is code:**

   1. *Phase 3 and Phase 5 exit criteria are met.* **Both done.**
   2. *Decisions 1 and 8 are ticked.* Decision 1 is the PyPI package and desktop app; decision 8 is
      whether multi-view is rebuilt as a split view, redesigned or removed. **Owner.**
   3. *At least one recorded image sequence has legacy propagation outputs saved as golden data.*
      This needs the legacy app, the real checkpoints and a sequence someone cares about. It is the
      longest-lead item and nothing in Phase 6 can be proven equivalent without it — the same
      shape as Phase 3's differentials, which are the strongest evidence in the project.
   4. *Every P6 rule is answered.* **The two that blocked it are answered** (2026-09-20). RULE-060
      needed a fidelity correction and RULE-055 two behaviour questions; both were re-derived from
      the source rather than taken from the judges, and both answers are on their cards. What is
      left on each is the owner's P0-or-P1 call, which decides which suite the rule is tested in
      rather than whether it is tested. **Owner, but not blocking the work.**

      The two corrections are worth knowing before any Phase 6 code is written, because each would
      otherwise produce a confidently wrong port:

      - A propagated frame's confidence is the minimum over objects with a **non-empty** mask. An
        object that leaves the scene comes back with confidence 0.0, and a port that includes it
        flags and — by default — wipes every frame where that happens.
      - **Keep Flagged Masks does not keep them on disk.** Save All excludes every flagged frame,
        so it is a review control. "Keep" reads as "keep in the dataset" to anyone porting it.

   The pilot slice the brief names is "build a timeline from a file range and mark references from
   existing annotations, without propagation". That part needs no checkpoints, so it is what to
   start on the moment criteria 1 and 2 are ticked.

## What running the app found that the tests did not

Five defects in one session, none of which a unit test could have caught, and it is worth being
explicit about the shapes because they will recur in Phase 6.

1. **Vertex editing was unreachable.** `EditLayer` was built, unit-tested and never rendered by
   `OpenImageView`. Every test drove the component directly, so nothing noticed a user had no way
   in. Found by writing persona flow 3 end to end.
2. **The adjustment sliders wrote to settings nothing read back.** Found by looking at the panel
   and asking what renders it.
3. **Annotations drawn on an image with no annotation file were invisible.** The canvas was shown
   only when the load returned annotations; the first image of every new dataset got a plain
   `<img>`. Found by reading the view's branches.
4. **A dataset whose images are not at the root could not be opened.** The listing is non-recursive
   per RULE-051, and nothing offered a way down — the API had supported `?folder=` the whole time.
   Found by pointing the app at a folder laid out the way this project's own fixtures are.
5. **Space could be refused over a preview that was on screen.** The keydown listener is registered
   in an effect, so there is a window where the banner is rendered and the listener still closes
   over the render with no prediction. Found by chasing a test that failed one run in ten — the
   failing DOM contained both "AI preview ready" and "No AI segment preview to accept", which
   cannot both be true of one state.

The common thread: **a rule can be implemented, tested and correct, and the feature can still not
exist.** Component tests prove the component; only an end-to-end path proves it is reachable. That
is what Phase 5's exit criterion 1 is for, and it earned its place twice in one session.

The second thread is about the suite itself. Two flakes turned out to be one real defect (5) and
one real contention problem (a fresh jsdom per file was two thirds of the run). Neither was a
reason to raise a timeout, which was the first thing tried both times.

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
