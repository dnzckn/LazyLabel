# Progress

Where the conversion stands, on branch `main-web`. `MODERNIZATION_BRIEF.md` is the plan and does
not change as work lands; this file is the log against it, and is the one to read first.

Last updated: 2026-09-25.

## Short answer

**Every capability is built, and the conversion is not finished — because finishing means PROVING
it, and that needs data only the owner has.**

All fourteen capabilities are built and reachable from the app -- C13's hotkey AND settings editors
since 2026-09-23, when asking what a user can reach, rather than what the code reads, found neither
had been built; every setting now has a control or a written reason. C11 is included: propagation runs end
to end, from the browser's reference masks through the API to a SAM 2 video predictor, with a job
API that cancels without losing committed frames. Run that way for the first time on 2026-09-23, in the browser pane
against the real stack with SAM 2.1 large, on eight synthetic frames of a moving disc. The reference
came from a polygon file on frame 0. All seven other frames propagated, and Save All wrote NPZ and
YOLO files whose boxes follow the disc to within about a pixel in every frame. The reference was not
rewritten. Find Archetypes ran the same way with the real MobileNetV3 embedder. Eight near-identical frames
came back as "too uniform to suggest frames", which is a result, and the page showed it as one.
Thirty frames in three distinct scenes gave "5 frames suggested from 3 scenes": two, two and one,
at RULE-022's minimum of five. **Propagation now matches legacy's frame for frame** on a golden
captured from legacy's own sequence mode (2026-09-23; "What to do next" has the detail). That
covers the masks, the scores and the flags, and what Keep Flagged Masks, Skip Labeled and Save All
do with them. It holds for sequences that fit in one streaming window; nothing covers a longer one
yet. **Find Archetypes matches legacy's too**: on a 90-frame, three-scene sequence the port and
legacy's own `ReferenceFinderWorker` suggest the same 10 frames
(`inference/tests/test_differential_archetypes.py`), on 3.12 with PyTorch 2.10 and on 3.10 with
2.7.1. Legacy is handed a temporary copy of the checkpoint, because it downloads into its worktree
when the file is missing and deletes the file when a load fails.

**Running the whole stack with the real models found what 3,000 component tests had not.** That
means the browser, the API, and the inference service on the GPU, as a user would run them. From
2026-09-23, the AI tool, propagation and Find Archetypes have each been run that way, and the runs
found seven defects, with the code reading they prompted, all of them now fixed. All but one were
silent; the load race showed as a 500:
- a click answered from another image's encoding;
- a cancel dropping frames, or keeping half of one;
- re-propagated frames counted as saved;
- an object leaving the frame ending the timeline;
- progress counted in objects;
- two first requests racing to load one model.

Two more came from comparing against legacy's code and measuring payloads: Operate On View
segmenting an unprocessed picture, and large colour images refused. Each is below with its test. The latency budget holds from the browser too: 82-128 ms per click on
12 megapixels, warm. Anything touching the inference path is worth one more such run; the note on
running the stack says how.

**All five of Phase 6's exit criteria are met.** Two are met on synthetic data the owner chose in
place of real data: criterion 2 on a clip of moving shapes, and criterion 4 on a generated
acceptance corpus (2026-09-25; "What to do next", item 2, has the detail).

Every guard this project uses is closed or its remainder recorded: no unread settings, five
unreached functions across the TypeScript and Python reach guards, each with a written reason
(one is a library export the formats tests need), 40 of 43 hotkeys live (the other three are mouse
bindings), and all 94 business rules traceable to a test or recorded as a decision.

