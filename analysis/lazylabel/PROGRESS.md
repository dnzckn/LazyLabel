# Progress

Where the conversion stands, on branch `main-web`. `MODERNIZATION_BRIEF.md` is the plan and does
not change as work lands; this file is the log against it, and is the one to read first.

Last updated: 2026-09-27.

## Short answer

**Every capability is built, and the web app does what the PyQt6 app does, except where the owner
chose otherwise or a difference is written down with its reason.** What is left is mostly the
owner's to decide ("What to do next").

**All fourteen capabilities are built** and reachable from the app, C8's tiles and C13's hotkey and
settings editors included. Every setting has a control or a written reason. All five of Phase 6's
exit criteria are met (2026-09-25), criteria 2 and 4 on synthetic data the owner chose in place of
real data: a clip of moving shapes, and a generated acceptance corpus.

**The parity audits are done.** The owner's direction, 2026-09-25: "ensure that every feature
behaves the same way across the two versions", the Sequence tab first.
- `VISUAL_PARITY.md`: all fourteen items, 2026-09-24 and 25, each compared against the legacy
  window rendered by `grab_legacy.py`.
- `CONTROL_PARITY.md`: every item, CP-01 to CP-75, is done. What a row still does differently is
  written in that row, under "Not matched" or "Still different", with its reason.
- `SEQUENCE_PARITY.md`: the 58 differences found on 2026-09-25 are each fixed or kept as a
  recorded decision, except SP-57's two web-only extras, which wait for the owner.
- A last pass on 2026-09-27 checked five small gaps in the mouse handling, four of them in the
  Multi view. Three match legacy now; two are recorded with their reasons ("What remains").

