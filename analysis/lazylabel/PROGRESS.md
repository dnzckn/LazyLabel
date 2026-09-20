# Progress

Where the conversion stands, on branch `main-web`. `MODERNIZATION_BRIEF.md` is the plan and does
not change as work lands; this file is the log against it, and is the one to read first.

Last updated: 2026-09-20.

## Short answer

**The app cannot be launched on the web yet.** Phases 1–5 have met their exit criteria. Phase 6
has **started with its pilot slice** — the sequence timeline, built and reachable — and three of
its four entry criteria are met; the fourth needs a recorded sequence and the real checkpoints,
and the script for it is written. What is missing is propagation, the split view and the cutover.

By the brief's own weighting of the six phases: **about 74% of the conversion is done** — 6.0,
5.5, 5.8, 29.4 and 27.4, all complete. The remaining 25.9% is Phase 6.

Phase 4's panels were frames when it exited, because the tools that fill them are Phase 5's by the
brief's own split. They are filled now: drawing tools, AI tools, adjustments, crop, segments and
classes are all built and reachable.

| Phase | Share | State |
|---|---|---|
| P1 — format library | 6.0% | **complete** |
| P2 — architecture and scaffolds | 5.5% | **complete** |
| P3 — inference service | 5.8% | **complete** |
| P4 — workspace, dataset browser, persistence | 29.4% | **complete**; its panels are filled by P5's tools |
| P5 — tools | 27.4% | **complete**; all four exit criteria met |
| P6 — sequence and cutover | 25.9% | pilot slice landed; propagation waits on golden data |

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
     in legacy those pixels are what SAM segments with Operate On View on.

     **Operate On View itself is NOT built**, and the panel now says so rather than repeating
     legacy's sentence. `operate_on_view` exists in the settings schema and nothing reads it, so a
     model prompted here sees the image as it was decoded. Building it means the embed request
     carrying the processing parameters so the inference service encodes the same pixels the user
     is looking at — a wire change and an API change, not a setting to honour. Claiming otherwise
     would have a user adjust the contrast to help SAM and wonder why the mask did not move.

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
2. **Phase 6 — sequence and cutover** (25.9%). **[CUTOVER.md](CUTOVER.md)** is the checklist for
   the day the switch is made — what a user actually does, what is lost and gained, and the six
   things that must be checkable first. It assumes the exit criteria rather than restating them.
 Propagation review, the split view, the hosted
   deployment and the actual switch-over. **The pilot slice is done, and the split view's core
   logic with it.**

   **Linked operations** (`split/linked.ts`) answer the first of the four gaps decision 8's
   reassessment named, and make RULE-092's recorded class answer executable:

   - **The class invariant is the NAME, not the number.** Decision 6 keeps ids per image, so
     copying the number across a pair produces matching numbers that mean different things — worse
     than a visible mismatch, because every export then looks consistent. A linked operation
     resolves the alias and lets each image keep or allocate its own id. Where a class has no
     alias the id IS the name, so the two must share it.
   - **"The same coordinates" means the same PIXEL.** RULE-092 is silent on size because in legacy
     each viewer kept its own point list and the question never arose. A split view pairs two
     images of one subject, and a relative mapping would stretch a shape exactly when the sizes
     differ.
   - A point outside the other image is reported, not clamped; a shape is refused as a unit.
     Different sizes do not prevent pairing — the smaller image refuses what falls outside it.

   **The viewer is built** (`split/SplitView.tsx`). It compares two images **with their
   annotations drawn**, links them, and describes what a linked operation would do. It did NOT
   draw into a pair when it landed, for want of a store that could hold two open images — the
   slice below built that and rewired the view onto it, so both panes are now editable and each
   pane's size, processing and live segments come from the store rather than from a second loading
   path of its own. **C14 stays pending in the capability table** either way: two editable panes
   is not one action applying to both, and marking it built would put the table back to lying.

   Three smaller decisions taken with it: two viewers rather than legacy's dead four-view setting;
   the same image on both sides allowed and announced; an unmeasured image says "measuring" rather
   than being drawn from a guess.

   **The store now holds two open images, and the split view is those two sides.** Everything
   per-image -- `open`, `segments`, `classAliases`, `dirty`, `selected`, `crop`, `processing` --
   moved into a `SideState`; the store holds two of them and a pointer to the ACTIVE side; and the
   eight components that call `useWorkspace()` read exactly what they read before, because the
   context still exposes those as flat values resolved from the active side. Threading a side
   through every signature to serve one view would have made every caller state something only one
   of them has an opinion about.

   Two things stopped being rules someone had to remember. The crop lives in both the side's
   `crop` and its `processing` -- the save path reads one, RULE-029 and RULE-032 restrict the
   other to the same region -- and as two `useState` calls that agreement had no enforcement; it
   is one assignment now. Decision 9's "a crop does not carry over" is likewise one assignment,
   because opening replaces the whole side.

   **History is the part that could not stay as it was.** RULE-052 clears history when an image
   loads, which with one open image an unscoped clear says exactly; with two it says far too much,
   since opening into the right pane would throw away everything drawn in the left. Entries now
   declare an opaque scope and `History.clear` takes one. Dropping from the middle of the stack is
   safe because each entry touches only its own side -- there is a test asserting it rather than a
   comment, because a linked operation touching both sides is what would end it. An entry that
   declares NO scope is dropped by every clear: it has not said what it touches, so it cannot be
   shown safe to keep. And an undo captures the side it was recorded on; reading it back when the
   undo runs would take the user's shape off whichever image they happened to be looking at.

   **The split view is now those two sides**, verified against a running API: switching the
   editing side moved the canvas, the save button, the segment table, the class table and the
   status bar to the other image, and switching back found the first image's two objects and its
   class name where they were left. Two loading paths went away with it -- the view used to
   measure and load annotations itself, a second copy of the ordering that a size must land before
   annotations or every normalized coordinate rescales.

   One capability was deliberately narrowed: comparing two images neither of which is open is no
   longer possible from that panel, because RULE-092 is about a PAIR being labelled together and a
   second image picker would put two controls on one question. It costs one extra click.

   **C14 IS BUILT.** One shape drawn in either image lands in BOTH at the same pixel, under the
   same class NAME with each image keeping its own id, as ONE undo entry that takes back both. The
   decision lives in the store's `addSegment`, which is why it cost so little: every tool, the AI
   prompt and the hotkeys already reach the store through that one function, so none of them had
   to learn that a pair exists. `split/linkedAdd.ts` is pure and separate because the interesting
   part is the refusals -- a shape outside the smaller image is refused THERE rather than moved, a
   mask is refused between images of different sizes since "the same pixel" has no answer when the
   grids differ, and an unclassified annotation has nothing to agree about.

   It is **OFF by default**, reversing this view's first "starts linked, as legacy does". Legacy's
   default does not bind: decision 8 rebuilt multi-view from the rules rather than porting a
   half-migrated feature, and an annotation appearing in an image the user was not looking at is
   precisely what decision 7 says must follow an explicit act.

   Both settled decisions held. One undo entry per linked operation, not two -- a user performed
   one action. And linked classes agree on the NAME: the acceptance test pins the case that
   matters, where the second image already calls class 0 something else, so the arriving class
   becomes id 1 there while staying 0 in the first. Copying the number across would produce two
   files that both say "class 0" and mean different things, which is worse than a visible mismatch
   because every export then looks consistent. Whether a pair should have its IDS reconciled as
   well **stays the owner's**; name agreement is well defined either way.

   **Not linked, and named rather than implied:** the two sides SAVE separately, and a linked EDIT
   or DELETE is not built. Adding is.

   **Thirteen of fourteen capabilities are built.** C11, propagation, is the one that is not, and
   it needs the inference service and a recorded sequence.

   **One serious defect was found on the way, by measuring the running app.** Every drawing layer
   is `inset: 0` inside `.canvas-stack` and turns a click into an image pixel by scaling its own
   rect against the image size -- so that box has to BE the picture, and it was not. The canvas's
   margin grew the shrink-wrapping stack without growing the picture, and its 1px border sat
   inside the scaled box. Measured on a real 32x24 image: canvas at y=215 height 26, layer at
   y=207 height 50. **Every vertex drawn by every tool was misplaced**, vertically squashed by
   about half and shifted up by 8px.

   **No unit test could have caught it**, which is the part worth carrying forward. jsdom does no
   layout, so the acceptance harness mocks `getBoundingClientRect` on `Element.prototype` and
   returns ONE rect for every element -- making the layer and the canvas identical by
   construction, which is exactly the thing that was wrong. A harness that mocks a measurement
   cannot fail on a measurement. The guard is therefore a CSS test asserting the invariant where
   it lives. Verified afterwards live: a triangle clicked at pixels (4,4) (20,4) (20,18) saved as
   a box spanning edges 4.0..21.0 by 4.0..19.0, the correct inclusive-pixel extent.

   **The self-hosted deployment** (`modernized/lazylabel-reimagined/deploy/`) is written: three
   services, one published port on loopback, the dataset as a bind mount, the models read-only,
   neither service as root.

   It was written on a machine with no Docker, so every line of it was reasoned rather than
   observed — and rather than leave that as a caveat nobody could retire, **CI now builds the API
   and web images on every push and validates the compose file against `example.env`**. They either
   build or the run goes red with the reason. The inference image builds weekly and on demand
   instead: it installs PyTorch against a CUDA base and a two-line web change should not pull a
   CUDA runtime. **It builds and does not RUN** — running needs a dataset to mount and, for the AI
   profile, a GPU and a checkpoint SEC-03 forbids downloading.

   **Exit criterion 4's harness is written too.** "Every dataset in the acceptance corpus imports
   and re-exports identically" needs the owner's corpus; what did not need it is the command:

   ```bash
   cd modernized/lazylabel-reimagined/api && npm run acceptance -- /path/to/corpus
   ```

   It reads each annotation file as the app does, rebuilds the export context, writes back the
   formats that image actually had, and compares the bytes — text after decision 10's EOL
   normalisation, binary exactly. Nothing is written into the corpus; every write goes to a scratch
   directory, and a test asserts the given folder is unchanged. An unreadable file is a FAILURE
   rather than a skip, because a run that passed over what it could not open would report success
   loudest for the datasets most likely to be broken.

   A dataset whose class names are **pickled** is reported as needing the converter, with the
   command, rather than as a byte difference — the criterion names that case explicitly. Such a
   file loads its masks perfectly and its names not at all (SEC-01 refuses to unpickle), so the
   round trip writes ids where names belong; saying only "NPZ differs" sends someone hunting a
   rounding bug in the exporters. It counts as a FAILURE, because a corpus that passed only by
   filing its pickled datasets under something else has not been checked.

   Putting `tools/` into the typecheck found three wrong assumptions in that script, which had
   compiled cleanly while reading fields off types that do not have them. **A script outside the
   typecheck is one whose mistakes are found by running it against somebody's real data.**

   Writing the deployment found that **the API never constructed its inference adapter**, which is the eighth
   defect below and the only one at the process level. Checking the configuration also settled the
   design: the web app already defaults to `/api` and the dev server already proxies that to the
   API with the prefix stripped, so production does the same through nginx rather than compiling an
   absolute URL into a static bundle.

   **The sequence timeline** (`sequence/timeline.ts`, `sequence/TimelinePanel.tsx`) is the brief's
   own pilot: build a timeline from a file range, mark references from existing annotations, no
   propagation. It builds from the folder listing the browser already has — the listing carries
   each image's key and whether it is annotated, which is exactly the two things the pilot needs —
   so there is no new endpoint and no second fetch of the same folder.

   The rules and the panel landed together, deliberately. The vertex editor in Phase 5 was built,
   unit-tested and never rendered by anything, so every test passed while the feature did not
   exist; a pilot that cannot be looked at has not piloted anything.

   Three things it reproduces that look like defects, and one it does not:

   - **The Sort puts flagged almost last**, below pending (RULE-072). The list is "what is
     finished", not "what needs attention" — flagged frames have their own navigation.
   - **Clear Flags resets skipped frames and a new propagation run does not** (RULE-076). A frame
     skipped for a size mismatch becomes pending again, which is what a user who fixed the
     offending image expects.
   - **Navigation wraps**, including the single-flagged-frame case where N returns you to where
     you are. Non-wrapping looks identical until someone reaches the end of a long sequence.
   - **What it does not reproduce**: legacy's single status enum. RULE-055's answer is carried into
     code here — a frame has a ROLE and a STATE, so saving a reference cannot stop it being one.
     In legacy that is a route to propagation overwriting hand-made ground truth.

   Verified in a browser against a real API: four frames build as pending, annotating one made it a
   gold reference on the next build, and Sort lifted it to the front.

   **Three of its four entry criteria are met. One is open.**

   1. *Phase 3 and Phase 5 exit criteria are met.* **Both done.**
   2. *Decisions 1 and 8 are ticked.* **Both are**, and have been since 2026-09-17 — an earlier
      version of this file wrongly listed them as open. Decision 1: the PyPI package is frozen at
      2.0.8 and the desktop app stays installable until Phase 6 exit. Decision 8: multi-view is
      rebuilt as a synchronized split view from the linked-operation rules, deleting the
      half-migrated legacy path rather than porting it — with a standing instruction to
      **reassess at Phase 6 entry if the restored rules prove too thin to specify it**. **Done
      on 2026-09-20**: they are not too thin and the rebuild stands. Four gaps are named in the
      brief, three of which are decisions rather than missing archaeology — what "the same
      coordinates" means when the two images differ in size (the biggest), how a pair is chosen,
      whether a linked operation is one undo entry or two (it should be one; the user performed
      one action), and the class-id reconciliation RULE-092 already scheduled here. **The last is
      the owner's.**
   3. *At least one recorded image sequence has legacy propagation outputs saved as golden data.*
      **The script is written**; what is missing is the frames and the checkpoint.

      ```bash
      PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe         modernized/lazylabel-reimagined/inference/tests/fixtures/capture_propagation_goldens.py         --frames <a folder of frames> --seed 0:1:<x>,<y>         --checkpoint <sam2.1_hiera_large.pt> --out <name>.npz
      ```

      It captures every frame's mask, its confidence, and whether legacy would flag it — the flags
      as much as the masks, because RULE-060 decides which frames a user is told to check by hand,
      and a port that tracks perfectly while flagging a different set has changed the feature in
      the way a user would notice. Masks are packed bits: a 2-megapixel frame is 2 MB as JSON
      digits and 250 KB packed, and a sequence has hundreds.

      It says so when nothing was flagged, because a golden where nothing is flagged cannot prove
      the flagging rule — valid capture, just not one that exercises RULE-060.

      This is still the longest-lead item, and it needs a sequence someone cares about rather than
      a synthetic one: `test_differential_propagation.py` already compares the port against legacy
      live on generated frames, and what that cannot give Phase 6 is something to build against
      without a GPU and a legacy install. **Owner: the frames.**

      **It gates the propagation slices, not the timeline.** The brief's own pilot for Phase 6 is
      "build a timeline from a file range and mark references from existing annotations, without
      propagation", and nothing in that touches a model or needs a golden to compare against. The
      pilot can be built while the recording is found; what it must not do is claim the phase has
      exited.
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

