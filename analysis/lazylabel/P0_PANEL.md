# P0 PANEL RECORD: `lazylabel`

Every card the extractors rated P0 was judged by two independent agents before it could enter the behavior contract (`legacy/lazylabel` at 2a7d5d8, 2026-09-15). Rule IDs refer to `analysis/lazylabel/BUSINESS_RULES.md`. A card folded into another card is listed under the ID it was folded into.

- **Compliance lens:** would a regulator, auditor, or finance controller care if this behavior changed silently?
- **Fidelity lens:** re-derive the behavior from the cited code independently. Does the Given/When/Then match what the code does, including rounding, ordering and edge cases?

Both judges answer two questions: is P0 justified (moves money, enforces a regulatory requirement, or guards data integrity), and is the specification faithful. The workflow keeps a card at P0 only when every returned verdict says P0 is justified. It lowers confidence to Medium when any verdict says the specification is unfaithful.

| Verdicts | Compliance judge | Fidelity judge |
|---|---|---|
| P0 yes | 34 | 71 |
| P0 no | 40 | 3 |
| faithful yes | 71 | 62 |
| faithful no | 3 | 12 |
| no verdict | 0 | 0 |

**Lens mismatch.** LazyLabel moves no money and carries no regulatory duty, so the compliance question rarely fits it. In 37 of 74 cards the compliance judge rated the card not P0 while the fidelity judge rated the same card P0 on data-integrity grounds, and the workflow demoted all of them. Whether annotation-data integrity alone makes a rule P0 is a decision for the approver, recorded as an open question in `MODERNIZATION_BRIEF.md`.

| Card | Kept as | Compliance judge | Fidelity judge | Workflow outcome | Card now |
|---|---|---|---|---|---|
| NPZ Class Map export resolves overlaps to lowest class and stores foreground | RULE-001 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| NPZ Class Map export/import with foreground mask (folded) | RULE-001 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| NPZ Class Map import requires matching size (folded) | RULE-001 | P0 yes, faithful yes | P0 yes, faithful no | kept P0; confidence Medium | P0, Medium |
| YOLO Detection export line format | RULE-002 | P0 yes, faithful yes | P0 yes, faithful no | kept P0; confidence Medium | P0, Medium |
| YOLO Detection export: normalized center/size box per object (folded) | RULE-002 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P0, Medium |
| Label text to class ID resolution on import | RULE-003 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| Label-to-class-id resolution for YOLO, VOC and CreateML labels (folded) | RULE-003 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| Detection and polygon exports keep same-class objects separate | RULE-004 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| One exported object per segment outline (instance separation) (folded) | RULE-004 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| Final per-class mask composition | RULE-005 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| Saved class channel order is ascending class ID, not the Class Order table | RULE-006 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| NPZ export content (folded) | RULE-006 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| NPZ one-hot mask export and class channel order (folded) | RULE-006 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| COCO JSON export structure and area | RULE-007 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| COCO JSON export: categories, bbox, area, polygon (folded) | RULE-007 | P0 no, faithful yes | P0 yes, faithful no | demoted to P1 | P1, Medium |
| CreateML export/import: pixel center boxes | RULE-008 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| CreateML export uses pixel center coordinates (folded) | RULE-008 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Pascal VOC export uses alias names and exclusive max bounds | RULE-009 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Pascal VOC export/import: 0-based exclusive max bounds, depth always 3 (folded) | RULE-009 | P0 no, faithful yes | P0 yes, faithful no | demoted to P1 | P1, Medium |
| YOLO Segmentation export polygon simplification | RULE-010 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| YOLO Segmentation export: simplified normalized polygons (folded) | RULE-010 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Erase subtracts pixels, splits remainders and drops tiny parts (folded) | RULE-011 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Merge selected segments into the smallest class (folded) | RULE-012 | P0 no, faithful yes | P0 no, faithful yes | demoted to P1 | P1, Medium |
| Class assignment for new segments and next class ID (folded) | RULE-013 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Class id assignment for new segments (folded) | RULE-013 | P0 no, faithful yes | P0 no, faithful yes | demoted to P1 | P1, Medium |
| Pixel priority resolves overlapping classes | RULE-014 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Pixel priority for overlapping classes (folded) | RULE-014 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Reassign class IDs from Class Order table (folded) | RULE-015 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Shape rasterization before export (truncated vertices, rounded circles) | RULE-016 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| SAM 2 propagation confidence score (folded) | RULE-017 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| SAM 2 frame staging numbering gap | RULE-018 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Only mask-based segments seed propagation (folded) | RULE-022 | P0 no, faithful yes | P0 no, faithful yes | demoted to P1 | P1, Medium |
| Crop is clamped to the image and blanks everything outside it on save, including the last row and column | RULE-023 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Crop removes annotations outside the rectangle but keeps full-image coordinates (folded) | RULE-023 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Crop zeroes saved annotations outside the crop (last row and column always lost) (folded) | RULE-023 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| NPZ import (current and legacy layouts) | RULE-037 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| NPZ import: class_order mapping and legacy layouts (folded) | RULE-037 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| COCO JSON import with polygon-then-box fallback | RULE-038 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| COCO JSON import: categories to aliases, polygon then bbox fallback (folded) | RULE-038 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Pascal VOC and CreateML import rules | RULE-039 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| YOLO Detection import validation, rounding and clamping | RULE-040 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| YOLO Detection import: denormalize, round half-to-even, clamp (folded) | RULE-040 | P0 no, faithful yes | P0 yes, faithful no | demoted to P1 | P1, Medium |
| YOLO Segmentation import validation | RULE-041 | P0 no, faithful yes | P0 yes, faithful no | demoted to P1 | P1, Medium |
| YOLO Segmentation import: polygon rasterization (folded) | RULE-041 | P0 no, faithful yes | P0 yes, faithful no | demoted to P1 | P1, Medium |
| Leaving a sequence frame saves it and marks it Saved, even if it is a reference | RULE-052 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| Sequence frame auto-save when changing frames (folded) | RULE-052 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P0, Medium |
| Multi-view batch navigation always saves, ignoring the Auto-Save setting | RULE-053 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| Multi-view pair navigation always saves or deletes both images (folded) | RULE-053 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| Propagation finish, Save All and Trim reload the current frame without saving it | RULE-054 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| Auto-save current image before switching images (single view) | RULE-055 | P0 yes, faithful yes | P0 yes, faithful no | kept P0; confidence Medium | P0, Medium |
| Auto-save on navigate (folded) | RULE-055 | P0 yes, faithful no | P0 yes, faithful no | kept P0; confidence Medium | P0, Medium |
| Opening another image auto-saves the current one first (folded) | RULE-055 | P0 yes, faithful no | P0 yes, faithful yes | kept P0; confidence Medium | P0, Medium |
| Propagated frame flagging and commit (Keep Flagged Masks) | RULE-056 | P0 yes, faithful yes | P0 yes, faithful no | kept P0; confidence Medium | P0, Medium |
| A propagated frame is Flagged when its weakest object scores below Min Conf (folded) | RULE-056 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P0, Medium |
| Undo history is unbounded, per image, and does not cover deletes or class changes (folded) | RULE-057 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Undoing an erase inserts malformed segment records | RULE-058 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Undo of an erase adds a phantom segment instead of restoring (folded) | RULE-058 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Undoing an erase does not restore the erased shapes (folded) | RULE-058 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Closing the application never saves the open image's annotations | RULE-063 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Leaving the Sequence tab or clicking New Timeline discards all sequence work without saving | RULE-064 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |
| Annotations load from the best file present, and a damaged non-NPZ file stops the search | RULE-078 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| A damaged or empty higher-priority file blocks lower-priority files (folded) | RULE-078 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| Annotation load priority chain (folded) | RULE-078 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| Annotation load priority chain (one format wins) (folded) | RULE-078 | P0 yes, faithful yes | P0 yes, faithful no | kept P0; confidence Medium | P0, Medium |
| Export writes every selected format and never removes other files | RULE-079 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, High |
| Propagation never overwrites reference frames and, by default, frames already labeled | RULE-080 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| Skip Labeled protects frames that already have annotations (folded) | RULE-080 | P0 yes, faithful yes | P0 yes, faithful no | kept P0; confidence Medium | P0, Medium |
| Save All propagated frames eligibility | RULE-081 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| Save All writes propagated frames except those the engine currently flags (folded) | RULE-081 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P0, Medium |
| Save All writes propagated, non-flagged frames (folded) | RULE-081 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| Saving an image with no segments deletes all of its annotation files | RULE-082 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| Saving an image with zero segments deletes all of its annotation files (folded) | RULE-082 | P0 yes, faithful yes | P0 yes, faithful yes | kept P0 | P0, Medium |
| Saving an image with zero segments deletes all sidecar files (folded) | RULE-082 | P0 yes, faithful no | P0 yes, faithful yes | kept P0; confidence Medium | P0, Medium |
| Sidecar file naming and suffix collisions | RULE-084 | P0 no, faithful yes | P0 yes, faithful yes | demoted to P1 | P1, Medium |

## Judges' reasoning

### RULE-001: NPZ Class Map export resolves overlaps to lowest class and stores foreground

**Compliance judge:** P0 yes, faithful yes

> FAITHFUL. I ran the rule's example through E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz_class_map.py:66-72 using class_order [2,7].
> - Pixel A has channels [0,1]. argmax picks channel 1, which maps to class 7.
> - Pixel B has [1,1]. argmax returns the first maximum, channel 0, which maps to class 2.
> - Pixel C has [0,0]. It is not active, so it keeps the 0 from np.zeros.
> - The foreground mask (line 33) is true where any channel is set: A true, B true, C false.
> - The file path is the image path without its extension plus "_CM.npz" (line 47). The dtype is uint16 (lines 67, 71).
>
> Limiting the example to "Pixel Priority off" is correct. With descending priority (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:356-361), pixel B would get class 7. Ascending priority gives the same result as off.
>
> One caveat: the exporter only knows channel numbers. "Lowest channel = lowest class ID" holds because every live caller passes the sorted list from get_unique_class_ids():
> - segment_manager.py:87-95 (does the sort)
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400 and :494
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6602
>
> SaveWorker accepts any class_order, but I found no place that creates one. The rewrite must keep this sort.
>
> P0, COMPLIANCE VIEW. No money moves and no regulation is enforced, so a regulator or finance controller would not care. P0 stands only because the rule guards data integrity, and on that basis it is strong. This rule defines the saved label file, which is the tool's main output.
> 1. The foreground mask (lines 33, 40) is needed on reload. The loader uses it to tell class 0 apart from background (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:303-307, 320-321). Class IDs start at 0 by default (segment_manager.py:24, 824). If a rewrite drops this mask, the default class's labels silently disappear on reload whenever the load order picks _CM.npz (file_manager.py:128-136).
> 2. The overlap tie-break decides which label gets saved. A simple port that loops over channels and overwrites would make the highest class ID win, with no error.
>
> Existing tests already cover both:
> - E:\\GitHub\\LazyLabel\\tests\\unit\\core\\exporters\\test_exporters.py:250-271
> - E:\\GitHub\\LazyLabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:566-578
>
> Checking this takes one reference file. Missing it means datasets get corrupted without any error. Tag it as data integrity, not as regulatory.
>
> GAPS TO ADD TO THE CARD (not errors):
> (a) The exporter writes nothing when the mask is empty or all zeros (lines 21-26), and export_all never deletes files (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:189-206). Files are deleted only when there are no segments at all (save_export_manager.py:107-109). So if segments exist but a crop blanks all their pixels (file_manager.py:712-737, applied at save_export_manager.py:412-417), an old _CM.npz with old labels stays on disk and can be reloaded. An SME should confirm whether that is intended.
> (b) The file also stores class_order and class_aliases (lines 41-42). Loading the file depends on them.
> (c) Class IDs above 65535 cannot be stored (line 71). With numpy\>=2.1.2 (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\pyproject.toml:23) this should raise an error rather than wrap around. State the limit explicitly.
>
> No injection suspects: lines 20-73 contain only normal developer comments, no text aimed at AI tools, and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> The rule is faithful and P0 is justified. Its Given/When/Then matches the code exactly, but a few edge cases are left out and should be added before it becomes the equivalence contract.
>
> How the code works (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz_class_map.py:20-73):
> - Each class has its own channel holding only 0 or 1, built with logical OR at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:242-244.
> - np.argmax picks the first highest value, which is the lowest channel (line 70).
> - A lookup table turns the channel number into the class ID from class_order, stored as uint16 (lines 71-72).
> - Pixels with no active class stay 0 (lines 67-68).
> - foreground is true wherever any channel is above 0 (line 33).
> - The file path is the image path without its extension plus "_CM.npz" (line 47).
> I copied these lines into an in-memory check (no project import, no files written) under the installed NumPy 2.2.6. With class_order [2,7] it gives class_map [7,2,0] and foreground [True,True,False], exactly what the rule says. The test at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_exporters.py:250-271 checks the same overlap behavior.
>
> Why "lowest class ID" is correct: the exporter picks by channel position, not by ID. The two only match because every live caller passes get_unique_class_ids(), which is sorted ascending (segment_manager.py:87-95). The callers are E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400 and :494, and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6602. An unsorted order [7,2] would give pixel B = 7 (confirmed in memory). SaveWorker (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:28-87) takes an order from its caller, but nothing in src creates one.
>
> Why P0 is justified (data integrity):
> - This rule decides the saved label of every overlapping pixel in exported training data.
> - The foreground key is really used, not just described in a comment. The loader reads it at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:303-307 and 320-331.
> - Without that key, the loader treats every 0 in class_map as background, so all class-0 annotations disappear on reload. The test at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:566-578 guards this.
> - A rewrite that changes which class wins an overlap, or drops foreground, would silently corrupt labels.
>
> Gaps to add (missing cases, not errors):
> 1. Pixel Priority: turned on with ascending order, B is still 2. Turned on with descending order, overlaps are resolved before export (segment_manager.py:356-371), so B = 7.
> 2. No file when nothing is labelled: the exporter returns without writing if the mask is empty or has no active pixel (lines 21-26). export_all never deletes files (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:189-206). Files are only deleted when there are zero segments (save_export_manager.py:107-109). So if segments exist but a crop removes every labelled pixel (save_export_manager.py:413-417), an old _CM.npz from an earlier save stays on disk and is loaded next time.
> 3. The uint16 limit fails hard, it does not wrap: class IDs above 65535 or below 0 raise OverflowError under NumPy 2.x (pyproject requires numpy\>=2.1.2), and the save fails (confirmed in memory). This can really happen, because COCO loading takes category_id with a plain int() and no range check (file_manager.py:643, 677, 706).
> 4. Extra keys in the file: it also stores class_order and class_aliases (lines 41-42). class_aliases is a Python dict saved as a pickled object, so reading it needs allow_pickle. A non-Python rewrite must produce this for the files to stay compatible.
> 5. Minor: test_exporters.py:137 treats NPZ_CLASS_MAP as write-only, but a loader exists (file_manager.py:282). That test assumption is out of date.
>
> The cited lines contain no text trying to instruct an AI tool and no credentials.

### RULE-001: NPZ Class Map export/import with foreground mask (folded card)

**Compliance judge:** P0 yes, faithful yes

> VERDICT: P0 is justified, but only because this rule protects the saved annotation data from silent corruption or loss (data integrity). It does not move money and does not enforce any regulation. The card is faithful: every claim it makes matches the code. It does leave out behavior that the equivalence contract needs to state explicitly.
>
> WHY P0 (COMPLIANCE LENS)
> - A finance controller or regulator would not care. Nothing here moves money, and no code enforces a rule from a regulator.
> - An auditor checking how a training dataset was built would care. This file format is the saved label data that outside training pipelines read. If the tie-break, the class-0 handling, the dtype or the shape check changed silently, labels would change or disappear with no error.
> - The reload path also feeds the auto-save that deletes files when nothing loaded (gap 2), so the rule sits right next to real data loss.
> - Keep it as P0, tagged "data integrity", not "regulatory".
>
> WHAT I CONFIRMED
> - The map is uint16 with 0 as background. Overlaps go to the first channel via argmax, and a boolean foreground mask is saved under the suffix `_CM.npz` (npz_class_map.py:33, 37-43, 47, 67-72).
> - An empty or all-zero tensor returns None and writes no file (npz_class_map.py:21-26).
> - Reload creates one segment per class id found under the foreground mask (file_manager.py:320-331).
> - A file without `foreground` treats 0 as background (file_manager.py:303-307).
> - A map whose shape differs from the image is logged and nothing is loaded (file_manager.py:313-318).
> - I ran the exporter's lookup logic in memory with NumPy 2.2.6. With class ids [0, 2, 7], the overlap pixel became 2, and the class-0 pixel became 0 with foreground True.
> - Existing tests: test_exporters.py:250-271 (overlap tie-break), test_bbox_roundtrip.py:566-578 (class 0 survives reload) and :580-589 (shape mismatch).
>
> GAPS THE CONTRACT MUST ADD
> 1. **"Lowest class id" really means "lowest channel index".**
>    - The two are the same only because every live caller passes the class ids sorted ascending (segment_manager.py:87-95, used at save_export_manager.py:400 and :494 and main_window.py:6602).
>    - SaveWorker, which would accept any order, is never constructed.
>    - With Pixel Priority on and set to descending, the highest id wins instead (segment_manager.py:356-361). The card's plain-English line states the rule without these conditions.
> 2. **A rejected file has side effects and stops the fallback chain. This is a data-loss defect.**
>    - Aliases are restored at file_manager.py:308, before the shape check at :313, so a rejected file still replaces `class_aliases`.
>    - A shape mismatch, a missing `class_map` key (:298-300) and OSError/ValueError (:309-311) all return normally rather than raising. `load_existing_mask` then stops at :205 and never tries the lower-priority `.xml`, `_createml.json` or `.txt` files. The docstring at :161-163 and CHANGELOG.md:24 both say the chain continues.
>    - Auto-save on navigate is on by default (settings_widget.py:43; file_navigation_manager.py:157-160 and 271-274). It sees an empty segment list at save_export_manager.py:107-108 and calls `delete_all_outputs`, which deletes every annotation file for the image, including healthy ground truth. Multi-view does the same at main_window.py:6589-6590.
>    - This is the failure CHANGELOG.md:12 describes as fixed, and it can still happen through this loader. Record it as a known defect; do not certify equivalence to it.
> 3. **Class ids outside 0..65535 break the export.**
>    - Ids come straight from loaded files with no range check (file_manager.py:366 `int(label)`, :643 `category_id`).
>    - With numpy\>=2.1.2 (pyproject.toml:23), I confirmed that out-of-range ids raise OverflowError at npz_class_map.py:71.
>    - `export_all` (exporters/__init__.py:198-206) does not catch it. Any formats after the class map in set iteration order are skipped, and that order changes between runs.
>    - The parameter list should state the valid range and this failure behavior.
> 4. **"No file" means no file is written, not that none exists.** `export_all` never deletes. If segments exist but crop or pixel priority leaves no labeled pixels, an old `_CM.npz` stays on disk. The emptiness check runs after the crop is applied (save_export_manager.py:413-417).
> 5. **Reload loses overlap data.** The losing class loses its overlap pixels, and a class fully covered by a lower id disappears. Reload only reaches this format when no `.npz`, `_seg.txt` or `_coco.json` exists for the image (file_manager.py:128-136).
>
> OTHER
> - Security note (not a business rule): file_manager.py:297 opens the file with `allow_pickle=True` to read the `class_aliases` dict written at npz_class_map.py:42. A crafted `_CM.npz` can therefore run code when opened.
> - test_exporters.py:135-140 still calls NPZ_CLASS_MAP write-only, which is out of date. No tests cover the no-foreground fallback, the chain stopping on rejection, or out-of-range ids.
> - The cited lines contain no text aimed at manipulating automated analysis, and no credentials.
>
> FILES
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz_class_map.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\settings_widget.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\pyproject.toml
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\CHANGELOG.md
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_exporters.py
> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py

**Fidelity judge:** P0 yes, faithful yes

> Verdict: P0 justified, G/W/T faithful. Five gaps need adding before this is used as a contract.
>
> P0: The rule defines what the saved label file contains: a class id per pixel, which class wins an overlap, and the 'foreground' key that keeps class-0 labels from being lost. It also guards against loading a map that does not fit the image (the shape check). A rewrite that changes the tie-break or drops 'foreground' would silently corrupt training labels, so this is a data-integrity rule.
>
> Independent trace of the scenario:
> - Export side (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz_class_map.py):
>   - Every live caller builds class_order from get_unique_class_ids(), which is sorted ascending (segment_manager.py:87-95; save_export_manager.py:400 and :494; main_window.py:6602). SaveWorker takes an order from its caller but is never instantiated. So classes [0,2,7] become channels 0,1,2.
>   - The mask tensor holds only 0/1 values (segment_manager.py:223, 241-244). With pixel priority off, overlaps reach the exporter intact.
>   - At the overlap pixel, argmax picks channel 1 and the uint16 lookup gives 2 (lines 66-73). The class-0 pixel gets 0, and foreground is True there (line 33).
>   - An empty or all-zero tensor returns None and writes nothing (lines 21-26). Suffix '_CM.npz' (line 47) and uint16 (lines 67, 71) match.
> - Load side (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py):
>   - A file without 'foreground' falls back to class_map != 0 (lines 303-307).
>   - A shape mismatch logs an error and adds no segments (lines 313-318).
>   - One segment is added per id in np.unique(class_map[foreground]), in ascending order (lines 320-331).
> - Every stated clause matches, and there is no rounding involved.
>
> Gaps to add:
> 1. How the tie-break works: the exporter picks the first entry in class_order, not the smallest id. 'Lowest id wins' is only true because callers sort the list. The rewrite must keep that sort, or state the rule as 'first active channel' (argmax only means that because the tensor is 0/1).
> 2. Rejection has side effects:
>    - _restore_aliases runs at line 308, before the shape check at 313. A rejected file still replaces the session's class_aliases.
>    - The loader returns normally, so load_existing_mask stops at line 205 and never tries Pascal VOC, CreateML or YOLO detection. Its own docstring (lines 161-163) says it moves on to the next format.
>    - The chain also stops this way for a missing class_map key (298-300) and for OSError/ValueError caught at 309-311.
> 3. Missing condition for 'reloaded': the load chain checks .npz, _seg.txt and _coco.json before _CM.npz (lines 128-136), and export_all never deletes files (exporters/__init__.py:189-206). If an old .npz exists from the default formats (NPZ + YOLO_DETECTION), that file is loaded instead of the class map.
> 4. 'No file' only means nothing new is written. An old _CM.npz is deleted only when there are no segments at all (save_export_manager.py:107-109; main_window.py:6589-6594). If segments exist but the tensor is all zero (for example, all cropped out), the old file stays on disk.
> 5. The example's reload loses data, and the rule does not say so. The reloaded class-7 segment no longer includes the overlap pixel. If class 7 has no other pixels, it disappears completely.
>
> Other edges:
> - Numpy is pinned \>=2.1.2. Class ids below 0 or above 65535 (possible through COCO category_id or YOLO integer-label imports) make np.array(class_order, dtype=uint16) raise OverflowError, and the export fails.
> - The shape check only runs when image_size is passed. The load chain always passes it, or gives up at lines 178-185.
>
> Injection suspects: none in the cited lines. Credentials: none.

### RULE-001: NPZ Class Map import requires matching size (folded card)

**Compliance judge:** P0 yes, faithful yes

> P0 is justified, but only because the rule protects data. Nothing here moves money, and no rule or regulation applies to this image-labelling tool. No finance controller or regulator would care. Someone auditing a training dataset would, because a silent change here destroys saved labels.
>
> WHY IT IS P0 (data integrity):
> - The foreground key is the only way class-0 labels come back when a file is reopened (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/core/file_manager.py:303-307). The exporter writes that key for this reason (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:30-33).
> - The size check (file_manager.py:313-318) stops masks being attached to an image of a different size.
> - What this loader produces decides what happens to the files on disk. Auto-save on navigate is on by default (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/config/settings.py:45; triggered at E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:156-160 and 270-274). If an image ends up with no segments, saving deletes every annotation file for it (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:106-109, then E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:209-215).
> - Example: if a rewrite always treated 0 as background, an image labelled only with class 0 would open empty. Moving to the next image would then delete all its annotation files.
> - Existing tests lock in both behaviours: E:/GitHub/LazyLabel/legacy/lazylabel/tests/unit/core/exporters/test_bbox_roundtrip.py:566-589.
>
> WHY IT IS FAITHFUL: I checked the core claims against lines 296-331 and they hold. The file must have a class_map key (else nothing loads). Its height and width must match the image (checked only when a size is passed, and the normal load path always passes one, file_manager.py:178-191). Each distinct class value on foreground pixels becomes one segment (lines 320-331). Without a foreground key, 0 means background. Using the Given/When/Then's 480x640 map with values 0 and 4, where the foreground covers the 4-pixels and some 0-pixels, the code does return a class 0 segment and a class 4 segment.
>
> GAPS TO FIX BEFORE THIS BECOMES A TEST:
> 1. The Given must say the foreground mask also covers the value-4 pixels. Read literally, it only covers some zeros. With that setup, line 320 drops the class-4 pixels and the Then fails.
> 2. The card is titled for the size check, but no scenario tests a mismatch. Add one: a 50x50 image gives zero segments and a logged error.
>    - The method returns normally in that case, so the loader (file_manager.py:187-205) stops there. The lower-priority files (.xml, _createml.json, .txt) are never tried.
>    - The same happens when class_map is missing, and on OSError/ValueError, which are caught inside (lines 309-311).
>    - This contradicts the loader's docstring at file_manager.py:161-163, which says the loader moves on to the next format when a file can't be read. That claim is only in a comment; the code doesn't do it for these cases.
> 3. Class names are restored at line 308, before the size check. A rejected file still replaces the image's class names.
> 4. The check compares only the first two dimensions and never checks the foreground array's shape. A wrongly sized foreground raises an error outside the try block, and in that case the loader does move on to the next format.
> 5. Add a precondition: _CM.npz is only read when no img.npz, _seg.txt or _coco.json exists (file_manager.py:128-136).
>
> Parameters: "(none)" is acceptable. The background value 0, the key names and the _CM.npz suffix are fixed file-format constants.
>
> SME QUESTION: When a class map is rejected for a size mismatch, should the next auto-save still delete it and every other annotation file for that image, as it does today? And should the loader fall back to the lower-priority files instead of stopping?
>
> No instruction-like text or credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful no

> Verdict: P0 is justified, but the Given/When/Then does not match the code. The plain-English line is broadly right; the scenario is wrong.
>
> Why P0 holds (data integrity): the loader refuses a class map whose size differs from the image, so misaligned masks never get in and saved back. The foreground key keeps class-0 labels from being lost on reload (the fix in CHANGELOG.md:16). A rejected file also leaves the image with zero segments, and saving with zero segments deletes every annotation file for the image (save_export_manager.py:106-109, main_window.py:6589-6590).
>
> What the code does (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:282-333):
> - Opens the file with np.load(allow_pickle=True). OSError or ValueError is logged and the function returns.
> - No class_map key: logs and returns before class aliases are restored.
> - Foreground is the foreground key if present, otherwise class_map != 0 (303-307). The key replaces the != 0 test; it is not combined with it.
> - Class aliases are restored (308) before the size check.
> - If image_size is given and class_map.shape[:2] differs from (H, W): logs and returns with no segments (313-318).
> - Otherwise it adds one segment per value in np.unique(class_map[foreground]), in ascending class-id order, each masked by foreground AND class_map == id, with class_id = int(id) (320-331).
>
> Problems with the card:
> 1. It gets the foreground key wrong. Read literally, the Given says the key marks only some 0-valued pixels. Then np.unique(class_map[foreground]) is [0], so the code makes one class-0 segment and no class-4 segment. Class 4 appears only if the key also covers the 4-valued pixels. LazyLabel's own exporter always writes it that way (exporters/npz_class_map.py:33), but the card never says so. Class-4 pixels outside the key are dropped, which the card also omits. A rewrite that combined the key with != 0 would pass this scenario while behaving differently from the legacy code.
> 2. The rule is titled 'requires matching size', but no scenario covers a size mismatch. The card leaves out what happens then:
>    - (a) aliases from the rejected file still overwrite segment_manager.class_aliases, because 308 runs before 313;
>    - (b) the function returns without raising, so load_existing_mask stops at 205 and never tries the lower-priority formats (.xml, _createml.json, .txt). That contradicts its own docstring (160-163) and CHANGELOG.md:24, and the resulting empty segment list can lead to file deletion on the next save;
>    - a missing class_map key also stops the chain.
> 3. Smaller gaps:
>    - Only the first two dimensions are compared. The foreground key's shape is never checked; a wrong-sized key raises IndexError at 320, outside the try, so load_existing_mask moves on to the next format after the aliases were already changed.
>    - The check is skipped when image_size is None. That cannot happen in production, because load_existing_mask always resolves the size first (178-185).
>    - The segment order and int() truncation of non-integer class values are not stated.
>
> Suggested replacement scenarios (image 480 H x 640 W, class_map shape (480, 640), value 4 at rows 0-9, cols 0-9, 0 elsewhere):
> - A: foreground True at rows 0-9, cols 0-19. Result: class 0 with 100 px (cols 10-19), then class 4 with 100 px.
> - A2: foreground True only at rows 0-9, cols 10-19. Result: only the class-0 segment; the 4-valued pixels are dropped.
> - B: no foreground key. Result: only class 4 (100 px).
> - C: class_map shape (640, 480), class_aliases {4:'dog'}, and a valid img.xml next to it. Result: 0 segments, an error logged, class_aliases == {4:'dog'}, and img.xml is not loaded.
>
> Also: allow_pickle=True at 297 is used on files the app did not write (a security note). I found no instruction-like text in the cited lines.

### RULE-002: YOLO Detection export line format

**Compliance judge:** P0 yes, faithful yes

> COMPLIANCE LENS: No regulator, auditor or finance controller would care if this changed. LazyLabel is a desktop image-labelling tool. This rule moves no money, produces no audit or financial record, and follows no regulation. The YOLO .txt layout is a common machine-learning convention, not a legal standard. So P0 cannot rest on money or regulation.
>
> P0 STILL HOLDS, BUT ONLY ON DATA INTEGRITY. This is the on-disk layout for one of the two formats saved by default (DEFAULT_EXPORT_FORMATS = {NPZ, YOLO_DETECTION}, E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:60-63). The app also reads the same file back ('.txt' in _LOAD_CHAIN, then load_bb_txt, in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136 and 412-454). A test checks that class IDs survive the round trip (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:513-523). A silent change would corrupt users' training labels and their own reloads without any error. Examples: renumbering classes 0..N-1, dividing x by height, writing the top-left corner instead of the center, or shifting pixel edges by one. The equivalence check should compare meaning, not bytes: same class IDs, same number and order of lines, floats within a tolerance.
>
> FAITHFUL: Yes. I read E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:19-46:
> - Line 27 uses cv2.boundingRect, which counts pixels inclusively.
> - Lines 29-32 compute center and size over image width and height.
> - Line 33 writes floats unrounded.
> - Line 46 names the file \<base\>.txt.
> - class_order is the sorted list of original class IDs (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:87-95), so class_order[channel] writes the original ID.
>
> I checked the card's example in memory: a 640 wide by 480 high mask, pixels x 100-109 and y 50-59, class_order [3]. It gave the box (100,50,10,10) and the line '3 0.1640625 0.11458333333333333 0.015625 0.020833333333333332', which matches the card.
>
> GAPS TO ADD TO THE CONTRACT (the card is not wrong, but it leaves these out):
> (1) 'One line per object' is really one line per separate region. An object made of two disconnected blobs wrote 2 lines in my check. If no per-object data is passed, touching objects of the same class merge into one box (__init__.py:122-136).
> (2) The box is measured after crop and pixel priority are applied (segment_manager.py:294-299; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:412-417). Coordinates are still divided by the full image size.
> (3) Nothing is written when width or height is 0 or less (lines 21-22) or when there are no objects (lines 35-36). An existing .txt is not deleted in that case (test_bbox_roundtrip.py:438-452).
> (4) Lines follow segment order and each ends with a newline. Python's text mode writes that as CRLF on Windows.
> (5) Python writes floats below 1e-4 in scientific notation ('5e-05'). JavaScript only does that below 1e-6, so a byte-for-byte golden-file test would fail.
> (6) An unused copy, FileManager.save_bb_txt (file_manager.py:74-123), writes the class name instead of the class ID. Only tests call it, so the rewrite must not port it as the reference.
>
> No instruction-like text or credentials in the cited or related code.

**Fidelity judge:** P0 yes, faithful no

> Verdict: the core math and the worked example are correct, but the card is not accurate enough to be a P0 behavior contract. It needs changes, not a rewrite.
>
> Confirmed correct (re-derived from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:20-33 and checked in memory with cv2):
> (a) The box comes from cv2.boundingRect, and its width/height include both edge pixels. Pixels 100..109 give x=100, bw=10.
> (b) cx=(x+bw/2)/w, cy=(y+bh/2)/h, nw=bw/w, nh=bh/h. X values are divided by width, y values by height. image_size is (pixmap.height(), pixmap.width()) (save_export_manager.py:397,421).
> (c) The class token is class_order[channel], which is the original class ID. class_order is the sorted unique IDs and channel is the position in that list (segment_manager.py:87-95, 276-283).
> (d) The output path is splitext(image_path)[0]+'.txt' (line 46).
> The example is right. The exact line is '3 0.1640625 0.11458333333333333 0.015625 0.020833333333333332'.
>
> Fidelity defects:
> 1. Wrong granularity (material). The code does not write one line per object. It writes one line per outer contour, i.e. per connected blob of each segment's visible pixels. iter_object_contours yields every contour of each record (exporters/__init__.py:122-125). create_instance_contours uses findContours RETR_EXTERNAL (segment_manager.py:303-311). A segment with two separate islands produces two lines with two separate boxes (checked: rects (300,100,40,20) and (10,10,10,10)), not one box around all its pixels. This happens in real use:
>    - Reloading an NPZ creates one whole-class mask segment per class (file_manager.py:254-266).
>    - Sequence mode merges segments by class (main_window.py:3603, 3612).
>    - Saving either as YOLO Detection gives one box per blob.
>    The 'one line per object' wording appears only in the docstring (yolo_detection.py:16), not in the code. The card's Given ('pixels span x 100-109, y 50-59') only holds if those pixels form one connected blob.
> 2. The box uses only the pixels left after crop and pixel priority. Each segment mask is ANDed with the final tensor channel (segment_manager.py:297-299; crop zeroing at file_manager.py:712-739). So a crop or a higher-priority class can shrink a box or split it into several lines.
> 3. Number formatting. 'Unrounded / full precision' really means Python's shortest round-trip str(float). Values below 1e-4 print in scientific notation: a 1-px box at x=0 on an 8192-px-wide image writes cx as '6.103515625e-05'. A box as wide or tall as the image writes '1.0', not '1'. A JavaScript rewrite would produce different bytes in both cases. The example's shortened digits ('0.114583...', '0.020833...') must be the exact strings above.
> 4. Line order is not stated. Lines follow the order of the segment list (not sorted by class), then OpenCV's contour order within a segment (observed: lowest island first). The fallback path, used when there is no instance data (exporters/__init__.py:128-136), orders lines by ascending class ID and merges touching same-class objects into one box.
> 5. Missing edge cases:
>    - If w\<=0 or h\<=0, nothing is written (lines 21-22).
>    - If there are no contours, the exporter neither writes nor deletes (lines 35-36). An old \<base\>.txt with outdated boxes survives when segments exist but none is visible, e.g. all cropped out. The caller only deletes outputs when the segment list is empty (save_export_manager.py:106-109).
>    - open(path,'w') in text mode (line 40) writes CRLF line endings on Windows, and every line ends with a newline, including the last.
>
> P0: justified. YOLO Detection is one of the two default export formats (DEFAULT_EXPORT_FORMATS, exporters/__init__.py:60-63), and the app also reads it back as the last fallback when loading annotations. A wrong normalization axis, class ID or box width would silently corrupt training datasets, so the rule guards data integrity.
>
> Injection check: nothing instruction-like in the cited lines 19-46.

### RULE-002: YOLO Detection export: normalized center/size box per object (folded card)

**Compliance judge:** P0 no, faithful yes

> P0 is not justified under the compliance lens. No money moves, and no regulatory, contractual or audit duty is involved. The YOLO .txt layout is a common machine-learning file convention, and nothing in the cited code or its callers touches audit trails, retention, personal data or financial records. A regulator, auditor or finance controller would not care if it changed. The only route to P0 is data integrity, and that case is weak: this rule converts annotations into an output file; it is not a check that stops data being corrupted.
>
> Risk the aggregator should still weigh: YOLO_DETECTION is written on every default save (__init__.py:60-63). NPZ, the other default, outranks the .txt on reload (__init__.py:73-81), so a broken YOLO export would not show inside the tool but would quietly corrupt users' training labels. Recommend P1 (functional and interoperability equivalence).
>
> If a separate data-integrity lens is applied, the clause most likely to deserve P0 on its own is "real class id, not channel index" (yolo_detection.py:28; class_order is the sorted unique ids from segment_manager.py:87-95). Tests already pin it (test_exporters.py:301-320, test_bbox_roundtrip.py:513-523).
>
> Do not make "full float precision, no rounding" a byte-exact contract. Python prints a full-width box as '1.0' and values below 1e-4 as '5e-05'; a JS/TS rewrite would print '1' and '0.00005'. The meaningful test is a pixel-exact round trip through load_bb_txt (file_manager.py:442-451), plus class ids and line count.
>
> The rule is faithful. Every clause matches the code:
> - line format: yolo_detection.py:33
> - output path \<base\>.txt: :45-46
> - box from cv2.boundingRect, inclusive extent: :27
> - x and w divided by width, y and h by height, with image_size read as (h, w): :20, :29-32
> - no file when there are no annotations: :35-36
> - no file when h\<=0 or w\<=0: :21-22
>
> The worked example is correct: 200/640=0.3125, and 100/480 prints as 0.20833333333333334.
>
> Gaps the card should add:
> 1. "One line per object" really means one line per outer contour. In the per-segment path (__init__.py:122-126; segment_manager.py:297-313), a segment split by crop or pixel priority writes several lines. In the fallback path (__init__.py:128-136, used when there is no per-segment data), touching same-class objects merge into one box.
> 2. The size guard is \<=0, not just 0.
> 3. When nothing is written, any old .txt stays on disk. Old files are deleted only when the image has no segments at all (save_export_manager.py:106-108, 523-529).
> 4. With a crop active, boxes are still divided by the full image size, not the crop size (save_export_manager.py:412-421).
> 5. An unused second writer, FileManager.save_bb_txt (file_manager.py:74-123), writes the class name (class_labels[channel], line 105) instead of the id, and always merges same-class objects. Only tests call it. A rewrite must not port it as the YOLO behavior.
>
> No injection-style text was found in the cited lines; they contain only ordinary docstrings and comments, and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: faithful. The concrete example matches the code byte for byte, but the card needs the amendments below before it becomes the equivalence contract.
>
> What I checked in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:19-46:
> - Line 20 reads h, w from image_size, which is stored as (height, width) (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:102). The app passes (pixmap.height(), pixmap.width()) (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:397,421).
> - I ran OpenCV 4.12.0 on the Given's rectangle (rows 50-149, cols 100-299). findContours with RETR_EXTERNAL/CHAIN_APPROX_SIMPLE returns the corners [[100,50],[100,149],[299,149],[299,50]], and boundingRect returns (100,50,200,100). That is the inclusive extent, as the card says.
> - Lines 29-33 produce, via Python float repr, exactly '3 0.3125 0.20833333333333334 0.3125 0.20833333333333334' (I evaluated the same f-string). There is no rounding.
> - Guards: line 21 returns None when h\<=0 or w\<=0 (so negative sizes too, not just 0). Line 35 returns None when there are no objects.
> - Class value: line 28 uses class_order[channel]. class_order is the sorted list of unique class ids (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:87-95) and channel is that list's index (segment_manager.py:276-283), so the real class id is written. Test test_exporters.py:301-320 confirms this.
> - Line 46 builds the file name as splitext + '.txt'.
>
> Amendments needed:
> 1. "One line per object" really means one line per outer outline, i.e. each connected blob of pixels (8-connectivity). When YOLO Detection is selected, all save paths build per-object data: save_export_manager.py:445-452, E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:92-98 and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6624-6630. That code finds outlines separately for each segment (segment_manager.py:297-313). So a segment made of two separate blobs writes TWO lines; I confirmed 2 outlines with OpenCV. A segment whose pixels were all removed writes none. Touching objects of the same class merge into one box only in the fallback path with no per-object data (__init__.py:128-136).
> 2. Crop (save_export_manager.py:413-417) and pixel priority shrink the boxes, but values are still divided by the FULL image width/height. Coordinates are not shifted to the crop origin.
> 3. The card does not specify line order. Lines follow segment-list order, then OpenCV's outline order inside a segment, which is not top-to-bottom: my test returned the lower blob first.
> 4. "Full precision" means Python's shortest repr. Whole numbers print as '1.0', and values below 1e-4 print in scientific notation (0.5/20000 gives '2.5e-05'), which happens for images wider or taller than 5000 px.
> 5. Line 40 opens the file in text mode 'w'. It overwrites, ends every line with a newline (including the last), and writes CRLF on Windows.
> 6. "No file written" does not remove an older .txt. A stale file survives when there is nothing to export (test_bbox_roundtrip.py:438-452). Files are deleted only when there are no segments at all (save_export_manager.py:106-109,523-529). Also, in the single-view save, a 0x0 pixmap raises an error before the exporter runs (save_export_manager.py:398-399).
>
> P0: justified on data integrity. YOLO Detection is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:8-9,46, with auto_save=True at :45; also __init__.py:60-63), so this file is written on normal saves. External YOLO training pipelines consume it, and the app reads it back itself (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:412-453; it is in LOAD_PRIORITY at __init__.py:73-81). A swapped divisor, a one-pixel width error, or writing the channel index instead of the class id would silently corrupt every label file.
>
> Injection/credentials: the cited lines contain no instruction-like text and no credentials.

### RULE-003: Label text to class ID resolution on import

**Compliance judge:** P0 yes, faithful yes

> Paths are relative to E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ unless noted.
>
> VERDICT ON P0 (compliance lens): P0 is justified, but only because the rule protects the data. It moves no money and enforces no regulation, so a regulator or finance controller would not care. It does protect the integrity of the annotation data, which is what this product exists to produce:
> (a) The resolved IDs are written to disk without the user doing anything. Switching images auto-saves by default (ui/managers/file_navigation_manager.py:156-160 and 270-274). The save does not check whether anything changed (ui/managers/save_export_manager.py:97-133). The YOLO detection exporter writes the numeric class ID (core/exporters/yolo_detection.py:28-33), and the NPZ exporters write the alias names.
> (b) Numeric labels claim their IDs before names are given one (core/file_manager.py:359-376). This order exists to stop a file mixing 'dog' and '0' from merging both into class 0. The test at legacy/lazylabel/tests/unit/core/exporters/test_bbox_roundtrip.py:528-547 pins it. If this changed silently, two classes would merge and auto-save would write the merged labels to disk. That damage cannot be undone.
> (c) Because YOLO files store the numeric IDs, equivalence tests should check the exact IDs, not just that no two classes collide.
>
> VERDICT ON FAITHFULNESS: The card is faithful. With aliases empty, I traced labels ['dog','0','cat'] through core/file_manager.py:355-377:
> - 'dog' and 'cat' fail int() and are held back as names.
> - '0' becomes class 0, so the taken set is {0}.
> - 'dog' gets 1 and 'cat' gets 2; both are registered as aliases.
> - Result: {'0':0,'dog':1,'cat':2}, aliases {1:'dog',2:'cat'}. This matches the Then exactly.
> The per-image reset also holds. SegmentManager.clear empties class_aliases (core/segment_manager.py:23). Every caller of load_existing_mask clears the manager first or uses a new one: ui/managers/file_navigation_manager.py:186 and 279-281; ui/main_window.py:3586, 4862, 6101 and 7264.
>
> GAPS TO ADD TO THE CARD (none blocking):
> (1) "YOLO" covers both detection .txt files (file_manager.py:453, via 392) and segmentation _seg.txt files (file_manager.py:579).
> (2) "Numeric" means anything Python int() accepts. '-1' becomes a negative class ID, '01' merges with '1', and '1.0' is not numeric, so it becomes a name with its own alias.
> (3) A VOC object with an empty name, or a CreateML annotation with no label, defaults to label '0' (file_manager.py:482 and 531).
> (4) Labels are mapped before boxes are clipped or dropped (392 runs before 394-398; 579 before 587). A name whose only box or polygon is empty still takes an ID and an alias but gets no segment.
> (5) Because aliases are cleared first, the existing-alias branch (362-364) normally never runs. It only runs when a higher-priority format already set aliases and then raised an error. The chain moves on after an exception (202-204); aliases get set at 232 and 626-637.
>
> SME QUESTION: IDs are assigned per image, so the same name can get different IDs in different images. Example: image A with ['cat'] gives cat=0; image B with ['0','cat'] gives cat=1. After auto-save to YOLO detection, class indices no longer agree across the dataset. Should the rewrite keep per-image assignment, or use one name-to-ID map for the whole dataset? Making this card a P0 contract as written would lock in that likely defect.
>
> No instruction-like text or credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: the rule is faithful. I traced the code by hand and confirmed the result with a standalone copy of the logic (repo code was not imported because its logger writes files).
>
> Trace of the GWT against E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:345-379, starting with empty aliases (segment_manager.py:23 via main_window.py:2141):
> - First pass: 'dog' goes to the unnamed list, '0' maps to 0 through int(), 'cat' goes to the unnamed list.
> - taken = {0}.
> - Second pass: 'dog' gets 1 and 'cat' gets 2, each registered as an alias.
> - Result: {'0':0, 'dog':1, 'cat':2}, aliases {1:'dog', 2:'cat'}. This matches the GWT exactly.
>
> Scope and reset claims hold:
> - The mapping is used only by YOLO detection (:453), VOC (:492) and CreateML (:539) through _add_box_segments (:392), and by YOLO seg (:579).
> - Every image-open path clears the SegmentManager or uses a new one before load_existing_mask: file_navigation_manager.py:186 and :279-281, main_window.py:3586, :6101, :7264, and a fresh manager at :4862.
> - Nothing after loading renumbers classes. reassign_class_ids only runs when the user asks for it (main_window.py:960).
>
> Gaps a P0 contract should add as GWT cases (none of them contradicts the card):
> 1. "Numeric" really means "accepted by Python int()". '-1' becomes -1, '+2' becomes 2, '007' becomes 7 (so it merges with '7'), '1_0' becomes 10, ' 4 ' becomes 4, and Unicode digits are accepted. '3.0' is NOT numeric, so it is treated as a name and gets the lowest free ID plus alias '3.0'. CreateML's str() conversion (:531) turns JSON 3.0 into '3.0', null into 'None' and true into 'True', all names. A missing CreateML label or an empty VOC name defaults to '0' (:483, :531). A JS port using Number() or parseInt would behave differently.
> 2. The alias lookup runs before the int parse, so an alias '0' on ID 5 sends label '0' to class 5. Because aliases are cleared per image and only the first format found gets loaded, this branch is reachable in production only when a higher-priority loader throws after changing aliases and the chain moves on (:202-204). Examples: _load_npz restores aliases at :232 before reading the mask; COCO registers categories at :626-637. So "reset for every image" is true when loading starts, but not always when labels are resolved.
> 3. New IDs fill gaps; they are not max+1. Labels '5','dog' give dog=0. The comment in tests/unit/core/test_file_manager.py:270 ("one above existing max") is misleading, but the card correctly follows the code.
> 4. Labels are mapped before boxes are clamped (:392 vs :395-398), so an alias is registered even when its box is dropped. Objects dropped while parsing (bad bbox or coordinates) use up no ID. Matching is exact: case-sensitive and not stripped.
> 5. The GWT silently assumes no higher-priority sidecar exists (.npz, _seg.txt, _coco.json, _CM.npz) (:128-136).
>
> P0: justified on data integrity. The resolved IDs and aliases become the class order and class names written on save and auto-save (save_export_manager.py:400-424). A wrong mapping silently merges or relabels classes in the user's dataset on disk. The docstring (:349-351) and tests/unit/core/exporters/test_bbox_roundtrip.py:528-547 show this merge bug already happened once.
>
> No instruction-like or injection text in the cited lines. No credentials.

### RULE-003: Label-to-class-id resolution for YOLO, VOC and CreateML labels (folded card)

**Compliance judge:** P0 yes, faithful yes

> Verdict: faithful. P0 is justified only because the rule guards data integrity; no money or regulation is involved.
>
> FAITHFULNESS (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:345-379): The first pass (359-368) resolves each distinct label by existing alias (362-364), otherwise by int(label) (365-366), otherwise sets it aside. The second pass (370-377) gives each set-aside name the lowest id not already used by an alias or claimed in the first pass, in first-appearance order, and registers it as an alias. Tracing the Given/When/Then with labels [dog, 0, cat] and no aliases: '0' gets 0, taken is {0}, 'dog' gets 1 and 'cat' gets 2, aliases become {1: dog, 2: cat}. This matches the card exactly. The scope is also right: the callers are YOLO detection (453 via 392), VOC (492), CreateML (539) and YOLO segmentation (579). COCO does not use this function (626-637).
>
> P0 / COMPLIANCE LENS: A regulator or finance controller would not care. An auditor of the labelled dataset would. For 4 of the 7 load formats, this function alone decides the class of every imported box or polygon. Two silent changes would corrupt data. First, giving names ids before numbers claim theirs would make 'dog' and '0' both class 0, merging two classes. Second, skipping alias registration would lose class names. The next save writes the damage to every enabled export: VOC and CreateML write the alias or the id (pascal_voc.py:37, createml.py:40), and YOLO writes ids. The maintainers pin this with a regression test (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:528-547).
>
> NOTES FOR VERIFICATION:
> (1) The alias-first branch never runs in normal loads. Every caller clears the segment manager, including aliases, before load_existing_mask (main_window.py:2141/3586/6101/7264, file_navigation_manager.py:186/281, and a fresh manager at 4862). Only one format is loaded per image (file_manager.py:205). Only tests pre-load aliases (test_file_manager.py:253). Focus verification on 'numbers first, then lowest unused id'.
> (2) Porting risk: the number check is Python int(). It accepts ' 1', '+1', '01' and '1_0' (as 10), maps '-1' to class -1, and rejects '1.0', '0x10', '1e3' and ''. JavaScript Number/parseInt give different results for '1.0', '0x10', '1e3', '', '1_0' and '12abc'. A naive port would silently merge or split classes.
> (3) Ids are assigned before out-of-image boxes and empty polygons are dropped (392 vs 397-398; 579 vs 587-588). A label with no surviving shape still takes an id and an alias, which shifts the ids of later names.
> (4) Defaults just outside the cited lines feed this function: an empty VOC \<name\> becomes '0' (482) and a missing CreateML label becomes '0' (531), so both silently join class 0. A CreateML label of null becomes the alias 'None'.
> (5) SME question: aliases are per image and there is no project-wide class list, so the same name can get different ids in different images. For example, a file with 'cat','dog' gives dog=1, while a file with only 'dog' gives dog=0. Re-exporting to YOLO then gives inconsistent class numbers across the dataset. Should the rewrite keep this legacy behavior or fix it?
>
> No instruction-like text or credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: faithful. I traced E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:345-379 by hand with labels ['dog','0','cat'] and no aliases. First pass (359-368): 'dog' fails int() and is held back; '0' becomes id 0; 'cat' is held back. So taken = {0} (370). Second pass (371-377): 'dog' skips 0 and gets id 1, and alias 1='dog' is registered; 'cat' gets id 2, alias 2='cat'. Result: '0'-\>0, 'dog'-\>1, 'cat'-\>2, which is exactly the card's Then clause. The VOC loader reaches this code through _add_box_segments (492 -\> 392), and labels are passed in document order. The precondition 'freshly opened image with no aliases' is realistic: every load path clears the SegmentManager first (main_window.py:2141, 3586, 6101, 7264; file_navigation_manager.py:186, 281; a fresh SegmentManager at main_window.py:4862). Only one format loads per image (file_manager.py:128-136, 205). The plain-English order (alias name, then integer, then lowest unused id registered as an alias), the scope (YOLO detection 453, YOLO segmentation 579, VOC 492, CreateML 539; COCO does not use it) and the parameters all match the code. Existing test tests/unit/core/exporters/test_bbox_roundtrip.py:528-547 backs this up but only checks that the two classes stay distinct, not the exact ids. The card's exact ids are a stronger contract. Edge cases the card leaves out, which equivalence tests should add: (1) Box labels are mapped at line 392, before degenerate boxes are dropped at 397-398. A box that clamps to zero area still uses up an id and registers an alias without creating a segment. (2) Python int() accepts '-1', '+2', ' 3 ' and '1_0', so negative class ids are possible. It rejects '1.0', which is treated as a name and gets a new id and alias. (3) Numeric labels are never registered as aliases. (4) If two ids share an alias name, the later id wins (355). (5) Outside the cited range, an empty VOC \<name\> becomes '0' (482). (6) taken does not include ids of segments already present without aliases. This only matters if a higher-priority loader added segments and then raised before the chain fell through (202-204). P0: justified as data integrity. This mapping decides the class of every imported annotation. The code's own docstring (349-351) names the failure it prevents: two classes silently merged into one. The mapped ids are also written back to disk with no edit needed. Navigating away auto-saves by default (file_navigation_manager.py:157-160) through save_single_view_output (save_export_manager.py:97-122), which has no dirty-state check and exports to all configured formats. NPZ is first in the load chain, so a wrong mapping would permanently change the user's labeled dataset. Injection/credentials: the cited lines contain only a descriptive docstring. No instruction-like text and no credentials.

### RULE-004: Detection and polygon exports keep same-class objects separate

**Compliance judge:** P0 yes, faithful yes

> P0 IS JUSTIFIED, BUT ONLY ON DATA INTEGRITY. Nothing here moves money or meets a legal requirement, so a regulator or finance controller would not care. A dataset or ML-governance auditor would. In this tool, the five instance-aware formats are the only files that record how many objects the annotator marked. NPZ keeps one channel per class and the class map keeps one label per pixel, so both merge same-class objects by design (ARCHITECTURE.md:212-216; test_bbox_roundtrip.py:289-310). YOLO Detection is also a default export format (exporters/__init__.py:60-63). If a rewrite contoured the merged per-class channel instead (that fallback still exists at exporters/__init__.py:128-136), the files would still be well-formed but would hold fewer, larger boxes and wrong COCO areas, with no error. That is silent corruption of the delivered dataset. It already shipped once as a defect (CHANGELOG.md:13) and is now pinned by tests (test_bbox_roundtrip.py:187-357). If only box formats are saved, reloading turns a merged line into one segment and the next save makes the loss permanent (file_manager.py:173-205).
>
> THE RULE IS FAITHFUL. All five exporters loop over iter_object_contours (yolo_detection.py:26, yolo_segmentation.py:32, coco.py:60, pascal_voc.py:35, createml.py:36). Each segment is rasterized on its own and intersected with the final tensor (segment_manager.py:279-305). Crop zeroes pixels without resizing (file_manager.py:712-739), and pixel priority is applied inside create_final_mask_tensor (segment_manager.py:246-250), so 'after crop and pixel priority' is correct. RETR_EXTERNAL returns one contour per connected part, and each is yielded separately (exporters/__init__.py:123-125), so 'each disconnected part becomes its own object' is correct. All four production save paths fill instances when an instance-aware format is selected: save_export_manager.py:427-452 and 511-513, main_window.py:6624-6630, save_worker.py:92-98. Tracing the Given/When/Then: boundingRect gives (0,0,50,50) and (50,0,50,50), so two lines are written. This matches test_touching_same_class_stay_separate (test_bbox_roundtrip.py:212-226).
>
> GAPS TO TIGHTEN BEFORE THIS BECOMES A CONTRACT:
> (1) The Given has no image size, and YOLO writes normalized values. With a 200x100 image the expected lines are exactly '1 0.125 0.25 0.25 0.5' and '1 0.375 0.25 0.25 0.5'. The merged regression would be the single line '1 0.25 0.25 0.5 0.5'.
> (2) Build A and B as pixel masks. Polygon segments go through cv2.fillPoly, which includes the boundary (segment_manager.py:182-184), so a vertex at x=50 fills 51 columns.
> (3) Limits the contract should state:
> - The switch is all-or-nothing on ctx.instances (exporters/__init__.py:122). A segment that is skipped because its mask is missing or the wrong size (segment_manager.py:294-295) is left out of these exports, with no fallback.
> - Multi-view saves apply no crop (save_export_manager.py:504-514; main_window.py:6615-6631).
> - After a reload from NPZ, which loads first, touching same-class objects are already one segment and export as one box. The guarantee only covers segments that are separate at save time.
> - RETR_EXTERNAL drops holes.
> (4) 'Parameters: (none)' misses the INSTANCE_AWARE_FORMATS set (exporters/__init__.py:86-94), which decides which formats get this guarantee.
>
> Injection suspects: none in the cited lines. The 'do not fix this' note at test_bbox_roundtrip.py:294-295 is an ordinary comment for maintainers.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. I traced the code myself and checked the OpenCV behavior in memory. Pixel priority is applied to the class tensor first (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:246-250), then crop (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:412-417). create_instance_contours (segment_manager.py:279-313) rasterizes each segment on its own, ANDs it with its class channel, and runs findContours(RETR_EXTERNAL). iter_object_contours yields one entry per contour (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:122-126). All five formats use it: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:26, yolo_segmentation.py:32, coco.py:60, pascal_voc.py:35, createml.py:36 (same folder). Scenario: class_order=[1]. A gives boundingRect (0,0,50,50) and B gives (50,0,50,50); the merged channel would give (0,0,100,50). So two lines with 50-px boxes, as stated. Every save path builds instances whenever an instance-aware format is selected: save_export_manager.py:445-452, E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6624-6630 (multi-view) and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:92-98. So the fused fallback (__init__.py:128-136) is never reached in the app. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:211-226 tests the same case.
>
> P0 JUSTIFIED: the exported label files are what the product saves. If this breaks, a training dataset silently gets two annotations fused into one (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\CHANGELOG.md:13), which is a data-integrity failure.
>
> PRECISION GAPS TO FIX ON THE CARD (not errors):
> (1) YOLO writes normalized floats, not pixels, using Python's default float text with no rounding. The Given leaves out image size. For a 100x50 image the exact output is '1 0.25 0.5 0.5 1.0' then '1 0.75 0.5 0.5 1.0', with A first.
> (2) 'Each disconnected part becomes its own object' goes too far. OpenCV treats diagonal touches as connected, so those parts are one object. A part inside a hole of the same segment is dropped: a ring with an island gave 1 contour. Holes are never exported.
> (3) Output order follows the segment list, then OpenCV's contour order. It is not class order.
> (4) Pixel priority only settles overlaps between different classes (segment_manager.py:332-333). Overlapping same-class segments both keep the shared pixels, and duplicate segments give duplicate boxes.
> (5) Crop applies only in single-view and SaveWorker saves. Multi-view has no crop.
> (6) The citation should also cover main_window.py:6624-6630 and save_worker.py:92-98. save_export_manager.py:454 (_save_viewer_output) is never called. The rewrite contract should require instances to be filled in rather than rely on the fused fallback.
> (7) Objects only stay separate if the segments were separate. After reloading from NPZ or a class map, same-class objects come back as one segment and export as one box, by design (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ARCHITECTURE.md:212-216).
>
> No instruction-like text found in the cited lines.

### RULE-004: One exported object per segment outline (instance separation) (folded card)

**Compliance judge:** P0 yes, faithful yes

> VERDICT: P0 justified on the data-integrity leg only; the card is faithful, with scope notes below.
>
> COMPLIANCE LENS: No money moves and the code enforces no regulation, so a finance controller would not care. A regulator would care only indirectly, where the exported datasets are used to train regulated or high-risk AI. A records or data-provenance auditor WOULD care, because a silent change corrupts the saved annotation files without any error: same-class objects that touch or overlap collapse into one larger box, so the dataset holds fewer objects than were labeled.
> - Likely to regress in a rewrite: the naive approach (contour the merged per-class channel) is exactly the old bug (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\CHANGELOG.md:13). It still exists as the fallback in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:128-136 and as the test-only writer FileManager.save_bb_txt (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:74-123).
> - The corruption would persist: YOLO Det, COCO, VOC and CreateML files are loaded back by the load chain (file_manager.py:128-136), so reopening and saving again makes the merge permanent.
> - Verification is cheap: tests already cover it (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:211-226).
>
> FAITHFULNESS VERIFIED:
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:279-313 rasterizes each segment on its own, intersects it with its class channel of the final tensor, and runs cv2.findContours with RETR_EXTERNAL. Pixel priority is applied in create_final_mask_tensor (lines 247-250). In single view, crop is applied before instances are built (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:413-429).
> - iter_object_contours (__init__.py:122-126) yields contours per record, and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:26-33 writes one line per contour. Two touching class-1 segments therefore give 2 lines.
> - The format list matches __init__.py:86-94.
> - The gating clause holds on both live save paths: single view (save_export_manager.py:445-449) and multi view (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6624-6630). The only ungated call, save_export_manager.py:511, is in _save_viewer_output, which has zero callers. SaveWorker (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py) is never instantiated.
>
> PRECISION NOTES FOR THE CONTRACT:
> (1) Output is one entry per EXTERNAL CONTOUR of a segment's surviving pixels, not strictly one per segment. A segment split by crop or pixel priority, or a mask with disjoint blobs, gives several entries. A segment fully removed gives none. Holes are dropped.
> (2) The 'NPZ-only skips it' clause is a performance gate with no effect on output. It also applies to NPZ_CLASS_MAP-only and empty selections. Mark it non-normative rather than P0.
> (3) The multi-view path applies pixel priority but no crop (main_window.py:6606-6631).
> (4) Scope gap, SME question: NPZ is a default format, loads first, and stores one channel per class. After reopening from NPZ, touching same-class objects are already one segment, so the next detection export fuses them (by design per test_bbox_roundtrip.py:284-310). Is losing instance identity after an NPZ round trip acceptable?
>
> No injection-shaped text or credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> VERDICT: The spec matches the code for the example it gives. P0 is justified for keeping objects separate, but the card has an extra clause that should go and two statements that are too broad.
>
> CHECKED AGAINST THE CODE (the normal single-image save, E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:97-122 then 394-430):
> 1) The class list is the sorted set of class ids (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:87-95), so here it is [1]. Both segments are merged into that one class layer (212-244). Pixel priority only settles overlaps between different classes (317-373), so two touching segments of the same class are left alone. The crop blanks everything outside the rectangle but keeps the full image size (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:712-739). It is applied before the per-object outlines are built (save_export_manager.py:413-429).
> 2) create_instance_contours (segment_manager.py:279-313) draws each segment on its own and keeps only the pixels that are also in its class layer of the final mask. It skips segments with no mask, the wrong size, or nothing left. It then traces outer outlines only (RETR_EXTERNAL, CHAIN_APPROX_SIMPLE). The result is one record per segment.
> 3) iter_object_contours (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:122-126) passes on every outline of every record. The YOLO Detection exporter (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:26-33) writes one line per outline: '\<class id\> cx cy w h', where cx=(x+bw/2)/w and so on, as unrounded floats. The first value is the raw class id, not a renumbered index. So two touching, solid class-1 segments give exactly two lines starting with '1'. The Then is confirmed.
> 4) The format check holds everywhere it can run. _build_instances (save_export_manager.py:445-452) returns an empty list unless one of the five formats listed at exporters/__init__.py:86-94 is selected. The same check exists at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6624-6630 (multi-view) and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:92-98. The only place without the check is save_export_manager.py:511-513 (_save_viewer_output), and nothing calls it. The NPZ exporters never read the per-object data. So the 'And' clause is true, but it changes no output. It only saves processing time, so it is not a business rule and should come out of the P0 contract.
>
> NEEDED CORRECTIONS AND EDGE CASES:
> (a) The real rule is one object per outer outline of what is left of each segment, not one per segment. A segment made of separate blobs (common with AI masks), or one split by the crop or pixel priority, writes several lines. A segment that is fully cropped out or overridden writes none (segment_manager.py:300-301). Holes are ignored.
> (b) 'Detection-style formats' is too narrow: YOLO Segmentation (yolo_segmentation.py:32) and COCO (coco.py:60) use the same per-object data.
> (c) Nothing removes duplicates: overlapping or identical same-class segments give overlapping or duplicate boxes.
> (d) Lines come out in segment-list order, not class order.
> (e) If the per-object list is empty, exporters fall back to the merged class layers (exporters/__init__.py:127-136), which fuses touching objects again.
> (f) Multi-view saves (main_window.py:6606-6631) never apply a crop.
> (g) Objects only stay separate if they are separate segments. Loading an NPZ or class-map file creates one segment per class (file_manager.py:254-266, 282-331). Opening a sequence frame merges all segments of each class (main_window.py:3603, 3612), so saving from there writes fused boxes. 'Save all propagated' (main_window.py:4778-4813) instead keeps one segment per object. The unused old writer FileManager.save_bb_txt (file_manager.py:74-123) still merges by class and must not be ported.
> SME question: should opening a sequence frame really merge segments by class, given that it undoes object separation when the frame is saved again?
>
> WHY P0: This rule controls how many objects end up in the exported labels and how big their boxes are, and those labels are the tool's main output. If it breaks, two objects silently become one box with no error, which corrupts the dataset (this is the bug fixed in CHANGELOG.md:13). That is a data-integrity issue.
>
> Injection suspects: none in the cited lines (they are ordinary docstrings and comments). No credentials were present.

### RULE-005: Final per-class mask composition

**Compliance judge:** P0 yes, faithful yes

> P0 is justified, but only because this rule protects the saved data. It moves no money and enforces no regulation, so a regulator or finance controller would not care. The case for P0 is that SegmentManager.create_final_mask_tensor (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:212-252) is the one place that decides what gets written to disk. All 7 export formats (NPZ, NPZ class map, YOLO detection, YOLO segmentation, COCO, Pascal VOC, CreateML) read their data from this output: either directly from ctx.mask_tensor, or from per-object contours that are clipped to it (segment_manager.py:297; exporters/__init__.py:114-136). Saved files are also read back in later (file_manager.py:128-136). If the behavior changed silently, saved labels would be wrong with no error, and new saves would stop matching existing datasets. Two realistic ways this happens in a web rewrite: a browser canvas fill leaves out the right and bottom edges, so the card's square becomes 9,801 pixels instead of 10,000; or the OR merge is replaced by last-write-wins. Anyone auditing where a dataset came from would care.
>
> The Given/When/Then is faithful. I ran the same cv2/numpy calls in memory. fillPoly on the card's square fills exactly 10,000 pixels (rows and columns 100-199, edges included). Merging in a separate 50-pixel mask gives 10,050, stored as uint8 values 0/1. The other claims also match the code: segments whose class is not in class_order are skipped (:227-228), polygons and circles are rasterized at save time (:233-237), and each class channel is built with logical_or (:241-244).
>
> The card is accurate but too loose to serve as the contract. Required fixes:
> (1) Pixel priority (:246-250, inside the cited range) runs after the merge. When it is on, a pixel claimed by two classes is kept in only one channel. So 'union of all its segments' is only true when priority is off (the default) or classes don't overlap. The single-class example can't catch this. State that condition.
> (2) A class's channel number is its position in class_order, not its class ID (:221). With get_unique_class_ids() returning [1], class 1 is written to channel 0, so 'Class 1 channel' is ambiguous.
> (3) Decimal polygon vertices are cut off, not rounded, by the int32 conversion at :182 (100.9 becomes 100). Hand-drawn polygons and boxes do store decimal coordinates (ui/managers/polygon_drawing_manager.py:202, ui/handlers/single_view_mouse_handler.py:428). Circle centre and radius use Python round(), which rounds halves to the nearest even number (:196, :202; round(2.5)=2). The example uses only whole-number corners and no circle, so it tests neither, and a JavaScript rewrite (Math.round, canvas fill) would change both without notice. Add a decimal-vertex example and a circle example.
> (4) 'Parameters: (none)' is wrong. pixel_priority_enabled, pixel_priority_ascending and class_order are all inputs.
> (5) The 10,050 total holds only if the 50-pixel mask doesn't overlap the polygon; with overlap it is lower. Write 'non-overlapping' instead of 'separate'.
> (6) In practice the exclusion clause almost never fires. Every live save path builds class_order from get_unique_class_ids() (save_export_manager.py:400 and :494; main_window.py:6602), so only segments with class_id=None are dropped. SaveWorker is the only caller that passes its own class_order, and nothing in src creates one.
>
> Minor: merge_segments_by_class (:156) and create_instance_contours (:294) check mask size, but this function does not (:241), so a wrong-sized mask raises an error. I found no instruction-like text and no credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> P0 JUSTIFIED. create_final_mask_tensor (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:212-252) builds the uint8 tensor of shape (h, w, len(class_order)) that every live save path passes to the exporters:
> - single view: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:405-410
> - multi view: the same file at :497-502, and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6606-6611
> - NPZ/TXT helpers in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:37-39 and :85-87 (these call it directly)
> It decides which pixels land in the saved label files and in which channel. If the rewrite gets it wrong, saved annotations are corrupted with no error. That is a data-integrity rule.
>
> FAITHFUL AS WRITTEN. I re-derived the example myself with cv2 4.12.0 and numpy 2.2.6, in memory only, without importing any repo code:
> - fillPoly on corners (100,100)..(199,199) fills rows and columns 100 to 199, edges included: 10,000 pixels.
> - OR-ing in a 50-pixel mask that does not overlap gives 10,050 pixels, stored as 0/1.
> - Union per class (lines 241-244), rasterizing polygons and circles at save time (233-237), and skipping classes not in class_order (221, 227-228) all match the code.
> - The existing test at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\test_segment_manager.py:191 also points to edges being filled.
> - The example has only class 1, so the pixel-priority step cannot change its result.
>
> GAPS TO FIX BEFORE THIS BECOMES AN EQUIVALENCE CONTRACT:
> (1) Pixel priority falls inside the cited lines (246-250) and is a user setting (save_export_manager.py:408-409). When it is on, a pixel claimed by more than one class stays only in the priority channel: the lowest channel index if ascending, the highest if descending (segment_manager.py:317-373). So "each class channel is the union of all its segments" is only true when priority is off, which is the default. "Parameters: (none)" is wrong: the parameters are pixel_priority_enabled (default False) and pixel_priority_ascending (default True).
> (2) The channel number is the class's position in class_order (line 221), not its class ID. Live saves pass the sorted unique class IDs, ignoring segments with no class (save_export_manager.py:400). So if class 1 is the only class, it is saved in channel 0 of a one-channel tensor. "Class 1 channel" should say this.
> (3) "Separate" has to mean the mask does not overlap the polygon. If it overlaps, the count is 10,000, not 10,050 (verified).
> (4) Rounding is missing, and the whole-number corners in the example hide it:
> - Hand-drawn polygon points are fractional scene coordinates (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\handlers\\single_view_mouse_handler.py:105, then E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\polygon_drawing_manager.py:93 and :202).
> - The int32 conversion at segment_manager.py:182 cuts off the fraction instead of rounding (199.7 becomes 199).
> - Circle centre and radius use Python round(), which rounds halves to the nearest even number (lines 196, 202). A circle whose radius rounds to 0 or less is dropped (197-198).
> - A rewrite that rounds normally would pass this card but produce different pixels on real drawings.
> (5) After this function, the save path clears every pixel outside an active crop (save_export_manager.py:412-417; file_manager.py:712-737). The 10,050 result assumes no crop is set.
> (6) This function has none of the safety checks that merge_segments_by_class (147, 156) and create_instance_contours (286, 294) have. A polygon whose vertices are None raises an error at 234. A mask whose size differs from the image raises an error in the OR at 242-244. Either one aborts the whole save (caught at save_export_manager.py:131-133) instead of skipping that segment. Any nonzero mask value counts as filled. Segment order does not change the result.
>
> The cited lines contain no text aimed at AI tools and no credentials.

### RULE-006: Saved class channel order is ascending class ID, not the Class Order table

**Compliance judge:** P0 yes, faithful yes

> FAITHFUL. get_unique_class_ids returns the class IDs sorted ascending with duplicates removed (core/segment_manager.py:87-95). Every save uses it: single-image save (ui/managers/save_export_manager.py:400-403, via save_output 86-122; the sequence save also goes through it at main_window.py:4813), per-viewer multi-view save (save_export_manager.py:494) and multi-view autosave (main_window.py:6602). create_final_mask_tensor puts each class in the channel matching its position in class_order (segment_manager.py:221-244). NpzExporter writes mask plus class_order=np.array(class_order) (core/exporters/npz.py:21-26). All other exporters use the same list (coco.py:45,71; yolo_detection.py:28; yolo_segmentation.py:43; pascal_voc.py:37; createml.py:40; npz_class_map.py:28,41,71). ReorderableClassTable.dropEvent only moves table rows (ui/reorderable_class_table.py:26-60). RightPanel.get_class_order (right_panel.py:361-371) is read only by Reassign Class IDs (segment_table_manager.py:96-100 -\> segment_manager.py:375-391; multi-view main_window.py:6458-6482) and by _toggle_recent_class, which picks the active class (main_window.py:2723-2728). No save reads it. update_class_list rebuilds the table ascending (segment_table_manager.py:344-359), so a drag is also lost on the next refresh. IDs are never renumbered (_update_next_class_id, segment_manager.py:816-826), so classes 0/2/5 can exist, and the Then (3 channels in order 0,2,5; class_order=[0,2,5]) matches. SaveWorker (ui/workers/save_worker.py) accepts any class_order but is never started, and FileManager.save_npz has no callers, so neither contradicts the rule.
>
> P0 JUSTIFIED, on the data-integrity prong only. No money or regulation is involved, so a regulator or finance controller would not care. A training-data quality auditor would, because this order defines what every saved label file means and also decides pixel content: (1) Tools that read NPZ 'mask' channels by position would silently get the wrong class per channel if the order changed. LazyLabel's own loader is safe because it reads class_order (file_manager.py:244-258); other tools may not be. (2) Channel order decides which class wins where masks overlap: pixel-priority mode (_apply_pixel_priority, segment_manager.py:346-371) and the _CM.npz class map (npz_class_map.py:69-72, argmax picks the lowest channel). If the rewrite followed the dragged order instead, the saved label pixels would change with no visible sign. One golden-file test can lock this in.
>
> Suggested card fixes (verdict unchanged): add the overlap-winner effect to the Then. Add an SME question about a mismatch: the tooltip at right_panel.py:182 says dragging reorders channels for saving, but dragging does nothing unless Reassign Class IDs is pressed; the comment at main_window.py:2726 says the first table row has highest priority, but saves give priority by ascending class ID. Keeping the code's behavior is safer for file compatibility. The cited lines contain no text that looks like instructions to an AI tool, and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: the rule matches the code. I worked it out from the code myself.
>
> Save path: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:86-133 calls _build_export_context (394-430). At line 400 it sets class_order = get_unique_class_ids(). That function, in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:87-95, returns sorted({class_id not None}). create_final_mask_tensor (segment_manager.py:212-252) maps enumerate(class_order) to channels, so channel i holds class_order[i]. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:21-26 writes mask, class_order=np.array(ctx.class_order) and class_aliases.
>
> Worked example: segments {5,0,2} give [0,2,5]. Channels 0/1/2 hold classes 0/2/5 and class_order=[0,2,5]. This matches the Then clause exactly.
>
> The other live save paths also use get_unique_class_ids(): multi-view (main_window.py:6602) and the sequence "save all propagated" action (main_window.py:4813, which calls save_output).
>
> Drag: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\reorderable_class_table.py:26-60 only moves table items. The itemChanged signal it fires reaches right_panel.py:228-240. The alias cell (col 0) is placed before the ID cell (col 1), so the handler finds no ID and does nothing. No segment data changes. The table's row order is read only by get_class_order (right_panel.py:361-371). That feeds reassign_class_ids (segment_table_manager.py:96-100 and segment_manager.py:375-391), which renumbers IDs 0..n-1 in table order. It is also read by _toggle_recent_class (main_window.py:2723), which picks the active class and does not affect channel order. So "no effect unless Reassign is pressed" holds.
>
> Details a verifier should know:
> (1) "Present in the image" really means "any segment with a class_id". A class whose mask is empty/None, or lies fully outside an active crop, still gets an all-zero channel.
> (2) "Every exporter's class list" is true of the shared ctx.class_order/class_labels. Only NPZ, NPZ Class Map and COCO (categories) actually write a list. YOLO writes raw IDs, and VOC/CreateML write aliases. Their per-object rows follow segment insertion order (create_instance_contours loops over self.segments), not ascending ID.
> (3) Every list refresh rebuilds the table in ascending order (segment_table_manager.py:338-368). A drag only counts if Reassign is pressed before the next refresh. The multi-view buttons are labeled "Reassign V1/V2 Classes" (main_window.py:3239).
> (4) The code contradicts some UI text and comments. The tooltip at right_panel.py:182 says "drag to reorder channels for saving", and the comment at main_window.py:2726-2728 says "First in table = highest priority". The code wins. This is a documentation mismatch, not an injection attempt.
> (5) Some dead code accepts any class order and should not count as evidence: SaveWorker (never created), FileManager.save_npz/save_bb_txt (called only from tests) and _save_viewer_output (no callers).
>
> P0: justified on data-integrity grounds. The ascending order sets the channel-to-class mapping in the saved annotation files. It also decides which class wins where masks overlap: _apply_pixel_priority (segment_manager.py:317-373) and the NPZ Class Map argmax (npz_class_map.py:66-73) both let the lowest class ID win. A rewrite that followed the table order, as the tooltip suggests, would change the saved pixel labels, not just the metadata.
>
> I found no instruction-like text in the cited lines.

### RULE-006: NPZ export content (folded card)

**Compliance judge:** P0 yes, faithful yes

> Verdict: P0 is justified, but only because this rule protects data integrity. The Given/When/Then matches the code, though the card leaves out details a rewrite could get wrong.
>
> COMPLIANCE LENS: Nothing here moves money or meets a regulatory requirement. No regulator or finance controller would notice if it changed. An auditor checking that saved labels stay correct would. Three reasons:
> - NPZ is a default export format (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:60-63).
> - It is the first file trusted when annotations are reopened (__init__.py:73-81; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136).
> - class_order is the only thing that links a mask channel to its class ID. Without it the loader treats channel number as class ID (file_manager.py:252-258). In the card's example, class 3 ('person') would quietly reload as class 1, with no error.
> A rewrite that renames keys, changes axis order or breaks the channel-to-class link would silently corrupt training labels. Golden-file checks for this are cheap. The contract should cover those parts (plus overlap handling), not the uint8 type or pickle encoding.
>
> FAITHFULNESS (checked in code):
> - File name is the image path with its extension swapped for .npz, so img.npz (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:29-30).
> - mask is cast to uint8 (npz.py:23).
> - Shape is (image height, image width, number of classes) (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:396-410; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:220-223).
> - class_order is the sorted list of class IDs used by segments (segment_manager.py:87-95), so [0, 3] gives 2 channels.
> - Cropping sets pixels outside the crop to 0 but keeps the shape (file_manager.py:712-739), so (480, 640, 2) holds.
> - class_order and class_aliases are written as stated (npz.py:24-25).
>
> GAPS THE CONTRACT SHOULD CLOSE:
> (1) The card says 'one-hot', which is the code's own tooltip word (__init__.py:37-40), but it is inaccurate. Each class gets its own 0/1 channel. Background pixels have no channel set, and pixels where classes overlap have several set unless Pixel Priority is on (segment_manager.py:241-250, 317-373). A strict one-hot rewrite would lose overlaps.
> (2) class_aliases holds every alias, not just those for classes in the image (save_export_manager.py:424).
> (3) class_aliases is saved as a pickled Python dict, so reading it needs allow_pickle=True (file_manager.py:231, 340). A Node writer will struggle to reproduce this. Loading untrusted .npz files with pickle turned on can also run arbitrary code. The only content test opens the file without pickle and checks only 'mask' (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_exporters.py:161-167). No test checks class_order or class_aliases.
> (4) The export is skipped only when the mask has zero size (npz.py:16-17). An all-zero mask is still written (test_exporters.py:169-172).
> (5) The delete function (npz.py:32-37) is inside the cited lines but the card doesn't mention it.
> (6) Because the extension is dropped, img.png and img.jpg in the same folder both write img.npz and overwrite each other. This is a hidden integrity risk the card doesn't mention.
> (7) class_order's integer type depends on platform and NumPy version, and the pickle bytes can vary. Equivalence checks should compare values, not raw bytes.
>
> No instruction-like text or credentials were found in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> Rule is faithful but incomplete. Every value in the Given/When/Then is correct when worked out again from the code. It needs 6 fixes before it can serve as a P0 contract.
>
> What checks out (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:15-37):
> - File name: the image's extension is swapped for '.npz' (npz.py:29-30), so img.png gives img.npz.
> - Mask: saved as uint8 (npz.py:23). Its shape is (H, W, number of classes) (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:220-223). A 640-wide by 480-high image with segments of classes 0 and 3 gives (480, 640, 2). Pixel values are 0 or 1 (segment_manager.py:241-244).
> - class_order: the sorted list of distinct class IDs used by segments (segment_manager.py:87-95; save_export_manager.py:400 and :494; main_window.py:6602). It is saved as a numpy array [0, 3], int64 because pyproject.toml:23 requires numpy\>=2.1.2. Channel i holds class class_order[i].
> - class_aliases: a copy of the segment manager's alias dict (save_export_manager.py:424 and :509; main_window.py:6622).
> - No rounding is involved.
>
> Why P0 is justified (data integrity): NPZ is a default export format (exporters/__init__.py:60-63) and the first format tried on load (__init__.py:73-81; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136). The loader only knows which class a channel holds through class_order (file_manager.py:252-258), and it replaces all aliases with class_aliases (file_manager.py:335-343). If a rewrite drops or reorders class_order, labels change silently on reload: class 3 comes back as class 1.
>
> Fixes needed:
> 1. 'One-hot' is misleading. Each channel is its own 0/1 mask. Background pixels are 0 in every channel, and overlapping classes are both 1. Pixel priority is off by default (config/settings.py:61); only it makes classes exclusive (segment_manager.py:317-373). The app's own tooltip also says 'one-hot' while saying 'Supports overlapping classes' (__init__.py:37-40). A test that checks exclusivity would fail against the old app, and a rewrite that enforces it would lose pixels.
> 2. The only branch in the cited code is missing (npz.py:16-17). If the mask has zero size (no class channels), nothing is written, None is returned, and any existing .npz is left in place. A mask with at least one all-zero channel is still written (tests/unit/core/exporters/test_exporters.py:169-172).
> 3. The file encoding is not stated. class_aliases goes through np.asanyarray(dict) (E:\\venv\\lazylabel\\Lib\\site-packages\\numpy\\lib\\_npyio_impl.py:793), so it is stored as a pickled 0-d object array. Reading it needs np.load(allow_pickle=True) plus .item() (file_manager.py:231, :340). A plain np.load raises an error on that key, since allow_pickle defaults to False (_npyio_impl.py:309). The file is also compressed, overwrites any existing file, and creates the parent folder if needed (npz.py:20-21).
> 4. class_aliases is the whole alias map, not just the saved classes. For example, it can be {0:'car',1:'bus',3:'person'} while class_order is [0,3].
> 5. Channels are sorted by ascending class ID, but the rule never says so. The example does not test it: segments created as class 3 first, then class 0, still give [0,3].
> 6. Cited lines 32-37 (delete_output: deletes the .npz if it exists and returns True/False) are not covered by the rule.
>
> Related: FileManager.save_npz (file_manager.py:20-72) is an old writer that nothing calls. It saves only 'mask', with no class_order or class_aliases, and must not be ported as this contract.
>
> The cited lines contain no instruction-like text and no credentials.

### RULE-006: NPZ one-hot mask export and class channel order (folded card)

**Compliance judge:** P0 yes, faithful yes

> P0 IS JUSTIFIED, BUT ONLY BECAUSE IT PROTECTS DATA INTEGRITY. Nothing here moves money or meets a regulation. LazyLabel is an image-annotation tool, so a regulator or finance controller has no direct stake. It still qualifies because this rule is the stored contract for which class each channel means, and the app's own reader depends on it:
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:244-258 maps channel i to class_order[i]. If the class_order key is missing, it uses i itself as the class id.
> - NPZ is first in the load order (file_manager.py:128-136; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:73-81), and loading stops at the first file that reads without error (file_manager.py:205).
> A silent change would relabel annotations, both in training data and when the tool reloads a file, with no error. Examples: putting channels in insertion order, dropping class_order, or changing when all-zero files are written. If class_order were dropped, classes [2,7] would reload as 0 and 1. A data-governance auditor would care.
>
> THE RULE IS FAITHFUL. Each claim matches the code:
> - class_order is the sorted set of class ids on current segments, ignoring None (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:87-95).
> - The tensor is a uint8 array of shape (h,w,C). Each class's channel is its position in class_order, and masks of the same class are OR-ed together (segment_manager.py:212-244). So classes 7 and 2 on a 480x640 image give shape (480,640,2), with channel 0 = class 2 and channel 1 = class 7.
> - Where classes overlap, both channels stay 1 unless pixel priority is on (segment_manager.py:247-250).
> - Height and width come from the full-resolution pixmap (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:396-397). Zoom does not resize it (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\photo_viewer.py:53,67).
> - The keys mask (uint8), class_order and class_aliases are written compressed to \<base\>.npz (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:21-30).
> - The exporter skips only when the tensor size is 0 (npz.py:16-17).
> - A crop zeroes pixels outside the crop but keeps the shape (file_manager.py:712-739), so an all-zero NPZ is still written. A test pins this: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_exporters.py:169-172.
>
> GAPS THE CONTRACT SHOULD ADD:
> (1) class_aliases holds every alias, not just the classes in class_order. It is stored as a pickled object, so reading needs allow_pickle=True (file_manager.py:231,340). A rewrite must still read these files, and unpickling untrusted NPZ files is a security risk.
> (2) With a crop, the tensor keeps the full image size and the crop coordinates are not saved.
> (3) Only single-view saves apply the crop. The multi-view save paths apply none (save_export_manager.py:454-521; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6559-6636), and main_window skips a viewer that has no class ids.
> (4) With pixel priority on in its default ascending mode, the lowest class id wins.
> (5) Data-integrity hazard, needs an SME. Saving while a crop excludes every annotated pixel overwrites a good NPZ with zeros. The reader skips all-zero channels (file_manager.py:256-257) and stops looking at other files. The image then shows as annotated but reloads with no segments, and any other annotation files next to it are ignored. Is that intended?
> (6) "Skipped only when the tensor has zero size" is true of the exporter itself. Earlier in the save, having no segments deletes all output files (save_export_manager.py:107-109), and an empty pixmap raises an error (save_export_manager.py:398-399).
> (7) An old writer, FileManager.save_npz (file_manager.py:20-72), saves only the mask with no class_order. Nothing in production calls it (only tests), so it must not be brought back.
>
> The cited lines contain no text aimed at manipulating the review and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> I worked the behavior out from the code myself, and the Given/When/Then matches what the code actually does.
>
> What I checked:
> 1. Class order. The class list is the sorted set of segment class ids, with None left out (core/segment_manager.py:87-95). Classes 7 and 2 give [2,7]. The channel map {2:0, 7:1} (segment_manager.py:221) puts class 2 in channel 0 and class 7 in channel 1.
> 2. Shape. The tensor is np.zeros((h,w,C), uint8), where h and w are pixmap.height() and pixmap.width() (ui/managers/save_export_manager.py:396-397; segment_manager.py:223). The pixmap is the image at full resolution (ui/managers/file_navigation_manager.py:174-183). A 480-high, 640-wide image gives (480,640,2).
> 3. Overlaps. Each channel is filled with np.logical_or, so values are 0 or 1 (segment_manager.py:241-244). Pixels where different classes overlap are 1 in both channels. Pixel priority only runs when pixel_priority_enabled is on (segment_manager.py:247-250), and then each overlapping pixel keeps a single 1.
> 4. Skip rule. core/exporters/npz.py:16-17 skips only when mask_tensor.size == 0. There is no emptiness check, so an all-zero tensor is still written. tests/unit/core/exporters/test_exporters.py:169-172 agrees.
> 5. Crop. _apply_crop_to_mask (core/file_manager.py:712-739) zeroes a copy outside [y1:y2, x1:x2) and never changes the shape. A crop with x1==x2 (possible after the clamping and swapping in crop_manager.py:131-140) still gives size \> 0 and writes an all-zero NPZ at full image size.
> 6. File contents. The keys are mask (cast to uint8), class_order (np.array) and class_aliases. The file is written with savez_compressed to splitext(path)[0]+'.npz' (npz.py:21-30).
>
> Gaps the card should close (none contradict it):
> (a) class_aliases is the whole alias dictionary, including classes with no segments. It is saved as a pickled 0-d object array, and the loader needs allow_pickle=True and .item() (file_manager.py:231, 340). A rewrite in another language must copy this or migrate it on purpose.
> (b) 'Class present' means at least one segment uses the class, not that the class has pixels. A class whose segments draw nothing (circle radius \<= 0, or cropped out) still gets an all-zero channel and a class_order entry.
> (c) Which class wins under pixel priority is not stated. Ascending (the default) keeps the lowest class id and descending keeps the highest (segment_manager.py:346-371; config/settings.py:61-62).
> (d) Crop is applied after priority, and only when saving from the single-image view. The side-by-side multi-view save (ui/main_window.py:6559-6636) never crops and skips export when class_order is empty.
> (e) In the single-image save, a zero-size tensor only happens when every segment's class_id is None, because an empty pixmap raises first (save_export_manager.py:398-399). With no segments at all, the save deletes every output, including the .npz (save_export_manager.py:107-109).
> (f) '480x640' here means height x width; the Then shape makes that clear.
> (g) Data-loss risk worth its own rule: the all-zero NPZ overwrites the earlier file, and the loader skips all-zero channels (file_manager.py:255-257). Reloading then shows no segments, even though the segments were still in memory when the file was saved.
> (h) An older writer, core/file_manager.py:20-72 (save_npz), saves only 'mask' and raises when class_order is empty. It has no callers in src and must not be used as the reference.
>
> Why P0 is justified: this is about data integrity. NPZ is loaded first when an image has several annotation files (core/exporters/__init__.py:73-81), and the loader maps channel i to class_order[i] (file_manager.py:244-258). A rewrite that changes the channel order, drops class_order, or stops writing all-zero files would silently mislabel or lose saved annotations.
>
> I found no instruction-like text and no credentials in the cited lines.

### RULE-007: COCO JSON export structure and area

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. Checked against E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\coco.py:19-97. I also ran the same OpenCV calls in memory in the app's venv (no files written). A filled 10x10 square at (100,50) gives contour [100,50,100,59,109,59,109,50], boundingRect (100,50,10,10) and contourArea 81.0, so area is 81. The code matches every field in the card:
> - category id = class_id (line 49)
> - name/supercategory come from rsplit('.',1) (lines 25-26)
> - category_id = class_order[channel] (line 71)
> - image_id is 1 (lines 54, 70)
> - annotation ids start at 1 in each file (lines 58, 82)
> - the area rule is at lines 73-77
> - iscrowd is 0 (line 79)
> The card's area of 81 catches a real trap for the port: area is the polygon's area, not the pixel count (100).
>
> Things the card leaves out (none of them are wrong statements):
> - An alias with no dot sets supercategory = name (line 27).
> - A class with no alias uses str(class_id) (line 46).
> - int() truncates instead of rounding.
> - Every class in class_order gets a category, even with zero annotations.
> - The image entry holds the file's basename, width and height (lines 53-54).
> - "One per object" really means one per outer contour: holes are dropped and a segment in several pieces becomes several annotations (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:114-136).
> - With zero annotations, no file is written (lines 84-85).
>
> P0 NOT JUSTIFIED (compliance lens). No money moves and no regulation applies. COCO is a shared community format for machine-learning datasets, used here by a desktop labeling tool. No regulator, auditor or finance controller would care if the area formula, id numbering, iscrowd or supercategory split changed.
>
> Data integrity applies to only a small part. The app reloads _coco.json as a source of annotations (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136, 602-710). But the loader reads only the category id/name/supercategory and each annotation's category_id/segmentation/bbox. It ignores area, iscrowd, image_id, annotation id and the images block. If the class mapping (class_id vs channel index) or the coordinate format changed silently, users' saved work would come back mislabeled. That save-then-load guarantee is the only part that deserves P0, and it is already tested for rectangles (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_exporters.py:447-460). The rest is a file-compatibility contract, so P1. Area does affect the small/medium/large size groups in outside COCO scoring tools, but that is a model-metrics issue, not compliance. The rule also just describes the file layout; it doesn't enforce or check anything.
>
> RECOMMENDATION: Downgrade this rule to P1. Split out a small P0 rule: saving to COCO and loading it back keeps each object's class and pixels.
>
> Also log a separate issue the card misses. A save can leave an old, stale _coco.json on disk, and the app can load it back later. Here is how:
> - If an active crop excludes every segment, the cropped mask is passed on to the contour step (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:412-417, 427-428, 450-451; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:297-301), so no contours are found.
> - The exporter then writes nothing (coco.py:84-85).
> - export_all never deletes files (__init__.py:189-206).
> - Files are only deleted when there are no segments at all (save_export_manager.py:106-109).
> - So the old _coco.json stays and can be picked up by the load order.
>
> SME question: Does any customer or dataset-delivery contract depend on exact COCO field values, such as area? If so, reconsider the rating.
>
> No instruction-like text and no credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> Verdict: faithful, and P0 is justified. The six gaps below are things the rule leaves out. None of them contradicts the code.
>
> HOW I CHECKED
> I read E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\coco.py:19-97 and its helpers in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py. I then reran the example with OpenCV 4.12.0 from the app venv, using only cv2 and numpy. No project code was imported and no files were written. Every value in the Then clause came out the same:
> - Category: the alias is split with rsplit('.',1) (coco.py:24-26), so 'dog.animal' gives name 'dog' and supercategory 'animal'. The category id is the class id (coco.py:45-50).
> - Ids: the image id is hardcoded to 1 (coco.py:54, 70). ann_id starts at 1 on every export call (coco.py:58, 82). category_id = class_order[channel] = 2 (coco.py:71).
> - Box: cv2.boundingRect returns (100,50,10,10). Width and height include both end pixels (max-min+1).
> - Area: cv2.contourArea of the 4-point outline is 81.0, and int() gives 81 (coco.py:73-77). This is not the 100-pixel count.
> - Polygon: contour_to_polygon (__init__.py:139-150) gives [100,50,100,59,109,59,109,50]. That is OpenCV's order: top-left, bottom-left, bottom-right, top-right. iscrowd is 0.
> - Parameters: all correct. int() cuts off the decimals rather than rounding. The contour area is used whenever there are 3 or more points, even when that area is 0: a 1-pixel-wide L shape gives area 0 and does not fall back to the box. With fewer points the area is box width x height: 1 for a single pixel, 10 for a 10-pixel horizontal line, 100 for a 10-pixel diagonal.
>
> GAPS TO ADD TO THE CARD
> 1. 'One annotation per object' really means one per outer outline of each segment, after crop and pixel priority. Every save path fills ctx.instances when COCO is selected:
>    - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:427-452 and 511-513
>    - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:92-98
>    - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6624-6630
>    Those contours come from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:297-313 (RETR_EXTERNAL). As a result, a segment with 2 separate blobs gets 2 annotations with the same category_id, and holes are dropped. Inside one segment, ids follow OpenCV's contour order: in 4.12 a blob at (30,30) came before one at (5,5).
> 2. Categories cover only classes that have segments on this image, sorted by id (segment_manager.py:87-95). A category is still written when all of its objects were cropped out. Class 0 is written as category id 0, with no +1 shift.
> 3. Alias fallbacks: with no dot, supercategory = name (coco.py:27). A missing alias becomes str(class_id) for both fields (coco.py:46). A trailing dot ('dog.') gives supercategory ''.
> 4. Empty output: with no annotations the exporter writes no file (coco.py:84-85). It also leaves any older _coco.json in place, because export never deletes (__init__.py:189-197). The caller deletes old files only when the segment list is empty (save_export_manager.py:107-109). So if segments exist but are all cropped out, an out-of-date COCO file stays on disk. That is a data-integrity gap.
> 5. The Given is ambiguous. It has to mean mask pixels x 100-109, y 50-59. A polygon drawn with corners (100,50)-(110,60) fills 11x11 pixels, because fillPoly includes the edges (segment_manager.py:182-184). That gives bbox [100,50,11,11], area 100 and segmentation [100,50,100,60,110,60,110,50]. The Given should state pixel coordinates.
> 6. Coordinates, width and height stay in full-image space even when a crop is active. The crop blanks pixels outside it rather than cutting the image (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:712-739).
>
> WHY P0 IS JUSTIFIED
> This file is the user's saved annotation data.
> - LazyLabel reads it back: COCO is in LOAD_PRIORITY (__init__.py:73-81), and load_coco_json rebuilds aliases from name and supercategory (file_manager.py:626-637).
> - Outside tools train and evaluate on it. pycocotools uses area for its small/medium/large metrics.
> - If a rewrite changed the category ids, the edge-inclusive box, the vertex coordinates or the alias split, datasets would be silently corrupted.
> - Save and reload already loses information for aliases like 'x.x': it reloads as 'x'.
>
> No instruction-like text in the cited lines, and no credentials.

### RULE-007: COCO JSON export: categories, bbox, area, polygon (folded card)

**Compliance judge:** P0 no, faithful yes

> Paths are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ unless shown otherwise.
>
> P0 IS NOT JUSTIFIED (compliance lens). No money is involved: nothing in this tool prices, bills or reports financial figures. No regulation is involved: the legacy code and E:\\GitHub\\LazyLabel\\analysis\\lazylabel\\ASSESSMENT.md contain no regulatory, medical, privacy or audit-record context. LazyLabel is a general-purpose image-labeling desktop app. As for data integrity, core/exporters/coco.py:19-100 only lays out the output file. It does not check, reconcile or protect any record. COCO is one of seven optional export formats. It is not selected by default (core/exporters/__init__.py:60-63 defaults to NPZ and YOLO detection) and ranks third when files are loaded back (__init__.py:73-81). No regulator, auditor or finance controller would notice or care if area changed from 81 to 100, if the fixed values (iscrowd 0, image id 1) changed, or if annotation ids were renumbered. Only one part touches integrity: whether labels and shapes survive a save and reload. The label comes from category_id = class_order[channel] (coco.py:71), and the loader reads back the categories and polygons (core/file_manager.py:626-680). A rule that a saved file reloads to the same masks covers this better, and a test already checks it (tests/unit/core/exporters/test_exporters.py:447-460). The real integrity risk is in the load order: a corrupt _coco.json hides a valid .txt, and the next auto-save deletes it (ASSESSMENT.md:237). Recommendation: make this P1 with a saved reference-file (golden-file) test, so P0 checking effort is not spent on fixed values.
>
> FAITHFUL: YES. I worked the example by hand. The outline of a filled square covering pixels 10-19 has corners (10,10),(10,19),(19,19),(19,10). That gives bbox [10,10,10,10] and area 81, because the area is measured through pixel centres (coco.py:65-77). Categories use the raw class ids of the classes present, sorted (core/segment_manager.py:87-95, called at ui/managers/save_export_manager.py:400 and 494 and ui/main_window.py:6602). The alias is split at the last dot, and with no dot the name and supercategory are the same (coco.py:19-27). No file is written when there are no annotations (coco.py:84-85). The file suffix is _coco.json (coco.py:100). "Unsimplified" is accurate: COCO skips the polygon simplification that core/exporters/yolo_segmentation.py:33-35 applies. ASSESSMENT.md:293 already lists this as a question for a subject-matter expert.
>
> Minor gaps in the card:
> 1. Area is cut down to a whole number with int(), not rounded (coco.py:74).
> 2. A class with no alias uses its id number as both name and supercategory (coco.py:46).
> 3. A class whose pixels are all removed by cropping or pixel priority still gets a category, but no annotation.
> 4. "No file" is only true inside the exporter. If objects exist but none leave any pixels, an older _coco.json stays in place, because export_all never deletes (__init__.py:189-206). Files are deleted only when there are no objects at all (main_window.py:6590, save_export_manager.py:519/529).
>
> The cited lines contain no text aimed at AI tools and no credentials.

**Fidelity judge:** P0 yes, faithful no

> P0 is justified as data integrity. The _coco.json file is saved annotation data, not just a report. The app reads it back: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:602-662 rebuilds class aliases from categories and segments from category_id and segmentation, and exporters/__init__.py:73-81 ranks COCO_JSON third in LOAD_PRIORITY. A wrong category id, alias split, bbox or polygon would silently corrupt saved labels.
>
> Fidelity: not faithful, because the area rounding is missing. Everything else checks out.
>
> What I confirmed in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\coco.py:
> - Image id is 1 (line 54).
> - Categories come from ctx.class_order (45-50), which the save paths fill with the sorted unique class ids of the segments (save_export_manager.py:400, main_window.py:6602, segment_manager.py:87-95).
> - The alias is split at the last dot using rsplit (24-27).
> - Annotation ids start at 1 (58, 82), image_id is 1, category_id = class_order[channel] (71).
> - bbox is integers from cv2.boundingRect (65, 72) and iscrowd is 0 (79).
> - The area branch is len(contour) \>= 3 (73-77).
> - Nothing is written when there are no annotations (84-85), and the suffix is _coco.json (100).
>
> I recomputed the example in memory with OpenCV 4.12.0 from the project venv, using the same contour settings as segment_manager.py:303-305 (RETR_EXTERNAL, CHAIN_APPROX_SIMPLE). A 10x10 block at (10,10) gives bbox [10,10,10,10], contourArea 81.0 -\> 81, and segmentation [10,10,10,19,19,19,19,10]. This matches the card exactly.
>
> The defect: coco.py:74 is int(cv2.contourArea(contour)), which drops the fractional part (the area is never negative, so this is a floor). The card only says 'area = contour polygon area'. Outlines on whole-pixel coordinates often have areas ending in .5:
> - An 8x8 lower-triangle mask gives 24.5 -\> 24.
> - A 1-pixel-wide L shape gives 0.5 -\> 0.
> A rewrite that writes 24.5, or uses Python round() (41.5 -\> 42 where the old code gives 41), still passes the card's example but differs on real masks. Suggested wording: 'area = the polygon area of the contour points with the fraction dropped, written as a JSON integer'.
>
> Edge cases the card should add:
> (a) A class with no alias uses str(class_id), so name and supercategory are both '5' (line 46).
> (b) Categories list every class in class_order, in ascending id order, even if crop or pixel priority removed all its pixels. That class then has a category but no annotations.
> (c) 'No file' only means nothing is written. The exporter never deletes, so if segments exist but produce no outlines (for example all outside the crop, file_manager.py:712-737), an old _coco.json stays on disk and can still be loaded. Files are deleted only when the segment list is empty (save_export_manager.py:106-109).
> (d) Annotation order follows the segment list, then OpenCV's contour order.
> (e) 'Unsimplified polygon' means the corner points OpenCV keeps (CHAIN_APPROX_SIMPLE), not every boundary pixel. Outlines of 1 or 2 points are padded to 4 points (__init__.py:139-157), and their area is bbox w*h, so a 5-pixel diagonal line gets area 25.
> (f) Only outer outlines are kept, so holes are ignored: a 20x20 ring with a 10x10 hole has 300 pixels but area 361.
>
> The cited lines contain no text aimed at manipulating the analysis and no credentials.

### RULE-008: CreateML export/import: pixel center boxes

**Compliance judge:** P0 no, faithful yes

> P0 NOT JUSTIFIED (compliance lens). LazyLabel is a desktop tool for SAM-assisted image annotation (E:\\GitHub\\LazyLabel\\analysis\\lazylabel\\ASSESSMENT.md:26). No repo doc mentions any regulatory, medical or financial regime, and nothing here moves money. CreateML is Apple's file format, not a regulation. The cited code only converts masks to boxes, and that conversion loses shape on purpose. The format is second-lowest in load priority (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136). The code rejects nothing and protects nothing, so it is not a data-integrity guard. A regulator, auditor or finance controller would not notice if this changed silently. Users training models would, because their boxes would shift. That makes it a P1 format-parity contract, and golden-file round-trip tests already exist (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py).
>
> FAITHFUL: every clause matches the code.
> - Export: center = int(x)+int(bw)/2 as a float, with integer width and height (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\createml.py:37-45). Array shape [{image: basename, annotations}] at 53-58; file suffix '_createml.json' at 67.
> - Label: ctx.class_labels[channel] = get_class_alias(cid), which falls back to str(cid) when a class has no alias (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:401-403; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:397-399).
> - Import: reads only data[0] (file_manager.py:509-513). x1=int(round(cx-bw/2)), x2=x1+int(round(bw)) (527-535). Boxes are clamped and dropped if empty, with x2/y2 exclusive (395-401).
> - Example rerun: export gives x 201.0, y 100.0, width 200, height 100. Reload gives x 101 to 301 exclusive and y 50 to 150 exclusive, i.e. columns 101-300 and rows 50-149, as stated.
>
> GAPS TO PIN if this stays a contract:
> (1) Python round() rounds halves to even. A file from another tool with cx=101.5, w=50 gives x1=76; round-half-up would give 77. LazyLabel's own files never hit a .5, because origin and size are integers.
> (2) Class IDs do not survive. Labels are matched again by _build_label_map (file_manager.py:345-379), so 'cat' from class 2 reloads as the lowest free ID (0) when no alias exists yet.
> (3) The 'image' field is never checked on import; data[0] is applied whatever its name.
> (4) No file is written when there are no objects (createml.py:50-51). Missing coordinates default to 0 and a missing label becomes '0' (file_manager.py:520-531).
>
> RELATED FINDING (separate card; this one does touch data integrity): the docstring at file_manager.py:161-163 says one damaged sidecar will not hide a healthy one. The code breaks that for CreateML. load_createml_json swallows parse errors (505-507) and returns early on an empty or non-list file (509-510). load_existing_mask then hits 'return' at 205, so a healthy lower-priority \<stem\>.txt is never loaded. If the user then saves with zero segments, save_single_view_output calls delete_all_outputs (save_export_manager.py:106-109, 529), which also deletes that .txt (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:45-46). The only fall-through test covers a damaged NPZ (test_bbox_roundtrip.py:750-756).
>
> No instruction-like text and no credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> VERDICT: P0 is justified on data integrity. Every value the Given/When/Then states checks out against the code, but it omits behaviors the contract needs; amendments listed below. SRC = E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel
>
> WHY P0: This is how user annotations are saved to and reloaded from CreateML files: center vs corner, pixel units, inclusive-pixel width, and how boxes are rebuilt. An off-by-one or corner/center mix-up silently corrupts every exported dataset, and boxes shift again on every save/reload cycle. The impact is smaller than NPZ: CreateML is not a default export (SRC\\core\\exporters\\__init__.py:60-63) and is 6th of 7 in load priority (:73-81).
>
> RE-DERIVED (matches): Mask at rows 50-149, columns 101-300. findContours finds 1 contour and boundingRect gives (101,50,200,100); I checked this in memory. SRC\\core\\exporters\\createml.py:42-45 writes {"x":201.0,"y":100.0,"width":200,"height":100}. The label is class_labels[channel], which is get_class_alias(2) = 'cat' (SRC\\ui\\managers\\save_export_manager.py:401-403; SRC\\core\\segment_manager.py:397-399). The image field is basename(image_path) (createml.py:55) and the suffix is '_createml.json' (:67). On reload, SRC\\core\\file_manager.py:527-535 gives x1=round(201-100)=101, x2=101+200=301, y1=50, y2=150. _add_box_segments (:394-401) clamps and drops empty boxes, then fills mask[50:150,101:301], which is exactly the claimed pixels. Only data[0] is read (:509-513). The x2=x1+round(w) form is stated correctly.
>
> AMENDMENTS BEFORE USING AS THE CONTRACT:
> (1) The class id does not survive the round trip, even though the Given sets up 'Class 2'. Every load path calls segment_manager.clear() before load_existing_mask (SRC\\ui\\managers\\file_navigation_manager.py:281 then :343; SRC\\ui\\main_window.py:3586 then :3619). That wipes class_aliases (segment_manager.py:23), and only NPZ files restore aliases (file_manager.py:232,308). So _build_label_map (:345-379) treats 'cat' as a new name and gives it the lowest free id: it reloads as class 0 with alias {0:'cat'}, not class 2. Classes without an alias are written as str(id) and keep their id. When a file has several named classes, ids are handed out in the order the labels first appear, so ids can swap.
> (2) round() is Python's round-half-to-even (checked: round(20.5)=20, round(21.5)=22). LazyLabel's own files never hit a tie, but third-party files with .5 values would come out differently in a port that rounds half-up.
> (3) A 'reload' reads CreateML only if no .npz, _seg.txt, _coco.json, _CM.npz or .xml file sits next to the image (file_manager.py:128-136). With the default NPZ+YOLO export, the NPZ file is loaded instead.
> (4) Other unstated cases:
> - The 'image' field is never compared to the image being loaded.
> - A missing label becomes '0'.
> - Missing coordinate keys default to 0, so the box is dropped.
> - A coordinate that can't be converted to a number skips only that annotation.
> - NaN or Infinity pass json.load but fail inside round() (:527-535), which is outside the try block at :519-525. The whole file is discarded and loading moves on to the .txt file (:202-204).
> - Malformed JSON, or a top level that is not a non-empty list, loads nothing and returns normally (:502-510), so the fallback stops at :205. A corrupt _createml.json therefore hides a healthy .txt file, which contradicts the load_existing_mask docstring at :161-163.
> - Export writes no file when there are no objects (createml.py:50-51) and leaves any stale file in place.
> - Each outer contour becomes one annotation; holes are ignored.
>
> No instruction-like text found in the cited lines. One stale comment: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_exporters.py:509 says CreateML has no loader, but the code has one.

### RULE-008: CreateML export uses pixel center coordinates (folded card)

**Compliance judge:** P0 no, faithful yes

> NOT P0 under the compliance lens. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\createml.py:33-67 just writes the Apple CreateML file format in a desktop image-labelling tool. It moves no money. It enforces no regulatory requirement: searching legacy/lazylabel for medical/HIPAA/FDA/DICOM/GDPR/audit/regulat finds only a "ruff compliance" lint note at CHANGELOG.md:721. It does not guard data integrity either: there is no validation or check, only a conversion. A regulator, auditor or finance controller would not care if this convention changed silently. The real risk is data accuracy and compatibility with other tools. Moving the origin to the top-left corner, normalizing coordinates, or taking the center of the pixel indexes (104.5 instead of 105.0) would silently shift every box that CreateML users receive. It would also break reloading through FileManager.load_createml_json at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:495-540, which reverses the math (x1=round(cx-bw/2), x2=x1+round(bw)). CreateML is part of the load chain (file_manager.py:134, 198-199; exporters/__init__.py:79). Suggested rating: P1, an output-format contract pinned by a golden file, not a P0 control.
>
> FAITHFULNESS: the spec matches the code. The labels come from segment_manager.get_class_alias(cid) for the sorted class ids (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400-403, 494-495; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:62-65; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6619-6621). createml.py:40 looks the label up by channel, so class 2 with alias "dog" gets the label "dog". For a filled block covering x 100-109 and y 50-59, cv2.boundingRect returns x=100, y=50, w=10, h=10. OpenCV counts both edge pixels in the width, and the round-trip test test_bbox_roundtrip.py:139-151 expects exactly that. Lines 42-45 then write x=100+10/2=105.0, y=55.0 (floats) and width=10, height=10 (ints). The file holds a one-item array with the image's base name and its annotations (lines 53-58). It is saved as splitext(path)+"_createml.json" (lines 66-67), so img.png becomes img_createml.json.
>
> Small gaps that do not make the spec wrong:
> (1) With no alias set, the label falls back to str(class_id) (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:397-399).
> (2) No file is written when there are no objects (createml.py:50-51).
> (3) Each contour becomes its own annotation, so a segment in several separate pieces produces several boxes (segment_manager.py:297-313).
> (4) The center is the left edge plus width/2, so boxes with an odd width get .5 centers.
>
> VERIFICATION NOTE: the old test at tests/unit/core/exporters/test_exporters.py:525-537 only checks that the keys exist. Its header comment at :509 ("no loader — write-only format") is out of date, because a loader now exists. The center convention is only checked indirectly, by the export-then-load round trips in test_bbox_roundtrip.py:145-168 and 194-240. So if the exporter and loader changed together, those tests would still pass while real CreateML users broke.
>
> No instruction-like text and no credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> The rule matches the code, and P0 is justified. I worked out the example myself and ran it through OpenCV in memory. No files were written and no repo code was imported.
>
> How the output is built (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\createml.py:36-47):
> - Each object's outline goes through cv2.boundingRect. For a set of points, width = xmax - xmin + 1, so pixels x 100-109 give width 10.
> - x is written as int(x) + int(bw) / 2 and y the same way. Both are floats with no rounding: 100 + 10/2 = 105.0 and 50 + 10/2 = 55.0. Width and height are written as whole numbers (10, 10).
> - OpenCV gave rect (100, 50, 10, 10) and JSON {"x": 105.0, "y": 55.0, "width": 10, "height": 10}, which is exactly the Then clause.
>
> The other claims also check out:
> - **Label:** it comes from ctx.class_labels[channel]. All three callers build that list with get_class_alias(cid) for each class id in sorted order (save_export_manager.py:401-403 and :495, save_worker.py:62-65, main_window.py:6619-6621). Channel i is that same sorted list's i-th class (segment_manager.py:221, 276-283), so the label is class 2's alias 'dog'.
> - **File and structure:** the file is an array with one entry, {image: basename, annotations} (lines 53-58). The file name is splitext(image_path)[0] + "_createml.json" (line 67), so img.png gives img_createml.json.
>
> Why P0 holds (data integrity): the app reads CreateML files back, not just writes them. It is in FileManager._LOAD_CHAIN (file_manager.py:128-136, 198-199). load_createml_json (file_manager.py:527-536) undoes the math exactly: x1 = round(cx - bw/2) and x2 = x1 + bw, with x2 exclusive. If a rewrite changed the center convention, the +1 width, or the float half-pixel, every exported box would be silently shifted or resized, both for CreateML users and when the app reloads its own files. The round-trip tests in tests/unit/core/exporters/test_bbox_roundtrip.py:145-151 and 194-226 require exact pixels for CREATEML. One stale comment disagrees: test_exporters.py:509 calls CreateML "write-only, no loader", but the code has a loader.
>
> Gaps to add to the card (none of them contradict it):
> 1. **Title is loose.** It is the bounding-box center (left + width/2), not the index of the middle pixel (that would be 104.5).
> 2. **No rounding.** Odd sizes give half-pixel centers: pixels 100-110 give x 105.5, width 11 (checked with OpenCV). Add this as a second example, because integer division or rounding in a rewrite would break it.
> 3. **Label fallback.** With no alias, the label is str(class_id), e.g. "2" (segment_manager.py:399).
> 4. **Nothing to export.** No objects means no file is written and the function returns None (lines 50-51). An old file is not deleted here; deletion happens elsewhere.
> 5. **One annotation per outer outline per segment.** Holes are ignored, and a segment with two separate blobs produces two annotations. If no per-object outlines were built, objects of the same class are merged instead (__init__.py:122-136).
> 6. **Crop.** Pixels outside the crop are zeroed, but the whole-image coordinates are kept (file_manager.py:712-739), so boxes are clipped to the crop without being shifted.
> 7. **Pixel priority.** Each box is computed from the segment's pixels that survive pixel priority, so overlaps can shrink it (segment_manager.py:297).
> 8. **Order.** Annotations follow segment order, then OpenCV's outline order.
> 9. **Parameters.** "(none)" is fair, though the "_createml.json" suffix is a hardcoded constant.
>
> No instruction-like text or credentials were found in the cited lines.

### RULE-009: Pascal VOC export uses alias names and exclusive max bounds

**Compliance judge:** P0 no, faithful yes

> COMPLIANCE LENS: NOT P0. LazyLabel is a tool for labelling images for machine learning. This rule only describes how one file format (Pascal VOC XML) is written. It moves no money. I searched the repo docs for medical, clinical, HIPAA, FDA, GDPR, "regulat", "complian" and "audit" and found no regulatory context. A regulator, auditor or finance controller would not care if the fixed pose/truncated/difficult values, the depth field or the XML layout changed. The rule is also not a guard: it checks nothing and blocks nothing.
>
> The only real integrity risk is the exclusive xmax/ymax convention, because the loader depends on it. load_pascal_voc_xml (legacy/lazylabel/src/lazylabel/core/file_manager.py:456-493) passes boxes to _add_box_segments (file_manager.py:381-410), which fills mask[y1:y2, x1:x2]. If the rewrite changes the writer or the reader but not both, every save and reload silently grows or shrinks boxes by 1 pixel. That is a round-trip accuracy problem, not a compliance one. Recommend P1, backed by a golden-file export-then-reload test. Existing tests already cover this: legacy/lazylabel/tests/unit/core/exporters/test_bbox_roundtrip.py:136-168 and 773-799.
>
> FAITHFUL: YES. Checked against legacy/lazylabel/src/lazylabel/core/exporters/pascal_voc.py:22-63:
> - Width and height come from ctx.image_size, and depth is always "3" (lines 23, 28-31).
> - name = ctx.class_labels[channel] (lines 37, 40). Every caller fills class_labels with get_class_alias: save_export_manager.py:401-403 and 495, save_worker.py:62-65, main_window.py:6619-6621.
> - pose "Unspecified", truncated "0" and difficult "0" are fixed values (lines 41-43).
> - xmax = x+bw and ymax = y+bh, taken from cv2.boundingRect, whose width counts both edge pixels. Pixels 100-109 therefore give xmin 100 and xmax 110 (lines 36, 46-49). The round-trip test agrees: a mask covering columns 10-39 reloads with x2 = 40 (test_bbox_roundtrip.py:69-72, 139-151).
> - The output path is the image path with its extension replaced by ".xml" (lines 62-63).
>
> GAPS THE CARD SHOULD ADD:
> (a) When a class has no alias, the name is the class id as text, e.g. "2" (segment_manager.py:397-399).
> (b) No file is written when there are no objects (lines 52-53), and exporting never deletes an old .xml (exporters/__init__.py:189-206).
> (c) The filename element holds the image's file name without its folder (line 26).
> (d) Each separate outline becomes its own object, so one segment in disconnected pieces produces several objects. Without per-segment instance data, touching objects of the same class merge into one box (exporters/__init__.py:114-136).
> (e) depth is "3" even for grayscale or RGBA images.
> (f) "Parameters: (none)" is wrong. depth 3, pose "Unspecified", truncated 0, difficult 0 and the ".xml" suffix are all hardcoded.
>
> SME QUESTION: As far as I know, the standard Pascal VOC toolkit uses 1-based coordinates with the max pixel included, while LazyLabel writes 0-based coordinates with the max excluded. Must the rewrite keep LazyLabel's convention so existing .xml files still load, or switch to the standard so other VOC tools read the boxes correctly?
>
> OTHER: The comment at test_exporters.py:470 says VOC has no loader, which is out of date. No instruction-like text appears in the cited lines, so there are no injection suspects.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: faithful. I worked the Given/When/Then out again from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\pascal_voc.py:22-63, and every value in the Then matches the code.
> (1) Size: callers set image_size=(pixmap.height(), pixmap.width()) (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:397,421; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6601). Line 23 unpacks it as h,w, so width is 640 and height is 480. Depth is the fixed text "3" (line 31).
> (2) Name: class_order is the sorted list of unique class ids (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:87-95). Every production place that builds an ExportContext sets class_labels=[get_class_alias(cid) for cid in class_order] (save_export_manager.py:401-403, 495; main_window.py:6619-6621; save_worker.py:62-65). The channel is the class's position in class_order (segment_manager.py:276,283), and line 37 reads class_labels[channel], which gives 'dog'.
> (3) Box: a filled block at x 100-109, y 50-59 gives one outer contour (segment_manager.py:303-305). cv2.boundingRect returns the inclusive pixel extent (100,50,10,10), so xmin=100, ymin=50, xmax=110, ymax=60 (lines 36, 46-49). Coordinates are whole pixels, so no rounding happens.
> (4) pose 'Unspecified', truncated '0' and difficult '0' are fixed text (lines 41-43). The output path is the image path minus its extension plus '.xml', so img.xml (line 63).
> The exclusive-max claim is backed by running code, not just the docstring at lines 18-19. The loader fills mask[y1:y2, x1:x2] (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:394-401, called from load_pascal_voc_xml at 456-492), so export and reload give back exactly the same pixels. The repo's round-trip tests assume the same thing (tests/unit/core/exporters/test_bbox_roundtrip.py:111-128).
>
> GAPS the card should add (these are missing details, not errors):
> (a) If a class has no alias, the name is its id as text, e.g. '2' (segment_manager.py:397-399).
> (b) With zero objects (for example, every segment is outside an active crop, which blanks pixels but keeps full-image coordinates, file_manager.py:712-739), export returns None and writes nothing. It also does not delete an existing img.xml (pascal_voc.py:52-53; export_all never deletes, E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:189-206). Old files are only deleted when the image has no segments at all (save_export_manager.py:107-109).
> (c) The \<filename\> element (the image's file name, line 26) is not in the Then.
> (d) Each outer contour of each segment becomes its own \<object\>, in segment order and then contour order (__init__.py:122-125). A segment with two separate blobs gives two objects, and touching segments of the same class stay separate. The fallback path (__init__.py:128-136) merges them instead. Crop and pixel priority are applied before the boxes are computed.
> (e) 'Parameters: (none)' is wrong. depth=3 (the same even for grayscale or RGBA images), pose='Unspecified', truncated=0 and difficult=0 are all hardcoded. Coordinates count from 0 and xmax/ymax are exclusive, which differs from standard Pascal VOC (counts from 1, inclusive max). An SME should confirm the rewrite must keep this.
>
> P0 IS JUSTIFIED on data-integrity grounds. VOC files are saved user annotation data, and the app reads them back (LOAD_PRIORITY at __init__.py:73-81; name-to-class matching at file_manager.py:345-379). If the rewrite changed the exclusive-max rule, every box would grow or shrink by 1 px on each save/load cycle. If it wrote class ids instead of aliases in \<name\>, classes could be remapped in datasets that mix legacy and new files. The fixed pose/truncated/difficult/depth values are standard filler that come with this core format contract.
>
> SIDE NOTES: A comment in a test file (tests/unit/core/exporters/test_exporters.py:470) says VOC is 'write-only (no loader)'. That is out of date: LOADABLE_FORMATS in the same file (lines 115-122) and file_manager.py:456 show VOC does have a loader, so don't use that comment to lower the priority. No injection-style text in the cited lines. No credentials.

### RULE-009: Pascal VOC export/import: 0-based exclusive max bounds, depth always 3 (folded card)

**Compliance judge:** P0 no, faithful yes

> VERDICT: Not P0. Downgrade to P1 as a contract that a saved VOC file reloads exactly and stays readable by other tools. The main Given/When/Then is faithful; one edge clause needs rewording. Paths below are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
>
> COMPLIANCE LENS: No regulator, auditor or finance controller would care about this. LazyLabel is a general-purpose tool for labeling images for machine learning. A search of the legacy tree found no medical, financial or regulated context. Pascal VOC is a common dataset file format, not a regulation. Nothing here moves money or creates an audit record.
>
> DATA INTEGRITY (the only possible P0 basis, and a narrow one): What matters is that the writer and reader agree. The exporter writes xmax = x + width, with max exclusive (core/exporters/pascal_voc.py:46-49). The loader fills mask[y1:y2, x1:x2], also exclusive (core/file_manager.py:483-486, then 395-401). If a rewrite changed only one side, every load and auto-save would shrink each box by 1 pixel per side, and 1-pixel objects would be dropped (the x2\<=x1 check at file_manager.py:397). The exposure is small, for two reasons:
> - VOC is not a default save format (core/exporters/__init__.py:60-63).
> - Its loader only runs when no .npz, _seg.txt, _coco.json or _CM.npz file sits next to the image (file_manager.py:128-136).
> A general rule that 'annotations reload pixel-identical and are never silently lost' covers this better. tests/unit/core/exporters/test_bbox_roundtrip.py already tests that idea.
>
> The rest of the rule does not protect anything:
> - depth '3' is hard-coded (pascal_voc.py:31) and is wrong for grayscale images. Making it P0 would force the rewrite to keep a metadata bug.
> - pose, truncated and difficult are fixed values (lines 41-43) and are never read back.
> - 0-based coordinates with exclusive max differ from the original VOC devkit, which is 1-based with inclusive max. Question for an SME: should the rewrite keep the legacy convention so existing files still load, or match the standard? That is a product decision, not a compliance one.
>
> FAITHFULNESS (checked):
> - The name is the class alias, or str(id) when there is none (core/segment_manager.py:397-399). Callers: ui/workers/save_worker.py:62-65 and ui/managers/save_export_manager.py:401-403.
> - cv2.boundingRect on the filled area (columns 100-299, rows 50-149) gives x=100, y=50, w=200, h=100. So xmin 100, ymin 50, xmax 300, ymax 150.
> - width and height come from image_size (lines 23, 29-30). depth is 3. The file is \<base\>.xml (line 63).
> - Reload fills exactly columns 100-299 and rows 50-149. All correct.
>
> FIXES NEEDED:
> (1) 'missing name defaults to 0' is wrong if it means no \<name\> element. Such an object is skipped (file_manager.py:474-477). The '0' only applies when \<name\> exists but is empty (line 482). That label becomes class id 0 unless '0' is an alias (lines 359-368), so it can merge with the real class 0.
> (2) A missing xmin or ymin does default to 0. A missing xmax or ymax also becomes 0, but the box is then dropped (lines 395-398), not placed at 0. A field that exists but is empty (\<xmin/\>) reads as an empty string, float conversion fails, and the object is skipped (lines 489-490).
>
> MISSING FROM THE CARD:
> - Decimal coordinates are rounded with Python round(), which rounds halves to even (lines 483-486).
> - Boxes are clamped to the image edges.
> - When there are no objects, export writes nothing and deletes nothing (lines 52-53).
> - On import, \<size\>, truncated and difficult are ignored.
> - Reloading gives class 2 only if 'cat' is already a known alias. Otherwise it gets the lowest free id (lines 355-377).
>
> OTHER: A test comment is out of date. tests/unit/core/exporters/test_exporters.py:470 says VOC is write-only with no loader, but a loader exists and line 120 of the same file lists VOC as loadable. This is a comment/code mismatch, not a prompt injection. No instruction-like text and no credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful no

> The main scenario matches the code. But one edge-case clause is wrong, and several edge cases that change the result are missing, so this can't be used as a contract yet.
>
> WHAT MATCHES (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\pascal_voc.py:22-63):
> - name is ctx.class_labels[channel]. That is the alias, or str(class_id) when there is no alias (segment_manager.py:397-399).
> - pose is 'Unspecified', truncated '0', difficult '0'.
> - xmin=x, ymin=y, xmax=x+bw, ymax=y+bh from cv2.boundingRect, whose width is max-min+1. I ran this in memory on a 480x640 mask filled at [50:150,100:300] and got 100/50/300/150.
> - width 640, height 480, depth '3' hard-coded even for grayscale. Output path is splitext + '.xml'.
> - Reload (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:456-493, then _add_box_segments 381-410) sets mask[50:150,100:300], which is exactly columns 100-299 and rows 50-149.
>
> DEFECTS:
> (1) 'Missing name defaults to 0' is wrong and contradicts the next clause. A missing \<name\> element makes the object get SKIPPED (474-477). The '0' fallback only applies to an empty \<name/\> (text is None, line 482). That label then becomes class 0 unless some alias is literally '0'.
> (2) 'Missing bndbox fields default to 0' leaves out what happens next. A missing xmax or ymax becomes 0, the box collapses, and the object is silently dropped (395-398). A missing xmin or ymin makes the box start at the image edge. An empty \<xmin/\> returns '', float('') raises ValueError, and the object is skipped rather than set to 0 (483-490).
> (3) Rounding is not stated. Float coordinates go through Python round(), which rounds halves to even: 100.5 becomes 100, 101.5 becomes 102 (verified).
> (4) Clamping is not stated. Boxes are clamped to [0,W]x[0,H], and \<size\> is ignored on import, so nothing is rescaled.
> (5) Class identity is not stated. The Given starts from class 2, but the app clears aliases before loading (file_navigation_manager.py:281; main_window.py:2141 calls segment_manager.clear()). _build_label_map (345-379) then gives 'cat' the lowest free id, so it reloads as class 0 with alias 'cat', not class 2. Only numeric names keep their id. A test asserting class 2 would fail.
> (6) A coordinate of 'inf' or '1e400' raises OverflowError, which the except at line 489 does not catch. load_existing_mask (202-204) logs it, throws away the whole XML (no objects load) and falls back to _createml.json or .txt. So not every malformed object is just skipped.
> (7) Missing precondition: reload only reads the XML when no .npz, _seg.txt, _coco.json or _CM.npz exists (_LOAD_CHAIN 128-136). DEFAULT_EXPORT_FORMATS includes NPZ (exporters/__init__.py:60-63).
>
> Minor omissions:
> - With no objects, no file is written and an old .xml is left in place (pascal_voc.py:52-53).
> - There is one \<object\> per contour per segment, so a segment in disconnected pieces gives several boxes.
> - Crop and pixel priority can shrink boxes (segment_manager.py:297).
> - Output is UTF-8 on Python 3.10, so encoding is not an issue.
>
> P0 is justified as data integrity. The coordinate convention, the skip/drop rules and the label-to-class mapping decide whether saved datasets reload without 1-pixel shifts or silently lost objects. The depth, pose, truncated and difficult fields are fixed format values that don't need P0-level checking.
>
> Question for an expert: this 0-based, exclusive-max convention differs from standard Pascal VOC (1-based, inclusive). VOC files from other tools will load with xmin and ymin shifted by +1 pixel. Is that intended?
>
> I found no text in the cited lines aimed at manipulating automated analysis, and no credentials.

### RULE-010: YOLO Segmentation export polygon simplification

**Compliance judge:** P0 no, faithful yes

> P0 IS NOT JUSTIFIED under the compliance lens. This is how an image-labeling tool writes machine-learning training labels. It moves no money and meets no regulatory requirement. A search of legacy/lazylabel for medical, clinical, FDA, HIPAA, GDPR, regulat, complian, audit and DICOM found nothing, so there is no sign of regulated use. The rule's main parameter is the simplification tolerance: epsilon = 0.001 x arcLength, passed to approxPolyDP (yolo_segmentation.py:34-35). That is a deliberate lossy-quality setting, not a data-integrity guard. No regulator, auditor or finance controller would notice or care if it changed from 0.001 to 0.002. The format is also opt-in: YOLO_SEGMENTATION is not in DEFAULT_EXPORT_FORMATS (__init__.py:60-63). The parts that do carry integrity weight are the file-format contract: the class token is class_order[channel] (:43); x is divided by w and y by h, using full-image size even when a crop is active (:40, save_export_manager.py:397,421); vertices are inclusive boundary-pixel indices (109, not 110); the file is \<base\>_seg.txt (:56); and the file is read back second in LOAD_PRIORITY (__init__.py:73-81), with the loader doing int(round(v*w)) (file_manager.py:572-575). Recommend P1 with a golden-file and round-trip test. If a data-integrity lens insists on P0, limit it to that contract, not the epsilon value.
>
> THE RULE IS FAITHFUL. I reproduced exporter lines 32-43 in memory with OpenCV 4.12.0 on a 480x640 mask with pixels [50:60, 100:110] set. Contour = [[100,50],[100,59],[109,59],[109,50]], arcLength 36, epsilon 0.036, and simplification removes no points. Output line: "0 0.15625 0.10416666666666667 0.15625 0.12291666666666666 0.1703125 0.12291666666666666 0.1703125 0.10416666666666667". This matches the card's vertex order and its truncated values. Both contour sources use RETR_EXTERNAL with CHAIN_APPROX_SIMPLE (__init__.py:132-134, segment_manager.py:303-305), so "outer contour, holes dropped" holds, although that code is outside the cited range.
>
> Gaps to fix on the card:
> (a) "One line per object" is really one line per outer contour. A segment whose mask falls into separate pieces writes several lines with the same class (segment_manager.py:303-311). In the fallback with no per-object contours, touching objects of the same class merge into one line.
> (b) The cited contour_to_polygon (139-157) has special cases the card never states. A 1-point contour becomes that point repeated 4 times. A 2-point contour (a line 1 pixel wide) becomes a there-and-back ring of 4 vertices. I confirmed that simplification leaves [[7,5]] and [[0,5],[9,5]] for these cases.
> (c) Coordinates are Python's default float text with no rounding (0 prints as "0.0"). The "..." in the card hides this, and exact round-trips depend on it.
> (d) Unstated guards: if image height or width is 0 or less, no file is written (:26-28). If there are no contours, it returns before writing and does not delete an existing _seg.txt (:45-46). Files are deleted only when the image has no segments at all (save_export_manager.py:107-109). So if every segment lies outside an active crop (file_manager.py:715-733), an old _seg.txt stays behind. That is a possible stale-label defect to test.
>
> No instruction-like text and no credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> I checked this by running the real exporter module (cv2 4.12.0, numpy 2.2.6). File writes were captured in memory and git status stayed clean. I used both contour paths: the per-object path (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:254-315) and the merged-mask fallback (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:128-136). Both give exactly: '0 0.15625 0.10416666666666667 0.15625 0.12291666666666666 0.1703125 0.12291666666666666 0.1703125 0.10416666666666667'. That is the claimed vertex order (100,50),(100,59),(109,59),(109,50). The '...' values are cut-off prefixes, not rounded numbers. The rest of the card also matches the code (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_segmentation.py:26-56): epsilon = 0.001 x closed arc length, outer contours only (holes are dropped), x/w and y/h on integer pixel indices, the original class_id is written (a lone class 3 writes '3'), and the output file is \<base\>_seg.txt.
>
> P0 is justified as data integrity, not money or regulation. The app reads _seg.txt back as its 2nd-choice format (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:542-600). It multiplies by w and h, rounds, and needs at least 3 vertex pairs. The divide-by-w/h convention and the point padding are what keep save-then-reload pixel-exact (the square reloads as the same 100 pixels). The 0.1% tolerance decides how much of the user's shape is lost.
>
> Gaps to fix. None contradicts the example, but a rewrite must match them:
> (1) The example never tests simplification. The contour is already just 4 corners, so tolerances of 0, 0.001 and 0.01 give the same line. Add a test that does: a filled circle r=100 at (320,240) on 640x480 has 292 contour points and exports 64 vertices.
> (2) Nothing is rounded. Python's default float text gives '0.0' for zero (an object at the origin) and '5e-05' below 1e-4 (x=1 on a 20000px-wide image). A JS toString port would write '0' and '0.00005'. Write the full strings in the contract, not '...'.
> (3) Padding in the cited lines 149-157 is missing from the card: a single-pixel object writes the same vertex 4 times, and a 1px line writes a there-and-back of 4 vertices.
> (4) 'One line per object' really means one line per outer contour of each segment. A segment with two separate blobs writes 2 lines. Lines follow segment order. The fallback path uses class order and merges touching same-class objects, but every production save builds per-object contours (save_export_manager.py:445-452, save_worker.py:92-98, main_window.py:6625-6628).
> (5) The first vertex is not stable in general. Simplification can drop the contour's starting point: a rotated ellipse's start moved from (200,109) to (170,125). Equivalence tests should compare polygons up to rotation, or compare the filled masks, unless OpenCV is pinned.
> (6) No file is written when height or width is 0 or less, or when nothing was found. Export never deletes an old _seg.txt.
>
> The cited lines contain no text aimed at manipulating automated analysis, and no credentials.

### RULE-010: YOLO Segmentation export: simplified normalized polygons (folded card)

**Compliance judge:** P0 no, faithful yes

> Faithful: yes. yolo_segmentation.py:34-35 sets epsilon = 0.001 x cv2.arcLength(contour, closed) and runs approxPolyDP. Lines 39-43 write class_order[channel] followed by x/w and y/h for each vertex. Line 56 uses the '\<base\>_seg.txt' suffix. Contours come from findContours(RETR_EXTERNAL, CHAIN_APPROX_SIMPLE) on both the instance path (segment_manager.py:303-305), which is used whenever YOLO Seg is selected, and the fallback path (__init__.py:132-134), so only outer outlines are kept. __init__.py:152-157 turns a 2-point contour into p1,p2,p2,p1 and a 1-point contour into the same point four times. The loader skips lines with fewer than 7 tokens (file_manager.py:564), which is why this padding matters. The call sites I checked pass (height, width) (save_export_manager.py:397/421 and 473/506, main_window.py:6601). Crop zeroes pixels but keeps the full image size (file_manager.py:712-737). I copied the exporter logic into an in-memory script run with OpenCV 4.12; it did not import legacy code or write files. The 10x10 square gives exactly '0 0.1 0.1 0.1 0.19 0.19 0.19 0.19 0.1', a single pixel gives one point repeated 4 times, and a 1-px vertical line gives a there-and-back ring. The card leaves some things out, though none are errors: (a) coordinates are written with Python's shortest float repr and no fixed precision, so a rewrite using a fixed number of decimals breaks byte-level equivalence; (b) class_id is the user's own class id (sorted unique ids), not a renumbered 0..N-1 index; (c) each connected piece of a segment gets its own line; (d) nothing is written when there are no contours, and an old _seg.txt is not deleted in that case (__init__.py:192-196).
>
> P0 not justified under the compliance lens. The rule moves no money and enforces no regulation. LazyLabel is a general computer-vision labeling tool (legacy/lazylabel/README.md:6), and nothing in the code or ASSESSMENT.md points to a regulated domain. A regulator, auditor or finance controller would not care about the polygon simplification tolerance in an ML label file. It does not guard data integrity either, because the simplification is lossy by design. The assessment rates epsilon as a Medium 'output-shaping constant' (analysis/lazylabel/ASSESSMENT.md:273). It also lists as an open question for a subject-matter expert whether YOLO seg is meant to be simplified when COCO is not (ASSESSMENT.md:293), and a behavior whose intent is still undecided cannot anchor a P0 contract. The exact, default, first-loaded store is NPZ (__init__.py:60-63, 73-81); YOLO Seg is opt-in. Recommend P1: a format-compatibility rule kept as a dual-run test case that pins epsilon and float formatting. Only two parts touch data integrity: padding 1-2 point outlines so objects are not silently dropped, and the x/width, y/height axis mapping. The padding is shared with COCO through contour_to_polygon and tested for all loadable formats (tests/unit/core/exporters/test_bbox_roundtrip.py:597-614). If a P0 is wanted, make those a separate cross-format rule that no annotation is silently lost or has its axes swapped on export and reload, rather than promoting this simplification rule. I found no instruction-like text and no credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. I re-ran the cited steps in memory with the project venv (cv2 4.12.0, numpy 2.2.6): find outer contours, arcLength, approxPolyDP with epsilon 0.001, contour_to_polygon, then x/w and y/h. The 100x100 image with a class-0 square at pixels 10-19 gives the raw contour [[10,10],[10,19],[19,19],[19,10]] and a perimeter of 36. Epsilon is 0.036 and all 4 points survive. The line written is exactly '0 0.1 0.1 0.1 0.19 0.19 0.19 0.19 0.1', matching the rule.
>
> Each claim checks out:
> (1) Epsilon is 0.001 x closed arcLength, simplified with approxPolyDP (Douglas-Peucker): yolo_segmentation.py:34-35.
> (2) The x value is divided by w and the y value by h (yolo_segmentation.py:39-42). A 200x50 test gave 10/200=0.05 and 10/50=0.2.
> (3) The line starts with ctx.class_order[channel], the original class ID from the sorted get_unique_class_ids, not a dense index (yolo_segmentation.py:43, segment_manager.py:87-95).
> (4) Suffix is '_seg.txt' (yolo_segmentation.py:56).
> (5) Outer outline only: both the per-object path (segment_manager.py:303-305) and the fallback (exporters/__init__.py:132-134) use RETR_EXTERNAL + CHAIN_APPROX_SIMPLE. A test shape with a hole exported only its outer ring.
> (6) Degenerate shapes (__init__.py:148-157): a single pixel gives the same point 4 times ('0 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1'). A 1-px line gives P1,P2,P2,P1 ('0 0.1 0.1 0.19 0.1 0.19 0.1 0.1 0.1'). A 1-px diagonal behaves the same way.
> All three save paths build image_size as (h, w) the same way (save_export_manager.py:394-430, save_worker.py:84-99, main_window.py:6601-6631).
>
> Gaps the contract should add (omissions, not errors):
> (a) No rounding. Coordinates are Python's shortest float text, e.g. 10/90 prints as 0.1111111111111111. A fixed-decimal port would produce different bytes.
> (b) Vertex order and starting point come from OpenCV's own approxPolyDP, which can move the start. For a 1-px L shape the raw start is (10,10) but the output starts at (19,10); a 4-corner filled shape output starts at (20,30) instead of the raw (147,10). Byte-exact equivalence means copying OpenCV's version of the algorithm, not a textbook one.
> (c) The 1-or-2-point ring rule is applied after simplification, not to the raw outline.
> (d) Each outer contour becomes its own line, so a segment with separate parts writes several lines. Lines follow segment-list order.
> (e) If h\<=0, w\<=0, or there are no contours, nothing is written and any existing file is left alone.
> (f) With a crop active, coordinates are still divided by the full image size, because the crop only zeroes pixels outside it (file_manager.py:712-737).
>
> P0 JUSTIFIED as data integrity. The _seg.txt file is the saved form of the user's labels. The app reads it back second in load order (__init__.py:73-81), and training pipelines use it too. Swapping w/h or dropping 1-px objects would quietly corrupt or lose labels; tests guard the latter (test_bbox_roundtrip.py:597-637). The epsilon itself is a deliberately lossy choice, so equivalence should be proven at the byte level, or at least the rasterized-pixel level. The cited lines contain no instruction-like text (no injection suspects).

### RULE-011: Erase subtracts pixels, splits remainders and drops tiny parts (folded card)

**Compliance judge:** P0 no, faithful yes

> P0 is NOT justified. This rule is how the eraser edits labels in an image-annotation tool (SAM-assisted labeling for computer vision). It doesn't move money or enforce any regulation. Nothing in the code or the README ties the tool to regulated use. No regulator, auditor or finance controller would notice or care if the 10-pixel cutoff or the 8-way connectivity changed. It isn't a data-integrity guard either. It is a deliberate, user-triggered delete step plus a cleanup of tiny leftover pieces. The result shows on the canvas right away and can be undone (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\undo_redo_manager.py:79-80, 120-121). A silent change would still alter the label masks users save, so it belongs in the equivalence test suite as P1 core functionality, with a golden-mask test, not in the P0 contract.
>
> FAITHFUL: yes, for the code path that actually runs. No caller passes viewer_index (polygon_drawing_manager.py:181; single_view_mouse_handler.py:408, 498; ai_segment_manager.py:254, 348; main_window.py:5796, 5889, 6982), so every erase goes through _erase_segments_single_view. Evidence in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:
> - 672-675: any segment the eraser overlaps is affected, whatever its class.
> - 683-685: a fully erased segment is removed.
> - 777: leftovers are split with connectedComponents(connectivity=8).
> - 786: a piece is kept only if it has more than 10 pixels.
> - 806-811: kept pieces become type 'AI' masks with the original class_id.
> - 697-702: the original is deleted and the kept pieces are appended at the end.
>
> The triggers check out:
> - Shift-close polygon: polygon_drawing_manager.py:84-89
> - Shift+Space in polygon and AI modes: keyboard_event_manager.py:151-180
> - Shift-release box: single_view_mouse_handler.py:385-411
> - Shift-release circle: single_view_mouse_handler.py:480-501
>
> The example numbers add up: 1000 - 50 = 950 = 942 + 8. The result is one class-2 'AI' segment of 942 px, and the 8-px piece is dropped.
>
> CAVEATS:
> 1. The cited lines segment_manager.py:509-517 are inside _erase_segments_multi_view_aware (only the skip and resize lines), and nothing currently calls that function. The function that picks the path is at 468-494. The unused multi-view version also behaves differently: other views skip the 10-px filter and keep only the largest outline (585-644). Don't take the parity contract from it.
> 2. Details the rule leaves out:
>    - A touched polygon or circle becomes a pixel mask even when it doesn't split.
>    - If every leftover piece is 10 px or smaller, the whole segment disappears.
>    - Masks from old NPZ files with a different size are resized (nearest-neighbor) to the eraser's size first (664-669), so kept pieces take on that size.
>    - AI eraser masks go through the fragment threshold before erasing (ai_segment_manager.py:137, 175).
>    - next_class_id is recalculated (704-705).
>
> I found no instruction-like text in the cited lines, and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL (High confidence). Base path: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\. I traced core\\segment_manager.py myself:
> - A segment counts as touched if even 1 pixel overlaps the eraser (672-675). It is recorded and marked for removal (685/693), and removals run in reverse index order (697-698).
> - What is left is the segment minus the eraser (680). If anything is left, it is split with cv2.connectedComponents at connectivity 8 (777).
> - Only parts with more than 10 pixels are kept (786): 11+ px survive, 10 or fewer are dropped. Each survivor becomes {type:'AI', mask, vertices:None, class_id: same as the original} (806-811) and is appended after all removals (701-702).
> - The numbers work: 1000-50 = 950 = 942+8. The original is removed, one 942-px class-2 AI mask goes to the end of the list, and the 8-px part is lost.
>
> Triggers confirmed:
> - Shift+Space, polygon and AI modes only: ui\\managers\\keyboard_event_manager.py:151-170.
> - Shift-close polygon: ui\\managers\\polygon_drawing_manager.py:84-89, then 175-184.
> - Shift-release box: ui\\handlers\\single_view_mouse_handler.py:402-411.
> - Shift-release circle: same file, 483-501.
> All eraser masks are boolean (segment_manager.py:185 and 203, ui\\main_window.py:2250-2251, ui\\managers\\ai_segment_manager.py:502-503, ui\\managers\\save_export_manager.py:337). So ~erase_mask really is a logical NOT.
>
> Behaviors the card leaves out; the equivalence tests must also cover them:
> 1. Any touch rebuilds the whole segment. Existing islands of 10 px or less are dropped even far from the eraser. If every leftover part is 10 px or less, the segment disappears even though pixels remained.
> 2. A leftover that did not split is still re-created as a new AI mask at the end of the list. Polygon/Circle vertices are lost, Loaded becomes AI, and every key except class_id is dropped.
> 3. The AI eraser (Shift+Space) is first trimmed by the fragment threshold (ai_segment_manager.py:137,175; save_export_manager.py:297-337). If nothing survives that filter, nothing is erased.
> 4. Segment masks of a different size are resized to the eraser size first, nearest-neighbour (segment_manager.py:663-669).
> 5. segment_manager.py:704-705 resets next_class_id to the highest remaining class + 1, so it can go down.
> 6. Preconditions: a polygon needs 3+ points (polygon_drawing_manager.py:172). A box needs width and height of at least 1 (single_view_mouse_handler.py:384). A circle needs a radius of at least 1.0 (same file, 476).
> 7. Class and visibility are ignored.
>
> Citation problem: lines 509-517 sit inside _erase_segments_multi_view_aware (segment_manager.py:496-583), which nothing can reach. All 8 callers leave out viewer_index, so every erase goes to _erase_segments_single_view (494). That includes multi-view, which uses one segment manager per viewer:
> - polygon_drawing_manager.py:181
> - single_view_mouse_handler.py:408 and 498
> - ai_segment_manager.py:254 and 348
> - main_window.py:5796, 5889 and 6982
> The live copy of those lines is 660-669. The mirroring and largest-contour logic in the unreachable function (534-561, 585-644) is not part of the contract.
>
> P0 JUSTIFIED (data integrity): this rule decides which annotation pixels end up in saved and exported masks. It silently deletes data (the 10-px cutoff), changes the segment type and reorders the list. A rewrite that changes the cutoff, the connectivity or the append order will export different labels.
>
> Separate bug, not part of this card (deserves its own card): core\\undo_redo_manager.py:596-597 passes the {index, segment} wrapper records (segment_manager.py:677) to add_segment, not the segment inside them. It also never removes the survivors the erase added. So undoing this scenario keeps the 942-px survivor and adds a broken entry that has a class but no type or mask. Redo (624-626) deletes the last N entries without checking what they are. There are no erase tests under legacy\\lazylabel\\tests. The cited lines contain no text that looks like instructions to an AI tool.

### RULE-012: Merge selected segments into the smallest class (folded card)

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. In E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:70-83 the code collects the class IDs of the selected segments (skipping any with none), picks the smallest, and writes it to every selected segment. active_class_id is never read. With classes {3,1} selected and class 5 active, both segments become class 1. The M key is wired in config/hotkeys.py:82-84 and main_window.py:1006 to ui/managers/keyboard_event_manager.py:236-239. That handler calls main_window._assign_selected_to_class and then right_panel.clear_selections() (right_panel.py:373-376). The unit test at tests/unit/core/test_segment_manager.py:150-167 already pins the smallest-class behavior. The card leaves out some details, but none of them contradict it: (a) if no selected segment has a class ID, the target is next_class_id, which is the highest existing ID + 1, or 0 (segment_manager.py:78-79). (b) "Merge" only rewrites class_id. The segments stay as separate rows with separate shapes. (c) A merge cannot be undone: UndoRedoManager has no merge or assign action type (core/undo_redo_manager.py:65-89). (d) In multi-view mode the same rule runs separately for each viewer that has a selection (main_window.py:1649-1654, 6361-6390), so linked viewers can end up with different target classes. clear_selections() also does not clear the multi-view tables, which are separate widgets (main_window.py:3132-3168). (e) The right-panel merge button (main_window.py:950-952) makes the same change but keeps the selection (segment_table_manager.py:154-160). So "then clears the selection" is true only for the M key, which is what the card describes. The code and its comments disagree: docstrings at keyboard_event_manager.py:237, segment_table_manager.py:54 and main_window.py:6362 say the segments go to the "active class", but the code ignores the active class. The card correctly follows the code. The cited lines contain no text aimed at manipulating automated analysis.
>
> P0: NOT JUSTIFIED. The rule moves no money and meets no regulatory requirement. It does not guard data integrity either: there is no validation and no invariant. It is only the default choice of target class for a bulk relabel that the user triggers on purpose. A regulator, auditor or finance controller would not care whether merge picks the smallest, the largest or the active class. The change would not be silent either: the new class ID and row color appear in the segment table right away (segment_table_manager.py:123-152), and handle_merge_press does not save, so the user sees the result first. The effect on saved files is real: save_export_manager.py:400 builds class_order from the sorted unique class IDs, so a class that is fully merged away loses its output channel. That effect is set by the export channel-mapping rules (segment_manager.py:212-252), which are the actual integrity contracts to verify. Recommend P1: a functional behavior the rewrite must match, already covered by a unit test. SME question: should merge really use the smallest selected class and ignore the active class, given that three docstrings say it uses the active class, and should it be undoable?

**Fidelity judge:** P0 no, faithful yes

> FIDELITY: the card is accurate. Call path, traced from the code: M is the default hotkey (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\hotkeys.py:82-84) and is bound app-wide (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:1044-1047). It goes through main_window.py:2000-2005 to keyboard_event_manager.py:236-239. That handler first calls _assign_selected_to_class() and then right_panel.clear_selections() (right_panel.py:373-376). In single or sequence view (main_window.py:1655-1656) the flow continues to segment_table_manager.py:53-57, then get_selected_segment_indices(). That function reads the stored original indices (right_panel.py:351-359), so an active table filter does not break it. Finally it reaches E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:65-85. There the target is the smallest class_id among the selected segments that have one. active_class_id is never read. Every selected in-range segment gets the target, and next_class_id is recalculated. Worked through: segments with class 3 and class 1 are selected and class 5 is active. The smallest of [3, 1] is 1, so both become class 1 and the active class stays 5. Class IDs are always integers because the loaders convert them with int() (file_manager.py:278, 329, 366, 643). So 'smallest' is a numeric comparison, not a text sort. update_all_lists selects the rows again (segment_table_manager.py:154-160), but clear_selections runs right after, so 'then clears the selection' is true for the hotkey. Code/comment mismatch: the docstrings at keyboard_event_manager.py:237 and segment_table_manager.py:54 say the segments go to the 'active class', but the code does not do that. The card correctly follows the code. The cited lines contain no text that looks like instructions to an AI tool.
>
> Edge cases the card leaves out (none contradict it): (1) If no selected segment has a class_id, the target is next_class_id (highest existing ID + 1, or 0). In practice this doesn't happen, because add_segment (segment_manager.py:34-39) and every loader always set an integer. (2) An empty selection changes nothing, but the lists still refresh. (3) Merge only changes the class. The segments are not combined and stay as separate rows. Unselected segments of class 3 keep class 3, unlike merge_segments_by_class and reassign_class_ids. (4) In multi-view (main_window.py:1649-1654, 6361-6390), each viewer's selection is merged to the smallest class within that viewer only. A 'Merged N segment(s)' notice appears, and the selection is cleared because the table is rebuilt (setRowCount(0), main_window.py:6139), not by clear_selections. (5) The Merge button in the right panel (right_panel.py:209, connected at main_window.py:950-952) changes the classes the same way but does NOT clear the selection. Only the hotkey clears it. (6) Merge is not recorded for undo: core/undo_redo_manager.py:65-81 has no merge or assign action type, so Ctrl+Z cannot reverse it. (7) Negative indices are not rejected (the check is only i \< len), but the UI never produces them.
>
> P0: NOT JUSTIFIED. This is a command the user triggers to relabel several segments at once, and the result shows immediately in the table and colours. It moves no money and enforces no regulation. It also doesn't guard data integrity: it validates nothing and doesn't protect stored labels from corruption or loss. It is feature behaviour. Recommend P1, and keep a behaviour test for it. The docstrings contradict the code, so a rewrite that follows them would use the active class and produce different labels. A merge also can't be undone. But it shouldn't take up P0 verification effort.

### RULE-013: Class assignment for new segments and next class ID (folded card)

**Compliance judge:** P0 no, faithful yes

> Accurate, but not P0. It should be P1 (feature parity).
>
> Accuracy:
> - In E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:34-39, a new segment with no class gets the active class if one is on. Otherwise it gets next_class_id.
> - Lines 816-826 set next_class_id to the highest class ID plus 1, or 0 when there are no segments.
> - next_class_id is recalculated after every change inside the class: add (line 56), delete (63), assign (85), merge (172), reorder (391) and erase (581, 705). No other code writes class_id directly, so the value stays current.
> - Single-view accept: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\ai_segment_manager.py:283-284 builds the segment with main_window.py:1788-1829, which sets no class. The default applies.
> - Multi-view accept (ai_segment_manager.py:366-371) repeats the same active-class-else-next-ID logic.
> - The example holds: with classes 0, 1 and 4 and no active class, the new segment is class 5. With class 1 active, it is class 1.
> - Two small details are missing from the card, but neither contradicts it. add_segment also records the used class as last_toggled_class_id (line 42). The active class is not cleared when its last segment is deleted, so a new segment can join a class that currently has no segments.
>
> Why not P0:
> - This is a default choice in a desktop image-labeling tool. It moves no money and enforces no regulation.
> - It does not protect data integrity. The user sees the chosen class in the class/segment table and can reassign it (assign_segments_to_class, lines 65-85, or reorder).
> - On save, classes are renumbered into output channels in sorted ID order (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\ui\\managers\\save_export_manager.py:400 and segment_manager.py:221-223). The NPZ file stores class_order and the class names (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:24-25), so the mapping is kept in the file.
> - A regulator, auditor or finance controller would not care if this changed.
>
> What still matters for parity:
> - With no active class, a new segment must never reuse an existing class ID. Otherwise separate objects would be merged in the saved mask.
> - A different numbering scheme, such as lowest unused ID, would change channel order in the output files.
>
> Recommendation: make it a P1 rule and keep the Given/When/Then as a regression test.
>
> No instruction-like text was found in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: faithful. I traced the code myself; the paths below are relative to E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
>
> (1) GIVEN classes 0, 1 and 4 are in use and no class is active. Then next_class_id is 5. core/segment_manager.py:816-826 sets it to the highest non-None class_id plus 1, or 0 if there are none. It is recalculated after every change: add (:56), delete (:63), assign (:85), merge (:172), reorder (:391) and erase (:581, :705). clear() (:24) resets it to 0. Polygon conversion (:881-902) keeps class_id, so the value is never stale when a segment is added.
>
> (2) WHEN an AI mask is accepted in single or sequence view: ui/managers/ai_segment_manager.py:283-284 calls ui/main_window.py:1818-1829, which builds a segment with no class_id key. add_segment (:34-39) then uses active_class_id if it is not None, otherwise next_class_id. The class is picked before the append (:55) and before the recalculation (:56). Result: class 5 and next becomes 6. With class 1 active: class 1 and next stays 5. Multi-view accept applies the same rule for each viewer (ai_segment_manager.py:366-369; main_window.py:6879-6882). Unit tests agree (legacy/lazylabel/tests/unit/core/test_segment_manager.py:108-133).
>
> GAPS TO ADD TO THE CONTRACT (not contradictions):
> (a) The check is 'is not None' (:36), so an active class 0 is honored. Add a class-0 example; a port that tests truthiness would wrongly start a new class.
> (b) The default applies only when the class_id key is missing (:34), not when its value is None.
> (c) 'In use' is per image and per viewer. Loading an image calls clear() (ui/managers/file_navigation_manager.py:281), which resets next to 0 and the active class to None. Class names (aliases) are not counted.
> (d) The next ID can go down and old numbers get reused. Deleting every class-4 segment makes next 2. delete_segments (:58-63) never removes aliases (they are only cleared at :23), so a reused class 4 is exported under the old name (ui/managers/save_export_manager.py:400-402). SME question: is that intended?
> (e) active_class_id is never checked against existing classes, and reassign_class_ids (:375-391) does not update it.
> (f) Linked multi-view is inconsistent: AI accepts pick the class per viewer, but polygon completion uses one viewer's class for both (ui/managers/keyboard_event_manager.py:109-116; main_window.py:5626-5630).
> (g) Side effect not on the card: :42 sets last_toggled_class_id, which the recent-class hotkey uses.
>
> P0 JUSTIFIED (data integrity): the assigned ID is the label that gets saved. Export orders classes by sorted ID (save_export_manager.py:400, :494), and each class's position in that list is its channel (segment_manager.py:221-244). So active vs new class decides which channel the mask is merged into. Next-ID vs reusing a gap decides channel position (for example, the new class goes to channel 3 instead of 2, which pushes class 4 over) and which class name is written. A rewrite that differs would silently mislabel the exported dataset.
>
> No instruction-like text found in the cited lines.

### RULE-013: Class id assignment for new segments (folded card)

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: Yes. segment_manager.py:34-39 uses active_class_id if it is set. Otherwise it uses the stored next_class_id. _update_next_class_id (816-826) sets that value to max(ids)+1, or 0 when there are no ids. It is recalculated after every add, delete, merge, reorder and split (lines 56, 63, 85, 172, 391, 581, 705). Both ways of accepting an AI mask get the result the rule states. In single view (ai_segment_manager.py:283-284), main_window.py:1788-1829 builds the segment with no class_id, so the default applies. In multi-view (ai_segment_manager.py:366-369), the same fallback is copied into the caller. So ids {0,3} give 4, and an active class 3 gives 3. toggle_active_class (414-416) clears the active class when the same class is toggled again. Two small gaps, neither wrong: (a) the default only applies when the caller passes no class_id. (b) Opening another image calls clear() (file_navigation_manager.py:281; segment_manager.py:24-25), which resets both the active class and the counter. Ids are therefore per image, not shared across the dataset.
>
> P0 NOT JUSTIFIED (compliance lens): LazyLabel is an image-labeling tool. This rule is a default that saves the user clicks while labeling. It does not move money, enforce a regulation, or protect data integrity. It performs no validation and never touches saved annotations. Every load path passes an explicit class_id (file_manager.py:259-265, 273-279, 324-330, 403-409, 590-597, 672-678, 701-707), so it cannot change how saved labels are read. The user sees the result: notifications at main_window.py:2702-2708 and the class table. They can also fix it with assign_segments_to_class (segment_manager.py:65-85). No regulator, auditor or finance controller would care if this changed. A silent change, such as reusing id 0, could fold a new object into an existing class and lower dataset quality. That makes it a P1 functional/regression test, not part of the P0 equivalence contract. The part that actually protects data integrity is save/load: class_order channel packing and round-trip (segment_manager.py:212-222, exporters/npz.py:24, file_manager.py:252-258). That is the better P0 candidate. No instruction-like text and no credentials appear in the cited lines.

**Fidelity judge:** P0 no, faithful yes

> FIDELITY: faithful. I re-derived the rule from the code and it matches.
> - Assignment: add_segment only sets a class id when the incoming segment has no class_id key (legacy/lazylabel/src/lazylabel/core/segment_manager.py:34). It uses active_class_id if set, otherwise next_class_id (:36-39). Then it appends and recomputes (:55-56).
> - Next id: _update_next_class_id (:816-826) takes the ids of current segments, skips None, and sets next to 0 if there are none, else max+1.
> - Scenario check: with classes {0,3} and no active class, next=4. The new segment gets 4 and next becomes 5. With class 3 active, it gets 3 and next stays 4. Calling toggle_active_class(3) again clears the active class and returns False (:414-416).
> - Trigger check: the single-view AI accept path reaches add_segment through main_window.py:1818-1829, which never sets class_id (ai_segment_manager.py:137-142, 175-180, 283-284).
> - No stale path: every mutating method recomputes next (:56, :63, :85, :172, :391, :581, :705). Polygon conversion keeps class_id (:883, :901). SaveWorker's list swap is never instantiated.
> - Tests pin the same behavior: tests/unit/core/test_segment_manager.py:108-133 and 237-257.
>
> Gaps the card leaves out (none contradict it):
> (1) Gaps in ids are never filled; next is always max+1. The {0,3} to 4 example shows this correctly.
> (2) "Existing ids" means ids on current segments only. Aliases are never pruned when segments are deleted (only clear() at :23 and reassign at :385-390 touch them). Example: classes {0,3,4}, alias 4="tree". Delete all class-4 segments and the next new segment gets 4 again, silently named "tree". That name reaches exports (save_export_manager.py:402, 424, 495, 509). The annotation import path uses a different allocator, lowest free id not taken by aliases (file_manager.py:370-377). A rewrite must not merge the two.
> (3) Toggling a different class switches the active class instead of clearing it. Both toggle and add overwrite last_toggled_class_id (:42, :412), which drives the hotkey.
> (4) Multi-view repeats the logic separately for each viewer, using that viewer's own manager (ai_segment_manager.py:339, 366-369; main_window.py:6879-6882). In linked mode with no active class, the two viewers can get different ids for the same accepted mask. Linked polygon finalize shares one id instead (main_window.py:5619-5650). Multi-view class clicks call set_active_class, not toggle (main_window.py:6446, 6456), so "click again to deactivate" applies to single view only.
> (5) The active class stays set after its last segment is deleted.
>
> P0: not justified; I'd rate it P1. This is a default-choice policy, not a safeguard. The chosen id is visible in the class table and the user can change it (assign_segments_to_class :65-85). It moves no money and has no compliance role. The real integrity rules nearby are class_order channel packing on save/load and the reassign id/alias remapping. The rule is still worth a P1 equivalence test, and edge case (2) is worth a defect ticket.
>
> No instruction-like text or credentials in the cited lines.

### RULE-014: Pixel priority resolves overlapping classes

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. The Given/When/Then matches the code. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:221-250 maps class IDs to channels through class_order, merges each class's segment masks, and calls _apply_pixel_priority only when the setting is on. Every save path passes the sorted class IDs as class_order (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400 single-view, :494 and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6602 multi-view), so classes {1,4} become channels 0 and 1 as the Given says. In _apply_pixel_priority (segment_manager.py:317-373) a pixel counts as an overlap only when more than one channel is set (332-333). Ascending keeps the lowest set channel (argmin, unset channels masked to num_classes, 354-355). Descending keeps the highest (argmax, unset masked to -1, 360-361). Every channel at an overlap pixel is cleared and only the winner is set back to 1 (367-371). Pixels with zero or one class are untouched. So pixel (10,10) ends up only in class 1 (Ascending) or only in class 4 (Descending). The defaults (off, Ascending) match settings.py:61-62, settings_widget.py:100 and the reset at :203-204. The setting is read on every save (settings_widget.py:154-155) and applies to all export formats. Detection formats clip each object's contours to the prioritized tensor (segment_manager.py:297). Priority is applied before crop (file_manager.py:37-49; save_export_manager.py:405-417). CAVEATS (not disqualifying): (a) main_window.py:2721-2728 is a hotkey helper (_toggle_recent_class) that picks the active class for new segments using the UI table order. It plays no part in overlap resolution and is not evidence for this rule. (b) Channels are the rank of the sorted class IDs present in the image, so in practice Ascending means 'lowest class ID wins', not table order. The card should say this so a rewrite does not key on table order. (c) Separately, with priority OFF the NPZ_CLASS_MAP exporter still silently lets the lowest channel win overlaps (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz_class_map.py:70). This card does not cover that and it needs its own card. P0 (compliance lens): NOT justified. This is an optional annotation setting, off by default, that decides which ML label survives in overlapping pixels of exported dataset files. It moves no money and enforces no regulatory requirement. Nothing in the code points to a regulated context (no audit trail, sign-off or retention). It is not an integrity guard either: it is a lossy transformation the user chooses, and with default settings the tool enforces no one-class-per-pixel invariant at all. A regulator, auditor or finance controller would not notice or care if it changed. A silent change would still alter exported training labels for users who turn it on, so keep it as a P1 export-output rule with a cheap equivalence test on this pure function (the given example, a no-overlap case and a three-class case) rather than spending P0 verification effort. Injection/credential check: the cited lines contain no instruction-like text and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> Paths are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ unless shown in full.
>
> FIDELITY (faithful):
> - I worked out what the code does without relying on the rule card. core/segment_manager.py:241-244 first merges all segments of the same class into one channel. Then, only if priority is on (246-250), _apply_pixel_priority runs.
> - Line 332-333 finds pixels where 2 or more channels are set. Pixels with no class or one class are skipped (337, 367-371).
> - Ascending (354-355): unset channels get the value num_classes and argmin picks the lowest set channel. Descending (360-361): unset channels get -1 and argmax picks the highest set channel. Ties are impossible because channel indices are unique.
> - At overlapping pixels, every channel is set to 0 and then only the winning channel is set to 1. Values stay uint8 0/1.
> - How channels map to classes: every live save path builds class_order with get_unique_class_ids(), which returns sorted class IDs (segment_manager.py:87-95). The call sites are save_export_manager.py:400 and 494, and main_window.py:6602.
> - So with classes 1 and 4 present, class_order is [1,4] and they get channels 0 and 1, as the Given says. Ascending keeps only class 1 at (10,10); Descending keeps only class 4.
> - The flags come from the settings widget at save time (control_panel.py:746, settings_widget.py:154-155). Defaults are off and Ascending (settings.py:61-62, settings_widget.py:100; unit test tests/unit/ui/widgets/test_settings_widget.py:50-55).
> - Every exporter reads the prioritized tensor: exporters/__init__.py:122-136, npz.py:23, npz_class_map.py:28. Per-object shapes are also cut down to the tensor (segment_manager.py:297). So in YOLO, COCO, VOC and CreateML output, the losing class's boxes and polygons also lose the overlapping pixels.
>
> EDGE CASES THE CARD SHOULD STATE:
> (a) Priority runs before crop.
> (b) Two segments of the same class that overlap are merged first. That is not a multi-class overlap, so priority does not apply.
> (c) With 3 or more overlapping classes, the lowest or highest channel still wins.
> (d) Channel = the class ID's position among the sorted class IDs present in that image. It is NOT the order of the class table after dragging rows. Dragging only moves rows; IDs are renumbered only when "Reassign Class IDs" is clicked (right_panel.py:195-214, segment_table_manager.py:96-99). The tooltip at right_panel.py:182 ("drag to reorder channels for saving") is misleading.
> (e) Priority never changes the segments in memory. But .npz is loaded first on reopen (core/file_manager.py:128-130), so after save and reload the overlap is permanently gone.
> (f) With priority OFF, the _CM.npz class map still picks the lowest channel (npz_class_map.py:70). That is a separate, unstated rule.
>
> Tests to add:
> - A pixel covered only by class 4 stays in class 4 under Ascending. This catches an implementation that clears the losing channel everywhere.
> - A 3-class overlap.
> - Priority off: (10,10) is set in both channels in the .npz.
> - Class IDs with gaps, with the table dragged but not reassigned.
>
> CITATION PRECISION: main_window.py:2721-2728 is the hotkey that picks which class to activate. It is not part of saving and does not support this rule.
> - It uses the class table's display order (right_panel.py:361-371). That order can differ from the save-time channel order after a drag without Reassign.
> - Replace it with segment_manager.py:87-95, 221, 246-250, 297 and save_export_manager.py:400-410.
> - Also: ui/workers/save_worker.py is never called (dead code).
> - No legacy test runs _apply_pixel_priority directly, so there is no existing test to check equivalence against. Golden tests are needed.
>
> P0: justified as data integrity. The rule changes the saved label data in every export format. Flipping the direction, or using table order instead of sorted IDs, would silently corrupt training labels. It is off by default, but when on it is the only thing keeping one class per pixel in the one-hot .npz.
>
> No instruction-like text and no credentials were found in the cited lines.

### RULE-014: Pixel priority for overlapping classes (folded card)

**Compliance judge:** P0 no, faithful yes

> COMPLIANCE LENS: not P0. LazyLabel is a labeling tool that makes training labels for computer vision (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\README.md:6). This rule moves no money. No regulatory requirement appears anywhere in the codebase: a search for hipaa/gdpr/fda/clinical/dicom/medical/regulat/audit found only the Apache license text (LICENSE:182) and a lint note (CHANGELOG.md:721). No regulator, auditor or finance controller would care which class wins an overlapping pixel.
>
> Data integrity: this is not a guard. It checks nothing and prevents no corruption or loss. It is an optional setting the user picks, off by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:61; the checkbox starts unchecked and the direction buttons are disabled, E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\settings_widget.py:69-73,99-102). When on, it deliberately drops data: at overlap pixels it clears every class and keeps only the winner (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:366-371). When off it does nothing (segment_manager.py:247). A silent flip of the direction or the default would change saved labels, so keep it as P1: an output rule protected by a golden-file test, not a P0 compliance contract.
>
> FAITHFUL: yes. With class order [1,4], channel 0 is class 1 and channel 1 is class 4 (segment_manager.py:221). A pixel counts as an overlap when more than one class channel is set (332-333). Ascending picks the lowest channel, so class 1 wins (346-355). Descending picks the highest channel, so class 4 wins (356-361). Pixels without an overlap are left as they were (340, 364-371). "Channel index = ascending class id" holds because every live save path passes the sorted class ids (segment_manager.py:87-95; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400,494; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6602). SaveWorker, which accepts any order, is exported but never created. The defaults (off, Ascending) match settings.py:61-62 and settings_widget.py:100.
>
> Things the card leaves out:
> (1) "Overlaps kept in every class channel" is true for the saved .npz mask (segment_manager.py:241-244). But the class-map exporter still settles overlaps with lowest channel wins (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz_class_map.py:66-72). So with priority off, _CM.npz behaves like Ascending.
> (2) Priority is applied before cropping (save_export_manager.py:405-417). It also reaches the box and contour formats (YOLO detection, VOC, COCO, CreateML) through segment_manager.py:297.
> (3) Users can drag-reorder the class table (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\reorderable_class_table.py:7-12), but saved priority follows class id order, not table row order. Only the toggle-recent-class shortcut uses table order (main_window.py:2721-2728), which could lead users to expect the table order to set priority.
>
> No instruction-like text or credentials were found in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. I read the code and ran the real module read-only (python -B) on the card's example.
>
> How the code works: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:221 puts each class in channel = its position in class_order. :241-244 ORs segments into their channel, so two segments of the same class never count as an overlap. :247-250 applies priority only when enabled. In _apply_pixel_priority, :332-333 flags pixels where 2+ channels are set. :335-337 returns a copy when there are none. Ascending (:354-355) picks the lowest set channel via argmin, with empty channels set to C. Descending (:360-361) picks the highest via argmax, with empty channels set to -1. :367 zeroes only the flagged pixels and :371 writes 1 to the winner. Other pixels are untouched.
>
> All live save paths pass class_order = get_unique_class_ids(), which is sorted ascending: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400 and :494, and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6602. They read the flags from the settings widget (save_export_manager.py:112, :480; main_window.py:6576). So 'channel index = ascending class id' is correct.
>
> Test run with classes 1 and 4 gave class_order [1,4]. At the overlap pixel:
> - Priority off: channel 0 = 1, channel 1 = 1.
> - Ascending: 1,0 (class 1 kept).
> - Descending: 0,1 (class 4 kept).
> Pixels owned by one class were unchanged in every mode.
>
> Defaults match the card:
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:61-62 sets False/True.
> - In settings_widget.py the checkbox is never set, so it starts unchecked (:69-73), and :100 checks Ascending.
> - set_settings (:186-187) and reset (:203-204) also default to False/True.
>
> Gaps the downstream contract should add (none contradict the card):
> 1. The _CM.npz class-map exporter (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz_class_map.py:66-72) uses argmax, so even with priority OFF the lowest channel wins. Measured: off gives class 1, descending gives class 4. 'Overlaps kept in every class channel' is only true for multi-channel outputs.
> 2. With 3+ overlapping classes only the lowest or highest survives. Verified: [1,0,0] ascending, [0,0,1] descending.
> 3. Priority runs before the crop (save_export_manager.py:405-417). The crop only zeroes pixels outside the crop area, so the winner does not change.
> 4. Detection formats are affected too. segment_manager.py:297 intersects each segment with the prioritized channel, so boxes of the losing class shrink or split.
> 5. Priority follows the numeric class ID, not the drag-reorderable class table (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\reorderable_class_table.py:12). Only the 'Reassign Class IDs' button renumbers IDs. But _toggle_recent_class (main_window.py:2721-2728) treats the first/last table row as highest priority, which is inconsistent.
> 6. SaveWorker and FileManager.save_npz/save_bb_txt accept any class_order but are never called in src. Given [4,1], ascending picks class 4.
> 7. No unit test covers _apply_pixel_priority.
> 8. The citation leaves out the callers that fix class_order as sorted.
>
> P0 JUSTIFIED (data integrity). This rule decides which class label is saved at contested pixels in every export format (NPZ, class map, YOLO seg/detection, COCO, VOC, CreateML). Those files are the tool's main output: training labels. A rewrite that differs would change saved labels silently, with no error, and no tests catch it. It is off by default, but when on it guarantees one label per pixel in saved data. It does not involve money or regulation.

### RULE-015: Reassign class IDs from Class Order table (folded card)

**Compliance judge:** P0 no, faithful yes

> P0 NOT JUSTIFIED (compliance lens). Nothing here moves money or meets a regulatory requirement. The legacy docs name no regulated domain; the only 'compliance' hit is 'ruff compliance' at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\CHANGELOG.md:721. This is a user edit, not a data-integrity guard: the user drags rows in the 'Class Order' table and clicks a button (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\right_panel.py:195-199,214). The table then redraws right away, so the result is visible, not silent (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\segment_table_manager.py:96-100 -\> update_all_lists at 304-319). It checks nothing and blocks nothing. It does matter downstream, though. Save takes segment class IDs as they are (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400-424). YOLO writes them (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:28). NPZ and COCO store class_order and aliases (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:24-25; coco.py:45-46). So a regression would mislabel exported training data. That makes this a P1 feature contract, not P0. The real integrity anchors are the save-side ID-to-channel packing (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:212-252) and the load-side channel-to-ID mapping (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:244-258). No regulator, auditor or finance controller would care how a renumbering button behaves in an image annotation tool. FAITHFUL: yes. get_class_order reads column 1 row by row (right_panel.py:361-371). Column 1 is 'Class ID' (header at right_panel.py:185) and cannot be edited (segment_table_manager.py:352). With rows 4, 0, 1 the order is [4,0,1], so id_map={4:0,0:1,1:2}. Segments are remapped (segment_manager.py:377-382). Aliases are rebuilt only for ordered IDs that already had one, giving {0:'car'} (385-390). next_class_id becomes 3 (816-826). Gaps the card leaves out, useful for the P1 contract: (1) class_aliases is replaced wholesale, so aliases for IDs not in the table are silently dropped. This can happen because aliases load from NPZ with or without segments (file_manager.py:343) and delete_segments never removes aliases (segment_manager.py:58-63). (2) Segments whose ID is missing from the order keep their old ID and can collide with a new one. (3) Rows with blank or non-integer ID text are skipped (right_panel.py:366-370). (4) If an ID appears twice, its last position wins. (5) Multi-view has one reassign button per viewer (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6458-6489). It calls the same core function but is not cited. No legacy test mentions reassign (0 matches under legacy\\lazylabel\\tests), so equivalence needs a new characterization test. No instruction-shaped or injection text was found in the cited lines, and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: the example is correct. I traced it by hand; nothing was run. Paths below are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
>
> How the order is read: get_class_order (ui\\right_panel.py:361-371) reads column 1 of the class table row by row. Dragging a row (ui\\reorderable_class_table.py:26-60) really moves it in the table's data, so the order read is the order on screen when the button is clicked. The ID cell only ever holds digits, because the active-class marker goes in the alias column (right_panel.py:309-314).
>
> Tracing the example: the order is [4,0,1], so the lookup is {4:0, 0:1, 1:2} (core\\segment_manager.py:377). Each segment is looked up once (:379-382), so IDs are not remapped twice (4 becomes 0 and stays 0). Aliases are rebuilt as {0:'car'} (:385-390), and the next free class ID becomes 3 (:391). This matches the card exactly.
>
> P0: yes. Export uses the class IDs in ascending order plus the aliases (ui\\managers\\save_export_manager.py:400-424), and the app auto-saves when you move to another image (ui\\managers\\file_navigation_manager.py:271-274). So this renumbering decides the class numbers and label names written to NPZ, YOLO and COCO files. If segments and aliases were not renumbered together, saved labels would be silently wrong.
>
> GAPS the card should add as extra Given/When/Then cases (they are missing, not wrong):
> (1) Aliases are dropped, not moved, for any class not in the table (:385-390). Example: aliases {4:'car', 7:'truck'} with table [4,0,1] gives {0:'car'}, and 'truck' is lost. This can really happen: COCO categories with no annotations (core\\file_manager.py:626-637), aliases restored from an NPZ (:335-343), or deleting every segment of a named class (delete_segments at :58-63 leaves aliases behind).
> (2) With an empty table, clicking the button wipes all aliases. The single-view path has no guard (ui\\managers\\segment_table_manager.py:96-100), but the multi-view path returns early (ui\\main_window.py:6478-6479). The two paths behave differently.
> (3) The active class and last-toggled class are not renumbered (:375-391 never touches them), and new segments use the active class (:36-39). In the example, if class 4 was active, the next segment drawn becomes a new unnamed class 4 instead of 'car'. If class 0 was active, new segments silently go to 'car'.
> (4) The dragged order is temporary. Any list refresh puts the table back in ascending ID order (segment_table_manager.py:344-359), and export ignores table order. The tooltip 'drag to reorder channels for saving' (right_panel.py:182) is only true once Reassign is clicked. That is a mismatch between the UI text and the code, not a manipulation attempt.
> (5) Reassign has no undo entry (core\\undo_redo_manager.py:65-82). Undoing an erase made before a reassign brings segments back with their old IDs (snapshots taken at segment_manager.py:525/677, restored at undo_redo_manager.py:596-597). Video propagation also keeps the old IDs (ui\\managers\\propagation_manager.py:453-466).
> (6) A segment whose class is not in the table keeps its ID and could clash with a new one (:381). This can't happen in single view.
>
> Questions for an SME: should aliases for classes not in the table survive a reassign? Should the active class be renumbered or cleared?
>
> No instruction-like text found in the cited lines.

### RULE-016: Shape rasterization before export (truncated vertices, rounded circles)

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. I checked every number in memory (python -B, no files written; numpy 2.2.6, cv2 4.12.0). The bbox handler (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\handlers\\single_view_mouse_handler.py:384-432) stores the four float QRectF corners as a Polygon. rasterize_polygon (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:182-184) casts them to int32, giving (10,10),(20,10),(20,30),(10,30), and fillPoly (edges included) fills 231 px. rasterize_circle (196-202) gives center (20,21), r=5, 81 px, and returns None when r\<=0, which line 241 skips. create_final_mask_tensor ORs each class into its channel (241-244). COCO bbox [10,10,11,21] and YOLO w=11/W are also correct, but they come from code outside the citation: segment_manager.py:303-305 plus E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\coco.py:65,72 and yolo_detection.py:27-31.
>
> Gaps to fix on the card: (1) 'Vertices become (10,10)-(20,30)' is loose. The stored vertices stay floats (handler:428); only the temporary fillPoly input is truncated. (2) 'Rounded' is really Python's round-half-to-even: round(0.5)=0 means the circle vanishes, round(2.5)=2, round(20.5)=20. A web port using Math.round would differ on ties, so add a tie example. (3) Truncation goes toward zero, not floor (-0.7 -\> 0), which matters for drags past the image edge. (4) The example assumes crop and pixel priority are off (save_worker.py:76-79, segment_manager.py:247-250) and that the circle fits inside the image. (5) COCO 'area' for this box is 200 (contourArea), not 231.
>
> P0 JUSTIFIED: no. Through the compliance lens, no regulator, auditor, or finance controller would notice. LazyLabel is a general CV annotation GUI (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\README.md:6). A grep for medical/clinical/FDA/HIPAA/regulatory finds nothing relevant. No money moves and no regulation is enforced. The rule does not guard data integrity: it prevents no loss or corruption. It is a sub-pixel output-fidelity convention, and changing it moves label edges by at most about 1 px. The polygon truncation is mostly a technology artifact (cv2.fillPoly needs int32 points and numpy's cast truncates), and it is inconsistent with the explicit rounding for circles, so it looks like an accident rather than policy. As P0 it would force the web rewrite to bit-match OpenCV's fill and circle edge rules, which is costly verification with no compliance payoff.
>
> Recommend P1: a golden-master pixel-parity fixture using these values plus a round-half-to-even tie case. Split 'OR-merge of same-class segments into one channel' into its own format-contract rule (P1). A nearby candidate that does touch data integrity: after an erase, leftover components of 10 px or fewer are silently dropped (segment_manager.py:786). The duplicate fillPoly calls at main_window.py:2320-2324 and 2380-2383 are only selection hit-testing, not export. No instruction-like text or credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> VERDICT: The rule is faithful. All of its concrete values are correct, but it has gaps that a P0 behavior contract must close. P0 is justified on data-integrity grounds.
>
> HOW I CHECKED: I read the cited ranges and the full save and export path. Then I re-ran the exact operations in memory using the project venv (numpy 2.2.6, OpenCV 4.12.0, PyQt6 QRectF). I imported no project modules and wrote no files.
>
> WHAT MATCHES (every example value came out exactly the same):
> (1) Box vertices. The normalized QRectF corners are stored as floats [[10.7,10.2],[20.9,10.2],[20.9,30.8],[10.7,30.8]] (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:394-431). The int32 cast at E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/core/segment_manager.py:182 turns them into (10,10),(20,10),(20,30),(10,30).
> (2) Box fill. cv2.fillPoly (:184) fills 231 px with edges included. Dragging the box in the reverse direction gives the same result. The cast really truncates toward zero, not floor: -0.7 becomes 0 and -1.9 becomes -1.
> (3) Box exports. boundingRect gives COCO bbox [10,10,11,21] and YOLO width = 11/w.
> (4) Circle. The radius is int(round(5.4)) = 5 and the center is (20,21). The filled cv2.circle has 81 px. OpenCV's filled-circle count matches the number of integer points with x^2+y^2\<=r^2 for r=1..10.
> (5) Zero radius. A radius \<= 0 returns None (:196-198), and that segment is skipped at :241.
> (6) Class merge. All segments of a class are OR-ed into that class's channel (:241-244).
>
> GAPS AND REQUIRED AMENDMENTS:
> (a) Tie rounding is not specified. Python round() rounds halves to even, not up. Center 20.5 becomes 20 (half-up would give 21). A radius of 0.5 becomes 0, so the circle is dropped (half-up gives 5 px). A radius of 2.5 becomes 2, giving 13 px instead of 29. The example avoids ties. Ties seem plausible at 2x zoom or with fractional HiDPI positions (not verified). A web rewrite using Math.round would silently give different results. Add a tie case.
> (b) "Vertices become (10,10)-(20,30)" is misleading. The stored vertices stay floats (single_view_mouse_handler.py:428). The truncation only happens temporarily inside rasterize_polygon.
> (c) The COCO and YOLO claims are correct, but they rely on code outside the citation:
> - segment_manager.py:254-315 (create_instance_contours)
> - E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/core/exporters/coco.py:65-72
> - E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/core/exporters/yolo_detection.py:27-33
> They also only hold under two conditions the rule should state:
> - No crop is active. The crop step (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/core/file_manager.py:712-739) runs after rasterization (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:412-417 and E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/workers/save_worker.py:76-79).
> - No pixels are lost to another class through pixel priority (segment_manager.py:247-250).
> Also, COCO "area" is contourArea = 200, not 231, so tests must not assert 231 there.
> (d) Zero-radius reachability. Circle creation rejects radius \< 1.0 (single_view_mouse_handler.py:476). But dragging the radius handle has no minimum (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/managers/edit_mode_manager.py:215-217). So the radius-rounds-to-0 case can happen, and the segment then silently disappears from every export.
> (e) Minor. The box comes from the rubber-band rect as last set on mouse move (single_view_mouse_handler.py:202-205), not from the release point. Boxes smaller than 1 px in either dimension are dropped (:384).
> (f) Existing tests (E:/GitHub/LazyLabel/legacy/lazylabel/tests/unit/core/test_segment_manager.py:42-71) only use integer coordinates. They do not lock in truncation, edge-inclusive pixel counts, or tie rounding, so new characterization tests are needed.
>
> WHY P0: This rasterization decides the pixels of every export. NPZ writes the mask tensor directly. COCO, YOLO detection and segmentation, Pascal VOC and CreateML all take their contours and boxes from these masks (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:114-136). A rewrite using a different convention would silently shift ground-truth labels by a pixel or drop circles, with no error. Examples: anti-aliased canvas drawing, half-pixel centers, edges left out, or half-up rounding. That makes it a data-integrity guarantee for the tool's main output. It does not move money or enforce regulation.
>
> No instruction-shaped text was found in the cited ranges.

### RULE-017: SAM 2 propagation confidence score (folded card)

**Compliance judge:** P0 no, faithful yes

> Verdict: the card matches the code, but this should not be P0. Demote it to P1 and write a separate card for the gate that decides what gets saved.
>
> FAITHFULNESS (checked against E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\models\\sam2_model.py):
> - A pixel is part of the mask when its logit is above 0 (lines 900 and 1033).
> - Confidence is the sigmoid of the mean of the positive logits (903-905 and 1036-1040).
> - When no logits are positive, confidence is 0.0 during propagation (1042) and 0.5 in add_video_mask (907; also 969 in add_video_points).
> - The arithmetic holds: sigmoid(4.60)=0.990048 and sigmoid(4.59)=0.989949.
> - A result is flagged when confidence \< threshold (strictly less). The threshold defaults to 0.99 (propagation_manager.py:94, 283, 764, 1096). So 0.99005 passes and 0.98995 is flagged, as the card says.
> - The four override values match lines 686-689. The card leaves out dynamic_multimask_via_stability=true (685).
>
> Gaps in the card:
> (a) The threshold and what it triggers are not in the cited lines.
> (b) Nothing downstream ever sees the 0.0 value. An object with no positive logits always has an empty mask, and both consumers drop empty masks before checking the threshold (propagation_manager.py:756-761 and 1092-1093; main_window.py:4513).
> (c) Nothing ever sees the 0.5 value either. Every caller ignores add_video_mask's return value (propagation_manager.py:655, 1046, 1049), and add_video_points has no callers.
> (d) The card understates what flagging does. The 'Keep Flagged Masks' option is off by default (sequence_widget.py:335). With it off, one object below threshold throws away every mask on that frame (main_window.py:4559-4561). Flagged frames are also left out of the bulk NPZ save (main_window.py:4750-4756).
>
> WHY NOT P0 (compliance view):
> - No money moves and no regulation is enforced. This is a desktop image-labeling tool.
> - The score never reaches saved output: save_export_manager.py has no references to confidence or flags, and SequenceViewMode.to_dict (the only place scores would be serialized) is never called.
> - The score is a heuristic over model output, computed under bfloat16 autocast (1008-1011). Exact values vary with hardware and precision, so requiring equivalence to the 5th decimal in every phase would waste verification effort.
> - The override values appear to be upstream SAM2's standard video-predictor defaults. The comment at line 682 says so and the values match the known upstream ones, but sam2 is not installed here, so I could not confirm locally. They are vendor model settings, not business policy.
> - The part an auditor might care about is the gate: auto-labels below 0.99 are discarded and not saved unless the user opts in. That logic lives in propagation_manager.py and main_window.py and deserves its own card. This formula only feeds it.
>
> RECOMMENDED P1 CONTRACT:
> - Pin the formula with a unit test on synthetic logit tensors. None exists today: the tests replace propagate_in_video with fixed confidence values (test_propagation_manager.py:783).
> - Leave the unused 0.0 and 0.5 fallbacks and the vendor override values out of the contract.
>
> No instruction-like text or credentials were found in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: The card matches the code. Paths below are relative to E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ and E:\\venv\\lazylabel\\lib\\site-packages\\sam2\\.
>
> What I checked in the code:
> - The mask is logits strictly greater than 0 (sam2_model.py:1033).
> - Confidence is sigmoid of the mean of only the positive logits, not the mean of the sigmoids (sam2_model.py:1036-1040).
> - With no positive logits, propagation returns 0.0 (sam2_model.py:1041-1042). add_video_mask uses the same formula but returns 0.5 (sam2_model.py:903-907). add_video_points is the same (sam2_model.py:965-969, not cited).
>
> The numbers are right:
> - sigmoid(4.60) = 0.9900482 and sigmoid(4.59) = 0.9899492.
> - The break-even mean logit is ln(99) = 4.59512.
> - The default threshold is 0.99 (propagation_manager.py:94, sequence_view_mode.py:90, sequence_widget.py:388).
> - The test is a strict \< (propagation_manager.py:764 and :1096, sequence_view_mode.py:315, main_window.py:4519). So 0.99005 passes and 0.98995 is flagged.
>
> The precision holds. The code runs under bfloat16 autocast (sam2_model.py:1010), but SAM2 converts the mask logits to float32 (sam2_video_predictor.py:1128, modeling/sam2_base.py:372). I checked with torch: in bfloat16, both 4.59 and 4.60 round to 4.59375 and both give 0.98828, so the example only works because the logits are float32.
>
> The overrides at sam2_model.py:683-690 match the card. The card leaves out the switch that turns the feature on (dynamic_multimask_via_stability=true).
>
> Gaps the card doesn't mention (these are omissions, not errors):
> 1. The pass/flag decision happens outside the cited lines. Add propagation_manager.py:764-776 and :1096-1101, and main_window.py:4554-4569.
> 2. A frame's score is the lowest score of its objects (sequence_view_mode.py:307-313, main_window.py:4554). "Keep Flagged Masks" is off by default (sequence_widget.py:335). So if one object falls below 0.99, every mask on that frame is thrown away (main_window.py:4559-4561), which is stronger than just flagging.
> 3. The 0.0 score for an empty mask never gets compared to the threshold. Empty masks are dropped first (propagation_manager.py:756-761 and :1092-1093, main_window.py:4513).
> 4. The 0.5 fallback has no effect anywhere. Nothing uses add_video_mask's return value (propagation_manager.py:655, :1046, :1049), and nothing calls add_video_points.
> 5. The score is computed on logits upsampled to the full video resolution (sam2_video_predictor.py:395-400). fill_hole_area=8 sets small holes to +0.1 (utils/misc.py:325). Those count as positive logits and pull the mean down. If the CUDA extension fails, hole filling is skipped with only a warning (misc.py:326-333), so the score depends on the environment.
> 6. The code does not round the score. 0.99005 is rounded for display only; the tooltip shows 4 decimals (timeline_widget.py:487).
>
> P0: Justified, but only under data integrity, and the scope should be narrower. Nothing here involves money or regulation. With the defaults (threshold 0.99, Keep Flagged off), this score alone decides whether a frame's propagated masks are kept or thrown away. That means it controls what goes into the saved annotation dataset. The 0.99 default is tuned to this formula, which skews high because it averages only the positive logits. A rewrite that switches to SAM2's IoU or object score, or to a mean of sigmoids, would silently change the saved labels.
>
> The P0 contract should cover four things: the formula on given logits, the strict \<, the lowest score across a frame's objects, and discarding a frame's masks when any object fails. It should leave out the unused 0.5 fallback. The Hydra overrides should be treated as fixed upstream model settings, not as a rule to re-implement.
>
> I found no text in the cited lines that looked like instructions to an AI tool.

### RULE-018: SAM 2 frame staging numbering gap

**Compliance judge:** P0 no, faithful yes

> FAITHFUL (checked against the code). In E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\models\\sam2_model.py:777-779, each staged file is named by its position in the list (f"{i:05d}.jpg"). At :797-802, if a file is not a JPEG, is not in the image cache, and cv2.imread returns None, the code hits `continue`. Nothing is written for that index and later files keep their numbers, so the numbering has a gap. Meanwhile :757 still keeps every original path in video_image_paths. Cached frames (:782-787) and JPEGs (:788-796, symlinked or copied with no readability check) never reach this path, so "unreadable non-JPEG" is right. The Given should strictly also say "not in image_cache". The rule's "if SAM 2 indexes by sorted position" can be dropped: the installed library confirms it. E:\\venv\\lazylabel\\Lib\\site-packages\\sam2\\utils\\misc.py:243-252 lists the *.jpg files, sorts them by number, and uses list position as the index. So with 00000.jpg and 00002.jpg, SAM 2 sees only 2 frames and its frame 1 is c.png. sam2_model.py:1013-1044 passes that index through unchanged. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\propagation_manager.py:736 and :780-781 then file that mask under timeline 1 / b.png, and c.png's own slot never gets a result. "No reference size filter" is the correct condition. When reference_dimensions is set, propagation_manager.py:227-256 reads each frame first and drops unreadable ones while keeping the index maps correct. In that case the gap only happens if no reference size was captured (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:3863-3875 can return None), or if a file becomes unreadable between init_sequence and the later staging at propagation time (:643) or per chunk (:1028). The chunk index mapping at :1072/:1104-1108 has the same mismatch. The parameters match the code: JPEG quality 95 at :786 and :803, symlink-else-copy at :789-796. Minor wording issue: the method is init_video_state, not video-predictor init.
>
> P0 NOT JUSTIFIED (compliance view). This moves no money and enforces no regulation. It does not protect data integrity; it breaks it. The staging scheme (numbered JPEG names, quality-95 re-encoding, a temp folder deleted at sam2_model.py:851-861) exists only because SAM 2's loader needs a folder of numbered JPEGs. That makes it a technology adapter, and the skip is plain error handling, so neither is a business rule. Original images and saved annotations are never re-encoded, so no retention or image-quality policy is involved. An auditor or dataset owner would care that masks can be silently attached to the wrong image. But they would want that fixed, not kept. If a rewrite quietly closed the gap, nobody with a compliance stake would object. As a P0 equivalence contract, this card would force the new system to reproduce a mislabeling bug and waste verification effort. Recommendation: reclassify it as a defect finding (do not preserve). Replace it with the real P0 data-integrity rule: every propagated mask must be attached to the exact source image SAM 2 computed it from. An unreadable frame must either be excluded with gap-free renumbering and updated index maps (as the reference-size pre-filter already does), or the run must fail. No instruction-like text was found in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: Faithful. I checked each claim against the cited code and against the SAM 2 package installed in E:\\venv\\lazylabel.
>
> (1) Staging names. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\models\\sam2_model.py:777-779 names each file f"{i:05d}.jpg", where i is the frame's position in the input list. Lines 765-768 delete the old temp dir and create a fresh one, so no leftover file can fill a gap.
>
> (2) Skip without renumbering. A frame that is not in the image cache and does not end in .jpg/.jpeg is read with cv2.imread. If that returns None, lines 800-802 hit `continue`: nothing is written at that position and later frames keep their numbers. For [a.png, b.png (unreadable), c.png] the temp dir holds exactly 00000.jpg and 00002.jpg.
>
> (3) The "no reference size filter" condition is correct and necessary. With reference_dimensions set, E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\propagation_manager.py:232-235 drops frames cv2 cannot read, and 253-256 renumbers the rest without gaps. With reference_dimensions=None, lines 263-268 build a plain 1:1 mapping and never check readability.
>
> (4) The Then is confirmed, so the "if SAM 2 indexes by sorted position" hedge can be removed. E:\\venv\\lazylabel\\Lib\\site-packages\\sam2\\utils\\misc.py:243-252 lists the .jpg files, sorts them by integer stem and numbers them 0, 1, 2 in that order. E:\\venv\\lazylabel\\Lib\\site-packages\\sam2\\sam2_video_predictor.py:60 then sets num_frames=2, so SAM 2 frame 1 is c.png's pixels. On the LazyLabel side, sam2_model.py:757 saves the full, unfiltered path list before staging. So propagation_manager.py:780-781 gives image_path=b.png, line 736 maps SAM 2 frame 1 to timeline frame 1, and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4486-4566 saves the mask to timeline frame 1, which is b.png.
>
> Parameters match: JPEG quality 95 at sam2_model.py:786 and :803; symlink at :791, falling back to copy2 on OSError at :796.
>
> GAPS IN THE CARD (missing detail, not errors):
> (a) Every frame after a gap is off by one per gap, not just frame 1. c.png's own timeline frame never gets a result: SAM 2 has 2 frames, while total_frames and video_frame_count (sam2_model.py:1104-1106) both say 3.
> (b) If a reference frame comes after the gap (for example SAM 2 index 2), _get_image_feature reads images[2] (sam2_video_predictor.py:713) and raises IndexError. sam2_model.py:913-915 catches and logs it, and propagation_manager.py:655 ignores the return value, so the reference is lost silently.
> (c) Streaming mode has the same gap (propagation_manager.py:1028-1031 and 1104-1108).
> (d) The cache branch (sam2_model.py:782-787) cannot be reached from the UI. _sequence_memory_cache is read at main_window.py:4084 and 4886-4893 but never assigned. So the "cached frames at quality 95" parameter is dead in practice, and the implied "b.png not cached" condition always holds.
> (e) Corrupt .jpg files are symlinked or copied without a check. They cause no gap, but SAM 2's loader then raises and init_video_state returns False (sam2_model.py:843-849).
> (f) In the UI, the no-filter state only happens when QImageReader cannot read the header size of any reference frame (main_window.py:3863-3875; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\modes\\sequence_view_mode.py:233-235). It is reachable but uncommon.
> (g) "Initializes the video predictor" should say init_video_state, which runs lazily when propagation starts (propagation_manager.py:643-646). init_video_predictor is a separate step.
>
> P0: Justified on data-integrity grounds. The gap silently attaches a mask computed from one image to a different image's annotation, which corrupts the labeled output. But it is a legacy defect, not behavior to copy. The P0 contract should be the rule "each propagated mask belongs to the image it was computed from, and unreadable frames are either dropped with gap-free renumbering or marked SKIPPED." JPEG quality 95 and symlink/copy are SAM 2 adapter details and should be left out of the P0 equivalence set.
>
> No instruction-like text or credentials appear in the cited lines.

### RULE-022: Only mask-based segments seed propagation (folded card)

**Compliance judge:** P0 no, faithful yes

> P0 is NOT justified. No regulator, auditor or finance controller would care if this changed silently. It moves no money, enforces no regulation and guards no data. It only decides which segments feed the SAM2 mask-propagation helper in a labeling tool. Propagated masks stay in memory, must pass a confidence threshold, and are written only when the user scrubs frames or clicks Save All, which skips flagged frames (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4633, 4741-4756). The 1..N object ids are just internal tracking handles: any unique ids that keep each object linked to its class would give the same result. The 'No valid segments in reference frames' message is a UI notice.
>
> This also looks like a limitation, not a deliberate policy. On the open, unsaved reference frame, polygons, boxes and circles have no mask, so they are silently dropped. Once saved and reloaded, the same shapes come back as masks and do seed propagation: every loader in the chain returns 'Loaded' mask segments (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:130-205). If the auto-polygon setting is on (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:30, off by default), even AI results are stored as polygons without masks (main_window.py:1808-1822) and dropped too. Making this a P0 contract would force every phase to reproduce a likely defect. Suggest P2 (feature parity).
>
> The rule is FAITHFUL, with caveats:
> (1) The filter is `mask is not None and mask.any()` (main_window.py:4275-4276), so all-zero masks are excluded as well.
> (2) The open frame uses its in-memory segments only if that list is not empty (3651-3656). If the user deleted every segment without saving, the old saved file is used instead (3663-3666). The card leaves this out.
> (3) 'Other references use saved files' is correct. The _sequence_mask_cache lookup at 3659-3661 is dead code: the attribute is never assigned anywhere. 'Saved files' means any supported format (NPZ first, YOLO detection last), not only NPZ.
> (4) Ids start at 1 and go up only for segments that pass the filter (4261, 4281-4282). 'Reference-frame order' means the order frames were marked as references, not timeline order (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\modes\\sequence_view_mode.py:103-105). So 'object id 1' holds only if no earlier-marked reference has masks.
> (5) With no mask segments, the app shows the message and ends propagation (4294-4298).
> (6) The Given/When/Then holds with default settings: AI segment has a mask (1825-1829), drawn polygon has none (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\polygon_drawing_manager.py:200-205).
> Citation note: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\handlers\\single_view_mouse_handler.py:426-431 is the bounding-box tool, not the hand-drawn polygon tool. It also stores no mask, so the substance holds.
>
> Separate data-integrity candidate (not this rule): the saved object-to-class map is never cleared (sequence_view_mode.py:128-159) and a class is recorded only if the id is not already there (main_window.py:4523-4533). Ids restart at 1 on every run, so the fallback class lookup (main_window.py:3721-3724) can give propagated masks an outdated class. The save path (4788-4796) uses the current propagation data or class 0, so the risk is mainly in what the user sees and in frames saved while scrubbing.
>
> No instruction-like text or credentials were found in the cited lines.

**Fidelity judge:** P0 no, faithful yes

> FIDELITY: The Given/When/Then matches the code for the case it describes. I traced it myself. _on_propagate_requested (main_window.py:4011-4120) never saves first, so the segments really are unsaved when propagation starts. For the open frame, _load_segments_for_reference_frame returns segment_manager.segments when the paths match and the list is not empty (3651-3656). Only segments where `mask is not None and mask.any()` are kept (4276). The object id counter starts at 1 and keeps counting across reference frames (4261, 4281-4282). If nothing is kept, the user sees "No valid segments in reference frames" and propagation ends (4294-4298). Polygon, bbox and circle tools all create segments with mask=None (single_view_mouse_handler.py:427-431 and 522-523, polygon_drawing_manager.py:201-205, single_view_mode.py:279-283). Nothing adds a mask to those segments before propagation: the display code only reads them (3796-3830), and merge_segments_by_class only runs when a frame is loaded (3603, 3612). So the AI mask becomes object 1 and the polygon is skipped, whatever order they were drawn in.
>
> Fixes needed before the card becomes a contract:
> (1) "Reference-frame order" is the order frames were marked as references, not frame-number order. It is the key order of the _reference_annotations dict (sequence_view_mode.py:103-105, 242). Re-marking a frame keeps its original place. "Add all before" adds frames in timeline display order (main_window.py:3922-3928). Inside one frame, ids follow the segment list order. "Object id 1" in the Then is only true if the open frame is the first-marked reference that has masks.
> (2) The mask must also have at least one pixel set. All-empty masks are skipped too.
> (3) The in-memory segments are used only if the list is not empty. An open reference with zero segments falls back to its saved file. But an open frame that holds only polygons does not fall back, and contributes nothing even if its saved file has masks.
> (4) Other references: the cache branch (3659-3661) never runs, because _sequence_mask_cache is never set anywhere in legacy/lazylabel. These frames load through the FileManager chain (file_manager.py:128-136). Saving rasterizes polygons and circles into masks (segment_manager.py:232-244), and every loader returns mask segments. So a polygon on a saved reference that is not open DOES seed propagation. The title "Only mask-based segments seed propagation" claims more than the code does. The exclusion only hits unsaved shapes on the open frame, including AI results turned into polygons when auto_polygon_enabled is on (main_window.py:1808-1822).
> (5) Order of side effects: before the empty check, the previous run's propagated masks, confidence scores, frame statuses and propagation-manager state are already cleared (4235-4239; sequence_view_mode.py:143-159). So the "No valid segments" path still throws away unsaved results from the last run.
> (6) The same message can also appear later, when the background worker adds zero annotations (4333-4338; propagation_manager.py:401-404).
> (7) The cited single_view_mouse_handler.py:426-431 is the bbox tool, not the freehand polygon tool. It creates the same mask=None segment, so the evidence still holds.
> (8) The annotations captured when a frame is marked as reference (sequence_view_mode.py:248-267) are never used to seed propagation. get_reference_annotations has no callers.
>
> P0: Not justified. This code picks which masks are sent to SAM2 video tracking and gives them temporary tracker ids. It does not move money or enforce compliance, and it does not check or protect stored data. obj_id is converted back to class_id when results are saved (main_window.py:4788-4806) and is never written to disk. Polygons being ignored on the open frame but used once saved looks like a defect. Making it a P0 equivalence contract would force the rewrite to copy that bug. Recommend P1, with this SME question: "Should unsaved polygon, bbox and circle segments on the open reference frame seed propagation, the way the same shapes do once saved?" No instruction-like text was found in the cited lines.

### RULE-023: Crop is clamped to the image and blanks everything outside it on save, including the last row and column

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes (High confidence) — every claim reproduces against the code.
>
> - Rounding, clamping, ordering: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\crop_manager.py:127-140 rounds, clamps x to 0..img_width-1 and y to 0..img_height-1, then swaps to enforce x1\<=x2, y1\<=y2. For a 1000x800 image and input (-10,50)-(1200,700): x1=0, x2=min(1200,999)=999, y1=50, y2=700. Stored at crop_manager.py:143-145; the notification f-string at crop_manager.py:152 emits exactly "Crop applied: 0:999, 50:700".
> - Blanking semantics: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:720-739 copies the tensor, then clears rows [:y1] and [y2:] and, within the kept row band, columns [:x1] and [x2:]. Net kept region is rows y1..y2-1 and columns x1..x2-1 — so rows 50-699 and columns 0-998 in the example. Because x2 is clamped to width-1 and the right-clear branch fires whenever x2 \< w, the crop's right column and bottom row are always cleared; a "crop the whole image" can never retain column 999 or the last row. The card states this correctly.
> - Save-time application: save_export_manager.py:412-417 applies it to the single-view ExportContext; file_manager.py:48-49 and :90-91 do the same on the other save paths. It runs on a copy, so in-memory segments are untouched.
> - 5x5 drag minimum: single_view_mouse_handler.py:553 is `rect.width() \> 5 and rect.height() \> 5`, and the rect is built from normalized scene positions (handler lines 170-175, 264-265), so the threshold is image pixels, not screen pixels. Typed coordinates bypass this check entirely — the card correctly scopes the threshold to drawn crops.
> - "Only the current image" and the "unreachable legacy loader" nuance both check out. The live loader is load_image_by_path (file_navigation_manager.py:254+, used by FastFileManager); it calls _reset_state (line 279), which nulls current_crop_coords at main_window.py:2156, and never restores from crop_coords_by_size. The restore block at file_navigation_manager.py:227-238 sits in load_selected_image, reachable only via right_panel.py:206 (file_tree.doubleClicked -\> image_selected) -\> main_window.py:947, but that QTreeView is hidden at right_panel.py:121-122 ("Hidden, for backward compatibility") because FastFileManager replaced it at right_panel.py:117-118. Effectively dead. crop_manager.get_crop_for_image_size (line 408) has no callers at all.
>
> Two things the card does not mention, both worth recording separately: crop_manager.py:107 and :88 call _apply_multi_view_crop_coordinates and remove_multi_view_crop_visual, which are defined nowhere in the repository — multi-view crop and clear_crop/reset_state in multi-view will raise AttributeError. No injection-shaped text was found in any cited line; comments read as ordinary developer notes.
>
> P0 NOT JUSTIFIED. Compliance lens: no regulator, auditor, or finance controller has a stake here. LazyLabel is a desktop image-annotation tool for building ML datasets — the rule moves no money, satisfies no regulatory or reporting requirement, and touches no audit trail, retention window, authorization boundary, or personal/financial data.
>
> The only candidate P0 pillar is "guards data integrity," and it fails on inspection. The crop is a per-session, user-initiated, fully reversible authoring filter (clear_crop at crop_manager.py:70-100; state nulled on every image load) applied to a copy of the mask tensor at export time. It enforces no invariant over stored records and prevents no corruption — it is a user preference about what to write out, closer to a display/export option than a control.
>
> Worse, the exact behavior the card would enshrine as the contract is an off-by-one, not a policy. Clamping to width-1/height-1 (crop_manager.py:131-134) combined with exclusive slicing at x2/y2 (file_manager.py:728-737) means the last column and row are unconditionally discarded, while the UI overlays drawn at crop_manager.py:200 and :218 use the same exclusive convention and so hide the loss from the user. Making that a P0 behavior contract would compel the rewrite to prove equivalence against a probable defect and would burn verification budget on reproducing it byte-for-byte.
>
> Recommendation: demote to P2 (functional-equivalence, user-visible behavior worth a regression test on the clamp/ordering and the kept-region formula), and raise two defect tickets: (1) the inclusive-input / exclusive-output off-by-one that makes a full-image crop lossy, and (2) the missing multi-view crop methods.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL — every claim re-derived independently from the cited code; the worked example reproduces exactly.
>
> Clamp/order (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\crop_manager.py:127-152): round() -\> x=max(0,min(x,img_width-1)), y=max(0,min(y,img_height-1)) -\> swap if x1\>x2 / y1\>y2 -\> store in current_crop_coords and crop_coords_by_size[(w,h)] -\> notify f"Crop applied: {x1}:{x2}, {y1}:{y2}". For a 1000x800 image and input (-10,50)-(1200,700) I get stored (0,50,999,700) and the literal string "Crop applied: 0:999, 50:700" — matches the card verbatim.
>
> Mask blanking (...\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:712-739): top clears rows [0,y1), bottom [y2,h), left cols [0,x1) and right [x2,w) over rows [y1,y2). Net effect is exactly "keep mask[y1:y2, x1:x2], zero the rest". Simulated on a 1000x800 all-ones tensor with (0,50,999,700): kept rows 50-699, kept cols 0-998; column 999 and row 700 are zero. The "always cleared" generalization also holds — because clamping caps x2\<=w-1 and y2\<=h-1 while the slices are end-exclusive, even the maximum crop (0,0,999,799) keeps only rows 0-798 and cols 0-998. The last row and last column can never survive an active crop. That off-by-one is real and correctly stated.
>
> On save: the crop is applied from crop_manager.current_crop_coords in the foreground export path (...\\ui\\managers\\save_export_manager.py:412-417) and consistently in the other two save paths I checked — ...\\core\\file_manager.py:48-49 (save_npz, which overwrites \<image\>.npz via np.savez_compressed at line 62), :90-91 (save_bb_txt), and ...\\ui\\workers\\save_worker.py:76-79 — so "on save" is not over-broad.
>
> Per-image scope: confirmed. The live loader ...\\ui\\managers\\file_navigation_manager.py:254-377 (load_image_by_path) calls mw._reset_state() at :279, which nulls current_crop_coords (...\\ui\\main_window.py:2148-2156), and never restores from crop_coords_by_size.
>
> The card's sharpest claim — "crops are remembered per image size but only the unreachable legacy loader restores them" — checks out, which is the strongest evidence the author actually read the code. The restore block (file_navigation_manager.py:227-238) lives only in load_selected_image, reachable only via right_panel.image_selected, which is emitted only by file_tree.doubleClicked (...\\ui\\right_panel.py:206) on a QTreeView that is constructed hidden "for backward compatibility" (right_panel.py:120-122). The reachable path is FastFileManager.fileSelected -\> image_path_selected -\> _load_image_from_path (main_window.py:1458-1459) -\> load_image_by_path, which resets and never restores. So the size-keyed dict is effectively write-only in the shipping app.
>
> The 5x5 threshold is correct: ...\\ui\\handlers\\single_view_mouse_handler.py:553 is `if rect.width() \> 5 and rect.height() \> 5` — strictly greater, both dimensions.
>
> Two precision nits for the card (neither makes the Given/When/Then wrong): (1) "Crop corners are rounded" is literally what crop_manager.py:127 does, but round() is a no-op in practice — the text path already yields ints (border_crop_widget.py:119,126, free-text QLineEdits parsed with int(), no min/max, so the negative/over-max Given is genuinely reachable) and the drag path already truncates with int() at single_view_mouse_handler.py:554-555. A drag ending at x=999.7 becomes 999 by truncation, not rounding; the rewrite should be told "truncate on drag, ints on text entry", not "round". (2) Unstated edge case: a drawn rect \<=5px in either dimension is silently discarded AND the app stays in crop mode (crop_mode is never set False, _set_mode("sam_points") is skipped) — worth adding to the card as a Then.
>
> Adjacent defect found while checking scope (outside the card, for the parent): multi-view crop is broken. crop_manager.py:107 calls self._apply_multi_view_crop_coordinates(...) and lines 88/426 call self.remove_multi_view_crop_visual(), and none of those methods is defined anywhere in the source — applying, clearing, or resetting a crop in multi-view mode raises AttributeError. The card's "only the current image" scope is partly true because multi-view crop cannot execute at all.
>
> P0 JUSTIFIED — not money and not regulatory, but it does guard (and, via the off-by-one, silently harms) the integrity of persisted user data. The crop is a destructive, irreversible transform applied at write time to the annotation artifact that is this tool's entire product: save_npz overwrites \<image\>.npz with the zeroed tensor, and autosave fires it unattended on every image change (file_navigation_manager.py:271-274, auto_save defaults True). A rewrite that keeps the last row/column, or that restores the size-keyed crop on load (making the currently-dead restore path live), silently changes the content of every exported mask with no user-visible signal. That is exactly the kind of contract a P0 exists to pin down — and the rewrite team needs an explicit decision on whether to replicate the last-row/last-column drop or fix it.
>
> SME questions to attach: (a) Is dropping the final row and column intended, or a clamp/exclusive-slice off-by-one to fix in the rewrite? (b) Should a crop persist across images of the same size (restoring the currently-unreachable behavior) or stay per-image as the shipping app behaves? (c) Should the drag path round instead of truncate?
>
> INJECTION SCAN: clean. I grepped all cited files plus border_crop_widget.py for instruction-shaped text ("SYSTEM:", "ignore previous", "false positive", "approved", directives aimed at a reviewer/AI) and found none. No credentials appear in any cited line, so no masking was required.

### RULE-023: Crop removes annotations outside the rectangle but keeps full-image coordinates (folded card)

**Compliance judge:** P0 no, faithful yes

> VERDICT: not P0 under the compliance lens; the card is faithful to the single-view code, with scope gaps. All paths are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
>
> P0 NOT JUSTIFIED. The rule moves no money and enforces no regulation. The crop only zeroes the label mask (core/file_manager.py:712-739). The source image is never changed or exported, so this is not a redaction or de-identification control. ExportContext.crop_coords (core/exporters/__init__.py:107) is never read by any exporter. No regulator, auditor or finance controller would notice if this changed. The people who would notice are whoever consumes the dataset, which makes it a P1 output-equivalence behavior. It also does not guard integrity. It is a lossy export filter the user turns on. The only guard-like piece is the clamp that keeps numpy slice indices in range, which is ordinary input cleanup.
>
> The card also packs UI gesture details into a P0 contract: the \>5 px drag minimum (ui/handlers/single_view_mouse_handler.py:553), int truncation (554-555), and the switch to sam_points mode (558). Worse, as a must-match contract it would lock in a likely off-by-one. The clamp to width-1/height-1 (ui/managers/crop_manager.py:131-134) combined with exclusive slices (file_manager.py:728-737) means any active crop always drops the last column and row. A user can never keep the full image (the adjusted 0:99 is shown back to them at crop_manager.py:148). An SME should decide whether that is intended before anyone demands equivalence. The full-image coordinate frame is a real downstream contract, but it belongs to the export-format rules, not this crop rule.
>
> FAITHFUL. Trace for the Given:
> - ui/widgets/border_crop_widget.py:115-135 parses '0:100' to (0,0,100,100).
> - ui/main_window.py:904-906 routes that to apply_crop_coordinates, and crop_manager.py:131-134 clamps it to (0,0,99,99).
> - At save, save_export_manager.py:412-417 applies the crop. file_manager.py:729 zeroes row 99, and 737 zeroes column 99 for rows 0-98.
> - create_instance_contours ANDs each segment with the cropped tensor (core/segment_manager.py:297), so every format respects the crop.
> - cv2.boundingRect then gives (0,0,99,99): YOLO width 0.99 (exporters/yolo_detection.py:27-33), COCO bbox [0,0,99,99] (coco.py:65-72), VOC xmax 99 (pascal_voc.py:46-49).
> - The tensor keeps its full (h,w) shape and exporters divide by the full w/h, so coordinates stay relative to the full image.
>
> The drawn-crop path matches too. The rect is normalized (single_view_mouse_handler.py:264), must exceed 5 px on both axes (553), and is truncated (554-555), then rounded, clamped and swapped (crop_manager.py:127-140), then the mode is set to sam_points (558). Rounding and swapping are no-ops on this path.
>
> CAVEATS THE CARD SHOULD ADD:
> (1) It only holds in single view. Multi-view apply calls _apply_multi_view_crop_coordinates (crop_manager.py:107), and clear/reset call remove_multi_view_crop_visual (88, 426). Neither is defined anywhere, so those calls raise AttributeError. The multi-view save (save_export_manager.py:497-514) and PropagationSaveWorker (ui/workers/propagation_worker.py) never apply a crop.
> (2) The crop is saved per image size (crop_manager.py:144-145) and applied again to every later-loaded image with the same dimensions (ui/managers/file_navigation_manager.py:227-235). Saving those images silently zeroes their out-of-crop annotations, and the loss is permanent once saved. This is the most data-loss-relevant behavior, and the card leaves it out.
>
> No instruction-shaped or injection text in the cited lines, and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: faithful. I re-traced the example myself in single view. All paths are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
> (1) ui\\widgets\\border_crop_widget.py:115-135 parses '0:100' into (0,0,100,100). ui\\main_window.py:904-905 passes that straight to CropManager.apply_crop_coordinates.
> (2) ui\\managers\\crop_manager.py:127-145 rounds (no effect on ints), clamps x to [0,w-1] and y to [0,h-1], giving (0,0,99,99), then swaps if reversed. Line 148 rewrites the text fields to 0:99.
> (3) core\\file_manager.py:728-737 zeroes row 99 ([99:,:,:]) and column 99 ([0:99,99:,:]). The kept region is exactly [y1:y2, x1:x2], with x2/y2 exclusive.
> (4) The only live save path is ui\\managers\\save_export_manager.py:117 then :412-417. Per-object shapes are intersected with the cropped mask (core\\segment_manager.py:297). cv2.boundingRect of the 99x99 block is (0,0,99,99). So YOLO width is 99/100 = 0.99 (core\\exporters\\yolo_detection.py:31), the COCO box width is 99 and the VOC xmax is 99.
> (5) No exporter reads ctx.crop_coords; it appears only as a field at core\\exporters\\__init__.py:107. Every exporter divides by the full image width and height, so coordinates stay in the full-image frame.
> Consequence: x2/y2 can never equal the width/height, so any active crop always loses the last row and column. This is a real off-by-one the contract must pin.
> Drawn crops: the pixmap is at scene origin and never moved (ui\\photo_viewer.py). The rectangle is .normalized() (ui\\handlers\\single_view_mouse_handler.py:264). The size gate is a strict \>5 on the float rectangle (:553). Edges are cut with int() (:554-555), then rounded, clamped and swapped as above. Mode becomes sam_points, the 'AI' button (ui\\control_panel.py:254-256), at :558.
>
> GAPS to add during verification (none contradict the card):
> (a) The \>5 gate checks the drag before clamping. The press must land inside the image (:106-110) but the drag can leave it. Press at x=99.4, release at x=110: the gate passes, yet the crop clamps to x1=x2=99. That zero-width crop wipes every annotation from the export.
> (b) The mode switch only happens when the gate passes. Otherwise the mode stays 'crop' and any earlier crop is kept.
> (c) The swap at crop_manager.py:137-140 can never run: the widget already swaps (border_crop_widget.py:129-132), and cutting and clamping never reverse the order. round() never changes a value either.
> (d) Scope is single and sequence view only. Multi-view saves never apply the crop (main_window.py:6606-6632; save_export_manager.py:497-514). Applying a crop in multi-view calls _apply_multi_view_crop_coordinates (crop_manager.py:107), which is not defined anywhere. The plain-English line does not say this.
> (e) The crop is stored per image size and restored on navigation (ui\\managers\\file_navigation_manager.py:227-235). It silently applies to every image of the same size.
> (f) If the crop removes every object, the YOLO/COCO/VOC exporters return None and export_all never deletes files (core\\exporters\\__init__.py:189-206). Old label files stay on disk while the NPZ is rewritten as zeros (npz.py:16-27).
> (g) ui\\workers\\save_worker.py:76-79 and FileManager.save_npz/save_bb_txt repeat the crop logic but nothing calls them. Do not test against those paths.
>
> P0: justified as data integrity (it does not move money or enforce regulation). The rule decides which label pixels are saved to the exported training-label files and which coordinate frame they use. A rewrite that keeps the last row/column, treats the bounds as inclusive, or writes crop-relative coordinates would silently change or misalign every exported label file.
>
> No instruction-like text and no credentials appear in the cited lines.

### RULE-023: Crop zeroes saved annotations outside the crop (last row and column always lost) (folded card)

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. I checked every claim against the code.
> (1) E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:724-737 sets all channels to 0 in rows [:y1] and [y2:], and in columns [:x1] and [x2:] for rows y1..y2-1. So x1 and y1 are kept, and x2 and y2 are exclusive.
> (2) Single-view save goes from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:117 to _build_export_context (394-430). The crop is applied at 412-417. image_size is the full pixmap size (397, 421). Per-object contours are intersected with the cropped tensor (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:297), so YOLO Detection gets the crop.
> (3) E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\crop_manager.py:131-134 clamps x2 to at most w-1 and y2 to at most h-1. Line 143 is the only place that sets a non-None crop:
> - The mouse path (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\handlers\\single_view_mouse_handler.py:553-556) goes through this clamp.
> - The restore on image change (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:229-234) reuses values saved at line 145.
> - The multi-view branch at crop_manager.py:107 calls _apply_multi_view_crop_coordinates, which is not defined anywhere.
> So (0,0,639,479) really is the largest crop. While any crop is active, the last column and row are always zeroed.
> (4) E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:20,27-32 divides by the full image width and height. No exporter reads ctx.crop_coords. cv2.boundingRect over columns 0-638 and rows 0-478 gives (0,0,639,479), so cx=0.49921875, cy=0.4989583, w=0.9984375, h=0.9979167. All four match the card. The test at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:330-357 also confirms the exclusive x2/y2 convention.
>
> P0: NOT justified under the compliance lens.
> - LazyLabel is a desktop image-labeling tool. This rule moves no money and enforces no regulation. No regulator, auditor or finance controller would care where the crop edge falls in ML label files.
> - It does not guard data integrity either. Zeroing labels outside the crop is something the user asks for, and the screen shows it: the overlays at crop_manager.py:200-223 darken exactly the zeroed area.
> - On top of that sits an off-by-one bug. Clamping to w-1/h-1 plus exclusive slicing means a crop can never include the last column and row. The loss is at most one row and one column (under 0.4% of a 640x480 frame), and boxes shrink by 1 px only for objects touching the edge.
> - Making this a P0 equivalence contract would either force the rewrite to copy a data-loss bug or waste verification effort on a 1-px difference.
>
> RECOMMENDATION: Rate it P1 (output fidelity: labels outside a crop, with exclusive x2/y2, are zeroed; normalization stays full-frame). Add a separate defect card for an expert to decide. Question for the expert: should a crop be able to include the last pixel row and column (clamp x2/y2 to w/h instead of w-1/h-1)? If so, should exports already made with a crop be regenerated?
>
> SIDE FINDINGS:
> - SaveWorker (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:76-79) is exported but never created anywhere, so it is dead code that repeats the crop logic.
> - Any crop in multi-view mode would fail with AttributeError, because the method at crop_manager.py:107 is missing.
> - The cited lines contain no text that looks like instructions aimed at an AI tool.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. I re-derived the behavior from the code and ran the same math in memory with the project venv (OpenCV 4.12.0, numpy 2.2.6, no files written).
>
> (1) Clamp: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\crop_manager.py:131-134 limits x2 to width-1 and y2 to height-1. Both ways of setting a crop go through it: the text widget (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\border_crop_widget.py:135 -\> main_window.py:904-905) and the mouse drag (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\handlers\\single_view_mouse_handler.py:554-556). The only other place that sets current_crop_coords is E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:229-231, which restores values saved at crop_manager.py:145, so they are already clamped. So (0,0,639,479) really is the largest crop on a 640x480 image.
>
> (2) Zeroing: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:724-737 treats x2/y2 as exclusive (rows y2: and columns x2: are zeroed, in every channel). Because x2\<w and y2\<h always hold, column w-1 and row h-1 are zeroed whenever any crop is active, so 'always lost' is accurate. An interior crop (100,50,300,200) keeps x 100..299 and y 50..199.
>
> (3) Path to YOLO: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:92-95 -\> 117 -\> 405-417. The export context keeps image_size=(h,w) at full frame (line 421), and no exporter reads ctx.crop_coords (it is only declared at core\\exporters\\__init__.py:107). YOLO Detection is instance-aware, so its boxes come from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:297 (each segment ANDed with the cropped tensor) and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:27-33, which divides by the full w and h. The citation leaves out this link, but the result is the same.
>
> (4) Simulation: column 639 and row 479 are all zero, boundingRect is (0,0,639,479), and the output line is '0.49921875 0.49895833333333334 0.9984375 0.9979166666666667'. This matches the Then. The rule shortens cy and h to '0.498958...' and '0.997916...'; a byte-exact equivalence test must use the full Python float output.
>
> Caveats (none contradict the rule): 'single-view' also covers sequence mode, because every mode except 'multi' goes to save_single_view_output. Multi-view save (main_window.py:6606-6632) never applies the crop. crop_manager.py:107 calls _apply_multi_view_crop_coordinates, which is not defined anywhere, so applying a crop in multi-view mode would crash with AttributeError. The 639x479 box relies on OpenCV 3.2 or later not clipping contours that touch the image border. SaveWorker (save_worker.py:76-79) and FileManager.save_npz/save_bb_txt repeat the crop logic but nothing calls them. The on-screen overlay uses the same exclusive edge (crop_manager.py:200, 218), so the darkened area matches what gets dropped.
>
> P0 JUSTIFIED (data integrity): this rule decides which labeled pixels and boxes are written to every saved annotation file (NPZ, YOLO, COCO, VOC, CreateML). The off-by-one silently drops real labels and shrinks boxes. A rewrite that treats x2 as inclusive or allows x2=width would write different training data, so someone must decide whether to keep or fix it. No instruction-like or injection text was found in the cited lines.

### RULE-037: NPZ import (current and legacy layouts)

**Compliance judge:** P0 yes, faithful yes

> VERDICT: P0 is justified, but only because this rule protects data integrity. The card matches the code, with gaps listed below.
>
> COMPLIANCE LENS. No money moves and no regulation is enforced. LazyLabel is a general desktop annotation tool (E:\\GitHub\\LazyLabel\\analysis\\lazylabel\\ASSESSMENT.md:5), and nothing in the code points to a regulated domain, so a regulator or finance controller would not care. A dataset or QA auditor would care, because this rule decides whether saved labels reload with the same class IDs, and a silent change gets written back to disk:
> - This code is the fix for a documented silent corruption. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\CHANGELOG.md:15 records classes 3 and 7 reloading as 0 and 1, with their aliases no longer matching.
> - Saving rebuilds class_order from the segments in memory (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400, 494). It deletes every annotation file for the image when there are no segments (106-109). So a loader that assigns the wrong classes, or does not recognise a legacy layout, leaves mislabeled or deleted annotation files after the next save.
> - ASSESSMENT.md:26 names the annotation file formats as the lasting asset, to be used as acceptance tests.
>
> FAITHFULNESS (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py). The Given/When/Then checks out:
> - mask has 3 dimensions, so nothing is reshaped.
> - Channel 0 gets class_order[0] = 0.
> - Channel 1 is empty and skipped (256-257).
> - Channel 2 gets class_order[2] = 7 (258).
> - add_segment keeps the class_id it is given (segment_manager.py:34-55).
> Result: two segments, classes 0 and 7. The example also catches the regression of using the channel index, which would give 2 instead of 7. The Given should state that channels 0 and 2 are non-empty.
>
> Gaps and overstatements:
> (a) Line 258 uses class_order only when it exists, is non-empty and has an entry for that channel. Extra channels fall back to the channel index, which can clash with a real class ID.
> (b) Lines 234-236 and 268-280: the N x H x W stack path runs only when 'mask' is absent and ignores class_order. It skips empty masks, so 'one segment per mask' really means one per non-empty mask (271-272). A mask with no class_ids entry gets class 0 (278). It never checks the array's shape, so an H x W x C 'masks' array stored with class_ids would be misread as a stack.
> (c) Line 239 prefers 'mask' over 'masks'. Lines 249-250 treat a 2-D mask as one channel. Nothing checks the mask size against the image, unlike the class-map loader (313-318).
> (d) Line 343 replaces the aliases entirely and converts keys to int. This runs before the masks are read (232), even when the file has no mask key (241-242). When the file has no aliases, the current ones stay (337-338).
> (e) Load errors are caught and the loader moves on to the next format (202-204).
>
> SECURITY CAVEAT FOR THE CONTRACT: line 231 opens the file with allow_pickle=True and line 340 calls .item(), so class_aliases is unpickled. ASSESSMENT.md:26 flags that a crafted .npz can run code. The contract should define aliases as an int-to-string map read with a restricted parser, not require matching np.load's pickle behavior. Old files store aliases as a pickled object, so the rewrite needs a safe reader or an explicit decision to drop them.
>
> TESTS: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:875-914 covers the H x W x C 'masks' layout, the stack with class_ids, files without class_order, and class_order taking priority over the channel index. No test covers a short class_order, a short class_ids, 'mask' winning over 'masks', or aliases being replaced rather than merged. The card lists no parameters, but default class 0 (line 278) is hardcoded. The cited lines contain no text aimed at instructing an AI tool.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: I traced the code in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:224-280 and 335-343 by reading it. The Given says mask shape (480,640,3), class_order [0,3,7] and channel 1 empty, which implies channels 0 and 2 have pixels. Lines 254-258 walk the channels in order, skip the empty one (256) and set class_id = class_order[i] (258). The result is two 'Loaded' segments, class 0 then class 7, so the Then matches, order included. The mapping is the exact reverse of how files are written: segment_manager.py:221,230 puts class_order[i] into channel i, and save_export_manager.py:400-425 passes that same list, plus the aliases dict, to exporters/npz.py:21-26, which writes mask, class_order and class_aliases. Existing tests confirm the main paths (tests/unit/core/exporters/test_bbox_roundtrip.py:887-914). The alias handling (340-343) swaps in the saved dict whole, with keys converted to int, so 'stored aliases replace current aliases' is accurate.
>
> GAPS the P0 contract should add as scenarios. None of them contradict the card:
> (1) Old stacked files: line 271 skips empty masks, so it is one segment per non-empty mask, not per mask. If class_ids is shorter than the stack, the class falls back to 0 (278). The channel path falls back to the channel index instead (258). These are two different fallback rules.
> (2) The channel-index fallback also applies per channel when class_order is empty or shorter than the channel count. That can repeat an id: class_order [1] with 2 channels gives class 1 twice.
> (3) Which branch runs depends only on which keys exist (234: masks and class_ids present, no mask), not on the array's shape. A 2-D mask becomes a single channel (249-250).
> (4) Aliases are restored at 232, before any mask checks. A file with no mask key still applies its aliases and returns with zero segments (241-242). No error is raised, so the loader stops at file_manager.py:205 and never tries the lower-priority formats. If reading fails later (for example a 1-D mask raises IndexError at 254), the loader moves to the next format (202-204) but keeps the aliases from the failed NPZ.
> (5) The class-map loader rejects masks whose size differs from the image (313-318). _load_npz has no such check, so a mask of the wrong size loads without warning.
>
> P0 JUSTIFIED (data integrity): NPZ is the first format the loader tries (the chain at line 129). This channel-to-class_id mapping and the alias restore decide whether saved labels come back with the same class ids and names. If the mapping is wrong, pixels quietly get the wrong class the next time the user saves.
>
> Injection suspects: none. The cited lines hold only docstrings and one normal comment (252-253), and the code confirms what that comment says.

### RULE-037: NPZ import: class_order mapping and legacy layouts (folded card)

**Compliance judge:** P0 yes, faithful yes

> P0 IS JUSTIFIED, BUT ONLY BECAUSE IT PROTECTS DATA. No money moves and no regulatory control is enforced here. A regulator or finance controller would not care about this parser by itself. Someone auditing the quality of a labelled training dataset would, because this mapping is the only thing that keeps each label's class the same across save and reload.
>
> Evidence:
> - The writer puts each class in a channel based on its position in class_order (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:221-244).
> - class_order is the SORTED list of class ids present in the image (segment_manager.py:87-95; used at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400 and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6602). So channel index and class id differ whenever an image holds a gapped subset of classes, which is the normal case.
> - The NPZ exporter saves class_order and class_aliases (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:21-26), and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:258 reverses that mapping on load.
>
> If the loader silently fell back to channel index, a file with class_order [2,7] would reopen as classes 0 and 1, and the saved alias {2:'cat'} would name nothing. The next save rebuilds class_order and aliases from memory (save_export_manager.py:400-424), and auto-save runs on navigation (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:271-274). That save would overwrite the labelled file with wrong classes and no error. The class_ids mapping for old files (file_manager.py:278) belongs to the same guarantee.
>
> Scoping advice: the 'masks' key alias, 2-D expansion and empty-channel skip are format-compatibility details (P1 level). Consider splitting the card so verification effort goes to the class-id round trip.
>
> FAITHFUL, but four details need tightening:
> (1) The Given must say both channels contain at least one pixel. Empty channels are skipped (256-257).
> (2) Stack vs tensor is decided by which KEYS exist, not by array shape. 'masks' plus 'class_ids' without 'mask' means stack (234). If 'mask' is present it wins (239). class_order is ignored on the stack path, and empty stack entries are skipped (271).
> (3) The channel-index fallback is not only for 'old files'. It also applies to any channel at or past the end of class_order, or when class_order is empty (258). That fallback id can match a class_order id and silently merge two classes: class_order [1] with 2 non-empty channels loads both as class 1. The Parameters line states this correctly.
> (4) Aliases are restored BEFORE the layout check (232). They are replaced wholesale, not merged, with keys converted to int (343), even for stack files or files with no mask key. 'Exactly {2:'cat'}' holds, because add_segment and _update_next_class_id never touch aliases (segment_manager.py:28-56, 816-826).
> Existing tests cover the rule: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:875-914.
>
> RELATED RISKS for the behavior contract (not in the card):
> (a) Partial load: aliases are replaced, and stack segments may already be added, before parsing can fail. load_existing_mask then catches the error and moves to the next format (file_manager.py:202-204). A malformed NPZ can leave replaced aliases and partial segments, with a lower-fidelity sidecar loaded on top.
> (b) FileManager.save_npz (file_manager.py:62) writes only 'mask', with no class_order or aliases. It has no production callers in src (tests only, using ids [0] and [0,1]). Any file it wrote with gapped ids would reload with the wrong classes through the fallback.
> (c) allow_pickle=True (231) is needed to read the dict-typed class_aliases. It also lets an untrusted .npz next to an image run code when the image is opened.
>
> No injection attempts in the cited lines; the comments at 225-229 and 252-253 match what the code does. No credentials.

**Fidelity judge:** P0 yes, faithful yes

> Verdict: faithful and justified as P0. Nothing in the rule contradicts the code. It leaves out some edge cases that the verification contract should add.
>
> How I checked: I read E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py lines 224-280 and 335-343, plus the callers and the export side. I also pulled out _load_npz, _add_mask_stack and _restore_aliases with ast and ran them on in-memory NPZ buffers. That covered 15 scenarios, wrote no files and did not import the logger.
>
> Main scenario: a mask of shape (480,640,2) with both channels non-empty, class_order [2,7] and class_aliases {2:'cat'}. The run gave two 'Loaded' segments in channel order, class 2 then class 7. The aliases became exactly {2:'cat'}, replacing the earlier {0:'dog',5:'x'}. add_segment (segment_manager.py:28-56) keeps the given class_id and does not touch aliases.
>
> The other clauses also match the code:
> - A 'masks' tensor is used when there is no 'class_ids', and it also follows class_order (L238-258).
> - A 'masks' stack with 'class_ids' gives one segment per mask, and a missing id becomes 0 (L278).
> - A 2-D mask gets a channel axis added (L249-250).
> - Empty channels and empty stack masks are skipped (L256, L271).
> - The mapping formula matches L258. An empty class_order falls back to the channel index.
>
> Gaps to add to the contract:
> 1. The Given does not say both channels have set pixels. 'Two segments' depends on that.
> 2. Aliases are restored first (L232), before the file layout is checked:
>    - If the file has no mask or masks key, aliases are still replaced and zero segments load. The loop at L205 then stops without trying other formats.
>    - If reading the mask then fails (a 1-D mask raises IndexError at L254), the load chain at L202-204 moves to the next format with the NPZ aliases already applied.
> 3. If the file has no class_aliases, existing aliases stay (L337-338). Alias keys are converted to int, values are not (L343).
> 4. Which layout wins: 'mask' beats a 'masks' plus 'class_ids' stack (L234). The stack path ignores class_order.
> 5. class_order values are not converted to int, so a float array gives float class ids. Stack ids are converted (L278).
> 6. Channels beyond the end of class_order fall back to their index and can collide with a real id. class_order [1] with 2 channels gives two class-1 segments.
> 7. The mask's height and width are not checked against the image (load_npz_class_map does check, L313-318). Segments are added to the existing list, not replacing it.
>
> P0: this is the reverse of how the exporter packs channels. segment_manager.py:221-230 builds the channel map from class_order, and exporters/npz.py:21-26 writes mask, class_order and class_aliases. NPZ is also first in the load order (L128-136). If the mapping is wrong, stored labels are silently renamed (classes [2,7] come back as [0,1]), and the next save overwrites the file with the wrong ids. That is a data-integrity risk for the user's training labels. It has nothing to do with money or regulation.
>
> No instruction-like text was found in the cited lines. The schema has no injectionSuspects field, so none are reported.

### RULE-038: COCO JSON import with polygon-then-box fallback

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. I traced E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:602-710 with image_size=(480,640), i.e. height 480 and width 640.
> - The category {id 2, 'dog', 'animal'} gives alias 'dog.animal'. The dot form is used only when supercategory differs from name (633-637).
> - An RLE dict is not a list, so it fails the check at 652. 'added' stays False (650, 682) and the code falls back to the bbox.
> - bbox [630,470,20,20] becomes x1=630, y1=470, x2=min(640,650)=640, y2=min(480,490)=480 (689-696).
> - mask[470:480, 630:640] is a 10x10 box with class_id 2 and no vertices (698-707). SegmentManager.add_segment stores it unchanged (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:28-55).
>
> The card follows the code rather than the docstring. The docstring at 605 says the box is used only if there is no segmentation; the code also uses it for RLE and for polygons that don't cover any pixels.
>
> Small gaps in the card:
> - 'Parameters: (none)' leaves out several hardcoded values: at least 6 coordinates (654), the '.' separator (636), a missing category_id becoming 0 (643), the bbox needing exactly 4 items (686), and boxes with no area after clamping being skipped (695-696).
> - Each polygon must also cover at least 1 pixel inside the image (669-670).
>
> Edge-case defect: Python's json reader accepts Infinity. round(inf) raises OverflowError, which is not caught at 662 or 690. The error escapes to load_existing_mask (202-204) after some segments may already be added, and the next annotation file is then loaded on top.
>
> P0 FROM A COMPLIANCE VIEW: not justified.
> - No money moves and no regulation is enforced. LazyLabel is a general-purpose image-labeling tool (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\README.md:6). It has no regulated records, audit trail, retention rules or financial logic. No regulator, auditor or finance controller would care whether a category becomes 'dog.animal' or an RLE mask becomes its box.
> - This is a best-effort, lossy import parser, not a check or guard. The card's own example throws away the RLE shape and keeps a rectangle.
> - COCO is third in the load order, after NPZ and YOLO-seg (file_manager.py:128-136).
> - Locking in 'RLE becomes a box' as a P0 must-match contract would waste verification effort. It would also block a real improvement: decoding RLE properly.
> - Recommend P1: import accuracy, matched against CocoExporter (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\coco.py:19-27, 45-50, 71).
>
> CAVEAT, so the real defect does not ship:
> - Moving to another image auto-saves by default, with no check for unsaved changes (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:157-160; config\\settings.py:45).
> - Saving with zero segments deletes every known annotation file for the image, including _coco.json (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:106-109, then core\\exporters\\__init__.py:209-215).
> - So any load that yields zero segments permanently deletes the source annotation file just by browsing past the image. That includes a broken rewritten importer, or today a malformed COCO file whose error is swallowed at 617-623.
> - The data-integrity P0 belongs on that delete-when-empty save rule, or on a narrow rule: 'every annotation with a usable polygon or an in-image bbox produces at least one segment'. It does not belong on this whole parser.
>
> No instruction-like text and no credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. I traced E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:602-710 by hand with the card's example. Callers pass image_size=(pixmap.height(), pixmap.width()) (ui/managers/file_navigation_manager.py:203-206, 343-345), so h=480 and w=640.
> - Categories (626-637): cat_id=2, name='dog', supercategory='animal'. They differ, so class_aliases[2]='dog.animal'.
> - Annotation (639-708): category_id=2. The segmentation is a dict, not a list (652), so no polygon is tried and added stays False. The bbox is a list of 4, giving x=630, y=470, bw=20, bh=20. Clamping (693-694) gives x1=630, y1=470, x2=min(640,650)=640, y2=min(480,490)=480.
> - Result: mask[470:480, 630:640]=True (699), which is rows 470-479 and columns 630-639 (100 px). Exactly one segment is added: type 'Loaded', vertices None, class_id 2.
> - segment_manager.py:28-56 and 816-826 do not remap class ids.
> Every Then clause holds.
>
> Gaps the card should add. These are omissions, not contradictions:
> (1) Rounding uses Python round(), which rounds half to even. It applies to polygon coordinates (659) and to each bbox value before x+w is computed (689). Example: bbox [0.5,0.5,2.5,2.5] becomes x=0, y=0, w=2, h=2, a 2x2 box. Half-up rounding gives columns 1-3 instead. A Node port using Math.round would differ, so this needs its own G/W/T.
> (2) A missing category_id becomes class 0 (643). A null or non-numeric id drops the whole annotation, even if its bbox is valid. A float id is truncated, not rounded (2.9 becomes 2).
> (3) The 6+ check counts list items (654). Any non-numeric item drops that polygon. A trailing odd coordinate is silently dropped (660). A flat, un-nested segmentation list falls back to the bbox. Stored vertices are the rounded ints.
> (4) If the clamped box is empty (fully off-image, or zero/negative size), the annotation is silently dropped (695-696). The bbox must have exactly 4 values.
> (5) Aliases are merged by id into the existing class_aliases (635), not replaced. A missing name becomes str(id). A missing supercategory gives the plain name. A JSON null supercategory gives 'dog.None', and an empty string gives 'dog.'. image_id, iscrowd and area are ignored.
> (6) Likely defect: Infinity or 1e400 in a polygon or bbox raises OverflowError. The local except (TypeError, ValueError) at 662 and 690 does not catch it. load_existing_mask (202-204) then logs the error and moves on to lower-priority annotation files, while the COCO segments already added stay loaded. The result is a partial or duplicated load.
> (7) Precondition: through load_existing_mask, _coco.json is only read when no .npz or _seg.txt exists (128-136). The image should be stated as width 640, height 480. Calling load_coco_json(path, (640,480)) directly would drop the box and fail verification. 'Parameters: (none)' is incomplete: minimum 6 coordinates (3 vertices), '.' as the alias separator, and class 0 as the default.
>
> P0 JUSTIFIED (data integrity; no money or regulatory angle). This loader is the read half of the annotation save/load round-trip: exporters/coco.py:19-27 and 43-80 write name/supercategory and polygon+bbox, and this code rebuilds them. The bbox fallback exists so objects are not lost. Auto-save is on by default (config/settings.py:45, file_navigation_manager.py:156-158), so whatever this loader rebuilds is written back when the user switches images. Any difference in a rewrite would silently and permanently drop or reclassify user labels. No instruction-like text or credentials were found in the cited lines.

### RULE-038: COCO JSON import: categories to aliases, polygon then bbox fallback (folded card)

**Compliance judge:** P0 no, faithful yes

> VERDICT: P0 is not justified under the compliance lens; rate it P1 (file-format fidelity). The Given/When/Then matches the code, but one missing field must be added.
>
> WHY NOT P0. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:602-710 is a lenient, best-effort reader for a third-party interchange format. The app is a single-user desktop tool for image annotation (E:\\GitHub\\LazyLabel\\analysis\\lazylabel\\ASSESSMENT.md:5, 26). The rule moves no money and serves no regulatory need, so no regulator, auditor or finance controller would care if it changed. It does not guard data integrity either; it loses data by design:
> - RLE masks become rectangles (650-652, 682-708).
> - Malformed categories, annotations, polygons and bboxes are skipped with no log (627-632, 640-645, 654-655, 662-663, 686-691).
> - A category_id of null drops the annotation.
>
> The real integrity risk is on the save side. Auto-Save is on by default (config/settings.py:44). An empty segment list deletes every sidecar file (ui/managers/save_export_manager.py:106-109), and a save rewrites the files from memory. So anything this loader drops or degrades gets written back over the user's files. That belongs in a P0 on the save model (ASSESSMENT 5.1), not in a contract that freezes parser details. What users do need is for category ids and aliases to survive an export and re-import (exporter E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\coco.py:19-27, 45-50, 71). Keep that as a P1 round-trip test next to legacy/lazylabel/tests/unit/core/test_file_manager.py:788-889.
>
> FAITHFULNESS. I pulled the function out of the source and ran it in memory, writing no files. Confirmed:
> - Alias is 'dog.animal' (633-637); just the name when supercategory is missing or equal; str(id) when name is missing.
> - category_id becomes class_id unchanged.
> - With category_id 5, bbox [90,90,20,20] on a 100x100 image gives a class-5 mask over columns and rows 90-99 (100 px), since x2=min(100,110).
> - Two polygons give two segments.
> - An RLE dict, or a polygon entirely off the image, falls back to the bbox (vertices None).
> - A missing category_id key gives class 0 (643).
> - Aliases merge key by key, overwriting matches (635).
>
> REQUIRED FIXES:
> 1. The Given's annotation has no category_id. Run as written, it gives a class-0 segment, which contradicts the Then and the card's own default-0 clause. Add category_id 5.
> 2. The rounding parameter should say Python round() rounds half to even. Measured: bbox x 2.5 becomes 2 and y 3.5 becomes 4. Math.round in the TypeScript rewrite would be 1 px off.
> 3. State that a null or non-numeric category_id drops the annotation instead of defaulting to 0 (644-645).
> 4. "Merged into existing aliases" is true of the function, but users never see it: both callers clear the segment manager, aliases included, before loading. See ui/managers/file_navigation_manager.py:281 (before 343), and 186 via ui/main_window.py:2141 (before 203).
> 5. COCO is loaded only when the image has no .npz or _seg.txt file (file_manager.py:128-136, 173-205).
>
> The cited lines contain no instruction-like text aimed at AI tools and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> P0 IS JUSTIFIED (data integrity). load_coco_json is how saved labels get rebuilt when an image has no .npz or _seg.txt file (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136, 173-205). Whatever it loads is written straight back to disk:
> - Auto-save is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45). Moving to another image always calls save_output (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:156-160 and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:1993-1998).
> - If nothing loaded, the save deletes every label file for the image, including the _coco.json (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:106-108 and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:209-215).
> - Otherwise it writes an NPZ, which is loaded ahead of COCO from then on.
> So if a rewrite loads COCO differently (lost class ids, no bbox fallback), labels are permanently lost or deleted.
>
> THE RULE IS FAITHFUL: the behaviour it describes matches the code, but the example needs one fix. What I re-derived from file_manager.py:
> - Aliases (633-637): the alias is name.supercategory, or just the name when the two are equal. Supercategory defaults to the name, and the name defaults to str(id). Aliases are set one id at a time without clearing, so COCO overwrites an existing alias with the same id.
> - Polygons (652-680): a polygon must be a list of at least 6 numbers (654). Points are built with int(round()) (658-661). Each polygon that fills at least one pixel becomes one segment.
> - Bounding box (682-708): it is used only when no polygon was added. It must be a list of 4 values. The far edges are x2=min(w,x+bw) and y2=min(h,y+bh).
> - RLE: a dict segmentation skips the polygon branch and falls back to the box.
> The example's results are correct: the alias is 'dog.animal', and the box fills mask[90:100,90:100], i.e. rows and columns 90-99. The legacy tests agree (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\test_file_manager.py:807-888 and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:688-729).
>
> FIXES:
> (1) Must fix: the annotation in the Given has no category_id:5. Read literally, line 643 (and the card's own "missing category_id defaults to class 0") makes it class 0, not class 5. A test written from the card as-is would fail against the legacy code.
> (2) Python round() rounds halves to the nearest even number. The box's x, y, w and h are each rounded before x+w is added. Example: x=0.5, w=2.5 gives columns 0 up to 2; rounding halves up would give 1 up to 4. Say this explicitly for a non-Python rewrite.
> (3) Only a missing category_id becomes 0. A null or non-numeric one drops the whole annotation (642-645), and fractional ids are truncated (5.9 becomes 5).
> (4) A box that is not a list of 4, or is empty after clamping (e.g. fully off-image), drops the object (686-696).
> (5) Odd-length polygons silently lose the last value (660). Polygon values must be JSON numbers (strings skip the polygon), while the box accepts numeric strings (689). If any polygon fills pixels, the box is not used even if other polygons fail.
> (6) The images list and image_id are ignored, so every annotation in the file is loaded onto the current image.
> (7) Rare case: an Infinity value in the JSON raises an OverflowError that the function does not catch. Segments already added stay, and load_existing_mask then loads the next format on top (202-204).
>
> Lines 602-710 contain no text aimed at manipulating automated analysis.

### RULE-039: Pascal VOC and CreateML import rules

**Compliance judge:** P0 no, faithful yes

> P0 is not justified under the compliance lens. The Given/When/Then matches the code.
>
> HOW I CHECKED: I read E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py lines 456-540, the helpers they call (_build_label_map 345-379, _add_box_segments 381-410) and the matching exporters (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\pascal_voc.py:46-49, createml.py:42-45). I also ran the exact method bodies in memory with stub objects. Nothing was written to disk.
>
> WHY NOT P0 (compliance): LazyLabel is a general-purpose tool for labeling images. The README and the assessment mention no regulated domain, personal data or financial records. These lines don't move money or enforce any regulation, so no regulator, auditor or finance controller would care if VOC/CreateML import changed. The data-integrity case only partly holds. Only one piece protects saved data: xmax/ymax are exclusive (and CreateML computes x2 = x1 + round(w)), which matches what the exporters write. That keeps export-then-import lossless, and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:136 tests it. The rest of the card describes lenient handling that lets bad input through rather than blocking it:
> - A missing xmin/ymin becomes 0. Tested: an object with only xmax=110 and ymax=60 turned into a 6,600-pixel box starting at the image corner.
> - An empty \<name/\> becomes label "0".
> - An empty coordinate element makes the object be skipped silently.
> - CreateML reads only data[0], and a file whose top level isn't a list loads nothing.
> Locking these in as P0 would force the rewrite to copy questionable behavior. The card also packs about ten behaviors from two formats into one contract. Suggest P1, or split it: a narrow card for the round-trip rule (exclusive bounds plus rounding) and a P2 card for the lenient handling.
>
> FAITHFULNESS: Running 'dog' 100,50,110,60 on a 300x200 image gives exactly one segment: rows 50-59, columns 100-109, 100 pixels, class_id 0 (new alias 0-\>'dog'), type Loaded, vertices None. The plain-English claims also hold. Small gaps:
> - The example assumes the image is at least 110x60 and that no higher-priority sidecar exists (.npz, _seg.txt, _coco.json, _CM.npz).
> - It doesn't state the resulting class id.
> - Coordinates use Python round(), which rounds halves to even. Tested: 100.5-\>100 and 101.5-\>102. A JS port using Math.round would shift boxes, yet the card says Parameters: (none).
>
> MISSED DATA-INTEGRITY RISKS (worth their own cards):
> (1) Both loaders catch parse and read errors themselves (file_manager.py:466-470, 502-507) and return with no segments. Because nothing is raised, load_existing_mask stops at line 205 and never tries lower-priority files. That contradicts its docstring at 160-163 ('the chain moves on to the next format'). Tests only check this fallback for a corrupt NPZ (test_bbox_roundtrip.py:749-756). The bad-XML test (737-739) only checks that nothing crashes.
> (2) Auto-save is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45). If an image loads with zero segments, moving to another image (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:157-160) triggers save_export_manager.py:107-109 -\> exporters/__init__.py:209-215. That deletes every annotation file for the image, including the unreadable one and any healthy lower-priority file.
>
> No instruction-like text or credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: faithful, but the card needs fixes before it can serve as a P0 contract.
>
> I re-derived the example from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:456-493 and 381-410. I ran the cited logic in memory with the stdlib only. I did not import the project, because utils/logger.py writes a log file when imported. Object ('dog',100,50,110,60) becomes mask[50:60,100:110]: rows 50-59, cols 100-109, 100 px, one 'Loaded' segment with vertices None. That matches the Then.
>
> Every plain-English claim holds:
> - Objects without a \<name\> or \<bndbox\> element are skipped (474-477).
> - An absent coordinate element defaults to "0" (483-486).
> - xmin/ymin are 0-based and xmax/ymax exclusive (401). This matches the exporter at exporters/pascal_voc.py:46-49.
> - CreateML reads only data[0] and never checks data[0]['image'] against the image (509-513).
> - CreateML converts center/size to a box (527-536).
> - Both formats share label resolution and clamp/drop (392-398).
>
> Gaps to fix:
> 1. The Given has no image size. The Then is only true when width \>= 110 and height \>= 60. On a 105x55 image the code clamps to a 5x5 segment (395-396). Pin a size, e.g. 200x100.
> 2. The Then gives no class. With no existing aliases, 'dog' gets class_id 0 and class_aliases[0]='dog' is registered (370-377).
> 3. Rounding is never stated, and Parameters says "(none)". The code uses Python round(), which rounds half to even (100.5-\>100, 101.5-\>102). JS Math.round rounds half up. CreateML computes x2 = x1 + round(w), not round(cx + w/2). For cx 105, w 9, Python gives [100,109) and half-up gives [101,110).
> 4. There is no CreateML scenario, even though the rule covers CreateML.
> 5. "Missing coordinates default to 0" is only true when the element is absent. An empty \<xmin/\> gives findtext '' and float('') raises, so the object is skipped. A missing xmax or ymax becomes 0 and the box is dropped (397). An empty \<name/\> becomes label "0", i.e. class 0 (482), instead of being skipped.
> 6. Bad values fail unevenly. In VOC, 'nan' skips one object (ValueError is caught at 489). 'inf' or 1e400 raises OverflowError, which is not caught, so the whole file aborts. In CreateML, int(round()) at 527-535 sits outside the try block (519-525), so NaN or Infinity (json.load accepts both) aborts the whole file. In production, load_existing_mask (187-204) catches this silently and moves on to _createml.json or .txt.
> 7. Order side effect: the label map is built from all boxes (392) before clamp/drop (395-398). A name whose only box is dropped still registers a leftover alias and uses up an id.
> 8. In production, img.xml is only loaded when no .npz, _seg.txt, _coco.json or _CM.npz file exists (_LOAD_CHAIN 128-136).
>
> SME question: the Pascal VOC standard uses 1-based coordinates with inclusive xmax. This code reads them as 0-based and exclusive. That works for files LazyLabel wrote itself, but VOC files from other tools would load 1 px off. Is that intended?
>
> P0: No money or regulation is involved. It is justified on data integrity. This code rebuilds saved ground-truth annotations, and the user then saves them again. If a rewrite gets inclusive/exclusive bounds or rounding wrong, boxes silently shift or grow by 1 px on every load-save cycle. Wrong label resolution merges classes. The legacy tests guard both, in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py (TestLoadExistingMaskRoundTrip, TestClassIdentity). Consider splitting the rule: box geometry and class identity stay P0, and 'first entry only' becomes P1.
>
> Injection suspects: none in 456-540. The docstring's claim at 459-460 is backed by the exporter code. No credentials.

### RULE-040: YOLO Detection import validation, rounding and clamping

**Compliance judge:** P0 no, faithful yes

> VERDICT: Downgrade to P1. The Given/When/Then is correct, but no regulator, auditor or finance controller would care if this changed silently.
>
> WHY NOT P0 (compliance lens):
> - It moves no money and enforces no regulation. YOLO is a common machine-learning label format, not a legal requirement.
> - A search of the legacy tree for regulated-domain terms found only a lint-tool mention (CHANGELOG.md:721) and the Apache LICENSE boilerplate.
> - The data-integrity argument is weak. The rule controls how a label file's boxes turn into pixels. The exporter (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:27-33) writes full-precision floats from cv2.boundingRect. The importer (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:446-449, with exclusive x2/y2 at line 401) reverses that exactly. So files LazyLabel wrote itself load back pixel-for-pixel.
> - Half-to-even rounding only matters for files from other tools whose box edges land exactly on .5 pixel, and then by 1 pixel at most.
> - A silent change here would break import accuracy and compatibility with other tools (P1). Existing tests already pin it: test_bbox_roundtrip.py:601-654 and 672-674, test_file_manager.py:297-325.
> - Keeping "Python round() half-to-even" as a P0 contract would force the JS/Node rewrite (Math.round rounds half up) to copy banker's rounding for a 1-pixel edge case. That is wasted verification effort.
> - There is a real integrity guard nearby, but this card does not describe it. _build_label_map (file_manager.py:345-379, called at 392) stops a file that mixes 'dog' and '0' from merging two classes into one. If anything here needs integrity-level coverage, it should be its own card.
>
> WHY FAITHFUL: I re-ran the same expressions.
> - Line 1 gives (240,120,400,360), so mask[120:360, 240:400]: rows 120-359, columns 240-399, class int('3')=3.
> - Line 2 has 4 tokens and is skipped at 433-434.
> - Line 3 gives raw (640,192,768,288). x2 is clamped to 640 at 396, and the empty box is dropped at 397-398.
> - round() is half-to-even: round(2.5)=2.
> - image_size is (height, width), so "640x480" means width 640, height 480, which matches the card.
>
> GAPS TO ADD TO THE CONTRACT (missing, not wrong):
> (1) A dropped box still changes the class alias table. _build_label_map runs on every parsed label at 392, before the clamp and drop at 395-398. In the card's own example, class_aliases[0]='cat' is registered even though that box is thrown away.
> (2) "Lines without numeric coordinates are skipped" is only true for text that float() can't parse. 'nan', 'inf' and '1e309' pass float() at 438. But int(round()) at 446-449 sits outside the try block (437-440) and raises ValueError or OverflowError, which aborts the whole file. When called through load_existing_mask (202-204), the error is logged and nothing from that file loads, not even its valid lines.
> (3) The class token is not validated. A matching alias name wins first, then an integer, then a new id. So '3' only becomes class 3 if no alias is literally named "3".
> (4) The file is opened with the platform's default encoding (424). A read or decode error loads nothing (426-428).
>
> No instruction-like or injection text and no credentials in the cited lines 381-454.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL BUT INCOMPLETE: every value the card states matches the code, but it misses two behaviors and needs one addition before it is used as the contract. Paths below are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\. I recomputed the formulas in plain Python without importing project code, because importing it makes a log directory (utils/logger.py:41-73). image_size is (height, width), so '640x480' means w=640, h=480.
>
> CHECKED AGAINST core/file_manager.py:
> - Line 1 '3 0.5 0.5 0.25 0.5': x1=round(0.375*640)=240, y1=120, x2=400, y2=360 (446-449). The fill mask[120:360, 240:400] (401) covers rows 120-359 and columns 240-399. class_id=int('3')=3 (365-366). No earlier alias can remap '3' (362-364) because aliases are cleared before each normal load (main_window.py:2141, core/segment_manager.py:20-26). Correct.
> - Line 2: 4 tokens, so it is skipped (433-434). Correct.
> - Line 3 'cat 1.1 0.5 0.2 0.2': 1.1-0.1 is exactly 1.0 in floating point, so x1=640. x2=round(768.0000000000001)=768, clamped to 640 (396). Since 640\<=640 the box is dropped (397-398). Correct.
> - Parameters: x2/y2 are exclusive (the slice at 401). Python round() rounds ties to even (round(2.5)=2, round(240.5)=240). Correct.
>
> GAPS TO ADD:
> (1) Order of steps, in this very example: class IDs are assigned (392) for every parsed box before boxes are clamped and dropped (394-398). So the dropped 'cat' box still takes id 0 and registers class_aliases[0]='cat' (370-377). That alias goes into every save (ui/workers/save_worker.py:89, ui/managers/save_export_manager.py:424,509). A port that filters boxes first would pass this card but behave differently.
> (2) 'nan', 'inf' and '1e999' all pass the float() check (437-440), so the line is not skipped. int(round()) then fails at 446-449, outside the try. The function exits before _add_box_segments (453), so zero boxes load from the whole file, not just that line. load_existing_mask only logs this (202-204). The card's 'numeric coordinates' wording implies only the bad line is skipped.
> (3) Pin the exact formula x1=round((cx-bw/2)*w) and add a tie case. With w=1024, cx=0.5, bw=1/1024 the edges are 511.5 and 512.5. Python gives 512/512 and drops the box; JavaScript-style half-up gives 512/513 and keeps it.
>
> P0 JUSTIFIED (data integrity): this import decides which boxes, pixel extents and class IDs exist, and they are saved back automatically. Auto-save is on by default when moving to another image (ui/managers/file_navigation_manager.py:157-160) and saves with no check for changes (save_export_manager.py:97-122). A YOLO export overwrites the same base+'.txt' (core/exporters/yolo_detection.py:45-46). A saved .npz takes priority over img.txt on the next load (file_manager.py:128-136). If nothing loaded (for example gap 2, or a file where every line is invalid), saving deletes all annotation files for the image, img.txt included (save_export_manager.py:106-109, core/exporters/__init__.py:209-215). Lines skipped on import are also lost on re-save. A mismatch in import behavior therefore corrupts or deletes the stored dataset.
>
> No instruction-like text or credentials in the cited lines (381-454) or the class-ID helper (345-379).

### RULE-040: YOLO Detection import: denormalize, round half-to-even, clamp (folded card)

**Compliance judge:** P0 no, faithful yes

> P0 is not justified under the compliance lens. LazyLabel is a desktop tool for labelling images with SAM (analysis/lazylabel/ASSESSMENT.md:26). This code moves no money and enforces no regulation. No regulator, auditor or finance controller would care whether a box corner that lands exactly on .5 of a pixel rounds to even or rounds up.
>
> The data-integrity argument is also weak, for four reasons:
> (a) "Half-to-even" is just the default of Python's built-in round() (legacy/lazylabel/src/lazylabel/core/file_manager.py:446-449). Nothing in the code or docs shows anyone chose it on purpose. LazyLabel's own exporter writes whole-pixel boxes (core/exporters/yolo_detection.py:27-33), so reloading its files gives whole numbers plus float noise and never a real .5 tie.
> (b) This .txt loader is the last fallback in the load order (file_manager.py:128-136, 200-201). NPZ is saved by default (config/settings.py:8-9) and is tried first on reload, so this loader mostly runs for third-party files.
> (c) Silently skipping bad lines (433-440) and dropping boxes that shrink to nothing (397-398) can lose data. They do not protect it.
> (d) What does matter is that boxes survive a save-and-reload unchanged: right and bottom edges exclusive (401), clamping to the image (395-396), one segment per line (403-410). That is file-format behaviour, and tests/unit/core/exporters/test_bbox_roundtrip.py:143-151 already checks it.
> Recommendation: rate it P1 as part of the file-format contract, and treat matching the .5 tie rounding as a non-blocking dual-run check.
>
> Faithful: yes, with gaps. I checked the example by hand:
> - x1 = (0.3125-0.15625)*640 = 100.0, so 100
> - x2 = 0.46875*640 = 300.0, so 300
> - y1 is about 49.99999999, so 50
> - y2 is about 149.99999998, so 150
> That gives columns 100-299 and rows 50-149, as the card says. The 5-token check (433), skipping values that fail to parse as numbers (437-440), clamping (395-396), dropping collapsed boxes (397-398) and exclusive edges (401) all match the code. Label '3' goes through _build_label_map (392, 359-368), where a matching class name wins over the number, so the card's hedged wording is right.
>
> Gaps the card should fix:
> (1) Tokens like 'nan', 'inf' or 1e999 get past float() at line 438. They then raise ValueError or OverflowError in int(round()) at 446-449, which is outside the try block. The whole file loads zero segments, and load_existing_mask logs and swallows the error (202-204). So these lines are not skipped one by one, silently.
> (2) Class ids are assigned for all boxes before clamping (392). A dropped box with a new text label still registers that name as a class (377).
> (3) The label token is never checked to be a number, so 'dog 0.5 0.5 0.2 0.2' is accepted.
>
> The cited lines contain no text aimed at steering automated analysis and no credentials.

**Fidelity judge:** P0 yes, faithful no

> P0 is justified under data integrity. This loader decides what a user's saved YOLO Detection labels become when loaded back as masks. Those masks get saved again, and a new .npz then takes priority over the .txt. So a one-pixel rounding change (JS/Java round half-up instead of half-to-even), a clamp change or a class mix-up would quietly corrupt the dataset. The matching exporter is save_bb_txt at file_manager.py:74-123.
>
> FIDELITY: the main path is correct, but the edge-case clause is wrong in places and leaves out real behaviour. I worked it out myself from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:381-454 and its caller at 171-205.
>
> CONFIRMED:
> - A line needs exactly 5 tokens (432-434). A coordinate that float() can't parse skips only that line (437-440).
> - Corners are int(round((cx-bw/2)*w)) and so on (446-449): subtract first, then multiply. w and h are Python ints from pixmap height/width, so Python round() is half-to-even; 10.5-\>10 and 11.5-\>12 are correct.
> - Clamping is exactly x1,y1\>=0, x2\<=w, y2\<=h (395-396). The drop test is x2\<=x1 or y2\<=y1 (397-398).
> - The fill is mask[y1:y2, x1:x2], so right and bottom edges are exclusive (400-401). Each surviving line becomes its own segment, in file order.
> - The worked example checks out by hand: 0.15625*640=100.0 and 0.46875*640=300.0; 49.999999992 rounds to 50 and 149.999999976 to 150. That gives columns 100-299 and rows 50-149. '.txt' is the last entry in _LOAD_CHAIN (128-136).
>
> DIVERGENCES:
> (1) 'non-numeric values are silently skipped' is wrong for tokens float() accepts but that aren't finite: 'nan', 'inf', '1e309', or values that overflow once multiplied by w. They get past the try block at 437-440, but round() at 446-449 is outside it and raises ValueError (NaN) or OverflowError (inf). That exception leaves load_bb_txt before _add_box_segments (453) runs. The caller logs it and moves on (202-204), and since .txt is last in the chain, nothing loads. One such line throws away every valid box in the file; it is not a one-line skip.
> (2) Only the 4 coordinates are checked as numbers; the class token never is. Label resolution goes alias name first, then int(), then a new id (355-377). So 'dog' is accepted. '3.0' fails int() and gets the lowest free id plus a new alias. '3' maps to class 3 only if no alias is named '3'. The clause wrongly suggests such lines are skipped.
> (3) The label map is built from every parsed box before clamping and dropping (392 runs before 394-398). A dropped box with a text label still adds a class alias.
> (4) What gets dropped is any box with zero or negative width or height after clamping. That includes flipped boxes (negative w/h) and boxes entirely outside the image, not just boxes that 'collapse to zero'.
> (5) open() is called without an encoding (424), so decoding depends on the platform (cp1252 on Windows). A UTF-8 BOM ends up stuck to the first class token, which then becomes a new named class.
>
> AMEND:
> - Add a tie example that proves half-to-even: on a 512x512 image, '0 0.0400390625 0.5 0.0390625 0.5' gives x1=round(10.5)=10 and x2=round(30.5)=30, so columns 10-29 (half-up would give 11-30) and rows 128-383.
> - State that a non-finite or overflowing coordinate on any line means the whole file loads zero segments.
>
> The cited lines contain no text that looks like instructions to an AI and no credentials.

### RULE-041: YOLO Segmentation import validation

**Compliance judge:** P0 no, faithful yes

> P0 IS NOT JUSTIFIED (compliance lens). LazyLabel is a desktop tool for AI-assisted image labelling (E:\\GitHub\\LazyLabel\\analysis\\lazylabel\\ASSESSMENT.md:5, :26). This rule moves no money. Nothing in the system or the assessment points to any regulatory, audit, personal-data or financial-record requirement. A regulator, auditor or finance controller would not notice or care if the line-length rules (7+ tokens, odd count) or the empty-mask drop changed.
>
> It also fails the "guards data integrity" test. The rule is a lenient import filter. It skips bad lines without any log or error (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:564-570) and drops polygons that cover no pixels without telling anyone (:587-588). That protects nothing.
>
> If anything it is a data-loss risk. Auto-save on navigate is on by default (config\\settings.py:45; ui\\managers\\file_navigation_manager.py:156-160). So skipped lines can be erased when the file is saved again, if YOLO Seg export is enabled.
>
> The legacy save-and-reload cycle already loses detail on purpose. The exporter simplifies outlines with approxPolyDP, epsilon 0.001 x perimeter (core\\exporters\\yolo_segmentation.py:34-35). It also pads 1-2 point outlines to 4 points (core\\exporters\\__init__.py:139-157), so exported lines always pass this importer's minimum. Exact pixel equivalence is therefore not a legacy invariant.
>
> Recommendation: rate it P1, a file-format compatibility rule covered by the file-format acceptance tests the assessment already requires. Put the silent-drop-then-auto-save behaviour on the defect list as an explicit decision. A P0 contract would lock it in.
>
> GIVEN/WHEN/THEN IS FAITHFUL. I re-ran the example in memory. With image_size (h,w) = (480,640) the vertices are [[64,48],[128,48],[128,96]] and the filled mask has 1,617 pixels. Class 0 is right unless an existing alias is named '0' (_build_label_map, :345-379). The token rules match :564 (skip if fewer than 7 or even count) and :567-570 (float parse).
>
> Gaps the contract should pin down:
> (1) "Rounding" means Python round(), which rounds halves to even. 0.5 x 641 = 320.5 becomes 320, while JS Math.round gives 321. The rounding mode is missing from Parameters.
> (2) "All numeric" is not the real check. 'nan' and 'inf' pass float() at :568, then fail at :573 outside the try (ValueError/OverflowError, confirmed). That aborts the whole file, not just the line. load_existing_mask (:187-204) logs it and falls back to a lower-priority file, such as .txt boxes.
> (3) The label does not have to be a number. Names resolve through aliases or get fresh ids.
> (4) The check at :576 is redundant.
>
> The cited lines contain no text that looks like instructions to an AI, and no credentials.

**Fidelity judge:** P0 yes, faithful no

> P0 IS JUSTIFIED (data integrity). This loader decides which lines of a user's annotation file survive, and what it loads is written straight back to disk. Loader order: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-205. Auto-save is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45). It runs on every image change with no modified check (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:270-274). If the save finds zero segments, it deletes every sidecar file for the image, including the _seg.txt. Path: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:107-108 -\> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:209-215 -\> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_segmentation.py:58-63. So anything this rule rejects can become permanent data loss.
>
> NOT FAITHFUL as a contract to be followed literally, although the worked example is correct. I re-ran lines 561-588 in memory (numpy 2.2.6, cv2 4.12.0, no package import, no files written). With image_size=(480,640) the result is vertices [[64,48],[128,48],[128,96]], class 0 (aliases are cleared first at file_navigation_manager.py:281), and a 1617-px triangle mask that includes its edges. The '7 or more tokens, odd count' check (line 564) is right, and even-count lines are skipped whole.
>
> Defects:
> (1) 'All numeric' is wrong for the label. Only parts[1:] is parsed as float (line 568). 'dog 0.1 0.1 0.2 0.1 0.2 0.2' is accepted and the label gets a new class id and alias (lines 345-377).
> (2) Some numeric-looking values abort the whole file instead of skipping the line. 'nan', 'inf' and '1e999' pass float() but raise ValueError/OverflowError at line 573, which is outside the try at lines 567-570. Segments are only added after the parse loop, so one such token throws away every valid line. The caller catches the error (lines 202-204) and falls back to _coco.json, _CM.npz, .xml, _createml.json, then .txt. If none of those exist, the next auto-save deletes the _seg.txt. Separately, a scaled coordinate beyond the int32 range raises at line 584 after earlier polygons were already added, so the fallback format is merged on top of a partial load.
> (3) 'With rounding' does not say which rounding. It is Python round(), which rounds exact halves to the nearest even number. It is applied to x*width and y*height with no clamping. Verified: 2.5 -\> 2 and 4.5 -\> 4, where a JS Math.round port gives 3 and 5. The example never hits a .5 value, so a port that rounds half up would still pass it.
> (4) 'Filled into a mask' hides how cv2.fillPoly (line 584) draws. Edges are always included, and self-intersecting polygons use even-odd fill: a pentagram's center stays empty. A canvas fill would not match pixel for pixel.
> (5) 'Dropped if no pixel is set' is literally true but misleading. Zero-area polygons are kept: three identical points give 1 px, collinear points give 129 px. Only shapes entirely off the image are dropped. A flat polygon at x=1.0 maps to column 640 and is dropped (0 px), while the same shape at x=0.0 is kept (97 px). Stored vertices are not clamped, e.g. [-320,-240].
> (6) Order matters. The label map is built at line 579, before the empty-mask drop at line 587, so a named label whose only polygon is dropped still registers an alias and uses up an id. An existing alias literally named '0' wins over int('0') (lines 362-367).
>
> Suggested amendments: say the label can be any string; spell out which float formats are accepted and that nan/inf abort the whole file; state round-half-to-even and scaling by width/height with no clamping; specify edge-inclusive even-odd fill; say zero-area polygons are kept. Add Given/When/Then cases for 2.5 -\> 2, a nan token, and a collinear polygon.
>
> No instruction-like text or credentials in lines 542-600.

### RULE-041: YOLO Segmentation import: polygon rasterization (folded card)

**Compliance judge:** P0 no, faithful yes

> P0 NOT JUSTIFIED UNDER THE COMPLIANCE LENS (recommend P1). E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:542-600 imports one sidecar file format in an Apache-2.0 desktop tool for AI-assisted (SAM) image labeling (E:\\GitHub\\LazyLabel\\analysis\\lazylabel\\ASSESSMENT.md:26). It moves no money. Nothing in the repo points to a regulatory, audit, retention or financial-reporting duty: a search of all .md files for compliance/regulat/audit/HIPAA/FDA/GDPR/financ found only a lint note and pip-audit commands. No regulator, auditor or finance controller would care if the polygon fill changed. The data-integrity case is only indirect. The code decides how saved polygons turn back into masks, and that is a real accuracy contract: exact pixel matches across formats are already tested at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_exporters.py:373-387 and 602-852. But the rule does not protect data. It is a lenient parser that silently drops malformed lines (564-565, 567-570) and polygons that fill no pixels (587-588), with no message to the user. If every line is dropped, the file loads as zero segments and the loader stops looking at other formats. ASSESSMENT.md section 5.1 says Auto-Save can then delete the annotation files. That makes the skip behavior a data-loss risk, not a safeguard. Keep it in the P1 equivalence tests, which already exist. This matters for the web rewrite: Python round() rounds halves to even (checked: round(12.5)=12), while JavaScript Math.round rounds halves up, and browser canvas fills differ from cv2.fillPoly, which includes edge pixels.
>
> FAITHFUL: YES. I checked the example with numpy/cv2 in memory, without importing the legacy package. The line has 9 tokens (odd, at least 7). The points round to (10,10),(10,19),(19,19),(19,10), using x times width and y times height (line 573). cv2.fillPoly (line 584) fills x 10-19 and y 10-19, edges included, which is 100 pixels. Label '0' becomes class 0 through _build_label_map (345-379), but only if no existing alias named '0' points to another id, because aliases are checked first (362-364). Each segment gets type 'Loaded' and keeps its vertices (590-597). The skip rules match lines 564, 567-570 and 587-588. Gaps to add to the card (none of them contradict it): (1) 'nan' and 'inf' tokens pass float(), but int(round()) on line 573 then raises ValueError or OverflowError outside the try block (checked). That aborts the whole file instead of skipping one line, and load_existing_mask (202-204) moves on to the next file format. (2) Coordinates outside 0-1 are not clamped: fillPoly clips the mask to the image, but the stored vertices stay out of bounds. (3) The rounding parameter should say 'round half to even' explicitly. I found no instruction-like text and no credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful no

> P0 JUSTIFIED (data integrity). _seg.txt is second in the load order (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136), so for YOLO segmentation datasets this function is the only way saved labels come back. What it loads goes back to disk without the user asking. Segments are cleared and reloaded on every image change (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:281,343). Auto-save on navigate is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45; file_navigation_manager.py:156-160). The exporter overwrites \<base\>_seg.txt (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_segmentation.py:48-52). A save with no segments deletes every annotation file for the image (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:106-109). So which lines are skipped, and how points are rounded and filled, decides what stays in the dataset.
>
> NOT FAITHFUL. The main example is exactly right, but the skip list is wrong for one kind of bad input, and that input can cause data loss.
>
> CONFIRMED (cited logic run in memory with the project venv, numpy 2.2.6 / cv2 4.12.0, no legacy module imported):
> - The 9-token example passes the token check at line 564. Coordinates times size come out exactly 10.0 and 19.0.
> - Vertices are [[10,10],[10,19],[19,19],[19,10]]. cv2.fillPoly at line 584 sets exactly 100 pixels, x 10-19 and y 10-19, so edges are included.
> - Type is 'Loaded' (593) and the rounded integer vertices are kept (595).
> - Class 0 comes from _build_label_map (345-379), assuming no existing class alias is named '0'.
> - The stated skips work: too few or even tokens (564), text float() rejects (567-570), polygons that fill nothing (587-588).
>
> DEFECT:
> - Whole file lost: the try at 567-570 wraps only float(). Tokens 'nan', 'inf', '-inf' and '1e308' pass it, then int(round(...)) at line 573 raises ValueError or OverflowError outside the try (confirmed). The line is not skipped: the whole call stops before any add_segment, so every valid polygon in the file is lost.
> - Fallback: load_existing_mask (file_manager.py:187-205) logs the error and moves on to _coco.json, _CM.npz, .xml, _createml.json, .txt.
> - Deleted on disk: if none of those exist, the image opens empty, and the next auto-save deletes the original _seg.txt (save_export_manager.py:106-109 -\> yolo_segmentation.py:58-63).
> - Partial load: a pixel value beyond int32 raises OverflowError at line 584 inside the add loop (confirmed). Earlier polygons stay added, and the fallback can then add another format's segments on top.
> - 'NaN' literally means not a number, so 'non-numeric values are skipped' is false for that input. A rewrite that skips such lines would pass this rule yet differ from legacy. Tests cover only 'abc' (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\test_file_manager.py:773-785).
>
> NOT PINNED BY THE EXAMPLE:
> - round() is half-to-even (round(12.5)=12 confirmed), but no example has a .5 case.
> - x is scaled by width and y by height (line 573; image_size is (h, w)), but a 100x100 image cannot catch a swap.
> - Degenerate polygons are kept, not dropped: a single point fills 1 px, three collinear points fill 11 px. Only fully off-image polygons fill 0.
> - Off-image vertices are stored unclamped while the mask is clipped.
> - Class ids are assigned from all parsed lines before empty polygons are dropped, so dropped lines still use up ids and aliases.
>
> REQUIRED CHANGES:
> (1) Keep the current example.
> (2) Add a non-square case with a tie: image_size (h=50, w=200), pair (0.125, 0.25) gives vertex (25, 12). A width/height swap gives (6, 50); half-up rounding gives (25, 13).
> (3) Add a Then clause: a nan/inf coordinate stops the whole _seg.txt load and the loader falls back to the next format; a coordinate beyond int32 gives a partial load.
> (4) SME question: should a non-finite coordinate skip only its line, or keep the legacy whole-file stop plus fallback, which can end in auto-save deleting the file?
>
> DOCS VS CODE: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ARCHITECTURE.md:193 says delete_all_outputs runs only when the user cleared annotations. The code (save_export_manager.py:106-109; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6589-6590) deletes whenever segments are empty, whatever the cause.
>
> No instruction-shaped text in cited lines 542-600; no credentials.

### RULE-052: Leaving a sequence frame saves it and marks it Saved, even if it is a reference

**Compliance judge:** P0 yes, faithful yes

> P0 JUSTIFIED — on the data-integrity leg only (no money, no regulator; LazyLabel is a local desktop annotation tool, so a finance controller has no stake). But this is the sole automatic commit-and-delete path for the user's annotation artifacts, and it is destructive:
>
> 1) Commit-on-navigate. Leaving a frame is what persists that frame's segments (main_window.py:3424-3427 -\> 3480-3519). If this silently stopped firing, fired on the wrong index, or wrote a partial format set, labeling work is lost with no user-visible error. Note the save targets a frame other than the one displayed via a current_image_path swap (main_window.py:3494-3496, restored at 3519) — a regression there writes frame A's masks into frame B's files, i.e. cross-frame corruption.
>
> 2) Delete-on-empty is unconditional and broader than the card states. When segment_manager is empty, save_single_view_output calls _delete_associated_files (save_export_manager.py:106-109, 523-542) -\> delete_all_outputs (exporters/__init__.py:209-215), which iterates every REGISTERED exporter — all 7 (NPZ, NPZ_CLASS_MAP, YOLO_DETECTION, YOLO_SEGMENTATION, COCO_JSON, PASCAL_VOC, CREATEML; exporters/__init__.py:14-23) — not just the user's selected export_formats. Each delete_output is a bare exists/remove on the image-stem-derived path (npz.py:32-37), so it removes files LazyLabel never wrote. The writer's own contract at exporters/__init__.py:192-197 states neighboring files "may be another format's export ... or ground truth that shipped with the dataset" — deletion does not honor that asymmetry. Silent change here destroys source data.
>
> 3) Live defect that raises the stakes: save_single_view_output catches and logs its own export exceptions (save_export_manager.py:131-133), so nothing propagates to the caller's try block; _auto_save_sequence_frame then still runs mark_frame_saved (main_window.py:3510-3513), which sets status SAVED and DELETES the in-memory propagated masks (sequence_view_mode.py:369-372). A failed export therefore yields a cyan "saved" frame with nothing on disk and the only in-memory copy discarded; revisiting falls through to the NPZ-on-disk branch (main_window.py:3617-3619), loads empty, and the next navigation deletes all 7 outputs for that image. This is exactly the silent-loss cascade a P0 equivalence contract exists to catch.
>
> FAITHFUL — every claim in the Given/When/Then is verified in executable code: auto_save default True (config/settings.py:45); fires only when target != current (main_window.py:3426); default formats NPZ + YOLO_DETECTION (settings.py:8-9, consumed at save_export_manager.py:117-122); status -\> 'saved' overwriting REFERENCE with no guard, plus propagated-mask eviction (sequence_view_mode.py:365-373); 'saved' renders cyan QColor(0,188,212) (timeline_widget.py:36); N / B / H are next-flagged / next-reference / next-archetype (hotkeys.py:122-157) and all route through _on_sequence_frame_selected (main_window.py:4671, 4693, 5156); zero-segment branch deletes files and skips mark_frame_saved, so status is unchanged (main_window.py:3500, 3510-3515).
>
> Two precision fixes for the card, neither a faithfulness failure: (a) make explicit that deletion covers all 7 formats irrespective of selected export_formats and removes pre-existing non-LazyLabel files; (b) "although it is still a reference" is correct at the status level only — reference_frame_indices derives from _reference_annotations (sequence_view_mode.py:103-105), so propagation data and B-key navigation survive; the real downstream effect of the downgrade is that Clear All Flags (main_window.py:3462-3466) and clear_propagation_results (sequence_view_mode.py:152-159) spare only REFERENCE and will wipe the downgraded frame to PENDING. Recommend splitting delete-on-empty into its own rule card — it is the strongest P0 leg and deserves independent equivalence tests, while the status mutation is the weakest (cosmetic/navigational).
>
> SECURITY: no credentials in any cited or traversed line. No injection-shaped text found — the cited ranges contain only ordinary docstrings, and a case-insensitive grep for "SYSTEM:", "ignore previous", "false positive", "approved", "reviewer should" across legacy/lazylabel/src/lazylabel returned no matches. Read-only throughout; no files created or modified.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: PASS (with two caveats and one stray citation).
>
> Re-derived path, end to end:
> 1. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:3425-3427 — auto-save fires for `current_idx` only when `current_idx != frame_idx`. Card's "fires only when the target frame differs" is exact.
> 2. main_window.py:3486 — gated on `get_settings().get("auto_save", True)`; the checkbox is sourced from Settings (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45, `auto_save: bool = True`) via ui\\widgets\\settings_widget.py:148. Card's parameter and citation are correct.
> 3. main_window.py:3494-3496/3519 — `current_image_path` is temporarily swapped to the LEAVING frame's path and restored in `finally`, so the export targets frame 7, not frame 8. Card is right about which frame gets written.
> 4. main_window.py:3500-3501 -\> `save_export_manager.save_output()`. In sequence mode `view_mode == "sequence"` (main_window.py:3059), so it takes `save_single_view_output`, which runs `export_all(selected formats)` (ui\\managers\\save_export_manager.py:117-122). Default formats are `["NPZ", "YOLO_DETECTION"]` (config\\settings.py:8-9, :46) — "by default NPZ + YOLO detection" confirmed.
> 5. main_window.py:3510-3513 — only when the frame HAS segments does it call `mark_frame_saved`. sequence_view_mode.py:365-373 sets `FrameStatus.SAVED` unconditionally (no reference check) and deletes `_propagated_masks[idx]` (confidence scores are kept — the card correctly limits its claim to masks). The "even if it is a reference" edge case is real: a REFERENCE frame's status is overwritten to SAVED, though `_reference_annotations` survives, so B/Shift+B reference navigation (sequence_view_mode.py:103-105, :458-469) still finds it while the timeline no longer paints it as a reference. Cyan is confirmed: ui\\widgets\\timeline_widget.py:36 `"saved": QColor(0, 188, 212)`.
> 6. Empty branch: save_export_manager.py:107-109 -\> :523-529 -\> core\\exporters\\__init__.py:209-215 loops every registered exporter. There are exactly 7 (NPZ, NPZ_CLASS_MAP, YOLO_DETECTION, YOLO_SEGMENTATION, COCO_JSON, PASCAL_VOC, CREATEML — registered in the 7 exporter modules), and deletion ignores which formats the user selected. main_window.py:3514-3515 only logs, so status is genuinely left untouched. Card is exact here.
> 7. Ordering: save -\> `set_current_frame` -\> `_load_sequence_frame` (main_window.py:3427-3432). "Frame 8 then opens" is correct.
> 8. Trigger list: hotkeys N / B / H map to next-flagged / next-reference / next-archetype (config\\hotkeys.py:122-151) and all funnel into `_on_sequence_frame_selected` (main_window.py:4671, 4693, 5156), as does a timeline click/drag (ui\\widgets\\timeline_widget.py:457, 465) and a file-list click on an in-sequence file (main_window.py:1448-1453). The When is accurate, if not exhaustive (Shift+N/B/H and file-list clicks also qualify; the post-trim call at main_window.py:5291 passes the current index so it self-cancels at the != gate).
>
> Caveats the P0 contract should absorb (they do not contradict the card, but the Then is slightly over-coupled):
> a. "Frame 7 is exported ... Its status becomes 'saved'" treats the two as one event. They are not: `save_single_view_output` swallows export failures in its own try/except (save_export_manager.py:131-133) and returns normally, after which main_window.py:3513 still calls `mark_frame_saved`. A frame can therefore show cyan "saved" with nothing on disk. Any equivalence test must assert files-written separately from status.
> b. Re-entrancy guard main_window.py:3419-3422 silently drops a frame change (no save, no navigation) if one is already in flight — reachable because `_delete_associated_files` calls `QApplication.processEvents()` (save_export_manager.py:540) during fast scrubbing. Rebuilds without a single-threaded event loop will not reproduce this skip; decide deliberately whether to preserve it.
> c. Citation hygiene: sequence_view_mode.py:143-159 (`clear_propagation_results`) is NOT on this path — it is the pre-propagation reset. The mask clearing this rule relies on is at :365-373, which is also cited. Drop the 143-159 reference.
>
> Injection scan: no instruction-shaped text in any cited range or in the supporting files (main_window.py, sequence_view_mode.py, save_export_manager.py, exporters\\__init__.py). No credentials present in any rule parameter here.
>
> P0 JUSTIFIED: yes — data integrity, not money or regulation. Two irreversible filesystem effects hang off a mere navigation gesture: (i) the user's in-memory annotations are the only copy until this save runs, and (ii) the empty branch deletes outputs for all 7 formats, including formats the user never selected. `export_all`'s own docstring (core\\exporters\\__init__.py:192-196) states that writing never deletes because neighbouring files "may be ground truth that shipped with the dataset" — yet the delete branch removes exactly those files. That write/delete asymmetry is a silent data-loss path and is precisely the kind of behavior a rewrite must be proven equivalent against. Recommend the rule card be split so the destructive empty-frame deletion is its own P0 card with that asymmetry stated explicitly.
>
> SME questions: (1) Should leaving a REFERENCE frame really relabel it SAVED, or should reference status win? (2) When a frame's annotations are cleared, should deletion be limited to the currently selected export formats rather than all 7? (3) Is a frame allowed to display "saved" when the export raised and wrote nothing?

### RULE-052: Sequence frame auto-save when changing frames (folded card)

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. Every clause of the G/W/T is traceable. main_window.py:3414-3434 calls _auto_save_sequence_frame(current_idx) before switching when current_idx != frame_idx; :3486 gates on get_settings().get("auto_save", True); :3494-3496 temporarily repoints current_image_path at the outgoing frame so outputs land under img_022; :3510-3513 marks the frame SAVED only when segment_manager.segments was non-empty; sequence_view_mode.py:365-373 sets FrameStatus.SAVED and deletes _propagated_masks[idx]. The delete-when-empty claim in the plain English is also real: _save_output_to_npz -\> save_export_manager.py:107-109 -\> _delete_associated_files (:523-542) -\> delete_all_outputs(), with no confirmation prompt. Three precision gaps worth fixing on the card, none serious enough to call it unfaithful: (1) "propagated masks cleared so it reloads from disk" conflates two mechanisms — _propagated_masks is cleared only on the has_segments path (mark_frame_saved), while the reload-from-disk effect comes from the unconditional _sequence_mask_cache invalidation at :3504-3508 that also runs in the delete branch; (2) Parameters says "(none)" but there are two: auto_save, hardcoded default True at config/settings.py:45, and the export_formats set at save_export_manager.py:117-122 that decides which files "img_022 outputs" actually means; (3) the G/W/T only exercises the benign write path — the destructive branch (empty segment_manager at navigation time deletes the outgoing frame's existing outputs from disk) has no scenario, and that is the half most likely to regress.
>
> P0 NOT JUSTIFIED under the compliance lens. LazyLabel is a single-user desktop SAM-assisted image annotation GUI (README: Apache 2.0, pip-installed, writes NPZ/TXT label files next to images on local disk). No money moves. No statutory or regulatory obligation is enforced — no retention schedule, no PII/PHI, no financial record, no audit trail, no external reporting. There is no regulator, auditor, or finance controller anywhere in this system's world who would ever review, sample, or attest to this behavior; if the auto-save-on-scrub semantics changed silently, no filing would be wrong and no control would fail.
>
> The only prong with any pull is data integrity, and it is genuine but consumer-grade: a silent divergence could lose annotations or, via the unguarded delete_all_outputs() path, destroy label files a user spent hours producing. That is a real regression hazard and deserves an equivalence test — but P0 "guards data integrity" should mean a system of record whose corruption has consequences outside the app (irrecoverable customer data, restatement, breach). Here the artifacts are locally regenerable by re-annotating, the save is also reachable manually, and blast radius stops at one user's working directory. RECOMMENDATION: downgrade to P1 (data-loss correctness), keep it in the verification set, and add the missing scenario — "Given frame 22 has an existing img_022.npz on disk and segment_manager is empty when the user scrubs to 23, Then img_022 outputs are deleted with no prompt" — since that untested branch, not the happy path, is where a rewrite will silently destroy work. Also add auto_save=True and export_formats to the parameter list.
>
> INJECTION/CREDENTIALS: none. Grep of main_window.py, sequence_view_mode.py and save_export_manager.py for SYSTEM:/ignore-previous/false-positive/approved-by patterns returned zero hits, and no credential values appear in the cited ranges or the save path traced.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: PASS with caveats. Re-derived independently from main_window.py:3414-3434 -\> :3480-3519 -\> sequence_view_mode.py:365-373. Every claim in the Given/When/Then holds: (a) auto-save gate is control_panel.get_settings()["auto_save"] default True (config/settings.py:45, widgets/settings_widget.py:151); (b) the save fires only when current_idx != frame_idx and strictly BEFORE set_current_frame, with current_image_path swapped to the outgoing frame and restored in finally, so segments and the pixmap read by _build_export_context (save_export_manager.py:396-399) still belong to frame 22 - ordering is correct; (c) view_mode "sequence" routes to save_single_view_output, not the multi branch (main_window.py:627-631, save_export_manager.py:92-95); (d) empty frames hit _delete_associated_files (save_export_manager.py:106-109); (e) has_segments -\> mark_frame_saved sets FrameStatus.SAVED and does del self._propagated_masks[idx] (sequence_view_mode.py:365-373), and combined with the unconditional _sequence_mask_cache invalidation (main_window.py:3504-3508) the frame genuinely re-reads from disk on return per the loader priority propagated -\> preload cache -\> NPZ (main_window.py:3591-3625). Output naming is os.path.splitext(image_path)[0] + ".npz" (core/exporters/npz.py:29-30), i.e. derived from the image filename, so "img_022 outputs" is correct given frame 22 is img_022.*. No rounding is involved. Under-specified edge cases the rewrite team should have in the contract (none contradict the card): (1) the empty-frame branch deletes EVERY registered format's output via delete_all_outputs (core/exporters/__init__.py:209-215), not only the selected format, and it neither changes frame status nor clears _propagated_masks - so a propagated frame the user emptied loses its disk files while its in-memory masks survive and re-load on return (main_window.py:3591-3606), a real data-resurrection asymmetry; (2) "marked saved" does not imply "written": save_single_view_output swallows its own exceptions (save_export_manager.py:131-133) and export_all writes nothing for an empty export_formats set (core/exporters/__init__.py:189-206), yet mark_frame_saved still runs because it keys off has_segments rather than the written list; (3) mark_frame_saved has no reference-frame exemption, so leaving a REFERENCE frame that has segments overwrites its status to SAVED, unlike _on_clear_all_flags which explicitly preserves "reference" (main_window.py:3462-3466); (4) during scrubbing timeline_widget.py:461-465 emits per crossed frame while _delete_associated_files calls QApplication.processEvents() (save_export_manager.py:540), so re-entrant selections are dropped entirely by the guard at main_window.py:3419-3422 - neither saved nor navigated. P0 JUSTIFIED: yes, on data-integrity grounds. This rule is the sole thing between a mouse gesture and destructive persistence of the product's primary asset - it silently overwrites annotation outputs on every frame change and silently deletes all on-disk annotation formats for a frame that currently has no segments. It moves no money and carries no regulatory duty, but the write/delete-on-navigate semantics plus the status transition PROPAGATED -\> SAVED are exactly the behavior a rewrite must prove equivalent against. INJECTION SCAN: clean. No instruction-shaped text in the cited ranges or surrounding code; the only "instructions" matches in ui/ are Qt QLabel UI strings (e.g. widgets/sequence_widget.py:142-152, hotkey_dialog.py:169-176). No credential values present in the cited lines, so no masking was required.

### RULE-053: Multi-view batch navigation always saves, ignoring the Auto-Save setting

**Compliance judge:** P0 yes, faithful yes

> P0 is justified, but only because this affects data integrity. No money or regulation is involved in this labeling tool.
>
> What I checked:
> - All three ways of moving between image pairs call the save first, with no condition: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6497 (next pair), :6530 (previous pair), and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:401-403 (clicking a file in the tree).
> - The Right key reaches this path through main_window.py:993 and 1638-1640, then file_navigation_manager.py:471-473, then _load_next_multi_batch.
> - Neither _save_multi_view_annotations (main_window.py:6559-6636) nor any of its callers reads the auto_save setting. Single view does check it (file_navigation_manager.py:157-160 and 271-274), and so does sequence mode (main_window.py:3486). The checkbox tooltip says the setting applies to "any new image" (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\settings_widget.py:39-42).
> - For a viewer with 0 segments, delete_all_outputs (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:209-215) removes all 7 known annotation files (.npz, _CM.npz, .txt, _seg.txt, _coco.json, _createml.json, .xml). It does this whatever formats are selected, so it can also delete ground-truth files that shipped with a dataset. The export_all docstring (:192-196) says those files should be left alone.
> - Failures while loading annotations are only logged (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:202-204 and main_window.py:6115-6116). An image whose files can't be read therefore shows 0 segments, and the next arrow press deletes all of its annotation files, even with Auto-Save OFF.
> - If an image fails to load, the annotation load is skipped (main_window.py:6069-6083). The viewer keeps the previous image's segments. If that list was empty, the next arrow press deletes the new image's annotation files the same way.
> - Save errors are also only logged (main_window.py:6635-6636).
>
> Silent, permanent deletion or overwriting of the tool's main output is behavior a rewrite has to pin down.
>
> Caveat: the Auto-Save bypass has no test. tests\\unit\\ui\\test_main_window.py:159 only tests single view, and tests\\unit\\ui\\test_multi_view_annotation_io.py only tests the save function itself. The bypass also contradicts the tooltip, so it is most likely a bug. Record it as an SME decision ("copy this behavior, or respect Auto-Save?") rather than blindly requiring the rewrite to match it.
>
> The rule card is faithful, with small gaps:
> 1. The save also runs when navigation fails. The "No current image" and "Reached end of image list" checks come after the save (main_window.py:6497-6512). It also runs when the user clicks the same file in the tree again.
> 2. "Every sidecar" really means the 7 export files. A plain \<stem\>.json is only deleted by save_export_manager.py:553-561, which this path never calls.
> 3. The Given/When/Then order is correct. getNextFilePair jumps 2 rows ahead (utils\\fast_file_manager.py:1478-1479), so img_012 and img_013 load after the save.
> 4. "Without applying any crop" is true: main_window.py:6613-6632 passes no crop coordinates, while single view applies the crop at save_export_manager.py:412-417 and 426. But the cited crop_manager.py:102-107 doesn't prove it. It calls _apply_multi_view_crop_coordinates, which isn't defined anywhere. remove_multi_view_crop_visual doesn't exist either, and mw.multi_view_images exists only as a Protocol stub at core\\protocols.py:190. So setting a crop in multi-view would crash with AttributeError. Cite main_window.py:6613-6632 instead.
>
> The cited lines contain no text that looks like instructions to an AI tool, and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL, with omissions to add to the card. I traced the path myself. P0 is justified on data-integrity grounds: the rule decides when annotation files (the tool's only output) get written or destroyed, and it overrides an explicit user setting. The tooltip at legacy/lazylabel/src/lazylabel/ui/widgets/settings_widget.py:39-41 says the setting covers saving "when switching to any new image (navigation keys, double-click, etc.)".
>
> What the code does (all paths under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel):
> (1) Right key: hotkeys.py:37 maps Right to load_next_image, wired as an app-wide QShortcut (main_window.py:993, 1044-1047). No other default action uses Right. That calls main_window.py:1638-1640, then file_navigation_manager.py:471-472, then _load_next_multi_batch.
> (2) The save call is unconditional: main_window.py:6497 and 6530, and file_navigation_manager.py:402-403 (file-tree selection). Nothing reads auto_save. Single view does check it (file_navigation_manager.py:157-160, 271-274), and so does sequence mode (main_window.py:3486).
> (3) Order: the save runs first (6497), then the next pair is fetched (6508), then both viewers load (6515-6516). Viewer 0 is saved before viewer 1 (range(2) at 6581).
> (4) Next pair is rows +2 and +3 (fast_file_manager.py:1478-1501), so img_010 leads to img_012/img_013. This assumes img_010-013 sit next to each other in the current sort.
> (5) A viewer with no segments goes through delete_all_outputs (6589-6594; exporters/__init__.py:209-215). It removes all 7 registered outputs (.npz, _CM.npz, .txt, _seg.txt, _coco.json, .xml, _createml.json) no matter which formats are selected. A viewer with segments goes through export_all for the selected formats only, and never deletes anything (__init__.py:189-206).
> (6) No crop: the save builds ExportContext without crop_coords and never calls _apply_crop_to_mask. Single view does apply crop (save_export_manager.py:412-417).
>
> Wording to tighten:
> (a) "every sidecar" / "all files" really means the 7 registered format outputs. A legacy \<stem\>.json alias file is not removed; only the unused helper _delete_multi_view_files does that (save_export_manager.py:553-561).
> (b) "moving to another pair ... every time" is too narrow. The save also runs when nothing moves: at the end or start of the list (6510-6512, 6545-6547), and when the file tree re-selects the pair already shown (there is no same-image check, unlike single view at file_navigation_manager.py:153/267).
> (c) The crop_manager.py:102-107 citation does not support "no crop". It calls _apply_multi_view_crop_coordinates, and that method, like remove_multi_view_crop_visual (called at crop_manager.py:88 and 426), is defined nowhere in legacy/lazylabel. So applying or clearing a crop in multi-view would raise AttributeError. That is a defect finding; the real evidence for "no crop" is main_window.py:6559-6636.
>
> Edge cases the rule contract should add:
> - A failure in one viewer is caught and only logged (6635-6636), and navigation carries on, so a failed save loses data silently.
> - If a viewer's annotation file is damaged, loading fails quietly (6115-6116) and the viewer shows 0 segments. The next navigation then deletes that file and every other format output for the image.
> - If a viewer's image fails to load (pixmap null), its segment manager is not cleared (6069-6083). Leftover segments are skipped at save (6598-6599), but an empty manager still deletes that image's outputs.
> - Segments without a class_id give an empty class_order and are skipped silently (6603-6604).
>
> Parameter check: "Viewers saved: indices 0 and 1 only" is correct (range(2)).
>
> SME question: is ignoring Auto-Save in multi-view intended, or should it follow the setting like single and sequence modes? The comments "Auto-save current annotations before navigating" (main_window.py:6496, 6529; file_navigation_manager.py:401) say auto-save, but the code has no check, so they don't match. No prompt-injection text or credentials found in the cited lines.

### RULE-053: Multi-view pair navigation always saves or deletes both images (folded card)

**Compliance judge:** P0 yes, faithful yes

> P0 holds on the data-integrity prong, not the compliance prong. Compliance lens alone: no. LazyLabel is a local image-annotation desktop app; no money moves and no regulatory regime is in scope. No regulator, auditor, or finance controller exists for this code path, so judged on compliance only this would not sustain P0.
>
> Data integrity: decisively yes. This rule is the sole arbiter of whether the app's only durable artifact (hours of human labeling) survives navigation or is irrecoverably erased. Empty viewer triggers delete_all_outputs (main_window.py:6589-6594), which iterates EVERY registered exporter rather than the user's selected formats (core/exporters/__init__.py:209-215), each doing a bare os.remove with no trash, backup, or undo (core/exporters/npz.py:32-37). Both rewrite failure directions are silent and unrecoverable: save too little and labeling work vanishes on the next arrow press; delete too eagerly and untouched ground-truth files are destroyed. The latter is already latent in legacy: a user exporting only YOLO who empties a viewer also loses a shipped COCO ground-truth JSON.
>
> Faithful: yes, verified end to end. Right maps to load_next_image (config/hotkeys.py:37); multi-view dispatches to _load_next_multi_batch (ui/managers/file_navigation_manager.py:471-472); that calls _save_multi_view_annotations unconditionally (main_window.py:6497, and :6530 for Left, and file_navigation_manager.py:402-403 on file-tree click). _save_multi_view_annotations reads only export_formats (main_window.py:6576-6579) and never consults auto_save, whereas single view gates on it (file_navigation_manager.py:156-160) and sequence mode gates on it (main_window.py:3486). The "regardless of Auto-Save" claim is confirmed by code, not inferred.
>
> Refinements for the rule card. (1) Comment/code discrepancy: comments at main_window.py:6496 and :6529 say "Auto-save current annotations before navigating" and the docstring at :6562-6564 says the user's chosen export formats "apply here too" — neither is true of executable code (no auto_save gate; deletion ignores chosen formats). The rule correctly follows code over comments; flagging because a porting maintainer may trust the comment. (2) Ordering nuance missing from the Then: the save/delete at :6497 runs BEFORE the end-of-list check at :6510-6512, so pressing Right at the end of the list still deletes/writes even though navigation aborts. (3) Add the delete-all-formats vs write-selected-formats asymmetry to the specification — it is the part a rewrite is most likely to silently "fix."
>
> Injection: none found. No instruction-shaped text in any cited range or in the exporter registry; docstrings are ordinary descriptive prose. No credentials in any evidence line.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. Re-derived independently from the code. (1) Both navigation methods call _save_multi_view_annotations as their first statement (main_window.py:6497 and :6530), before the end-of-list guard and before _load_multi_view_image — so the GWT ordering "delete/write, then the next pair loads" is correct. (2) _save_multi_view_annotations (main_window.py:6559-6636) loops `for viewer_idx in range(2)`; a viewer with no segments hits delete_all_outputs (6589-6594), otherwise export_all with the user's selected formats (6613-6632). (3) The "regardless of Auto-Save" claim is verified by contrast, not assumption: the method reads settings only for export_formats (6576-6580) and pixel_priority (6609-6610) and never reads auto_save, whereas single view gates on it at file_navigation_manager.py:156-158 and :270-272 and sequence mode gates at main_window.py:3486. The third cited range (file_navigation_manager.py:401-403, file-tree click) likewise saves unconditionally. (4) "Right" is the default binding for load_next_image (hotkeys.py:36-38), routed to _load_next_multi_batch when view_mode == "multi" (file_navigation_manager.py:471-473). (5) "p1.npz and any other p1 annotation files" is accurate: delete_all_outputs (core/exporters/__init__.py:209-215) iterates every registered exporter, removing .npz, _CM.npz, .txt, _seg.txt, .xml, _coco.json, _createml.json. The repo's own tests corroborate (tests/unit/ui/test_multi_view_annotation_io.py:188-201 and :203-213). Viewer numbering matches the code's viewer_idx+1 convention (main_window.py:6489), and the fixed pair of two segment managers is set at main_window.py:3125 — no 4-viewer case to miss. Refinements for the contract, none falsifying: deletion is NOT scoped to the selected formats and will remove pre-existing .txt/.xml ground truth the tool never wrote, directly contradicting the "writing never deletes / foreign files are left alone" policy stated at core/exporters/__init__.py:192-196; the write branch silently skips a viewer with a null pixmap (6597-6599) or empty class_order (6602-6604), leaving a stale file; per-viewer exceptions are swallowed at 6635-6636 so navigation proceeds after a failed save (silent loss); and pressing Right on the last pair still deletes/writes before reporting "Reached end of image list" (6510-6512). "Parameters: (none)" is slightly under-specified — export_formats (settings_widget.py:200) and the hardcoded viewer count range(2) (main_window.py:6581) are the real knobs. P0 JUSTIFIED: this is the only path that irreversibly deletes a user's annotation files from disk, it fires on a bare arrow-key press, and it ignores the one setting a user would expect to disable it. In an annotation tool the label files are the product: a rewrite dropping the save loses work, one dropping the delete resurrects deleted labels via the loader's priority chain. Data integrity, not convenience. INJECTION: none. Cited ranges and the exporter module contain only explanatory docstrings; grep for SYSTEM:/ignore previous/false positive/approved across legacy/lazylabel/src/lazylabel returned no matches. No credential values in any evidence line.

### RULE-054: Propagation finish, Save All and Trim reload the current frame without saving it

**Compliance judge:** P0 yes, faithful yes

> FAITHFUL: every claim checks out against the code. (a) E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4638-4645 unconditionally reloads the current frame after propagation, with no save anywhere in _on_propagation_finished (4596-4637 read and verified). (b) The reload entry point at main_window.py:3577-3638 begins with segment_manager.clear() (3586) and clears undo history (3588-3589), then resolves in the stated order: propagated masks (explicitly skipped for reference frames, 3595-3597) -\> preload cache -\> disk. (c) The "never populated" claim about the preload cache is correct: a repo-wide grep finds only reads, dels and clear() of _sequence_mask_cache (3505-3508, 3636-3638, 4828-4832, 4894-4895) and no assignment anywhere, so _get_cached_mask_data always returns None. (d) The concrete scenario holds: _load_segments_for_reference_frame (3651-3656) uses the live in-memory segments as SAM2 prompts (consumed at 4257-4298), and _on_add_sequence_reference (3877-3898) does not persist anything, so the masks exist only in memory when the reload wipes them. (e) Save All destroys the current frame's edits twice over: the per-frame loop hijacks the shared segment_manager with clear() at 4776, then 4834-4839 clears and reloads again. (f) Trim at 5290-5291 calls _on_sequence_frame_selected(current_frame_idx), and the auto-save guard at 3424-3427 (current_idx != frame_idx) is false for that call, so no save happens before the clear+reload. Two refinements the rewrite team should carry: the rule says "leaving the frame saves an empty list", but save_export_manager.py:107-109 actually DELETES the associated annotation files when the segment list is empty (worse than stated, not overstated), and that auto-save path only runs when the auto_save setting is enabled (main_window.py:3486, default True).
>
> P0 JUSTIFIED, but under the data-integrity prong only, not the compliance prong. Judged strictly through the compliance lens the answer is no: LazyLabel is a local desktop image-annotation tool with no money movement, no regulated obligation, no audit trail, retention policy, or e-signature machinery anywhere in the code, so there is no regulator or finance controller who would be notified either way. What carries P0 is data integrity in its strongest form: annotations are the system's asset of record, and three ordinary user actions (propagation finish, Save All, trim) silently and irreversibly destroy unsaved work on the current frame, with the undo stack cleared in the same breath (3588-3589) and existing files deleted on the subsequent empty auto-save. There is no confirmation prompt, no notification, and no recovery.
>
> Caveat the orchestrator must not lose: this is a DEFECT, not a policy, so it must not be written into the equivalence contract as behavior to reproduce. The contract should be the inverted invariant -- "no operation may discard in-memory annotations for a frame without first persisting them or obtaining explicit user confirmation" -- with this legacy behavior recorded as a known-defect exception that the rewrite is expected to fix, plus a migration note that fixing it changes output datasets (reference-frame annotations that previously vanished will now persist on disk), which matters for dataset provenance if LazyLabel is used in any regulated imaging workflow. Two smaller findings from the same read: the comment at 4638-4639 claims the reload happens only "if it received propagated masks", but the code has no such guard and reference frames can never receive them (3595-3597) -- a comment that documents a safeguard the executable code does not implement; and the preload-cache branch at 3608-3615 plus the invalidation logic at 3503-3508 and 4827-4832 are unreachable dead code that should not be ported. No injection-shaped text (no "SYSTEM:", no "ignore previous instructions", no false-positive or pre-approval claims) appears in any cited region; all comments read as ordinary developer notes. No credentials appear in any cited line.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. Re-derived independently from the cited code; the Given/When/Then matches, including the ordering that matters most.
>
> Verified mechanics:
> 1) Propagation finish (main_window.py:4638-4645) calls _load_sequence_frame_segments unconditionally. _load_sequence_frame_segments (3577-3625) clears segment_manager, display caches, and undo history (3586-3589) BEFORE any reload, and never saves. Priority chain is exactly as the rule states: propagated masks guarded by `if not is_reference` (3592-3606), then _get_cached_mask_data (3609), then file_manager.load_existing_mask from disk (3619).
> 2) The "never populated" cache claim is correct and repo-verified: `_sequence_mask_cache` has zero assignments anywhere (only hasattr-guarded reads/deletes/clear at 3505-3508, 3636-3638, 4828-4832, 4894-4895), so _get_cached_mask_data always returns None. The rule correctly disbelieves the docstring at 3582 ("Load to Memory") which has no backing writer.
> 3) Ordering of prompts vs. wipe is right: _load_segments_for_reference_frame (3651-3656) returns segment_manager.segments directly when the path is the currently loaded image, so the 3 unsaved masks ARE used as prompts at propagation start (4257-4298); the wipe only happens at finish. No save occurs in _on_propagate_requested (4011+) or _start_propagation.
> 4) Reference-frame exclusion is right: with frame 3 in reference_frame_indices, the propagated-mask branch is skipped, cache is None, and load_existing_mask (core/file_manager.py:171-176) finds no sidecar and returns silently -\> 0 segments on screen.
> 5) Trim (5290-5291) is the subtlest case and the rule gets it right: _on_sequence_frame_selected is called with the SAME index, so the auto-save at 3427 is skipped by the `current_idx != frame_idx` guard, while set_current_frame still returns True for a valid index (sequence_view_mode.py:185-194), so the reload proceeds. "Reload without saving" is literally true.
> 6) Save All (4834-4839) confirmed; the in-memory wipe actually begins even earlier at 4776, and only non-flagged propagated frames are written (4752-4756) - the current frame is never among the saved unless it happens to be propagated.
> 7) Hotkeys in the Given are correct: G = add_reference_frame, Ctrl+P = propagate (config/hotkeys.py:116-121, 164-169).
>
> Precision notes for the rule author (none contradict the cited code; all are tightenings, not corrections):
> - "Leaving the frame saves an empty list" is loose on mechanism: with 0 segments, save_single_view_output takes the _delete_associated_files branch (managers/save_export_manager.py:107-109) - it DELETES sidecars rather than writing an empty one, and mark_frame_saved is skipped (main_window.py:3510-3515). The stated outcome ("no annotation file is ever written for the reference frame") is nonetheless exactly right for this scenario.
> - The Then implicitly assumes auto-save is on; _auto_save_sequence_frame returns early when the `auto_save` setting is False (3486-3487, default True). Worth adding as a parameter.
> - Strictly, the masks are not erased from process memory: set_reference_frame stores mask.copy() in _reference_annotations (sequence_view_mode.py:242, 248-264). "Lost" is accurate in the sense that matters (gone from canvas, undo history cleared, never persisted), but the modernization contract should state it as "lost from the editable/persisted state."
> - The Save All arm reaches the clear+reload only past the early return at 4757-4759 (at least one non-flagged propagated frame).
> - Correctly flagged discrepancy the rule already honors: the comment at 4638-4639 claims the reload happens only "if it received propagated masks" - the executable code has no such condition. The rule describes the code, not the comment.
>
> P0 JUSTIFIED (data integrity): this is silent, unrecoverable loss of user-authored annotation data - the product of the tool. The same call that discards the segments also clears undo history (3589), so there is no in-app recovery, and there is no confirmation prompt. In the empty-reload variant the follow-on auto-save actively deletes annotation sidecars rather than writing them. A modernized implementation must prove it does NOT reproduce this; it is a legitimate must-not-ship behavior contract item rather than a policy to port forward.
>
> Injection: no instruction-shaped text found in the cited files (scanned main_window.py, sequence_view_mode.py, save_export_manager.py for SYSTEM:/ignore-previous/false-positive/approval patterns - zero hits). No credentials appear in any evidence line.

### RULE-055: Auto-save current image before switching images (single view)

**Compliance judge:** P0 yes, faithful yes

> P0 IS JUSTIFIED, BUT ONLY BECAUSE IT PROTECTS DATA. No money moves and no regulation applies: LazyLabel is a tool for labelling images for machine learning, so a regulator or finance controller would not care. A data-governance or dataset auditor would care. This is the point where labelling work gets saved without the user asking, and it decides which image's label files get which labels. These parts protect the data, and I checked each in the code:
> (1) The save runs before current_image_path is changed (file_navigation_manager.py:271-276, and 157-162 on the other load path). So the files are written under the old image's name.
> (2) _reset_state (main_window.py:2138-2189) clears the segments and class aliases (core/segment_manager.py:20-26), the crop (2156) and the undo history (2188-2189). This stops img_001's labels from leaking into img_002's files.
> (3) The same save call deletes files when the open image has no segments. It removes that image's label files in every known format, not just the selected ones (save_export_manager.py:106-109 -\> exporters/__init__.py:209-215).
> If any of these changed without anyone noticing, labels would be lost or saved against the wrong image.
>
> THE GIVEN/WHEN/THEN IS FAITHFUL for the parts of the UI a user can reach.
> - The Right key (hotkeys.py:37) and a double-click in the visible file list (fast_file_manager.py:1607-1613, 1771-1806) both go through fileSelected -\> main_window.py:1440-1467 -\> load_image_by_path (267-281).
> - The save only runs when an image is already open AND auto_save is on. auto_save defaults to True (settings.py:45, settings_widget.py:43).
> - With NPZ and YOLO Detection selected, it writes \<base\>.npz and \<base\>.txt (npz.py:30, yolo_detection.py:46).
> - Picking the image that is already open returns before any save (153-154, 267-268).
> - The new image's own labels load after the reset (341-345).
>
> CAVEATS THE CONTRACT SHOULD ADD:
> (a) The rule leaves out the no-segments case, where "save" actually deletes every label file for the image. The export_all docstring says writing never removes files that ship with a dataset (exporters/__init__.py:192-196), but the save call around it does. Add this as a separate scenario.
> (b) "Crop is cleared" is only true for load_image_by_path. The cited load_selected_image puts a stored crop back on any image of the same size (file_navigation_manager.py:227-235). That path can only be reached through a hidden tree view (right_panel.py:121-122, 206) and the unit tests.
> (c) Save errors only show a notification (save_export_manager.py:131-133). Navigation still resets the state, so a failed save throws away the user's work.
> (d) Hidden bugs in the legacy code:
> - load_image_by_path resets the state and switches the path before cv2.imread (276-302). If the image can't be read, the next navigation saves an empty list and deletes that image's existing label files.
> - load_selected_image returns on qimage.isNull() (174-176) without resetting. img_001's segments would then be written into img_002's files on the next move.
> - If an image's only label file is damaged, the load error is swallowed (342-348, file_manager.py:202-204). The image then has no segments, and that file gets deleted when the user navigates away.
> (e) Auto-save in multi-view (401-403) ignores the auto_save setting, even though the checkbox tooltip says "any new image". This is outside this rule's scope.
> (f) The existing tests (tests/unit/ui/test_main_window.py:93-297) only cover _load_selected_image. load_image_by_path, the path users actually hit, has no test.
>
> I found no instruction-like text and no credentials in the cited lines.
>
> Files: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\settings_widget.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\right_panel.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\utils\\fast_file_manager.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\hotkeys.py

**Fidelity judge:** P0 yes, faithful no

> P0 IS JUSTIFIED. This rule decides whether a user's annotations on the open image get written to disk or thrown away when they move to another image. Through its empty-image branch it can also delete annotation files that already exist. Those files are what the app produces, so this is data integrity.
>
> NOT FAITHFUL. The concrete example is right, but the plain-English rule ("saves the open image in all selected export formats") is wrong in cases that change what ends up on disk. Paths below are relative to E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
>
> What I confirmed:
> - Both triggers reach load_image_by_path. Right is the default hotkey (config\\hotkeys.py:37). Right and double-click both go through FastFileManager (utils\\fast_file_manager.py:1607-1613, 1771-1806), then right_panel.py:208, then main_window.py:949 and 1440-1467.
> - Selecting the image that is already open returns early: no save, no reload (ui\\managers\\file_navigation_manager.py:267-268).
> - The save runs only when an image is already open and the auto-save checkbox is ticked. It is on by default (config\\settings.py:45, ui\\widgets\\settings_widget.py:43 and 151).
> - The save happens before the path switch and before _reset_state (file_navigation_manager.py:271-281).
> - With segments present, NPZ writes \<base\>.npz and YOLO Detection writes \<base\>.txt (core\\exporters\\npz.py:30, yolo_detection.py:46). These two are the default formats (exporters\\__init__.py:60-63).
> - _reset_state clears segments and class aliases (core\\segment_manager.py:20-26), the current crop (main_window.py:2154-2156) and undo/redo history (main_window.py:2188-2189).
> - load_existing_mask then loads img_002's own annotations and aliases (core\\file_manager.py:153-205, 335-343).
>
> What the card gets wrong or leaves out:
> 1. EMPTY IMAGE DELETES FILES. If the open image has 0 segments, the same save call writes nothing. It calls delete_all_outputs instead, which removes .npz, .txt, _seg.txt, _coco.json, _CM.npz, .xml and _createml.json, whatever formats are selected (ui\\managers\\save_export_manager.py:106-109, 523-542; exporters\\__init__.py:209-215). Load errors are swallowed silently (file_navigation_manager.py:346-348, file_manager.py:202-204). So if an image's annotation files failed to load, pressing Right deletes them.
> 2. A FAILED SAVE DOES NOT STOP NAVIGATION. Every exception becomes a toast (save_export_manager.py:131-133). Loading then continues and _reset_state throws away the unsaved segments.
> 3. UNREADABLE NEXT IMAGE. load_image_by_path switches current_image_path and clears state (lines 276-281) before calling cv2.imread (line 299). If the read fails, it returns at line 302. The old picture stays on screen, but the path now points at img_002 and there are 0 segments. The next navigation then deletes img_002's annotation files, as in item 1.
> 4. THE TWO CITED ENTRY POINTS BEHAVE DIFFERENTLY.
>    - load_selected_image (lines 153-162) re-applies a remembered crop for any image of the same size (lines 227-238), so "crop cleared" is false there.
>    - Its early return at lines 175-176 comes after the path has switched but before any reset, so img_001's segments stay attached to img_002's path.
>    - That path is only reachable from a hidden tree widget that is never shown (right_panel.py:121-122, 206); only tests call it. The card should cite load_image_by_path as the live behavior.
> 5. NO CHECK FOR EDITS. Every navigation re-exports, even when nothing was edited. For example, an image loaded from _coco.json gets new .npz and .txt files. Pressing Right on the last row does nothing, so nothing is saved.
>
> Suggested fix: keep the card but add three examples: 0 segments (all annotation files deleted), save error (toast shown, navigation continues, edits lost), and unreadable next image. Limit the citation and the crop claim to load_image_by_path.
>
> The cited lines contain no text aimed at manipulating automated analysis and no credentials.

### RULE-055: Auto-save on navigate (folded card)

**Compliance judge:** P0 yes, faithful no

> P0 IS JUSTIFIED, BUT ONLY ON DATA-INTEGRITY GROUNDS. No money moves and no regulation is enforced, so a regulator or finance controller would not care. A dataset auditor would. This rule is the only point where annotations reach disk before they are cleared from memory (_reset_state, file_navigation_manager.py:186 and :279-281). No "unsaved changes" prompt exists for annotations; the only one in ui/ is for hotkeys (hotkey_dialog.py:400-403). The rule also deletes files: when an image has no segments, delete_all_outputs (core/exporters/__init__.py:209-215) removes all 7 sidecar types, whichever formats are selected: .npz, _CM.npz, .txt, _seg.txt, _coco.json, .xml, _createml.json. A silent change would either lose work or leave stale or destroyed labels.
>
> WHAT THE CARD GETS RIGHT:
> - Default is True: config/settings.py:45, settings_widget.py:43/200.
> - In single view the save runs before the path is replaced and state is reset (file_navigation_manager.py:153-162 and :267-279).
> - It writes only the selected formats (save_export_manager.py:118-122).
> - With no segments it deletes the sidecars (save_export_manager.py:107-109, 523-529).
> - Sequence frame navigation checks the setting and marks the frame SAVED only if it had segments (main_window.py:3424-3427, 3486, 3510-3513).
>
> WHY IT IS NOT FAITHFUL:
> (1) Multi-view ignores the Auto-Save setting. Two cited spots (file_navigation_manager.py:401-403, main_window.py:6496-6497) and one uncited (6529-6530) call _save_multi_view_annotations unconditionally. That method (main_window.py:6559-6636) never reads auto_save. With Auto-Save OFF, multi-view navigation still overwrites files and deletes all sidecars for an empty viewer (6589-6594). This contradicts the card's "With Auto-Save on" condition and the checkbox tooltip (settings_widget.py:40-42). A contract built from this card would never test the OFF case.
> (2) "Re-selecting the same image does nothing" is false in multi-view. The multi-view branch (149-151) runs before the same-image check (153), and load_multi_view_from_path has no such check. Next/prev also save when navigation then stops at the end or start of the list, or when there is no current image (6497 runs before 6500-6512).
> (3) SAVED does not prove a write. save_single_view_output catches and hides export errors (save_export_manager.py:131-133), so the frame is still marked SAVED (3510-3513) when nothing was written.
>
> OTHER DATA-INTEGRITY RISKS THE CONTRACT SHOULD COVER:
> (a) load_selected_image sets current_image_path to B (line 162) before decoding it. If B fails to decode (175-176), A's segments stay in memory and the next navigation writes them into B's sidecars.
> (b) load_image_by_path clears segments (279-281) before cv2.imread. If that fails (299-302), the next navigation deletes all of B's sidecars, which were never loaded.
> (c) If every existing sidecar fails to parse (core/file_manager.py:202-204; error hidden at file_navigation_manager.py:207-212), the image loads with zero segments. Navigating away then deletes all 7 types, including ground truth that shipped with the dataset.
>
> SUGGESTED FIX: split the card into separate scenarios:
> - ON, single/sequence view, A has 2 segments, formats {NPZ, YOLO_DETECTION}: A.npz and A.txt are written before the in-memory segments are cleared.
> - ON, A has 0 segments: all 7 sidecar types are deleted.
> - OFF, single/sequence view: nothing is written or deleted, and unsaved segments are discarded.
> - Multi-view, ON or OFF: both viewers are saved or deleted on every next/prev/select, even for the same image or at the end of the list.
>
> QUESTIONS FOR AN SME:
> - Is the multi-view bypass of Auto-Save intended, or a defect to fix in the rewrite?
> - Should deleting on empty be limited to formats the tool wrote, instead of generic .txt and .xml files?
>
> No instruction-like text or credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful no

> P0 is justified. This rule decides when a user's annotation work gets written to disk and when annotation files get deleted. Those files are what the tool produces (labeled datasets). The next image load clears the segments in memory (main_window.py:2138-2141), so this rule is what stops the work from being lost. Its delete branch can also remove files that were already on disk.
>
> FIDELITY verdict: not faithful. The single-view part is correct, but the card generalises it to all modes, and the cited code contradicts that. All paths below are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
>
> What the card gets right:
> - Single view (ui/managers/file_navigation_manager.py:153-162 and 267-276): if the new path equals the current one (raw string compare), nothing happens. Otherwise, if an image is already open and auto_save is on, the current image is saved before current_image_path changes and B loads.
> - The save (ui/managers/save_export_manager.py:97-133) writes every selected format through export_all. It never deletes other files.
> - With 0 segments it calls delete_all_outputs (core/exporters/__init__.py:209-215).
> - Sequence mode (ui/main_window.py:3480-3519) checks auto_save and marks the frame SAVED only if it had segments.
> - auto_save defaults to True (config/settings.py:45; ui/widgets/settings_widget.py:43).
>
> Where the card is wrong:
> 1. Multi-view ignores the Auto-Save setting. The cited lines file_navigation_manager.py:401-403 and main_window.py:6496-6497 call _save_multi_view_annotations() with no auto_save check, and that function (main_window.py:6559-6636) never reads it either. With Auto-Save OFF, multi-view navigation still writes every selected format for both viewers, and deletes all annotation files for any viewer with no segments. The card makes "Auto-save on" a precondition, which hides this.
> 2. "Re-selecting the same image does nothing" is only true in single view.
>    - Multi-view has no same-path check (load_multi_view_from_path; _load_multi_view_image at main_window.py:6030). Re-selecting saves and reloads.
>    - In sequence mode, _on_sequence_frame_selected (main_window.py:3425-3432) skips the save when the frame index is unchanged, but still calls _load_sequence_frame. That clears the segments and undo history, then reloads from propagated masks, cache or disk (main_window.py:3586-3619). Unsaved edits on that frame are thrown away without being saved.
>    - Re-clicking the open file in the file list reaches this path (main_window.py:1448-1454).
> 3. In multi-view, Next/Previous saves before checking "No current image" or end/start of list (main_window.py:6497-6512 and 6530-6547). The save is triggered by any navigation attempt, not only by "B loads".
> 4. SAVED does not mean the write succeeded. has_segments is read before the save (main_window.py:3500), and save_single_view_output catches export exceptions and only shows a notification (save_export_manager.py:131-133). So a failed write still marks the frame SAVED and drops its propagated masks (ui/modes/sequence_view_mode.py:365-373). The preload cache entry is dropped too (main_window.py:3504-3508), so propagated annotations can be lost for good.
> 5. The delete covers all 7 registered formats, not just the selected ones: .npz, _CM.npz, .txt, _seg.txt, _coco.json, .xml, _createml.json. This includes ground-truth files that failed to parse, because the loader skips parse errors and moves on (core/file_manager.py:202-204), leaving 0 segments.
> 6. A frame is marked SAVED only on the frame-selection path. Opening a file outside the sequence goes through load_image_by_path, which saves but does not mark anything.
>
> Missing parameter: the default export formats are {NPZ, YOLO_DETECTION} (core/exporters/__init__.py:60-63). With defaults, "all selected formats" means A.npz and A.txt.
>
> Suggested fix: split the card by mode. Single view: auto_save-gated, same-path no-op. Sequence: auto_save-gated; re-selecting the current frame reloads and discards unsaved edits; the frame is marked SAVED even if the write fails. Multi-view: saves on every navigation attempt regardless of Auto-Save, with no same-path check.
>
> No instruction-like text aimed at automated analysis was found in the cited lines.

### RULE-055: Opening another image auto-saves the current one first (folded card)

**Compliance judge:** P0 yes, faithful no

> VERDICT: P0 stands, but on the data-integrity prong ONLY — and the Given/When/Then is not faithful enough to serve as the behavior contract.
>
> P0 JUSTIFICATION (true, narrowly). No money moves and no regulation is enforced; a finance controller would not care. A dataset auditor / data steward would, because this path is the sole automatic persistence point for the asset of record (annotation sidecars) and it can also destroy them:
> - Save-before-reset ordering is load-bearing: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:271-281 saves at line 274, THEN calls _reset_state() at 279 and segment_manager.clear() at 281. Reverse those in a rewrite and save_single_view_output sees zero segments (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:107-109) and takes the DELETE branch instead of the write branch — silently destroying the user's annotations with a success-style notification (save_export_manager.py:536-538). That is exactly the class of silent equivalence defect P0 contracts exist to catch.
> - Blast radius of the delete branch is wider than the enabled formats: _delete_associated_files -\> delete_all_outputs (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:209-215) loops over EVERY registered exporter (npz, npz_class_map, yolo_det, yolo_seg, coco, pascal_voc, createml), so navigating past an image whose segments list is empty deletes pre-existing ground-truth sidecars in formats the user never enabled.
> SCOPE TIGHTENING REQUIRED: the P0 core is "with auto_save on, navigate-away persists the current image's annotations before any state is cleared; zero segments deletes all format outputs." The rest of the card (clearing scene items, caches, rubber-band rect, SAM scale factor at main_window.py:2143-2193) is UI/state choreography, not a business rule. Rating the whole compound card P0 will burn verification effort proving equivalence on cache clearing.
>
> FAITHFULNESS (false — two defects, one inside the cited range):
> 1. WRONG CLAUSE. "b.png's AI embedding is computed or restored from cache immediately if a model is loaded" is contradicted by the cited lines themselves: file_navigation_manager.py:361-366 defers in sequence mode (try_cache_restore(), else sam_is_dirty = True) and only calls _update_sam_model_image() otherwise. "Immediately" is unconditional in the spec, conditional in the code.
> 2. MISSING BRANCH. The prose says "saves (or deletes)" but the Given/When/Then only exercises the 3-segment save path, never states the trigger (segments list empty) or the all-formats blast radius. A rewrite that deleted ground-truth sidecars would pass this spec as written — the single most dangerous behavior is untested.
> 3. OVER-GENERALIZED SCOPE. "Opening another image auto-saves the current one" is stated universally, but the cited path handles single-view only: multi-view short-circuits at file_navigation_manager.py:261-265 to load_multi_view_from_path, which calls _save_multi_view_annotations at 401-403 WITHOUT consulting the auto_save setting; in-sequence frame selection bypasses this function entirely (main_window.py:1447-1454 -\> 3414-3432 _auto_save_sequence_frame); and re-selecting the same path returns early with no save at all (line 267-268).
> 4. PARAMETER GAP. Only "auto_save default True" is listed (settings.py:45 confirms). The parameter that actually decides "a.npz and a.txt are written" is export_formats, default ["NPZ", "YOLO_DETECTION"] (settings.py:8-9, 46), read at runtime from control_panel.get_settings() (save_export_manager.py:112, 117-122). The .txt in the Then clause is only true under that default. Loader side is correct as written: NPZ has top priority in the read chain (core/file_manager.py:153-200), so b.npz does win over b.txt.
> CORRECTED THEN (suggested): "...a.npz and a.txt are written (per export_formats = NPZ + YOLO_DETECTION); had a.png held zero segments, ALL registered-format sidecars for a.png would instead be deleted. ... b.png's embedding is computed or cache-restored immediately in single view; in sequence mode it is deferred and the image is flagged sam_is_dirty."
>
> CREDENTIALS: none encountered in any range read; nothing to mask.
> INJECTION SUSPECTS: none. The cited ranges contain only ordinary developer commentary ("CRITICAL: Reset state...", "(this was missing!)", "A damaged annotation file must not abort image loading." at file_navigation_manager.py:347, "SAM embedding cache is intentionally NOT cleared here" at main_window.py:2168-2169) — all descriptive, all matched by executable code, none instruction-shaped toward an automated reviewer. One doc/behavior tension worth flagging (not injection): the export_all docstring at core/exporters/__init__.py:192-197 asserts "Writing never deletes ... they may be ... ground truth that shipped with the dataset," which is true of export_all but is silently overridden by the sibling delete_all_outputs branch reached from the very same auto-save entry point. Do not let that docstring reassure a reviewer that the navigate-away path is non-destructive.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: VERIFIED with scope caveats. Every clause of the Given/When/Then is re-derivable from the code for the default single-view path.
>
> Evidence trace (all paths under E:\\GitHub\\LazyLabel\\):
> - Auto-save gate and ORDERING: legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:271-276 — `if self.mw.current_image_path and control_panel.get_settings().get("auto_save", True): self.mw._save_output_to_npz()` executes BEFORE `self.mw.current_image_path = path`. So the save targets the OUTGOING image (a.png), exactly as the rule states. The `auto_save` value read is the live checkbox (ui/widgets/settings_widget.py:151), seeded from Settings.auto_save = True (config/settings.py:45, via settings_widget.py:162) — "default True" is correct.
> - "a.npz and a.txt are written": _save_output_to_npz → save_export_manager.save_output → save_single_view_output (ui/managers/save_export_manager.py:97-133). With 3 segments the non-empty branch runs and `export_all(formats, ctx)` writes one file per selected format; defaults are ["NPZ","YOLO_DETECTION"] (config/settings.py:8-9), whose output paths are `\<base\>.npz` (core/exporters/npz.py:30) and `\<base\>.txt` (core/exporters/yolo_detection.py:46). Confirmed.
> - "(or deletes)" in the plain English: save_export_manager.py:107-109 → _delete_associated_files (523-542) → delete_all_outputs, i.e. navigating away from an image whose segments were all removed DELETES the existing sidecars. Real, and correctly stated.
> - State reset: file_navigation_manager.py:279-289 (`_reset_state`, `segment_manager.clear()`, scene item purge) and main_window.py:2138-2193 — clear_all_points (2140), segments (2141), crop mode/coords (2149-2156), SAM invalidation (2159-2161), AI click/rubber-band/bbox-preview state (2171-2177, 2192-2193), undo history via `undo_redo_manager.clear_history()` (2188-2189). All five listed resets confirmed.
> - New image + annotations: cache-or-cv2.imread with BGR→RGB (292-307), then `file_manager.load_existing_mask(path, image_size=...)` (343-345). Load chain gives NPZ top priority over YOLO-seg/COCO/VOC/CreateML/YOLO-det (core/file_manager.py:156-199), so with b.npz present the Then is right.
> - Embedding: 361-366 calls `_update_sam_model_image()` directly (not debounced); main_window.py:1567-1625 early-returns when no model is available, else restores from `embedding_cache` keyed on md5(path) (operate_on_view False) or image hash (True), otherwise computes and caches. "Computed or restored from cache immediately if a model is loaded" is accurate.
>
> Caveats an implementer must carry into the contract (omissions, not misstatements):
> 1. View-mode scoping. The Given never names a view mode. In SEQUENCE mode the embedding is NOT computed immediately — 362-364 only attempts `try_cache_restore()` and otherwise sets `sam_is_dirty = True`. In MULTI mode the whole function short-circuits at 261-265 into load_multi_view_from_path, where the auto-save at 402-403 runs UNCONDITIONALLY, ignoring the auto_save setting. The card reads as universal; it is single-view behavior.
> 2. Save failure is swallowed (save_export_manager.py:131-133 logs + notifies, no re-raise), so navigation and the state reset at 279-289 proceed and the in-memory segments are discarded even if the write failed. For a P0 data-integrity contract this is the most important untested edge.
> 3. Unloadable target: if cv2.imread returns None (299-302) the function returns AFTER the save, after `current_image_path = path` and after `_reset_state()`, leaving the editor cleared and pointed at an unloadable file.
> 4. Re-selecting the already-open image returns at 267-268 with no save.
> 5. Parameter list omits `export_formats` default ["NPZ","YOLO_DETECTION"] (config/settings.py:8-9), which is what makes the "a.npz and a.txt" assertion true; it belongs in the parameters alongside auto_save.
>
> P0 JUSTIFIED: yes — data integrity. This is the sole write/delete gate for the only durable artifact the application produces (annotation sidecars), and it contains both a destructive branch (delete-all-outputs when segments are empty) and a load-bearing ordering constraint (persist before reassigning current_image_path and clearing segments/undo history). Reordering or dropping either in the rewrite silently destroys labeled work with no user-visible error, since save exceptions are caught.
>
> SME questions: (a) Should the contract be scoped to single-view, with separate rules for sequence (deferred embedding) and multi-view (unconditional save ignoring auto_save)? (b) Is silent continuation after a failed auto-save intended, or must navigation be blocked/prompted when the write fails?
>
> No credentials appear in any cited line. No prompt-injection text detected in the cited files.

### RULE-056: Propagated frame flagging and commit (Keep Flagged Masks)

**Compliance judge:** P0 yes, faithful yes

> P0 IS JUSTIFIED, BUT ONLY ON THE DATA-INTEGRITY LEG. LazyLabel is an image-annotation tool: nothing here moves money or enforces a regulation. This commit rule decides which AI-made masks can be saved to disk and whether a person's existing labels can be overwritten. An auditor checking which labels a person verified would care if it changed silently.
> (1) It stops human labels being overwritten. When a frame is opened, propagated masks load ahead of its saved labels (main_window.py:3591-3606). Leaving the frame autosaves them, replacing or deleting the NPZ file (main_window.py:3424-3427, 3480-3519). Save All writes from the same in-memory mask store (main_window.py:4764-4814). Only two exclusions keep propagated masks off already-labeled frames: Skip Labeled, which checks all 7 label-file formats (main_window.py:4219-4227; file_manager.py:128-151), and the reference-frame skip (propagation_manager.py:745-749; main_window.py:4476-4481).
> (2) It gates what gets saved. The frame score is the lowest object score, the test is strictly below Min Conf, and by default the whole frame's masks are dropped. So below-threshold AI masks never reach the store that autosave saves from. Save All also skips frames flagged during the run (main_window.py:4749-4756). PropagationSaveWorker (propagation_worker.py:295) is never created, so autosave and Save All are the only ways masks reach disk.
> Caveat: the contract should pin this gating behaviour, not the UI details. The 0.05 step and 4 decimals are low-priority settings, and 0.99 is only a default the user can change. The save-path lines above should be added to the citation, because the cited in-memory commit alone does not show what reaches disk.
>
> FAITHFUL: every Given/When/Then clause matches the code and the existing tests.
> - Keep Flagged off is passed on as skip_flagged=True (main_window.py:4377). A failing object then comes back as a plain score with no mask (propagation_manager.py:764-776, 1096-1101).
> - The per-frame buffer takes the lowest score and notes any failure (main_window.py:4504-4520, 4554-4557).
> - With Keep Flagged off, record_skipped_object drops A's mask too and marks the frame FLAGGED at 0.97 (main_window.py:4559-4561; sequence_view_mode.py:324-345).
> - With Keep Flagged on, B's mask is buffered next to A's. mark_frame_propagated stores both but still flags the frame, since the lowest score is below threshold (propagation_manager.py:784-810; main_window.py:4562-4566; sequence_view_mode.py:300-318).
> - If every object reaches the threshold the frame is PROPAGATED; exactly 0.99 passes. Tests cover this: tests/integration/test_propagation_flagging.py:194-207, 360-405, 440-449.
> - Parameter values match sequence_widget.py:333-398.
>
> GAPS TO FIX BEFORE THIS BECOMES THE CONTRACT:
> (a) Objects with empty masks are dropped before the threshold test (propagation_manager.py:751-761, 1087-1093; main_window.py:4513-4515). This code is inside the cited range but the card never says it. The frame score is really the lowest score among visible objects. Read literally, 'minimum over its objects' would wrongly flag frames where an object has left the scene. A frame with no visible objects is never committed and stays PENDING (main_window.py:4551-4552).
> (b) Skip Labeled is only enforced when the UI commits results. The propagation engine still keeps results for those frames (propagation_manager.py:793-803, 1119-1123). A rewrite that saves straight from the engine's results would break the guarantee.
> (c) Question for an expert: streaming mode applies to sequences over 250 frames and re-runs 5 frames where chunks overlap (propagation_manager.py:73-74, 597, 1054, 1084). With Keep Flagged off, a frame where every visible object failed in one chunk is not recorded as propagated, so the next chunk runs it again. If it passes that time, masks are stored while the frame stays FLAGGED at its lower score. Autosave would then save those masks when the user opens and leaves the frame; Save All still skips it. That breaks 'flagged means no masks' when Keep Flagged is off.
> (d) The Skip Labeled tooltip says it checks 'NPZ files' (sequence_widget.py:349-353), but the code checks all 7 formats. The card correctly follows the code.
> (e) With Keep Flagged on, opening a flagged frame and leaving it autosaves its below-threshold masks. The tooltip suggests this is intended (sequence_widget.py:336-343).
>
> I found no injected instruction text and no credentials in the cited ranges.

**Fidelity judge:** P0 yes, faithful no

> VERDICT: The concrete scenario is correct. The general rule is wrong for a common case, so I rate the card not faithful. P0 is justified. All paths below are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
>
> CONFIRMED:
> - Keep Flagged off: main_window.py:4377 sets skip_flagged = not keep_flagged.
>   - Object B at 0.97 comes through as a bare float with no mask (propagation_manager.py:768-776; same logic in the streaming path at 1098-1101). Object A at 0.995 is buffered with its mask (main_window.py:4517-4518).
>   - The commit takes min = 0.97. Because an object failed and Keep Flagged is off, it calls record_skipped_object (main_window.py:4554-4561). The frame ends FLAGGED at 0.97 with no masks (sequence_view_mode.py:324-345). The order A and B arrive in doesn't matter. Scores are cleared at the start of each run (main_window.py:4235).
> - Keep Flagged on: B arrives as a full result with its mask. The commit calls mark_frame_propagated with {A,B} at 0.97, which gives FLAGGED (sequence_view_mode.py:290-318). The docstring at main_window.py:4541 says only passing masks are kept. The code keeps both, and the card follows the code, which is correct.
> - Flagging always uses strict '\<', so a score exactly equal to the threshold gives PROPAGATED.
> - Reference frames are skipped in both the manager and the UI. Skip Labeled frames return before anything is buffered (main_window.py:4466-4481).
> - Defaults match sequence_widget.py:335, 348 and 386-389. 'Any sidecar format' is right: file_manager.py:128-151 checks 7 file suffixes, even though the tooltip (sequence_widget.py:350-352) says NPZ.
>
> DISCREPANCIES:
> 1. Material, and inside the cited lines (propagation_manager.py:751-761; same in streaming at 1087-1093). Objects with an empty mask are dropped before the threshold check. SAM2 gives them confidence 0.0 (models/sam2_model.py:1036-1042).
>    - They are not counted in the frame minimum and do not flag the frame.
>    - If every object in a frame is empty, nothing is buffered or committed, so the frame stays PENDING with no score.
>    - The card's 'minimum over its objects; any object below Min Conf flags the frame' predicts the opposite. Example: A at 0.995 and object C out of view. The card says FLAGGED at 0.0 with all masks discarded. The code gives PROPAGATED at 0.995 and keeps A's mask.
>    - A rewrite built from the card would flag, and by default wipe, every frame where an object leaves the scene. Fix: 'minimum over objects with a non-empty mask'.
> 2. Streaming mode. It is on by default and used when a sequence has more frames than the chunk size (250). Chunks overlap by 5 frames.
>    - The manager decides which overlap frames to skip using its list of propagated frames (propagation_manager.py:1054, 1083-1085). A frame where every object failed is never added to that list, so it is processed again in the next chunk and committed a second time.
>    - Both commit paths keep the lower score (sequence_view_mode.py:302-313, 336-341). A frame that fully failed in chunk N and fully passed in chunk N+1 ends FLAGGED but holding masks, even with Keep Flagged off.
> 3. A frame is committed only when results for a different frame arrive, or when propagation finishes (main_window.py:4485-4488, 4598-4602). Cancel and error never commit (4417-4445, 4649-4656), so the frame in progress stays PENDING.
> 4. 'Stored' means in memory only.
>    - With Keep Flagged off, the manager still keeps A's result (propagation_manager.py:784-805).
>    - What actually protects the disk: the only live save (main_window.py:4741-4768) skips frames the manager has flagged and reads masks from sequence_view_mode. PropagationSaveWorker is never used.
>    - So with Keep Flagged on, the kept masks are for review and are not saved by Save All Propagated.
>
> P0: This gate decides which AI-generated masks can become dataset labels. It also stops existing labels and reference ground truth from being overwritten. There is a sharper reason too: when the threshold changes, the manager rebuilds its flagged list from stored results only (propagation_manager.py:1263-1268). That forgets frames flagged through the float path, and from then on discarding masks in the UI layer is the only thing keeping partial frames out of the save.
>
> No injection-style text and no credentials in the cited lines.

### RULE-056: A propagated frame is Flagged when its weakest object scores below Min Conf (folded card)

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. Every element of the Given/When/Then is verifiable in the cited code. Min-of-objects aggregation at main_window.py:4554 and sequence_view_mode.py:308-313; strict `\<` at sequence_view_mode.py:315, propagation_manager.py:764, main_window.py:4519 and :4590; discard-all-masks-when-keep_flagged-off at main_window.py:4559-4561 routing to record_skipped_object (sequence_view_mode.py:324-345, sets FLAGGED, writes no mask); keep-masks-but-still-flag at main_window.py:4562-4566 into mark_frame_propagated, which re-applies the threshold and yields FLAGGED anyway (sequence_view_mode.py:315-318); commit-on-frame-transition at main_window.py:4485-4488 with the tail frame committed at :4598-4602. The worked example is exactly right: with keep_flagged off, skip_flagged=True (main_window.py:4377) makes the 0.985 object arrive as a bare float, taking the any_failed branch, so frame 12 is FLAGGED at 0.985 with the 0.995 object's mask thrown away; with keep_flagged on both masks commit but the frame is still FLAGGED; at 0.995/0.992 the frame becomes PROPAGATED at 0.992. Parameters all confirmed: 0.99 default at propagation_manager.py:94 and :283, sequence_view_mode.py:90, sequence_widget.py:388; clamp to [0,1] at sequence_view_mode.py:541 and propagation_manager.py:1260; range 0.0-1.0 / step 0.05 / 4 decimals at sequence_widget.py:386-389; keep_flagged=False at sequence_widget.py:335 and main_window.py:4016 and :4557. Two small loosenesses, not errors: (a) the plain-English line "lowest confidence among the objects propagated into it" omits that objects with empty masks are excluded from the min entirely (propagation_manager.py:756-761, main_window.py:4513-4515) — deliberate, since empty masks carry confidence 0 and would falsely flag frames where a reference object simply is not in scene; the Given clause stipulates non-empty masks, so the spec itself stays correct; (b) "no masks are stored" is true for the current pass, but record_skipped_object does not delete masks a prior pass already stored for that frame (relevant to bidirectional or re-run propagation).
>
> P0 NOT JUSTIFIED under the compliance lens. LazyLabel is an Apache-2.0 desktop image-annotation tool (README.md) that pairs SAM/SAM2 with manual labeling. There is no money, no ledger, no pricing, no customer or payment data anywhere near this code path — "moves money" fails outright. "Enforces a regulatory requirement" also fails: a grep for audit/compliance/regulat/HIPAA/GDPR/FDA/21 CFR/retention/medical/clinical across legacy/lazylabel hits only LICENSE and CHANGELOG boilerplate. Min Conf is not a mandated control, it is a user-facing tuning knob — a spinbox the operator drags mid-session (sequence_widget.py:385-398) with a histogram button parked next to it at :400-404 precisely so they can pick a value per sequence, and set_confidence_threshold even retroactively re-partitions already-computed results (propagation_manager.py:1254-1271). A parameter the end user is invited to change at will cannot simultaneously be a policy an auditor relies on.
>
> The only serious P0 argument is "guards data integrity," and it does not survive scrutiny. What the rule discards are propagation *proposals* that were never persisted: no NPZ is deleted, saved annotations are protected by the separate Skip Labeled path (main_window.py:4466-4473, default checked at sequence_widget.py:348), and reference frames retain ground truth (main_window.py:4475-4481). The output is fully regenerable by re-running propagation at a different threshold, so there is no irreversible loss and no system of record to corrupt. Nor would a change be truly silent in the operator's workflow — flagged/propagated counts (main_window.py:4607-4612), per-frame red coloring and confidence tooltips are the entire visible point of the feature, so a shifted threshold surfaces as a changed flag count on the very next run.
>
> Correct rating is P1: this is a genuine, crisply specified core rule — a quality gate plus a status lifecycle (pending → propagated | flagged | skipped) whose all-or-nothing discard semantics materially shape the dataset a labeler produces, and the rewrite must reproduce `\<` vs `\<=`, min vs mean, the empty-mask exclusion, and the frame-transition commit boundary exactly. But it belongs in the behavior-equivalence suite as core correctness, not in the P0 contract tier. Rating it P0 dilutes a tier that should be reserved for irreversible or externally-accountable behavior, and in this codebase nothing in this path qualifies. No injection-shaped text and no credentials appear in any cited line; the comments at main_window.py:4463-4465, :4483-4484, :4540-4546 and propagation_manager.py:751-755 are ordinary explanatory prose that matches the executable code.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: PASS — I traced the scenario end-to-end and it reproduces exactly.
>
> Trace (keep_flagged off, Min Conf 0.99, frame 12 gets obj1=0.995, obj2=0.985, both non-empty):
> 1. `E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4377` passes `skip_flagged=not keep_flagged` -\> True. `:4359` stores `_propagation_keep_flagged=False`.
> 2. `...\\ui\\managers\\propagation_manager.py:764` `is_flagged = confidence \< self.state.confidence_threshold` (strict `\<`, as the card states). obj2 hits `:768-776` and is yielded as a bare float 0.985 with no mask; obj1 is yielded as a `PropagationResult` (`:784-810`). The streaming path (default: `sequence_widget.py:358` Streaming checked) is identical at `propagation_manager.py:1092-1127`.
> 3. `main_window.py:4505-4509` buffers the float as `confidences += 0.985, any_failed=True`; `:4513-4518` buffers obj1's mask + 0.995.
> 4. `:4486-4487` commits frame 12 when frame 13 arrives. `:4554` `min_conf = min(...) = 0.985`; `:4559-4561` `any_failed and not keep_flagged` -\> `record_skipped_object(12, 0.985)`, which at `sequence_view_mode.py:335-345` records the min confidence and sets `FrameStatus.FLAGGED` and never touches `_propagated_masks` — so obj1's passing mask is dropped too. Card's "flagged, 0.985, no masks stored" is exact.
> 5. keep_flagged ON: `skip_flagged=False`, both objects arrive with masks -\> `main_window.py:4562-4566` `mark_frame_propagated(12, both_masks, 0.985)` -\> `sequence_view_mode.py:315-318` sets FLAGGED because 0.985 \< 0.99 while keeping both masks. Card is exact.
> 6. 0.995/0.992 variant: `any_failed=False`, `mark_frame_propagated` -\> 0.992 \>= 0.99 -\> PROPAGATED, confidence 0.992; the safety-net re-check at `main_window.py:4581-4592` leaves it propagated. Card is exact.
>
> Parameters verified: default 0.99 at `propagation_manager.py:94` and `:283`, `sequence_view_mode.py:90`, spinbox `sequence_widget.py:388`; range 0.0-1.0 `:386`, step 0.05 `:387`, decimals 4 `:389`; clamp `max(0.0, min(1.0, t))` at `propagation_manager.py:1260` and `sequence_view_mode.py:541`; keep_flagged default False at `sequence_widget.py:335` / `main_window.py:4016`. Both `\<` comparison sites read the same value because the spinbox is pushed to manager and view-mode together at `main_window.py:4164-4170` and `:4718-4723`.
>
> Four nuances the card should absorb before it becomes a contract (none make it wrong, all are omissions):
> (a) MOST IMPORTANT: objects with empty masks are dropped before they reach the min (`propagation_manager.py:756-761`, `:1092-1093`; `main_window.py:4513-4515`). Empty masks always carry confidence 0, so without this carve-out every frame where a reference object leaves the scene would flag. The card's Given pins "both with non-empty masks" so the scenario is right, but the plain-English line "the lowest confidence among the objects propagated into it" must read "among objects that produced a non-empty mask".
> (b) The commit trigger is "the next frame that is neither skip-labeled nor a reference frame, or end of propagation": `main_window.py:4467-4481` returns before the commit block at `:4486`, so a skipped frame 13 defers frame 12's commit; the final frame is committed at `:4598-4602`. "Frame 13 commits frame 12" is true only for an ordinary frame 13.
> (c) No rounding exists anywhere in this path — the stored value is the raw float min. Writing "0.9850" and listing "4 decimals" in parameters is display precision of the threshold spinbox (`sequence_widget.py:389`), not a rounding rule on the frame score. An equivalence test that expects a rounded score would be testing something the code does not do.
> (d) "No masks are stored" is true for the user-visible/savable store (`sequence_view_mode.get_propagated_masks`, read at `main_window.py:3690` and `:4766`), but the passing object's `PropagationResult` is still retained in `propagation_manager.state.frame_results` (`:795`, `:1121`). Not a contradiction, but the rewrite should not treat frame_results as the source of truth for what was kept.
> Also note idempotency: on a re-run both commit paths take `min` with any existing score (`sequence_view_mode.py:309-311`, `:337-339`), so scores monotonically decrease across repeated propagations — worth an explicit test.
>
> P0: JUSTIFIED on data-integrity grounds (not money, not regulatory). This is the quality gate that decides which machine-generated annotations enter the dataset: below threshold with the default setting, the frame's masks are destroyed rather than persisted, and the frame is pushed into the human review queue (`get_flagged_frames`/`next_flagged_frame`, `sequence_view_mode.py:414-443`). Get the comparison direction, the min-vs-mean aggregation, or the empty-mask carve-out wrong in the rewrite and you either silently ship unreviewed low-confidence labels or destroy good ones — both are unrecoverable without re-running propagation. It is the strongest data-retention/destruction rule in this subsystem.
>
> INJECTION: none. I grepped the cited files and the surrounding ui/ tree for instruction-shaped text; every "instruction" hit is a benign QLabel variable for on-screen help (e.g. `sequence_widget.py:142-152`, `hotkey_dialog.py:169-176`). No comment in the cited ranges asserts behavior the code does not perform — the docstrings at `main_window.py:4537-4547` and `sequence_view_mode.py:324-333` match the executable logic. No credentials appear in any cited line.

### RULE-057: Undo history is unbounded, per image, and does not cover deletes or class changes (folded card)

**Compliance judge:** P0 no, faithful yes

> Faithful: verified line by line. record_action appends uncapped and clears redo (undo_redo_manager.py:34-36); undo pops onto redo before dispatch (:59-63); clear_history fires on image load (_reset_state at main_window.py:2188-2189, called from file_navigation_manager.py:186,279), sequence-frame load (main_window.py:3585-3589) and model switch (main_window.py:3025-3026). I enumerated all 24 record_action sites: recorded types are exactly add_segment, add_point, add_polygon_point, move_polygon, move_vertex, move_circle, erase_segments — nothing emits "delete_segments", so _undo/_redo_delete_segments (:631,657) are dead, as is multi_view_polygon_point (a dead branch the card omits). Delete via V (hotkeys.py:86 -\> main_window.py:1004,1744 -\> segment_table_manager.py:59-86), alias change (:93), reassign_class_ids (:99) and assign_selected_to_class (:56) record nothing. The scenario is exact: delete_segments re-indexes by list deletion (segment_manager.py:58-62) while add_segment stores an absolute index captured at record time (ai_segment_manager.py:286-290), so undo #1 on segment_index=2 fails 0\<=2\<2 and emits the literal "Cannot undo: Segment no longer exists" (undo_redo_manager.py:180) and undo #2 on segment_index=1 deletes C (:166-178). Minor slips only: the card calls assign_selected_to_class "merging classes". P0 not justified: LazyLabel is a desktop image-annotation tool — zero source hits for audit, retention, compliance, regulat*, invoice, payment, HIPAA or GDPR; nothing moves money and no regulated record is produced. The undo stack is in-memory only (action_history/redo_history appear in no file outside undo_redo_manager.py, are never serialized, and are destroyed on every image change), so no regulator, auditor or controller has standing over it. The one real hazard — undo silently deleting segment C when the user asked to undo creation of B — is the ABSENCE of an integrity guard, i.e. a defect report, not a rule that guards data integrity. That matters because P0 rules become the equivalence contract the rewrite must prove against, and proving the new build also deletes the wrong segment is the wrong verification target. The remainder (redo cleared on new action, session-scoped history, unbounded depth) is generic undo-stack mechanics that would be identical in any language. Reclassify as P2 known-defect/migration risk: keep the stale-index reproduction as a regression test the legacy behavior must FAIL, and require the new undo model to record deletes and class-id reassignment or invalidate index-dependent history. SME question if retained at any priority: are annotation outputs ever consumed by a regulated pipeline (medical-device training data, safety certification) where silent label corruption carries an external obligation? Nothing in the repo suggests so. Injection scan of the three cited files for SYSTEM:, "ignore previous instructions", "false positive", "approved by", "reviewer should" returned no hits; cited strings are ordinary user notifications. No credentials appear in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. I re-derived the scenario from the code without relying on the card. add_segment records segment_index = len(segments)-1 at add time (single_view_mode.py:288-293, and identically at polygon_drawing_manager.py:208-213, ai_segment_manager.py:286-290, single_view_mouse_handler.py:433-437, save_export_manager.py:188-192); adds append (segment_manager.py:55), so A=0, B=1, C=2. V is bound to delete_segments (hotkeys.py:86) -\> main_window.py:1693, whose single-view branch (main_window.py:1744) delegates to segment_table_manager.delete_selected_segments (segment_table_manager.py:59-86); that path calls segment_manager.delete_segments and never record_action. A grep of all 23 record_action call sites yields only add_segment, add_point, add_polygon_point, move_polygon, move_vertex, move_circle, erase_segments -- exactly the card's parameter list -- so _undo_delete_segments/_redo_delete_segments (undo_redo_manager.py:631-683) are unreachable dead code, confirming "a handler exists but nothing records it." After deleting A, segments are [B, C] at indices 0 and 1 while history still holds [0, 1, 2]. First Ctrl+Z (hotkeys.py:71) pops segment_index=2; the guard 0 \<= 2 \< 2 fails, producing the exact string "Cannot undo: Segment no longer exists" plus redo_history.pop() (undo_redo_manager.py:179-181). Second Ctrl+Z pops segment_index=1; 0 \<= 1 \< 2 passes, so segment_data = segments[1].copy() (= C) and delete_segments([1]) removes C, not B -- silently, reporting "Undid: Add Segment" (undo_redo_manager.py:166-178). Ordering, rounding-equivalent (index arithmetic), guard boundaries, and the warning text all match. Supporting claims verified: record_action clears redo (undo_redo_manager.py:34-36); undo pushes to redo before dispatch (59-63); the only three clear_history() call sites are _reset_state for image load/navigation (main_window.py:2188-2189), _reset_sam_state_for_model_switch (3025-3026), and _load_sequence_frame_segments (3585-3589), matching "new image or sequence frame loads or the model changes"; no depth cap exists anywhere in legacy/lazylabel/src; and assign_selected_to_class, handle_alias_change, reassign_class_ids (segment_table_manager.py:53-100) record nothing. Two understatements, not errors: (a) the failed first undo permanently discards the "add C" record from both stacks rather than merely skipping it -- which is in fact what makes the second undo land on "add B", so the card's conclusion is right even though the mechanism is unstated; (b) multi_view_polygon_point is a second never-recorded dead branch the card omits. The related erase_segments redo shares the same index-drift flaw via its "last N segments" heuristic (undo_redo_manager.py:614-626), outside this card's scope. P0 JUSTIFIED on data-integrity grounds, with one caveat for downstream use. The rule does not move money or enforce regulation, but segments are the application's primary persisted data asset (written to NPZ/JSON), and the cited path silently deletes a different user-authored annotation than the one the user asked to revert, with no warning on the destructive step -- the textbook silent-wrong-record-mutation integrity harm, reachable through two documented keystrokes with no guard in between. The caveat: the Given/When/Then encodes a DEFECT, not intended behavior. If P0 cards are consumed as "the rewrite must prove equivalence," this one must be tagged fix-do-not-replicate; the invariant the new system owes is "undo reverts the action it recorded, or refuses," plus the genuine policies here (redo cleared on new action, history scoped per image/frame, unbounded depth, and the recorded-action coverage set). INJECTION: none. No instruction-shaped text appears in any cited line; comments at undo_redo_manager.py:35 and main_window.py:3585 accurately describe the code beneath them. No credentials appear in any cited line.

### RULE-058: Undoing an erase inserts malformed segment records

**Compliance judge:** P0 no, faithful yes

> FAITHFUL (checked against the code): Erase records wrapper entries {"index": i, "segment": segment.copy()} (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:525 and :677). The AI erase path saves them as removed_segments (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\ai_segment_manager.py:253-266). Undo hands each wrapper unchanged to add_segment (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\undo_redo_manager.py:590-591 and 596-597). The wrapper has no top-level class_id, so add_segment gives it active_class_id or next_class_id (segment_manager.py:34-39) and appends a dict holding only index, segment and class_id, with no type, mask or vertices. Undo never removes the pieces the erase added (segment_manager.py:697-702), so the 942-px piece stays. The message is 'Undid: Erase 1 segment(s)' (undo_redo_manager.py:600). The original never comes back: the display draws nothing for the new record (segment_display_manager.py:334-389) and create_final_mask_tensor adds no pixels for it (segment_manager.py:232-244). Ctrl+Z is bound to undo (config/hotkeys.py:71). Small wording issue: the wrapper stores the 0-based list index, but the segment table numbers from 1 (segment_table_manager.py:132), so a segment shown as '#2' would be stored as index 1. The card leaves out the effect on saved files: with no active class the new record gets next_class_id (max+1, e.g. class 2), a class with no pixels. Save/export builds class_order from get_unique_class_ids (save_export_manager.py:117 -\> :400; main_window.py:6602), so the saved NPZ gains an extra all-zero channel and an extra label.
>
> NOT P0 AS WRITTEN: This is a legacy bug, not a business rule. It moves no money and enforces no regulation. It does not protect data integrity; it breaks it. The user is told the erase was undone while the saved labels still show it, and an empty extra class is added. Through the compliance lens, no regulator, auditor or finance controller would want this kept, and changing it quietly would be a fix. As a P0 rule, every phase would have to prove the new system reproduces the bug, which wastes verification effort and carries the damage forward. RECOMMENDATION: Log it as a high-severity data-integrity bug that the rewrite deliberately will not copy, and leave it out of equivalence tests. Ask a subject-matter expert to confirm the intended rule: 'Undoing an erase removes the pieces it created and restores each original segment (type, mask or vertices, class_id) at its old index, without creating new class IDs.' That corrected rule could fairly be P0 or P1. The multi-view AI erase has the same bug (ai_segment_manager.py:352-358 -\> undo_redo_manager.py:586-593). No test covers undoing an erase (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\ui\\test_undo_redo.py). None of the cited lines contain text trying to instruct an AI tool.

**Fidelity judge:** P0 yes, faithful yes

> I traced the code myself and the card's Given/When/Then matches what it does. There are only small wording and scope gaps.
>
> How the code runs:
> (1) An erase through ai_segment_manager.py:253-266 calls erase_segments_with_mask with no viewer_index, which lands in _erase_segments_single_view. For the overlapping segment, line 677 stores a wrapper {"index": i, "segment": segment.copy()}. Lines 683-698 then delete the original and append each leftover connected piece larger than 10 px (line 786) as a new AI mask record with the same class_id. The action saved is {type: erase_segments, removed_segments: [wrapper]} with no viewer_mode, so it counts as single view. The other erase paths that record undo store the same wrapper format: single_view_mouse_handler.py:414-419 and 503-508, polygon_drawing_manager.py:188-193, and ai_segment_manager.py:352-359 (multi-view, which goes through line 525).
> (2) Ctrl+Z calls undo_redo_manager.undo directly (hotkeys.py:71, main_window.py:1008). That reaches _undo_erase_segments, which at lines 596-597 passes each wrapper unchanged to add_segment.
> (3) add_segment (segment_manager.py:34-39) finds no class_id key, so it sets one: the active class if there is one, otherwise the next unused class number. The wrapper has no type, so no vertex conversion happens (line 46), and the wrapper is appended (line 55). The result is a top-level record with no mask, type or vertices.
> (4) Nothing deletes the leftover pieces, so the 942-px piece stays.
> (5) Nothing in the codebase reads a wrapper's "segment" or "index" key (checked by grep), so the original segment is never restored.
> (6) _update_all_lists does not raise on the wrapper, because every access to type, mask or vertices checks for the key first (segment_table_manager.py:115-167, segment_display_manager.py:328-389, edit_mode_manager.py:105-108). So line 600 shows exactly 'Undid: Erase 1 segment(s)'. Nothing listens to undo_performed.
>
> Small problems with the card:
> (a) 'Segment #2' next to 'index 2' is unclear. The table numbers segments from 1 (segment_table_manager.py:132), so the on-screen #2 is stored index 1 and its wrapper would say index 1.
> (b) Effects the card leaves out:
> - The phantom record shows up as a table row with nothing drawn on the image.
> - If no class is active, it takes a new, empty class number. That class shows up in the class list and in saved output, because saving uses get_unique_class_ids() (save_export_manager.py:400). The saved file then gets an extra all-zero class channel.
> - The most-recently-used class changes (segment_manager.py:42).
> - A later Ctrl+Y (lines 624-626) deletes the last N records, which are the wrappers, so it happens to return to the after-erase state.
> - The scenario assumes the 942 px stay one connected region; pieces of 10 px or fewer are silently dropped.
> (c) No test in legacy/lazylabel/tests covers undoing an erase.
>
> P0 is justified on data-integrity grounds. Undo is how users recover labels. Here it reports success, but the erased pixels are not restored and a malformed record is added that can put a fake class into saved and exported files. Caveat: this card describes a bug. The contract should record it as a known difference from the intended behavior (restore the original at its index and remove the leftover pieces). Later phases should not be required to reproduce it.
>
> I found no instruction-like text aimed at automated tools in any of the cited lines.

### RULE-058: Undo of an erase adds a phantom segment instead of restoring (folded card)

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. Every step checks out in the code.
>
> 1. Erase saves wrapper objects instead of segments. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:677 (and :525 for multi-view) appends {"index": i, "segment": segment.copy()}. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\ai_segment_manager.py:253-266 stores that list as removed_segments.
> 2. Undo passes each wrapper to add_segment as if it were a segment (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\undo_redo_manager.py:596-597). The wrapper has no class_id, so add_segment (segment_manager.py:34-39) gives it the active class or, with none set, next_class_id.
> 3. After the erase, segment_manager.py:704-705 and :816-826 set next_class_id to max({2})+1 = 3, so the phantom gets class 3.
> 4. Undo never removes the split piece added at segment_manager.py:701-702. The leftover piece stays and the original is not restored.
> 5. The wrapper has no top-level type, mask or vertices, so nothing is drawn for it (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\segment_display_manager.py:334-389). But get_unique_class_ids (segment_manager.py:87-95) still counts class 3.
> 6. The single-view save builds its class list from those IDs (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:400). The mask builder leaves the class-3 channel empty (segment_manager.py:221-244). The NPZ exporter writes class_order=[2,3] (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:21-26). COCO adds a category for every class in the list (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\coco.py:44-50).
> 7. Redo deletes the last N entries, which are the phantoms (undo_redo_manager.py:624-626). The Undo hotkey calls this manager directly (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:1008).
>
> P0: not justified.
> - Compliance lens: no regulator, auditor or finance controller has a stake here. LazyLabel is an image-labeling tool for ML datasets with no money flow, and a repo-wide search found no regulatory context.
> - Data integrity: this card describes a bug that breaks data integrity, not a rule that protects it. Its Then clause is the buggy "Actual" behavior. As a P0 contract, every modernization phase would have to prove it reproduces the phantom class. That wastes verification effort and locks the bug in.
> - Recommendation: track this as a known defect with high data-quality severity. The user sees "Undid: Erase 1 segment(s)", but the shape stays erased and a fake class reaches the NPZ and COCO files. The correct contract is: undo puts each original segment back at its recorded index, removes the split pieces, and leaves the classes and saved files as they were before the erase.
>
> Also worth knowing:
> - The defect affects every erase tool, not just AI erase. They all save the same wrapper list: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\handlers\\single_view_mouse_handler.py:407-417 and :497-506, E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\polygon_drawing_manager.py:180-191, and ai_segment_manager.py:347-357.
> - No tests cover undo after erase.
> - None of the cited files contain text that looks like instructions or an attempt to manipulate the review.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. I traced it on my own (all paths under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\):
>
> (1) Erase, core\\segment_manager.py:675-702: each overlapping segment is saved as a wrapper {"index": i, "segment": copy}. The original is deleted. Leftover pieces over 10 px are added back as type "AI" mask segments that keep class_id 2. Then _update_next_class_id sets next_class_id to 3, because only class 2 is left.
>
> (2) Record, ui\\managers\\ai_segment_manager.py:260-266: the action is {"type": "erase_segments", "removed_segments": [wrapper]} with no viewer_mode, so it runs as single view. Wiring is live: Shift+Space in AI mode calls _accept_ai_segment(erase_mode=True) (keyboard_event_manager.py:167), and Ctrl+Z calls undo_redo_manager.undo (main_window.py:1008). History is only cleared when an image or frame loads (main_window.py:2189/3026/3589).
>
> (3) Undo, core\\undo_redo_manager.py:596-598 calls add_segment(wrapper). In segment_manager.py:34-56 the wrapper has no class_id and there is no active class, so class_id = next_class_id = 3. It has no type, so nothing is converted. It is appended to the end, so the list becomes [piece(class 2), phantom(class 3)], and next_class_id becomes 4. The original is not restored and the piece stays.
>
> (4) Refresh: segment_table_manager.py only uses .get(), so no crash. The table and class list show class 3, and segment_display_manager.py:334-389 draws nothing for the phantom.
>
> (5) Save: save_export_manager.py:400 sets class_order = get_unique_class_ids() = [2, 3]. In create_final_mask_tensor (segment_manager.py:232-244) the phantom's mask is None, so the channel for class 3 stays all zero. NPZ (exporters\\npz.py:21-26) writes a mask of shape (H,W,2) with class_order [2, 3]. COCO (exporters\\coco.py:44-50) adds category {id:3, name:"3"}. The file is still written because the piece produces annotations.
>
> (6) Redo, undo_redo_manager.py:624-627, deletes the last N segments, as stated.
>
> Precision notes for test authors:
> - The "class-3 channel" is at tensor index 1, not index 3. Assert through class_order.
> - The phantom is not empty. It carries "index" and a nested copy of the original polygon under "segment", but no code ever reads it.
> - Side effects the rule does not state: last_toggled_class_id becomes 3, so the X hotkey toggles the phantom class. next_class_id becomes 4. The wrapper is changed in place (class_id=3) and is the same object held in the redo history, so undo, then redo, then undo again adds it back as class 3 even if a class is active.
> - The Given matters: with an active class the phantom takes that class. If no piece remains, next_class_id is recalculated from whatever segments are left (0 if none), so the phantom's class changes.
> - The same bug affects the other erase paths: single_view_mouse_handler.py:407-417 and 497-506, polygon_drawing_manager.py:180-193, and the multi-view path at ai_segment_manager.py:347-359.
> - No tests cover undoing an erase (tests\\unit\\ui\\test_undo_redo.py never mentions erase).
> - The docstring at undo_redo_manager.py:575 says "restore removed segments", but the code does not. That is a comment that doesn't match the code, not an injection. No injection-style text or credentials were found in the cited lines.
>
> P0 JUSTIFIED (data integrity): undo is the user's safety net against destructive edits. Here it silently fails to bring back the erased annotation while still showing "Undid: Erase 1 segment(s)". It also puts a fake, empty class into the saved training data: an extra NPZ channel that changes the channel count and class mapping, and an extra COCO category. Treat this in the contract as a known defect to either fix or deliberately keep, not as behavior the new system should copy.

### RULE-058: Undoing an erase does not restore the erased shapes (folded card)

**Compliance judge:** P0 no, faithful yes

> VERDICT: Faithful to the code, but the P0 rating is not justified under the compliance lens. This is a high-severity DEFECT, not a business rule, and enshrining it as a P0 behavior contract would force the rewrite to prove it reproduces data corruption.
>
> FAITHFULNESS — verified end to end (true).
> Every mechanical claim checks out against executable code, not comments:
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:675-694 — on any overlap the original segment index is appended to segments_to_remove and the surviving connected pieces are appended; the original is deleted (line 698) and the pieces appended (line 702).
> - segment_manager.py:752-814 — pieces are split with cv2.connectedComponents(..., connectivity=8) (line 777), kept only when np.sum(component_mask) \> 10 (line 786), and rebuilt as {"type": "AI", "mask": component_mask, "vertices": None, "class_id": \<original class\>} (lines 806-811). Vector geometry of an erased Polygon/Circle is destroyed, class_id is inherited. All as stated.
> - segment_manager.py:677 (and the multi-view twin at :525) — the undo payload is the wrapper {"index": i, "segment": segment.copy()}, never the segment itself.
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\undo_redo_manager.py:596-597 (multi-view :590-591) — undo passes each wrapper straight to add_segment(seg_data) with no unwrapping, and never removes the pieces added by the erase. segment_manager.py:34-39,55 confirms add_segment appends the dict verbatim after stamping a class_id, so the "restored" record has no type, no vertices and no mask. The original polygon is genuinely unrecoverable.
> - The NPZ claim is real, not speculative: save builds class_order from get_unique_class_ids() (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6602), so the phantom record's class id gets its own channel, and create_final_mask_tensor's `if mask is not None` guard (segment_manager.py:238-244) leaves that channel all zeros. An extra empty class channel plus an extra entry in the saved class_order ships to downstream training consumers.
> - Redo (undo_redo_manager.py:624-626) deletes the last N segments by position, which in the stated scenario removes the phantom — as described.
> - The Shift+Space trigger is correct: main_window.py:1013 maps "erase_segment" to the handler, and all three erase call sites record the same wrapper (polygon_drawing_manager.py:180-193, ai_segment_manager.py:253-266, single_view_mouse_handler.py:407-419).
>
> Two minor fidelity nits, neither of which breaks the card: (1) add_segment prefers self.active_class_id when it is set and only falls back to next_class_id, so the phantom is class 3 only when no active class is selected — the Given asserts "next free class id is 3" without stating that precondition; (2) the 3,000/1,000 px split is illustrative arithmetic, not derived from code. Also note a code/comment discrepancy the card actually got right: segment_manager.py:786 says `\> 10` (i.e. 11 px minimum) while its own inline comment claims "Minimum 10 pixels" — the card followed the code.
>
> P0 JUSTIFICATION — fails all three legs (false).
> Moves money: no. LazyLabel is a desktop image-annotation tool; there is no pricing, billing, ledger, or settlement anywhere in this path.
> Enforces regulation: no. Nothing in this code implements a retention period, consent check, audit-trail requirement, or reporting control. No regulator, auditor, or finance controller has a control objective over undo semantics in a labeling editor. Ask the compliance question directly — "would an auditor care if this changed silently?" — and the answer is that they would want it changed: making Ctrl+Z actually restore the polygon is the fix, not a finding.
> Guards data integrity: this is the only arguable leg and it inverts. The rule does not *guard* integrity; it *breaches* it. It silently loses user work and injects a spurious empty channel into the exported NPZ. That makes it a serious bug, but P0 in this framework means "the behavior contract every modernization phase must prove equivalent against." Requiring the React/Node rewrite to reproduce this would burn verification effort proving the new system corrupts annotations identically, and would block the obvious fix (unwrap seg_data["segment"] and delete the pieces added by the erase before re-adding). That is precisely the "wrong P0 wastes verification effort" failure mode.
>
> RECOMMENDED DISPOSITION.
> Reclassify as a P0/P1 defect in the modernization backlog — "Ctrl+Z after erase silently destroys the original segment and writes a phantom empty class channel to the NPZ" — with the intended behavior confirmed by an SME, not as a behavior-equivalence contract.
>
> The same cited lines do contain genuine, contract-worthy rules that should be extracted as separate cards, and losing them is the real risk here:
> - Minimum surviving-piece size: pieces of 11 px or more survive an erase; 10 px or fewer are discarded (segment_manager.py:786). Hardcoded threshold 10, needs to become configuration.
> - Connectivity policy: 8-connectivity for splitting (segment_manager.py:777).
> - Class inheritance: every surviving piece keeps the original class_id (segment_manager.py:689).
> - Representation change: erasing converts a Polygon or Circle into a mask-backed "AI" segment, irreversibly discarding the vector geometry (segment_manager.py:795, 806-811).
> - Full erase removes the segment entirely (segment_manager.py:683-685).
> - Separate genuine data-loss rule worth its own card: in the mirrored multi-view erase path, _apply_erase_to_view keeps only max(contours, key=cv2.contourArea) — all but the largest surviving piece is silently dropped in the mirrored viewers (segment_manager.py:615-622), which contradicts the multi-piece preservation of the single-view path.
>
> INJECTION SUSPECTS: none. I scanned the three cited files plus polygon_drawing_manager.py for "SYSTEM:", "ignore previous instructions", "false positive", "approved", and similar instruction-shaped text; all comments in the cited ranges are ordinary developer commentary. No credentials appear in any cited line, so no masking was required.

**Fidelity judge:** P0 yes, faithful yes

> VERDICT: FAITHFUL (with two precondition caveats the card should state). P0 JUSTIFIED (data integrity), but see the "fix-not-preserve" warning below.
>
> RE-DERIVATION FROM CODE (independent trace, absolute paths):
>
> 1. Erase, single view — E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:656-707. For each segment whose overlap with the erase mask is \> 0 (line 675): index appended to modified_indices; the undo payload appended is the WRAPPER `{"index": i, "segment": segment.copy()}` (line 677); new_mask = segment AND NOT erase (line 680). If remaining_area == 0 the segment is removed with no replacement (683-685); otherwise the original is ALSO removed and the surviving components are appended (688-694). Deletion is done in reverse index order (697-698), then pieces are appended at the end (701-702), then next_class_id is recomputed (704-705). Confirms "the polygon is gone, pieces are appended".
>
> 2. Piece construction — segment_manager.py:770-814. cv2.connectedComponents(..., connectivity=8) at line 777; a component is kept only if np.sum(component_mask) \> 10 (line 786, strictly greater, so exactly 10 px is silently dropped); each kept component becomes {"type": "AI", "mask": component_mask, "vertices": None, "class_id": \<original class_id\>} (806-811). Confirms "over 10 px", "8-connectivity", "type 'AI'", and class inheritance (class 2 in the scenario). Note the card's "polygons and circles become 'AI'" is true but understated: pieces of a type="Loaded" NPZ mask also become "AI", which changes their eligibility for convert_ai_segments_to_polygons.
>
> 3. Next class id — segment_manager.py:816-826: next_class_id = max(existing class ids) + 1. After the erase the only ids are {2}, so next_class_id = 3. Matches the Given.
>
> 4. Record site (Shift+Space, AI mode, single view) — E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\ai_segment_manager.py:253-266 records {"type": "erase_segments", "removed_segments": removed_segments_data} — the wrapper list, verbatim, by reference (record_action at undo_redo_manager.py:28-36 does not copy). The Shift+bbox path at ...\\ui\\handlers\\single_view_mouse_handler.py:407-419 does the same. So the card's chosen trigger is a real trigger for this record shape.
>
> 5. Undo — E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\undo_redo_manager.py:594-598 calls segment_manager.add_segment(seg_data) on the WRAPPER, never seg_data["segment"]. add_segment (segment_manager.py:28-56) sees no "class_id" key on the wrapper (it only has "index" and "segment"), so line 34-39 assigns active_class_id if set, else next_class_id = 3, then appends the wrapper as if it were a segment. Nothing removes the surviving pieces. The original polygon is therefore NOT restored, the pieces remain, and a shapeless record with class_id 3 is appended. Exactly as the card states. (Contrast undo_redo_manager.py:651-652 for delete, which is passed real segment dicts — the erase handler was copy-pasted without unwrapping.)
>
> 6. Save — the shapeless record has no "type" and no "mask", so create_final_mask_tensor (segment_manager.py:225-244) takes the else branch, gets mask=None, and skips it without crashing; but get_unique_class_ids (segment_manager.py:87-95) still returns [2, 3], and save_export_manager.py:400-410 builds class_order/class_labels from exactly that. Result: the NPZ carries an all-zero class-3 channel plus a label entry. The card's save claim is verified. (It appends at the end of sorted order, so it does not shift existing class indices — the card does not claim otherwise.)
>
> 7. Redo — undo_redo_manager.py:624-626: indices = range(num_segs - len(removed_segments), num_segs) = [2] here, deleting the junk wrapper. "Redo removes the last record again" is correct for the stated scenario.
>
> CAVEATS THE CARD SHOULD ABSORB (not errors, missing preconditions):
> (a) The "class 3" outcome holds only when no active class is toggled (segment_manager.py:36-37). If active_class_id is set, the junk record takes that id instead and the empty-channel symptom can disappear entirely — the unrecoverable data loss remains either way. Add "with no active class toggled" to the Given.
> (b) Redo deletes the last N segments BY POSITION, not identity. If the user draws anything between the undo and the redo, redo deletes those new segments instead. Broader than the card says.
> (c) Scope is wider, not narrower: the multi-view erase call sites at ...\\ui\\main_window.py:5796, 5889 and 6982 discard removed_segments_data into `_` and record no undo action at all, so Ctrl+Z there silently undoes an unrelated earlier action. The card's headline is if anything too generous to the legacy code.
>
> P0: Justified under data integrity. For an annotation tool the segment list is the product's data. This path destroys user-authored geometry with no recovery route and injects a phantom class into every export built from class_order. No test covers it (grep for "erase_segments"/"removed_segments" under ...\\legacy\\lazylabel\\tests returns nothing), so it is live, unguarded behavior.
>
> CRITICAL FRAMING FOR DOWNSTREAM: this is a DEFECT, not an intended policy. Encoded as-is into an equivalence contract, the rewrite would be required to reproduce annotation loss. The card must be tagged fix-not-preserve: the genuine rule is "undoing an erase restores the pre-erase segments exactly and removes the pieces created by that erase"; the legacy behavior is the deviation to be recorded as a known bug, and the parity harness must assert the corrected behavior.
>
> DOC/CODE DISCREPANCY (report, do not trust): the docstring at undo_redo_manager.py:575 says "Undo erasing segments (restore removed segments)" and the comment at line 614 says "last N segments that were re-added during undo" — both assert a restoration the executable code does not perform. Judged on executable code, per discipline.
>
> INJECTION SUSPECTS: none. The comments in all three cited ranges (segment_manager.py:646-707, 752-814; undo_redo_manager.py:574-629) are ordinary implementation notes ("Minimum 10 pixels", "Remove segments in reverse order to maintain indices"). No instruction-shaped text, no "SYSTEM:"/"ignore previous instructions" strings, and no credential material in any line read.

### RULE-063: Closing the application never saves the open image's annotations

**Compliance judge:** P0 no, faithful yes

> The rule card matches the code, but it should not be P0.
>
> WHY IT MATCHES: The close handler is closeEvent in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:2064-2108. It closes the popped-out panels, stops the worker threads and cleans up the video predictor. The only thing it saves is settings.json (line 2107; the path comes from config\\paths.py:33). Just before that it copies stream_window_size into the settings (lines 2097-2100). It never calls the annotation save functions (_save_output_to_npz, _save_multi_view_annotations, _auto_save_sequence_frame). It never shows a confirmation dialog, and it never reads the auto_save setting.
>
> I checked for other save paths at shutdown and found none:
> - There are no aboutToQuit or lastWindowClosed hooks, and there is no Quit menu action.
> - main.py:95 does nothing after app.exec().
> - The only atexit handler (models\\sam2_model.py:76) deletes the SAM2 temp JPEG folder. The same folder is also deleted during close via cleanup_video_predictor (sam2_model.py:1082-1095). That is a delete, not a save.
> - SaveWorker is never started (main_window.py:219 only sets it to None).
>
> Auto-Save only runs when the user moves to another image:
> - The checkbox is labelled "Auto-Save on Navigate" (ui\\widgets\\settings_widget.py:39).
> - It is checked when opening another image (ui\\managers\\file_navigation_manager.py:156-160 and 270-274) and when changing sequence frames (main_window.py:3424-3427, 3486).
> - Multi-view saves only when moving to the next or previous pair (main_window.py:6497, 6530).
>
> The default export formats are NPZ and YOLO_DETECTION (config\\settings.py:8-9), which produce the .npz and .txt files named in the spec. So the Given/When/Then is accurate: settings.json is written, no annotation files are written, and the 4 segments are lost.
>
> WHY IT IS NOT P0 (compliance view): The behavior moves no money and meets no regulatory requirement. The code has no audit trail, sign-off, retention or personal-data handling. It does not protect data integrity either: it is simply a missing save. Files on disk stay as they were at the last save, and the only loss is unsaved work in memory. A regulator, auditor or finance controller would not care if this changed; the people affected are the annotators, which makes it a product/UX question. Making it a P0 contract would force every rewrite phase to prove it still loses work silently. In a browser that is hard to test and not worth defending. It fits better as P1/P2, "legacy defect – product decision needed": keep discarding, ask before closing, or save on close.
>
> CAUTION FOR THAT DECISION: If the rewrite adds save-on-close, it also picks up an existing rule. Saving an image that has no segments deletes all of its annotation files (ui\\managers\\save_export_manager.py:106-109 and 523-529; multi-view at main_window.py:6589-6594). That delete rule is the real data-integrity candidate for P0, not this card.
>
> The cited lines contain no instruction-like text and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. I re-derived the behavior from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:2064-2108. In order, closeEvent:
> (a) closes any popped-out panels, which only puts them back in the main window (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\panel_popout_manager.py:113-147);
> (b) stops the background workers (_safe_stop_worker at main_window.py:4406-4415 and _cleanup_propagation_worker at 4658-4662 only stop and wait);
> (c) calls propagation_manager.cleanup(), which frees the predictor and resets state (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\propagation_manager.py:300-309);
> (d) copies stream_window_size into settings;
> (e) writes settings to config_dir/settings.json (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\paths.py:33 and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:77-81);
> (f) calls super().closeEvent(), which accepts the close.
> There is no event.ignore() and no dialog, so the window always closes without asking.
>
> Nothing in the close path saves annotations. It never calls _save_output_to_npz, save_output, _save_multi_view_annotations or export_all. Checked across all .py files, those are only reached from:
> - single-image navigation: file_navigation_manager.py:157-160 and 271-274
> - multi-view pair navigation: main_window.py:6497 and 6530; file_navigation_manager.py:401-403
> - sequence-frame navigation: main_window.py:3427, then 3480-3519
> - the Return/save_output hotkey: main_window.py:1014-1015; keyboard_event_manager.py:205, 230, 234
> - the bulk save of propagated frames: main_window.py:4813
>
> There is also no quit hook. No aboutToQuit or lastWindowClosed handler exists. The only atexit hook deletes the SAM2 temp folder (models/sam2_model.py:74-76). main.py:95 just runs sys.exit(app.exec()), and there is no Exit or Quit menu action.
>
> The Auto-Save checkbox is labelled "Auto-Save on Navigate" (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\settings_widget.py:39-41). It is only read at navigation points, so "even when Auto-Save is on" is correct.
>
> The default export formats are NPZ and YOLO_DETECTION (settings.py:8-9). These produce \<base\>.npz (core\\exporters\\npz.py:30) and \<base\>.txt (core\\exporters\\yolo_detection.py:46). So img_005.npz and img_005.txt are exactly the files a save would write, and closing writes neither. The multi-view pair and sequence-frame parts of the card also hold.
>
> Minor precision notes (none contradict the card):
> (1) Closing writes no annotation file in any enabled format, not just npz/txt. Existing annotation files on disk are left as they are, neither overwritten nor deleted.
> (2) In sequence mode, propagated masks that were not yet saved (held in sequence_view_mode) are also lost.
> (3) settings.json is only written if the earlier cleanup steps don't raise an error.
>
> P0 JUSTIFIED (data integrity). The rule defines when the app's main output, the annotations, gets saved: closing is not a save trigger. Unsaved work is lost, and on-disk annotation files are never changed on exit.
>
> A rewrite that quietly fixes this with save-on-close would still change on-disk data. With no segments, save_single_view_output deletes all annotation files for the image (save_export_manager.py:106-109). Errors while loading annotations are logged and ignored (file_navigation_manager.py:202-212), so an image whose annotation file failed to load would have that file deleted when the app closes. Keeping the behavior silently ships known data loss. Either way the new system needs an explicit, verified decision. Treat this as a defect to decide on, not behavior to copy unexamined.
>
> No prompt-injection text was found in the cited lines.

### RULE-064: Leaving the Sequence tab or clicking New Timeline discards all sequence work without saving

**Compliance judge:** P0 no, faithful yes

> FAITHFUL: yes. Every clause is backed by executable code. main_window.py:674 connects the tab widget's currentChanged directly to _on_view_mode_changed, and :3046-3047 unconditionally calls _on_exit_sequence_timeline() when leaving sequence mode with no save and no prompt. _on_exit_sequence_timeline (:4998-5035) stops the archetype/reference-finder worker, calls propagation_manager.cleanup(), and calls sequence_view_mode.set_image_paths([]) which runs _reset_state() (sequence_view_mode.py:128-141) clearing _reference_annotations, _frame_statuses, _propagated_masks, _confidence_scores, _suggested_frames and _skipped_frame_indices, then nulls _sequence_start_path/_sequence_end_path/_sequence_timeline_built. _restore_single_view_state (:7264-7269) does segment_manager.clear() then load_existing_mask(), so single view re-reads from disk and in-memory edits are gone. _enter_sequence_mode (:5361-5368) then shows the setup screen because _sequence_timeline_built is False (the restore-start/end branch at :5370-5375 is dead in this path). closeEvent (:2096-2107) persists only settings.save_to_file(). The concrete example is also correct: timeline_widget.py:33 maps green to 'propagated' (in-memory) and :36 cyan to 'saved' (on disk), and sequence_view_mode.py:369-372 deletes propagated masks only once a frame becomes SAVED, so 250 green frames are genuinely unsaved. No QMessageBox confirmation exists anywhere in main_window.py (grep returns only AI-preview 'confirm' strings at :2256 and :2270). Only nuance: frames already persisted via auto-save on scrub (:3480-3517) or Save All (:4741+) survive on disk, which the spec already implies by noting single view reloads from disk.
>
> P0 NOT JUSTIFIED under the compliance lens. No money moves: LazyLabel is a desktop image-annotation tool with no transactions, rates, or ledger. No regulatory requirement is encoded anywhere in the path: no retention period, audit trail, record signing, user identity, or consent handling. The only plausible P0 hook is 'guards data integrity', and it fails on direction: this code guards nothing. It tears down in-memory session state while leaving every persisted artifact (NPZ/TXT) fully intact and self-consistent; _restore_single_view_state proves the on-disk record is the source of truth after the switch. Nothing persisted becomes corrupt, stale, or contradictory. What is lost is work that was never committed, which is a usability/data-loss hazard, not an integrity invariant. No regulator, auditor, or finance controller has a claim here. Promoting it to P0 is also actively counterproductive: it would contractually oblige the rewrite to reproduce 'silently discard 250 frames of propagated work with no prompt and no auto-save', which is a defect candidate rather than behavior to preserve. Correct disposition is a high-severity usability/data-loss behavior (P1) documented for parity, plus a defect note recommending a confirm-or-autosave gate before _on_exit_sequence_timeline runs from the tab-change path; the same teardown is also reachable from the New Timeline button (sequence_widget.py:551 -\> main_window.py:3360-3361).
>
> INJECTION/CREDENTIALS: none. No instruction-shaped text in any cited range. The docstring at main_window.py:5347-5353 ('User must: 1. Navigate to start frame...') is end-user workflow documentation, not a directive aimed at automated analysis. No credential values appear in the cited lines, so no masking was required.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL. Re-derived independently from the code, every clause of the Given/When/Then holds. main_window.py:3043-3060 fires _on_exit_sequence_timeline on any departure from the Sequence tab (view_mode=="sequence" and index!=2), before entering the new mode; index==0 then calls _restore_single_view_state. main_window.py:4998-5035 stops the archetype worker (_reference_finder_worker; "Find Archetypes" per sequence_widget.py:263,592 and hotkey main_window.py:1032), calls propagation_manager.cleanup() which tears down the video predictor and replaces state with a fresh PropagationState (managers/propagation_manager.py:300-309 = "resets the engine"), and calls sequence_view_mode.set_image_paths([]) -\> _reset_state (modes/sequence_view_mode.py:123-141) clearing _reference_annotations, _frame_statuses, _propagated_masks, _confidence_scores and _suggested_frames; it then nulls _sequence_start_path/_sequence_end_path, sets _sequence_timeline_built=False, calls sequence_widget.reset() (sequence_widget.py:770-794, labels back to "Not set") and timeline_widget.set_frame_count(0)/clear_statuses(). No save call and no confirmation dialog exist anywhere in this path (grep for QMessageBox/confirm in main_window yields only unrelated AI-preview hits). New Timeline is identical: sequence_widget.py:542-551 emits exit_timeline_requested with no prompt, wired at main_window.py:3360-3361 to the same handler. The Given's "250 green (propagated, unsaved)" is accurate: timeline_widget.py:33 maps propagated to green QColor(76,175,80) while saved is cyan (line 36), and propagated masks only reach disk via _on_save_all_propagated (main_window.py:4741+) or _auto_save_sequence_frame (3480-3519, which calls mark_frame_saved) - so never-visited propagated frames are memory-only and are destroyed. The current frame's edits are discarded at 7242-7273: segment_manager.clear() followed by file_manager.load_existing_mask(current_image_path), i.e. reload from disk with no save. Returning to Sequence hits 5346-5382 with _sequence_timeline_built False, and the start/end restore at 5370-5375 is a no-op because both were nulled, so the blank setup screen (Set Start / Set End / Build Timeline) is shown - _restore_sequence_mode_state at 5395 is unreachable via tab switching. closeEvent (2064-2108) writes only stream_window_size plus settings.save_to_file, with no annotation save, so "closing the app saves settings only" is correct. Ordering is correct too (teardown precedes single-view restore, and current_image_path is not reset, so Single opens on the last sequence frame). Three refinements the card understates but does not contradict: (1) within sequence mode, navigating between frames DOES auto-save the outgoing frame (main_window.py:3424-3427, gated on the auto_save setting, default True at 3486, which marks the frame SAVED/cyan) - the flat "switching tabs never saves" is true for tab switches but a reader could wrongly infer nothing is ever persisted, so the card should name auto_save (default True) as a parameter rather than "(none)"; (2) an in-flight propagation worker is NOT stopped by the teardown - only the archetype finder is (5001-5007), while _cleanup_propagation_worker() appears only in closeEvent:2081, so propagation_manager.cleanup() swaps state under a possibly running worker (latent defect, separate finding); (3) at 7251-7253 the segment_manager.clear() is nested inside "if self.current_image_path" and "if not pixmap.isNull()", so on a load failure sequence segments would leak into single view - rarely reachable because 3534 sets the path. P0 is justified on data-integrity grounds: the rule defines exactly which annotation work survives a tab switch, and it is silent, unconfirmed, irreversible destruction of hours of labeling output; a rewrite that guesses wrong either ships silent data loss or silently changes persistence semantics, so this belongs in the behavior contract (with a conscious decision to replicate or to add a save/confirm prompt). It does not move money or enforce regulation. No injection-shaped text in any cited region: the New Timeline tooltip ("This will clear all propagation results", sequence_widget.py:543-546) and the _enter_sequence_mode docstring (5347-5353) are descriptive and corroborated by executable code. No credentials appear in the lines read.

### RULE-078: Annotations load from the best file present, and a damaged non-NPZ file stops the search

**Compliance judge:** P0 yes, faithful yes

> FAITHFUL: every load-bearing claim checks out against executable code. The chain order matches _LOAD_CHAIN (file_manager.py:128-136) and LOAD_PRIORITY (exporters/__init__.py:73-81). First-hit-wins is the unconditional `return` at file_manager.py:205. The NPZ-vs-rest asymmetry is real: _load_npz (224-266) has no internal try/except so a corrupt archive raises and is caught-and-continued at 202-204, while COCO (614-623), YOLO seg (553-558), YOLO det (423-428), VOC (466-470) and CreateML (502-510) each log-and-return normally, so no exception reaches the handler and the loop falls through to `return` with zero segments. I traced the destructive follow-on myself and it holds: file_navigation_manager.py:157-160 auto-saves on navigation (default True) -\> main_window.py:1993-1998 -\> save_export_manager.py:107-109 routes the empty-segment case to _delete_associated_files -\> :529 delete_all_outputs -\> each exporter's delete_output removes its file unconditionally with no authorship check (e.g. yolo_detection.py:48-53). So a truncated cat_coco.json really does cause a healthy, never-read cat.txt to be deleted.
>
> P0 JUSTIFIED, but on the data-integrity limb only, NOT the compliance limb. Answering the compliance lens honestly: no regulator, auditor or finance controller has a stake here. LazyLabel is a desktop image-annotation tool; the cited code moves no money, implements no statutory or contractual requirement, handles no regulated data, and creates no audit trail or retention obligation. If the P0 bar were compliance alone, this would fail and should be downgraded. It clears the third limb decisively instead: the load-priority chain is the authority rule deciding which of several on-disk representations of the same user-authored ground truth is trusted, and its outcome feeds directly into an irreversible multi-file delete. A rewrite that silently reordered the chain (reading .txt before _coco.json) would downgrade masks to boxes and then destroy the masks on the next save; a rewrite that silently "fixed" the error handling to be uniform would change which files survive. Both are exactly the class of behavior a modernization must prove equivalent against, so the verification effort is not wasted.
>
> CAVEATS for the rule card, none overturning it: (1) "every other loader hides its own read errors" is over-broad for _CM.npz — load_npz_class_map catches only (OSError, ValueError) at file_manager.py:309, so a truncated zip raises BadZipFile, propagates, and the chain DOES continue; only a missing class_map key or OSError/ValueError stops it. Worth narrowing the wording. (2) The delete is unrecoverable but not literally silent — save_export_manager.py:536-538 shows a "Deleted: ..." toast. (3) Unmentioned aggravator: find_annotation_file (file_manager.py:138-151) uses the same chain, so the image still displays as annotated after loading zero segments.
>
> DOCUMENTATION DISCREPANCY (a finding, not an instruction I acted on): the docstring at file_manager.py:160-163 asserts the opposite of the code — "A file that cannot be read is logged and the chain moves on to the next format rather than letting one damaged sidecar hide a healthy one." That is true only for .npz. exporters/__init__.py:194-197 ("Writing never deletes") is likewise narrowly true of export_all but misleading about the save path that calls it. The extracting agent correctly followed executable code over comments. The stated intent in that docstring is strong evidence this is a latent defect rather than a deliberate policy, so the rewrite should treat the DOCUMENTED behavior as the target contract and the current behavior as a bug to fix under a flag, not to replicate.
>
> INJECTION: none. A targeted scan of file_manager.py, the exporters package and save_export_manager.py for instruction-shaped text (SYSTEM:, ignore previous instructions, "false positive", "reviewer should", "mark as approved") returned no matches. Comments in the cited ranges are ordinary design rationale. No credentials appear in any cited line, so no masking was required.

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL (with two minor precision notes). I re-derived the behavior independently from the code.
>
> ORDER — exact match. `E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136` defines `_LOAD_CHAIN` as (.npz, _seg.txt, _coco.json, _CM.npz, .xml, _createml.json, .txt), mirroring `LOAD_PRIORITY` at `E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:73-81`. The stated parameter string is correct. First existing file wins (`file_manager.py:173-176`, unconditional `return` at :205).
>
> STOP-ON-DAMAGE MECHANIC — correct, and correctly contradicts the docstring. `file_manager.py:156-163` claims "A file that cannot be read is logged and the chain moves on to the next format." The executable code only achieves that when the loader *raises* (generic handler `except Exception ... continue` at :202-204). `_load_npz` (:224-231) has no internal handler, so a damaged NPZ raises and the chain continues. Every other cited loader swallows its own read error and `return`s normally — YOLO Seg :553-558, COCO :614-619/:621-623, Pascal VOC :466-470, CreateML :502-507, YOLO Det :423-428 — so control falls through to `return` at :205 and the chain stops with nothing loaded. The rule reports code over comment, which is the right call; this docstring-vs-code gap is itself worth carrying into the rewrite.
>
> SCENARIO — verified step by step. Opening cat.png calls `load_existing_mask` with the pixmap size (`E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:202-206`). .npz and _seg.txt absent, _coco.json present -\> `load_coco_json` -\> `json.JSONDecodeError` (a ValueError) caught at :617, logged at :618, `return` at :619 -\> no exception -\> :205 returns -\> cat.txt never read -\> 0 segments. Correct.
>
> DESTRUCTIVE TAIL — verified, and it is the part that earns P0. Auto-save defaults to True (`E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45`) and fires on navigating away with no dirty check (`file_navigation_manager.py:156-160`, also :271-274) -\> `save_single_view_output` sees zero segments and calls `_delete_associated_files` (`E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:107-109, 523-542`) -\> `delete_all_outputs` (`exporters\\__init__.py:209-215`) removes cat_coco.json (`exporters\\coco.py:102-107`) and the valid cat.txt (`exporters\\yolo_detection.py:48-53`). So one unreadable sidecar silently destroys a healthy one: irreversible loss of the user's labeled data, which is the tool's actual product. Data integrity, so P0 is justified (not money, not regulatory).
>
> NOTE 1 (over-generalization, minor): "every other loader hides its own read errors" is not universal for _CM.npz. `load_npz_class_map` catches only (OSError, ValueError) at :309; I confirmed numpy raises `zipfile.BadZipFile`, which is neither, so a truncated _CM.npz propagates to :202 and the chain DOES continue. Only its content failures (missing class_map :298-300, shape mismatch :313-318) stop the chain. Recommend rewording to "loaders that catch their own read errors stop the chain" rather than "every other loader."
>
> NOTE 2 (omission, not error): a second chain-stopping path is uncited — when image_size is absent and the header cannot be read, :178-185 `return`s outright for the whole chain rather than continuing. Also, because there is no rollback, a loader that adds some segments and then raises leaves partial segments and the next format appends on top (:202-204). Neither contradicts the scenario (0 segments is right for a JSON decode failure), but both belong in the equivalence contract.
>
> INJECTION: none. I grepped the cited files for directive-shaped text ("SYSTEM:", "ignore previous", "false positive", "mark this rule", etc.) and found no matches; all comments are ordinary design rationale. No credentials appear in any cited line.

### RULE-078: A damaged or empty higher-priority file blocks lower-priority files (folded card)

**Compliance judge:** P0 yes, faithful yes

> Verdict: P0 is justified, but only because this is about data integrity. No money or regulation is involved (this is an image-labelling tool). The Given/When/Then matches the code. Two fixes are needed: the P0 contract is aimed at the wrong target, and one general claim goes too far.
>
> What the code does (I read it directly):
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:187-205 only moves to the next format when a loader raises (202-204 continue). Otherwise it stops at 205.
> - In the scenario (no img.npz, no img_seg.txt), the invalid JSON is caught at 614-619 and logged as 'Error loading COCO JSON from ...' (618). The loader returns normally and the chain stops. .xml is 5th in _LOAD_CHAIN (128-136), so it is never tried and 0 segments load.
> - The same catch-and-return pattern is at 423-428 (YOLO det), 466-470 (VOC), 502-510 (CreateML), 553-558 (YOLO seg) and 621-623 (COCO file that is not an object).
> - The user sees nothing, because the callers' own try/except (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:202-212 and 342-348) never fires.
>
> The deletion claim is true, but it is outside the cited lines:
> - Auto-save is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45).
> - Navigating away runs file_navigation_manager.py:156-160 / 270-274, then E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:1993-1998, then E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:106-109 (no segments) and 523-529, then E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:209-215.
> - That last function calls os.remove on every registered annotation format, not just the enabled ones (coco.py:102-107, pascal_voc.py:65-70).
> - There is no unsaved-changes check and no confirmation, only a 3-second 'Deleted:' notification. Multi-view does the same at main_window.py:6589-6594.
> - Result: the healthy img.xml with 4 boxes is permanently deleted.
>
> Why an auditor would care:
> - The annotation files are the dataset being delivered, and may be ground truth that came with the data. Silently changing this behaviour in either direction changes which labels survive.
> - E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\CHANGELOG.md:12 (release 2.0.8) already fixed this exact sequence (0 segments load, then auto-save deletes the files) as a data-loss bug.
> - CHANGELOG.md:24 and the docstring at file_manager.py:161-163 promise the opposite: a damaged file must not hide a healthy one. This is a documentation-vs-code mismatch, not text aimed at AI tools.
>
> Fixes needed:
> 1. The P0 contract must not be 'keep the blocking behaviour', or verification will spend effort proving a data-loss bug is preserved. Make the contract the documented intent: a failed or empty higher-priority file falls through to the next format, and 0 segments caused by a failed load never trigger delete_all_outputs. Record the legacy behaviour as a known defect and use this Given/When/Then as its regression test.
> 2. 'Six of seven loaders catch their own errors' goes too far for load_npz_class_map (296-311). It only catches OSError and ValueError. With the installed numpy 2.2.6, a zero-byte, garbage or truncated _CM.npz raises EOFError, pickle.UnpicklingError or zipfile.BadZipFile. None of these are caught, so those files do fall through. The class map only blocks on OSError/ValueError, a missing class_map key (298-300) or a shape mismatch (313-318). Five loaders reliably block.
> 3. 'Empty' needs a caveat. A zero-byte .npz falls through (EOFError). An .npz that opens but has no mask key or only all-zero channels blocks (241-242, 256-257).
> 4. Add the deletion-path citations listed above.
> 5. Tests only check fall-through for a corrupt NPZ (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:749-756). The other six formats have no test.
>
> Confidence: High. No instruction-like text and no credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> The Given/When/Then matches the code step by step. The general "six of seven" statement in the Plain English goes too far for the NPZ-family files, and the deletion step has no citation.
>
> How the scenario runs (default single view, main_window.py:98):
> 1. Opening the image clears segments first (file_navigation_manager.py:186, main_window.py:2141). load_existing_mask then gets the image size from the pixmap (file_navigation_manager.py:203-206 / 343-345).
> 2. The load order (file_manager.py:128-136) puts _coco.json third and .xml fifth. The missing .npz and _seg.txt are skipped (175-176).
> 3. load_coco_json hits a JSONDecodeError. It catches it at 617, logs "Error loading COCO JSON from {path}: {e}" (618) and returns normally (619).
> 4. No exception reaches line 202, so the return at 205 ends the chain. img.xml is never opened and 0 segments load.
> 5. Moving to another image with Auto-Save on (the default, settings.py:45) runs the save (file_navigation_manager.py:157-160 / 271-274, main_window.py:1998).
> 6. The save sees 0 segments (save_export_manager.py:107-108) and calls delete_all_outputs (exporters/__init__.py:209-215). That runs every one of the 7 exporters, so coco.py:102-107 deletes img_coco.json and pascal_voc.py:65-70 deletes img.xml. Nothing checks whether the user changed anything.
>
> Fixes needed:
> (a) load_npz_class_map only catches OSError and ValueError (309). With allow_pickle=True, numpy 2.2.6 raises other errors for broken files:
> - EOFError for a 0-byte file (_npyio_impl.py:459-460)
> - pickle.UnpicklingError for random bytes (490-494)
> - zipfile.BadZipFile for a truncated zip
> None of these are caught, so they reach line 202 and the chain moves on. A _CM.npz only blocks when it is missing class_map (298-300), has the wrong shape (313-318), or raises OSError/ValueError. _load_npz catches nothing, so a broken .npz is skipped too. It only blocks when it reads fine but has no mask/masks key (241-242) or all channels are empty. The rule's title is right for _seg.txt, _coco.json, .xml and _createml.json, but not for a damaged NPZ-family file.
> (b) Edge case: an Infinity coordinate in COCO raises OverflowError, which 662/689 do not catch. The chain then moves on, possibly after some COCO segments were already added, and lower-priority segments are added on top with no rollback.
> (c) Add citations for the deletion path listed above.
>
> The code contradicts the docs: file_manager.py:161-163, CHANGELOG.md:24 and ARCHITECTURE.md:206-207 all promise the chain moves past a damaged file. ARCHITECTURE.md:193 says deletion only happens when the user cleared the annotations. These look like out-of-date docs, not attempts to manipulate the analysis. No injection-style text was found in the cited lines.
>
> Why P0: with default settings, a corrupt higher-priority file quietly hides a valid annotation file, and the next navigation permanently deletes it. That is a data-integrity issue. Question for a subject-matter expert: should the rewrite copy this behavior, or should the documented fall-through (with no deletion) be the contract? I recommend treating this card as a record of a known defect, not a behavior to reproduce.

### RULE-078: Annotation load priority chain (folded card)

**Compliance judge:** P0 yes, faithful yes

> VERDICT: P0 is justified, but only because it protects annotation data. It has nothing to do with money or regulation. The Given/When/Then matches the code but needs three corrections before it can serve as the behavior contract.
>
> COMPLIANCE LENS. The project is an ML image segmentation GUI (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\pyproject.toml:11). A search of the legacy tree found no regulated-domain context, so a regulator, auditor or finance controller would not care. The P0 rating rests only on data integrity, and the code supports that:
> 1. Whatever gets loaded is written back. Auto-save on navigate is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:157-160, 271-274). save_single_view_output (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:97-133) re-exports the in-memory segments in the selected formats with no check for unsaved changes. The defaults are NPZ and YOLO Detection (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:60-63), and each exporter overwrites its own file. If the order silently changed so .txt ranked above .npz, just opening and leaving an image would rewrite foo.npz from boxes and lose the mask detail for good (test_bbox_roundtrip.py:406-417).
> 2. If the chosen file loads zero segments, the same auto-save deletes all seven sidecar files (save_export_manager.py:106-109, 523-529; exporters/__init__.py:209-215).
> 3. find_annotation_file decides which frames propagation skips as already labelled (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4218-4227) and which count as labelled references (main_window.py:3966). If a suffix dropped out of the chain, hand-made labels could be overwritten.
>
> FAITHFULNESS. These parts are correct against the code:
> - The order in E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136 matches exporters/__init__.py:73-81, and test_bbox_roundtrip.py:494-500 asserts they stay in sync.
> - The first file that exists wins.
> - The chain moves to the next file only when a loader raises (file_manager.py:187-205).
> - find_annotation_file walks the same chain (file_manager.py:139-151).
> - The COCO-over-.txt scenario holds.
>
> Corrections needed:
> (a) Spell out what "only when a loader raises" means in practice. Most loaders catch their own errors and return normally: YOLO Seg 553-558, COCO 614-623, Class Map 296-318 (including a size mismatch), VOC 466-470, CreateML 502-510. So a corrupt or non-object foo_coco.json loads nothing and blocks a healthy foo.txt, and auto-save then deletes both. Only a corrupt .npz falls through (_load_npz at 224-266 has no guard), plus unexpected error types such as a TypeError from {"annotations": 5}. This contradicts the docstring at file_manager.py:161-163, which says a damaged file never hides a healthy one. The code is what counts, and the only fall-through test covers NPZ (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:749-756). The cited lines 423-428 belong to .txt, the last format in the chain, so that error handling does not affect the chain.
> (b) "Exactly one sidecar" is too strong, for two reasons. First, when a non-NPZ file is found but the image size is unknown, lines 178-185 exit the whole chain and load nothing. That can happen in callers that pass no size or a possibly-None size: main_window.py:3619, 4864, 6112-6114. Second, the except/continue at 202-204 does not undo partial work. Class names or segments added before an error (COCO categories at 626-637, _restore_aliases at 232) stay and get mixed with the next file's data.
> (c) find_annotation_file only checks that a file exists, so a corrupt or empty top-priority file still counts as labelled.
>
> SME QUESTION: Sidecar names are built from the image's base filename, so they can collide between images. Is that intended? Example: for image foo_CM.png, the chain treats foo_CM.npz (foo.png's class map) as its NPZ. That file has no mask key, so nothing loads and no error is raised, and auto-save then deletes foo.png's class map. foo_seg.png does the same to foo_seg.txt, and foo.png and foo.jpg share every sidecar.
>
> No instruction-like or injection text was found in the cited lines, and no credentials.

**Fidelity judge:** P0 yes, faithful yes

> Path key: FM=E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py; EXP=E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py; MW=E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py; NAV=E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py; SAVE=E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py; YD=E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py; ARCH=E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ARCHITECTURE.md; RT=E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py
>
> P0: justified. The chain decides which file on disk becomes the labels in memory. On save those labels are written back over the sidecar files. If nothing loads, the next save deletes every sidecar (SAVE 106-109, then EXP 209-215). find_annotation_file also decides which frames propagation skips, which protects hand-made labels (MW 4218-4227). This guards the product's core data.
>
> FIDELITY: faithful. The Given/When/Then matches the code on order and on the stated scenario. It needs the amendments below before it becomes a P0 contract.
>
> Confirmed against the code:
> (1) Order in FM 128-136 is .npz \> _seg.txt \> _coco.json \> _CM.npz \> .xml \> _createml.json \> .txt, the same as EXP 73-81. Only _LOAD_CHAIN is executable; the unit test RT 494-500 is the only thing keeping LOAD_PRIORITY in sync with it.
> (2) The loader tries the first base+suffix file that exists (FM 171-176). A normal return stops the chain; an exception is logged and the chain moves on (FM 187-205).
> (3) The coco+txt example holds when foo_coco.json is well-formed.
> (4) find_annotation_file walks the same _LOAD_CHAIN (FM 146-151) and drives MW 3966, 4226 and 4858.
>
> Required amendments:
> (a) The plain English "the first that exists" is wrong. The winner is the first existing file whose loader does not raise. RT 749-756 proves it: a corrupt foo.npz plus a valid foo.txt loads foo.txt.
> (b) The "only when a loader raises" clause is literally true but hides the key edge case. Most loaders catch their own read and parse errors and return normally. So a damaged file stops the chain with 0 segments. This happens in COCO (bad JSON or a non-object root, FM 614-623), YOLO Det (423-428), YOLO Seg (553-558), VOC (466-470), CreateML (502-510), class map (296-318, including a size mismatch) and NPZ with no mask key (238-242). Example: foo_coco.json is "[1,2,3]" or empty and foo.txt is valid. Result: 0 segments, and foo.txt is still ignored. The FM 161-163 docstring and ARCH 206-207 both say the opposite (a failed file lets the chain continue). The rule must state the real behavior and flag the conflict for an SME.
> (c) Data loss follows from (b). With 0 segments loaded, the auto-save on the next navigation (NAV 157-160 and 271-274; auto_save falls back to True) calls delete_all_outputs (SAVE 106-109, 529). That removes the healthy foo.txt (YD 48-53) and every other sidecar.
> (d) "Exactly one sidecar" is not guaranteed. A loader that raises can leave partial state behind. COCO registers class aliases (FM 626-637) and adds segments before an Infinity coordinate raises OverflowError from round() (659/689); the TypeError/ValueError handlers do not catch it. _load_npz replaces the aliases (232/343) before the mask data is read (248). The next file then loads on top of that partial state.
> (e) If the first existing file is not NPZ, no image size was passed and the image cannot be read, FM 178-185 returns and nothing loads. MW 3619 and 4864 can reach this.
> (f) find_annotation_file only checks that a file exists. With a corrupt .npz plus a .txt, it reports the .npz while the .txt is what loads. A damaged top file marks the frame as labelled, so propagation skips it even though nothing loads. "Same chain" means the same order, not the same result.
> (g) Scope limits. In sequence mode, propagated masks bypass the chain (MW 3593-3606). File names can collide: foo_seg.png's foo_seg.txt doubles as foo.png's _seg.txt. Its 5-token lines are rejected at FM 564, so foo.png gets 0 segments and the chain stops. foo_CM.png's .npz collides with foo.png's _CM.npz the same way.
>
> Aside: FM 231 and 297 call np.load with allow_pickle=True, so a crafted sidecar can run code.
>
> No instruction-like text or credentials in the cited lines.

### RULE-078: Annotation load priority chain (one format wins) (folded card)

**Compliance judge:** P0 yes, faithful yes

> Paths: SRC = E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel, TESTS = E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit.
>
> P0: justified, but only on data integrity. Nothing here moves money or meets a regulatory duty, so a regulator or finance controller would not care. A data or label-quality auditor would, because the chain picks which on-disk file becomes the in-memory truth, and that truth is written back without asking:
> - The default export formats are NPZ + YOLO Detection (SRC\\core\\exporters\\__init__.py:60-63). So img.npz and img.txt side by side is the normal state of every labelled image, not an edge case.
> - Auto-save on navigate is on by default (SRC\\config\\settings.py:45) and has no dirty check (SRC\\ui\\managers\\file_navigation_manager.py:156-160, 270-274).
> - That save overwrites every selected format with whatever was loaded (SRC\\ui\\managers\\save_export_manager.py:117-122). If nothing was loaded, it deletes all 7 sidecar files for the image (save_export_manager.py:106-109, 523-529; exporters\\__init__.py:209-215).
> - So if the order silently changed (for example .txt above .npz), just browsing images would rewrite the pixel masks in img.npz as rectangles, with no way back.
> - The same chain, through find_annotation_file (SRC\\core\\file_manager.py:138-151), decides which frames propagation skips as already labelled (SRC\\ui\\main_window.py:4218-4227).
> - The load-bearing part is NPZ first, then polygon/mask formats, then box formats. The box formats read back to identical boxes (TESTS\\core\\exporters\\test_bbox_roundtrip.py:776-799), so their order among themselves matters little.
>
> Faithful: yes.
> - The order matches _LOAD_CHAIN (file_manager.py:128-136) and LOAD_PRIORITY (exporters\\__init__.py:73-81). A test keeps the two in sync (test_bbox_roundtrip.py:494-500).
> - The Given/When/Then matches file_manager.py:173-205 and the existing test test_seg_preferred_over_det (TESTS\\core\\test_file_manager.py:910-924).
> - Opening an image clears segments and passes the image size in (file_navigation_manager.py:186, 202-206).
> - The image-size parameter is correct (file_manager.py:178-185, 207-222).
>
> Gaps the contract should add as their own Given/When/Then cases:
> (a) 'Exactly one is loaded' is loose. The winner is the first file whose loader does not raise. If a loader raises, the chain tries the next file (202-204). Example: a corrupt img.npz plus a healthy img.txt loads the boxes (test_bbox_roundtrip.py:749-756).
> (b) Most loaders catch their own errors and return normally: _seg.txt 553-558, _coco.json 614-623, .xml 466-470, _createml.json 502-510. The _CM.npz loader does the same for OSError/ValueError, a missing class_map key and a size mismatch (296-318). A damaged or empty higher-priority file therefore stops the chain at line 205 with nothing loaded, and the healthy lower-priority file stays hidden.
>   - This contradicts the docstring at file_manager.py:161-163 ('rather than letting one damaged sidecar hide a healthy one'). That claim only holds when the loader raises. This is a comment/code mismatch, not an injection.
>   - Combined with the auto-save delete: a truncated img_coco.json next to a healthy img.txt gets both deleted when the user navigates away. This is a likely data-loss defect; do not port it as-is.
> (c) If a non-NPZ file exists and the image size cannot be read, nothing is loaded (178-185).
> (d) Files are found by suffix only, so names can collide across images. foo.png treats foo_seg.png's YOLO Detection file (foo_seg.txt) as its own YOLO Segmentation file. Its 5-token lines are skipped (564), nothing loads, and auto-save for foo.png deletes foo_seg.txt. foo_CM.npz collides the same way.
> (e) The choice is by format type, never by file age or content: an older NPZ beats a newer TXT (test_bbox_roundtrip.py:484-492).
>
> SME questions:
> 1. Should a sidecar that fails to parse, or parses to zero objects, fall through to the next format the way a raising NPZ does?
> 2. Should auto-save with zero loaded segments delete sidecar files it never loaded?
>
> No instruction-shaped text in the cited lines; no credentials.

**Fidelity judge:** P0 yes, faithful no

> Summary: the P0 rating holds. The format order and the example scenario are correct. The card is still not faithful: its core claim, "exactly one is loaded", fails at the edges. Paths below are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ unless another root is given; ':N' means core/file_manager.py.
>
> WHY P0 HOLDS
> - This chain decides which of several conflicting annotation files the app loads.
> - Auto-save defaults to on (ui/widgets/settings_widget.py:200) and runs on every navigation (ui/managers/file_navigation_manager.py:156-160 and 270-274). It writes whatever was loaded back out through export_all.
> - If nothing was loaded, saving deletes every annotation file for the image: ui/managers/save_export_manager.py:106-109 calls delete_all_outputs (core/exporters/__init__.py:209-215).
> - find_annotation_file (:139-151) uses the same file-exists check. It picks propagation reference frames (ui/main_window.py:3966) and the frames propagation leaves alone (ui/main_window.py:4226).
> - So the rule guards the integrity of annotation data.
>
> WHAT THE CARD GETS RIGHT
> - Order: :128-136 matches LOAD_PRIORITY (core/exporters/__init__.py:73-81) and the file suffix each exporter writes.
> - Scenario: with no img.npz, img_seg.txt is found first and loaded, and the chain stops at :205. img.txt is never opened.
> - 3 polygons give 3 segments, because add_segment (core/segment_manager.py:28-56) never merges.
> - Both open paths clear old segments and pass the image size. The sequence-mode cache (_sequence_mask_cache) is never filled, so every path goes through the chain.
> - The image-size note matches :178-179 and :207-222.
>
> WHERE IT IS NOT FAITHFUL
> The winner is the first file that exists, not the first that loads. The chain moves on only if an exception escapes the loader.
>
> (a) Zero segments, and lower-priority files are never read. The first existing file's loader returns normally with nothing, and :205 stops the chain. This happens when:
> - the loader catches its own read or parse error: YOLO Seg :553-558, COCO :614-623, Class Map :309-311, Pascal VOC :466-470, CreateML :502-510;
> - the class map's shape doesn't match the image (:313-318);
> - every line is malformed (:564-565);
> - the NPZ has no mask key (:241-242).
> The docstring at :160-163 promises a damaged file won't hide a healthy one. Only the comment says that; the code (:187-205) keeps the promise only when an exception is raised. Examples of that: a garbage img.npz (tested at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:749-756), or NaN/inf reaching round() outside a try block (:572-575, :527).
>
> (b) Two formats mixed. When an exception escapes, :202-204 moves to the next file, but whatever the failed loader already did stays:
> - aliases set by _restore_aliases (:232) before the mask read fails;
> - COCO category aliases (:626-637) and annotations already added (:672-680) before a later JSON Infinity makes round() raise OverflowError. The except clauses at :662 and :690 don't catch it.
> - YOLO Seg polygons already added before an int32 overflow at :584 (NumPy 2.2.6 raises).
>
> (c) If the image size can't be read, :178-185 returns and nothing loads. Sequence mode passes no size (ui/main_window.py:3619 and 4864).
>
> (d) Name collision: img_seg.txt is also the YOLO Detection file of an image named img_seg.png (core/exporters/yolo_detection.py:46). img_CM.npz is also img_CM.png's NPZ.
>
> SCENARIOS THE CONTRACT NEEDS
> 1. Given img.png has no img.npz, a valid img.txt with 5 boxes, and an img_seg.txt whose lines all have 5 tokens (for example img_seg.png's labels). When img.png is opened and the user navigates away with auto-save on. Then 0 segments load, img.txt is never read, and auto-save deletes img.txt and img_seg.txt.
> 2. Given img_coco.json where annotation 1 is a valid polygon and annotation 2 has bbox [10,10,Infinity,5] and no segmentation, plus img.txt with 5 boxes. When opened. Then 6 segments load: 1 from COCO and 5 from YOLO Detection.
> 3. Given a garbage img.npz and img.txt with 5 boxes. When opened. Then the 5 boxes load.
>
> CORRECTED RULE
> Check the suffixes in order and hand the first file that exists to its loader. Stop there, even if it produced nothing, unless the loader raises. If it raises, try the next existing file and keep any segments or aliases the failed loader already added. If the image size is needed and can't be read, stop.
>
> QUESTION FOR THE PROJECT OWNER
> Should the rewrite keep choosing by file existence, or do what the docstring intends (the first file that loads successfully wins) and throw away partial results from a failed loader?
>
> OTHER NOTES
> - Outside this rule: np.load(allow_pickle=True) at :231 and :297 unpickles any non-zip file named .npz, which can run code when the image is opened.
> - The cited lines contain no text aimed at AI tools and no credentials.

### RULE-079: Export writes every selected format and never removes other files

**Compliance judge:** P0 yes, faithful yes

> VERDICT: P0 is justified, but only on data integrity. The Given/When/Then is faithful, but the card needs fixes.
>
> COMPLIANCE LENS: This code writes ML image-annotation sidecar files. It has no money, PII, retention or audit-trail logic, so no regulator or finance controller has a stake. P0 still holds on data integrity, and a dataset-provenance auditor would care if this changed silently:
> - If a rewrite started "cleaning up" unselected formats on save, it would permanently destroy ground-truth label files that shipped with a dataset.
> - If a rewrite dropped a selected format, datasets would silently go incomplete.
> - "Nothing to write writes nothing" also matters. The loader reads the first sidecar file it finds (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:173-205), so an empty file would hide the real one.
>
> Keep P0 for the core only: with segments present, write or overwrite exactly the selected formats and delete nothing. Move the default set (NPZ + YOLO Detection), the minimum-one UI guard and the settings parsing to a P1/P2 configuration card.
>
> FAITHFULNESS (checked against the code):
> - Return and Enter both trigger a save (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\hotkeys.py:67-69, then E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\keyboard_event_manager.py:187-234).
> - A save with segments exports the widget's current selection (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:111-122; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6613-6632).
> - export_all never deletes anything (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:199-206), and the exporters overwrite their files. So the G/W/T holds.
>
> Conditions the card leaves out:
> (a) img.txt is written only if at least one object is still visible after crop and pixel priority. Contours are clipped to the final mask (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\segment_manager.py:297-299), and the exporter returns None when none remain (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:35-36). NPZ, by contrast, writes even an all-zero mask (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\npz.py:16). So an old file of a SELECTED format can sit stale next to a fresh img.npz.
> (b) In polygon mode with sequence view, Enter does not save (keyboard_event_manager.py:193-230 has no branch for it).
> (c) If one exporter raises an error, the rest are skipped. The set's iteration order is hash-based, so which files got written can differ between runs.
>
> MISSED DEFECT (must go into the contract): the minimum-one guard also fires when settings are restored at startup.
> - set_selected_formats blocks only the widget's own signals, not each format action's toggled signal (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\export_format_widget.py:36, 54-60, 94-103).
> - At startup the saved list is applied on top of the constructor defaults (main_window.py:85, 239, 1064, then E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\settings_widget.py:174-181).
> - If the saved list contains none of NPZ, NPZ_CLASS_MAP or YOLO_DETECTION, YOLO_DETECTION gets added back. Example: ["COCO_JSON"] is restored as {YOLO_DETECTION, COCO_JSON}.
> - Enter then overwrites img.txt even though the user's saved choice left YOLO Detection off.
> - This uses the same mechanism as the card's "unchecking the last re-checks it". I found it by reading the code, not by running it. No test covers it: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\ui\\widgets\\test_settings_widget.py has no export-format cases.
>
> PARAMETER CORRECTIONS:
> - "Invalid list falls back to defaults" is not true for non-string entries: they are kept, so the fallback never runs (settings_widget.py:176-181).
> - An old-style settings file falls back to ["NPZ"], not the defaults (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:117).
> - Any unknown key in settings.json resets every setting to defaults (settings.py:96-98).
>
> TITLE IS TOO BROAD ("never removes other files"):
> - A save with zero segments deletes all seven formats' files, selected or not (save_export_manager.py:106-109, 523-542; main_window.py:6589-6594; __init__.py:209-215).
> - Auto-save on navigate is on by default (settings.py:45; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:157-160, 271-274).
> - When an annotation file fails to load, the error is only logged (file_manager.py:202-204; file_navigation_manager.py:207-212).
> - So a user who opens an image whose annotation files all fail to load, then moves to the next image, can delete all of them. This destructive path needs its own P0 card.
>
> OTHER:
> - Leave SaveWorker (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:45, which falls back to NPZ only) out of the contract. Nothing ever creates it.
> - Injection check: none of the cited lines contain instruction-like text. The design comments (__init__.py:65-72, 190-197) match what the code actually does.

**Fidelity judge:** P0 yes, faithful yes

> P0 JUSTIFIED: Yes, as a data-integrity rule. It decides which annotation files a save overwrites, and it guarantees that other annotation files, including ground truth shipped with a dataset, are not deleted. Legacy tests lock this in (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:419-452). The default-format list and settings parsing are configuration details and don't need P0 weight on their own.
>
> FAITHFUL: Yes. I traced the Given/When/Then myself for single view and it matches.
> - Keys: Return and Enter both map to save_output (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\hotkeys.py:67-69; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:1014-1015). handle_enter_press first accepts a pending AI preview or polygon, then saves (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\keyboard_event_manager.py:187-234).
> - Save path: save_single_view_output, when segments exist, calls export_all with the widget's selected set (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:97-133; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\settings_widget.py:152).
> - export_all loops over the selected formats, skips unregistered ones, keeps the paths that were written, and never deletes (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:189-206).
> - Files: NPZ writes img.npz with np.savez_compressed (npz.py:15-30). YOLO Detection truncates and rewrites img.txt (yolo_detection.py:35-46). Pascal VOC is not selected, so img.xml is never opened.
> - Deletion: with segments present, no delete call can be reached. The only code that deletes files is delete_all_outputs (__init__.py:209-215) and _delete_multi_view_files (save_export_manager.py:544-561).
> - Settings: the at-least-one guard for menu clicks is correct (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\export_format_widget.py:94-103). Unknown string names are dropped silently. An empty result, or a missing/None key, falls back to the defaults {NPZ, YOLO_DETECTION}, which match settings.py:8-9 and __init__.py:60-63.
>
> AMENDMENTS REQUIRED (missing or overstated edge cases):
> (1) Title too broad. When the image has zero segments, the same save deletes every format's file, selected or not, including foreign ground truth (save_export_manager.py:106-109 and 523-529; multi-view main_window.py:6589-6594). This happens on Enter and also on auto-save when navigating, which is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:156-160 and 270-274). Limit the rule to saves with at least one segment and link it to the delete-all rule.
> (2) "Nothing to write" differs by format. NPZ only skips when there are zero class channels (npz.py:16). So it still writes an all-zero img.npz when every segment lies outside the crop (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:712-734). YOLO Detection, YOLO Segmentation, COCO, VOC and CreateML skip when there are no contours, and NPZ Class Map skips when no pixel is set. When a format skips, its older file stays on disk even though it is now out of date (test_bbox_roundtrip.py:438-452). So "img.txt is written" only holds if at least one non-empty contour exists.
> (3) Legacy defect the card misses (found by reading the code, not by running it). set_selected_formats blocks the button's signals but not the menu items' toggled signals (export_format_widget.py:54-59), so the at-least-one guard also fires while settings load. The widget starts at {NPZ, YOLO_DETECTION} in _setup_ui (main_window.py:229). _load_settings then applies the saved list item by item in enum order (main_window.py:239 and 1064). A saved selection that has none of NPZ, NPZ_CLASS_MAP or YOLO_DETECTION therefore reloads with YOLO_DETECTION switched back on. For example, ["COCO_JSON"] reloads as {YOLO_DETECTION, COCO_JSON}, and pressing Enter then also writes img.txt. The saved value is never rewritten, so this repeats every session. SME question: should the rewrite restore the saved selection exactly (fixing the bug), or reproduce the extra format?
> (4) List entries that are not strings skip validation (settings_widget.py:178). Through the guard they end up as {YOLO_DETECTION}, not the defaults. An entry that is itself a list or dict raises an error. A single non-list value keeps the current selection.
> (5) Saves are not all-or-nothing, and the order is undefined. export_all loops over a Python set of enum members, whose order can change between runs. If one exporter raises an error, the remaining formats are not written, and the caller only shows a notification (save_export_manager.py:131-133).
> (6) In polygon mode with sequence view, Enter does not save at all: keyboard_event_manager.py:193-230 has no branch for sequence view.
>
> Not live: SaveWorker's {NPZ} fallback (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\save_worker.py:45) is dead code, since the class is never created. No instruction-like text appears in the cited lines. The "Writing never deletes" docstring (__init__.py:192-197) matches what the code does.

### RULE-080: Propagation never overwrites reference frames and, by default, frames already labeled

**Compliance judge:** P0 yes, faithful yes

> VERDICT: Faithful = yes. P0 = justified, but on the DATA-INTEGRITY leg only — the compliance/regulatory/financial leg is absent. No regulator, auditor, or finance controller exists for this system: LazyLabel is a local PyQt6 image-annotation desktop tool; nothing here moves money, touches regulated records, or produces audit evidence. Downstream this should be labeled "P0 - data integrity (destructive-write guard)", not "P0 - compliance", so verification effort targets data-loss equivalence tests rather than audit/regulatory evidence.
>
> FAITHFULNESS, clause by clause (all verified against code, absolute paths):
> 1. "Reference frames keep their own annotations" - TRUE. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\propagation_manager.py:744-749 `continue`s before any PropagationResult is built (SAM2-space check against state.reference_frame_indices, declared SAM2-space at propagation_manager.py:85-87), and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4475-4481 returns early for reference frames on the UI/commit side.
> 2. "Skip Labeled on by default" - TRUE. sequence_widget.py:347-348 `setChecked(True)`; the value flows through sequence_widget.py:646-647 -\> main_window.py:4096/4120/4181 -\> _start_propagation. (The `params.get("skip_labeled", False)` fallback at main_window.py:4181 is dead-path only; the key is always written at :4096.)
> 3. "Any non-reference frame with an existing annotation file gets no propagated masks and is shown brown" - TRUE. main_window.py:4218-4231 builds `_skip_labeled_frames` (explicitly excluding references at :4223-4224) via FileManager.find_annotation_file; main_window.py:4466-4473 early-returns before buffering, setting timeline status "skipped", which maps to QColor(139,69,19) = brown (timeline_widget.py:37).
> 4. "Stored status stays 'pending'" - TRUE and a genuinely precise catch: the early return means mark_frame_propagated/record_skipped_object never run, so sequence_view_mode._frame_statuses[idx] remains FrameStatus.PENDING (sequence_view_mode.py:139-141, 196-203) while only the timeline *view* shows "skipped". The rule card correctly separates view status from model status. Corroborated by the repo's own test test_skip_labeled_frames_stay_skipped (tests/integration/test_propagation_flagging.py:440-449).
> 5. Parameter list - TRUE, matches FileManager._LOAD_CHAIN exactly (.npz, _seg.txt, _coco.json, _CM.npz, .xml, _createml.json, .txt) at file_manager.py:128-136; "next to the image" = same directory + same basename stem (file_manager.py:146-151).
>
> WHY THE DATA-INTEGRITY LEG IS REAL (not theoretical): annotations are written to disk automatically, not only on demand. Auto-Save on Navigate defaults to True (settings.py:45, settings_widget.py:43) and main_window.py:3480-3501 writes NPZ for the current sequence frame on navigation; "Save All" writes NPZ for every propagated frame (main_window.py:4741-4819). Because NPZ is first in the load-priority chain (file_manager.py:128-136, 156-163), a machine-generated NPZ written next to an image whose human corrections live in _coco.json/_seg.txt permanently shadows the hand-made labels on every subsequent load. If Skip Labeled silently regressed, the canonical workflow (re-run propagation after fixing flagged frames) would silently overwrite/shadow the user's hand-corrected ground truth — irreversible loss of the user's primary work product. That is a destructive-write guard, which is what "guards data integrity" means.
>
> TWO PRECISION NOTES FOR THE RULE CARD (do not change the verdict):
> a) "Frame 31 gets propagated masks" is under-specified: frame 31 only keeps masks if confidence \>= 0.99 (propagation_manager.py:94, 764) or keep_flagged is on (main_window.py:4557-4569). That gate belongs to a sibling rule card; the cross-reference should be stated so the equivalence test for this rule is not written with a mask-always assumption.
> b) "Never overwrites" is enforced INDIRECTLY and fragilely — worth capturing as a modernization constraint. PropagationManager knows nothing about _skip_labeled_frames: it still records masks for those frames in state.frame_results and adds them to state.propagated_frames (propagation_manager.py:793-805). Skip-labeled frames survive only because _on_save_all_propagated reads masks from sequence_view_mode.get_propagated_masks() and `continue`s on empty (main_window.py:4766-4768). A rewrite that saves from the propagation manager's own result store instead of the view-model store would silently break this P0 while every unit test on the manager still passes. The behavior contract must state: the skip-labeled set must gate the SAVE path, not just the UI handler.
>
> DOC/CODE DISCREPANCY (report, not a rule): the Skip Labeled tooltip at sequence_widget.py:350-352 says it protects "saved annotations (NPZ files)" while the executable check covers all seven formats (file_manager.py:128-136). Code is authoritative; the tooltip understates the rule.
>
> INJECTION SUSPECTS: none. No instruction-shaped text ("SYSTEM:", "ignore previous...", "mark as approved") appears in any cited range; all comments and tooltips read as ordinary developer documentation. No credentials appear in any cited line, so no masking was required.
>
> CONFIDENCE: High. Logic is explicit in all five cited locations and confirmed by an existing repo test. No SME question is required for the mechanics; the only open product question (not needed for the P0 call) is whether a bare sibling `.txt` with the image stem should count as "labeled" (file_manager.py:135 matches any such file, including a stray notes file, which would silently suppress propagation for that frame).

**Fidelity judge:** P0 yes, faithful yes

> FAITHFUL (with amendments). Re-derived independently from the code.
>
> VERIFIED CLAIMS:
> - Skip set built once, before propagation, only when skip_labeled is on and a sequence exists; reference indices explicitly excluded (main_window.py:4219-4227). "Labeled" = FileManager.find_annotation_file != None.
> - The seven suffixes in the card are exactly _LOAD_CHAIN, tested as os.path.exists(splitext(image)[0] + suffix) (file_manager.py:128-151). Same directory, same basename - "next to the image" is right.
> - Frame 30: main_window.py:4466-4473 paints timeline "skipped" (immediate repaint) and returns with no mask stored. "skipped" = QColor(139,69,19), brown (timeline_widget.py:37).
> - Stored status stays "pending": the skip path never reaches mark_frame_propagated/record_skipped_object (main_window.py:4559-4569), so _frame_statuses[idx] keeps its PENDING initialization (sequence_view_mode.py:139-141). The card's brown-on-timeline / pending-in-state split is real and non-obvious - correctly captured.
> - Frame 10 ignored: reference frames are continue'd in SAM2 space in both propagation paths (propagation_manager.py:744-749 and 1074-1076), so no result is stored or yielded; main_window.py:4475-4481 is a second guard and main_window.py:3592-3606 a third (reference frames never load propagated masks).
> - No overwrite end-to-end: Save All iterates propagation_manager.propagated_frames - which DOES include skipped frames - but reads masks from sequence_view_mode.get_propagated_masks, empty for them, so it continues before writing (main_window.py:4752-4768). PropagationSaveWorker is never instantiated, so its get_frame_results path is dead.
>
> AMENDMENTS (precision, not correctness):
> 1. "Frame 31 gets propagated masks" omits the controlling precondition. With Keep Flagged off (default, sequence_widget.py:335) and threshold 0.99, one sub-threshold object discards ALL masks for the frame and flags it red (propagation_manager.py:764-776; main_window.py:4559-4561). Add "provided every object clears 0.99".
> 2. "Gets no masks" is true of committed/displayed/saved state only. SAM2 still computes masks and PropagationManager retains them in state.frame_results and adds the frame to propagated_frames (propagation_manager.py:793-803, 1119-1123). The guarantee rests on TWO gates; a rewrite trusting propagated_frames alone would clobber existing labels. Also main_window.py:4843 counts skipped frames in the post-save "remaining" total.
> 3. "Skip Labeled default True" is the UI default only. The engine default is the opposite: skip_labeled: bool = False (main_window.py:4200) and params.get("skip_labeled", False) (main_window.py:4181). Record both or the service layer inherits the unsafe default.
> 4. Brown is not universal: if all masks for a skipped frame are empty, propagation_manager.py:756-761 drops them without yielding, frame_done never fires, and the frame is never painted brown (labels still preserved).
> 5. Ordering nuance for equivalence tests: the skip check precedes the buffer commit, so a skipped/reference frame does not flush the prior frame's buffer nor advance _propagation_prev_frame; that frame commits on the next non-skipped frame or at _on_propagation_finished (main_window.py:4599-4602). No data loss, but a rewrite flushing on every frame_done changes timeline update order.
> 6. Doc/code discrepancy: tooltip says "(NPZ files)" (sequence_widget.py:351) while code accepts seven formats. The card correctly follows the code, not the tooltip.
> 7. Brown is overloaded: the same "skipped" color serves dimension-mismatch skips, which DO store FrameStatus.SKIPPED (sequence_view_mode.py:119-121, 152-157). Two internal states render identically.
>
> P0 JUSTIFIED: guards data integrity. The failure mode is silent, irreversible overwrite of human-verified annotation files by machine-generated masks - in an annotation tool the labeled dataset is the asset, and undo history is frame-scoped and cleared on navigation (main_window.py:3588-3589), so there is no recovery. The reference-frame half is an unconditional invariant enforced at three independent points; the skip-labeled half is a user opt-out. Consider splitting the card, since only the first half is an invariant the rewrite must hold unconditionally.
>
> No injection-shaped text in the cited files; grep for SYSTEM:, "ignore previous", "false positive", "approved" across legacy/lazylabel/src returned nothing.

### RULE-080: Skip Labeled protects frames that already have annotations (folded card)

**Compliance judge:** P0 yes, faithful yes

> VERDICT: P0 is justified on the data-integrity prong only. The code moves no money and enforces no regulation. The rule is faithful to the code, with precision caveats the behavior contract should carry.
>
> WHY P0: Propagation writes nothing to disk itself. The only live write path is the one-click 'Save All' (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4741-4825). It exports every frame that holds session masks through export_all, in every enabled format (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:117-122), with no per-frame confirmation. Skip Labeled is the only thing keeping hand-made labels out of that bulk write. Without it, frame 30 would either have img_030.xml overwritten (if Pascal VOC export is on) or get a new img_030.npz. The load chain reads .npz before .xml (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136), so the human labels would be hidden behind model output. This has already broken once: CHANGELOG.md:20 records that skip-labeled overwrote hand-made bbox labels when only .npz was checked, and tests/unit/core/exporters/test_bbox_roundtrip.py:816-839 now guards against it. A dataset auditor tracking human ground truth vs AI output would care if this changed silently.
>
> FAITHFULNESS (verified in code):
> - The checkbox defaults to True (sequence_widget.py:348) and its value is read and emitted at :646-647. The keyboard shortcut clicks the same button (main_window.py:4716).
> - The skip set covers all frames, excludes reference frames, and counts a frame as labeled if any of 7 annotation file types exists (main_window.py:4218-4231; file_manager.py:138-151).
> - Both sides use timeline frame indices (propagation_manager.py:736, 1079).
> - For a skipped frame, the handler returns before buffering. mark_frame_propagated never runs, get_propagated_masks returns None, and Save All skips the frame (main_window.py:4766-4768).
> - The timeline is set to 'skipped' at main_window.py:4468-4471.
> - The propagation engine does not know about the flag, so the model still processes the frame for continuity.
>
> CAVEATS for the contract:
> (1) 'No masks stored' is true only for the store that feeds the display and Save All. PropagationManager still records the frame in state.frame_results and propagated_frames (propagation_manager.py:793-803, 1119-1123), so 'Propagation complete: N frames' and 'Saving N frames...' overcount. The one class that saves from that state, PropagationSaveWorker (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\propagation_worker.py:295-370), is never instantiated. A rewrite that revives it would bypass the rule. Tests should check disk and the display store, not the engine's cache.
> (2) 'Shows skipped' only happens if SAM2 yields a non-empty result for the frame. Empty masks are dropped without a yield (propagation_manager.py:756-761, 1092-1093), so the status stays blank after the reset at main_window.py:4243. SequenceViewMode's own frame status stays PENDING.
> (3) The skip set is taken once at start and only checks that a file exists. A stray \<base\>.txt or an empty or corrupt sidecar counts as labeled, and frames saved during the run are not protected.
> (4) The Python-level fallbacks default to False (main_window.py:4017, 4181, 4200). True is only the UI checkbox default, and I found no code that saves the checkbox state.
> (5) DISCREPANCY: the tooltip at sequence_widget.py:349-353 says '(NPZ files)', but the code checks all 7 formats. The rewrite must follow the code, not the tooltip, or it brings back the data-loss bug in CHANGELOG.md:20.
>
> No instruction-shaped or injection text and no credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful no

> P0 is justified, but the Given/When/Then is only partly faithful and needs rewriting before it becomes a contract.
>
> WHY P0 HOLDS: The guard is on by default. Without it, frame 30's model masks would be stored for review. Then Save All (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4764-4813) exports them in every enabled format (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:117-122). That creates img_030.npz, which is loaded before .xml (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136), or rewrites the .xml. Either way, human labels get replaced in bulk. That is a data-integrity guard.
>
> WHAT MATCHES: When propagation starts, the code builds a set of non-reference frames that have a file on disk with any of 7 annotation suffixes (main_window.py:4218-4227, file_manager.py:146-151). So img_030.xml does count. When a result arrives for a frame in that set, the handler paints the timeline "skipped" and returns before buffering (4466-4473). Nothing is committed to the view's mask or confidence store. The model is never told about the setting, so it still runs through the frame. The UI checkbox defaults to True (sequence_widget.py:348), and both the button and the shortcut read it (sequence_widget.py:306, 646).
>
> WHAT DOES NOT MATCH:
> 1. "No masks stored" is wrong at the manager level. PropagationManager still saves frame 30's masks in state.frame_results and adds the frame to propagated_frames, and to flagged_frames if confidence is low (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\propagation_manager.py:793-805, 1119-1125). Visible effects: the "Propagation complete: N frames" message (main_window.py:4623-4633) and the "Saving N frames..." message (4761) count skipped frames. Save All only leaves frame 30 alone because the view store has no masks for it (4766-4768), and those lines are not cited. The unused PropagationSaveWorker reads the manager's stored results (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\propagation_worker.py:339-354), so it would bypass the guard if anyone reconnected it.
> 2. "When propagation reaches frame 30" is imprecise. The labeled-frame set is built once at start. A file created during the run is ignored, and a file deleted during the run still causes a skip.
> 3. "Timeline shows skipped" only happens if the model returns at least one result for that frame. Frames where every mask is empty get no result at all (propagation_manager.py:756-761, 1092-1093). Those frames stay with no status after the reset at main_window.py:4243. They are also never reached if outside the propagation range. And "skipped" exists only on the timeline: the view still says pending (sequence_view_mode.py:152-159), so a full timeline refresh (main_window.py:3470-3472, 5269-5271) turns it back to pending.
> 4. "img_030.xml untouched" proves nothing. Propagation never writes files for any frame, with the setting on or off, so this Then passes even if the guard is removed. The real protection shows up at Save All and when the frame's labels are loaded (3597-3606).
> 5. Only file existence is checked. An empty or unrelated img_030.txt makes the frame count as labeled. The tooltip says NPZ only (sequence_widget.py:350-352), but the code checks all 7 formats.
> 6. The code-level defaults are False (main_window.py:4017, 4181, 4200). "Default True" applies only to runs started from the UI.
>
> SUGGESTED GIVEN/WHEN/THEN: Given Skip Labeled is checked, and non-reference frame 30 is inside the range and has img_030.xml on disk when Propagate is clicked. When propagation returns at least one result for frame 30, then Save All is clicked without leaving the frame. Then frame 30 has no stored masks or confidence in the view, the timeline shows it as skipped, img_030.xml is byte-identical, and no img_030.npz or other annotation file is created. Add a control case: with Skip Labeled off, Save All does write frame 30's files. Leaving a frame triggers an unrelated auto-save (main_window.py:3424-3427, 3480-3519) that re-exports that frame's labels anyway.
>
> No instruction-like text was found in the cited lines.

### RULE-081: Save All propagated frames eligibility

**Compliance judge:** P0 yes, faithful yes

> P0 JUSTIFIED (data integrity only; no money or regulatory obligation). LazyLabel is an annotation tool, so no regulator or finance controller is involved. But Save All is the one unattended bulk write of unreviewed SAM2 output into the user's label files. Two checks protect the dataset: excluding engine-flagged (low-confidence) frames (legacy/lazylabel/src/lazylabel/ui/main_window.py:4749-4756) and requiring stored masks (4766-4768). The masks check also stops skip-labeled frames (4463-4473, masks never stored) from being written over or emptied; an empty segment set would reach delete_all_outputs (ui/managers/save_export_manager.py:107-109). The save cannot be undone: it marks frames SAVED and drops their in-memory masks (ui/modes/sequence_view_mode.py:365-373). A dataset-quality auditor would care if this changed silently.
>
> FAITHFUL: every assertion checks out against the code.
> - Eligibility is engine propagated_frames minus engine flagged_frames (propagation_manager.py:169-177), then masks present. Frame 5 with no masks hits `continue`.
> - In sequence mode view_mode is 'sequence' (main_window.py:3059), so save_output goes to save_single_view_output. That writes all selected formats using current_crop_coords (save_export_manager.py:92-122, 413-417).
> - mark_frame_saved sets SAVED and deletes the frame's masks.
> - The notification is f'Saved {saved} frames to NPZ', which gives 'Saved 1 frames to NPZ' (4846).
> - A missing reference annotation gives class_id 0 and alias 'Class 0' (4791-4799). SegmentManager.clear() resets aliases for each frame (core/segment_manager.py:23).
>
> GAPS TO ADD BEFORE THIS BECOMES THE CONTRACT:
> (1) Frames are marked SAVED, their masks deleted and the saved count increased even when the write fails. save_single_view_output catches every exception itself (save_export_manager.py:131-133), so the outer except at main_window.py:4822 never fires for export errors (e.g. ValueError on an empty pixmap at save_export_manager.py:398-399, disk or permission errors). The masks are then lost and the count is too high. The Then clause only holds when the write succeeds; add a failure scenario.
> (2) If every mask on a frame fails the 2D check, the segment set is empty. The save then deletes all of that image's existing annotation files, yet the frame is still marked SAVED and counted. Separately, the loop `while mask.ndim \> 2: mask = mask.squeeze()` (4781-4782) never ends for a mask shaped like (2,H,W).
> (3) The class-0 fallback looks like a defect, not policy. The on-screen loader falls back to the cached object-to-class map (main_window.py:3710-3724; sequence_view_mode.py:375-386); Save All does not. 'Clear all reference frames' (main_window.py:3982-4009 -\> propagation_manager.py:366-370) removes reference annotations but keeps propagated frames and masks. Save All after that writes every object as class 0 while the screen shows the right classes. SME question: should Save All use get_obj_class, or refuse to save when the class is unknown?
> (4) 'Frame 4 flagged' must mean flagged in the engine, not the timeline status the user sees. 'Clear all timeline flags' (main_window.py:3457-3478) resets only the timeline statuses. A threshold change re-flags frames in the engine (propagation_manager.py:1254-1268) but not on the timeline (sequence_view_mode.py:539-541), so the timeline can show a frame as flagged that Save All will write. By default, objects that fail the threshold are never stored, so a later threshold change can un-flag their frame in the engine; only the masks check then stops it being saved.
> (5) Minor: a frame also needs an image path (4771-4773). The remaining count reads the engine's propagated frames, which saving never reduces (4843-4844).
>
> No instruction-like text or credentials in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> Verdict: the card is faithful for the case it describes, and P0 is justified. It needs three additions before it can serve as the contract the rewrite must match.
>
> Paths: MW = E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py; SVM = E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\modes\\sequence_view_mode.py; SEM = E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py; PM = E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\propagation_manager.py
>
> What the code does, checked independently:
> - Which frames qualify: the engine's propagated set minus the engine's flagged set (MW:4751-4756).
> - Frames are handled in ascending order (MW:4764). A frame with no stored masks (None or empty) is skipped (MW:4766-4768).
> - In the card's case the list is [3,5]. A brief "Saving 2 frames..." message appears. Frame 3 is saved, frame 5 is skipped, and frame 4 is never listed.
> - The final message is exactly "Saved 1 frames to NPZ" (MW:4846). It says NPZ whatever formats are selected.
> - The save uses the normal single-view path, because view_mode is "sequence" (MW:3059; SEM:92-95). It writes every selected format (SEM:118-122) and applies the current crop (SEM:413-417).
> - After the save call, the frame is marked SAVED and its in-memory masks are deleted (SVM:365-373).
> - An object with no reference annotation gets class 0 and the name "Class 0" (MW:4791-4796).
> - Masks arrive already reduced to 0/1 (models\\sam2_model.py:1033), so the bool conversion adds no rounding.
>
> Gaps the card must add:
> 1. A frame is marked SAVED even when its write fails. The inner save catches every export error, shows "Error saving: ...", and returns normally (SEM:111-133). Save All then marks the frame SAVED anyway (MW:4814), deletes the only in-memory copy of its masks, and counts it in "Saved N frames". The outer error handler (MW:4822-4823) never sees write errors. Also, if every mask for a frame fails the 2-D check (MW:4783-4784), no segments remain. The save then deletes that image's existing outputs (SEM:107-109), and the frame is still marked SAVED. An SME must decide whether to keep or fix this.
> 2. "Flagged" means the engine's flagged set, not the FLAGGED status shown on the timeline, and the two can drift apart:
>    - Changing the confidence threshold rebuilds only the engine's flags (PM:1254-1268). The view's setter does not re-check statuses (SVM:539-541).
>    - With "Keep Flagged Masks" on, lowering the threshold makes Save All write frames the timeline still shows as flagged. Raising it silently skips frames shown as propagated.
>    - After a trim or a new timeline, the engine's sets are emptied (MW:5253, MW:4978; PM:300-309). Save All then reports "No propagated frames to save" while masks are still on screen.
>    - With Keep Flagged off, a threshold change also clears the engine flag on frames whose failing object was never recorded (PM:1098-1101). Only the "masks present" check keeps those frames from being saved, which is exactly the card's frame 5.
> 3. The class name is set by the first object of that class in each frame (MW:4798-4799, after the per-frame reset at MW:4776). If an earlier object in the same frame registered class 0 under another name, the unreferenced object keeps that name instead of "Class 0".
>
> Smaller points outside the card:
> - Saved frames stay in the engine's propagated set, so the count at MW:4843 does not go down.
> - The frame on screen is cleared and reloaded from disk (MW:4835-4839), which drops any unsaved edits on it.
> - A mask with more than one layer (N\>1,H,W) would make MW:4781-4782 loop forever.
> - The cited lines contain no text that tries to instruct an AI, and no credentials.
>
> Why P0 holds: this rule decides which AI-generated annotations are written to disk. The NPZ writer replaces the existing \<image\>.npz with no existence check (core\\exporters\\npz.py:19-26). The rule keeps low-confidence frames out of the dataset and destroys the in-memory masks after saving. That is data integrity.

### RULE-081: Save All writes propagated frames except those the engine currently flags (folded card)

**Compliance judge:** P0 no, faithful yes

> FAITHFUL (true): the Given/When/Then matches the code for the scenario described. main_window.py:4751-4756 filters propagated_frames by flagged_frames (frame 13 excluded); 4766-4768 skips frames with no in-memory masks, and sequence_view_mode.py:365-373 (mark_frame_saved) deletes _propagated_masks on save, so an already-auto-saved frame 14 is skipped exactly as claimed; 4788-4799 takes class from get_reference_annotation_for_obj (propagation_manager.py:1167-1181) with fallback class_id 0 / "Class 0"; _save_output_to_npz (main_window.py:1993-1998) delegates to save_export_manager.save_output -\> save_single_view_output (97-133), which exports every format in settings["export_formats"] via export_all; 4814-4818 marks SAVED and sets the timeline chip "saved", which is cyan QColor(0,188,212) at ui/widgets/timeline_widget.py:36; 4827-4839 invalidates the preload cache and reloads the current frame from disk; 4846 emits "Saved 2 frames to NPZ" for saved==2.
>
> NOT P0 (false): LazyLabel is a desktop image-segmentation annotation tool. Save All writes ML training masks (NPZ/TXT/YOLO) into a user-chosen folder. It moves no money, discharges no statutory or contractual obligation, and touches no audited or regulated record. The "integrity" at stake is dataset label quality (keeping low-confidence frames out of an export), which is product correctness, not a controlled-record integrity guard. No regulator, auditor, or finance controller has standing in this behavior; a silent change degrades a model, it does not create exposure. Recommend P1.
>
> GAPS the parent should record before this card ships (none of which break faithfulness, but all of which weaken it as a contract):
> 1. Parameters listed as "(none)" is wrong. The flagged set that drives the exclusion is recomputed in propagation_manager.py:1254-1273 against confidence_threshold, hardcoded default 0.99 (propagation_manager.py:94 and :283; mirrored at sequence_view_mode.py:90 and :727) and clamped to [0.0, 1.0] at :1260. That 0.99 is exactly the kind of magic number that must become configuration.
> 2. Failure path omitted, and it is the real risk here: save_single_view_output swallows its own exceptions (save_export_manager.py:131-133), so the outer try/except at main_window.py:4812-4823 rarely fires. A frame whose export failed is still passed to mark_frame_saved, which deletes the only in-memory copy of its masks (sequence_view_mode.py:370-372), still turns cyan, and is still counted in "Saved N frames". That is silent data loss, and it should be logged as a defect rather than encoded as a rule.
> 3. Destructive branch omitted: if every mask for a frame fails the 2-D check at main_window.py:4781-4784, the segment list is empty and save_single_view_output DELETES the existing annotation files for that image (save_export_manager.py:106-109) instead of writing. This is the only genuinely integrity-relevant behavior in the cited area and the card does not mention it.
> 4. Citation propagation_manager.py:300-309 is cleanup(); it plays no role in Save All and should be dropped from the evidence list.
> 5. Cosmetic mismatch: the toast says "to NPZ" regardless of which formats were actually written.
>
> SECURITY: no prompt-injection or instruction-shaped text in any cited range. Grep hits for "instructions" under src/lazylabel/ui/ are ordinary UI label variables (e.g. hotkey_dialog.py:169-176, sequence_widget.py:142-152). No credentials appear in these files, so nothing required masking.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: PASS (with contract gaps to close). I re-derived the scenario from the code without relying on the rule text.
>
> Re-derivation for propagated {11,12,13,14}, flagged {13}, frame 14 already visited/auto-saved:
> 1. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4751-4756 builds the work list as propagated_frames minus flagged_frames -\> [11,12,14]; 13 excluded. Both sets are plain set[int] on PropagationState (propagation_manager.py:89-90, properties at :170-177), and flags are recomputed per-object against state.confidence_threshold (default 0.99) at propagation_manager.py:1254-1273 - so "currently flagged" is threshold-derived and can change between clicks. Correct.
> 2. main_window.py:4764 iterates sorted() -\> ascending frame order. Correct.
> 3. main_window.py:4766-4768 skips any frame whose in-memory propagated masks are gone. mark_frame_saved deletes them (sequence_view_mode.py:365-373), and the auto-save-on-navigate path calls mark_frame_saved (main_window.py:3513). So frame 14 is skipped and never counted. Correct.
> 4. main_window.py:4788-4796 takes class_id/class_name from get_reference_annotation_for_obj (propagation_manager.py:1167-1181) else 0 / "Class 0". The rule is right to stop there: the Save All path, unlike the interactive load path (main_window.py:3713-3724), does NOT fall back to sequence_view_mode.get_obj_class(), so objects whose reference annotation is gone silently export as class 0. Faithfully captured.
> 5. _save_output_to_npz -\> save_output -\> save_single_view_output -\> export_all(settings["export_formats"], ctx) (main_window.py:1993-1998; save_export_manager.py:97-122; exporters/__init__.py:189-206) = every selected format. Correct.
> 6. mark_frame_saved sets FrameStatus.SAVED and timeline set_frame_status(idx,"saved",immediate=True); "saved" is QColor(0,188,212) = cyan (timeline_widget.py:36). Correct.
> 7. saved counter = 2 -\> "Saved 2 frames to NPZ" (main_window.py:4819, 4846). Correct. (Minor: an earlier banner says "Saving 3 frames..." at :4761, counting frame 14 that is then skipped, and each frame also raises its own "Saved: \<names\>" toast.)
> 8. Cache entries for the listed frames are purged and the current frame is re-loaded (:4827-4839). "Reloaded from disk" holds for the scenario but is over-general: _load_sequence_frame_segments (:3591-3615) prefers still-resident propagated masks, then the preload cache, then NPZ - so if the current frame is the flagged frame 13, it reloads from memory, not disk.
>
> Edge cases the card must gain before it is used as a P0 equivalence contract (none contradict the scenario, but all are in the same code path):
> a) Write success is never checked. save_single_view_output swallows all exceptions internally (save_export_manager.py:131-133), so the try/except at main_window.py:4812-4825 almost never fires: a failed export still increments saved, still calls mark_frame_saved, and that deletes the only in-memory copy of the masks. "Then ... are written ... and turn saved" should read "are marked saved whether or not the write succeeded".
> b) Destructive branch: if a frame's segments end up empty (e.g. every mask fails the 2D check at main_window.py:4781-4784), save_single_view_output takes the no-segments branch and DELETES the image's existing annotation files (save_export_manager.py:107-109) - while the frame is still counted, marked saved and its masks cleared. Data loss inside a "save" action.
> c) Save All never calls segment_manager.merge_segments_by_class(), which the visit/auto-save path does (main_window.py:3603). The same frame therefore exports one instance per object ID via Save All and class-merged instances via navigate-and-autosave - two different files for the same data.
> d) The export context is built from the CURRENTLY DISPLAYED viewer pixmap (save_export_manager.py:394-399, viewer = mw.active_viewer -\> sequence_viewer) and the CURRENT crop coords (:412-417), not each saved frame's own image/crop. Benign only because dimension-mismatched frames are pre-filtered to SKIPPED; a rewrite must reproduce or deliberately fix this.
> e) The post-save count at main_window.py:4842-4844 reads propagation_manager.propagated_frames, which the loop never mutates, so the propagated counter does not drop after Save All.
>
> P0 JUSTIFIED: yes - data integrity, not money/regulation. This is the bulk persistence path for the dataset's primary artifact: it decides which AI-propagated labels become on-disk ground truth, enforces the exclusion of low-confidence flagged frames from that ground truth, destroys the only in-memory copy once marked saved (sequence_view_mode.py:370-372), and contains a file-deletion branch. Equivalence must be proven for it.
>
> Cited propagation_manager.py:300-309 (cleanup) is not load-bearing for this rule - it resets PropagationState wholesale, which would empty propagated_frames and make Save All exit at main_window.py:4757-4759; keep it only as context for "why the class fallback to Class 0 fires".
>
> INJECTION: none. No "SYSTEM:", "ignore previous instructions", approval-claiming or finding-suppressing text in any cited or traversed line. The prose docstring at legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:190-197 ("Writing never deletes...") is domain explanation, not an instruction to the analyzer - but note it is contradicted by the caller: save_export_manager.py:107-109 does delete outputs when the segment list is empty, so the comment must not be trusted as the rule. No credentials appeared in any evidence line.
>
> Files read: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\propagation_manager.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\modes\\sequence_view_mode.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\widgets\\timeline_widget.py; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py

### RULE-081: Save All writes propagated, non-flagged frames (folded card)

**Compliance judge:** P0 yes, faithful yes

> VERDICT: faithful, and P0 holds — but only on the data-integrity prong, not the regulatory/money prong.
>
> FAITHFULNESS (verified clause by clause against E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4741-4846):
> - "not flagged" — main_window.py:4749-4756 filters propagation_manager.flagged_frames. True.
> - "still holds propagated masks" — 4766-4768. True (rule omits the second guard at 4771-4773: a frame with no resolvable image path is also skipped).
> - "in the selected export formats" — true despite the method name: 4813 _save_output_to_npz -\> save_export_manager.py:86-122 -\> export_all(settings["export_formats"], ctx). Sequence mode takes the single-view branch (view_mode == "sequence", set at main_window.py:3059).
> - "marks it saved, then reloads current frame" — 4814, 4834-4839. True.
> - Parameters (class fallback) — 4788-4796. True.
> - The GWT scenario is reproducible: Save All never reads the live segment_manager; it clears it at 4776 and repopulates from sequence_view_mode._propagated_masks. Auto-save fires only on frame navigation (3424-3427), so an edit made "without leaving the frame" exists nowhere but the segment_manager and is discarded. mark_frame_saved then deletes the in-memory masks (modes\\sequence_view_mode.py:365-373), so the reload at 4839 falls through to the NPZ just written from the UNCORRECTED masks, and _load_sequence_frame_segments clears undo history (3588-3589) — the correction is unrecoverable. Frames 21,22,24,25 saved / 23 skipped is correct.
>
> P0: Not money. Not regulatory — LazyLabel is a desktop annotation tool; no audit trail, retention, or attestation requirement exists in code. A regulator or finance controller has no stake here, so downstream teams should NOT build compliance evidence for it. It survives P0 on integrity alone: a bulk, silent, irreversible overwrite of the ground-truth dataset where a behavior change ships corrupted labels with no user-visible error.
>
> DEFECTS TO FIX IN THE CARD (not falsifications):
> 1. Citation error: the second range, main_window.py:3982-4009, is _on_clear_sequence_references (clearing reference frames) and is unrelated to Save All. Replace with main_window.py:4776, 4814; modes\\sequence_view_mode.py:365-373; managers\\save_export_manager.py:97-122.
> 2. "Flagged" is ambiguous: exclusion reads propagation_manager.flagged_frames, which the timeline's "Clear Flags" button (main_window.py:3457-3472) does not reset — cleared-looking frames stay unsaved.
> 3. Class fallback diverges from display: Save All (4794-4796) does not consult sequence_view_mode.get_obj_class(), which the display path does (3710-3724) — the same object can render as its real class yet persist as class 0.
> 4. Add as a sibling P0 risk: mark_frame_saved is unconditional on bytes written. export_all with an empty format set returns [] without raising (core\\exporters\\__init__.py:189-206), so every propagated frame is marked SAVED and its masks deleted with nothing on disk.
>
> INJECTION: none. No instruction-shaped text in the cited lines; comments at 4749-4750 and 3591-3592 are ordinary explanatory comments. No credentials in these paths.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: PASS (with one bad citation and uncovered edge cases).
>
> Re-derived from E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:4741-4846 and its collaborators; every clause of the Given/When/Then checks out:
> 1) Frame selection — main_window.py:4751-4756 builds the work list as propagation_manager.propagated_frames minus propagation_manager.flagged_frames. Both sets can hold the same index (propagation_manager.py:803-805, 1123-1125 add to both when a result is below threshold), so the exclusion is real, not a no-op: frames 21, 22, 24, 25 are saved and flagged frame 23 is skipped. Verified that every flag is confidence-derived (only caller of flag_frame is main_window.py:4591; set_confidence_threshold at propagation_manager.py:1260-1268 rebuilds flagged_frames), so "not flagged" is unambiguous.
> 2) Ordering — iteration is sorted(propagated_frames) ascending (main_window.py:4764), matching the card's 21, 22, 24, 25.
> 3) Source of truth — masks come from sequence_view_mode.get_propagated_masks(frame_idx) (4766), and segment_manager.clear() at 4776 discards the user's in-memory edits before rebuilding from the propagated dict. The card's "written from the original propagated masks" is exact.
> 4) The strongest claim — "frame 22's manual correction is overwritten and lost" — is true, and the "without leaving the frame" qualifier is load-bearing and correctly stated. Display masks are copies, not aliases: _load_propagated_masks_for_frame (3700-3708) does np.asarray/squeeze/astype(bool), and astype copies by default, so erasing in segment_manager cannot mutate _propagated_masks. Grep confirms nothing writes edits back into _propagated_masks (only mark_frame_propagated at sequence_view_mode.py:290-305, clear_propagated_mask 393-402, mark_frame_saved 365-373). Edits reach disk only via _auto_save_sequence_frame (3480-3519), which fires on navigation (3424-3427) — so staying on the frame leaves the correction unpersisted. After Save All writes the original mask, mark_frame_saved (4814) deletes _propagated_masks[22], the preload cache entry is dropped (4828-4832), and the current frame reloads from the just-overwritten file (4834-4839): the erase is gone from disk, memory, and screen.
> 5) Parameters — the class fallback "reference annotation's class, else class 0 / 'Class 0'" is exactly the save path (4788-4796). Worth noting it deliberately matches Save All and not the display path, which has a third tier (sequence_view_mode.get_obj_class, main_window.py:3721-3724); after a propagation trim/cleanup, Save All can therefore write objects as class 0 that were displayed with their real class. "Selected export formats" is also correct and better than the code's own wording — save_output routes through settings["export_formats"] and export_all (save_export_manager.py:112-122), while the method name and notifications at 4742/4846 still say "NPZ".
>
> DEFECTS IN THE CARD, none of which make the assertion wrong:
> - The second citation, main_window.py:3982-4009, is _on_clear_sequence_references (clearing reference frames) and has nothing to do with Save All. It should be replaced with the lines that actually support the data-loss clause: main_window.py:3685-3740 (copy semantics), 3480-3519 and 3424-3427 (auto-save only on navigation), and sequence_view_mode.py:365-373 (mark_frame_saved deletes the masks).
> - Edge cases a P0 contract should pin down but the card omits: (a) _save_output_to_npz swallows its own exceptions (save_export_manager.py:131-133), so a failed export never reaches the except at 4822 — the frame is still marked saved at 4814 and its only in-memory copy deleted, silent data loss; (b) if every mask for a frame fails the 2D check (4781-4784) the segment list is empty and save_single_view_output DELETES the existing annotation files (save_export_manager.py:106-109) while still marking the frame saved; (c) frames with no masks or no image path are skipped silently (4767-4773) yet remain "propagated"; (d) the remaining count at 4842-4844 reads propagation_manager.propagated_frames, which Save All never updates, so the counter does not decrease.
>
> P0 JUSTIFIED: yes, on data-integrity grounds. Annotations are this system's product. Save All silently replaces human-corrected labels with machine-generated masks, deletes the only in-memory copy, and — via the swallowed-exception and empty-segment paths — can delete annotation files outright with no error surfaced. Any rewrite must prove equivalence here or it will destroy labeled data.
>
> INJECTION: none. I read both cited ranges in full and grepped main_window.py for instruction-shaped text ("SYSTEM:", "ignore previous", "false positive", "approved") — no matches. The comment at 4749-4750 asserting flagged frames must not be saved is corroborated by the executable filter at 4751-4756. No credentials appear in any evidence line.

### RULE-082: Saving an image with no segments deletes all of its annotation files

**Compliance judge:** P0 yes, faithful yes

> FAITHFUL: verified every claim against source. save_export_manager.py:107-109 short-circuits to _delete_associated_files on zero segments before any write. exporters/__init__.py:209-215 confirms delete_all_outputs iterates EXPORTERS.values() (all seven) and ignores the selected-format set, while export_all:199-205 writes only selected formats and never deletes — the asymmetry the card centers on is real. All seven suffixes match exactly (npz.py:30, npz_class_map.py:47, yolo_detection.py:46, yolo_segmentation.py:56, coco.py:100, pascal_voc.py:63, createml.py:67). Triggers confirmed at keyboard_event_manager.py:205,230,234 and file_navigation_manager.py:157-160,272-274 with auto_save defaulting True (settings.py:45). Defaults NPZ+YOLO_DETECTION confirmed at settings.py:8-9; min-one-format at export_format_widget.py:94-103. The cat_coco.json example is correct and is the load-bearing detail: an unselected format is deleted.
>
> P0 JUSTIFIED — on the data-integrity prong ONLY. Under a strict compliance reading the answer is no: this is a single-user desktop annotation tool, no money moves, no regulator/auditor/finance controller exists in this domain, no retention or audit requirement is enforced. The rating does not survive on the money or regulation prongs and should not be defended on them. It does survive on integrity: this is irreversible destruction of user-authored data, in formats the user never selected and which may be pre-existing ground truth, triggered implicitly by Enter or by merely navigating to the next image, with no confirmation and no undo. Both directions of rewrite divergence silently corrupt a dataset — delete too little and stale labels survive for the loader's priority chain to read back; delete too much and ground truth is gone. That is exactly the class of behavior a rewrite must prove equivalent against.
>
> TWO GAPS for the contract (scope omissions, not inaccuracies): (1) the multi-view path at save_export_manager.py:553-561 deletes an EIGHTH file, the class-aliases \<base\>.json, which single-view does not — the card cites only the single-view path, so the contract is incomplete on that edge. (2) exporters/__init__.py:190-197 docstring asserts "Writing never deletes... files already sitting next to the image are left alone — they may be... ground truth that shipped with the dataset." True of export_all in isolation, false of the save flow as a whole per line 107-109. Flag as doc/code discrepancy; the executable code, not the prose, defines the rule.
>
> INJECTION SUSPECTS: none. The only phrase that pattern-matched, npz_class_map.py:32 "Third-party readers can ignore this key," is a genuine note about NPZ consumers, not a directive to an analyzer. No credential values appear in this rule's parameters; nothing required masking.

**Fidelity judge:** P0 yes, faithful yes

> FIDELITY: PASS with refinements. Re-derived independently. Trigger chain confirmed: Enter -\> keyboard_event_manager.py:187-234 (every branch ends in _save_output_to_npz) -\> main_window.py:1993-1998 -\> save_export_manager.save_output() :86-95 -\> save_single_view_output :97-133; auto-save on navigation hits the same entry at file_navigation_manager.py:157-160 and :271-274, before current_image_path is reassigned, so it acts on the image being left (auto_save defaults True, config/settings.py:45). Zero-segment branch at save_export_manager.py:107-109 -\> _delete_associated_files :523-542 -\> delete_all_outputs (exporters/__init__.py:209-215), which iterates ALL registered exporters, not the selected ones, each doing exists+remove (npz.py:32-37). So with formats = NPZ + YOLO Detection and 0 segments, cat.npz, cat.txt AND cat_coco.json are all deleted and listed in the "Deleted: ..." notice (:536-538) - exactly as specified. With 2 segments, export_all (exporters/__init__.py:189-206) writes only the selected formats and never deletes, leaving cat_coco.json untouched - also exact. Parameters verified character-for-character: .npz (npz.py:30), _CM.npz (npz_class_map.py:47), .txt (yolo_detection.py:46), _seg.txt (yolo_segmentation.py:56), _coco.json (coco.py:100), .xml (pascal_voc.py:63), _createml.json (createml.py:67); exactly 7 ExportFormat members (exporters/__init__.py:14-23); defaults NPZ + YOLO_DETECTION (exporters/__init__.py:60-63, settings.py:8-9); at-least-one-format guard re-checks the sender at export_format_widget.py:94-103 and empty persisted settings fall back to defaults (settings_widget.py:166-183). Four refinements the card should absorb, none of which contradict it: (1) "each selected format is written" is not unconditional - exporters return None and skip when they yield no annotations (yolo_detection.py:35-36, coco.py:84-85, npz.py:16-17), so a stale file of a SELECTED format can survive a save that had segments; (2) in multi-view the same Enter key deletes an eighth file, the base .json class-aliases file (save_export_manager.py:551-561; main_window.py:6564-6592 confirms identical delete-all-per-viewer semantics), so the seven-suffix parameter list is single-view-only; (3) with 0 segments and nothing on disk the user sees "No segments to save." rather than a deletion notice (save_export_manager.py:542); (4) deletion order follows EXPORTERS insertion/import order (exporters/__init__.py:224-230), so the notice reads "cat_coco.json, cat.npz, cat.txt", not the order the example implies - relevant only if an equivalence test asserts exact notice text. P0 JUSTIFIED (data integrity): this is unrecoverable deletion of user annotation files, fired implicitly by navigation with auto-save on by default, and it deletes outputs for formats the user never selected - including files that may be dataset ground truth, a hazard the export_all docstring itself acknowledges (exporters/__init__.py:190-197). The risk compounds with file_navigation_manager.py:202-212, which swallows annotation-load exceptions and continues: a damaged annotation file leaves 0 segments in memory, and the next navigation then deletes every annotation file for that image. Any rewrite must prove this exact destructive behavior (or a deliberate, documented change to it). INJECTION SCAN: clean - grepped the exporters package and all three cited UI files for SYSTEM:/ignore previous/false positive/approved/assistant: patterns, zero hits; the policy prose in the export_all docstring is corroborated by the executable code beneath it.

### RULE-082: Saving an image with zero segments deletes all of its annotation files (folded card)

**Compliance judge:** P0 yes, faithful yes

> P0 JUSTIFIED, on data-integrity grounds only. Nothing here moves money or enforces a regulation, so a finance controller would not care, but someone auditing where an ML dataset's labels came from would. This is the only code path that deletes annotation files. It deletes them permanently (os.remove, no confirmation), runs on its own during navigation, and removes all 7 formats, not just the ones the user selected. A quiet change either way damages the dataset: (a) if the rewrite stops deleting, a label file the user cleared stays on disk, FileManager.find_annotation_file (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:139-151) still reports the image as labelled, and the loader brings the cleared labels back; (b) if it deletes only the selected formats, a leftover lower-priority file such as .txt is loaded next time; (c) if it deletes more (for example the \<base\>.json class-name file), that data is lost for good. A test locks in the all-formats deletion as intended: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_bbox_roundtrip.py:454-470.
>
> FAITHFUL, with gaps the card should fix. Verified in code: the empty-segment condition (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:107-109; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6589-6594). delete_all_outputs goes through every registered exporter regardless of the export_formats setting (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:209-215). All 7 suffixes match the exporters (npz.py:30, npz_class_map.py:47, yolo_detection.py:46, yolo_segmentation.py:56, coco.py:100, pascal_voc.py:63, createml.py:67). Each delete_output only checks that the file exists and removes it, with no check on who created it. Triggers: Enter (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\keyboard_event_manager.py:187-234); single-view navigation when auto_save is on (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:156-160, 270-274; on by default at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45); sequence frame change, also gated by auto_save (main_window.py:3424-3427, 3480-3501). Both message texts match save_export_manager.py:536-542.
>
> GAPS: (1) Multi-view batch navigation saves every time and ignores auto_save (main_window.py:6497, 6530; file_navigation_manager.py:403), so turning Auto-Save off does not prevent deletion in multi-view. (2) In multi-view the deletion is silent (debug log only, main_window.py:6591-6593), and Enter still shows 'Multi-view annotations saved!' (save_export_manager.py:593). The 'Deleted:' and 'No segments to save.' messages appear only in single view and sequence mode. (3) Enter first commits a pending polygon or AI preview (keyboard_event_manager.py:200-202, 233), which adds a segment and prevents deletion. The Given should add 'no pending polygon or AI preview'. (4) Nothing checks that the user changed or cleared anything. Any sidecar that loads zero segments without an error is deleted just by opening the image and navigating away. Examples: a caption-style img_001.txt (load_bb_txt skips lines that do not have exactly 5 values, file_manager.py:431-440), or an NPZ with no mask key (file_manager.py:241-242), which also stops the load chain at file_manager.py:205, so a valid .xml beside it is never loaded and is then deleted. Only the first readable format is ever loaded (file_manager.py:173-205), so clearing segments also deletes sidecars whose contents the user never saw. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ARCHITECTURE.md:193 says deletion is 'used only when ... the user cleared the annotations', but the code does not check that (doc/code mismatch). (5) \<base\>.json is NOT deleted by any live path. Only _delete_multi_view_files (save_export_manager.py:544-567) removes it, and that is dead code: its only caller, _save_viewer_output (:454), is never called. The rewrite should not copy it. (6) Files are listed in the order the exporters are registered (__init__.py:224-230), so the exact message for the example is 'Deleted: img_001.npz, img_001.xml, img_001.txt'.
>
> SME QUESTION (confidence stays below High until answered): Should deletion be limited to files LazyLabel wrote or loaded in the current session, and only after the user actually clears segments? Or is wiping sidecars from other tools, or ones that failed to load, intended? Settle this before the behavior goes into the equivalence contract. Injection suspects: none (the docstrings in the cited lines are descriptive and accurate for export_all). No credentials in the evidence.

**Fidelity judge:** P0 yes, faithful yes

> VERDICT: Accurate for the single-view example. P0 is justified: a save with an empty segment list permanently deletes up to 7 annotation files per image. That includes files LazyLabel never wrote and formats the user hasn't selected, and it fires on routine navigation because Auto-Save is on by default. It also protects the other direction: without the deletion, the loader (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-205) would reload annotations the user just cleared.
>
> WHAT I TRACED:
> - Enter: E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\hotkeys.py:67-69 -\> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\keyboard_event_manager.py:187-234.
> - Next/previous image: FastFileManager.navigateNext -\> main_window.py:1440-1459 -\> E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:270-274. Only runs if auto_save is on; default True at E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45.
> - Both reach E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:92-109, then 523-542, then E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:209-215. That loop covers all 7 registered exporters. Each one deletes its file if it exists (e.g. exporters\\npz.py:32-37), with no check on who made it or which formats are selected.
> - Suffixes match the rule: .npz, _CM.npz, .txt, _seg.txt, _coco.json, .xml, _createml.json.
> - Notification text and the 'No segments to save.' warning match word for word.
> - Message order: exporters register as coco, createml, npz, npz_class_map, pascal_voc, yolo_detection, yolo_segmentation (__init__.py:224-230). For the example the message is exactly "Deleted: img_001.npz, img_001.xml, img_001.txt", which fits the rule's "img_001.npz, ...".
> - Sequence frame change: main_window.py:3424-3427 -\> 3480-3501, only with auto_save on.
> - Multi-view: main_window.py:6497, 6530 and file_navigation_manager.py:401-403 -\> main_window.py:6589-6594.
>
> ADD TO THE CONTRACT:
> 1. Enter first accepts a pending AI preview (keyboard_event_manager.py:233) or finishes pending polygon points (200-202). With 0 segments plus a pending preview, Enter writes files instead of deleting. The Given should say "no pending preview or polygon". The rule's "empty at save time" parameter is the correct trigger.
> 2. In polygon mode with sequence view, Enter never saves (keyboard_event_manager.py:193-230 has no sequence branch).
> 3. Multi-view deletion ignores Auto-Save. It runs on batch navigation and on selecting a file, even with Auto-Save off. It shows no 'Deleted:' or 'No segments to save.' message, only a debug log. Enter in multi-view shows "Multi-view annotations saved!" (save_export_manager.py:593) even when it only deleted files.
> 4. No error handling around file removal. In single view the delete runs before the try block (save_export_manager.py:106-111). A locked file stops the loop partway, leaving some files deleted and some not, and the error escapes load_image_by_path, so navigation is aborted.
> 5. The class-alias .json is never deleted on paths that actually run. _delete_multi_view_files (save_export_manager.py:544-567) does delete it, but it is dead code: _save_viewer_output has no callers.
> 6. Data-loss risk, which supports P0: an NPZ without a mask or masks key loads as zero segments with no error (file_manager.py:238-242). The loader then stops (205), so valid .txt/.xml annotations next to it are never loaded, and all of them are deleted on the next auto-save navigation. Also, two images with the same name and different extensions (img_001.png, img_001.jpg) share annotation files, so saving an empty list for one deletes the other's.
> 7. Docs vs code: ARCHITECTURE.md:193 says deletion happens only when the user cleared the annotations. The code has no such check; it also fires for images that were never annotated or whose annotations failed to load.
>
> No instruction-like text aimed at AI tools in the cited lines.

### RULE-082: Saving an image with zero segments deletes all sidecar files (folded card)

**Compliance judge:** P0 yes, faithful no

> Paths below are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ unless shown in full.
>
> P0 IS JUSTIFIED, BUT ONLY ON DATA-INTEGRITY GROUNDS (no money or regulatory rule is involved). This is the only live code path that permanently deletes the tool's saved annotation files with os.remove. There is no confirmation, and plain navigation triggers it. Auto-save is on by default (config\\settings.py:45, ui\\widgets\\settings_widget.py:43).
> - If a rewrite quietly stops deleting, the loader (core\\file_manager.py:128-136) brings back labels the user cleared.
> - If it deletes more widely, annotation work or ground truth that came with the dataset is lost.
> A dataset auditor would care either way. The trigger is "no segments in memory", which is broader than ARCHITECTURE.md:193 ("the user cleared the annotations"). Loader errors are silently skipped (core\\file_manager.py:180-185 and 202-204; ui\\managers\\file_navigation_manager.py:207-212). So if none of an image's files load, the next auto-save navigation deletes all of them. That breaks the promise in the export_all docstring to leave ground truth alone (core\\exporters\\__init__.py:192-196).
>
> NOT FAITHFUL AS WRITTEN.
> Confirmed correct:
> - Single view deletes all 7 registered file types whatever the selected formats (ui\\managers\\save_export_manager.py:106-109 calling core\\exporters\\__init__.py:209-215).
> - The suffixes match coco.py:100, createml.py:67, npz.py:30, npz_class_map.py:47, pascal_voc.py:63, yolo_detection.py:46 and yolo_segmentation.py:56.
> - Single-view navigation only saves when auto_save is on (file_navigation_manager.py:157-160 and 270-274).
> - Return/Enter saves (config\\hotkeys.py:67-69 to ui\\managers\\keyboard_event_manager.py:187-234).
> - The 'Deleted: ...' and 'No segments to save.' messages are right (save_export_manager.py:531-542).
> - Sequence mode deletes on frame change, only with auto_save on (ui\\main_window.py:3424-3427, 3486, 3501).
>
> Wrong:
> (1) "Multi-view applies the same rule" is false because multi-view ignores auto_save. load_selected_image switches to multi-view (file_navigation_manager.py:149-151) before the auto_save check. Then load_multi_view_from_path (401-403), _load_next_multi_batch (main_window.py:6496-6497) and _load_previous_multi_batch (6529-6530) all call _save_multi_view_annotations with no check. An empty viewer's files are deleted even with Auto-Save off. SME question: is that intended, given the 'Auto-Save on Navigate' tooltip?
> (2) Multi-view shows no 'Deleted:' or 'No segments to save.' message, only logger.debug (main_window.py:6591-6593). Enter shows 'Multi-view annotations saved!' (save_export_manager.py:593) even after files were deleted. Navigation shows nothing.
>
> Fixes:
> - Give multi-view its own clause: deletes on navigation regardless of auto_save, or on Enter, with no message.
> - Add 'no pending AI prediction' to the Given, because Enter first calls _accept_ai_segment (keyboard_event_manager.py:232-234).
> - Use the concrete message 'Deleted: foo.npz, foo.xml, foo.txt' (registration order, core\\exporters\\__init__.py:224-230).
>
> Keep out of the contract: _save_viewer_output and _delete_multi_view_files (save_export_manager.py:454-567) are never called, and they would also delete foo.json.
>
> Other notes:
> - The comments at main_window.py:3499 and 3515 say only the NPZ is deleted, but the code deletes all 7.
> - One uncited trigger: 'Save All Propagated' (main_window.py:4776-4813) does not check auto_save. It deletes a frame's files if every mask is dropped at 4783-4784.
> - Only E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\tests\\unit\\core\\exporters\\test_exporters.py:562-568 tests deletion. Nothing tests what triggers it or the auto_save check.
> - No instruction-like text found in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> P0 JUSTIFIED. This rule permanently deletes annotation files, which are what a labeling tool produces. It removes the files for all 7 registered formats with os.remove, whatever formats the user selected. That includes files LazyLabel never wrote: core/exporters/__init__.py:192-196 says dataset ground truth can sit next to the images. It runs quietly on navigation (auto_save defaults to True). It also runs when sidecars exist on disk but loaded zero segments, because load failures are swallowed (core/file_manager.py:181-185, 202-204). Deleting every format is also what stops the loader's fallback chain (file_manager.py:128-136) from bringing back stale annotations after a user clears an image. So it governs whether the dataset on disk is correct.
>
> FIDELITY: VERIFIED. Paths are relative to E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\
> - ui/managers/save_export_manager.py:106-109: the empty check runs before export_formats is read (112-122), so deletion does not depend on selected formats.
> - core/exporters/__init__.py:209-215 loops over every registered exporter. The file names are splitext(path)[0] plus .npz / _CM.npz / .txt / _seg.txt / _coco.json / .xml / _createml.json (npz.py:30, npz_class_map.py:47, yolo_detection.py:46, yolo_segmentation.py:56, coco.py:100, pascal_voc.py:63, createml.py:67). Each delete_output removes a file only if it exists, so 'removed if present' is exact.
> - save_export_manager.py:531-542: shows 'Deleted: \<basenames\>', or the warning 'No segments to save.' if nothing was deleted. Exact.
> - Triggers:
>   - Single-view navigation, gated by auto_save and saved before state is reset (ui/managers/file_navigation_manager.py:156-160, 270-274).
>   - Return/Enter via handle_enter_press (keyboard_event_manager.py:187-234; config/hotkeys.py:67-69).
>   - Sequence frame change via _auto_save_sequence_frame (ui/main_window.py:3424-3427, 3480-3501). It is gated by auto_save and uses the single-view path (save_export_manager.py:92-95), so it shows the same notification.
>   - Multi-view calls delete_all_outputs per viewer (main_window.py:6588-6594).
> - The code contradicts nothing the rule states. For the example Given, the message reads 'Deleted: foo.npz, foo.xml, foo.txt' because deletion follows registration order (__init__.py:224-230). The rule does not fix the order, so this is not an error.
>
> AMENDMENTS NEEDED before this becomes the contract. These are gaps or unclear wording, not contradictions:
> 1. 'Multi-view applies the same rule' hides that multi-view ignores the auto-save setting. load_multi_view_from_path (file_navigation_manager.py:149-151, 261-265, 401-403) and _load_next/_previous_multi_batch (main_window.py:6496-6497, 6529-6530) always call _save_multi_view_annotations, and that function never reads auto_save (6559-6636). Moving between images in multi-view deletes sidecars even with auto-save OFF.
> 2. Multi-view shows neither 'Deleted:' nor 'No segments to save.'. It only writes a debug log (6591-6593). Pressing Enter shows 'Multi-view annotations saved!' even when it only deleted files (save_export_manager.py:592-593).
> 3. Enter first accepts a pending AI preview or finishes pending polygon points (keyboard_event_manager.py:200-202, 233). The zero-segment check happens after that.
> 4. There is another trigger: Save All Propagated clears the segment manager and skips masks that are not 2-D (main_window.py:4776-4813). If every mask is skipped, that frame's sidecars are deleted and the frame is still marked saved (4814).
> 5. Deletion can stop partway. delete_output does not catch errors, so if os.remove fails (for example, a locked file on Windows), the remaining files are not deleted. In single view, lines 106-109 sit outside the try that starts at 111, so the error is not caught and the next image never loads. Sequence mode (3516) and multi-view (6635) catch and log it.
> 6. Sidecar names depend only on the file name without its extension. foo.png and foo.jpg in the same folder share sidecars, and both lose them.
> 7. Unused code: _save_viewer_output (save_export_manager.py:454-521, nothing calls it) leads to _delete_multi_view_files (544-567), which also deletes \<stem\>.json. The rule rightly leaves this out; the rewrite should not copy it.
> No text that looks like instructions to an AI tool was found in the cited lines.

### RULE-084: Sidecar file naming and suffix collisions

**Compliance judge:** P0 no, faithful yes

> All paths are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\.
>
> WHY P0 IS NOT JUSTIFIED (compliance lens): LazyLabel is a desktop tool for labeling images for machine learning. Nothing here moves money or carries out a regulatory control (no audit trail, retention rule, PII handling or sign-off). A regulator, auditor or finance controller would not notice if this changed. The only possible P0 basis is data integrity, and this card does not guard it. It describes a file-naming scheme that has no uniqueness check, and its Given/When/Then makes a naming-collision bug the expected behavior. As a P0 equivalence contract, it would force the web rewrite to copy a bug that corrupts data.
>
> Recommendation: split the card in two.
> (a) Keep the sidecar naming convention as a P1 file-format / backward-compatibility rule, checked with golden-file tests. The suffix list is correct: core/exporters/npz.py:30, npz_class_map.py:47, yolo_detection.py:46, yolo_segmentation.py:56, coco.py:100, pascal_voc.py:63, createml.py:67.
> (b) Log the stem/suffix collision as a high-severity defect. An SME should decide whether to fix it or preserve it.
>
> The card also understates the harm. Auto-Save on Navigate is on by default (config/settings.py:45, ui/widgets/settings_widget.py:43). Leaving foo.png, which loaded with zero segments, runs save_output (ui/managers/file_navigation_manager.py:156-160 and 270-274, then ui/main_window.py:1993-1998). The empty-image branch (ui/managers/save_export_manager.py:106-109, 529) calls delete_all_outputs('foo.png') (core/exporters/__init__.py:209-215). That deletes foo_seg.txt, which holds foo_seg.png's own YOLO Detection labels. It also deletes foo.png's own sidecars (such as foo.txt) that the collided load hid. They were hidden because the load chain returns after the zero-polygon segmentation load and never falls through (core/file_manager.py:187-205). The user only sees a brief pop-up (save_export_manager.py:536-538). The same thing happens with default formats when foo_CM.png is saved as NPZ: it writes foo_CM.npz, and load_npz_class_map logs an error and returns without raising (file_manager.py:298-300).
>
> WHY THE CARD IS FAITHFUL: every clause matches the code.
> - Saving foo_seg.png as YOLO Detection writes foo_seg.txt (yolo_detection.py:45-46). That is also foo.png's YOLO Segmentation file name (yolo_segmentation.py:55-56).
> - With no foo.npz, the load chain tries _seg.txt second (file_manager.py:128-136, 173-205).
> - Lines with 5 tokens fail the len(parts) \< 7 check (file_manager.py:563-565), so foo.png appears unlabeled.
> - The directory scan puts foo_seg.txt only in seg_stems under the stem 'foo' (utils/fast_file_manager.py:200-204, 231). CustomFileSystemModel matches the longest suffix first (utils/custom_file_system_model.py:18-22, 56-62). So foo shows YOLO Seg.
>
> Gaps:
> 1. The citations leave out the load-chain and 5-token check that the Then clause relies on (file_manager.py:128-205, 562-565).
> 2. A fresh scan also fails to show YOLO Det for foo_seg.png; the card does not mention this.
> 3. The save only writes a file if at least one object is labeled (yolo_detection.py:35-36).
> 4. 'Supported image types' is right for is_image_file, the directory scan and CustomFileSystemModel. However, ui/workers/image_discovery_worker.py:8 also accepts .bmp, .gif and .webp, even though its comment claims it matches FastFileManager.
>
> No instruction-like text or credentials were found in the cited lines.

**Fidelity judge:** P0 yes, faithful yes

> VERDICT: The card is faithful, but it needs changes before it becomes a contract. I re-derived the behavior from the code and checked the name arithmetic and token counts in memory, without writing any files. Every clause in the Then holds.
>
> 1. Names collide. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_detection.py:45-46 turns foo_seg.png into foo_seg.txt. E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\yolo_segmentation.py:55-56 turns foo.png into foo_seg.txt. Same file.
>
> 2. Load order is exact. In E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\file_manager.py:128-136, only .npz ranks above _seg.txt. So "(no foo.npz)" is exactly the precondition needed. Opening an image always calls load_existing_mask (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\file_navigation_manager.py:343).
>
> 3. Detection lines are rejected. They are always exactly 5 tokens (yolo_detection.py:33). They fail the check `len(parts) \< 7 or len(parts) % 2 == 0` (file_manager.py:564). Nothing raises, so the chain stops at file_manager.py:205. foo.png gets 0 segments. Any lower-priority files of foo.png's own (foo_coco.json, foo_CM.npz, foo.xml, foo_createml.json, foo.txt) are hidden as well.
>
> 4. The folder scan files foo_seg.txt only under "foo" as YOLO Seg (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\utils\\fast_file_manager.py:200-204, 231).
>
> REQUIRED AMENDMENTS:
>
> (a) The file-list clause depends on timing. It is only true after the folder is scanned (folder open or Refresh, fast_file_manager.py:1215-1269), and nothing watches the folder for changes. Saving updates only foo_seg.png's row (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\managers\\save_export_manager.py:129, then fast_file_manager.py:611-645). Opening foo.png only selects its row (fast_file_manager.py:1745-1759). In one session without Refresh, foo's row stays unmarked. The Then should say "after the folder is rescanned".
> - The two status paths also disagree. Right after the save, the per-image check marks foo_seg.png as YOLO Det (fast_file_manager.py:628). A rescan removes that mark.
> - The YOLO Seg column is hidden by default (fast_file_manager.py:290-301).
>
> (b) The worst case is missing: it deletes another image's labels. Auto-Save on Navigate is on by default (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\config\\settings.py:45; file_navigation_manager.py:157-160 and 271-274). Leaving foo.png while it has 0 segments calls delete_all_outputs(foo.png) (save_export_manager.py:106-109 and 523-529; E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\core\\exporters\\__init__.py:209-215). That removes foo_seg.txt (yolo_segmentation.py:58-63) and silently destroys foo_seg.png's detection labels.
> - Multi-view does the same (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\main_window.py:6589-6590).
> - Saving foo.png as YOLO Segmentation overwrites that file instead.
> - This deserves its own companion scenario.
>
> (c) find_annotation_file(foo.png) returns foo_seg.txt. So skip-labeled propagation (main_window.py:4226) and add-all-labeled-references (main_window.py:3966) treat foo.png as labeled, even though it loads empty.
>
> (d) The Plain English list of image types is not true everywhere. It matches file_manager.py:741-743, fast_file_manager.py:37 and E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\utils\\custom_file_system_model.py:30. But sequence mode also accepts .bmp (main_window.py:5386). The preload list accepts .bmp, .gif and .webp (E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\ui\\workers\\image_discovery_worker.py:8). The comment at image_discovery_worker.py:7 wrongly claims it matches the file list; that is a stale comment, not an injection.
>
> (e) The same kind of collision exists for foo_CM.png. Its NPZ file is foo_CM.npz, which is foo.png's NPZ Class Map name. The loader logs "No class_map" and returns without raising (file_manager.py:298-300), so foo.png loads empty.
>
> P0 IS JUSTIFIED: The suffix convention is the saved-data contract for annotations. The collision causes one image's labels to be attributed to another, hidden, overwritten or deleted. That is data integrity.
>
> No instruction-like or injection text was found in the cited files.