**The owner's decisions are built.** 2026-09-26: match the desktop app's silent loss (leaving the
Sequence tab, New Timeline, an emptied frame's files deleted); crop and FFT reset per image; E and
R toggle back; Ctrl+Plus/Minus keep zooming; the Multi view acts on both images; SP-09 and SP-36
keep the web's answers; closing the tab still asks; Min Conf is a setting; saving on a move only
with Auto-Save on Navigate on. 2026-09-27: the Multi view is for AI prompts at the same pixel in
both images, each image its own contour, and starts linked (CP-31). Earlier answers: tiles built,
Python 3.12, synthetic goldens, a simulated acceptance corpus, class names crossing both ways in
`.npz` files, and two mains, the PyQt6 app on `main` and this one on `main-web`.

**Checked on the real stack, with the models on the GPU**, not only in jsdom:
- **Sequence, end to end** (2026-09-23 and 25): a reference from a polygon file, propagation with
  SAM 2.1 large, Save All writing NPZ and YOLO files that follow the moving disc within about a
  pixel, and Find Archetypes with the MobileNetV3 embedder. Propagation matches legacy's frame for
  frame on the golden captured from legacy's own sequence mode. On the longer streaming golden the
  two differences measured, SP-09 and SP-36, are where the owner kept the web's answers. Find
  Archetypes suggests the
  same 10 frames as legacy's `ReferenceFinderWorker` on a 90-frame clip.
- **Linked Multi AI** (2026-09-27): one click at (40, 120) gave one image a 1,810-pixel mask and
  the other a 1,811-pixel one following its own disc; the two overlap at IoU 0.57, where a copy
  would be 1 (CP-31, `6886af9`).
- **Model controls** (CP-49): Load took the GPU from 804 to 2,107 MiB and read "Current: SAM 2.1
  large"; Unload brought it back to 1,055 MiB.
- **Headless sweeps** (2026-09-27) found what the jsdom suites had not, all fixed with tests: a
  polygon added twice under StrictMode (`887f3a0`), a frame deleted by the Auto-Save after Save All
  had written it (`77c642b`), a second Propagate starting during the first (`ef64eca`), a linked AI
  click on a pair still being encoded asked of neither image (`8d75904`), and clicks landing 27 px
  off after switching halves (`cb54bc3`).

The latency budget holds from the browser: 82-128 ms per click on 12 megapixels, warm.

**One command starts it.** `npm install` in `modernized/`, then `npm start "<folder>"`, serves the
app and the API from one port. For the AI tools, `npm run ai:setup` installs PyTorch 2.10.0 and SAM
1 and 2 from `inference/uv.lock`, `npm run ai:models sam2.1-large` fetches a checkpoint and checks
its hash, and `npm run doctor` checks all of it (`DEPLOYABILITY.md` R6 to R9). Settings live per
user, in `~/.config/lazylabel/lazylabel-web.db` (R5, `c8fee09`).

## The suites, as of 2026-09-27

Six of the seven were run on 2026-09-27, after the day's last code change (`6fb821a`), and all six
are green. The converter was not rerun: nothing in it has changed since 2026-09-25.

| Package | Passing | Note |
|---|---|---|
| exporters | 2024 | `npx vitest run --testTimeout=60000`, 30 files: the seven formats byte for byte against goldens legacy wrote, and the differential emitters |
| web | 1974 | `timeout 1200 npx vitest run --maxWorkers=3`, 129 files; `npm run typecheck` passes |
| inference | 641 | plus 179 skipped: no checkpoint was set, and the suites that need one skip themselves. CPython 3.12 with PyTorch 2.10 (`E:/venv/lazylabel-312`), `pytest tests -q` |
| api | 763 | plus 4 skipped, SEC-09's symlink tests, where the OS will not make a link; 48 files. Two earlier full runs timed out C12's tiny-box-huge-image at 5 s; that file passes alone, 17 of 17: load |
| settings-schema | 55 | 5 files, including the rule-fixed defaults |
| converter | 30 | not rerun; unchanged since 2026-09-25 and no longer needed, kept for its record |
| contracts | 36 | 3 files: the wire shapes both sides agree on, and the tile pyramid's geometry |

Each figure is read from that package's own run. Four commit messages this week quoted a count
that had been typed before the run printed it and needed amending, which is why the rule is now
written down: run the suite as its own step, then write the number.

**Rerun on fresh exports after the day's last changes, 2026-09-23, and all green.** Each job ran
on its own export of HEAD, as CI would. The Python jobs ran on 3.12, which CI now uses for them:

| job | result |
| --- | --- |
| contracts | install, typecheck, 36 tests and build pass |
| API | 440 passed, 4 skipped; typecheck and build pass |
| web | 1225 passed; typecheck and build pass |
| inference | 512 passed, 105 skipped, with CI's package set on CPython 3.12 and the legacy snapshot CI checks out |
| converter | 30 passed on CPython 3.12 |

The inference skips are more than a local run's 45 because CI installs no PyTorch.

**2026-09-25, after the visual parity work:** the web job was rerun on a fresh export of HEAD
(`fb7403f`), with the linked libraries installed first as CI does. Install, typecheck, 1260 tests
and the build pass. No other package has changed since the run above, except the inference
README.

**A clean checkout was not this machine either -- six ways, found 2026-09-23 by running every CI
job on a fresh export of HEAD, one job per export so no install could leak between them:**

1. **The 24 NPZ goldens were never committed.** The root `.gitignore` ignores `*.npz`, and the
   modernized tree re-included only JSON and TXT. The byte-for-byte NPZ proof, 17 API tests and
   the converter's two real-legacy-file tests passed here and nowhere else. Committed, each checked
   against the SHA-256 the committed manifest records: 24 of 24 match.
2. **The API and web jobs failed typecheck and build.** `contracts` imports the format library, and
   a library's imports resolve from its own folder, which a job that installs only the app never
   populates. CI now installs the linked libraries first; both jobs pass on a clean export (api
   414 passed, web 1098, typecheck and build clean).
3. **The inference job could not collect its suite.** `pyproject.toml` still called its dependencies
   "deliberately empty" while five test modules imported numpy; with numpy, SEC-02's decoder tests
   needed OpenCV and Pillow; with those, the runner tests failed on `import torch` because their
   skip checked cv2 alone; and two backend tests expected a family error that a machine without
   PyTorch never reached. numpy is declared, Pillow joins `dev`, OpenCV is installed by CI and the
   image rather than declared (its two distributions conflict, and this venv has the desktop app's),
   the runner skip names both needs, and the loader refuses an unbuildable entry before importing
   PyTorch. In a fresh venv with exactly CI's packages: 476 passed, 84 skipped, every skip a missing
   PyTorch or checkpoint.
4. **CI skipped 110 differentials without saying so.** `test_windows.py` runs legacy's own loop and
   needs the legacy snapshot; the inference job never checked it out, while the file's docstring
   said it ran on every commit. The job now materializes it the way the differential job does.
5. **The analysis job read a file git ignores.** `check_citations.py` loaded `rules_with_ids.json`,
   an intermediate the pipeline's own `.gitignore` excludes, so it failed on every clean checkout.
   It reads the committed `BUSINESS_RULES.md` now; the two agreed exactly (94 rules, the same
   priorities), and a bogus citation still fails it by name.
6. **The legacy characterization job could not import the legacy package.** `tests/conftest.py` puts
   the repository root on the path, not `src`, and the job installs dependencies without the app;
   importing the UI package also needs scipy, which it did not install. With `PYTHONPATH: src` and
   scipy, in a fresh venv with exactly its packages: 13 passed.

**The same question asked of the environment variables** -- does each service's README name every
variable it reads? -- found three that no operator could have learned without the source: the API's
`LAZYLABEL_INFERENCE_URL`, which decides whether the AI tools exist at all, and the web app's
`LAZYLABEL_API` and `VITE_LAZYLABEL_API`. Documented, and `web/test/source/envDocumented.test.ts`
now asks it of all three services on every run, matching reads rather than mentions.

Every CI job except the three image builds has now been run this way and passes: the five Node
packages, inference, converter (30), characterization (13), analysis, and the differential job
(all 24 archives match legacy; every reader matches across 12 cases and 7 formats). The image
builds need Docker, which this machine does not have.

**The API image could not have started.** Its build stage failed at `tsc` for reason 2, and had it
built, Node resolves `@lazylabel/*` to each library's `dist` at run time, which nothing built, and
the runtime stage copied `api/node_modules` alone, whose `file:` links pointed at folders it did not
copy. The Dockerfile now installs and builds the libraries in order and keeps the whole tree. Those
steps were run on a clean export: the result started, `/health` answered 200, and a second start
pointed at a 1.5.0 `settings.json` imported it and served width 1234 and gamma 1.4. Still never
built by Docker itself; `deploy/README.md` keeps saying so. The inference image lacked OpenCV, so
every image route would have failed on `import cv2`; it installs the headless build now. A
`.dockerignore` keeps a developer's `node_modules`, `dist` and checkpoints out of the context.

**The API's capability table: four stale entries corrected 2026-09-23; C8 is the one real gap.**
Each was examined rather than flipped.
- **C11** read "pending" while the propagation proxy and `c11.propagationProxy.test.ts` existed. It
  reads built, with polling instead of a socket recorded as a decision beside it.
- **C3** was stale the same way: its acceptance test proves the RULE-089 rendered-pixels route it
  listed as missing.
- **C10** listed "sequence and timeline persistence". That was the architecture's expectation (its
  SQLite row names "sequences"), not a requirement: none of C10's seven rules asks for a saved
  timeline, and legacy keeps none between sessions. The web app rebuilds the timeline from the
  files, which decision 5 makes the truth. The API's share is:
  - the file order (C1);
  - the annotations that references are marked from (C2);
  - frame sizes for RULE-048;
  - RULE-022's suggestions.

  Examining it found the frame-size route (`GET …/images/*/metadata`) called by the browser and
  **proven by no test**. The function behind it was unit-tested; the route was not.
  `c10.frameSizes.test.ts` now covers it with four tests; swapping width and height fails one.
  **Owner question:** should a timeline survive a reload, which legacy's never did? That would be
  new scope, and where it would live is already named: the architecture's SQLite row.
- **C14** waited on "its per-viewer class-id space", decided on 2026-09-20: ids stay per image, and
  linked operations match classes by name in the web app. Each side of the split view saves through
  C9's per-image route, so it reads `not-this-service`.
- **C8** listed "decode, tile, and render adjusted pixels". Decode, the thumbnail route and the
  rendered pixels exist. **Tiles do not**: the spec's API sketch has a tile route
  (`/images/{imagePath}/tiles/{z}/{x}/{y}`), and its NFR table makes 50 megapixels the supported
  working size. Measured the same day, whole-image PNGs meet that size on a local install (the
  figures were in "What to do next", item 4, until 2026-09-27; git history keeps them). Whether a
  hosted install needs tiles was the owner's call. The owner answered the same day, "build them
  now", and they are built.

**Collapsing a panel threw away what it held -- found and fixed 2026-09-23.** A panel UNMOUNTED
its contents when collapsed, and collapsing is what people do for room. Collapsing Sequence after a
propagation discarded every unsaved propagated frame, minutes of GPU time, without the question New
timeline asks (RULE-056); collapsing Drawing tools took Ctrl+Z and Ctrl+Y away, because Undo's
hotkey lives in the history controls inside it; collapsing Segments took Delete, Merge and Select
all. A panel now builds its contents the first time it opens and afterwards HIDES them, which is
what legacy's cards do. Closing the TAB lost the same propagation too, since `CloseGuard` asks
about open images only: the timeline panel now arms the browser's own dialog while propagated
frames are unsaved. Seven tests: six failed before the fix, and the seventh holds the other side
(no question when nothing is waiting to be saved). Checked in a real browser (Ctrl+Z
restores a deleted annotation with Drawing tools collapsed; the split view's canvases return at
the same size and place after a collapse). Found while examining C10, below: nothing persists a
timeline anywhere, so the question became what else could lose one.

**Asked of every path that replaces work in memory, the same day, three more asked nothing.**
Opening an image asks when the one it replaces has unsaved work, and New timeline asks about unsaved
propagated frames. These did not:
- **"None -- one image"** in the split view emptied the second side, unsaved annotations and all.
  `closeSide` now asks the question opening does; on a no the pair stays and the picker shows it.
- **Propagate, a second time,** replaced the last run's unsaved masks.
- **Clear** dropped them.

Both now ask first, through the same question New timeline asks, and neither asks when nothing is
unsaved. Six tests: removing the question fails the four that expect it, and two hold the other
side.

**Operate On View segmented a picture nobody could see -- found and fixed 2026-09-23.** With the
setting on, the API rendered the model's picture from the decoded file plus brightness, contrast
and gamma. Legacy's rescale, channel thresholds and FFT REPLACE the image those adjustments apply
to (`image_adjustment_manager.py` calls `set_photo` with the processed image), so its Operate On
View segments the processed view. Here, a rescaled 16-bit image was segmented unrescaled. When only
processing was on, no picture was sent at all, and the model read the original file.
- **Web.** The embed request carries the chain as `processing`: the pixels route's own query
  string, from the same builder that makes the pixels URL.
- **API.** Renders the model's picture through the same decode step the pixels route uses. A test
  holds the two byte for byte.
- **Inference.** Keys its encodings on the processing as well as the adjustments. Otherwise a new
  rescale under unchanged adjustments would have answered from the old encoding.
- **Neighbour prefetch.** Still sends the adjustments alone, because decision 9 opens each image
  with no processing.

The shared contract has the new example, and both sides pass it. Thirteen new tests: four in
the inference suite (one is the contract example), four in the API and five in the web app.
Mutations caught:
- a render that ignores processing fails two;
- rendering only for adjustments fails one;
- a key without processing fails one;
- the view sending an empty chain fails one.

**Vertex handles could not be grabbed -- found in a real browser and fixed 2026-09-23.** With a
polygon selected and no tool active, its handles appeared at its vertices, and a drag on one did
nothing. Two causes, both invisible to jsdom, which fires events at an element without
hit-testing:
- **The handles were 3.6 CSS pixels across.** The layer measured its surface during render, and
  the first render comes before the surface exists; nothing rendered it again, so the handles
  kept image-unit size on a 1024-pixel image shown 366 wide. The file's own header says "a handle
  too small to hit is a handle that does not exist". It now measures after mount and whenever the
  surface changes size, which zoom does: 10 px, as designed.
- **They had no fill.** SVG hit-tests a hollow shape only on its outline. The whole disc takes the
  press now.

Re-run: the vertex went where it was dragged, the image read unsaved, and undo offered "Move
vertex", one entry for the gesture. The other drawing tools were driven the same way afterwards, and needed nothing:
- a Box drag added a four-sided polygon under the next class;
- a Circle drag added a circle;
- a click inside the box selected it, outlined 2 screen pixels wide;
- dragging the circle's radius handle resized it about its fixed centre, as one undo entry.

Then the class table, merge and crop, read back from the files written:
- class 0 renamed "cell" was saved as `class_aliases_json` `{"0":"cell"}`, JSON not pickle;
- "Merge into class 1" put both boxes in class 1, leaving two mask channels;
- a crop over the top-left blanked what fell outside. The triangle was cut at the crop edge, and
  a box wholly outside was gone from both the NPZ and the YOLO file, as the warning said it would
  be ("Saving will blank 553,972 pixels outside this rectangle").

Accepting an AI mask, the step every AI annotation ends with, had not been driven in a browser,
because the browser tool cannot send Space, which is what accepts. With `save_segment` rebound to
J, a click on a disc and J accepted it through SAM 2.1 ("Undo: Accept AI mask"). With Auto-Convert
on, the mask became a polygon, and the saved box was centre (500, 381), 299 x 298, for a disc
centred at (500, 380) with diameter 300. It has more than 200 vertices, so it offers no handles,
which is legacy's limit; the notice saying so is a transient one. Erasing with an AI mask (`erase_segment`,
Shift+Space, rebound to K the same way) ran through a real mask next. It gave "Undo: Erase from 3
annotations". The disc it covered was "removed completely", because what remained was under the
10-pixel minimum, and the triangle it crossed was cut into its two remaining pieces. Two tests, both failing without the fix; the harness shows
the image at its own size, where the first could not show, so the test shows it at a quarter.