Eight defects in one session, none of which a unit test could have caught, and it is worth being
explicit about the shapes because they keep recurring — three of them turned up in Phase 6 work
after the lesson had been written down.

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
5. **Undo and redo had no caller.** The history has existed since Phase 4 with RULE-052's and
   RULE-053's defects designed out and a full suite over it, and nothing in the app called
   `undo()`. A user could draw, erase and merge and had no way to take any of it back.
6. **The split view showed no pictures.** It read its image sizes from the workspace's open image,
   on the reasoning — written into the code — that fetching its own would be "a second answer to a
   question the workspace already asks". The workspace asks about ONE image and a split view needs
   TWO, so one side could never be measured. Found one commit after building it.
7. **The API never constructed its inference adapter.** `HttpInferenceClient` was written and
   tested, `AppDeps` accepted an `inference` field, and `main.ts` never passed one — so in every
   real deployment the AI tools were unreachable and `/health` said "no inference service is
   configured" whatever you did. There was no configuration variable for the URL either. The same
   shape at the PROCESS level, and invisible to both component and acceptance tests because both
   pass through a stubbed client.
8. **Space could be refused over a preview that was on screen.** The keydown listener is registered
   in an effect, so there is a window where the banner is rendered and the listener still closes
   over the render with no prediction. Found by chasing a test that failed one run in ten — the
   failing DOM contained both "AI preview ready" and "No AI segment preview to accept", which
   cannot both be true of one state.

