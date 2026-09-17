# P1 rule coverage

`MODERNIZATION_BRIEF.md` §5 assigns 28 of its 36 P0 rules to Phase 1, and Phase 1's exit criterion 4
is "every section 5 rule assigned to P1 has a passing test". This table is the audit of that claim.

The bar used throughout: **a rule counts as covered only if some test would FAIL if that specific
behaviour broke.** A differential over the 12 golden cases covers many rules at once, but only the
behaviours those fixtures actually exercise — no fixture uses a class without an alias, so the
`str(class_id)` fallback was not covered by it, however many files it compares.

Where a card carries an **Answer (2026-09-17)** line, that corrected text is the specification used
here, not the older clauses above it on the same card.

## Status

| | Rules |
|---|---|
| Testable at this layer, covered | 21 of 21 |
| Belongs to a later phase (nothing to test here) | 4 |
| Belongs to a later phase, with a P1-observable slice covered here | 3 |
| Pending an implementation fix (test written and skipped) | 2 |
| Pending an owner decision (test written and skipped) | 1 |

## The 28 rules

| Rule | Name | Covering test | Note |
|---|---|---|---|
| RULE-001 | COCO JSON export structure and area | `format/allFormats.differential.test.ts` › *every text format matches the legacy bytes › COCO JSON › <12 cases>*; `format/coco.test.ts` › *names a class with no alias by its id…*, *splits an alias into name and supercategory at the last dot*, *splits a multi-dot alias at the last dot, not the first*, *uses the bounding-box product for a contour of fewer than three points*; `util/pythonParity.test.ts` › *serializes JSON exactly as json.dump with indent=2* | The golden differential proves the document byte for byte, but every fixture aliases every class and none uses dot notation, so the alias split, the `str(class_id)` fallback, the category for a class with no annotation and the `bw*bh` area fallback were added. |
| RULE-002 | CreateML export/import: pixel center boxes | `format/allFormats.differential.test.ts` › *CreateML › <12 cases>*; `format/createMl.test.ts` › *round trips the rule card's box…*, *round trips an odd-width box whose centre lands on a half pixel*, *rounds the corner first and then ADDS the size…*, *rounds each corner half to even* | Export was covered (`single-pixel-objects` gives the `.5` centre, `full-frame-box` the `32.0`). The whole reader was not: `x2 = x1 + round(w)` is not `round(cx + w/2)`, and the two differ by a pixel on any even-centred odd box. |
| RULE-003 | NPZ Class Map resolves overlaps to lowest class and stores foreground | `format/npzGolden.test.ts` › *class map for <12 cases>*; `format/npzClassMap.test.ts` › *refuses a class id past the 16-bit ceiling…*, *always writes the foreground member…*, *uses foreground to tell a class-0 label from background…*, *loses every class-0 label when the file predates the foreground member*, *refuses a class map whose shape does not match the image*, *hands an overlapped pixel to the first channel of the class order* | The card's answer corrects "ids above 65535 overflow" to "numpy raises"; no fixture goes near the ceiling, and the reader had no test. |
| RULE-004 | Pascal VOC uses alias names and exclusive max bounds | `format/allFormats.differential.test.ts` › *Pascal VOC › <12 cases>*; `format/pascalVoc.test.ts` › *writes the class id as the object name when the class has no alias*, *escapes the three characters ElementTree escapes…*, *reads xmax and ymax as exclusive…*, *loses a pixel on each axis when a devkit file uses an inclusive xmax* | The declaration, two-space indent, missing trailing newline, `depth 3` and the fixed pose/truncated/difficult are all inside the byte comparison. The label fallback and the reader were not. |
| RULE-005 | YOLO Detection export line format | `format/allFormats.differential.test.ts` › *YOLO Detection › <12 cases>*; `geometry/goldens.test.ts` › *writes the same boxes, in the same order, as image.txt*; `format/yoloSegmentation.render.test.ts` › *class ids are written verbatim* (4 tests), *line order follows instance then contour order* (3); `util/pythonParity.test.ts` › *formats floats exactly as Python's repr* | Already covered. Sparse ids, contour order, Python float repr and the `h <= 0` guard all have dedicated tests. |
| RULE-006 | YOLO Segmentation export polygon simplification | `format/allFormats.differential.test.ts` › *YOLO Segmentation › <12 cases>*; `format/yoloSegmentation.render.test.ts` › *drops a collinear point at epsilon 0.001 of the closed arc length*, *repeats a single-point contour four times*, *expands a two-point contour into a there-and-back ring*; `geometry/curves.test.ts` › *curves traced out of the mask corpus* | Already covered, including the OpenCV `approxPolyDP` corpus. |
| RULE-007 | Label text to class ID resolution on import | `format/yoloSegmentation.parse.test.ts` › *label text to class id* (9 tests); `format/yoloDetection.parse.test.ts` › *assigns ids over every parsed box, before the clamp drops any of them*, *lets an existing alias literally named 0 beat the integer reading of 0*, *gives every line with the same name one id*, *reads the label 07 as class 7…*; `format/pascalVoc.test.ts` › *defaults a missing coordinate to 0, which drops the object AFTER it has claimed an id* | Was covered for the polygon path only. The box path (VOC, CreateML, Detection) shares `buildLabelMap` but adds its own ordering hazard: ids are handed out before the clamp, so a dropped box still burns one. |
| RULE-008 | Detection and polygon exports keep same-class objects separate | `format/yoloSegmentation.render.test.ts` › *writes two lines for one segment that fell into two islands*, *keeps two touching same-class objects on separate lines*, *fuses touching same-class objects into one line* (the empty-instances fallback); `mask/tensorRules.test.ts` › *is omitted from the instance contours, so it writes no object* | Already covered; the mask-size-mismatch omission was the one clause without a test. |
| RULE-009 | Eraser splits segments and drops pieces of 10 pixels or less | **Phase 5** | Not testable here. The eraser, 8-connected component split and the >10 px threshold live in `SegmentManager.erase_segments`; this library has no editing surface at all (`TRANSFORMATION_NOTES.md`: "editing operations, undo and the class table stay with the workspace store"). Writing a test here would mean writing the eraser in the test. |
| RULE-010 | Final per-class mask composition | `mask/tensor.test.ts` › *matches the recorded legacy tensor for <12 cases>*, *skips a segment whose class is not in the class order*; `mask/tensorRules.test.ts` › *turns a box dragged from (10.7, 10.2)…*; **skipped:** `mask/tensorRules.test.ts` › *pending fix: refuses to compose a mask whose size is not the image size* | The union-per-channel clause was covered. The card's edge case "a stored mask whose size differs from the image raises; save fails and nothing is written" is **not reproduced** — see Implementation findings below. |
| RULE-011 | New segments take the active class, otherwise the next free class id | **Phase 4** | `SegmentManager.add_segment`, `assign_segments_to_class` and the cached `next_class_id` are the workspace store, not the format layer. The only part of this rule that reaches a file is the id itself, and that is proven by RULE-014's tests: sparse ids such as 3 and 7 are written verbatim and never renumbered. |
| RULE-012 | Pixel priority resolves overlapping classes | `format/allFormats.differential.test.ts` and `format/npzGolden.test.ts` over `overlap-pixel-priority-{off,ascending,descending}`; `mask/tensor.test.ts` › *keeps at most one class per pixel when priority is on*, *hands the overlap to the lowest class ascending and the highest descending*, *leaves a pixel claimed by a single class untouched*; `mask/tensorRules.test.ts` › *disappears from the detection exports under ascending priority*, *survives, and punches a hole in the lower class, under descending priority* | The fixtures overlap partially, so the card's sharpest edge case — an object entirely covered by a higher-priority class vanishing from YOLO/COCO/VOC/CreateML — had no test. |
| RULE-013 | Reassign class ids from class table order | **Phase 4** | `SegmentManager.reassign_class_ids` renumbers the store and rebuilds the alias table; nothing in this library renumbers anything. Its export-visible consequence is RULE-014, which is covered. |
| RULE-014 | Saved class channel order is ascending class ID | `mask/tensor.test.ts` › *matches the recorded legacy tensor for <12 cases>* (asserts `classOrder`); `format/npzGolden.test.ts` › *one-hot tensor for <12 cases>* (compares `class_order`); `format/yoloSegmentation.render.test.ts` › *writes the sparse ids 3 and 7, not 0 and 1*, *emits channels in ascending class id order*; `format/exportPolicy.test.ts` › *NPZ is the one format that still writes an all-zero tensor*; `mask/tensorRules.test.ts` › *writes that empty channel into the archive rather than dropping the class* | Ascending order was covered. The two edge cases about empty channels — a class with no pixels still gets one, and an image emptied by a crop is still written as NPZ — were not, and they are the ones that decide what a reload sees. |
| RULE-015 | Shape rasterization before export | `geometry/raster.test.ts` › *fillPoly*/*fillCircle* against the OpenCV corpus, *truncates fractional vertices toward zero…*; `mask/tensor.test.ts` › *rounds a circle radius half to even*, *truncates polygon vertices toward zero rather than rounding*, *returns null for a circle with a radius that rounds to zero*; `mask/tensorRules.test.ts` › *turns a box dragged from (10.7, 10.2) to (20.9, 30.8) into 231 pixels and a [10,10,11,21] box*, *turns a circle at (20.4, 20.6)…*, *rounds a circle CENTRE half to even, which no golden fixture exercises* | Vertex truncation and radius rounding were covered. Every fixture circle sits on a whole-pixel centre, so `Math.round` on the CENTRE would have passed the whole suite. |
| RULE-016 | Crop is clamped to the image and blanks everything outside it | `format/allFormats.differential.test.ts` and `format/npzGolden.test.ts` over `crop-clears-last-row-and-column`; `mask/tensor.test.ts` › *clears the image's last row and column on any crop*, *does not mutate the tensor it is given*; `format/yoloSegmentation.render.test.ts` › *keeps the full-image coordinate frame under a crop*; `mask/tensorRules.test.ts` › *empties the whole mask once clamping collapses the crop to zero width*, *keeps rows y1..y2-1 and columns x1..x2-1…*, *loses the last row and column even when the crop covers the whole image* | The off-by-one was covered. The degenerate crop that the card's answer calls out as reachable from a normal drag was not. The per-image scope half of this rule is Phase 4: this library takes the crop it is given. |
| RULE-037 | COCO JSON import with polygon-then-box fallback | `format/coco.test.ts` › *ignores an RLE segmentation and falls back to the box, clamped to the image*, *makes one segment per polygon, skips a polygon under six numbers and drops an odd trailing value*, *falls back to the box when the polygon rasterizes to nothing*, *drops an annotation whose polygon and box are both unusable*, *treats a missing category_id as class 0*, *returns only the names this file establishes…*, *names a category with no name by its id*, *refuses a document whose root is not an object*; **skipped:** *pending fix: skips an annotation whose category_id is not a number* | Had no test. The load-chain suite exercised the reader but asserted only that some segments came back. |
| RULE-038 | NPZ import (current and legacy layouts) | `util/npz.roundtrip.test.ts` › *round trips masks, class order and aliases*; `format/npz.parse.test.ts` › *maps each channel through class_order and skips an empty channel*, *falls back to the channel index when the file predates class_order*, *uses the channel index for channels past the end of a short class_order*, *reads a 2-D mask as a single channel*, *reads a masks key that holds the same (H, W, C) tensor*, *reads an (N, H, W) stack paired with class_ids…*, *gives a stack plane with no matching class id the class 0*, *prefers a mask key over a masks key when both are present*, *returns no segments, and does not raise, for an archive with neither mask nor masks* | Only the layout this library itself writes was covered. NPZ is first in the load priority, so a wrong channel-to-class mapping relabels a whole image silently. |
| RULE-039 | Pascal VOC and CreateML import rules | `format/pascalVoc.test.ts` › *reads xmax and ymax as exclusive…*, *defaults a missing coordinate to 0…*, *skips an object with no name and an object with no bndbox*, *reads an empty name as the label 0…*, *skips only the object whose coordinate will not parse*, *rejects the whole document on an infinite coordinate*, *rounds float coordinates half to even*, *ignores an `<object>` that is not a direct child of the root*, *refuses a file that is not XML…*; `format/createMl.test.ts` › *reads only the first image entry*, *loads nothing when the first entry has no annotations…*, *treats a missing label as '0'…*, *defaults a missing coordinate key to 0…*, *reads string coordinates through Python's float grammar*, *rejects the whole file on a nan coordinate*, *loads nothing from a root that is not a non-empty list of objects*; **skipped:** *pending decision: reads objects from a document whose root is not `<annotation>`* | Had no test. |
| RULE-040 | YOLO Detection import validation, rounding and clamping | `format/yoloDetection.parse.test.ts` — all 15 tests, notably *drops a box whose right edge is an exact tie that rounds down to the even pixel* (the card's 1024-wide example, where a half-up port keeps a box legacy discards entirely), *skips any line that does not have exactly five tokens*, *clamps a box that hangs off the top-left corner*, *drops a box with a negative width…*, *rejects the whole file on a nan coordinate…* | Had no test. |
| RULE-041 | YOLO Segmentation import validation | `format/yoloSegmentation.parse.test.ts` — *line validation* (8), *coordinate denormalization* (5), *unparseable numbers* (6), *label text to class id* (9), *encoding* (3) | Already covered, thoroughly, including the whole-file abort and the fillPoly union. |
| RULE-052 | Undo/redo history scope | **Phase 4 / Phase 5** | No undo stack exists here. `UndoRedoManager` is workspace state; the format library is a pure function of the segments it is handed. |
| RULE-053 | Undoing an erase inserts malformed segment records | `mask/tensorRules.test.ts` › *adds an empty channel to the NPZ and no line to the detection file*, *writes that empty channel into the archive rather than dropping the class* — and otherwise **Phase 5** | The undo mechanics belong to Phase 5. The clause that reaches a FILE — a malformed record introduces a class id and therefore an empty channel in every NPZ — is proven here. |
| RULE-078 | Annotations load from the best file present | `format/loadChain.test.ts` › *prefers formats in the documented order*, *takes NPZ when every format is present*, *falls to each next format as the better ones are removed*, *returns null when no annotation file exists*, *reports a damaged file instead of showing an empty canvas*, *keeps an empty but valid file as the winner*; `format/loadChain.rules.test.ts` › *lets an NPZ with no mask member hide a healthy YOLO Segmentation sidecar*, *lets a CreateML file whose root is not a list hide a YOLO Detection sidecar*, *reports an unreadable winner…*, *chooses by format rank alone, never by how much each file contains*, *counts a file's unreadable lines…*; `util/corruptArchive.test.ts` › *surfaces through the load chain with the format named* | Order and the damaged-file deviation were covered. The card's "stop-with-zero-and-no-error" cases — the three loaders that return normally with nothing — were not, and they are the ones that hide a healthy file. **Contract conflict, see below.** |
| RULE-079 | Export writes every selected format and never removes other files | `format/exportPolicy.test.ts` › *`<format>` returns null for a tensor with no set pixel* (5 writers), *NPZ Class Map returns null…*, *NPZ is the one format that still writes an all-zero tensor*, *both NPZ writers return null for a tensor with no channels at all*, *the YOLO writers refuse a non-positive image size…*, *exposes no deletion entry point at all*, *returns the file body, not the path it was written to* | Every golden case writes all seven files, so the differential's "legacy wrote nothing" branch never ran and six of the seven writers had no test of their `null` return — only `renderYoloSegmentation` did. Returning `""` instead would have passed the entire suite, and "write an empty file" differs from "write nothing" by an image's worth of annotations, because a stale sidecar is never deleted. Format SELECTION is the caller's, so it is Phase 2/4. |
| RULE-080 | Sidecar file naming and suffix collisions | `format/exportPolicy.test.ts` › *appends each format's suffix to the image base name*, *collides an image named foo_seg.png with foo.png's segmentation sidecar*, *gives foo.png and foo.jpg the same sidecar for every format*, *strips only the last extension, and keeps a leading dot*; `util/pythonParity.test.ts` › *strips extensions exactly as os.path.splitext* | Only `stripExtension` was covered; the suffix table itself, and the two documented collisions decision 15e deliberately keeps, had no test. The file-list classification half is Phase 4. |
| RULE-081 | Propagation never overwrites reference frames or, by default, labeled frames | `format/exportPolicy.test.ts` › *probes the same seven suffixes, in the same order, that decide whether an image is labelled* — and otherwise **Phase 6** | The propagation engine, the reference guard and the Skip Labeled toggle are Phase 6. The single piece this library owns is the table `find_annotation_file` walks: seven suffixes in `_LOAD_CHAIN` order, existence only. If that drifts, Phase 6 propagates over hand-made labels. |
| RULE-083 | Saving an image with no segments deletes all of its annotation files | `format/exportPolicy.test.ts` › *exposes no deletion entry point at all*, *`<format>` returns null for a tensor with no set pixel* — and otherwise **Phase 4** | Decision 7 settles that this behaviour is a **defect not to be reproduced**, so there is nothing to characterize here beyond the promise that this library deletes nothing. The save semantics that replace it — explicit save with dirty tracking — are Phase 4. |

## Skipped tests, and why

| Test | Reason |
|---|---|
| `format/coco.test.ts` › *pending fix: skips an annotation whose category_id is not a number* | Implementation gap, finding 1 below. |
| `mask/tensorRules.test.ts` › *pending fix: refuses to compose a mask whose size is not the image size* | Implementation gap, finding 2 below. |
| `format/pascalVoc.test.ts` › *pending decision: reads objects from a document whose root is not `<annotation>`* | Undocumented divergence, finding 3 below; needs an owner call, not a code change decided here. |
| `format/yoloSegmentation.parse.test.ts` › *pending API decision: does classAliases echo the aliases passed in?* | Pre-existing; settled in `src/types.ts` (readers return only what the file establishes) but left as a marker. |

## Implementation findings (reported, not fixed)

1. **COCO: a non-numeric `category_id` is loaded as class 0 instead of skipping the annotation.**
   `src/format/coco.ts:110` reads `asInt(annotation["category_id"]) ?? 0`. Legacy
   `int(ann.get("category_id", 0))` raises `ValueError` on `"dog"` and the `except (TypeError,
   ValueError)` at `file_manager.py:629-630` skips the whole annotation. Verified against the legacy
   loader: for a document with one `"dog"` annotation and one with no `category_id`, legacy loads
   **one** segment; this library loads **two**, the extra one attributed to class 0 — a class the
   user never drew, which then appears in the next export. RULE-037 states the intended behaviour
   explicitly ("non-numeric category_id skips the annotation").

2. **`createFinalMaskTensor` accepts a mask whose size is not the image size, and garbles it.**
   `src/mask/tensor.ts:59-63` walks `pixel < height * width` and reads `mask.data[pixel]`, so a
   5×5 mask on a 10×10 image folds its 25 values into the image's first 25 pixels: a 2×2 block at
   the origin becomes the four pixels (0,0), (0,1), (0,5) and (0,6). Legacy's
   `np.logical_or(final_mask_tensor[:, :, c], mask)` raises `ValueError: operands could not be
   broadcast together with shapes (10,10) (5,5)`, which the save path reports as "Error saving: …"
   and writes nothing (RULE-010's edge case). `createInstanceContours` already has the size guard,
   so the two halves of the same save disagree: the object is silently dropped from the detection
   formats and silently corrupted in the NPZ.

3. **Pascal VOC: a document rooted at anything other than `<annotation>` is refused, where legacy
   reads it.** `src/format/xml.ts:44-50` requires the root tag. Legacy calls
   `tree.getroot().findall("object")` without checking the tag (`file_manager.py:472`), so a
   third-party VOC file rooted differently loads its objects normally — verified: one 16 px segment
   with alias `{0: "a"}`. This is defensible hardening in the spirit of deviation 2, but it is not
   in `TRANSFORMATION_NOTES.md` and it changes what a real dataset loads. Either record it as a
   deviation or relax the check.

4. **COCO: a category whose `name` is explicitly `null` is named by its id, not `"None"`.**
   `String(category["name"] ?? id)` treats `null` as absent; Python's `str(cat.get("name", cat_id))`
   returns `"None"` because the key exists. Pathological input, one alias string, no pixels move.
   Listed for completeness.

## Contract conflict for the owner

RULE-078's **Answer (2026-09-17)** says the rewrite must "(a) continue the chain past any failed
load". Brief §7 decision **15c** says the opposite: "A file that fails to parse is reported and
stops the chain; the rewrite never falls through to a lower-priority file … a load is all-or-nothing
per format." `src/load/chain.ts` implements 15c, and the tests above pin 15c. Both documents are
dated 2026-09-17 and both are approved. The two agree on everything else, including that a failed
load must never present as "no annotations" and that nothing may be deleted on that path; they
disagree only on whether a lower-priority sidecar may answer for a damaged one. This needs one
sentence from the owner, and whichever way it goes, `format/loadChain.rules.test.ts` is where the
answer gets pinned.

## Adding a case

Same rule as the rest of the suite, restated because it is what makes this table mean anything:
**never paste a value produced by this TypeScript implementation into a test.** Get it from the
legacy code, either by reading it or by running it read-only:

```bash
PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
```

Then say in a comment which oracle you used and which legacy file and line it came from, add the
row here, and run both gates:

```bash
npx vitest run
npx tsc --noEmit
```