**Linked editing in the split view, checked in a real browser 2026-09-23.** With two same-sized
images linked, a polygon drawn on the left landed on both: "Added to both images, as class 0 in
other.tif". A rectangle closed with Shift+Enter erased from both: "Erased in both images". One Ctrl+Z
took an addition back from both sides. Erasing is decided when the shape CLOSES (Shift+Enter,
Shift+Space, or a shift-click on the first vertex), so a shape drawn with Shift and closed by a
plain Enter is added; the tool's hint, "hold Shift while drawing", is right as long as Shift is
still held at the close. The only defect was the panes' accessible label, "1 annotations", which
the split-view tests had pinned; it reads "1 annotation" now.

**The AI model picker offered the archetype embedder -- found against the real stack and fixed
2026-09-23.** The manifest lists MobileNetV3 beside the SAM checkpoints, for Find Archetypes. The
picker offered it for the AI tool, and choosing it failed with "no backend for family 'embedder'".
- The service now reports `segmenter` for each model.
- The picker lists the embedder, verified but disabled, with "Find Archetypes uses this model; it
  cannot segment".
- An embed request naming it is refused, saying to choose a SAM model. `is_segmenter` existed for
  exactly this and was called by nothing.

In the same run, SAM 1 went through the whole stack: its restore after the prefetch returned the
disc. So did switching models mid-session, SAM 1 to SAM 2.1 and back, each answering from its own
encoding. Two tests, each failing without its fix.

**Two objects, one of which vanishes -- three bugs found against the real stack and fixed
2026-09-23.** Forty frames: a class-0 disc moving right, and a class-2 disc moving left that is gone
in frames 20-25. Both were seeded from two polygons on frame 0. The service produced every result
right: the second disc was empty with confidence 0 while gone, and picked up again at frame 26. The
bugs were in what carried the results:
- **The browser crashed on the contract's empty mask.** An empty mask is `box: null` (`WireMask`),
  and `scoreOf` read `box.length`. The throw landed in the poll's error path, which stops polling,
  so the timeline ended at frame 19 under "Propagated 38 frames". Its own copy of the result type
  declared a box that could not be null, which is why the compiler never said so; it now uses the
  contract's type. The test's "empty" mask was `box: [0, 0, -1, -1]`, a shape nothing produces, and
  is now the contract's form: the two existing empty-mask tests fail without the null check.
- **`completed` counted objects, `total` frames.** Two objects over 40 frames read "80 frames". The
  job counts frames now.
- **A cancel between two objects of one frame kept half of it.** Save All would have written that
  half as the frame's whole annotation. RULE-063's frame in flight now finishes whole, in the job
  and in the runner, which returned after any object. Results with no frame key keep the old rule
  exactly.

Three service tests fail without their fixes. Re-run: "Propagated 40 frames", and all 39 saved files
right. Class 0 is at its disc in every frame; class 2 is at its disc, absent in exactly frames 20-25.

**Propagation over a long sequence, run against the real stack -- two bugs found and fixed
2026-09-23.** The run had 130 frames and the streaming window set to 50 in the settings editor, so
three windows overlapped by five. Every one of the 129 saved boxes followed the disc to within 1.0
px, with no drift at either seam (frames 45-51 and 90-96); the whole run took 36 s. Cancelling partway
and saving again found two bugs:
- **A cancel lost frames.** The service kept 42 frames and the timeline showed 39. The cancel answer
  is a snapshot: the job's state, no results, and its latest cursor. The browser took that cursor,
  and so skipped the frames committed since its last poll -- the very hole the poll refuses to leave.
  The browser now takes only the state; polling collects the rest from its own cursor, with one
  final poll if the job has already stopped. Re-run: "stopped after 36 frames", and the timeline
  showed 35 propagated plus the reference, with Save 35 frames offered.
- **After one Save All, a later run's masks counted as saved.** The set of written frames was never
  cleared, so re-propagated frames got no Save button and no question before New timeline, Clear or
  a closed tab threw them away. It is now cleared when a run starts and on Clear. Re-run: after
  saving 35, the next run offered Save 129 frames.

Both directions were run too (RULE-025), with the reference moved to frame 65 of the 130. The
backward pass reached frame 0 and the forward pass frame 129, through windows of 50 each way. All
129 saved boxes were within 1.0 px, with no drift at any seam.

Each has a test that fails without its fix. The two cancel tests whose fake service answered
"completed" after a cancel -- which the service never does -- now answer "cancelled", as it does.
"Stopped after 1 frames" reads "1 frame" now, in the browser and in the service's sentence.

**A click could be answered from ANOTHER image's encoding -- found in a real browser and fixed
2026-09-23.** It was found in the first full-stack run with a real model: the browser pane, the API,
and the inference service on the RTX 3080 with SAM 2.1 large. That run showed a 500 from two
requests loading the model at once. Reading why found something worse:
- **The predictor.** It holds ONE encoded image, and the service caches ten; RULE-091 encodes the
  open image's neighbours before anyone asks.
- **The cache.** It held a marker, not the encoding.
- **The check.** The only check on a click was the image's SIZE, and every neighbour in a folder of
  one size passes it.

Reproduced with the real model: a click on a disc gave the disc, 20,031 pixels. After a same-sized
neighbour was encoded, the same click gave 286,131 pixels: the neighbour's background, with no
error. Asking for the embedding again said `cached` and changed nothing.

So every AI click after the prefetch ran could be answered from the wrong picture. The prefetch
starts within a second of an image being ready. Legacy caches the encoding itself (`get_embeddings`
/ `set_embeddings`) and puts it back on a hit, and the service now does the same:
- the cache holds each family's encoded state, on the CPU as legacy holds it;
- a click for another image puts its own back first, without running the encoder;
- loading, encoding and predicting are serialised, because the server is threaded;
- an encode that fails partway forgets what the predictor held.