The common thread, and it turned up **three times** (vertex editing, the adjustment sliders, undo
and redo): **a rule can be implemented, tested and correct, and the feature can still not exist.**
Component tests prove the component; only an end-to-end path proves it is reachable.

**The same shape has a wider form, and it is worth hunting deliberately: A WIRE BETWEEN TWO
CORRECT PIECES.** Both ends built, both tested, and nothing joining them — which no test catches,
because a test exercises one side with the other stubbed. Five found:

| Where | What was missing |
|---|---|
| Component ↔ shell | `EditLayer` built and never rendered; the same for undo/redo |
| Service ↔ process | `HttpInferenceClient` built and `main.ts` never constructed one |
| Setting ↔ behaviour | `operate_on_view` read by nothing, while the panel claimed it reached the AI |
| Client ↔ request | `pixelPriority` never sent, so RULE-012's two settings did nothing |
| Client ↔ request | `expectedRevisions` never sent, so every save was an unconditional overwrite |

**A conflict has no recovery yet, and the message says so rather than pretending.** When a save is
refused because the file moved, the annotations on screen are still the user's — but there is no
force-overwrite, and reloading the image calls `openImage`, which clears them. So the instruction
is the one that KEEPS the work: check the file another way, and do not reload until the
annotations are somewhere else. **"Save anyway, overwriting what is there now" is built**, offered only after a refusal and only
for a conflict. It sends no expected revisions at all, which is an unconditional write — the thing
the conditional write exists to prevent, and exactly the explicit act decision 7 asks for. A
standing setting would be one somebody turns on once and forgets, which is the opposite.