**The web app now looks like the PyQt6 app** (the owner's direction of 2026-09-23). All fourteen
items in `VISUAL_PARITY.md` §4 were done on 2026-09-24 and 25, each compared against the legacy
window rendered at 1600x900 by `analysis/lazylabel/grab_legacy.py`:
- **Layout:** the full-window frame, the image fitted to its pane, and the Single, Multi and
  Sequence tabs.
- **Look:** legacy's palette in both themes, 9pt type and its controls; the Mode Controls card with
  Global and Image tabs; tinted section strips; the status bar; class-coloured segment and class
  tables; the file list; the timeline bar; and the canvas colours.

It found two real defects on the way, both fixed with tests:
- A save after the view remounted was refused as a conflict with the app's own previous write,
  because the file revision lived in the save button.
- Nothing on screen could set the active class.

Where the web app departs from legacy's look, the reason is written next to the item.

**Class names in `.npz` files cross both ways** (the owner's approval of 2026-09-25). The web app
reads the desktop app's pickled class-name table as data, without unpickling it, and writes the same
table, so there is no converter step. "What to do next", item 3, has the detail and the checks.

## The suites, as of 2026-09-23

All **seven** green, every one run on 2026-09-23. The `contracts` package was
missing from this table entirely, which is how a table stops being a census.

| Package | Passing | Note |
|---|---|---|
| exporters | 2024 | the seven formats, byte-for-byte against goldens legacy wrote; rerun 2026-09-25 after the class-name work (30 files) |
| web | 1264 | rerun 2026-09-25 after the class-name work (104 files); includes the four propagation-golden scenarios (16 tests against legacy's own sequence mode), the tile planning and legacy's reference buttons |
| inference | 605 | plus 45 skipped: the differentials and the golden comparison, which need real checkpoints. With them: 650 passed, 0 skipped. Both on CPython 3.12.11 with PyTorch 2.10, which the package has required since 2026-09-23 |
| api | 482 | rerun 2026-09-25 after the class-name work, on the corpus as legacy wrote it (36 files); plus 4 skipped (SEC-09's symlink tests, where the OS will not make a link, as on this machine); no todo left, since C8 is built |
| settings-schema | 55 | includes the rule-fixed defaults |
| converter | 30 | the pickled-alias rewrite; no longer needed since 2026-09-25, kept for its record |
| contracts | 36 | the wire shapes both sides agree on, and the tile pyramid's geometry |

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
  figures are in "What to do next", item 4). Whether a hosted install needs tiles is the owner's
  call, so C8 stays pending with that as its whole entry.

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

**The owner's answers, 2026-09-23.** Asked as questions, answered as follows:
- **Ctrl+Plus/Minus keep zooming** (RULE-033). The divergence from legacy's annotation-size
  shortcut is now a decision, recorded as such in `web/test/rules/p0Coverage.test.ts`.
- **Image tiles: build them now** (C8). **Built**, below.
- **The sequence timeline keeps legacy's behaviour** (C10): rebuilt from the files, nothing new
  stored.
- **Python 3.12 goes in a separate venv**, leaving the shared `E:\venv\lazylabel` alone. The suites
  run there with PyTorch, and only then are `requires-python` and the torch floor raised. **Done**:
  every suite passed on 3.12.11 with PyTorch 2.10.0, and both floors are raised (SEC-08, below).
- **Propagation goldens come from a synthetic clip** of moving shapes, since no real recording is
  available.
- **The acceptance corpus is simulated** (2026-09-25): "simulate the round trip, have multiple
  shapes/segments/classes and play with the priority setting to ensure expected behaviors across
  the variety of save formats". **Done**, item 2 below.
- **Two mains for now** (2026-09-25): "i want to maintain support to both, pyqt6 and react/node
  architectures so we have effectively two mains for now". `main` stays the PyQt6 app and
  `main-web` the React/Node app. Nothing is merged. `main-web` is pushed to `origin/main-web` since
  2026-09-26, at the owner's request ("pushed to that main-web branch tho not to main"); `main` is
  never pushed from this work.
- **Backups and pickled datasets: not needed**, the owner's answer of 2026-09-25. That answer
  predates a finding, though: every NPZ the desktop app writes pickles its class names (item 2).
  That is now moot: the owner approved reading and writing that table as data (item 3), so no
  dataset needs the converter.
- **Docker is skipped for now**; the deployment stays unverified, and says so.
- **The backup refs from stripping co-author trailers are deleted**
  (`backup/main-web-with-trailers`, `refs/original/refs/heads/main-web`).
- **Every feature behaves the same, sequence mode first** (2026-09-25): "ensure that every
  feature behaves the same way across the two versions, particularly the serial/time series more
  is the premiere feature that needs to work flawlessly". Item 5 below.
- **Moving saves when Auto-Save on Navigate is on** (2026-09-25): "moving should save if save on
  move setting is turned on". This reverses decision 7 for navigation only. **Built** (2c1d1f1):
  leaving an image or timeline frame with unsaved changes saves it first, as legacy's does. With
  the setting off the web still asks, where legacy discards; closing still asks.


1. **Propagation goldens: captured, and the model's half of Phase 6 exit criterion 2 is met.**
   Legacy's own sequence mode ran headless on a clip of moving shapes, the owner's choice. That
   means MainWindow's methods, `SequenceViewMode`, `PropagationManager` and `Sam2Model`, with only
   the widgets replaced by recorders. It ran four scenarios: legacy's defaults, Keep Flagged Masks
   on, and Skip Labeled on and off over four labelled frames. The clip
   (`inference/tests/fixtures/synthetic_clip.py`) is drawn from integers alone, so it regenerates
   byte-identical anywhere and the golden pins every frame's digest. It has two tracked objects,
   the reference on frame 8, and a same-coloured decoy for each object. The decoys make SAM 2
   unsure in both passes: frame 2's square scores 0.975 on the backward pass and frame 11's disc
   0.905 on the forward pass, each beside an object that passes. The square also leaves the
   picture, so it comes back empty on frames 20-23. Output:
   `inference/tests/goldens/propagation/synthetic-shapes.{json,npz}`, 60 kB and 14 kB.

   **Its first run found a defect nothing else could.** The port walked the backward pass
   forwards: it started at frame 0 and moved towards the reference, in a fresh SAM 2 state.
   Legacy walks back from the reference, in reverse, in the state the forward pass has just
   filled. On the golden, the square's mask on frame 0 shared no pixel with legacy's (IoU 0.00),
   and frames 2, 3, 4 and 6 were flagged differently. No test could see it. The runner's fake
   predictor ignored `reverse`, and the live differential seeds on frame 0, so it has no backward
   pass.

   Fixed. A sequence no longer than the window now runs in one state, forward and then back, as
   legacy's full-context mode does, and backward windows walk in reverse. On the golden the runner
   now matches legacy on every object on every frame: IoU 1.0000, scores different by exactly 0.0,
   and the same flags. The fake follows SAM 2's own walk order, and 9 of the 11 new runner tests
   fail against the old runner. The job's progress total also stopped counting the reference frame
   twice, so a mid-sequence reference no longer leaves the bar one short.
   `inference/tests/test_propagation_goldens.py` needs only a checkpoint, not legacy.

   **The behaviour half is met too, and it belonged to the web app.** That half covers which frames
   the timeline flags, what Keep Flagged Masks keeps, what Skip Labeled leaves alone, and what Save
   All writes. `web/test/acceptance/c11.goldens.test.tsx` runs each of the golden's four scenarios
   through the real timeline and propagation control. The fake service answers with legacy's own
   model output, in the port runner's order. It then compares four things frame by frame: the
   timeline after the run and after Save All, the confidence each frame shows, the masks it offers
   for review, and the frames, objects and classes Save All writes. All 16 tests pass; on the web
   code before this change, 15 of 16 failed. Three gaps were found and closed:
   - **No Keep Flagged Masks.** Every flagged frame kept its masks for review. Legacy's default
     discards all of them, the passing objects' too. `web/src/sequence/commit.ts` now decides that
     when a frame's objects are all in, and keeps the decision, because RULE-060 says lowering Min
     Conf afterwards "cannot recover them".
   - **No Skip Labeled.** Legacy's default is on (RULE-081, P0). The web's Save All writes with no
     revision check, so a re-run and a save overwrote every frame labelled since the timeline was
     built. That included flagged frames fixed by hand, which is the workflow the option exists
     for. The labelled set is now snapshotted from a fresh listing when Propagate is pressed, as
     legacy probes the disk then. If the listing cannot be read, the run is refused rather than
     run unprotected.
   - **Written frames were never shown as saved.** Legacy paints them cyan. Frames now also show
     their confidence to four decimals, as legacy's tooltip does, and the reference frame's own
     result from the run is ignored. Legacy's engine never reports that result.

   **Then end to end, in the browser pane against the real stack**, with the API, the inference
   service and SAM 2.1 large on the GPU. The clip was set up as a dataset, and frame 8's reference
   was saved through the API with the clip's exact masks. The timeline matched legacy's defaults
   scenario frame by frame: frames 2 and 11 flagged, the other 21 propagated. All 23 confidences
   matched legacy's to four decimals. "Save 21 frames" wrote 21 NPZ files, legacy's count, and
   all 38 masks in them are identical to legacy's (IoU 1.0000). Each file held exactly the objects
   legacy wrote, the disc alone on frames 20-23. The timeline then showed them saved.

   Propagating again with Skip labeled on painted the 21 saved frames brown ("21 kept their
   existing labels"), re-flagged 2 and 11 with the same scores, and offered nothing to save. All 43
   sidecars kept their modification times. Before this change, that second run and a Save All
   would have rewritten all 21.

   **Timelines no longer mark references by themselves: the owner chose legacy's behaviour
   (2026-09-23).** Building a timeline used to make every annotated frame a reference. That was the
   brief's pilot wording, and it made a rebuilt timeline seed from every frame an earlier Save All
   wrote, each annotation tracked as an object of its own. References now come only from the four
   buttons legacy has: "Mark as reference", "+ All before", "+ All labeled" and "Clear references".
   The golden's web test now sets up exactly what legacy's capture did: the labelled frames have
   their sidecars from the start, and frame 8 is marked by hand.

2. **The acceptance corpus: Phase 6 exit criterion 4, met on a synthetic corpus (2026-09-25).**
   The owner chose this in place of real datasets.
   `api/tools/generate_acceptance_corpus.py` writes ten randomized images:
   - polygons, circles, AI masks and loaded masks over two to five classes;
   - shapes overlapping on purpose, with 8 of the 10 images having overlapping classes;
   - names for some classes, non-ASCII among them.

   Legacy's own save path writes them once per pixel-priority setting (off, ascending,
   descending), in all seven formats. The same script records what legacy writes when it opens
   each image and saves it again: the oracle. Since item 3, every file is kept exactly as legacy
   wrote it, pickled class names included. Before that, every archive was run through the
   converter first.
   `api/test/acceptance/corpus.test.ts` holds the port to two claims, over every image, format and
   setting:
   - **The same annotations saved give what legacy wrote.** 30 of 30. With priority forced off,
     exactly the 16 cases where priority changes the answer fail, so the test can see it.
   - **Opening an image and saving it again gives what legacy writes.** 30 of 30, all seven
     formats. So does the command: `npm run acceptance -- <corpus> --oracle <legacy re-saves>`
     exits 0.

   **Three findings on the way.**
   - **Legacy's own files do not survive legacy's own round trip.** Its NPZ holds one mask per
     class, so opening an image merges a class's instances. On the corpus, all 150 instance-format
     files (YOLO, YOLO segmentation, COCO, Pascal VOC, CreateML) change, and one NPZ loses a class
     that priority had covered completely. So "re-exports identically" was never true of the
     desktop app, and the claim that matters is the one above: the web app does exactly what the
     desktop app does. The harness compared against the original files and could never have passed
     on a dataset with more than one shape per image; `--oracle` fixes that.
   - **Every NPZ the desktop app writes pickles its class names**, not only old ones:
     `np.savez_compressed(..., class_aliases=dict)` stores a dict as an object array. Every dataset
     the PyQt6 app saves therefore needed `lazylabel-convert-aliases` before the web app could read
     its names. The masks loaded either way. Item 3 removed the need.
   - **The harness compared NPZ bytes**, which cannot match by design: the two apps pickle the names
     differently. It now compares every member's dtype, shape and values, and the names by value,
     which is how Phase 1's goldens were always compared.

   For a real corpus, if one ever comes: run the same command on it as it is. Without `--oracle`,
   differences in the instance formats on images with several shapes are legacy's behaviour, not
   the port's.

3. **Done: class names in `.npz` files cross both ways (asked and approved 2026-09-25).** Every
   `.npz` the desktop app writes holds its class-name table as a pickle, which numpy does
   automatically for a dict, even an empty one. The web app used to refuse that member, so
   desktop-saved names were missing in the web app and web-saved JSON names
   (`class_aliases_json`) were missing in the desktop app. The owner asked "so you're saying you
   can't make npz work for web?" and answered "ok" to the proposal below.

   - **Reading.** `exporters/src/format/legacyAliases.ts` reads the table as DATA. It walks the
     pickle's opcodes and accepts only what legacy writes: `_reconstruct` of an `ndarray` with dtype
     `O8`, holding one dict of integer ids to strings. The only globals it accepts are NumPy's
     `_reconstruct` (under `numpy.core` or `numpy._core`), `ndarray` and `dtype`. Any other opcode,
     global or shape is refused and reported as unreadable, as before. Nothing is ever called, and
     the payload is capped at 1 MiB and 200,000 operations. The security rule is now "nothing ever
     executes a pickle", and SEC-01 holds.
   - **Writing.** Both NPZ writers emit legacy's `class_aliases` member, a protocol-2 pickle naming
     `numpy.core.multiarray`, which NumPy 1.x and 2.x both load. `class_aliases_json` is still read,
     for files written before. The converter is no longer needed and is kept only for its record.
   - **Checked with the desktop app's own code.** Legacy's `_load_npz` and `load_npz_class_map`,
     run with warnings as errors, read `{0: 'cell', 5: '細胞', 300: 'three hundred', 40000: 'big
     id'}` back from web-written archives. `exporters/tools/compare_npz.py` now also checks that
     legacy's loader reads each golden's names back from our archives. Before anything unpickles
     one, it checks with `pickletools` that our pickle names only those three globals: 24 of 24.
     `compare_readers.py` now holds the NPZ names to legacy too: 12 cases and 7 formats match.
   - **The acceptance corpus was regenerated with no converter step**, so every file is legacy's
     bytes. `npm run acceptance -- <corpus> --oracle <re-saves>` exits 0: 30 of 30 identical. The
     harness compares names by value, since NumPy pickles as protocol 4 and the port as protocol 2.
     Its "needs the converter" outcome became "unreadable class names", for a table in any other
     shape. In Windows PowerShell, run it as `npm.cmd run acceptance -- ...`: `npm` resolves to
     `npm.ps1`, which swallows the `--`, so `--oracle` never arrives and every instance format
     "differs". `api/README.md` says so.
   - **The web app's warning** now reads "The class-name table in this file is not in the form
     LazyLabel saves", and shows only for such a table.

4. **Controls and hotkeys against the PyQt6 app: `CONTROL_PARITY.md` (started 2026-09-25).** The
   owner asked whether the app matches the PyQt6 one "in looks and hot keys ... across all tabs".
   The look was done (`VISUAL_PARITY.md`). Three read-only audits then compared what every control
   and key DOES, and found about forty unrecorded differences, ranked P0-P3 in that file. By the end
   of 2026-09-25 all five P0 items and sixteen of the P1 items were fixed. Among them:
   - Enter saved over an unreadable file;
   - Ctrl+A then V deleted classes hidden by the filter;
   - class names could not contain a typed space;
   - P did something other than legacy's P;
   - AI mode did nothing until a model was chosen;
   - the mouse wheel scrolled where legacy's zooms.

   `CONTROL_PARITY.md` has every item's status and commit. Work down that file in order. Verify each
   "reported" item against both apps' code before fixing it.

5. **Sequence mode against the PyQt6 app: `SEQUENCE_PARITY.md` (started 2026-09-25).** The owner
   named sequence mode the premier feature. A read-only audit walked a real session through both
   apps (build, references, propagate, review, Save All, trim, archetypes) and found 58
   differences in what the user sees or what is written, ranked S0-S3. SP-01 to SP-07 are fixed:
   moving saves, a corrected frame stays corrected, Clear Flags no longer changes what Save All
   writes, the open reference seeds propagation with what is on screen, Save All writes legacy's
   class names and honours pixel priority, and a visited frame opens merged one mask per class.
   Work down its "Recommended fix order". Rows whose fix is "Keep", and SP-58, wait on the
   owner; SP-08 needs a JPEG clip.

The three decisions this list used to end with are answered, above: Ctrl+Plus keeps zooming, the
timeline keeps legacy's behaviour, and image tiles get built. The measurement that framed the tiles
question stays here, because the tile work is judged against it. On 2026-09-23 a noisy
50-megapixel 16-bit TIFF, the spec's supported working size, sent whole as one 8-bit PNG, came to:
- a 41 MB PNG;
- 2.4 s from click to pixels cold (1.7 s of it the server's decode, conversion and encode);
- 0.8 s from click to a painted canvas warm;
- one 0.5 s main-thread stall while the browser decodes.

Over a 100 Mbit/s link the transfer alone is about 3.3 s. Tiles mean a tiled canvas as well as a
route, since a route nothing calls is the defect this project keeps finding.

**Tiles are built, route and canvas, and C8 is complete (2026-09-23).** The API serves
`/images/{key}/tiles/{z}/{x}/{y}`: 512-pixel PNG tiles of the same processed view `/pixels` serves.
Level 0 is the image's own pixels. Each level above is the one below averaged in 2x2 blocks with
integer rounding, so a tile is the same bytes on every machine. One decode serves every tile of a
view. The geometry lives in `@lazylabel/contracts`, so the browser asks for exactly the tiles
that exist. `c8.tiles.test.ts` holds every level-0 tile of an 1100 x 700 image to that region of
`/pixels`, and the levels above to a longhand 2x2 reference.

The canvas draws the coarsest level first, then the level matching how large the image is drawn,
and only the tiles in view. Its backing store is still the image's size, so no drawing layer
measures anything differently. Run in the browser pane on a regenerated noisy 50-megapixel 16-bit
TIFF (336 MB on disk):
- **fitted**: three tiles, **322 KB** against the 41 MB PNG before. The first paint still waits
  about 2 s cold, because the server decodes the TIFF, which tiles do not change;
- **at 1:1**: only the four tiles in view, 2 MB, in 182 ms;
- **scrolled to the centre**: the 12 tiles around the view, the centre tile first, in 118 ms. The
  pixels are exact: the disc reads (19, 19, 253), its 16-bit colour truncated by 256 per RULE-024;
- **fitted again** after zooming, the whole picture is right;
- **brightness +50**: the same on both sides of a tile seam, and in the coarse region too.

A tile that fails to load falls back to the whole image, as it loaded before. The split view's
panes use tiles too.

**The five security findings the brief said must be designed out have been audited against the
new code. Three of the five had not been.** Checked 2026-09-23:

| finding | state | what was wrong |
| --- | --- | --- |
| SEC-01 pickle | **held** | nothing in the web stack unpickles. Since 2026-09-25 the NPZ reader parses the desktop app's `\|O` class-name table as data and refuses any other. The converter, no longer needed, unpickles only through a restricted `find_class` |
| SEC-02 decoder by content | **fixed** | the inference service read the dataset with `cv2.imread`, bypassing the API's allow-list, so EXR or JPEG 2000 bytes in a `.png` reached OpenCV's unaudited codecs |
| SEC-03 checkpoint pickle | **fixed** | the runtime guard only ever ran in CI; with `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` set, a SAM 1 checkpoint executed code -- reproduced |
| SEC-04 failed load deleting sidecars | **held** | `canSave` refuses writing back an image whose load failed, so Auto-Save on Navigate (back since 2026-09-25) asks instead of saving it, and nothing deletes |
| SEC-06 unbounded allocation | **fixed** | `assertObjects` had no caller and the text readers built one full-image mask per line; 20,000 polygons on a 12 MP image asked for ~224 GiB |

Two of the three were the same defect as everything else found here -- a guard that existed and
that nothing called -- in the two packages NEITHER reach guard scanned: the Python service (which
now has one) and the formats package (which the TypeScript guard now scans too -- and making it
catch SEC-06's pattern exposed two more holes in the guard itself, both fixed on 2026-09-23). The remaining twelve findings are rated
Medium or below for the web, and are the natural next thing to walk. Two are checked and HOLD
(2026-09-23): SEC-07, because the XML reader has no entity lookup at all, so an unknown entity
stays literal text and there is nothing to expand or fetch; and SEC-09, because the directory
store `lstat`s every key and refuses a symbolic link. SEC-05 holds too: the service contains no
network call at all -- every mention of downloading is prose saying it does not -- and each
checkpoint's SHA-256 is verified against the manifest before it loads. That last clause was
true of one load path in three when it was written; SEC-17 below is where that was found.

**SEC-08 is addressed (2026-09-23).** Both Python packages now declare `requires-python =
">=3.12"`, and the inference service's `ai` extra requires `torch>=2.10.0`. They had declared 3.10,
and their suites ran on CPython 3.10.11 with expat 2.5.0 and OpenSSL 1.1.1t, the versions SEC-08
names. **CPython 3.10 reaches end of life in October 2026.**

The owner chose the order: a venv of its own, suites run there with PyTorch, THEN the floors.
- The venv is `E:\venv\lazylabel-312`: CPython 3.12.11, PyTorch 2.10.0 (CUDA 12.8), SAM 2 at the
  pinned commit. The shared `E:\venv\lazylabel` was not touched.
- Every suite passes there. The full live suite ran in one process with all three checkpoints and
  legacy on the path. The CI-matched inference run ran on 3.12 without PyTorch. The converter ran
  too. The figures are in the table below.
- The inference CI job and the converter CI job now run 3.12. The legacy characterization,
  analysis and exporter-differential jobs run legacy's or the pipeline's own code, and stay on 3.10.
- The inference image now builds from `nvidia/cuda:12.8.1-runtime-ubuntu24.04`, whose Python is
  3.12. It is still unbuilt, as the owner deferred Docker.

**Three things surfaced doing it, and none was a defect in the port:**
1. **PyQt6 6.9.2 loaded before PyTorch 2.10 breaks torch's `c10.dll` on Windows** (WinError 1114).
   The order is harmless with 6.9.1 and 2.7.1. Legacy imports Qt, so the differential suites could
   not import torch when run on their own. `tests/conftest.py` imports torch first, and so does the
   golden capture script. **It matters beyond the tests: legacy's desktop app imports Qt before
   torch, so it would not start on this combination.** Its venv should stay on 2.7.1 until that is
   handled.
2. **On 2.10 the whole live suite filled the 10 GB GPU**: 260 s and 8 SAM 1 errors, or worse. Each
   module passed on its own; the SAM 1 differential alone peaks at 8.3 GB. `tests/conftest.py` now
   empties PyTorch's cache between modules, and with the import-order fix the full run takes 73 s.
3. **SAM 2's masks move with the PyTorch version where the model is unsure.** On the synthetic
   golden, 2.10 against 2.7.1 moved 8 of 46 masks slightly. One moved to IoU 0.93: frame 1's square,
   where it touches its same-coloured decoy. No flag changed, no object went empty, and no score
   moved by more than 0.0009. The live differential still matches port to legacy on 2.10, because
   it runs both on the same PyTorch. So the golden now records what it was captured on, and was
   recaptured on the 3.12 venv. Its mask check runs only on the same PyTorch minor version and says
   why when it skips. Flags, empty objects and scores are checked everywhere.

SEC-10 holds: there is no `atexit` registration anywhere, and the backend cache is keyed by
model name, so re-selecting a model reuses it -- memory is bounded by the manifest, where
legacy's grew on every switch.

SEC-11 is done for the new app's CI. `.github/workflows/modernized.yml` has a `permissions:` block
and, since 2026-09-23, every action pinned to a commit with its release in a comment -- 18 uses of
five actions (checkout v4.4.0, setup-node v4.4.0, setup-python v5.6.0, setup-buildx v4.4.1,
build-push v7.4.0). The SHAs were looked up, not guessed: `git ls-remote --tags` against each
action's repository, taking the commit its major tag pointed to and the release tag at that same
commit. The workflow's header says how to move one forward. What remains is the owner's: the legacy
`tests.yml` still carries all three of SEC-11's problems, including codecov-action v3, and
Dependabot would keep the pins fresh but opens pull requests on its own.

**SEC-12 is done.** On 2026-09-23 the `ai` extra pinned
`segment-anything==1.0` (its only release) and declared SAM 2 -- which it had NOT declared at all,
so the inference image could never have loaded a SAM 2 model -- by the exact commit this
environment's install record names, `2b90b9f5`, the one every differential suite ran against. The
image gains `git` to fetch it and `SAM2_BUILD_CUDA=0`, because that optional extension fills holes in
masks and the tested environment never had it: building it would change masks relative to every
equivalence result. The last third was the torch floor: `>=2.7.1` still admitted the torch whose
weights-only unpickler has CVE-2026-24747 (fixed in 2.10.0), and the SEC-03 guard catches the
environment variable, not that CVE. It is `>=2.10.0` since the same day, after every suite passed
on 2.10.0 in the 3.12 venv; SEC-08 above has what that turned up.

SEC-13 holds, checked against both loggers with a filename carrying an ANSI escape and a newline:
the JSON encoding escapes both, so a crafted name cannot colour the console or FORGE a second log
line. Both write to stdout, leaving rotation to the host rather than to an unrotated file.

SEC-14 holds for the new code. Propagation stages its frames in `tempfile.mkdtemp` -- private and
uniquely named, never a fixed shared directory -- and removes it in a `finally`, which runs on a
CANCELLED job too, because breaking out of the loop over the generator closes it. Only a hard
kill leaves frames behind, and then in a directory nothing trusts. The theme-icon half was
PyQt's and has no browser counterpart.

SEC-15 does not apply: it is the NSIS uninstaller's `RMDir /r`, and the web app ships no
installer -- nothing under `modernized/` builds one.

**SEC-17 is fixed, and walking it found two defects in code written for this app.** Its own advice
-- pinned weights, a full SHA-256, `weights_only=True`, nothing downloaded -- was followed on paper:
the embedder is a manifest entry with a 64-character hash, built with `weights=None` and loaded with
`weights_only=True`. But nothing CHECKED that hash. `InferenceService.backend` verified its
checkpoint before loading; the video predictor a propagation builds and the embedder Find
Archetypes builds went straight to their loaders. Explicit `weights_only=True` on both meant no
code could execute, so the exposure was integrity rather than execution: results attributed to a
model that did not make them, and a truncated download failing inside torch instead of with the
one-line reason the check already gives. All three paths now go through one
`InferenceService.verified`, and `inference/tests/test_checkpoint_paths.py` asks the whole source
whether any function loads a checkpoint without calling it first -- mutation-checked on both new
calls.

The second defect was worse for a user. Find Archetypes chose its model by POSITION: with none
named -- and the browser never names one -- it took the manifest's first entry whatever its
family, and the embedder loader refuses anything that is not an embedder. Every manifest listing
SAM first failed Find Archetypes on every call, and `manifest.example.json` did not list the
embedder at all. It is now found by family, refuses to guess between several, and says what to add
when there is none; the example lists it. Run end to end on 2026-09-23 against the real
MobileNetV3 weights with SAM listed first: the embedder verified, loaded, and returned 5 suggested
frames in 2 clusters. The inference README, which still called both job routes 501, was brought
up to date in the same change.

**SEC-16 is fixed, and the finding under it was bigger than the finding.** Legacy validates
neither `settings.json` nor `hotkeys.json`, and a file from releases 1.3.8 to 1.5.0 resets every
preference: those releases wrote `yolo_use_alias`, legacy's migration never learned it, and
`cls(**data)` refuses the whole file for one key -- reproduced 2026-09-23 with a file the 1.5.0
code itself wrote (width 1234 and gamma 1.4 load as 1600 and 1.0). The import here already kept
unknown keys, so preferences survived; `yolo_use_alias` is now dropped as the retired key it is,
rather than kept as one "a newer version might want".

But **nothing called the import.** `importLegacySettings` was written, tested against
legacy-written files, and reached by no production code, so a user moving from the desktop app
started from defaults -- while Phase 4 exit criterion 3 below read MET, because a test of the
function passed. The reach guard never saw it: it did not scan the settings package. It runs now,
once, at API startup, while the database holds no settings (`api/src/settings/legacyImport.ts`),
from legacy's own `~/.config/lazylabel` by default; a file that is not JSON is reported and not
replaced by defaults, so the one-time window stays open for the fixed file. Widening the reach
guard to the settings and contracts packages found it -- and one more, below.

The server half of SEC-16 was real too: `PUT /users/me/settings` stored a known key with the
wrong type (`gamma: "abc"` answered 200) and a `null` binding reached `findConflicts` and answered
500. Both are 422 now with the reason, through one `shapeProblems` shared with the import, and
unknown keys are still stored -- that is RULE-088's fix, not a shape problem. Every new behaviour
was mutation-checked.

**The audit of all seventeen findings is complete.** Held: SEC-01, 04, 05, 07, 09, 10, 13, 14.
Fixed: SEC-02, 03, 06, 08, 12, 16, 17, and SEC-11 for the new app's CI. Not applicable: SEC-15.
Not taken up: SEC-11's legacy half (`tests.yml`). The owner was asked on 2026-09-23 and chose only
the backup-ref cleanup, so the legacy workflow keeps its mutable action tags.

**What widening the reach guard found last: the hotkey EDITOR is not built.** `checkAssignment`
is RULE-049's per-keystroke check for a rebinding dialog, and nothing calls it because there is no
dialog -- the web app shows a read-only reference. The brief maps legacy's hotkey dialog to "web
settings and hotkey editor" (C13's interface), so this is unbuilt planned work, not a decision.

**Built the same day** (`web/src/hotkeys/HotkeyEditor.tsx`), in a modal because the editor needs
the width legacy's 800-pixel dialog gave it and the settings column is 254 pixels -- measured, after
the first version ran across the canvas. Legacy's behaviour is kept: click a key and press the new
one, Escape cancels, a modifier alone is not a binding, mouse actions cannot be rebound, and a key
another action holds is refused naming that action while the field reverts (RULE-049). Three
things differ on purpose: each accepted change saves at once, as the export formats do; an
alternate key can be cleared, which legacy's model allows and its dialog gave no way to do; and
the capture field is a text input, so pressing M to bind it does not also merge. Checked in the
browser against the real API: F9 saved and took effect, Ctrl+Z on Delete was refused naming Undo,
and closing returned focus to the button -- which it first did not, because making the page inert
blurred the opener before the dialog could record it. 22 tests; every behaviour mutation-checked.

**If more building is wanted before the data arrives,** the honest answer is that there is no named
work left: the rule lists, the settings table, the reach sweep and the hotkey reference are all
empty or recorded. The way more work has been FOUND, every time, is to take a list nobody has
audited and ask one question of all of it at once. The lists already asked: settings ("does
anything read this?"), exports ("does anything call this?"), hotkeys ("will this do something?"),
business rules by priority ("does any test name this?"), and the spec's failure modes ("does this
row do what it promises?"). Each found real defects. Unasked lists remain — the spec's
non-functional requirements and the assessment's security findings among them.

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

     **Operate On View is built** -- this paragraph said otherwise until 2026-09-23, long after
     it was. The embed request carries the view and the API renders it for the model. Until
     that day the view meant the display adjustments ALONE, which is where the paragraph's own
     warning came true: legacy's processing (rescale, thresholds, FFT) replaces the image its
     adjustments apply to, so it segments the processed picture, and a rescaled 16-bit image was
     segmented here unrescaled. See "Operate On View segmented a picture nobody could see".

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
   path of its own. C14 stayed pending in the capability table until one action applied to both:
   linked adds and linked erase have since done so, and the API's table reads `not-this-service`
   (2026-09-23), since each side saves through the ordinary per-image route.

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

   **Not linked, and named rather than implied:** the two sides SAVE separately, and deleting and
   merging act on one image. Adding links, and since 2026-09-23 so does erasing.

   **Linked erase, 2026-09-23.** This line used to say "a linked EDIT or DELETE is not built", and
   the READMEs repeated it as a gap against RULE-092. Reading legacy's source settled what the gap
   was: legacy mirrors ERASING -- Shift+Space finishes the polygon in both linked viewers in erase
   mode, and an AI mask accepted in erase mode is applied to both -- and does NOT mirror deleting
   or merging, which are buttons on each viewer acting on its own selection. So delete and merge
   were never a gap, and erase was. It links now, through the store's `eraseWith`, for the reason
   adding was cheap: every eraser, drawn or AI, reaches it as one segment. One undo entry across
   both images; refused beside the panes exactly where an added shape would be. Seven tests, the
   linking mutation-checked; web 1130 passed.

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

   **Phase 6 exit criterion 3 is MET.** "Multi-view is delivered, redesigned or removed per
   decision 8" -- delivered, rebuilt from RULE-092's rules rather than ported, with linked adds.

   **Exit criterion 1 is partly built, and the unblocked part is done.** Persona flow 2 is "carry
   labels through an image sequence", six steps. Steps 1 and 2 (build the timeline, mark
   references) were the pilot. Steps 3, 4 and 6 are propagation and wait on the inference service.
   **Step 5, tuning the confidence threshold from the histogram, needed no model** -- RULE-035's
   binning and RULE-060's flagging are arithmetic over `{frame: score}` -- and is built:
   `sequence/confidence.ts` with the panel in the timeline.

   RULE-035 to its worked example (50 bins, `max(0, min(threshold, lowest) - 0.02)` to 1.0,
   strictly-below counted as Below) and RULE-060's edges each pinned: the minimum over non-empty
   objects, an empty object dropped rather than counted as zero, a frame of all-empty objects
   reporting nothing rather than zero, strict `<` so exactly 0.99 is not flagged at the default,
   and the threshold held to four decimals so a float step cannot land just above it.

   **Another legacy defect designed out**, from its own card: changing Min Conf after propagation
   recomputes the flagged set Save All uses but NOT the timeline's statuses, so the user reviews
   the frames the colours point at and ships the ones the save skipped. One threshold, one
   derivation. A reference frame is never flagged however low its score.

   The panel is **reachable today** rather than waiting on the data: it renders with the timeline
   and says propagation has not run, which is what a user sees now, and the chart branch is
   exercised with real scores in tests rather than sitting on a shelf.

   **The harness has now been RUN**, on 2026-09-20, against a four-image folder:

```
frames: 1 identical, 0 differ, 0 need the converter, 0 unreadable, 3 without annotations
Every annotation file round-tripped identically.
```

That is not the acceptance corpus — criterion 4 needs the owner's real datasets and stays open —
but it moves the TOOL from written to working. It found the folder, classified every image,
round-tripped the one with annotations byte for byte, and wrote nothing into the dataset: the
files are the same sizes afterwards, which is the property it promises and the one that would be
expensive to be wrong about.

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
      **Met on 2026-09-23, on a synthetic clip, which is the owner's answer** in place of a
      recording: "just make some random shapes move around then use that clip series".
      `inference/tests/goldens/propagation/synthetic-shapes` holds legacy's sequence mode run
      headless under four scenarios. What it found, and the capture command, are under "What to
      do next". The capture script used to seed from clicked points, which neither app does; it
      drives legacy's own MainWindow methods now, seeded from masks the way both apps seed.
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