Five unit tests with a one-image fake predictor, each failing without its fix. Two live tests, one
per SAM family, pass with the real checkpoints and fail with the restore removed. The whole inference
suite with all three checkpoints: **607 passed, 0 skipped**. Without them: 569 passed, 38 skipped.

Then checked the way it was found, in the browser pane against the real stack, with a second
same-sized image in the folder. Two concurrent first encodes now both answer 200; before the lock,
one was the 500. The prefetch encoded the neighbour, which leaves the predictor holding it. A click
on the open image's disc then came back as that disc: box (351, 232)-(650, 530) for a disc centred
at (500, 380) with radius 150, in 144 ms. That view was also rescaled, with Operate On View on.

**Operate On View refused large colour images -- found and fixed 2026-09-23.** The inference
service capped request bodies at 64 MiB, a number with no recorded reason. The API posts RULE-089's
rendered picture as a base64 PNG inside JSON. Measured with the API's own encoder at 50 megapixels,
the spec's supported working size:

| picture | PNG | as base64 |
| --- | --- | --- |
| colour, camera-like noise (sigma 3) | 112.0 MB | 149.4 MB |
| colour, faint noise (sigma 1) | 72.0 MB | 96.0 MB |
| grayscale | 38.9 MB | 51.9 MB |

Both colour pictures were refused with a 413, so the tool failed on colour photographs above roughly
22 to 35 megapixels. The cap is now 256 MiB, which covers an incompressible 50-megapixel picture
(200 MB as base64). A test derives that requirement from the working size and fails at the old
value. The 413 test no longer allocates 64 MB to prove the mechanism: it patches a 1 KiB cap. It is
still a bound, which is what SEC-06 asks. The service's only client is the API, which refuses
images above 100 megapixels before it renders anything.

A one-off run checked the rest of the path. A 50-megapixel colour picture with camera-like noise, as
the API would post it, is a 105 MB body. The old cap refused that; the new one admits it. The body
then went through the JSON parse and the service's own decode, and reached the encoder as 5774 x
8660 x 3 in 0.9 s.

**RULE-058, a P0 rule, was traced by the P0 guard's own comment -- found and fixed 2026-09-23.**
The guard (`web/test/rules/p0Coverage.test.ts`) passes a rule when any test file names it, and it
read itself. Its header uses RULE-058 to illustrate the question, and no other test named RULE-058.
It was the only rule traced that way; a scan of all 38 P0 rules against the other 195 test files
found no second one. The guard now skips its own file, and fails on RULE-058 when the new test's
mentions are removed.

The rule is legacy reloading the open frame after a propagation finishes, after Save All and after
a trim, which discards its unsaved annotations. The new test, in `c11.propagate.test.tsx`, drives
the app: delete the reference's polygon, then propagate, Save All and trim. The frame still reads
"0 segments, unsaved" after each, and Save All does not write it. Two protections hold this, and
each alone suffices: nothing reopens the open frame, and reopening a frame with unsaved work asks
first. Putting legacy's reload back, with the question answered yes, fails the test with "1
segment, saved": the deletion lost.

**The settings half of C13's editor was missing too -- found and built 2026-09-23.** The
hotkey editor was never built (now it is); the brief's phrase is "web settings AND hotkey editor",
so the same question was asked of the settings: not "does anything READ this key", which the
settings guard answers, but "can a user SET it". Nine keys have no control on purpose (window and
panel geometry, the dropped legacy keys, the name column). **Six were read
by the app and settable by no one** -- they kept their default unless a desktop import brought a
value: `line_thickness`, `pan_multiplier` and `polygon_join_threshold` (RULE-050 clamps typed values
for pan speed and join threshold, which presumes the inputs exist), `operate_on_view` (RULE-089, so a
new user could never turn it on), and `pixel_priority_enabled` and `pixel_priority_ascending`
(RULE-012, same). **The sweep first said thirteen, and was wrong about seven:** the
`file_manager_show_*` column toggles ARE set, by the dataset browser's Columns chooser through a
computed key whose names live in `columns.ts`, which the sweep did not read. They got a second set
of switches in the editor, removed the same day once a real-browser check showed both; the guard
now declares that indirection (`NAMED_FOR`) and checks the writer imports it, and removing the
declaration makes it report exactly those seven. Built: Settings, Edit settings opens
`web/src/settings/SettingsEditor.tsx` in the same dialog as the hotkeys, with RULE-050's clamps
applied when editing finishes (25 in Join becomes 10; non-numeric reverts). `line_thickness` stays
import-only on purpose: legacy offers no control for it either. Seven tests; removing the clamp
fails three. The guard now exists too, `web/test/settings/settable.test.ts`: every key needs a control or a
written reason, so "read and unsettable" cannot recur silently, as "exported and uncalled" once
could. It found one more the day it was written, `stream_window_size`, which propagation reads and
only an import can change. It was recorded as a GAP, awaiting legacy's streaming controls
(RULE-026), and closed the same day by the three steps below: the window in the settings editor,
the Streaming checkbox and the memory estimate.

**The plan for it, so it can be built as written.** RULE-026's card: window 50-1000 in steps of 50,
default 250, saved as `stream_window_size`; overlap 5; streaming on by default; memory estimate
12.6 MB per frame. The plumbing exists -- `PropagationControl.tsx` already reads
`stream_window_size` and sends it, the API forwards a boolean `streaming`, and the inference
`PropagationRequest` takes `streaming: bool = True`. Missing are only the controls:
(1) DONE 2026-09-23 -- in `SettingsEditor.tsx`, a "Propagation" fieldset with the window as a number clamped to 50-1000
and rounded to a multiple of 50 when editing finishes, then remove `stream_window_size` from
`NOT_EDITABLE` in `web/test/settings/settable.test.ts`; (2) DONE 2026-09-23 -- in `PropagationControl.tsx`, a Streaming
checkbox, on by default, sent as `streaming`; (3) DONE 2026-09-23, computed in the browser -- when it is off, the frame count times 12.6 MB shown
before the run starts, which is RULE-026's warning and what the Python `estimate_megabytes` (listed
as awaiting exactly this in `inference/tests/test_reach.py`) computes -- either call it through the
API or compute the same product in the browser and keep that entry's reason current.

**Enter wrote an empty file and said "saved" -- found in a real browser, 2026-09-23.** Drawing a
polygon and pressing Enter, legacy's "finish the polygon and then save", left `photo.npz` with zero
class channels and `photo.txt` empty, while the canvas showed the polygon and the status bar read
"1 segment, saved". Two listeners hear that keystroke, the polygon layer's and the hotkey
dispatcher's, and the dispatcher was registered first: the SAVE ran before the finish, wrote the
annotations without the shape, and on its return cleared the "unsaved" the shape had just set. A
comment beside the code had reasoned the opposite order. The same race made Ctrl+Z while drawing
undo the previous ANNOTATION as well as the vertex. Fixed: the polygon layer listens in the capture
phase and commits a finished shape with `flushSync` before the save reads it, Ctrl+Z on a draft
stops there, and -- the general form -- a save now clears "unsaved" only if the annotations, names
and crop it wrote are still what is on screen, so an edit made while any save is in flight stays
unsaved. `web/test/canvas/keysWhileDrawing.test.tsx` reproduces all three against the old code;
each part of the fix is mutation-checked. Rerun in the browser: the file held the polygon (28,200
pixels where it was drawn), and reopened from disk it came back as a bit-packed mask the canvas
drew exactly. jsdom had never caught this because no test pressed Enter with a save listening. Asking the same question of every
raw key listener found one more: the AI layer's Ctrl+Z, taking back a placed point, also undid the
previous annotation. Fixed the same way, and with nothing placed Ctrl+Z still reaches Undo. The other
raw listeners share only Escape with the dispatcher, where both mean cancel.