**The method**: take each pair of components that must agree, and ask what carries the agreement.
For settings, list the keys and grep for readers. For a wire format, compare the fields the
contract declares against the fields the client sends and the fields it renders. Two of those
checks found nothing — `skippedEmpty` and `health.database` are both handled — and that is the
expected hit rate rather than a failure of the method.

**Four READMEs had stopped being true as well**, found by reading them. The package one said
"Phase 2 is complete" with five phases done; the web one said twelve of fourteen capabilities were
NOT built when twelve are; the API one called itself a scaffold and its wire format provisional;
the inference one said "SAM 1 and propagation remain" when both are proven — what actually remains
there is that their HTTP ROUTES answer 501, which is Phase 6's job API rather than Phase 3's work.

Documentation drifts the same way code does and nothing fails when it happens. A file nobody
updates passes every check it has, because it has none.

**There is already a guard for this and it had gone stale.** `capabilities.ts` says what is built,
`coverage.test.ts` refuses to let a capability be marked built without an acceptance test named for
it, and the shell renders the table so a user can see it. The machinery is sound — what failed is
that the table was not updated as things landed, so it listed eight built capabilities as pending
and nobody was prompted to write their acceptance tests. Keeping that table honest as work lands is
the cheapest defence against this whole class, and is worth doing in the same commit as the
feature.