**The spec's latency budget had never been measured, and it was missed.** `AI_NATIVE_SPEC.md`
asks for p95 of 150 ms from click to mask on a 12-megapixel image with a warm embedding. Measured on
2026-09-23 on this machine's RTX 3080 with SAM 2.1 large: 213 ms in-process, 342 ms over HTTP
through the API. Profiled, the model was not the tail -- its decoder is about 55 ms -- the wire
mask was: a box plus a BYTE per pixel, base64, so a large mask was megabytes a click to encode,
serialize, proxy and parse. Masks now travel one BIT per pixel (`packing: "bits"`, NumPy's order,
old payloads still decoded on both sides): 94-97 ms in-process and 114 ms over HTTP, with the
median response down from 470 KiB to 59 KiB. The change also found four web modules parsing the
mask layout themselves rather than through `@lazylabel/contracts` -- the canvas, erase, selection
and sequence references -- which bit packing would have broken without a type error; all four read
through one `maskRegion` now. `inference/tools/measure_latency.py` re-takes the number on any
machine. The median is still mostly the model's 55 ms plus choosing among three full-resolution
candidates, which has room left if a slower GPU needs it.

**And from the browser, later the same day.** A browser-pane run through the whole stack, on
12-megapixel images, timed each click's request in the page. Warm embedding, with each click adding
a point to the prompt: 82-128 ms per click, a median of 96 ms, across 14 clicks in three situations.
- **Clicks on one image.**
- **The first click on a newly encoded image.** 107 ms; the encode itself was 599 ms.
- **A return to a cached image.** Its encoding came back in 17 ms, and the first click, which
  restored it, took 107 ms.

The one exception is the first click after the model loads, at 220 ms: a one-time warm-up, not a
per-image cost. Painting the mask is not in these figures; the response is 234 KiB for a large
object's bounded mask.

**Green suites were not a green CI.** `npm run typecheck` is the web job's first step after
install, and on 2026-09-23 it failed with 37 type errors in seven test files: mocks declared with
no parameters, so their recorded calls were typed as empty tuples; `saveAll`'s test helper still
typed for the position-keyed store RULE-077 replaced; unchecked array indexes. vitest does not
typecheck, so every run above was green. `main-web` has never been pushed, so CI never ran on it --
it would have stopped at that step on the first push, before the tests or the build. Fixed the
same day: typecheck and build pass for web and api, and the formats package's typecheck passes.

The skips are the honest part: they skip themselves when no checkpoint is
configured, so a green CI run says nothing about them — see `Running the live suites`.

## What to do next

The engineering the brief names is done. What is left is mostly the owner's to decide, and one
check to repeat before the switch. In order:

1. **Ask the owner** about the pending decisions under "What remains": SP-57's two web-only
   extras, R10 and R11. RULE-024's 16-bit overflow was decided on 2026-09-27, "Fix it in the web",
   and is fixed (`ff56922`; `CONTROL_PARITY.md` CP-72).
2. **Run the live differential suites again with real checkpoints** (CUTOVER.md asks for it when
   the inference service changes, and it changed on 2026-09-26: SP-08, SP-25, CP-49 and R7 to R9).
   "Running the live suites" has the command. Leave `LAZYLABEL_TEST_SAM1_CHECKPOINT` unset while
   the owner's inference service runs on port 8788: loading SAM 1 beside it exhausted the machine's
   memory on 2026-09-26. Run the SAM 1 differential only with the service stopped.
3. **If R10 is chosen,** build and run the Docker deployment once, so CUTOVER.md's last unticked
   box can be ticked (DEPLOYABILITY.md R10 lists what to fix first).

Anything else is a recorded difference, not scheduled work: each "Not matched" or "Still different"
note in `CONTROL_PARITY.md` and each "Keep" in `SEQUENCE_PARITY.md` says what differs and why.

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

All four exit criteria met. **Corrected 2026-09-23: criterion 4 -- "CI builds and tests all services
on every push to main-web" -- was met in configuration only.** The branch has never been pushed, so
no job has ever run, and run one by one on a clean export of the repository, six of them failed for
reasons only a fresh environment shows (see "A clean checkout was not this machine either" above).
All but the image builds pass that way now; none has yet run on GitHub. API, web app and inference
service scaffolded, with the wire contract shared rather than duplicated. Settings schema shared between API and web (37 tests).

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
   legacy fetched from torchvision on first use. **Corrected 2026-09-23: "hash-checked" was true of
   one load path in three.** The video predictor a propagation builds and the archetype embedder
   loaded without the check until SEC-17's walk; see SEC-17 above.
4. **Failures are typed errors, never success** — the pattern `ASSESSMENT.md` 5.4 records, where
   legacy returns `None` for "the model raised", "no points were given" and "the object has no
   pixels" alike.

Find Archetypes is complete: MobileNetV3-small embedding, HDBSCAN clustering, medoid selection, and
the allocation arithmetic RULE-022 specifies to the frame. **Corrected 2026-09-23: complete as a
module, and unusable as a route** -- it chose its model by position in the manifest, so every
manifest listing SAM first, the example included, failed it on every call. Fixed that day.

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