**The table is honest again as of 2026-09-20.** Twelve capabilities are marked built and each has
an acceptance test named for it, driving the real `App` with only the HTTP client stubbed. Two
remain pending and genuinely are: C11 (propagation) and C14 (the split view).

Writing those tests found a sixth defect of the same family: **an image with no annotation file had
no save button.** `ConvertButton` lived inside the `result.kind === "loaded"` branch, so the first
image of every new dataset could be drawn on and never written. That is the same branch, and the
same mistake, that made those drawings invisible earlier the same day — "has a file" is not "can
be saved to", and treating them as one cost this view twice.

The second thread is about the suite itself. Two flakes turned out to be one real defect (5) and
one real contention problem (a fresh jsdom per file was two thirds of the run). Neither was a
reason to raise a timeout, which was the first thing tried both times.

## The round trip, end to end, in a real browser

Run on 2026-09-20 against a real API over a real folder, because everything above is a test and
this is the thing itself.

Opened a folder, walked into `frames/`, opened an image that already carried one annotation, chose
the polygon tool, drew a triangle, undid it, redid it, and pressed Write. What landed on disk:

```
mask (64, 64, 2)   classes [0, 1]   aliases {"0":"thing"}
per-channel pixels [351, 740]
gray.txt:  0 0.28125 0.28125 0.40625 0.40625
           1 0.453125 0.390625 0.625 0.5625
```

Two classes in two channels, the alias table as JSON in a unicode array (decision 4, no pickle
anywhere), and YOLO detection boxes normalized against the full image. The status bar tracked
unsaved and back, and undo named what it would undo.

**The conflict path, verified the same way.** Saved once (succeeds), saved again (succeeds — the
revision refresh works, which is the regression that would have broken the second save of every
session), then appended a byte to the `.npz` from outside and saved again. Refused with
`frames/gray.npz changed since you loaded it`, nothing written. Pressed **Save anyway**: written,
and the file went from 784 corrupted bytes back to 782 bytes of valid NPZ with its mask, class
order and alias table intact. That last check is the one that matters — it proves the overwrite
produces a correct FILE rather than just a successful response.

Separately verified the same way: brightness 60 took a pixel from 41 to 101 on the canvas; a Red
channel marker at 128 took that pixel's red to 0 and left green and blue alone, over the wire; the
frequency filter changed all 4,096 pixels of a grayscale PNG and returned it grayscale; the render
cache answered a repeat request from cache and a changed cutoff from a fresh render; the dataset
browser walked into a subfolder; the timeline marked an annotated frame as a gold reference and
Sort lifted it to the front; and the split view drew both panes and explained a size mismatch.

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