All three were reversed on 2026-09-26 and 27, the owner asking that every feature behave as the
desktop app's: an empty save deletes the seven sidecars (SP-58, RULE-083), leaving an image saves
it with Auto-Save on, and legacy's messages sit in the status bar one at a time on its timers
(CP-64, `d164ea1`). What stays of it: annotations that could not be read are never written over
or deleted (SEC-04), and closing asks (SP-17, the owner's "Keep asking").

All four exit criteria are met:

1. Persona flow 4 passes an end-to-end browser test, and the exported files are byte-identical to
   legacy's on every golden.
2. Saving follows decision 7 — nothing is deleted without an explicit user action, and a damaged or
   foreign file never hides or deletes a valid one.
3. Legacy `settings.json` and `hotkeys.json` import correctly. **Corrected 2026-09-23: this was
   true of the function and of no user.** Nothing called the import until it was wired into the
   API's startup that day; see SEC-16 above.
4. Upload limits and content allow-lists are enforced. SEC-02, SEC-06 and SEC-09 were already
   proven; SEC-07 was argued in a comment and tested nowhere until this session. **Corrected
   2026-09-23: SEC-02 and SEC-06 were not, when this was written.** The inference service read the
   dataset with `cv2.imread`, around the API's allow-list, and the text readers built one full-image
   mask per line while the object limit had no caller. Both were fixed in the security audit above.

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

**The owner's pending decisions.**
- **SP-57: two web-only extras in the Sequence tab.** A Clear button for a finished run, and the
  "could not seed" notice. Legacy has neither (`SEQUENCE_PARITY.md` SP-57). Keep them, or remove
  them to match.
- **R10: the Docker deployment, run for real.** CI builds its images and nothing has run them: the
  `ai` profile is broken, there is no CPU profile, and the inference image has never been built
  (`DEPLOYABILITY.md` R10). It is CUTOVER.md's one unticked box.
- **R11: a release zip with no prerequisites.** A portable Node, a double-click launcher and "Open
  Folder" in the app, for annotators who will not install Node (`DEPLOYABILITY.md` R11).

**Before the switch.** The live differential suites, run again with real checkpoints ("What to do
next", item 2). The deployment box waits on R10.

**The last pass, 2026-09-27.** Five gaps in the mouse handling were checked against legacy's
code, four of them in the Multi view (L = `legacy/lazylabel/src/lazylabel/`):
- A drawn eraser that meets nothing says nothing now, and the line beside the panes names the
  other image only when something was erased there. Legacy names a viewer only then (L
  ui/main_window.py:5799-5805, 5892-5899, 6985-6988; L ui/managers/ai_segment_manager.py:351-360;
  `225d42c`).
- No crop drag, and no whole-selection drag in Edit. Legacy's Multi press handles neither; the Edit
  handles still drag (L ui/main_window.py:5515-5537, 2560-2621; `225d42c`).
- The middle button is a negative AI point there, as any button but the left is (L
  ui/main_window.py:5517-5521; `67c2b89`).
- **Not matched, and not observable:** legacy takes a dragged box, AI box or crop from the last
  mouse move's rectangle (L ui/handlers/single_view_mouse_handler.py:351, 380, 548; L
  ui/main_window.py:5562), the web from the release. A mouse's release comes where its last move
  was, in Qt and in the browser, so both get the same rectangle. Only a synthetic event, a release
  with no move before it, tells them apart.
- **Not matched:** a single-view AI click released a whole pixel or more outside the image. The
  press must be on the image (L ui/handlers/single_view_mouse_handler.py:106-110), but the point
  goes where the button comes up, up to 5 px away (340-365), and legacy asks SAM the `int()` of it
  (L ui/managers/coordinate_transformer.py:47-54, 91-98), outside the image or not. The web asks the same
  whole pixel, and the inference service refuses a point outside the image. Accepting one would
  weaken its input validation. Released less than a pixel above or left of the image, `int()` makes
  it 0, inside, and both ask it (`web/test/tools/ai.test.ts`, "truncates toward zero").

**A flaky test, fixed 2026-09-27.** `web/test/workspace/autoSave.test.tsx` missed a leaving save
now and then: 2 of 5 runs here before the fix. The save button lent its save to the store in a
passive effect, which runs in a task after the commit that shows the image. A move made in
between found no save, and left the image unsaved. The save is lent in a layout effect now, in the
same commit (`6fb821a`); 16 runs after, all passed. A held arrow key could reach the same window in
a browser, so the race was the app's, not only the test's.

**Recorded differences.** Everything else is written where it belongs, each with its reason: the
"Not matched" and "Still different" notes in `CONTROL_PARITY.md`, the "Keep" rows in
`SEQUENCE_PARITY.md`, the recorded decisions at the end of `CONTROL_PARITY.md`, and CUTOVER.md's
"What is lost".

## What running the app found that the tests did not

**2026-09-25, propagation through the restyled Sequence tab, against the real stack** (SAM 2.1
large on the GPU, the synthetic clip). The result matched the golden:
- frame 8 was the reference, frames 2 and 11 were flagged, and 21 frames propagated;
- "Save 21 frames" sat beside the bar and wrote 21 NPZ and 21 YOLO files;
- nothing was written for the flagged frames, and the reference was untouched.

It found one defect. The new "Sequence Mode:" header named the timeline's first frame while the
view showed the open image. The timeline now follows the open image when that image is one of its
frames, as legacy's does (6679e27).

It also found that the Vite dev server can keep a stale transform when a file is written twice in
quick succession: the page ran code without the Save portal. That is not a code defect, since the
tests and the build read the file itself. Touching the file fixes it.

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
because a test exercises one side with the other stubbed. Sixteen found:

| Where | What was missing |
|---|---|
| Component ↔ shell | `EditLayer` built and never rendered; the same for undo/redo |
| Service ↔ process | `HttpInferenceClient` built and `main.ts` never constructed one |
| Setting ↔ behaviour | `operate_on_view` read by nothing, while the panel claimed it reached the AI |
| Client ↔ request | `pixelPriority` never sent, so RULE-012's two settings did nothing |
| Client ↔ request | `expectedRevisions` never sent, so every save was an unconditional overwrite |
| Store ↔ save path | `markSaved` had no caller, so `dirty` never cleared and the app read "unsaved" after every successful save |
| Setting ↔ behaviour | `propagation_confidence_threshold` read by nothing, AND defaulted to 0.5 against RULE-060's 0.99 |
| Setting ↔ pixel | `point_radius`, `line_thickness`, `annotation_size_multiplier` reached no drawing aid |
| Setting ↔ behaviour | `auto_polygon_enabled` and `polygon_resolution`: legacy's Auto-Convert was not built |
| CSS ↔ coordinates | the drawing layer's box was not the image's, so every drawn vertex was misplaced |
| Hotkey ↔ behaviour | 40 of 43 actions had no handler, while the reference listed every one with its key |
| Rule ↔ navigation | `onNavigateAway` and `onClose` had no caller, so opening another image discarded unsaved work silently |
| Manifest ↔ load path | `check_checkpoint` guarded one load path of three; the video predictor and the archetype embedder loaded unverified (SEC-17) |
| Manifest ↔ job | Find Archetypes took the manifest's FIRST entry, so any manifest listing SAM first failed it on every call |
| Import ↔ startup | `importLegacySettings` was tested against legacy-written files and called by nothing; a user moving from the desktop app started from defaults while Phase 4's criterion read MET |
| Check ↔ dialog | `checkAssignment`, RULE-049's check for a hotkey editor, was tested and called by nothing, because the editor had never been built |

**A conflict has no recovery yet, and the message says so rather than pretending.** When a save is
refused because the file moved, the annotations on screen are still the user's — but there is no
force-overwrite, and reloading the image calls `openImage`, which clears them. So the instruction
is the one that KEEPS the work: check the file another way, and do not reload until the
annotations are somewhere else. **"Save anyway, overwriting what is there now" is built**, offered only after a refusal and only
for a conflict. It sends no expected revisions at all, which is an unconditional write — the thing
the conditional write exists to prevent, and exactly the explicit act decision 7 asks for. A
standing setting would be one somebody turns on once and forgets, which is the opposite.

**The same method, run again on the settings, found a fifth.** The question is "does anything read
this?", and asking it of all thirty-nine keys turned up `propagation_confidence_threshold` — stored,
shown in a panel, read by nothing. Worse, its DEFAULT was 0.5 against RULE-060's recorded 0.99,
which legacy uses in all five places it appears. 0.5 is not a milder setting; it is the one that
turns the feature off, because propagation scores cluster just under 1 and essentially nothing is
ever flagged. A user reviews nothing and ships the model's unsure guesses.

**That question is now a test** (`web/test/settings/honoured.ts` and its spec). Every key is
classified READ, DROPPED (a decision, with the decision) or GAP (work, with what is missing), and
the test checks the classification against the source of both packages in both directions: a READ
key must appear, a DROPPED or GAP key must not, and an unclassified key fails. It corrected its
author twice on the first run — `ai_model` was missing from the hand-written list because the key
names had been read out of a stale build, and the two legacy model keys are RULE-085 decisions
rather than gaps.

**Fifteen read, eight dropped, sixteen gaps.** The counts are asserted rather than reported, so
closing a gap fails the test and prompts whoever closed it to say so — which is exactly what
happened on the first gap closed. The remaining ones worth naming: `operate_on_view` (RULE-089, a
contract change across three packages — the AI panel says so on screen); `auto_polygon_enabled`
and `polygon_resolution` (RULE-047); `file_manager_sort_order` (RULE-036); `stream_window_size`
(propagation); and the ten column-visibility keys.

**The first gap closed was annotation sizing** — `point_radius`, `line_thickness` and
`annotation_size_multiplier`, none of which reached a pixel. The interesting part is that the
units are not the same thing. Legacy sizes handles in IMAGE pixels so they grow with zoom; every
layer here multiplies a screen size by `perPixel` so a handle stays the same size on screen
however far in you go. That is the better answer and it was already made — a handle you must zoom
in to grab is one you cannot grab when looking at the whole image, which is when you are choosing
what to fix.

So the settings arrive as RATIOS against legacy's own defaults rather than as lengths. Read as a
length, the default 0.3 is not a smaller handle but an invisible one, and every drawing aid would
vanish for anyone who never opened the panel. As a ratio the defaults draw what was drawn before,
and doubling `point_radius` doubles the handle either way. Verified live: the new Annotation size
slider from 1.0x to 2.0x took a drawn vertex from `rx` 4 to 8.

The layer tests now supply a settings provider rather than letting `useSizing` default silently.
A hook that works without its provider makes a missing wire invisible, which is the defect family
this project has found nine of.

**The same question, asked of the HOTKEYS, was the worst answer yet.** Forty of the forty-three
actions in the schema had no handler anywhere — only undo, redo and fit_view did anything — while
the reference table listed every one with its key as though pressing it would work. A setting that
changes nothing is invisible; a hotkey that does nothing is a promise made in writing and broken
on the first press, because the user is told exactly where to find it.

The tool keys are now wired (1/2/3/4, E, R), set directly rather than toggled: RULE-070 is a
defect card and legacy's toggle-back leaves E R R E stuck in selection. And the reference reports
which actions have a listener, read from the dispatcher itself rather than a list someone keeps,
so it cannot drift.

**Eighteen of the forty-three are live now.** A second batch wired next/previous image, save,
merge, delete, select-all and escape — none of which needed a new capability, since every action
already existed and had a button. Next/previous walks the same array the dataset browser rendered,
so the key and a click move through one order, and clamps at the ends as legacy does. Save is
bound to **Return**, not Ctrl+S, which is worth knowing before assuming otherwise.

Two things the work corrected. The table's hooks first went BELOW its "no annotations yet" early
return, which changes how many hooks run between renders — React refuses and five test files
failed at once; they belong above it, and the keys are right to stay alive there. And the
reference reports `save_output` as inactive when no image is open, which is not a bug but the
point: it answers "will this do something if I press it NOW", and the save keys are registered by
the opened image.

**A third batch wired the six frame-navigation keys** onto `step` and the timeline's own buttons.
They register with the timeline PANEL, so they are live only while it is open — and the reference
reports that rather than promising them always, which is the second time reading the dispatcher's
live registrations said something true a hand-kept list would have got wrong.

A fourth batch added `add_reference_frame` — which needed a capability rather than a wire, since
`markReferences` derives the whole set when a timeline is built and nothing re-derives it while a
user works — and `clear_points`.

**Twenty-six of forty-three are live.** The remaining seventeen are named in the table as "not
yet" rather than silently promised, and `propagate` and `find_archetypes` are C11; `left_click`, `right_click` and `mouse_drag` are mouse
bindings legacy lists in the same table and are not keys at all.

**`zoom_in`, `zoom_out` and the four `pan_*` keys are a REAL GAP, and I had this wrong.** I
recorded them earlier as a decision — the browser does its own zooming — and that is not the same
thing. `.canvas` is capped at `max-height: 24rem`, so a 2000-pixel scan is displayed at 384
pixels: five image pixels to one on screen, with no way to get closer. Placing a vertex on a
boundary at that scale is guesswork. And the browser's own zoom scales the whole PAGE, panels
included, which is not what an annotator wants — legacy's zoom is image-only for that reason.

**It is built now.** Fit by default, doubling steps, per image beside the crop and the
processing. It cost almost nothing, and the coordinate fix is why: at 4x the drawing layer
measures 256x256 over a 64x64 image, and a polygon clicked at pixels (10,10) (40,10) (40,30) saved
as edges 10.0..41.0 by 10.0..31.0 — the correct inclusive-pixel extent, verified against the file.
A zoom built before that fix would have multiplied the error instead of inheriting the fix.

**The four `pan_*` keys and `pan_multiplier` followed.** They scroll the PANE rather than
transforming the canvas: the pane already scrolls once an image is larger than it, and a transform
would be a second way to position the image that the scrollbar could disagree with — the same
shape as every wiring defect found today. `scrollBy` clamps at the ends itself.

**`pan_mode` followed, so all six zoom-and-pan keys are live.** The hand drags the pane opposite
the pointer, which is what grabbing a picture means, and measures each move from the last so one
drag does not accelerate. It shares `pan_multiplier` with the arrow keys, so both gestures move by
the same factor. That layer has no Escape and no refusal where the crop and shape layers have
both: nothing is committed and nothing can be lost, and the fix for a mistaken drag is another
drag.

**`toggle_recent_class` and `convert_to_polygons` followed.** The first is legacy's X and needed a
memory the store did not keep: the class before this one, recorded only when the class CHANGES, or
picking the same class twice would remember the one you are already on and the key would become a
no-op. The second was built as Auto-Convert applied after the fact, at the same resolution. That
was wrong for the key: legacy's P TOGGLES Auto-Convert ("Toggle Auto-Convert AI to Polygon",
hotkeys.py:97-102). Since 2026-09-25 P does that, with legacy's "Auto-Convert AI to Polygon:
ON/OFF", and the after-the-fact conversion is a button in the AI → Polygon section
(`CONTROL_PARITY.md` CP-12). A mask that cannot become a polygon is still LEFT AS A MASK rather
than dropped, because the point is to gain corners to drag, not to lose annotations.

All of that group is live now; see below for the last two that were working unregistered.

**That under-reporting is fixed.** `save_segment` and `erase_segment` finished a shape through
raw listeners the dispatcher never saw, so the reference called them pending while they worked —
the one guard that cannot drift, drifting. Both are registered now, and the binding decides accept
from erase rather than `event.shiftKey`, so a remapping is honoured in full.

**Enter stays raw, deliberately.** Legacy's Enter finishes the polygon and then saves, and the
save half is `save_output` on the opened image. Registering Enter in the layer as well would put
two handlers on one action with no order between them, and a write that ran first would save
without the shape the same keystroke was finishing.

**Thirty-six of forty-three are live.** What is left: `propagate` and `find_archetypes` (C11), and
`left_click`, `right_click` and `mouse_drag`, which legacy lists in the same table and are not
keys at all. Every hotkey that can be wired, is.

**The two settings gaps left are
`operate_on_view` (RULE-089) and `stream_window_size` (C11)** — both blocked on work larger than
a wiring job.

The original note, kept because it is why this was cheap: Every drawing layer derives its
scale from `getBoundingClientRect`, and the drawing surface is now exactly the image (see the
coordinate defect above), so a zoom that changes the canvas's displayed WIDTH is followed by every
tool without touching one of them. What is needed: a zoom factor per side in the store, beside the
crop and the processing, since it is as per-image as they are; an explicit width on `.canvas` in
place of the cap; the stack scrolling; and pan as drag-to-scroll once the image is larger than its
pane. `pan_multiplier` is then the last of the settings gaps.

**The eleventh is the one that costs a user their work.** `onNavigateAway` and `onClose` were
written for decision 7's central case, tested on their own, exposed — and called by nothing. So
`openImage` cleared the side and clicking any other row in the dataset browser took the
annotations with it. Legacy loses work here by auto-saving over it; this app lost it by discarding
it, which is the same loss reached from the other side. The prompt now names the image and the
count, because "you have unsaved changes" is true of every such prompt ever written and tells a
user nothing they can weigh.

**Eleven of them now, and the shape has not varied once**: a piece that works, a test that proves
it works, and nothing calling it. Two things find them — running the app, and asking one question
of a whole list (every setting, every hotkey, every wire field). Neither is the test suite, and
that is the point worth carrying: a suite tests the pieces it is given, and this family is about
the pieces nobody joined.

**The family now has a guard, and it is the general one.** Every instance was the same query —
which exported FUNCTIONS does no production code call? — so that query is a test
(`web/test/reach/unreached.ts` and its spec). Thirteen were found, each has a recorded answer, a
new one fails, and the count is asserted so WIRING one up fails too and prompts the person to
remove its entry. It subsumes the settings and hotkey guards' shape: ask one question of a whole
list, and record the answer where the next person will trip over it.

**Its own biggest find is `clahe`.** A byte-exact port of OpenCV's, matched against six goldens
and one of Phase 5's harder pieces — with no caller, so adaptive equalization is unreachable.
`stretchWindow` and `equalizeLut` are RULE-031's other two presets and are equally unreached. The
missing piece is the same for all three: **the processing query cannot ask for a preset**. Stretch
and equalize slot where the rescale step already runs; CLAHE works on 8-bit and on the crop
region, so it belongs after `to8Bit` — a different slot, and RULE-032 says the order is the
contract, so it is written down rather than assumed. **That slice is now built** — `preset=` on
the processing query, with the rule's own defaults and ranges, a value outside them refused rather
than clamped, and the exclusivity with a manual window enforced rather than resolved by
precedence. Verified against the running API on a real 16-bit image: plain, stretch, equalize and
two CLAHE settings each return different pixels, and choosing CLAHE in the panel fires
`?preset=clahe:2:8:8`.

The guard then fired on its own first real use, one commit after it was written: `stretchWindow`
and `equalizeLut` were reached, so their entries were stale and the count had moved. That is
exactly the mechanism it exists for — an excuse that outlives its gap tells the next reader a
working feature is still missing. `applyLut` went by deletion rather than wiring, because the
pipeline applies the table inside the loop it already runs over every pixel.

**`cropFromDrag` followed**, which is RULE-018's other half: a crop could only be TYPED as two
ranges, which is a fine way to repeat one you know and a poor way to find one. The preview draws
what is REMOVED — four dimmed bands round the outside rather than an outline round the kept part —
because the crop blanks every mask pixel outside it on save, and showing the removal is showing
what the save will do. Verified live.

**`toggleThreshold` followed**, and RULE-027 turned out to have neither half reachable:
`fragment_threshold` was read by the AI tool and settable only by editing the settings file, and
the toggle was called by nothing. Both are wired, with the memory that makes a toggle worth having
— off, look, on, at the same value.

That slice found a small one worth remembering: **`<output>` carries an implicit `status` role**,
so a slider's value is announced as a live region and answers the same role query the app's real
banners do. It broke a shell test by being found instead of the settings-unavailable message. Both
sliders use a plain span now.

`enterEditMode` and `canSave` followed, and the second was guarding a real hole: the save button
was offered for an image whose annotations could not be READ, so pressing it would put an empty
annotation file over a damaged one — decision 7's central case, with the write unconditional
because a failed load returns no revision to guard it. The button is disabled with the reason
beside it now, and the other side is tested with it, since taking the button away from an image
with NO file is the same defect this view already had once.

**Two remain**, both waiting on C11: `frameConfidence` and `saveableFrames`.

Four of the thirteen were merely superseded and were **deleted** rather than recorded:
`afterRemoval`, `rescaleAll`, `posterizeAll`, `cssColor`. Dead code with an excuse attached is
still dead code — the next reader has to work out whether it matters before they can ignore it.

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

**The table is honest again as of 2026-09-20.** Thirteen capabilities are marked built and each
has an acceptance test named for it, driving the real `App` with only the HTTP client stubbed. One
remains pending and genuinely is: C11, propagation, which needs the inference service and a
recorded sequence. C14 joined the built list the same day -- see the linked-operation slice above.

Writing those tests found a sixth defect of the same family: **an image with no annotation file had
no save button.** `ConvertButton` lived inside the `result.kind === "loaded"` branch, so the first
image of every new dataset could be drawn on and never written. That is the same branch, and the
same mistake, that made those drawings invisible earlier the same day — "has a file" is not "can
be saved to", and treating them as one cost this view twice.

The second thread is about the suite itself. Two flakes turned out to be one real defect (5) and
one real contention problem (a fresh jsdom per file was two thirds of the run). Neither was a
reason to raise a timeout, which was the first thing tried both times.

**C14 was verified on disk on 2026-09-20.** One polygon drawn once into a linked pair wrote
`gradient8.txt` and `gradient16.txt` with the identical box — `0 0.390625 0.4791666666666667
0.53125 0.625`, the same pixels in both images, from one action. The two images are the same size,
which is when a linked mask is allowed; a different-sized pair refuses the mask and says to draw a
polygon instead.

**That run found the ninth defect of the family**, and it is the clearest example yet.
`markSaved` was defined on the store, covered by the store's own test, exposed on the context —
and called by nothing. `dirty` never cleared, so the status bar read "unsaved" after every
successful save, for the whole session. The existing test passed because it tested the STORE
function rather than the wire to it, which is exactly how this family survives: every piece works,
and nothing joins them. The fix marks the side captured when the write STARTED, because a save is
a round trip and the user can change panes during it.

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

## A smoke test of the whole app, 2026-09-20

Run against a real API over a real folder after a day of changes, because the thing that has found
the most defects in this project is opening it.

Everything landed that day was present and worked together: the column switches (default `.npz`
and `.txt`, turning `_coco.json` back on inserts it in the API's load-priority order rather than
appending it); all four histogram presets, with Contrast stretch firing `?preset=stretch:0.4`;
Auto-Convert, the fragment-threshold slider and the annotation-size slider; seven tools including
Crop; the split view pairing two images of different sizes and saying so.

**No console errors.** The API log's only failures are two 503s for `/inference/models` — no
inference service is configured, which is a supported deployment and says so. Every other request
is 200 or 204.

**The sort was checked the same way afterwards.** Name A–Z is what arrives from the API and Z–A
is its exact reverse; the four orders that need file dates or sizes are disabled in the control
and labelled. Setting one of them anyway — which an imported legacy settings file can carry —
leaves the list in name order and raises a banner naming the order it could not do: "Size (largest
first) is not available yet".

A small trap in checking it, worth knowing for the next person: the disabled OPTION labels carry
the same "not available yet" phrase as the banner, so a plain text search over the page finds an
option first and reads back the wrong order. Match the banner by its class or role.

The hotkey summary read "19 of 43" there, with an image open and the sequence panel closed. That
number MOVES with what is mounted and is meant to: the six frame keys register with the timeline
panel and the save keys with the opened image, so the table answers "will this do something if I
press it now" rather than "does a handler exist somewhere".

## Running the live suites

The differential and live suites are the strongest evidence in the project and they **skip
themselves when no checkpoint is configured**. CI has no checkpoints, so CI passing says nothing
about them. Run them locally, deliberately:

```bash
cd modernized/lazylabel-reimagined/inference && LAZYLABEL_TEST_SAM1_CHECKPOINT=/path/to/sam_vit_h_4b8939.pth LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt LAZYLABEL_TEST_EMBEDDER=/path/to/mobilenetv3_small_tv.pth PYTHONPATH=/path/to/legacy/lazylabel/src E:/venv/lazylabel-312/Scripts/python.exe -m pytest tests/ -q
```

In the 3.12 venv, which the packages have required since 2026-09-23, the last run with all
three set was **650 passed, 0 skipped**, with 37 warnings, in 48 s on this machine (rerun
2026-09-25 for CUTOVER.md's checklist; 76 s the time before). That count includes the archetype
differential added after the golden was recaptured. The old 3.10 venv still runs the suite, but it skips the golden's mask check,
because that golden is PyTorch 2.10's: the golden module there reads 10 passed, 1 skipped. Earlier
that day the count was 611, and 600 before that day's fixes and their tests. Any `skipped` count above zero means a
checkpoint was not found and that suite did not actually run. This section said "255 passed, 1
xfailed" until then. The xfail was C11's placeholder, removed on 2026-09-21 when the job API
landed, and the suite has grown since. The count here is the one the last run printed, not a target.

Thirty-seven warnings are expected on 3.12, and none is a failure being hidden:
- two come from the weights-only guard's tests, which set `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` on
  purpose, to prove the refusal;
- three come from SAM 2's optional `_C` extension, one for each module that runs the video
  predictor (the differential, the golden and the live propagation test). Its absence skips only a
  hole-filling post-process, and legacy runs without it too: the golden was captured that way;
- thirty-two come from SAM 2's own `utils/transforms.py`, which calls `torch.jit.script`.
  PyTorch 2.10 deprecates it, and the call runs once per image predictor built. It is harmless at
  the pinned commit, and it is the line to watch when PyTorch removes `jit.script`. On 3.10 with
  2.7.1 there were five warnings, the first two groups.

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
