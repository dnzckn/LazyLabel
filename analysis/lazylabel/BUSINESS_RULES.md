# BUSINESS RULES: `lazylabel`

| | |
|---|---|
| System | LazyLabel 2.0.8, legacy snapshot `legacy/lazylabel` at 2a7d5d8 |
| Produced | 2026-09-17 by `/code-modernization:modernize-extract-rules lazylabel` (Method A, workflow `extract-rules.js`) |
| Method | Three lens-scoped extractors (calculations, validations, lifecycle); every rule's citation re-read by an independent referee; every P0 candidate sent to two independent judges (compliance and fidelity lenses); near-duplicate cards from different lenses reviewed and merged |
| Result | 94 distinct rules from 173 confirmed cards (79 near-duplicates folded into another card); 2 candidate rules rejected by referees; 0 instruction-shaped source locations flagged |
| Companions | `analysis/lazylabel/DATA_OBJECTS.md` (data objects) and `analysis/lazylabel/P0_PANEL.md` (every P0 judge verdict with its reasoning) |

**Coverage note.** Extraction ran **one round** of the three lenses. The workflow normally repeats rounds until two in a row find nothing new; it was capped at one round after the first run's later rounds died on usage limits, and a failed round is indistinguishable from a dry one. Rules that only a later round would surface are therefore not in this catalog. Every one of the 175 candidate rules was refereed against its citation. The P0 panel needed 4 workflow runs, because judge agents kept failing on usage limits; in this record 74 of 74 P0 candidate cards carry both verdicts. In 37 cards the two judges disagreed in one direction: the compliance judge said the rule is not P0 because nothing here is financial or regulated, while the fidelity judge said it is P0 because it guards annotation data. The workflow demotes a card on any disagreement. Decision 14, taken on 2026-09-17, restored 19 of those rules to P0; the remaining 2 land only in Phase 3 or Phase 6 and stay P1 until those phases start. Every verdict and its reasoning is in `P0_PANEL.md`. The 173 confirmed cards were then reviewed for near-duplicates across lenses and merged into 94 distinct rules, with each folded card's own specification kept in the table at the end of this file. The data-object catalog returned 45 objects (`DATA_OBJECTS.md`).

How to read a card: **Source** paths are relative to the repository root. **Priority** P0 means the rule guards data integrity (for LazyLabel: what is written to or read from annotation files, and which pixels belong to which class), so it becomes part of the behavior contract every rewrite phase must prove equivalent. **Confidence** below High carries the exact question a subject-matter expert must answer.

## Summary

| Measure | Count |
|---|---|
| Distinct rules | 94 |
| Calculation | 36 |
| Validation | 15 |
| Lifecycle | 26 |
| Policy | 17 |
| Priority P0 | 36 |
| Priority P1 | 50 |
| Priority P2 | 8 |
| Confidence High | 63 |
| Confidence Medium | 31 |
| Confidence Low | 0 |
| Needing SME confirmation (confidence below High) | 31 |
| P0 rules below High confidence (blockers for the behavior contract) | 16 |
| Cards sent to the P0 panel | 74 |
| Candidate rules rejected by citation referees | 2 |

| ID | Name | Category | Priority | Source | Confidence |
|---|---|---|---|---|---|
| [RULE-001](#rule-001-coco-json-export-structure-and-area) | COCO JSON export structure and area | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/coco.py:19-100` | Medium |
| [RULE-002](#rule-002-createml-exportimport-pixel-center-boxes) | CreateML export/import: pixel center boxes | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/createml.py:33-67` (+1 more) | High |
| [RULE-003](#rule-003-npz-class-map-export-resolves-overlaps-to-lowest-class-and-stores-foreground) | NPZ Class Map export resolves overlaps to lowest class and stores foreground | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:20-76` (+1 more) | Medium |
| [RULE-004](#rule-004-pascal-voc-export-uses-alias-names-and-exclusive-max-bounds) | Pascal VOC export uses alias names and exclusive max bounds | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/pascal_voc.py:22-63` (+1 more) | Medium |
| [RULE-005](#rule-005-yolo-detection-export-line-format) | YOLO Detection export line format | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/yolo_detection.py:19-46` (+1 more) | Medium |
| [RULE-006](#rule-006-yolo-segmentation-export-polygon-simplification) | YOLO Segmentation export polygon simplification | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/yolo_segmentation.py:25-56` (+1 more) | High |
| [RULE-007](#rule-007-label-text-to-class-id-resolution-on-import) | Label text to class ID resolution on import | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/file_manager.py:345-379` (+2 more) | High |
| [RULE-008](#rule-008-detection-and-polygon-exports-keep-same-class-objects-separate) | Detection and polygon exports keep same-class objects separate | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:254-315` (+3 more) | High |
| [RULE-009](#rule-009-eraser-splits-segments-and-drops-pieces-of-10-pixels-or-less) | Eraser splits segments and drops pieces of 10 pixels or less | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:646-707` (+3 more) | High |
| [RULE-010](#rule-010-final-per-class-mask-composition) | Final per-class mask composition | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:212-252` (+1 more) | High |
| [RULE-011](#rule-011-new-segments-take-the-active-class-otherwise-the-next-free-class-id-highest--1) | New segments take the active class, otherwise the next free class id (highest + 1) | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:28-85` (+3 more) | Medium |
| [RULE-012](#rule-012-pixel-priority-resolves-overlapping-classes) | Pixel priority resolves overlapping classes | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:317-373` (+3 more) | High |
| [RULE-013](#rule-013-reassign-class-ids-from-class-table-order) | Reassign class ids from class table order | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:375-391` (+3 more) | High |
| [RULE-014](#rule-014-saved-class-channel-order-is-ascending-class-id-not-the-class-order-table) | Saved class channel order is ascending class ID, not the Class Order table | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:87-95` (+4 more) | High |
| [RULE-015](#rule-015-shape-rasterization-before-export-truncated-vertices-rounded-circles) | Shape rasterization before export (truncated vertices, rounded circles) | Calculation | P0 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:174-252` (+1 more) | High |
| [RULE-016](#rule-016-crop-is-clamped-to-the-image-and-blanks-everything-outside-it-on-save-including-the-last-row-and-column) | Crop is clamped to the image and blanks everything outside it on save, including the last row and column | Calculation | P0 | `legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:47-57` (+6 more) | Medium |
| [RULE-017](#rule-017-merge-selected-segments-into-the-lowest-selected-class) | Merge selected segments into the lowest selected class | Calculation | P1 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:65-85` (+2 more) | Medium |
| [RULE-018](#rule-018-propagation-confidence-score-per-object) | Propagation confidence score per object | Calculation | P1 | `legacy/lazylabel/src/lazylabel/models/sam2_model.py:1029-1044` (+2 more) | Medium |
| [RULE-019](#rule-019-sam-2-frame-staging-numbering-gap) | SAM 2 frame staging numbering gap | Calculation | P1 | `legacy/lazylabel/src/lazylabel/models/sam2_model.py:759-803` (+1 more) | Medium |
| [RULE-020](#rule-020-sam-best-mask-selection-and-click-coordinate-mapping) | SAM best-mask selection and click coordinate mapping | Calculation | P1 | `legacy/lazylabel/src/lazylabel/models/sam_model.py:217-255` (+4 more) | High |
| [RULE-021](#rule-021-auto-convert-ai-masks-to-polygons) | Auto-convert AI masks to polygons | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:1788-1829` (+5 more) | High |
| [RULE-022](#rule-022-find-archetypes-suggests-about-2-of-frames-between-5-and-50-as-references) | Find Archetypes suggests about 2% of frames (between 5 and 50) as references | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:5039-5139` (+3 more) | High |
| [RULE-023](#rule-023-propagation-seeds-come-only-from-mask-segments-on-reference-frames) | Propagation seeds come only from mask segments on reference frames | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:3640-3668` (+4 more) | Medium |
| [RULE-024](#rule-024-grayscale-detection-tolerance-and-16-bit-display-conversion) | Grayscale detection tolerance and 16-bit display conversion | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:451-480` (+1 more) | High |
| [RULE-025](#rule-025-propagation-direction-and-range) | Propagation direction and range | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:577-686` (+5 more) | High |
| [RULE-026](#rule-026-streaming-chunked-propagation-windows) | Streaming (chunked) propagation windows | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:69-76` (+5 more) | High |
| [RULE-027](#rule-027-the-fragment-filter-keeps-only-regions-at-least-x-of-the-largest-region) | The fragment filter keeps only regions at least X% of the largest region | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:285-344` (+3 more) | High |
| [RULE-028](#rule-028-display-image-adjustments-saturation-brightnesscontrast-gamma) | Display image adjustments (saturation, brightness/contrast, gamma) | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/photo_viewer.py:95-152` (+3 more) | High |
| [RULE-029](#rule-029-channel-threshold-posterization) | Channel threshold posterization | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/widgets/channel_threshold_widget.py:503-568` (+2 more) | High |
| [RULE-030](#rule-030-fft-frequency-band-thresholding-for-grayscale-images) | FFT frequency-band thresholding for grayscale images | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/widgets/fft_threshold_widget.py:373-496` (+1 more) | High |
| [RULE-031](#rule-031-histogram-presets-contrast-stretch-equalization-clahe) | Histogram presets: contrast stretch, equalization, CLAHE | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/widgets/rescale_histogram_dialog.py:28-73` (+2 more) | High |
| [RULE-032](#rule-032-linear-minmax-rescale-for-grayscale-images) | Linear min/max rescale for grayscale images | Calculation | P1 | `legacy/lazylabel/src/lazylabel/ui/widgets/rescale_widget.py:330-393` (+1 more) | High |
| [RULE-033](#rule-033-annotation-marker-size-pan-step-and-zoom) | Annotation marker size, pan step and zoom | Calculation | P2 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:515-543` (+4 more) | High |
| [RULE-034](#rule-034-class-display-color) | Class display color | Calculation | P2 | `legacy/lazylabel/src/lazylabel/ui/managers/segment_display_manager.py:219-245` | High |
| [RULE-035](#rule-035-confidence-histogram-binning) | Confidence histogram binning | Calculation | P2 | `legacy/lazylabel/src/lazylabel/ui/widgets/confidence_histogram_dialog.py:26-76` (+2 more) | High |
| [RULE-036](#rule-036-file-list-annotation-status-indicators) | File list annotation-status indicators | Calculation | P2 | `legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:186-235` (+2 more) | High |
| [RULE-037](#rule-037-coco-json-import-with-polygon-then-box-fallback) | COCO JSON import with polygon-then-box fallback | Validation | P0 | `legacy/lazylabel/src/lazylabel/core/file_manager.py:602-710` | High |
| [RULE-038](#rule-038-npz-import-current-and-legacy-layouts) | NPZ import (current and legacy layouts) | Validation | P0 | `legacy/lazylabel/src/lazylabel/core/file_manager.py:224-280` (+1 more) | High |
| [RULE-039](#rule-039-pascal-voc-and-createml-import-rules) | Pascal VOC and CreateML import rules | Validation | P0 | `legacy/lazylabel/src/lazylabel/core/file_manager.py:456-540` | High |
| [RULE-040](#rule-040-yolo-detection-import-validation-rounding-and-clamping) | YOLO Detection import validation, rounding and clamping | Validation | P0 | `legacy/lazylabel/src/lazylabel/core/file_manager.py:381-454` | Medium |
| [RULE-041](#rule-041-yolo-segmentation-import-validation) | YOLO Segmentation import validation | Validation | P0 | `legacy/lazylabel/src/lazylabel/core/file_manager.py:542-600` | Medium |
| [RULE-042](#rule-042-class-alias-editing-is-unvalidated) | Class alias editing is unvalidated | Validation | P1 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:393-399` (+3 more) | Medium |
| [RULE-043](#rule-043-manual-box-and-circle-minimum-sizes) | Manual box and circle minimum sizes | Validation | P1 | `legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:370-449` (+2 more) | High |
| [RULE-044](#rule-044-propagation-preconditions) | Propagation preconditions | Validation | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:4011-4120` (+3 more) | High |
| [RULE-045](#rule-045-crop-coordinate-validation-and-reuse-by-image-size) | Crop coordinate validation and reuse by image size | Validation | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:111-153` (+5 more) | Medium |
| [RULE-046](#rule-046-edit-mode-eligibility-and-200-vertex-limit) | Edit mode eligibility and 200-vertex limit | Validation | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/mode_manager.py:55-112` (+3 more) | High |
| [RULE-047](#rule-047-a-polygon-needs-3-points-and-closes-when-clicking-within-the-join-distance-of-its-first-point) | A polygon needs 3 points and closes when clicking within the join distance of its first point | Validation | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/polygon_drawing_manager.py:68-120` (+6 more) | High |
| [RULE-048](#rule-048-reference-frames-must-match-the-first-references-image-size) | Reference frames must match the first reference's image size | Validation | P1 | `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:210-288` (+3 more) | High |
| [RULE-049](#rule-049-hotkey-assignment-conflicts-are-blocked) | Hotkey assignment conflicts are blocked | Validation | P2 | `legacy/lazylabel/src/lazylabel/config/hotkeys.py:210-275` (+1 more) | High |
| [RULE-050](#rule-050-annotation-setting-input-limits) | Annotation setting input limits | Validation | P2 | `legacy/lazylabel/src/lazylabel/ui/widgets/annotation_settings_widget.py:69-93` (+2 more) | High |
| [RULE-051](#rule-051-supported-image-formats) | Supported image formats | Validation | P2 | `legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:36-37` (+4 more) | Medium |
| [RULE-052](#rule-052-undoredo-history-scope) | Undo/redo history scope | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:28-131` (+7 more) | High |
| [RULE-053](#rule-053-undoing-an-erase-inserts-malformed-segment-records) | Undoing an erase inserts malformed segment records | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:574-629` (+4 more) | High |
| [RULE-054](#rule-054-closing-the-application-never-saves-the-open-images-annotations) | Closing the application never saves the open image's annotations | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:2064-2108` | Medium |
| [RULE-055](#rule-055-leaving-a-sequence-frame-saves-it-and-marks-it-saved-even-if-it-is-a-reference) | Leaving a sequence frame saves it and marks it Saved, even if it is a reference | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:3414-3434` (+3 more) | Medium |
| [RULE-056](#rule-056-leaving-the-sequence-tab-or-clicking-new-timeline-discards-all-sequence-work-without-saving) | Leaving the Sequence tab or clicking New Timeline discards all sequence work without saving | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:3043-3060` (+4 more) | High |
| [RULE-057](#rule-057-multi-view-batch-navigation-always-saves-ignoring-the-auto-save-setting) | Multi-view batch navigation always saves, ignoring the Auto-Save setting | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:6559-6636` (+3 more) | High |
| [RULE-058](#rule-058-propagation-finish-save-all-and-trim-reload-the-current-frame-without-saving-it) | Propagation finish, Save All and Trim reload the current frame without saving it | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:4638-4645` (+4 more) | High |
| [RULE-059](#rule-059-auto-save-current-image-before-switching-images-single-view) | Auto-save current image before switching images (single view) | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:153-162` (+7 more) | Medium |
| [RULE-060](#rule-060-propagated-frame-flagging-and-commit-keep-flagged-masks) | Propagated frame flagging and commit (Keep Flagged Masks) | Lifecycle | P0 | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:751-810` (+8 more) | Medium |
| [RULE-061](#rule-061-undoing-a-circle-center-drag-changes-the-circles-radius) | Undoing a circle center drag changes the circle's radius | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/editable_vertex.py:30-66` (+2 more) | High |
| [RULE-062](#rule-062-ai-mode-click-adds-a-point-a-drag-over-5-px-draws-a-box-space-accepts-the-preview) | AI mode: click adds a point, a drag over 5 px draws a box, Space accepts the preview | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:130-139` (+8 more) | High |
| [RULE-063](#rule-063-abort-stops-the-running-step-and-keeps-frames-already-committed) | Abort stops the running step and keeps frames already committed | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:4406-4445` (+3 more) | High |
| [RULE-064](#rule-064-clear-flags-repaints-non-reference-frames-as-pending-without-touching-results) | Clear Flags repaints non-reference frames as pending without touching results | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:3457-3478` (+1 more) | High |
| [RULE-065](#rule-065-selecting-a-file-in-the-sequence-tab-jumps-to-its-frame-a-file-outside-the-timeline-bounces-back) | Selecting a file in the Sequence tab jumps to its frame; a file outside the timeline bounces back | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:1440-1459` (+5 more) | Medium |
| [RULE-066](#rule-066-accepting-ai-previews) | Accepting AI previews | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:74-200` (+3 more) | High |
| [RULE-067](#rule-067-crop-persistence-across-image-navigation) | Crop persistence across image navigation | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:227-238` (+3 more) | Medium |
| [RULE-068](#rule-068-enter-completes-pending-work-then-saves) | Enter completes pending work then saves | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:187-234` | High |
| [RULE-069](#rule-069-edit-mode-entry-and-mode-toggling) | Edit mode entry and mode toggling | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/mode_manager.py:55-184` (+2 more) | High |
| [RULE-070](#rule-070-mode-toggles-fail-to-return-to-the-last-drawing-mode) | Mode toggles fail to return to the last drawing mode | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/mode_manager.py:114-184` (+5 more) | High |
| [RULE-071](#rule-071-first-propagation-sets-up-the-engine-once-and-marks-wrong-size-frames-skipped) | First propagation sets up the engine once and marks wrong-size frames Skipped | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:181-298` (+4 more) | High |
| [RULE-072](#rule-072-frame-status-precedence-suggestions-and-timeline-sort) | Frame status precedence, suggestions and timeline sort | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:1135-1154` (+9 more) | High |
| [RULE-073](#rule-073-min-conf-change-re-evaluates-flags-in-the-engine-but-not-on-the-timeline) | Min Conf change re-evaluates flags in the engine but not on the timeline | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:1254-1273` (+3 more) | High |
| [RULE-074](#rule-074-ai-embedding-goes-dirty-then-updating-then-ready-and-a-failed-embed-is-reported-as-ready) | AI embedding goes dirty, then updating, then ready, and a failed embed is reported as ready | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:73-113` (+6 more) | High |
| [RULE-075](#rule-075-each-propagate-run-resets-earlier-results-except-reference-and-skipped-frames) | Each Propagate run resets earlier results except reference and skipped frames | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:143-159` (+3 more) | High |
| [RULE-076](#rule-076-timeline-frame-status-lifecycle) | Timeline frame status lifecycle | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:20-30` (+7 more) | High |
| [RULE-077](#rule-077-trim-removes-frames-from-the-timeline-only-and-re-keys-state-by-image-path) | Trim removes frames from the timeline only and re-keys state by image path | Lifecycle | P1 | `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:598-709` (+1 more) | High |
| [RULE-078](#rule-078-annotations-load-from-the-best-file-present-and-a-damaged-non-npz-file-stops-the-search) | Annotations load from the best file present, and a damaged non-NPZ file stops the search | Policy | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:65-81` (+7 more) | Medium |
| [RULE-079](#rule-079-export-writes-every-selected-format-and-never-removes-other-files) | Export writes every selected format and never removes other files | Policy | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:189-206` (+4 more) | High |
| [RULE-080](#rule-080-sidecar-file-naming-and-suffix-collisions) | Sidecar file naming and suffix collisions | Policy | P0 | `legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:46-47` (+4 more) | High |
| [RULE-081](#rule-081-propagation-never-overwrites-reference-frames-and-by-default-frames-already-labeled) | Propagation never overwrites reference frames and, by default, frames already labeled | Policy | P0 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:4218-4231` (+4 more) | Medium |
| [RULE-082](#rule-082-save-all-propagated-frames-eligibility) | Save All propagated frames eligibility | Policy | P0 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:4741-4846` (+6 more) | Medium |
| [RULE-083](#rule-083-saving-an-image-with-no-segments-deletes-all-of-its-annotation-files) | Saving an image with no segments deletes all of its annotation files | Policy | P0 | `legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:97-133` (+5 more) | Medium |
| [RULE-084](#rule-084-ai-features-require-segment-anything-and-pytorch-271) | AI features require segment-anything and PyTorch 2.7.1+ | Policy | P1 | `legacy/lazylabel/src/lazylabel/ai_availability.py:8-47` (+3 more) | Medium |
| [RULE-085](#rule-085-model-type-detected-from-file-name) | Model type detected from file name | Policy | P1 | `legacy/lazylabel/src/lazylabel/core/model_manager.py:58-104` (+2 more) | Medium |
| [RULE-086](#rule-086-active-class-toggle-and-recent-class-hotkey) | Active class toggle and recent-class hotkey | Policy | P1 | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:401-440` (+4 more) | Medium |
| [RULE-087](#rule-087-default-model-download-integrity-check) | Default model download integrity check | Policy | P1 | `legacy/lazylabel/src/lazylabel/models/sam_model.py:20-65` (+2 more) | Medium |
| [RULE-088](#rule-088-one-unknown-key-in-settingsjson-resets-every-preference-old-save-flags-migrate-to-export-formats) | One unknown key in settings.json resets every preference; old save flags migrate to export formats | Policy | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:2096-2107` (+3 more) | High |
| [RULE-089](#rule-089-operate-on-view-chooses-which-pixels-the-ai-segments) | Operate On View chooses which pixels the AI segments | Policy | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:1567-1625` (+3 more) | High |
| [RULE-090](#rule-090-sequence-frame-load-order-and-per-class-merge) | Sequence frame load order and per-class merge | Policy | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:3577-3625` (+2 more) | High |
| [RULE-091](#rule-091-up-to-10-image-embeddings-are-cached-by-file-path-and-computed-ahead-for-nearby-images) | Up to 10 image embeddings are cached by file path and computed ahead for nearby images | Policy | P1 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:223` (+9 more) | Medium |
| [RULE-092](#rule-092-linked-multi-view-shape-mirroring-and-class-ids) | Linked multi-view shape mirroring and class ids | Policy | P1 | `legacy/lazylabel/src/lazylabel/ui/managers/multi_view_coordinator.py:42-47` (+6 more) | Medium |
| [RULE-093](#rule-093-timeline-is-built-from-the-file-list-order-between-start-and-end) | Timeline is built from the file list order between Start and End | Policy | P1 | `legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:1971-1999` (+1 more) | High |
| [RULE-094](#rule-094-click-selection-toggles-the-topmost-segment) | Click selection toggles the topmost segment | Policy | P2 | `legacy/lazylabel/src/lazylabel/ui/main_window.py:2306-2353` | High |

## Calculation rules (36)

### RULE-001: COCO JSON export structure and area
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/coco.py:19-100`  
**Plain English:** One COCO file per image with image id 1, a category per class (alias 'name.supercategory' split at the last dot), and one annotation per object with polygon, [x, y, w, h] box, area and iscrowd 0.  
**Specification:**  
  Given Class 2 alias 'dog.animal'; object = filled 10x10 square at (100,50)  
  When  Saving COCO JSON  
  Then  category {id 2, name 'dog', supercategory 'animal'}; annotation {id 1, image_id 1, category_id 2, bbox [100,50,10,10], area 81, segmentation [[100,50,100,59,109,59,109,50]], iscrowd 0}  
**Parameters:** area = int(polygon contour area) when contour has \>= 3 points, else box w x h; annotation ids restart at 1 per file; image id 1; annotation ids start at 1 per file; iscrowd 0; supercategory separator = last '.'; suffix '_coco.json'  
**Edge cases handled:** Area 81 under-counts the 100 pixels because the polygon passes through pixel centers; An alias with an unintended dot ('St. Bernard') becomes name 'St', supercategory ' Bernard'; Per-image ids collide when files are merged into one dataset; No file when there are no objects; Alias with a literal dot such as 'v1.0' becomes name 'v1', supercategory '0'; Polygon is not simplified, unlike YOLO Segmentation  
**Suspected defect:** 'area' is the polygon area through pixel centers, which undercounts the object's pixel count (10x10 square -\> 81, roughly (w-1)x(h-1)); COCO small/medium/large buckets (32^2, 96^2) may misclassify objects.  
**Confidence:** Medium — SME question: Should COCO 'area' be the mask pixel count (COCO convention) instead of the contour polygon area? Panel: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-002: CreateML export/import: pixel center boxes
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/createml.py:33-67; legacy/lazylabel/src/lazylabel/core/file_manager.py:495-540`  
**Plain English:** CreateML annotations store the box center in pixels (x + width/2, y + height/2) and integer width/height with the class alias as label; import rebuilds x1=round(cx-w/2), x2=x1+round(w).  
**Specification:**  
  Given Class 2 alias 'cat', object pixels columns 101-300 (x=101, w=200) and rows 50-149 (y=50, h=100)  
  When  Saved as CreateML and reloaded  
  Then  JSON [{image:'\<file\>', annotations:[{label:'cat', coordinates:{x:201.0, y:100.0, width:200, height:100}}]}]; reload fills columns 101-300, rows 50-149 exactly  
  And   Only the first image entry of the JSON array is read; boxes are clamped to the image and dropped if empty  
**Parameters:** Center = integer origin + integer size / 2 (float); suffix '_createml.json'  
**Edge cases handled:** Odd widths give .5 centers (x=100, w=201 -\> 200.5) and still round-trip; Label names map to class ids by first appearance (ids not preserved); No file when there are no objects; Same alias-only class identity as Pascal VOC  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 1 near-duplicate card(s) from other lenses were folded in

### RULE-003: NPZ Class Map export resolves overlaps to lowest class and stores foreground
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:20-76; legacy/lazylabel/src/lazylabel/core/file_manager.py:282-333`  
**Plain English:** A single H x W map stores the class ID at each labelled pixel (overlap goes to the lowest channel, i.e. lowest class ID), with a separate foreground mask so class 0 differs from background.  
**Specification:**  
  Given class_order [2, 7]; pixel A only class 7, pixel B both classes, pixel C none; Pixel Priority off  
  When  Saving NPZ Class Map  
  Then  class_map A = 7, B = 2, C = 0; foreground A = true, B = true, C = false; file \<base\>_CM.npz  
**Parameters:** dtype uint16 (class IDs up to 65535); tie-break = first (lowest) channel via argmax; suffix '_CM.npz'  
**Edge cases handled:** No file when no pixel is labelled; Class IDs above 65535 overflow; Readers ignoring 'foreground' cannot tell class 0 from background; Class ids above 65535 cannot be encoded (NumPy overflow -\> save error); Per-object separation is lost: one segment per class after reload; Files without foreground silently drop all class-0 annotations; A 240x320 class map is rejected with an error and 0 segments (chain stops)  
**Confidence:** Medium — SME question: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-004: Pascal VOC export uses alias names and exclusive max bounds
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/pascal_voc.py:22-63; legacy/lazylabel/src/lazylabel/core/file_manager.py:456-493`  
**Plain English:** Each object is written with the class alias as its name and a box whose xmax/ymax equal xmin/ymin plus width/height (exclusive), with fixed pose, truncated and difficult values.  
**Specification:**  
  Given 640x480 image; class 2 alias 'dog'; object pixels x 100-109, y 50-59  
  When  Saving Pascal VOC  
  Then  img.xml object: name 'dog', xmin 100, ymin 50, xmax 110, ymax 60; size width 640 height 480 depth 3; pose 'Unspecified', truncated 0, difficult 0  
**Parameters:** depth '3' (hard-coded); coordinates 0-based; xmax/ymax exclusive; suffix '.xml'  
**Edge cases handled:** Depth is always 3, even for grayscale images; Most VOC consumers read xmax as inclusive, so boxes appear 1 px larger; Class identity is the alias text only; two classes sharing an alias merge on reload; a class without alias is named by its number; Class ids are not preserved when aliases exist (see label resolution rule)  
**Suspected defect:** Hardcoded depth 3; exclusive xmax/ymax deviates from common VOC usage. | Depth is always '3' even for single-channel images; standard PASCAL VOC boxes are 1-based with inclusive xmax/ymax, so third-party VOC tools will be offset by 1 px and official VOC files read into LazyLabel lose a row/column.  
**Confidence:** Medium — SME question: Which VOC bound convention do downstream training tools expect? | Must VOC exports interoperate with standard VOC tooling (1-based inclusive) or only round-trip within LazyLabel? Panel: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-005: YOLO Detection export line format
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/yolo_detection.py:19-46; legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:114-136`  
**Plain English:** One line per object: class ID, then box center x and y and box width and height, each divided by the image width or height, using the object's pixel bounding rectangle.  
**Specification:**  
  Given 640x480 image; class 3 object whose pixels span x 100-109 and y 50-59  
  When  Saving YOLO Detection  
  Then  img.txt gets the line '3 0.1640625 0.114583... 0.015625 0.020833...' (105/640, 55/480, 10/640, 10/480)  
**Parameters:** Output \<base\>.txt; class written = original class ID (not a 0..N-1 index); floats written unrounded (full precision); x and w divided by image width; y and h divided by image height; box = cv2.boundingRect (inclusive pixel extent); suffix '.txt'; no decimal rounding  
**Edge cases handled:** No file written when image height or width \<= 0 or no objects (old file kept); Non-contiguous class IDs such as 0 and 5 are written as-is; Crop does not change the coordinate frame: coordinates stay relative to the full image; A segment made of two disconnected blobs produces two lines; Without per-object instances the merged class channel is contoured, fusing touching same-class objects  
**Confidence:** Medium — SME question: Must YOLO class indices be contiguous 0..N-1 across the dataset? Panel: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. | The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-006: YOLO Segmentation export polygon simplification
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/yolo_segmentation.py:25-56; legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:139-157`  
**Plain English:** One line per object: class ID followed by outer-contour vertices simplified with tolerance 0.1% of the contour perimeter, x divided by width and y by height.  
**Specification:**  
  Given 640x480 image; class 0 object = filled 10x10 square with top-left (100,50)  
  When  Saving YOLO Segmentation  
  Then  img_seg.txt line: '0 0.15625 0.104166... 0.15625 0.122916... 0.1703125 0.122916... 0.1703125 0.104166...' (vertices (100,50),(100,59),(109,59),(109,50))  
**Parameters:** epsilon = 0.001 x contour arc length; output \<base\>_seg.txt; Simplification epsilon = 0.001 x closed arc length (Douglas-Peucker); normalization by width/height; suffix '_seg.txt'  
**Edge cases handled:** A 1-pixel object is written as the same point repeated 4 times; a 1-pixel-wide line as a there-and-back 4-point ring (ARCHITECTURE.md:179-180 says a bounding-box outline is used instead); Holes are not exported (external contours only); Disconnected parts of one segment become separate lines; Holes inside objects are not exported (external contours only); Axis-aligned shapes round-trip to the exact pixel set on reload  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 1 near-duplicate card(s) from other lenses were folded in

### RULE-007: Label text to class ID resolution on import
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:345-379; legacy/lazylabel/src/lazylabel/core/segment_manager.py:20-26; legacy/lazylabel/src/lazylabel/ui/main_window.py:2138-2141`  
**Plain English:** For YOLO, VOC and CreateML files a label equal to an existing alias uses that class, a numeric label is used as the class ID, and any other name gets the lowest ID not taken by an alias or numeric label in the file and is registered as an alias; aliases are reset for every image.  
**Specification:**  
  Given A newly opened image; VOC objects in order 'dog', '0', 'cat'  
  When  The file is loaded  
  Then  '0' is class 0, 'dog' class 1, 'cat' class 2; aliases {1: 'dog', 2: 'cat'}  
**Parameters:** New ids assigned starting at 0, skipping ids used by aliases or numeric labels, in first-appearance order  
**Edge cases handled:** Image A lists dog then cat (dog 0, cat 1) and image B lists cat then dog (cat 0, dog 1); re-exporting to YOLO or COCO writes different IDs for the same name; Two classes sharing an alias merge into one on reload; Label '07' becomes class 7; Name-based formats do not preserve numeric ids: classes saved as 3 'dog' and 7 'cat' reload as 0 and 1, so a later YOLO/NPZ export renumbers them; Labels without aliases export as the id text and do round-trip  
**Suspected defect:** Name-based formats cannot round-trip class IDs consistently across a dataset because alias memory is per image.  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 1 near-duplicate card(s) from other lenses were folded in

### RULE-008: Detection and polygon exports keep same-class objects separate
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:254-315; legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:83-136; legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:432-452; legacy/lazylabel/src/lazylabel/ARCHITECTURE.md:212-218`  
**Plain English:** For YOLO Detection/Segmentation, COCO, VOC and CreateML each segment is contoured on its own after crop and pixel priority, so touching objects of one class stay separate and each disconnected part of a segment becomes its own object.  
**Specification:**  
  Given Two touching class-1 segments: A covers x 0-49, B covers x 50-99, both rows 0-49  
  When  Saving YOLO Detection  
  Then  Two lines with 50-px-wide boxes, not one 100-px box  
**Parameters:** Instance-aware formats: YOLO_DETECTION, YOLO_SEGMENTATION, COCO_JSON, PASCAL_VOC, CREATEML; contour mode external  
**Edge cases handled:** Segments reloaded from NPZ or Class Map are one per class, so re-exporting them fuses touching objects (documented as intended); Sequence frames are merged by class on display, so their exports fuse touching objects; A segment whose mask size differs from the image is silently omitted from detection exports; A segment with two separate blobs yields two objects; Identical overlapping segments yield duplicate boxes  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 1 near-duplicate card(s) from other lenses were folded in

### RULE-009: Eraser splits segments and drops pieces of 10 pixels or less
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:646-707; legacy/lazylabel/src/lazylabel/core/segment_manager.py:752-814; legacy/lazylabel/src/lazylabel/core/segment_manager.py:509-517; legacy/lazylabel/src/lazylabel/ui/managers/polygon_drawing_manager.py:175-198`  
**Plain English:** Erasing removes the erase shape's pixels from every overlapping segment; the remainder is split into 8-connected pieces and only pieces larger than 10 pixels survive as new mask segments of the same class.  
**Specification:**  
  Given A class-2 polygon cut by a Shift+box erase into a 500-pixel piece and an 8-pixel sliver  
  When  The erase is applied  
  Then  The polygon is removed, one 500-pixel class-2 mask segment (type AI) is appended at the end of the list, and the sliver is discarded  
**Parameters:** Minimum surviving piece \> 10 pixels; connectivity 8; minimum kept component \> 10 px  
**Edge cases handled:** Erased polygons and circles lose their vertices and are no longer editable; Affected segments move to the end of the segment order; Erased polygons and circles become masks and lose vertex editing; Segment order changes (survivors move to the end); A mask of different size than the image is nearest-neighbour resized first; Multi-view mirrored erase keeps only the largest contour for polygon views  
**Confidence:** High — citation confirmed by an independent referee; the only P0 judge that returned a verdict rated it P0 and faithful (the other judge failed); 1 near-duplicate card(s) from other lenses were folded in

### RULE-010: Final per-class mask composition
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:212-252; legacy/lazylabel/src/lazylabel/core/segment_manager.py:174-203`  
**Plain English:** Each class gets one binary channel that is the union of all its segments; polygons and circles are rasterized at save time; segments whose class is not in the save order are excluded.  
**Specification:**  
  Given 640x480 image; class 1 has a polygon with corners (100,100),(199,100),(199,199),(100,199) and a separate 50-pixel AI mask  
  When  The image is saved  
  Then  Class 1 channel = 10,000 filled polygon pixels (boundary inclusive) OR 50 mask pixels = 10,050 pixels  
**Parameters:** None  
**Edge cases handled:** Polygon vertices are truncated to integers before filling; A circle whose rounded radius is 0 contributes nothing; A stored mask whose size differs from the image raises; save fails with 'Error saving: ...' and nothing is written  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful

### RULE-011: New segments take the active class, otherwise the next free class id (highest + 1)
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:28-85; legacy/lazylabel/src/lazylabel/core/segment_manager.py:375-391; legacy/lazylabel/src/lazylabel/core/segment_manager.py:816-826; legacy/lazylabel/src/lazylabel/core/segment_manager.py:409-419`  
**Plain English:** A segment added without a class gets the active class, otherwise one more than the highest class id in use. Merging selected segments gives them all the lowest class id among them. Reordering classes renumbers them 0..n-1 in the chosen order.  
**Specification:**  
  Given Segments use classes 0 and 3; no class is active  
  When  The user adds a segment, then selects segments of classes 3 and 5 and presses M  
  Then  The new segment gets class 4. After the merge, both selected segments are class 3, and the next free id is recalculated as the highest remaining class + 1.  
**Parameters:** next_class_id = max(existing ids) + 1; 0 when empty  
**Edge cases handled:** With no segments the first class is 0.; Merging segments that have no class gives them the next free id.; Deleting all segments of the highest class lowers the next id.; Reordering drops classes that had no alias from the alias table.; Gaps are never reused (ids 0 and 3 give 4, not 1); A loaded file with id 250 makes the next new class 251; Gaps are not reused (classes 0 and 4 give next 5); Deleting all class-4 segments makes the next new class 2; Aliases of classes without segments do not reserve IDs; Each multi-view viewer computes its own next ID  
**Confidence:** Medium — SME question: The compliance and fidelity judges rated this not P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-012: Pixel priority resolves overlapping classes
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:317-373; legacy/lazylabel/src/lazylabel/ui/widgets/settings_widget.py:68-102; legacy/lazylabel/src/lazylabel/config/settings.py:60-62; legacy/lazylabel/src/lazylabel/ui/main_window.py:2721-2728`  
**Plain English:** With Pixel Priority enabled, a pixel claimed by several classes keeps only the lowest channel (Ascending) or highest channel (Descending); pixels with a single class are untouched.  
**Specification:**  
  Given Classes 1 and 4 present (channels 0 and 1); pixel (10,10) covered by both; Pixel Priority enabled  
  When  Saving with Ascending / with Descending  
  Then  Ascending: pixel (10,10) stays only in class 1; Descending: only in class 4  
**Parameters:** pixel_priority_enabled default False; pixel_priority_ascending default True; Default enabled False, ascending True; priority by channel index = ascending class id  
**Edge cases handled:** Ranking is by channel index = ascending class ID, while the recent-class hotkey uses the table order when priority is on; Disabled: NPZ keeps overlaps, NPZ Class Map gives overlap to the lowest class ID; Detection exports use the prioritized tensor, so a lower-priority object can shrink or split into several boxes; Detection formats intersect each object with the prioritized tensor, so an object fully covered by a higher-priority class disappears from YOLO/COCO/VOC/CreateML; 'Reassign Class IDs' changes ids and therefore priority  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 1 near-duplicate card(s) from other lenses were folded in

### RULE-013: Reassign class ids from class table order
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:375-391; legacy/lazylabel/src/lazylabel/ui/managers/segment_table_manager.py:96-100; legacy/lazylabel/src/lazylabel/ui/managers/segment_table_manager.py:338-366; legacy/lazylabel/src/lazylabel/ui/right_panel.py:361-371`  
**Plain English:** 'Reassign Class IDs' renumbers classes 0..N-1 in the current table row order and carries aliases along.  
**Specification:**  
  Given Class table rows ordered 7, 2, 5 after dragging; aliases {7:'car', 2:'person'}  
  When  The user clicks 'Reassign Class IDs'  
  Then  7 -\> 0, 2 -\> 1, 5 -\> 2; aliases become {0:'car', 1:'person'}  
**Parameters:** new id = row position  
**Edge cases handled:** The table is rebuilt in ascending id order on every refresh, so a dragged order is lost unless reassigned first; Aliases for classes with no segments are discarded; Aliases for classes not in the table are dropped; A segment whose class is missing from the order keeps its old ID and can collide with a new one; Renumbering is per image, so IDs diverge across images; Not undoable  
**Confidence:** High — citation confirmed by an independent referee; the only P0 judge that returned a verdict rated it P0 and faithful (the other judge failed); 1 near-duplicate card(s) from other lenses were folded in

### RULE-014: Saved class channel order is ascending class ID, not the Class Order table
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:87-95; legacy/lazylabel/src/lazylabel/ui/right_panel.py:180-198; legacy/lazylabel/src/lazylabel/ui/managers/segment_table_manager.py:338-368; legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:394-430; legacy/lazylabel/src/lazylabel/core/exporters/npz.py:15-37`  
**Plain English:** The NPZ channels and every exporter's class list are the distinct class IDs present in the image sorted ascending; dragging rows in the Class Order table has no effect on saving unless 'Reassign Class IDs' is pressed.  
**Specification:**  
  Given Segments with class IDs 5, 0 and 2; the Class Order table dragged to 5, 2, 0  
  When  The image is saved as NPZ  
  Then  mask has 3 channels in order class 0, class 2, class 5 and class_order = [0, 2, 5]  
**Parameters:** Keys mask/class_order/class_aliases; dtype uint8; compressed; class_order = sorted unique class ids of current segments  
**Edge cases handled:** Channels include only classes present in this image, so class 5 is channel 2 here but may be channel 0 in another image; consumers reading channel index as class ID mislabel; Any list refresh rebuilds the table sorted by ID, discarding the drag order; Class ids with no pixels (e.g. phantom segments) still get an empty channel; Written even when every channel is empty after crop (only a zero-size tensor is skipped); Channel count varies per image  
**Suspected defect:** Class table tooltip says 'drag to reorder channels for saving' (right_panel.py:181-183) but save ignores table order.  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 2 near-duplicate card(s) from other lenses were folded in

### RULE-015: Shape rasterization before export (truncated vertices, rounded circles)
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:174-252; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:384-438`  
**Plain English:** Before export, polygons and boxes are filled using vertex coordinates truncated toward zero with edges included, circles use a rounded center and rounded radius, and all segments of a class are OR-ed into one channel.  
**Specification:**  
  Given A user drags a box from (10.7, 10.2) to (20.9, 30.8)  
  When  The image is saved  
  Then  Vertices become (10,10)-(20,30); 11 x 21 = 231 pixels are filled; COCO bbox [10,10,11,21] and YOLO width 11/image width  
  And   A circle with center (20.4, 20.6) and radius point 5.4 px away becomes center (20,21), radius 5, 81 pixels; a radius that rounds to 0 produces no pixels  
**Parameters:** Vertex cast to int32 (truncation); cv2.fillPoly boundary inclusive; circle radius = round(distance); center = round(x), round(y)  
**Edge cases handled:** Boxes export 1 px larger than the drawn span; Out-of-image vertices are clipped by the rasterizer  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful

### RULE-016: Crop is clamped to the image and blanks everything outside it on save, including the last row and column
**Category:** Calculation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:47-57; legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:102-153; legacy/lazylabel/src/lazylabel/core/file_manager.py:712-739; legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:412-417; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:539-561; legacy/lazylabel/src/lazylabel/ui/main_window.py:2148-2156; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:227-238`  
**Plain English:** Crop corners are rounded, clamped to 0..width-1 and 0..height-1, and put in order. On save, mask pixels outside rows y1..y2-1 and columns x1..x2-1 are cleared. The crop applies only to the current image.  
**Specification:**  
  Given A 1000x800 image; the user enters crop (-10, 50) to (1200, 700)  
  When  The crop is applied and the image is saved  
  Then  The stored crop is x1=0, y1=50, x2=999, y2=700 ('Crop applied: 0:999, 50:700'). Saved masks keep rows 50-699 and columns 0-998 only, so column 999 and row 700 are always cleared.  
**Parameters:** A drawn crop must be larger than 5x5 px. Crops are remembered per image size (width, height), but only the unreachable legacy loader restores them.; Clamp x in [0, width-1], y in [0, height-1]; x2/y2 exclusive in the mask; minimum drawn size \> 5 px; x2/y2 exclusive in mask zeroing; x2 \<= width-1 and y2 \<= height-1 by clamping  
**Edge cases handled:** A full-image crop (0,0)-(999,799) still clears the last row and column.; Opening another image, or loading a different model, clears the active crop.; Finishing a drawn crop switches to the legacy 'sam_points' mode.; Crop does not affect the AI embedding key.; Channel threshold, FFT and rescale are also limited to the crop region; Multi-view saves ignore the crop; Every crop drops its own last column and row; Sequence Save All uses the crop of the frame on screen; Multi-view saves never crop  
**Suspected defect:** Off-by-one: clamping to width-1/height-1 combined with an exclusive end drops the final column and row. | Clamping to width-1/height-1 combined with exclusive x2/y2 means no crop can ever keep the last pixel column and row, even a full-image crop. | Inclusive clamping combined with exclusive slicing makes it impossible to keep the image's last row/column once any crop is active.  
**Confidence:** Medium — SME question: Should a crop carry over to other images of the same size, as the unreachable loader does, or reset for each image? | Is crop end (x2, y2) meant to be inclusive or exclusive, and should a full-frame crop keep the entire image? Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-017: Merge selected segments into the lowest selected class
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:65-85; legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:236-239; legacy/lazylabel/src/lazylabel/ui/managers/segment_table_manager.py:53-57`  
**Plain English:** The Merge action (M) moves all selected segments to the lowest class id among them, or to a new class id when none has a class; masks stay separate.  
**Specification:**  
  Given Selected segments with classes 5, 2 and 9 while class 7 is active  
  When  The user presses M  
  Then  All three segments become class 2; the active class 7 is ignored  
**Parameters:** target = min(selected class ids) else next_class_id  
**Edge cases handled:** Selecting a single segment leaves it unchanged; If no selected segment has a class, the next new class ID is used; Indices are only upper-bound checked; Not undoable  
**Suspected defect:** Docstrings say merge assigns 'to the active class', but the executable code ignores the active class. | Handler docstrings say 'assign selected segments to active class' but the active class is never used.  
**Confidence:** Medium — SME question: Should Merge assign to the active class when one is set? Panel: The compliance and fidelity judges rated this not P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-018: Propagation confidence score per object
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/models/sam2_model.py:1029-1044; legacy/lazylabel/src/lazylabel/models/sam2_model.py:893-909; legacy/lazylabel/src/lazylabel/models/sam2_model.py:683-690`  
**Plain English:** For each object in each frame the mask is the pixels with logit \> 0, and confidence = sigmoid(mean of those positive logits); an object with no positive logits scores 0.  
**Specification:**  
  Given An object's positive logits average 4.0 (or 5.0)  
  When  The frame is propagated  
  Then  Confidence 0.982 (or 0.9933)  
**Parameters:** Threshold 0.99 corresponds to a mean positive logit of about 4.595; Logit threshold 0; predictor overrides: dynamic multimask stability delta 0.05, stability threshold 0.98, fill_hole_area 8, binarize_mask_from_pts_for_mem_enc true  
**Edge cases handled:** Score ignores mask size; a tiny confident fragment can score high; Confidence ignores mask size, so tiny confident masks score high; Empty masks are skipped before flagging  
**Confidence:** Medium — SME question: The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-019: SAM 2 frame staging numbering gap
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/models/sam2_model.py:759-803; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:778-781`  
**Plain English:** Frames are staged as sequentially numbered JPEGs named by list position (00000.jpg, 00001.jpg...), and an unreadable non-JPEG frame is skipped without renumbering.  
**Specification:**  
  Given Frames [a.png, b.png (unreadable), c.png] and no reference size filter  
  When  Propagation initializes the video predictor  
  Then  Staged files are 00000.jpg and 00002.jpg; if SAM 2 indexes frames by sorted position, its frame 1 is c.png while LazyLabel maps index 1 to b.png  
**Parameters:** JPEG quality 95 for converted or cached frames; existing JPEGs are symlinked or copied  
**Edge cases handled:** When the reference size is known, the size filter already drops unreadable frames, reducing exposure  
**Suspected defect:** Masks for every frame after an unreadable image may be attributed to the wrong image.  
**Confidence:** Medium — SME question: Does the SAM 2 video loader index frames by sorted list position (making numbering gaps shift frames), or by the number in the file name? Panel: The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-020: SAM best-mask selection and click coordinate mapping
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/models/sam_model.py:217-255; legacy/lazylabel/src/lazylabel/models/sam2_model.py:371-411; legacy/lazylabel/src/lazylabel/ui/managers/coordinate_transformer.py:33-143; legacy/lazylabel/src/lazylabel/ui/workers/sam_update_worker.py:42-43; legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:487-515`  
**Plain English:** SAM returns three candidate masks and the highest-scoring one is used; click positions are truncated to whole pixels, float masks are binarized above 0.5, and a preview needs at least one positive point.  
**Specification:**  
  Given A positive click at (120.8, 45.6) and SAM candidate scores [0.71, 0.93, 0.88]  
  When  The preview is computed  
  Then  The point is sent as (120, 45) with label 1 and the second candidate (0.93) is shown; with only negative points no preview is made  
**Parameters:** multimask_output True; winner = argmax score; scale factor fixed at 1.0; binarize \> 0.5; labels 1 positive, 0 negative  
**Edge cases handled:** With Operate On View off, coordinates are scaled by original/display size (1.0 in practice); Masks are resized with nearest neighbor if the scale factor is not 1.0  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-021: Auto-convert AI masks to polygons
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:1788-1829; legacy/lazylabel/src/lazylabel/core/segment_manager.py:907-954; legacy/lazylabel/src/lazylabel/ui/control_panel.py:431-436; legacy/lazylabel/src/lazylabel/config/settings.py:29-31; legacy/lazylabel/src/lazylabel/ui/control_panel.py:892-939; legacy/lazylabel/src/lazylabel/ui/main_window.py:1073-1078`  
**Plain English:** With Auto-Convert on, an accepted AI mask is replaced by a polygon traced from its largest outer contour and simplified by tolerance factor x perimeter; if fewer than 3 vertices remain, the mask is kept as is.  
**Specification:**  
  Given Auto-Convert ON; resolution slider 80; accepted mask has blobs of 4,000 px and 900 px  
  When  The user accepts the mask  
  Then  One Polygon segment outlining the 4,000-px blob; the 900-px blob is dropped  
**Parameters:** epsilon factor = 0.005 x 0.02^(slider/100); slider 1-100, default 80 gives about 0.000219; slider 41 gives about 0.001; slider 100 gives 0.0001; Auto-Convert default OFF; factor 0.00481 at 1, 0.000707 at 50, 0.000219 at 80, 0.0001 at 100 (0.001 at about 41)  
**Edge cases handled:** Holes are lost; Converted segment becomes vertex-editable; Holes are lost because only the external contour is used  
**Suspected defect:** Comment says default slider 80 equals epsilon 0.001 (control_panel.py:434-436); the formula yields about 0.000219. Secondary blobs are silently discarded. | Code comments claim slider 80 gives epsilon 0.001, but the executable mapping gives 0.000219; disconnected parts of the AI mask are silently dropped.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-022: Find Archetypes suggests about 2% of frames (between 5 and 50) as references
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:5039-5139; legacy/lazylabel/src/lazylabel/ui/workers/reference_finder_worker.py:199-289; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:486-509; legacy/lazylabel/src/lazylabel/ui/workers/reference_finder_worker.py:122-136`  
**Plain English:** The app embeds every frame, clusters them, and picks max(5, min(50, 2% of frames)) representative frames, split across clusters by size with at least one per cluster. Only pending frames change status to suggested.  
**Specification:**  
  Given 1,000-frame built timeline; clustering finds clusters of 600, 300 and 50 frames, plus 50 noise frames  
  When  The user clicks Find Archetypes (Ctrl+H)  
  Then  Budget = 20 and minimum cluster size = 10. The initial split 12/6/1 is topped up to 13/6/1, giving the extra slot to the cluster with the most spare frames. The 13, 6 and 1 frames closest to each cluster's center become 'suggested' (purple) if they were pending, and are queued first for AI embedding when a model is loaded. The user sees 'Found 20 suggested reference frames'.  
**Parameters:** budget = max(5, min(50, int(N x 0.02))); min_cluster_size = max(5, N // 100); at least 5 frames required; batch size 32 on CPU, 128 on GPU; MobileNetV3-small embeddings, L2-normalized; Minimum 5 frames; budget = max(5, min(50, int(0.02 n))); resize 256, center crop 224, ImageNet mean/std; L2-normalized 576-d features; min frames 5; expected = max(5, min(50, int(frames x 0.02)))  
**Edge cases handled:** Fewer than 5 frames: 'Need at least 5 frames to find archetypes'.; No timeline built: 'Build a timeline first'.; Clicking again while running aborts.; Earlier suggestions are cleared first.; All frames are noise: 'No diverse reference frames found'.; More clusters than the budget: each still gets 1, so suggestions can exceed the budget.; Frames already reference, saved or propagated keep their status but still count as suggestions for navigation.; More clusters than budget still gives each cluster 1, exceeding the budget; Noise frames are never suggested; No clusters means no suggestions; Clicking again while running aborts the analysis  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

### RULE-023: Propagation seeds come only from mask segments on reference frames
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:3640-3668; legacy/lazylabel/src/lazylabel/ui/main_window.py:4257-4298; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:426-431; legacy/lazylabel/src/lazylabel/ui/workers/propagation_worker.py:254-287; legacy/lazylabel/src/lazylabel/ui/main_window.py:4475-4481`  
**Plain English:** Every non-empty mask segment on every reference frame becomes one tracked object (IDs 1..N); the open frame contributes its unsaved in-memory segments, other reference frames load from their annotation files.  
**Specification:**  
  Given Reference frame 0 is open with 1 AI mask and 1 drawn polygon (unsaved); reference frame 40 has a saved NPZ with 2 classes  
  When  Propagation starts  
  Then  3 objects are tracked: the AI mask from frame 0 and 2 class masks from frame 40; the polygon is ignored  
**Parameters:** Object ids assigned sequentially from 1 in reference-frame order  
**Edge cases handled:** Polygons, boxes and circles on the open frame have no mask and are silently excluded until saved and reloaded; Class names for all objects come from the open frame's aliases; No usable masks: 'No valid segments in reference frames'; The same polygon would be included after saving and reloading from NPZ, YOLO Seg or COCO, which carry masks; If no reference yields a non-empty mask: 'No valid segments in reference frames' and the run ends.; Aliases stored in a reference frame's own file are ignored when naming objects.  
**Suspected defect:** Shape annotations on the open reference frame are silently left out of propagation. | Polygons, boxes, circles and auto-converted AI polygons (mask None) on the open reference frame are silently excluded from propagation.  
**Confidence:** Medium — SME question: Should drawn polygons, boxes and circles be rasterized and used as propagation seeds? | The compliance and fidelity judges rated this not P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-024: Grayscale detection tolerance and 16-bit display conversion
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:451-480; legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:546-567`  
**Plain English:** A 3-channel image is treated as grayscale when adjacent channels never differ by more than 3 (8-bit) or 768 (16-bit); 16-bit results are shown and sent to SAM as value / 256, truncated.  
**Specification:**  
  Given A JPEG whose R, G and B values differ by at most 2 per pixel  
  When  The image is loaded  
  Then  It is processed as one channel (Gray slider, rescale and FFT enabled); a 16-bit pixel of 1000 displays as 3  
**Parameters:** Tolerance 3 (8-bit), 768 (16-bit)  
**Edge cases handled:** A nearly gray image with a maximum difference of 4 is treated as RGB  
**Confidence:** High — citation confirmed by an independent referee

### RULE-025: Propagation direction and range
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:577-686; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:629-647; legacy/lazylabel/src/lazylabel/ui/main_window.py:4350-4378; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:497-529; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:667-679; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:851-874`  
**Plain English:** Propagate always runs both ways: forward from the lowest reference frame to the range end, then backward from the lowest reference frame to the range start; the range defaults to the whole timeline.  
**Specification:**  
  Given 100 frames; references at 20 and 60; range 1-100  
  When  The user clicks Propagate  
  Then  Forward pass frames 21-99 (60 skipped as a reference), then backward pass 19-0  
**Parameters:** UI range is 1-indexed; full range treated as unbounded; streaming used only if enabled (default on) and frames exceed the window (default 250, allowed 50-1000); UI range is 1-based, converted to 0-based; Direction is always 'both'. Range spinboxes are 1-based and reset to 1..N whenever the frame count changes. A start of 0 or an end of N-1 means no limit.  
**Edge cases handled:** Start greater than end is not validated; forward pass is empty if end is below the lowest reference; A start above the lowest reference is ignored by the forward pass; Range ends on size-skipped frames snap to the nearest valid frame (start up, end down); The forward pass ignores the requested start and always begins at the earliest reference; No backward pass from later references is ever run; A range bound that lands on a skipped frame snaps to the nearest usable frame (start moves up, end moves down).; Reference after the range end (reference 90, range 11-50): the backward pass covers frames 89 down to 10.  
**Suspected defect:** The user's range is not honored on the near side of the earliest reference.  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

### RULE-026: Streaming (chunked) propagation windows
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:69-76; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:594-598; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:876-1085; legacy/lazylabel/src/lazylabel/ui/main_window.py:4203-4210; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:356-381; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:610-627`  
**Plain English:** When Streaming is on and there are more valid frames than the window size, frames are processed in windows overlapping by 5; each window re-loads all reference images, and frames already completed by an earlier window are skipped.  
**Specification:**  
  Given 600 valid frames, a reference at frame 0, window 250  
  When  Propagation runs forward  
  Then  Windows cover frames 0-249, 245-494 and 490-599; overlap frames keep the earlier window's results  
  And   Turning Streaming off with more frames than the window warns with an estimate of frames x 12.6 MB (1000 frames about 12 GB)  
**Parameters:** Window 50-1000 step 50, default 250; overlap 5 frames; memory estimate 12.6 MB per frame; streaming default on; chunk_size default 250 (UI 50-1000, step 50, saved as stream_window_size)  
**Edge cases handled:** Flagged frames in an overlap are re-processed by the next window; Masks do not carry between windows; only reference masks seed each window; Exactly 250 usable frames uses the all-at-once mode, since the rule is strictly greater than.; The overlap skip only knows about frames recorded as propagated, so frames that were only flagged in an earlier chunk are processed again.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-027: The fragment filter keeps only regions at least X% of the largest region
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:285-344; legacy/lazylabel/src/lazylabel/ui/main_window.py:1320-1324; legacy/lazylabel/src/lazylabel/ui/widgets/fragment_threshold_widget.py:46-51; legacy/lazylabel/src/lazylabel/ui/main_window.py:160-166`  
**Plain English:** Before an AI mask is accepted, each separate outer region is kept only if its contour area is at least threshold% of the largest region's area. A threshold of 0 turns the filter off, and Z toggles between 0 and the last non-zero value.  
**Specification:**  
  Given Fragment threshold 30; an AI mask with regions of contour area 2,000, 700 and 500 square px  
  When  The user accepts the preview  
  Then  Minimum area = 30% x 2,000 = 600. The 2,000 and 700 regions are kept, the 500 region is dropped, and the new mask is the filled outlines of the kept regions.  
**Parameters:** Range 0-100, default 0, saved in settings. Z toggle memory starts at 100 when the saved value is 0. Area is the contour polygon area, not a pixel count.; Range 0-100, default 0, toggle default 100; keep if area \>= threshold; area = contour polygon area  
**Edge cases handled:** Threshold 100 keeps only the largest region and any ties.; One-pixel-wide regions have contour area 0; if the largest region has area 0, everything is dropped.; Holes inside kept regions are filled whenever the threshold is above 0.; One-pixel-wide masks have contour area 0 and are always rejected when filtering is on  
**Suspected defect:** Any threshold above 0 fills interior holes, because outer contours are drawn filled, so mask shape changes beyond fragment removal. | With filter \> 0 the kept pieces are redrawn as filled outer contours, so holes inside the AI mask are filled; with filter 0 holes remain. Contour area undercounts small pieces relative to pixel counts.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-028: Display image adjustments (saturation, brightness/contrast, gamma)
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/photo_viewer.py:95-152; legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:88-107; legacy/lazylabel/src/lazylabel/ui/widgets/adjustments_widget.py:65-97; legacy/lazylabel/src/lazylabel/ui/main_window.py:1095-1097`  
**Plain English:** Displayed pixels are adjusted in order: saturation blend with BT.601 gray, then |p x (1 + contrast/100) + brightness| saturated to 0-255, then gamma LUT p' = trunc(255 x (p/255)^(1/gamma)).  
**Specification:**  
  Given Pixel values [0, 30, 100, 200, 255]  
  When  Contrast 50 and brightness 20 are applied  
  Then  Result [20, 65, 170, 255, 255]; with gamma 2.0 a pixel of 64 becomes 127  
  And   Saturation s gives gray + s x (orig - gray) with gray = 0.299R + 0.587G + 0.114B; alpha is preserved  
**Parameters:** Brightness -100..100 default 0; contrast -100..100 default 0; gamma slider 1-200 -\> 0.01-2.00 default 1.0; saturation slider 0-200 -\> 0.0-2.0 default 1.0  
**Edge cases handled:** Gamma values 0.29, 0.57, 0.58, 1.13-1.16 drift down by 0.01 on restart because int(gamma*100) truncates; Persisted saturation is applied at startup but the slider is never restored and shows 1.00  
**Suspected defect:** cv2.convertScaleAbs takes the absolute value, so negative brightness folds instead of clipping: brightness -100 turns [0, 30, 100, 200, 255] into [100, 70, 0, 100, 155].  
**Confidence:** High — citation confirmed by an independent referee

### RULE-029: Channel threshold posterization
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/channel_threshold_widget.py:503-568; legacy/lazylabel/src/lazylabel/ui/widgets/channel_threshold_widget.py:241-258; legacy/lazylabel/src/lazylabel/ui/widgets/channel_threshold_widget.py:422-453`  
**Plain English:** N threshold markers on a channel split values into N+1 bands: below the first marker becomes 0, at or above the last becomes the maximum, and middle band i becomes int(i/N x maximum).  
**Specification:**  
  Given An 8-bit grayscale image with the Gray channel enabled and markers [50, 150]  
  When  Thresholding is applied  
  Then  Values [10, 49, 50, 100, 149, 150, 255] become [0, 0, 127, 127, 127, 255, 255]  
  And   RGB images threshold only enabled channels; 16-bit images use maximum 65535; unchecking a channel clears its markers  
**Parameters:** Minimum marker spacing 10 units; slider max 256 (8-bit) or 65536 (16-bit); lower bound inclusive, upper exclusive  
**Edge cases handled:** The 10-unit spacing is negligible for 16-bit images; Applied only inside the crop when a crop is active  
**Confidence:** High — citation confirmed by an independent referee

### RULE-030: FFT frequency-band thresholding for grayscale images
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/fft_threshold_widget.py:373-496; legacy/lazylabel/src/lazylabel/ui/widgets/fft_threshold_widget.py:283-330`  
**Plain English:** The image spectrum is split into radial bands by cutoff percentages of the half-diagonal; band k of N+1 is weighted k/N (lowest band removed, highest kept), inverted, stretched to 0-255, then optionally quantized.  
**Specification:**  
  Given A grayscale image with one frequency cutoff at 10% (slider 1000) and one intensity threshold at 100  
  When  FFT thresholding is enabled  
  Then  Frequencies within 10% of the half-diagonal are zeroed (high-pass), the result is min-max stretched to 0-255, then pixels \<= 100 become 0 and \> 100 become 255  
**Parameters:** Frequency slider 0-10000 (0.01% steps); distance normalized by sqrt((H/2)^2 + (W/2)^2); quantized level = level/N x 255 truncated  
**Edge cases handled:** Only 2-D or exactly equal-channel images are processed; Output is always 8-bit, even for 16-bit input; No frequency cutoffs gives a plain contrast stretch  
**Suspected defect:** The cached spectrum is keyed only by image dimensions and is not invalidated when upstream rescale or channel-threshold settings change, so FFT output can come from a stale input.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-031: Histogram presets: contrast stretch, equalization, CLAHE
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/rescale_histogram_dialog.py:28-73; legacy/lazylabel/src/lazylabel/ui/widgets/rescale_histogram_dialog.py:512-564; legacy/lazylabel/src/lazylabel/ui/main_window.py:2809-2825`  
**Plain English:** Contrast stretch sets min/max at the chosen tail percentiles; equalization builds a CDF lookup table; CLAHE applies adaptive equalization with a clip limit and tile grid.  
**Specification:**  
  Given An 8-bit grayscale image and the default 0.4% saturation  
  When  The stretch preset is applied  
  Then  min = floor(0.4th percentile) and max = ceil(99.6th percentile), clamped to the data range; 0% uses the actual data min/max  
  And   Equalization LUT = (cdf - cdf_min)/max(1, N - cdf_min) x max, clipped and truncated  
**Parameters:** Stretch 0-50% in 0.1% steps, default 0.4%; CLAHE clip 2.0 (0.5-40), tiles 8x8 (2-32)  
**Edge cases handled:** The CLAHE result is computed on the crop region and discarded when the crop changes; Dragging the rescale handles clears any preset  
**Confidence:** High — citation confirmed by an independent referee

### RULE-032: Linear min/max rescale for grayscale images
**Category:** Calculation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/rescale_widget.py:330-393; legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:388-407`  
**Plain English:** Grayscale values are clipped to [min, max] and stretched to the full output range, truncating fractions.  
**Specification:**  
  Given An 8-bit grayscale image with min 50 and max 200  
  When  Rescale is applied  
  Then  Values [30, 50, 125, 200, 250] become [0, 0, 127, 255, 255] via (clip(v,50,200) - 50)/150 x 255  
  And   Processing order is rescale, then channel threshold, then FFT, then 16-bit to 8-bit, then display adjustments  
**Parameters:** Output max 255 (8-bit) or 65535 (16-bit); inactive when handles are at full range  
**Edge cases handled:** RGB images: rescale disabled; max \<= min leaves the image unchanged; Restricted to the crop region when a crop is active  
**Confidence:** High — citation confirmed by an independent referee

### RULE-033: Annotation marker size, pan step and zoom
**Category:** Calculation  
**Priority:** P2  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:515-543; legacy/lazylabel/src/lazylabel/ui/main_window.py:1308-1314; legacy/lazylabel/src/lazylabel/ui/widgets/annotation_settings_widget.py:69-87; legacy/lazylabel/src/lazylabel/ui/managers/viewport_manager.py:22-80; legacy/lazylabel/src/lazylabel/ui/photo_viewer.py:180-185`  
**Plain English:** Point radius = 0.3 x size multiplier and line width = 0.5 x multiplier; Ctrl+Plus/Minus change the multiplier by 0.1 (not image zoom); WASD pans 10% of the view x pan multiplier; the mouse wheel zooms 1.25x in and 0.8x out.  
**Specification:**  
  Given Size slider 20 (multiplier 2.0), pan slider 15 (1.5) and an 800 px tall view  
  When  The user presses W  
  Then  Points draw with radius 0.6 and lines 1.0 wide; the view scrolls up 120 px (800 x 0.1 x 1.5)  
**Parameters:** Size slider 1-50 (0.1-5.0), pan slider 1-100 (0.1-10.0), defaults 1.0  
**Edge cases handled:** Ctrl+Plus is clamped at multiplier 5.0  
**Suspected defect:** The pan tooltip and startup tip promise 'Hold Shift for 5x boost' (annotation_settings_widget.py:84, utils/startup.py:48) but no code applies a boost.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-034: Class display color
**Category:** Calculation  
**Priority:** P2  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/segment_display_manager.py:219-245`  
**Plain English:** Each class color is HSV with hue = int(class_id x 222.4922359) mod 360, saturation 220 and value 220; segments without a class are gray.  
**Specification:**  
  Given Class ids 0, 1, 2, 3  
  When  Segments are drawn  
  Then  Hues are 0, 222, 84 and 307  
**Parameters:** Hue step 222.4922359 degrees; S=220; V=220; no-class color HSV(0,0,128)  
**Edge cases handled:** None recorded  
**Confidence:** High — citation confirmed by an independent referee

### RULE-035: Confidence histogram binning
**Category:** Calculation  
**Priority:** P2  
**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/confidence_histogram_dialog.py:26-76; legacy/lazylabel/src/lazylabel/ui/widgets/confidence_histogram_dialog.py:214-219; legacy/lazylabel/src/lazylabel/ui/main_window.py:4725-4739`  
**Plain English:** The histogram shows 50 bins from max(0, min(threshold, lowest score) - 0.02) to 1.0, counts scores strictly below the threshold as 'Below', and accepting the dialog sets Min Conf.  
**Specification:**  
  Given Scores [0.95, 0.97, 0.995, 1.0] and threshold 0.99  
  When  The histogram opens  
  Then  View range 0.93-1.0; Below 2 (50%), Above 2 (50%)  
**Parameters:** 50 bins; view padding 0.02  
**Edge cases handled:** None recorded  
**Confidence:** High — citation confirmed by an independent referee

### RULE-036: File list annotation-status indicators
**Category:** Calculation  
**Priority:** P2  
**Source:** `legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:186-235; legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:611-692; legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:138-153`  
**Plain English:** Each image row marks which annotation files exist by base-name match: .npz (not _CM), _CM.npz, .txt (not _seg), _seg.txt, _coco.json, _createml.json, .xml.  
**Specification:**  
  Given Files img.png, img_CM.npz, img_seg.txt  
  When  The folder is scanned  
  Then  img.png shows NPZ Class Map and YOLO Seg present; NPZ and YOLO Det absent  
**Parameters:** Suffixes: .npz (not ending _CM), _CM.npz (case-sensitive), .txt (not ending _seg), _seg.txt, _coco.json, _createml.json, .xml  
**Edge cases handled:** Batch status refresh never updates the NPZ Class Map column; Image foo_seg.png shows no YOLO Det although foo_seg.txt exists and is loaded for it; The batch refresh does not re-check the Class Map column (fast_file_manager.py:670-677).; Files created outside the app appear only after a re-scan or after that row is saved.  
**Suspected defect:** batchUpdateFileStatus omits has_cm_npz.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

## Validation rules (15)

### RULE-037: COCO JSON import with polygon-then-box fallback
**Category:** Validation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:602-710`  
**Plain English:** Categories become aliases ('name.supercategory' when they differ); each polygon of 6+ numbers becomes its own mask segment with category_id as class; if no polygon yields pixels, the [x, y, w, h] box is used, clamped to the image.  
**Specification:**  
  Given 640x480 image; category {id 2, name 'dog', supercategory 'animal'}; annotation category_id 2 with RLE segmentation and bbox [630, 470, 20, 20]  
  When  img_coco.json is loaded  
  Then  Alias 2 = 'dog.animal'; RLE ignored; box clamped to x 630-639, y 470-479 giving one 10x10 segment of class 2  
**Parameters:** Minimum polygon length 6 numbers; coordinates rounded with Python round()  
**Edge cases handled:** Missing category_id becomes class 0; non-numeric category_id skips the annotation; image_id is ignored; every annotation is assumed to belong to this image; A multi-polygon annotation becomes several segments; Top level not an object: error logged, nothing loaded; Annotations whose polygon and bbox are both unusable are silently dropped; NPZ loading replaces aliases wholesale while COCO merges them  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 1 near-duplicate card(s) from other lenses were folded in

### RULE-038: NPZ import (current and legacy layouts)
**Category:** Validation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:224-280; legacy/lazylabel/src/lazylabel/core/file_manager.py:335-343`  
**Plain English:** Each non-empty channel of 'mask' (or legacy 'masks') becomes one segment whose class is class_order[channel] when stored, else the channel index; a legacy N x H x W 'masks' stack with 'class_ids' becomes one segment per mask; stored aliases replace current aliases.  
**Specification:**  
  Given img.npz with mask shape (480, 640, 3), class_order [0, 3, 7], channel 1 empty  
  When  img.npz is loaded  
  Then  Two segments: class 0 and class 7  
**Parameters:** Channel-to-class: class_order[i] if present and i \< len(class_order), else i  
**Edge cases handled:** Older files without class_order treat channel index as class ID; class_order shorter than the channel count: extra channels use their index; A 2-D mask is treated as a single channel; Mask size is not checked against the image; a mismatch surfaces later as a save failure; Legacy stack entry without a class_ids value becomes class 0; NPZ mask size is not checked against the image size; a mismatched file loads and later fails at save; An NPZ with neither 'mask' nor 'masks' loads nothing and still stops the load chain  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 1 near-duplicate card(s) from other lenses were folded in

### RULE-039: Pascal VOC and CreateML import rules
**Category:** Validation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:456-540`  
**Plain English:** VOC objects need both a name and a bndbox (missing coordinates default to 0, xmax/ymax exclusive); CreateML uses only the first image entry and converts center/size pixels to a box; both then use name-to-class resolution and clamp/drop rules.  
**Specification:**  
  Given VOC object name 'dog', xmin 100, ymin 50, xmax 110, ymax 60  
  When  img.xml is loaded  
  Then  One 10x10 mask segment covering columns 100-109 and rows 50-59  
**Parameters:** None  
**Edge cases handled:** VOC files from tools using inclusive xmax lose 1 px in width and height; Empty name becomes label '0' (class 0); CreateML arrays with several images: only the first is used; missing label becomes '0'  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful

### RULE-040: YOLO Detection import validation, rounding and clamping
**Category:** Validation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:381-454`  
**Plain English:** Each line must have exactly 5 tokens with numeric coordinates; boxes are converted to pixels with rounding, clamped to the image, dropped if empty, and loaded as filled rectangular mask segments.  
**Specification:**  
  Given 640x480 image; lines '3 0.5 0.5 0.25 0.5', '2 0.5 0.5 0.1', 'cat 1.1 0.5 0.2 0.2'  
  When  img.txt is loaded  
  Then  Line 1: class 3 mask columns 240-399, rows 120-359; line 2 skipped (4 tokens); line 3: x1 = 640, x2 clamped to 640, box empty and dropped  
**Parameters:** x2/y2 exclusive; Python round() (half to even); Rounding = Python round() (10.5 -\> 10, 11.5 -\> 12); clamp x1,y1 \>= 0, x2 \<= width, y2 \<= height  
**Edge cases handled:** Label 'cat' still receives a class ID and alias even though its only box was dropped; Prediction files with a 6th confidence token are skipped line by line; Loaded boxes are masks (type 'Loaded'), not editable rectangles; A same-named non-annotation .txt (e.g. a caption file) loads nothing but still stops the load chain; Negative coordinates are clamped to 0  
**Confidence:** Medium — SME question: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-041: YOLO Segmentation import validation
**Category:** Validation  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:542-600`  
**Plain English:** A line needs a label plus at least 3 coordinate pairs (7 or more tokens, odd count, all numeric); points are scaled to pixels with rounding, filled into a mask, and dropped if no pixel is set.  
**Specification:**  
  Given 640x480 image; line '0 0.1 0.1 0.2 0.1 0.2 0.2'  
  When  img_seg.txt is loaded  
  Then  One segment of class 0, vertices [[64,48],[128,48],[128,96]], mask = filled triangle  
**Parameters:** min tokens 7; token count must be odd; Minimum tokens 7; rounding Python round()  
**Edge cases handled:** An 8-token line is skipped entirely; A polygon fully outside the image yields no pixels and is dropped; Loaded segments are type 'Loaded' masks and cannot be vertex-edited even though vertices are kept; Loaded polygons are type 'Loaded', so Edit mode (Polygon/Circle only) cannot edit them despite stored vertices; A 5-token YOLO Detection file with a colliding '_seg.txt' name loads nothing  
**Confidence:** Medium — SME question: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-042: Class alias editing is unvalidated
**Category:** Validation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:393-399; legacy/lazylabel/src/lazylabel/ui/right_panel.py:228-240; legacy/lazylabel/src/lazylabel/ui/right_panel.py:295-314; legacy/lazylabel/src/lazylabel/ui/managers/segment_table_manager.py:88-94`  
**Plain English:** Any text, including empty or duplicate text, is accepted as a class alias; classes without an alias show and export their number.  
**Specification:**  
  Given Class 3 has no alias  
  When  Exporting Pascal VOC before and after the user types 'person' as alias  
  Then  Before: object name '3'; after: 'person'  
**Parameters:** None  
**Edge cases handled:** Duplicate aliases merge classes when name-based files are reloaded; Editing the active class row can store the active-marker prefix (a diamond symbol plus space) inside the alias, which then appears in VOC/CreateML/COCO labels; Aliases are per image, not project-wide  
**Suspected defect:** Active-class display marker can leak into saved labels; no uniqueness check.  
**Confidence:** Medium — SME question: Must aliases be unique, non-empty, and defined once per project?

### RULE-043: Manual box and circle minimum sizes
**Category:** Validation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:370-449; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:451-537; legacy/lazylabel/src/lazylabel/core/segment_manager.py:187-203`  
**Plain English:** A drawn box must be at least 1 x 1 px and is stored as a 4-corner polygon; a circle needs radius of at least 1 px and is stored as center plus a 3 o'clock radius point; holding Shift at release erases instead.  
**Specification:**  
  Given Circle mode; drag from (50,50) to (53.9,50)  
  When  Mouse released  
  Then  Circle segment with vertices [[50,50],[53.9,50]]; on save it rasterizes as a filled disc of radius round(3.9) = 4 at (50,50)  
**Parameters:** box min width and height 1 px; circle min radius 1.0 px  
**Edge cases handled:** A 0.5 x 3 px box creates nothing; Editing a circle's radius below 0.5 px keeps the segment but it saves as nothing  
**Confidence:** High — citation confirmed by an independent referee

### RULE-044: Propagation preconditions
**Category:** Validation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:4011-4120; legacy/lazylabel/src/lazylabel/ui/main_window.py:4708-4716; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:629-665; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:825-835`  
**Plain English:** Propagation starts only if AI packages are installed, sequence mode exists, at least one reference frame is set, no initialization/reference/propagation job is running, and a loaded model offers a SAM 2 video predictor.  
**Specification:**  
  Given Timeline with 2 reference frames; SAM 1 vit_h loaded  
  When  The user clicks Propagate  
  Then  'SAM 2 video predictor not available' and nothing runs  
**Parameters:** Other messages: install hint, 'Please enter sequence mode first', 'Initialization already in progress', 'Adding references in progress', 'Propagation already in progress'  
**Edge cases handled:** No reference: 'Please set a reference frame first'; Second click while running: 'Propagation already in progress' (the button acts as Abort while propagating); Without the AI extras, the Reference, Propagation and Review panels are hidden and Propagate is disabled; Trim stays available.; Propagate is disabled when there are no references or no frames.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-045: Crop coordinate validation and reuse by image size
**Category:** Validation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:111-153; legacy/lazylabel/src/lazylabel/ui/widgets/border_crop_widget.py:104-141; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:553-558; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:227-238; legacy/lazylabel/src/lazylabel/ui/main_window.py:2153-2156; legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:70-100`  
**Plain English:** A crop needs an open image; typed values must be integer 'start:end' pairs for both X and Y; values are rounded, clamped to 0..width-1 and 0..height-1, swapped if reversed, and remembered for images of the same width x height.  
**Specification:**  
  Given 640x480 image; user types X '700:-10', Y '20:460'  
  When  The user clicks Apply  
  Then  Crop stored as (0, 20, 639, 460) under key (640, 480); status 'Crop applied: 0:639, 20:460'  
**Parameters:** Drawn crop must exceed 5x5 px, then mode switches to AI points; memory key = (width, height)  
**Edge cases handled:** Zero-width crop (x1 = x2) is accepted and zeroes every annotation on save; Crop is reapplied by size only on the legacy tree-view load path; the main file-list/arrow-key path (load_image_by_path) clears it via reset and never restores it, although the size map still holds it; Clear Crop forgets the entry for the current image size; Missing either coordinate: 'Enter both X and Y coordinates'; non-numeric: 'Invalid coordinates. Use numbers only.'  
**Suspected defect:** Crop persistence by image size works on one of two navigation paths only.  
**Confidence:** Medium — SME question: Should a crop automatically apply to every later image with the same resolution, and on all navigation paths?

### RULE-046: Edit mode eligibility and 200-vertex limit
**Category:** Validation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/mode_manager.py:55-112; legacy/lazylabel/src/lazylabel/ui/managers/edit_mode_manager.py:94-135; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:81-97; legacy/lazylabel/src/lazylabel/ui/managers/edit_mode_manager.py:188-239`  
**Plain English:** Edit mode opens only if at least one selected segment is a Polygon or Circle; vertex handles appear only for polygons with at most 200 vertices; dragging moves selected polygons and circles only.  
**Specification:**  
  Given Selected: one AI mask and one polygon with 350 vertices  
  When  The user presses R  
  Then  Edit mode opens but shows 'Polygon has 350 vertices (max 200 for editing)...' and no handles; with only the AI mask selected: 'No editable shapes selected!'  
**Parameters:** Editable types: Polygon, Circle. max_editable_vertices 200 (also hardcoded elsewhere).  
**Edge cases handled:** Masks and imported 'Loaded' polygons are never editable; Moving a circle center moves its radius point by the same offset; moving the radius point resizes; In edit mode with nothing selected, R fails the check, so R cannot leave edit mode.; Polygons loaded from YOLO-seg or COCO files are type 'Loaded' and cannot be edited.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-047: A polygon needs 3 points and closes when clicking within the join distance of its first point
**Category:** Validation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/polygon_drawing_manager.py:68-120; legacy/lazylabel/src/lazylabel/ui/managers/polygon_drawing_manager.py:166-224; legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:87-98; legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:187-230; legacy/lazylabel/src/lazylabel/config/settings.py:26; legacy/lazylabel/src/lazylabel/ui/widgets/annotation_settings_widget.py:89-93; legacy/lazylabel/src/lazylabel/config/settings.py:26-26`  
**Plain English:** In polygon mode each click adds a vertex. Once there are more than 2 vertices, a click closer to the first vertex than the join threshold finishes the polygon (with Shift it erases instead), and Space also finishes it. Fewer than 3 vertices never create a segment.  
**Specification:**  
  Given Polygon mode, join threshold 2 px, vertices at (10,10), (50,10) and (50,50)  
  When  The user clicks at (11,11)  
  Then  Squared distance 2 is less than 4, so the polygon (10,10),(50,10),(50,50) is added with the active class (or the next free class) and add_segment is recorded for undo. A click at (12,10), squared distance 4, would add a fourth vertex instead.  
**Parameters:** polygon_join_threshold default 2 px, strict less-than on squared distance; Join threshold default 2 px, range 1-10; distance test strictly less than; minimum 3 points; polygon_join_threshold default 2, allowed 1-10  
**Edge cases handled:** In single view, Enter finishes the polygon and then saves.; Shift+click near the start, or Shift+Space, erases overlapping segments instead.; Each vertex click can be undone.; Enter in polygon mode does nothing in sequence view (only single and multi branches exist); Space/Enter with fewer than 3 points does nothing, silently; Threshold is in image pixels, not screen pixels  
**Suspected defect:** In the Sequence tab, Enter in polygon mode does nothing (no finish, no save), because only the single-view and multi-view branches exist.  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

### RULE-048: Reference frames must match the first reference's image size
**Category:** Validation  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:210-288; legacy/lazylabel/src/lazylabel/ui/main_window.py:3877-3980; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:218-272; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:313-341`  
**Plain English:** The first frame marked as reference fixes the required height and width. Later frames of another size are refused, and the lock is released only when no references remain.  
**Specification:**  
  Given Timeline with no references; frame 5 is 1920x1080 and frame 9 is 1280x720  
  When  The user presses G on frame 5, then G on frame 9  
  Then  Frame 5 becomes 'reference' and the required size is locked at 1080 high x 1920 wide. Frame 9 is refused with 'Cannot add reference: image is 1280x720 but reference requires 1920x1080' and keeps its status. '+ All Before' on frame 40 adds every earlier frame that matches and reports the rest as '(N skipped: dimension mismatch)'. '+ All Labeled' considers only frames that already have an annotation file in any of the 7 formats.  
**Parameters:** Size is read from the image header (QImageReader); the (height, width) match must be exact; Size compared as (height, width), read from the file header  
**Edge cases handled:** If the header size cannot be read, the frame is accepted with no size check.; '+ All Before' follows on-screen order when the timeline is sorted.; Marking a reference copies the CURRENT frame's segments into every added frame's record (sequence_view_mode.py:239-240, 248-267); propagation never uses that copy.; Removing the last reference unlocks the size.; add_reference_frame falls back to the raw timeline index for an unmapped frame, which can point at a different image; 'Add all before' and 'Add all labeled' report rejections as 'skipped: dimension mismatch'; 'Add all labeled' accepts any annotation format although its docstring says NPZ; An unreadable image header skips the size check and the frame is accepted  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

### RULE-049: Hotkey assignment conflicts are blocked
**Category:** Validation  
**Priority:** P2  
**Source:** `legacy/lazylabel/src/lazylabel/config/hotkeys.py:210-275; legacy/lazylabel/src/lazylabel/ui/hotkey_dialog.py:310-358`  
**Plain English:** A key already used as primary or secondary key by another action cannot be assigned; mouse bindings cannot be changed or saved; a secondary key may be cleared.  
**Specification:**  
  Given M is bound to Merge Selected Segments  
  When  The user assigns M to Delete Selected Segments  
  Then  'Key Conflict' warning; the field reverts  
**Parameters:** None  
**Edge cases handled:** Conflicts in a hand-edited hotkeys.json are not checked on load; Invalid hotkeys.json keeps defaults  
**Confidence:** High — citation confirmed by an independent referee

### RULE-050: Annotation setting input limits
**Category:** Validation  
**Priority:** P2  
**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/annotation_settings_widget.py:69-93; legacy/lazylabel/src/lazylabel/ui/widgets/annotation_settings_widget.py:129-167; legacy/lazylabel/src/lazylabel/ui/widgets/fragment_threshold_widget.py:80-88`  
**Plain English:** Typed values are clamped: annotation size 0.1-5.0, pan speed 0.1-10.0, join threshold 1-10, fragment filter 0-100; non-numeric input reverts to the current slider value.  
**Specification:**  
  Given User types 25 into Join  
  When  Editing finishes  
  Then  Join threshold becomes 10  
**Parameters:** None  
**Edge cases handled:** Size '0.05' becomes 0.1  
**Confidence:** High — citation confirmed by an independent referee

### RULE-051: Supported image formats
**Category:** Validation  
**Priority:** P2  
**Source:** `legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:36-37; legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:186-250; legacy/lazylabel/src/lazylabel/core/file_manager.py:741-743; legacy/lazylabel/src/lazylabel/ui/main_window.py:1440-1445; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:147`  
**Plain English:** Only .png, .jpg, .jpeg, .tiff and .tif files (extension case-insensitive) directly inside the chosen folder are listed and loadable.  
**Specification:**  
  Given Folder containing a.PNG, b.bmp and sub/c.jpg  
  When  The folder is opened  
  Then  Only a.PNG is listed  
**Parameters:** None  
**Edge cases handled:** Background discovery also collects .bmp, .gif and .webp despite a comment claiming the same list; No subfolder scanning  
**Suspected defect:** Inconsistent extension lists across modules.  
**Confidence:** Medium — SME question: Citation was corrected by referee (The rule is true, but 2 of the 5 cited ranges contradict it and should not count as evidence. Paths are relative to E:\\GitHub\\LazyLabel. WHAT SUPPORTS THE RULE (running code): - utils/fast_file_manager.py:37 defines IMAGE_EXTENSIONS as .png, .jpg, .jpeg, .tiff and .tif. - Listing: utils/fast_file_manager.py:186-250. FileScanner.run reads only the top level of the folder with os.scandir(self.directory) and never goes into subfolders. It lowercases the extension (:192). Only entries whose extension is in the set are kept (:212-213), turned into rows and sent to the list (:237-250). - How opening a folder reaches that scan: main_window.py:1435 calls right_panel.py:327, then fast_file_manager.py:1215/1224, then FastFileModel.setDirectory at :535, which starts FileScanner at :549. - So for the example: a.PNG is listed. b.bmp is not listed. sub/c.jpg is not listed, because "sub" has no extension and the scan does not go into it. - Loading: core/file_manager.py:741-743 (is_image_file) does a lowercase endswith check on the same five extensions. It is the actual load check at main_window.py:1442-1445 (_load_image_from_path, used by the file list) and at ui/managers/file_navigation_manager.py:147. - Sequence mode builds its frames from file_manager.getFilesInRange (main_window.py:4960-4969), which uses the same five-extension list. CITED RANGES THAT CONTRADICT THE RULE: - ui/workers/image_discovery_worker.py:7-8 lists 8 extensions, adding .bmp, .gif and .webp. The comment on line 7 says it uses the same extensions as FastFileManager, which is false. This is an outdated comment, not text aimed at an AI. - Its result only fills cached_image_paths (main_window.py:7308). The only code that reads it is image_preload_manager.py:41-59, which picks neighbouring images to preload. - Those extra formats are never listed or shown, because the load check rejects them. They can still be decoded in the background, though. The preload also counts neighbours in a different list than the one on screen, so it can pick the wrong images. - ui/main_window.py:5384-5393 (_get_sequence_image_paths) includes .bmp, but nothing under legacy/lazylabel calls it. It is dead code. EDGE CASES: - FileScanner never checks entry.is_file() (fast_file_manager.py:186-213). A subfolder named like an image, e.g. "x.jpg", would appear in the list. Opening it is refused by file_path.is_file() at main_window.py:1442. - The old tree view is hidden (right_panel.py:122). It filters on the same five extensions (utils/custom_file_system_model.py:29-30). No credentials were found in the evidence.) — confirm legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:36-37; legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:186-250; legacy/lazylabel/src/lazylabel/core/file_manager.py:741-743; legacy/lazylabel/src/lazylabel/ui/main_window.py:1440-1445; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:147 is the authoritative implementation.

## Lifecycle rules (26)

### RULE-052: Undo/redo history scope
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:28-131; legacy/lazylabel/src/lazylabel/ui/main_window.py:2186-2189; legacy/lazylabel/src/lazylabel/ui/main_window.py:3585-3589; legacy/lazylabel/src/lazylabel/core/segment_manager.py:58-63; legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:631-683; legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:135-181; legacy/lazylabel/src/lazylabel/ui/managers/segment_table_manager.py:53-100; legacy/lazylabel/src/lazylabel/ui/main_window.py:3025-3026`  
**Plain English:** Any new recorded action clears the redo stack; history is cleared when a new image or timeline frame loads; only add segment, add point, add polygon point, move polygon, move vertex, move circle and erase are undoable.  
**Specification:**  
  Given User added 2 segments and undid 1  
  When  The user draws a new polygon  
  Then  The undone segment can no longer be redone  
**Parameters:** No history length cap; Recorded actions: add_segment, add_point, add_polygon_point, move_polygon, move_vertex, move_circle, erase_segments. A delete_segments handler exists but nothing records it. No depth limit.  
**Edge cases handled:** Undo of add segment works by list index, so unrecorded deletes/merges can make it remove another segment or fail; Not undoable: delete, merge, reassign IDs, alias edits, auto-polygon conversion, multi-view polygon add/erase, crop; Redo of erase removes the last N segments in the list; If the earlier add's index is still in range, undo removes a different segment than the one originally added; Multi-view deletes are also not undoable; An unknown action type shows a warning and is dropped from both lists.; Redo of add_segment re-appends the segment at the end, not at its original index.  
**Suspected defect:** Undo/redo handlers for 'delete_segments' exist but no code records that action type. | Unrecorded deletions shift indices, so undo can remove the wrong segment; the deletion itself cannot be undone.  
**Confidence:** High — citation confirmed by an independent referee; the only P0 judge that returned a verdict rated it P0 and faithful (the other judge failed); 2 near-duplicate card(s) from other lenses were folded in

### RULE-053: Undoing an erase inserts malformed segment records
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:574-629; legacy/lazylabel/src/lazylabel/core/segment_manager.py:525-525; legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:253-266; legacy/lazylabel/src/lazylabel/core/segment_manager.py:646-707; legacy/lazylabel/src/lazylabel/core/segment_manager.py:752-814`  
**Plain English:** Erase records wrapper entries {index, segment}, but undo passes each wrapper straight to add_segment, so undo appends records with no mask, type or vertices and leaves the pieces created by the erase in place.  
**Specification:**  
  Given Segment #2 (class 1, 1,000 px) was erased down to a 942-px piece  
  When  The user presses Ctrl+Z  
  Then  The 942-px piece stays; a new record {index 2, segment {...}, class_id = active or next class} with no mask is appended; notification 'Undid: Erase 1 segment(s)'; the original is not restored  
**Parameters:** Action type 'erase_segments'; redo deletes the last N segments; Surviving pieces must be more than 10 px, using 8-connectivity. Erased polygons and circles become mask segments of type 'AI'.  
**Edge cases handled:** The malformed record can introduce a new class ID, producing an empty extra channel in NPZ on save; Redo then deletes the last N list entries, which may be unrelated segments; Redo then deletes the phantom but the original stays lost; A segment erased completely also cannot be restored.; Redo deletes the last N segments, which removes the wrong ones if anything was added after the undo.  
**Suspected defect:** Payload shape mismatch between erase recording and undo replay. | Undo should restore the original segments at their indices and remove the split pieces; instead it corrupts the class list with an empty class. | Erase undo restores wrapper records instead of segments and never removes the split pieces.  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 2 near-duplicate card(s) from other lenses were folded in

### RULE-054: Closing the application never saves the open image's annotations
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:2064-2108`  
**Plain English:** On window close only application settings are written; the segments of the open image, sequence frame or multi-view pair are discarded without saving or asking, even when Auto-Save is on.  
**Specification:**  
  Given img_005.png open with 4 unsaved segments; Auto-Save on  
  When  The user closes the main window  
  Then  settings.json is written; no img_005.npz or img_005.txt is written; the 4 segments are lost  
**Parameters:** None  
**Edge cases handled:** Propagated but unsaved sequence frames are also lost; The hotkey dialog does prompt for unsaved changes, the main window does not  
**Suspected defect:** Auto-Save implies work is preserved, yet the last image edited before exit is never saved.  
**Confidence:** Medium — SME question: Should closing auto-save (when Auto-Save is on) or prompt about unsaved annotations? Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-055: Leaving a sequence frame saves it and marks it Saved, even if it is a reference
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:3414-3434; legacy/lazylabel/src/lazylabel/ui/main_window.py:3480-3519; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:365-373; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:143-159`  
**Plain English:** When the user moves to a different frame with Auto-Save on, the frame being left is saved in every selected format, marked saved, and its in-memory propagated masks are dropped. If it has no annotations, all of its annotation files are deleted and its status is left as it was.  
**Specification:**  
  Given Auto-Save on. Current frame 7 has 2 segments and status 'reference'.  
  When  The user clicks frame 8 on the timeline, or jumps with N, B or H  
  Then  Frame 7 is exported (by default NPZ + YOLO detection). Its status becomes 'saved' (cyan) although it is still a reference, and its propagated masks are removed from memory. Frame 8 then opens. If frame 7 had 0 segments, all 7 annotation file formats for frame 7 are deleted and its status does not change.  
**Parameters:** Auto-Save default True (config/settings.py:45). Fires only when the target frame differs from the current frame.  
**Edge cases handled:** Re-selecting the current frame never saves.; With Auto-Save off, edits are discarded on navigation without a prompt.; Write errors are caught inside the save itself (save_export_manager.py:131-133), so the frame is still marked saved and its propagated masks are dropped.; If the user scrubs frames during propagation, saves still happen but the timeline color change is suppressed (main_window.py:3843-3854).; Merely reviewing propagated frames commits them to disk; With Keep Flagged on, visiting a flagged frame auto-saves its low-confidence masks although Save All excludes flagged frames; Building a timeline, trimming, and Save All reload the current frame without saving it first; Auto-Save off: leaving a frame discards edits  
**Suspected defect:** Saving overwrites REFERENCE with SAVED. The next Propagate then resets SAVED to PENDING, so a reference frame's status silently degrades, and Find Archetypes can later mark it 'suggested'. Deleting every mask on a propagated frame also does not stick: the empty save deletes the files but keeps the propagated masks and 'propagated' status, so revisiting the frame or Save All brings them back.  
**Confidence:** Medium — SME question: Should a reference frame keep its 'reference' status after it is saved? Should clearing all masks on a propagated frame discard its propagated result? | The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-056: Leaving the Sequence tab or clicking New Timeline discards all sequence work without saving
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:3043-3060; legacy/lazylabel/src/lazylabel/ui/main_window.py:4998-5035; legacy/lazylabel/src/lazylabel/ui/main_window.py:5346-5382; legacy/lazylabel/src/lazylabel/ui/main_window.py:7242-7272; legacy/lazylabel/src/lazylabel/ui/main_window.py:2064-2108`  
**Plain English:** Switching away from the Sequence tab, or clicking New Timeline, stops archetype analysis, resets the engine, and wipes references, statuses, unsaved propagated masks and the Start/End markers. The current frame is not auto-saved. Switching tabs never saves, and closing the app saves settings only.  
**Specification:**  
  Given Sequence tab with 300 frames: 250 green (propagated, unsaved) and unsaved edits on the current frame  
  When  The user clicks the Single tab  
  Then  All 250 propagated results, all references and the current frame's edits are discarded. Single view reloads the current image's annotations from disk. Returning to Sequence shows the setup screen (Set Start / Set End / Build Timeline).  
**Parameters:** None  
**Edge cases handled:** The branch in _enter_sequence_mode that restores a timeline when returning to the tab can never run, because leaving the tab always clears the built flag.; Going from Single to Multi and back also reloads from disk, dropping unsaved single-view edits.; Closing the window stops workers and saves settings only; there is no annotation save or prompt.  
**Suspected defect:** Unsaved propagated masks and edits are lost silently, with no confirmation.  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful

### RULE-057: Multi-view batch navigation always saves, ignoring the Auto-Save setting
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:6559-6636; legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:102-107; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:390-423; legacy/lazylabel/src/lazylabel/ui/main_window.py:6491-6557`  
**Plain English:** In two-viewer mode, moving to another pair of images saves both current images (or deletes all files of a viewer image with no segments) every time, even when Auto-Save on Navigate is off, and without applying any crop.  
**Specification:**  
  Given Multi-view shows img_010.png (3 segments) and img_011.png (0 segments); Auto-Save is OFF  
  When  The user presses Right to load the next pair  
  Then  img_010 outputs are written in the selected formats and every sidecar of img_011 is deleted before img_012/img_013 load  
**Parameters:** Viewers saved: indices 0 and 1 only  
**Edge cases handled:** Crop is never applied to multi-view saves (ExportContext built without crop); crop apply/clear in multi-view calls methods that do not exist (_apply_multi_view_crop_coordinates, remove_multi_view_crop_visual); Settings allow multi_view_grid_mode '4_view' but only two viewers are saved; Save errors are only logged, the user is not notified; A viewer whose image failed to load (blank picture) is skipped.; An empty second viewer at the end of the list is skipped.; Saving still happens before 'Reached end of image list' is shown.  
**Suspected defect:** Auto-Save setting ignored; behavior differs from single-view and sequence mode.  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful; 1 near-duplicate card(s) from other lenses were folded in

### RULE-058: Propagation finish, Save All and Trim reload the current frame without saving it
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:4638-4645; legacy/lazylabel/src/lazylabel/ui/main_window.py:4834-4839; legacy/lazylabel/src/lazylabel/ui/main_window.py:5290-5291; legacy/lazylabel/src/lazylabel/ui/main_window.py:3577-3638; legacy/lazylabel/src/lazylabel/ui/main_window.py:4257-4298`  
**Plain English:** After propagation completes, after Save All, and after a trim, the current frame's segments are cleared and reloaded (propagated masks first, otherwise the file on disk). Any unsaved annotations on that frame are lost.  
**Specification:**  
  Given The user draws 3 masks on frame 3 (no file on disk yet), presses G to make it a reference, then presses Ctrl+P without leaving the frame  
  When  Propagation finishes  
  Then  The 3 masks are used as prompts. Frame 3 is then cleared and reloaded from disk, where nothing exists, so it shows 0 segments. Leaving the frame saves an empty list, so no annotation file is ever written for the reference frame.  
**Parameters:** Reload order: propagated masks (non-reference frames only), then the preload mask cache (never populated), then disk.  
**Edge cases handled:** If the current frame is not a reference and has propagated masks, the user's edits are replaced by those masks.; Trim re-selects the same frame index, which skips auto-save before reloading.; The preload mask cache consulted on reload is never assigned anywhere, so the step is dead.  
**Suspected defect:** Unsaved annotations on the current frame, including a reference that was just used for propagation, are silently discarded.  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful

### RULE-059: Auto-save current image before switching images (single view)
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:153-162; legacy/lazylabel/src/lazylabel/config/settings.py:45-46; legacy/lazylabel/src/lazylabel/ui/widgets/settings_widget.py:38-44; legacy/lazylabel/src/lazylabel/ui/main_window.py:3480-3519; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:401-403; legacy/lazylabel/src/lazylabel/ui/main_window.py:6491-6497; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:254-376; legacy/lazylabel/src/lazylabel/ui/main_window.py:2138-2193`  
**Plain English:** Selecting a different image first saves the open image in all selected export formats, but only when 'Auto-Save on Navigate' is on (default) and an image was already open; the new image then starts with a clean segment list, class aliases, crop and undo history.  
**Specification:**  
  Given img_001.png open with 2 segments; Auto-Save on; export formats NPZ + YOLO Detection  
  When  The user presses Right (or double-clicks img_002.png)  
  Then  img_001.npz and img_001.txt are written, then img_002.png loads with only its own annotations; aliases, crop and undo history from img_001 are cleared  
**Parameters:** auto_save default True; re-selecting the already open path is a no-op (no save, no reload); Auto-Save default True  
**Edge cases handled:** First image of the session: nothing to save; Auto-Save off: in-memory segments are discarded with no unsaved-changes prompt; A save error shows 'Error saving: ...' but navigation still proceeds, discarding the unsaved segments; Next on the last row does nothing (no wrap, no save); The first image load of a session triggers no save; Selecting the image already open does nothing.; The first image of a session triggers no save.; With Auto-Save off, unsaved work is discarded silently.; If b.png cannot be decoded (cv2.imread returns None, e.g. a non-ASCII path on Windows), b.png is already the current path with 0 segments while a.png's picture stays on screen. The next navigation deletes b.png's annotation files.  
**Suspected defect:** No confirmation before discarding unsaved work when Auto-Save is off or the save fails. | Multi-view navigation (loading a pair, next/previous batch) always saves and deletes empty viewers' files even when Auto-Save is off. | The path is committed before decoding succeeds, so a failed load leads to that image's annotations being deleted on the next save.  
**Confidence:** Medium — SME question: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. | The compliance and fidelity judges found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. | The compliance judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-060: Propagated frame flagging and commit (Keep Flagged Masks)
**Category:** Lifecycle  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:751-810; legacy/lazylabel/src/lazylabel/ui/main_window.py:4459-4594; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:290-345; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:333-398; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:539-541; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:744-805; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:1254-1273; legacy/lazylabel/src/lazylabel/ui/main_window.py:4164-4170; legacy/lazylabel/src/lazylabel/ui/main_window.py:4369-4378`  
**Plain English:** A frame's confidence is the minimum over its objects; if any object is below Min Conf the frame is flagged and, unless Keep Flagged Masks is on, all of that frame's masks are discarded.  
**Specification:**  
  Given Min Conf 0.99, Keep Flagged off, frame 12 with object A at 0.995 and object B at 0.97  
  When  Propagation commits frame 12  
  Then  Frame 12 is FLAGGED with confidence 0.97 and stores no masks (A is discarded too)  
  And   With Keep Flagged on, A and B masks are stored and the frame is still FLAGGED; all objects \>= threshold gives PROPAGATED; reference frames and Skip Labeled frames never receive masks  
**Parameters:** Min Conf default 0.99 (0.0-1.0, step 0.05, 4 decimals); Keep Flagged default off; Skip Labeled default on (any sidecar format counts); value clamped to 0-1; re-applied after initialization resets it to 0.99; confidence_threshold default 0.99 (UI range 0.0-1.0, step 0.05, 4 decimals, clamped to [0,1]); strict less-than; keep_flagged default False  
**Edge cases handled:** Skip Labeled tooltip says NPZ files, but any supported sidecar format marks a frame as labeled; Changing Min Conf after propagation recomputes the propagation manager's flagged set (used by Save All) but not the timeline statuses; With Keep Flagged off, masks of failed frames are already discarded and lowering the threshold cannot recover them; A confidence of exactly 0.99 is not flagged.; Objects with zero-pixel masks are dropped and do not lower the minimum; a frame where every object is empty is never committed and stays pending.; If a frame is committed twice (e.g. overlapping streaming chunks), masks merge and the running minimum is kept.; A safety check re-flags a 'propagated' or 'pending' frame whose stored score is below threshold.; Cancelling loses the frame being buffered; Frames where every object mask is empty keep their previous status (pending)  
**Confidence:** Medium — SME question: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. | The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-061: Undoing a circle center drag changes the circle's radius
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/editable_vertex.py:30-66; legacy/lazylabel/src/lazylabel/ui/managers/edit_mode_manager.py:188-239; legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:309-348`  
**Plain English:** Dragging a circle's center handle moves its radius point along with it, but the undo entry recorded on mouse release moves only one vertex, so undo restores only the center.  
**Specification:**  
  Given A circle with center (100,100) and radius point (150,100), radius 50  
  When  In edit mode the user drags the center handle to (200,100), then presses Ctrl+Z  
  Then  During the drag the radius point moves to (250,100). Undo puts the center back at (100,100) but leaves the radius point at (250,100), so the radius becomes 150.  
**Parameters:** None  
**Edge cases handled:** Dragging the radius handle undoes correctly, since only one point moves.; The dedicated move_circle undo entry is recorded only in multi-view.  
**Suspected defect:** Single-view handles record move_vertex instead of move_circle.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-062: AI mode: click adds a point, a drag over 5 px draws a box, Space accepts the preview
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:130-139; legacy/lazylabel/src/lazylabel/ui/main_window.py:2216-2276; legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:74-200; legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:405-515; legacy/lazylabel/src/lazylabel/ui/main_window.py:1788-1829; legacy/lazylabel/src/lazylabel/ui/control_panel.py:916-921; legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:44-72; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:225-255; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:326-537`  
**Plain English:** In AI mode, a left click that moves 5 px or less adds a positive point and refreshes the yellow preview, and a right click adds a negative point. A drag longer than 5 px draws a box, which is predicted only if it is wider and taller than 10 px. Space turns the preview into a segment (a box preview wins over a point preview), Shift+Space erases with it, and Escape discards it.  
**Specification:**  
  Given AI mode, model loaded and image embedded, auto-convert to polygon on  
  When  The user drags a 40x8 px box, then a 60x60 px box, then presses Space  
  Then  The 40x8 box produces no prediction. The 60x60 box shows 'AI bounding box preview ready - press Space to confirm!'. Space applies the fragment filter, stores a Polygon if the mask yields 3 or more vertices (otherwise an 'AI' mask segment), records add_segment for undo, and clears points and preview.  
**Parameters:** Drag threshold more than 5 px; box must exceed 10x10 px. Polygon simplification epsilon = 0.005 x 0.02^(slider/100) of the perimeter; default slider 80 gives about 0.000219.; Drag threshold \> 5 px; AI box \> 10 x \> 10; manual box \>= 1 x \>= 1; circle radius \>= 1.0; min drag distance 5 px; min box \> 10 x 10 px  
**Edge cases handled:** Clicks are refused while the model is starting up or embedding ('AI model is initializing/updating, please wait...').; Negative points alone produce no preview.; If the fragment filter removes everything, a warning is shown: a point preview is dropped but its points stay, and a box preview stays in place.; With no preview, Space shows 'No AI segment preview to accept'.; A drag just over 5 px with a thin box is silently discarded; Box prediction blocked with 'AI model not available' or 'AI model is updating, please wait...'; Non-boolean model masks are thresholded at 0.5  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

### RULE-063: Abort stops the running step and keeps frames already committed
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:4406-4445; legacy/lazylabel/src/lazylabel/ui/workers/propagation_worker.py:59-104; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:533-536; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:731-733`  
**Plain English:** Clicking Abort asks whichever background step is running (setup, reference registration or propagation) to stop, waits up to 2 seconds and restores the Propagate button. Frames already committed keep their status and masks; the frame in progress is dropped.  
**Specification:**  
  Given Propagation is at frame 150 of 300; frames 11-149 are already committed  
  When  The user clicks Abort  
  Then  The worker stops without its finish event, so the current frame is not reloaded. Frames 11-149 keep their statuses and masks, frame 150's buffered objects are dropped, frames 151-299 stay pending, and the user sees 'Propagation cancelled'.  
**Parameters:** Stop wait 2000 ms; after that the thread is left to clean itself up  
**Edge cases handled:** Aborting during setup or reference registration also clears the queued propagation request.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-064: Clear Flags repaints non-reference frames as pending without touching results
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:3457-3478; legacy/lazylabel/src/lazylabel/ui/widgets/timeline_widget.py:598-603`  
**Plain English:** The timeline's Clear Flags button sets every frame whose status is not 'reference' to pending and shows a flagged count of 0. Propagated masks, scores, the engine's flagged and propagated lists, suggestions and the skipped list are all kept.  
**Specification:**  
  Given Frame 3 flagged, frame 4 propagated with unsaved masks, frame 5 saved, frame 6 skipped, frame 7 reference  
  When  The user clicks Clear Flags  
  Then  Frames 3-6 show 'pending', frame 7 stays 'reference', and the flagged count shows 0. Frame 4 still loads its propagated masks when opened, and Save All still saves frame 4 and still excludes frame 3.  
**Parameters:** None  
**Edge cases handled:** A reference frame whose status had already become 'saved' is also reset to pending.; Status changes skip the thread lock and send no per-frame change signals.  
**Suspected defect:** A cosmetic reset that leaves the timeline out of sync with the data used by navigation and Save All.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-065: Selecting a file in the Sequence tab jumps to its frame; a file outside the timeline bounces back
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:1440-1459; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:267-276; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:374-376; legacy/lazylabel/src/lazylabel/ui/main_window.py:5360-5364; legacy/lazylabel/src/lazylabel/ui/main_window.py:5395-5404; legacy/lazylabel/src/lazylabel/ui/main_window.py:3480-3519`  
**Plain English:** In the Sequence tab, choosing a file that belongs to the timeline opens its frame, with the normal sequence auto-save. Choosing a file outside the timeline runs the single-image loader: it saves the current frame without marking it saved, briefly shows the other image, then reopens the current timeline frame.  
**Specification:**  
  Given Timeline of frames f000-f099, current frame f010 (propagated, user edited one mask), Auto-Save on  
  When  The user selects x.png, which is outside the timeline  
  Then  f010's edited segments are written to disk, then x.png loads and is replaced by f010 again. Because f010's propagated masks were not cleared, f010 shows the original propagated masks instead of the saved edits, and the next navigation saves those masks over the edited file.  
**Parameters:** None  
**Edge cases handled:** The code comment says selecting an outside file switches to single view, but no switch happens.  
**Suspected defect:** The single-view switch described in the comment is not implemented, and user edits on a propagated frame can be overwritten.  
**Confidence:** Medium — SME question: Should selecting a file outside the timeline switch to single view, and should this save mark the frame Saved and clear its propagated masks?

### RULE-066: Accepting AI previews
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:74-200; legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:405-442; legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:487-515; legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:87-185`  
**Plain English:** Space accepts the pending AI result (a box preview takes precedence over a point preview) and Shift+Space uses it as an eraser; points cannot be added while the model initializes or updates; a point preview exists only with at least one positive point.  
**Specification:**  
  Given One positive and one negative point placed, and a box preview pending  
  When  The user presses Space  
  Then  The box preview mask (after fragment filter) becomes a segment and all points are cleared  
**Parameters:** None  
**Edge cases handled:** Negative points alone produce no preview; In box, circle, selection, edit, pan modes Space does nothing; Shift+Space shows 'Erase mode not available in \<mode\> mode'; No preview: 'No AI segment preview to accept'  
**Confidence:** High — citation confirmed by an independent referee

### RULE-067: Crop persistence across image navigation
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:227-238; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:267-281; legacy/lazylabel/src/lazylabel/ui/main_window.py:2153-2156; legacy/lazylabel/src/lazylabel/ui/right_panel.py:121-122`  
**Plain English:** A crop is stored per image size and re-applied to same-sized images only on the legacy file-tree load path; the visible fast file list resets the crop on every navigation.  
**Specification:**  
  Given A crop set on img_a.png (1920x1080) and the user moves to img_b.png (1920x1080) through the file list or next/previous keys  
  When  img_b loads  
  Then  img_a is auto-saved with its crop; img_b opens with no crop and is saved uncropped  
**Parameters:** Crop memory key = (width, height)  
**Edge cases handled:** The legacy QTreeView path that restores crops is hidden in the UI  
**Suspected defect:** crop_coords_by_size implies crops carry to same-sized images, but load_image_by_path (the path used by the visible file list) never restores it.  
**Confidence:** Medium — SME question: Should a crop apply to all images of the same size in a session, or only to the image where it was drawn?

### RULE-068: Enter completes pending work then saves
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:187-234`  
**Plain English:** Enter first completes pending work (an open polygon in Polygon mode, otherwise the pending AI preview) and then saves the image in the selected formats.  
**Specification:**  
  Given Polygon mode, single view, 4 unfinished polygon points  
  When  The user presses Enter  
  Then  The polygon becomes a segment and the image is saved  
**Parameters:** None  
**Edge cases handled:** Sequence view in Polygon mode: Enter does nothing (no finalize, no save); Box, circle or selection mode: 'No AI segment preview to accept' then save; If the image has 0 segments, Enter deletes its annotation files  
**Suspected defect:** Enter is a no-op in sequence view Polygon mode.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-069: Edit mode entry and mode toggling
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/mode_manager.py:55-184; legacy/lazylabel/src/lazylabel/ui/main_window.py:1098-1102; legacy/lazylabel/src/lazylabel/ui/managers/edit_mode_manager.py:188-239`  
**Plain English:** Edit mode requires at least one selected Polygon or Circle; Selection, Pan and Edit toggle back to the previous drawing mode; startup mode is AI when a model is available, else Polygon; changing mode discards in-progress points.  
**Specification:**  
  Given Only AI mask segments are selected  
  When  The user presses the Edit hotkey  
  Then  'No editable shapes selected!' is shown and the mode is unchanged  
  And   In Edit mode dragging a circle's center moves the whole circle, dragging its radius point resizes it  
**Parameters:** Editable types: Polygon, Circle  
**Edge cases handled:** Loaded YOLO-Seg/COCO polygons and erased remnants are not editable  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-070: Mode toggles fail to return to the last drawing mode
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/mode_manager.py:114-184; legacy/lazylabel/src/lazylabel/viewmodels/single_view_viewmodel.py:127-142; legacy/lazylabel/src/lazylabel/ui/main_window.py:470-488; legacy/lazylabel/src/lazylabel/ui/main_window.py:1098-1102; legacy/lazylabel/src/lazylabel/ui/handlers/single_view_mouse_handler.py:553-558; legacy/lazylabel/src/lazylabel/ui/main_window.py:806-811`  
**Plain English:** AI (1), Polygon (2), Box (3) and Circle (4) are set directly; Selection (E), Pan (Q) and Edit (R) toggle back to the previous mode. The intent is that Selection and Edit are never remembered as the previous mode, but the view-model setter always records the mode just left.  
**Specification:**  
  Given Mode is AI and a polygon is selected  
  When  The user presses E, R, R, E  
  Then  E: selection (previous = AI). R: edit (previous is overwritten to selection). R: back to selection, not AI. E: jumps straight to edit, skipping the 'No editable shapes selected!' check. The user cannot toggle back to AI and must press 1.  
**Parameters:** Startup mode is polygon when no model is loaded (models load lazily, so normally polygon), otherwise AI. Every mode change clears in-progress points and previews; pan enables hand drag; edit shows vertex handles.  
**Edge cases handled:** Finishing a drawn crop switches to the legacy 'sam_points' mode, where clicks add points but the AI box gesture is unavailable.; If SAM becomes unavailable while in AI mode, the app switches to polygon.  
**Suspected defect:** previous_mode is written twice (ModeManager, then SingleViewViewModel.set_mode). This breaks toggle-back and allows entering edit mode without validation.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-071: First propagation sets up the engine once and marks wrong-size frames Skipped
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:181-298; legacy/lazylabel/src/lazylabel/ui/main_window.py:4063-4117; legacy/lazylabel/src/lazylabel/ui/main_window.py:4127-4182; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:586-596; legacy/lazylabel/src/lazylabel/ui/main_window.py:3982-4009`  
**Plain English:** The first Propagate on a timeline prepares the SAM 2 engine in the background. Frames whose size differs from the reference size, or that cannot be read, are marked skipped and left out. The engine is reused for later runs until the timeline is rebuilt, trimmed or left.  
**Specification:**  
  Given 300-frame timeline, reference size 1080 high x 1920 wide, 12 frames sized 720x1280  
  When  The user propagates for the first time  
  Then  The 12 frames become 'skipped' (brown) and the user sees '12 frames have different dimensions (reference is 1920x1080) and will be skipped during propagation'. The engine starts with 288 frames, the Min Conf value from the UI is re-applied (setup resets it to 0.99), and propagation continues automatically.  
**Parameters:** Engine threshold reset value 0.99 (propagation_manager.py:283). Streaming is switched on automatically when more than 250 frames remain.  
**Edge cases handled:** Images that cannot be read (cv2.imread returns None, e.g. non-ASCII paths on Windows) are also skipped.; If no frame matches, setup fails with 'Failed to initialize video predictor.' and the run ends.; Later runs skip setup, so the skip filter from the first run stays in force.  
**Suspected defect:** Clear All references calls clear_reference_frames instead of cleanup, so the engine keeps the old size filter. A new first reference of a different size is refused by the engine ('skipped or unknown'), or frames of the old size stay loaded. Clearing also empties the skipped set but leaves those frames' status as 'skipped' while the timeline shows them as pending.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-072: Frame status precedence, suggestions and timeline sort
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:1135-1154; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:1222-1252; legacy/lazylabel/src/lazylabel/ui/widgets/timeline_widget.py:109-120; legacy/lazylabel/src/lazylabel/ui/main_window.py:3457-3478; legacy/lazylabel/src/lazylabel/ui/widgets/timeline_widget.py:31-51; legacy/lazylabel/src/lazylabel/ui/widgets/timeline_widget.py:511-514; legacy/lazylabel/src/lazylabel/ui/main_window.py:3436-3455; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:432-537; legacy/lazylabel/src/lazylabel/ui/main_window.py:4664-4706; legacy/lazylabel/src/lazylabel/ui/main_window.py:5150-5168`  
**Plain English:** The engine resolves a frame's status as Skipped, then Reference, Flagged, Propagated, Pending; the timeline Sort orders Reference, Saved, Propagated, Suggested, Pending, Flagged, Skipped with ties by frame number; next/previous navigation wraps around.  
**Specification:**  
  Given Frames 0 pending, 1 flagged, 2 reference, 3 saved  
  When  The user clicks Sort  
  Then  Display order is 2, 3, 0, 1  
  And   AI suggestions only mark PENDING frames as SUGGESTED; 'Clear all flags' resets every non-reference frame to PENDING, including SAVED and SKIPPED  
**Parameters:** Sort priorities reference 0, saved 1, propagated 2, suggested 3, pending 4, flagged 5, skipped 6; unknown 3; Colors: reference gold (255,193,7), saved cyan (0,188,212), propagated green (76,175,80), suggested purple (156,39,176), pending gray, flagged red (244,67,54), skipped brown (139,69,19). Unknown statuses sort at priority 3. Zoom 1x-30x in 1.5x steps.; Hotkeys: N / Shift+N flagged, B / Shift+B reference, H / Shift+H suggested  
**Edge cases handled:** Next flagged from the last flagged frame wraps to the first; While sorted, '+ All Before' and trim ranges use this display order.; Order is by frame number even when the timeline is sorted.; The flagged list reads stored statuses, so Clear Flags empties it.  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

### RULE-073: Min Conf change re-evaluates flags in the engine but not on the timeline
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:1254-1273; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:539-541; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:384-398; legacy/lazylabel/src/lazylabel/ui/main_window.py:4718-4739`  
**Plain English:** Changing Min Conf immediately recomputes the engine's flagged frames from stored results (flag if any stored object is below the new threshold), but existing timeline statuses are not recomputed.  
**Specification:**  
  Given Keep Flagged on and frame 12 flagged with minimum confidence 0.97 at threshold 0.99  
  When  The user lowers Min Conf to 0.95  
  Then  The engine unflags frame 12 so Save All will now save it, while the timeline still shows frame 12 as FLAGGED  
**Parameters:** Threshold clamped to 0.0-1.0; Threshold clamped to [0.0, 1.0]; not saved in settings; the 0.99 default is repeated in the widget, the sequence state and the engine  
**Edge cases handled:** With Keep Flagged off, failed objects were never stored, so re-evaluation only sees passing objects; Frames flagged because an object was dropped (Keep Flagged off) have no stored score for that object, so any threshold change un-flags them in the engine. Their masks were already discarded, so Save All still skips them.  
**Suspected defect:** What the timeline shows and what Save All writes can diverge after a threshold change. | Timeline flags and the Save All exclusion list drift apart after a threshold change.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-074: AI embedding goes dirty, then updating, then ready, and a failed embed is reported as ready
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:73-113; legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:210-338; legacy/lazylabel/src/lazylabel/ui/workers/sam_update_worker.py:36-63; legacy/lazylabel/src/lazylabel/ui/main_window.py:1567-1625; legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:361-366; legacy/lazylabel/src/lazylabel/ui/main_window.py:3569-3575; legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:418-442`  
**Plain English:** Whenever the displayed image changes, its AI embedding must be refreshed. Single view computes it at once (blocking) or restores it from cache. The Sequence tab restores from cache if it can, otherwise marks it dirty and computes it in the background on the first AI click. Either way the image is recorded as loaded even if the model failed to read it.  
**Specification:**  
  Given Sequence tab, SAM model loaded, frame 12 not in the embedding cache  
  When  The user opens frame 12 and left-clicks in AI mode, and the model fails to read the image (set_image returns False)  
  Then  The click waits for a background embed ('Loading image into AI model...'). The worker still reports finished, the key MD5(frame 12 path) is stored as current, the user sees 'AI model ready for prompting', and later clicks do not retry.  
**Parameters:** Image key is the MD5 of the path, or with Operate On View the MD5 of the adjusted pixels plus channel/FFT threshold parameters. Crop is not part of the key.  
**Edge cases handled:** Clicks during the embed show 'AI model is updating, please wait...'.; With no model yet, or a different model pending, the click starts loading the model instead.; Operate On View turns off the Sequence tab's cache-only restore.; Single-view navigation computes on the UI thread and also records the key whether or not it succeeded.  
**Suspected defect:** An embedding failure is mapped to a success state.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-075: Each Propagate run resets earlier results except reference and skipped frames
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:143-159; legacy/lazylabel/src/lazylabel/ui/main_window.py:4233-4249; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:366-370; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:484-493`  
**Plain English:** Starting propagation discards all earlier propagated masks and confidence scores and sets every frame back to pending, except reference frames and frames skipped for size.  
**Specification:**  
  Given Frame statuses: 0 reference, 1 saved, 2 flagged, 3 skipped, 4 suggested, 5 propagated with unsaved masks  
  When  The user clicks Propagate  
  Then  Frames 1, 2, 4 and 5 become 'pending'; frames 0 and 3 keep their status. Frame 5's unsaved masks and all confidence scores are discarded. The timeline is repainted showing only reference and skipped frames, and the engine's reference list and results are cleared and rebuilt.  
**Parameters:** Statuses kept: reference, skipped  
**Edge cases handled:** Saved frames lose the cyan indicator even though their files still exist.; Suggested highlights disappear, but the suggested list still drives Next/Prev Suggested.  
**Confidence:** High — citation confirmed by an independent referee

### RULE-076: Timeline frame status lifecycle
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:20-30; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:128-159; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:347-373; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:432-537; legacy/lazylabel/src/lazylabel/ui/main_window.py:3457-3478; legacy/lazylabel/src/lazylabel/ui/main_window.py:4233-4249; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:123-141; legacy/lazylabel/src/lazylabel/ui/main_window.py:4949-4996`  
**Plain English:** Frames are pending, reference, propagated, flagged, saved, skipped (size mismatch) or suggested; a new propagation resets every non-reference, non-skipped frame (including saved) to pending; Clear Flags resets every non-reference frame to pending; next/previous flagged, reference and suggested navigation wraps around.  
**Specification:**  
  Given Frame 5 saved, 6 flagged, 7 reference, 8 skipped  
  When  A new propagation starts  
  Then  5 and 6 become pending; 7 stays reference; 8 stays skipped  
**Parameters:** Statuses: pending, reference, propagated, flagged, saved, skipped, suggested. Sequence state lives in memory only.  
**Edge cases handled:** Unflag makes a frame propagated if it has masks, else pending; Clear Flags also resets saved and skipped frames; With a single flagged frame, Next Flagged returns to it again; The propagation engine has its own second status enum (propagation_manager.py:37-44) with only 5 values (no saved, no suggested). The engine's status function (propagation_manager.py:1135-1154) is never called.; Serializers to_dict/from_dict (sequence_view_mode.py:711-747) are never called, so all sequence statuses are lost when the app exits.; The get_frame_status docstring lists only 4 of the 7 statuses.  
**Suspected defect:** Two different FrameStatus definitions exist, and sequence status serialization is written but never used.  
**Confidence:** High — citation confirmed by an independent referee; 1 near-duplicate card(s) from other lenses were folded in

### RULE-077: Trim removes frames from the timeline only and re-keys state by image path
**Category:** Lifecycle  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:598-709; legacy/lazylabel/src/lazylabel/ui/main_window.py:5185-5344`  
**Plain English:** Cut removes the frames between the two trim markers from the timeline; Keep removes everything outside them. Files are not touched. Remaining frames keep their status, score, masks and reference data, and the propagation engine is reset.  
**Specification:**  
  Given 100-frame timeline in natural order, current frame 25, trim markers at frames 20 and 30  
  When  The user clicks Cut  
  Then  Frames 20-30 (11 frames) are removed, leaving 89; old frame 31 becomes index 20. The current frame moves to the nearest kept frame, old 19 (on a tie the earlier frame wins). Statuses and references follow their image paths, the engine state is cleared, the markers reset, and the user sees 'Removed 11 frames from timeline'.  
**Parameters:** Marker order does not matter (min/max is used). When the timeline is sorted, the range follows on-screen order.; Range inclusive of both markers  
**Edge cases handled:** Both markers are required: 'Set both trim left and right bounds first'.; Removing every frame is refused.; Keep with nothing outside the range reports that nothing needs removing.; If the timeline was sorted by status, the sort is re-applied after the rebuild.; Removing every frame is refused with 'Cannot remove all frames from the timeline'; Nearest-frame tie picks the lower index; Keep covering all frames: 'Nothing to remove - all frames are in the range'; Missing marker: 'Set both trim left and right bounds first'  
**Suspected defect:** The reload after trim re-selects the same index, so unsaved edits on the current frame are dropped. Because the engine is reset, Save All then reports nothing to save even though green frames with unsaved propagated masks remain.  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

## Policy rules (17)

### RULE-078: Annotations load from the best file present, and a damaged non-NPZ file stops the search
**Category:** Policy  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:65-81; legacy/lazylabel/src/lazylabel/core/file_manager.py:296-318; legacy/lazylabel/src/lazylabel/core/file_manager.py:423-428; legacy/lazylabel/src/lazylabel/core/file_manager.py:466-470; legacy/lazylabel/src/lazylabel/core/file_manager.py:502-510; legacy/lazylabel/src/lazylabel/core/file_manager.py:553-558; legacy/lazylabel/src/lazylabel/core/file_manager.py:614-623; legacy/lazylabel/src/lazylabel/core/file_manager.py:125-205`  
**Plain English:** When an image opens, only the first annotation file found in the order NPZ, YOLO Seg, COCO, NPZ Class Map, Pascal VOC, CreateML, YOLO Detection is read. An unreadable NPZ moves on to the next format, but every other loader hides its own read errors, so the search stops with nothing loaded.  
**Specification:**  
  Given cat.png with a truncated cat_coco.json and a valid cat.txt containing 2 boxes  
  When  cat.png is opened  
  Then  The COCO loader logs an error and returns, the search stops, and 0 segments load; the valid cat.txt is ignored. The next save with Auto-Save deletes both cat_coco.json and cat.txt.  
**Parameters:** Order: .npz \> _seg.txt \> _coco.json \> _CM.npz \> .xml \> _createml.json \> .txt; formats after NPZ need image size (header read if not supplied)  
**Edge cases handled:** A corrupt cat.npz raises, and the search moves on to _seg.txt.; A class map whose size differs from the image loads nothing and ends the search.; Non-NPZ formats need the image size; if it cannot be read, the search stops.; YOLO detection lines need exactly 5 values; YOLO segmentation lines need an odd count of at least 7.; Image size is read header-only for every format except NPZ; If the image size cannot be read, non-NPZ formats are not loaded at all; Any same-named file with a matching suffix is parsed as that format (a notes file img.txt is treated as YOLO Detection); Base-name collisions: image foo_seg.png's YOLO Detection file foo_seg.txt is also foo.png's YOLO Segmentation file; foo_CM.png vs foo.png class map likewise; If the image size cannot be read, loading stops entirely with an error (no fallback); Stale higher-priority files win: switching export from NPZ to Pascal VOC leaves the old .npz, which still loads instead of the newer .xml; A _seg.txt whose lines all have fewer than 7 tokens, a CreateML file whose top level is not a list, or a class map whose size differs from the image all stop the chain with 0 segments; Only a corrupt .npz (np.load raises) falls through to the next format; If a loader raises after adding some segments, those remain and the next format's segments are added too (duplicates)  
**Suspected defect:** The docstring promises fallback past damaged files, but only NPZ falls back. Combined with delete-on-empty saves, this destroys valid lower-priority files. | Most loaders catch their own read/parse errors and return normally (COCO JSON decode errors, VOC parse errors, unreadable TXT, class-map shape mismatch), so a damaged higher-priority file stops the chain and a healthy lower-priority file is never read, contrary to the docstring. The image then appears unlabeled, and auto-save deletes all its sidecars. | Docstring (core/file_manager.py:160-163) and ARCHITECTURE.md:204-207 promise that an unreadable file is skipped and the chain continues; executable code does this only for NPZ.  
**Confidence:** Medium — SME question: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-079: Export writes every selected format and never removes other files
**Category:** Policy  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:189-206; legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:60-63; legacy/lazylabel/src/lazylabel/ui/widgets/export_format_widget.py:94-103; legacy/lazylabel/src/lazylabel/ui/widgets/settings_widget.py:165-183; legacy/lazylabel/src/lazylabel/config/settings.py:8-9`  
**Plain English:** A save with segments runs each selected exporter; at least one format must stay selected; a format with nothing to write writes nothing; files of unselected formats stay on disk untouched.  
**Specification:**  
  Given Formats NPZ + YOLO Detection selected; img.png has segments; an older img.xml exists  
  When  The user presses Enter  
  Then  img.npz and img.txt are written or overwritten; img.xml is left as is  
**Parameters:** Default formats NPZ, YOLO_DETECTION; minimum 1 selected (unchecking the last re-checks it); unknown names in settings are ignored and an empty/invalid list falls back to defaults  
**Edge cases handled:** A format that finds no objects returns without writing and does not delete its old file, so a stale file can survive; Success notification lists only files actually written  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful

### RULE-080: Sidecar file naming and suffix collisions
**Category:** Policy  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:46-47; legacy/lazylabel/src/lazylabel/core/exporters/yolo_detection.py:45-46; legacy/lazylabel/src/lazylabel/core/exporters/yolo_segmentation.py:55-56; legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:186-235; legacy/lazylabel/src/lazylabel/core/file_manager.py:741-743`  
**Plain English:** Annotation files sit next to the image, named image base name plus a format suffix, and the file list classifies files by suffix only; supported image types are png, jpg, jpeg, tiff and tif.  
**Specification:**  
  Given Images foo.png and foo_seg.png in one folder with YOLO Detection selected  
  When  foo_seg.png is saved and foo.png is later opened (no foo.npz)  
  Then  foo_seg.png writes foo_seg.txt, which is also foo.png's YOLO Segmentation name; foo.png loads it as segmentation (5-token lines rejected) and appears unlabeled; the file list marks foo as having YOLO Seg  
**Parameters:** Suffixes .npz, _CM.npz, .txt, _seg.txt, _coco.json, .xml, _createml.json  
**Edge cases handled:** foo.png and foo.jpg share and overwrite the same sidecar files; Batch file-status refresh never updates the NPZ Class Map column (fast_file_manager.py:651-677)  
**Suspected defect:** Image names ending in _seg or _CM, or images differing only by extension, cause cross-image loading, wrong checkmarks and cross-image deletion.  
**Confidence:** High — citation confirmed by an independent referee; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful

### RULE-081: Propagation never overwrites reference frames and, by default, frames already labeled
**Category:** Policy  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:4218-4231; legacy/lazylabel/src/lazylabel/ui/main_window.py:4459-4481; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:744-749; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:346-354; legacy/lazylabel/src/lazylabel/core/file_manager.py:128-151`  
**Plain English:** Reference frames keep their own annotations. With Skip Labeled on (the default), any non-reference frame that already has an annotation file in any supported format gets no propagated masks and is shown brown.  
**Specification:**  
  Given Skip Labeled on; frame 30 has frame_030_coco.json; frame 31 has no annotation file; frame 10 is a reference  
  When  Propagation reaches frames 10, 30 and 31  
  Then  Frame 10 is ignored. Frame 30 is painted 'skipped' (brown) but gets no masks, and its stored status stays 'pending'. Frame 31 gets propagated masks.  
**Parameters:** Skip Labeled default True. 'Labeled' means any of .npz, _seg.txt, _coco.json, _CM.npz, .xml, _createml.json or .txt exists next to the image.; skip_labeled default True  
**Edge cases handled:** The labeled set is computed once when the run starts; files created during the run are not protected.; Any unrelated \<stem\>.txt or \<stem\>.xml counts as a label.; With Skip Labeled off, propagated masks overwrite those files when they are saved.; Any same-named .txt, .xml or .json counts as labeled even if it is not an annotation; Tooltip says 'NPZ files' but all formats count; With Skip Labeled off, visiting the frame after propagation auto-saves propagated masks over its files  
**Confidence:** Medium — SME question: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-082: Save All propagated frames eligibility
**Category:** Policy  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:4741-4846; legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:365-373; legacy/lazylabel/src/lazylabel/ui/main_window.py:3982-4009; legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:97-133; legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:394-417; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:300-309; legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:1254-1273`  
**Plain English:** 'Save All' exports each frame the propagation engine lists as propagated and not flagged, using its stored masks and each object's reference class, through the normal save (all selected formats, current crop).  
**Specification:**  
  Given Frame 3 propagated with masks, frame 4 flagged, frame 5 propagated but its masks were discarded  
  When  The user clicks Save All  
  Then  Only frame 3 is saved and marked SAVED (its in-memory masks cleared); frames 4 and 5 are skipped; notification 'Saved 1 frames to NPZ'  
  And   An object with no reference annotation is saved as class 0 with alias 'Class 0'  
**Parameters:** Eligibility = engine propagated_frames minus engine flagged_frames, and masks present; Object class = its reference annotation's class, else class 0 with name 'Class 0'  
**Edge cases handled:** The current crop applies to every saved frame; Frames already visited and auto-saved are skipped because their propagated masks were cleared; After 'Clear References', reference annotations are gone but propagated frames remain, so Save All writes every object as class 0; Image size and crop are taken from the frame currently displayed; Eligibility uses the propagation manager's flagged set, which follows later threshold changes, while timeline colors do not; Runs whatever the Auto-Save setting is.; After a Trim or New Timeline the engine is reset, so Save All reports 'No propagated frames to save' even while green frames with unsaved masks remain.; The export image size and active crop come from the frame on screen. If that frame's size differs (e.g. a skipped frame), every write fails with an error notice, but each frame is still marked saved and its masks dropped.; Saved segments are typed 'ai' (lowercase), while interactive AI segments use 'AI'.; The message says NPZ even when other formats are written.  
**Suspected defect:** When the reference class has no alias, propagated frames get alias 'Class N', so VOC/CreateML labels read 'Class 3' while the reference frame exports '3'; the message says NPZ although all selected formats are written. | Unsaved edits on the current frame are discarded; class-0 fallback can mislabel all objects. | Exclusion uses the engine's flagged set, which is recalculated when Min Conf changes, while the timeline's flags are not, so the frames saved can differ from the red frames shown. Failed writes are still recorded as saved.  
**Confidence:** Medium — SME question: Should Save All first commit edits on the open frame, and should objects with unknown class be saved as class 0? | The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.

### RULE-083: Saving an image with no segments deletes all of its annotation files
**Category:** Policy  
**Priority:** P0  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:97-133; legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:523-542; legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:189-215; legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:187-234; legacy/lazylabel/src/lazylabel/ui/widgets/export_format_widget.py:94-106; legacy/lazylabel/src/lazylabel/ui/main_window.py:6588-6594`  
**Plain English:** Every save rebuilds the image's annotations from the segments in memory. With at least one segment, each selected format is written and other formats are left alone. With zero segments, files in all seven formats are deleted.  
**Specification:**  
  Given cat.png is open with 0 segments; cat.npz, cat.txt and cat_coco.json exist; export formats are NPZ + YOLO Detection  
  When  The user presses Enter, or Auto-Save runs on navigation  
  Then  cat.npz, cat.txt and cat_coco.json are all deleted and the notice lists them. If instead there were 2 segments, cat.npz and cat.txt would be rewritten and cat_coco.json left untouched.  
**Parameters:** Suffixes deleted: .npz, _CM.npz, .txt, _seg.txt, _coco.json, .xml, _createml.json. Default export formats NPZ + YOLO_DETECTION. At least one format must stay selected.; Deleted suffixes: .npz, _CM.npz, .txt, _seg.txt, _coco.json, .xml, _createml.json; Deleted suffixes = all registered exporters: .npz, _CM.npz, .txt, _seg.txt, _coco.json, .xml, _createml.json; trigger = segment list empty at save time; auto_save default True  
**Edge cases handled:** Enter in any mode other than polygon first tries to accept an AI preview; with none it shows 'No AI segment preview to accept' and still saves or deletes.; Enter in single-view polygon mode first finishes a pending polygon of 3 or more points.; No image loaded: 'No image loaded.'; Nothing to delete: warning 'No segments to save.'; An unrelated caption file cat.txt is treated as a YOLO file and deleted.; An active crop clears pixels outside it in the written masks.; Unrelated foo.txt or foo.xml files (captions, metadata) are deleted too; foo.png deletes foo_seg.txt and foo_CM.npz, which are the files of sibling images foo_seg.png and foo_CM.png; Annotations that failed to load (unreadable top-priority sidecar, class-map size mismatch, image cv2 cannot decode in load_image_by_path) leave 0 segments, so opening and leaving the image deletes all its sidecars including healthy lower-priority ones; A same-named file that is not an annotation (img_001.txt caption, img_001.xml metadata) is deleted; No image loaded: warning 'No image loaded.' and nothing is written or deleted  
**Suspected defect:** Nothing tracks whether the image changed or loaded successfully, so an empty list is read as 'delete everything'. | Contradicts export_all's stated policy that writing never deletes ground truth shipped with the dataset; combined with loaders that silently fail, a damaged or unparseable annotation file makes the image look empty and its ground truth is destroyed on navigation. | The export contract says files already next to the image 'may be ... ground truth that shipped with the dataset' and are left alone (core/exporters/__init__.py:192-197), and ARCHITECTURE.md:193 says deletion is used only when the user cleared the annotations. The code cannot distinguish 'user cleared everything' from 'nothing was ever loaded', so it destroys annotations it never read.  
**Confidence:** Medium — SME question: The compliance judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md. | Should deletion happen only when the user explicitly removed previously loaded segments, and only for files LazyLabel itself wrote?

### RULE-084: AI features require segment-anything and PyTorch 2.7.1+
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ai_availability.py:8-47; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:274-311; legacy/lazylabel/src/lazylabel/ui/widgets/sequence_widget.py:825-835; legacy/lazylabel/src/lazylabel/ui/main_window.py:1234-1238`  
**Plain English:** AI tools are enabled only if segment-anything imports and the PyTorch version is 2.7.1 or newer; otherwise AI actions show the install hint.  
**Specification:**  
  Given torch 2.6.0+cu124 installed  
  When  The application starts  
  Then  AI unavailable; Propagate button disabled; Load Model shows 'AI features require additional packages. Install with: pip install lazylabel-gui[include-ai]'  
**Parameters:** MIN_TORCH_VERSION 2.7.1; local build suffix after '+' ignored; only the first three version parts are compared as integers  
**Edge cases handled:** Pre-release versions such as '2.8.0a0' or '2.10.0rc1' raise ValueError during parsing; only ImportError is caught, so startup fails; SAM 2 additionally requires the sam2 package; Pre-release versions such as 2.8.0a0 or 2.10.0rc1 have a non-numeric third part; int() raises ValueError and only ImportError is caught.  
**Suspected defect:** Unhandled ValueError for pre-release PyTorch version strings. | The version parser catches only ImportError.  
**Confidence:** Medium — SME question: Are pre-release or nightly PyTorch builds supported? With such a build, does the uncaught ValueError during the import-time check stop the app from starting?

### RULE-085: Model type detected from file name
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/core/model_manager.py:58-104; legacy/lazylabel/src/lazylabel/models/sam2_model.py:264-298; legacy/lazylabel/src/lazylabel/models/sam2_model.py:600-630`  
**Plain English:** Checkpoints (.pth/.pt, searched recursively) are classified by substrings: names containing sam2, sam2.1, hiera, _t., _s., _b+. or _l. are SAM 2 (size tiny/_t, small/_s, base_plus/_b+, large/_l, default large); others are SAM 1 (vit_l/large, vit_b/base, vit_h/huge, default vit_h).  
**Specification:**  
  Given File sam_vit_b_01ec64.pth  
  When  Selected and loaded  
  Then  Loaded as SAM 1 vit_b  
**Parameters:** SAM 2 size checks: tiny/_t, small/_s, base_plus/_b+, large/_l (image); large/hiera_l, base/hiera_b, small/hiera_s, tiny/hiera_t (video); SAM 1: vit_l/large, vit_b/base, vit_h/huge, default vit_h  
**Edge cases handled:** my_vit_l.pth contains '_l.' and is treated as SAM 2, failing to load; sam2_hiera_large_tuned.pt contains '_t' and gets the tiny config; database_v2.pth contains 'base' and loads as vit_b; Name containing '2.1' selects SAM 2.1 configs  
**Suspected defect:** Substring matching misclassifies renamed checkpoints. | Substring matching can choose different model sizes for the image and video predictors and misdetect names containing '_s' or '_t'.  
**Confidence:** Medium — SME question: Should model type be chosen explicitly or read from checkpoint metadata? | Should model size come from checkpoint metadata rather than file-name substrings?

### RULE-086: Active class toggle and recent-class hotkey
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:401-440; legacy/lazylabel/src/lazylabel/ui/main_window.py:2697-2738; legacy/lazylabel/src/lazylabel/ui/main_window.py:2712-2738 (live X handler; bound at main_window.py:1011 and legacy/lazylabel/src/lazylabel/config/hotkeys.py:104-106); legacy/lazylabel/src/lazylabel/core/segment_manager.py:41-42 (adding a segment records its class as most recently used), :87-95 (unique class IDs sorted ascending), :409-423 (toggle records and returns last toggled class). Remove segment_manager.py:425-440: it is unused and uses the opposite (highest-ID) fallback.`  
**Plain English:** Clicking a class row toggles it as the class for new segments; X toggles the most recently used or toggled class, or if none, the first/last table row (Pixel Priority on, Ascending/Descending) or the lowest class ID.  
**Specification:**  
  Given No class used yet on this image; classes 2 and 5 exist; Pixel Priority off  
  When  The user presses X twice  
  Then  First press: class 2 active ('Class 2 activated for new segments'); second press: deactivated ('No active class - new segments will create new classes')  
**Parameters:** Adding a segment also counts as using its class  
**Edge cases handled:** Adding any segment makes its class the recent class; State resets on image change; An unused helper (segment_manager.py:425-440) would pick the highest ID instead; No classes shows 'No classes available to toggle'  
**Suspected defect:** The unused SegmentManager.get_class_to_toggle_with_hotkey documents a highest-id fallback, conflicting with the live lowest-id behavior.  
**Confidence:** Medium — SME question: Citation was corrected by referee (The rule is right, but only half the citation supports it. The other half points at unused code that does the opposite. Live code, which implements the rule (main_window.py:2712-2738): - X is bound to toggle_recent_class (config/hotkeys.py:105), which calls _toggle_recent_class (main_window.py:1011). - It first uses get_last_toggled_class() and toggles that class if it is set (2715-2718). - Otherwise, if settings.pixel_priority_enabled is on, it reads the class table order from the right panel (right_panel.py:361-371). It takes the first row when ascending (2725-2726) and the last row otherwise (2727-2728). - If pixel priority is off, it takes get_unique_class_ids()[0] (2729-2733). That list is sorted ascending (segment_manager.py:87-95), so this is the lowest ID. - If nothing is found, it shows "No classes available to toggle" (2737-2738). - Spec check: classes {1,4,9}, pixel priority off (the default, settings.py:61), no recent class. The list is [1,4,9], so it picks 1. toggle_active_class(1) sets active_class_id=1 (segment_manager.py:414-419). The spec holds. Problems with the citation: 1. segment_manager.py:425-440 (get_class_to_toggle_with_hotkey) has no callers anywhere in legacy/lazylabel, src or tests. It picks the HIGHEST ID (unique_class_ids[-1], line 438) and ignores pixel priority. It is unused code that contradicts the rule, so it should not be cited as evidence. 2. The parameter "adding a segment counts as using its class" is not in either cited range. There it appears only in docstrings (main_window.py:2713, segment_manager.py:428). The code that does it is segment_manager.py:41-42: add_segment sets last_toggled_class_id. Nuances: - "Otherwise" means "pixel priority off". If pixel priority is on but the class table is empty, there is no fallback to the lowest ID; the "No classes available" message is shown instead. - last_toggled_class_id is only reset by __init__ and clear() (lines 18, 26), not when segments are deleted. So X can re-activate a class that no longer has any segments. - Every file loader calls add_segment (file_manager.py:259, 273, 324, 403, 590, 672, 701). After loading annotations, the last loaded segment's class counts as the recent class. The spec's starting state (classes exist, none used) is therefore rarely reachable in single view. - The X handler only uses self.segment_manager. The multi-view managers set the active class directly (main_window.py:6446, 6456, 7211). I did not check how X behaves in multi-view. I found no instruction-like text and no credentials in the cited regions.) — confirm legacy/lazylabel/src/lazylabel/ui/main_window.py:2712-2738 (live X handler; bound at main_window.py:1011 and legacy/lazylabel/src/lazylabel/config/hotkeys.py:104-106); legacy/lazylabel/src/lazylabel/core/segment_manager.py:41-42 (adding a segment records its class as most recently used), :87-95 (unique class IDs sorted ascending), :409-423 (toggle records and returns last toggled class). Remove segment_manager.py:425-440: it is unused and uses the opposite (highest-ID) fallback. is the authoritative implementation.

### RULE-087: Default model download integrity check
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/models/sam_model.py:20-65; legacy/lazylabel/src/lazylabel/models/sam_model.py:94-138; legacy/lazylabel/src/lazylabel/config/settings.py:39-41`  
**Plain English:** Without a custom model, a missing sam_vit_h_4b8939.pth is moved from ~/.cache/lazylabel or downloaded from dl.fbaipublicfiles.com; the only integrity check is bytes received equal Content-Length.  
**Specification:**  
  Given No local checkpoint; network drops after 1.2 GB  
  When  The default model loads  
  Then  'Network error during download' is raised; the partial file is not deleted (only the generic error branch deletes it), so the next start skips download and fails loading the truncated checkpoint  
**Parameters:** timeout 30 s; chunk 1 KiB; default model vit_h / sam_vit_h_4b8939.pth  
**Edge cases handled:** None recorded  
**Suspected defect:** No checksum; partial downloads persist after network errors.  
**Confidence:** Medium — SME question: Should checkpoints be checksum-verified and partial downloads discarded?

### RULE-088: One unknown key in settings.json resets every preference; old save flags migrate to export formats
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:2096-2107; legacy/lazylabel/src/lazylabel/ui/widgets/export_format_widget.py:94-106; legacy/lazylabel/src/lazylabel/config/settings.py:12-118; legacy/lazylabel/src/lazylabel/ui/widgets/settings_widget.py:148-183`  
**Plain English:** Settings load from JSON into a fixed set of fields, and the old save_npz/save_txt flags are converted to the export format list. Any unknown key or invalid JSON silently falls back to all defaults, which are written back on exit. The export format list can never be empty.  
**Specification:**  
  Given settings.json contains save_npz=false, save_txt=true and dark_mode=false  
  When  The app starts  
  Then  export_formats becomes ['YOLO_DETECTION'] and dark mode is off. If the file also contained yolo_use_alias=true, every field would reset to defaults (Auto-Save on, formats NPZ + YOLO Detection, dark mode on), and the defaults would be saved on close.  
**Parameters:** Legacy keys: save_npz, save_txt, bb_use_alias, save_class_aliases. Both flags false gives ['NPZ']. Default formats NPZ + YOLO_DETECTION.; Default export formats NPZ, YOLO_DETECTION; unchecking the last selected format is reverted; empty or invalid saved lists fall back to defaults; Defaults: auto_save True; export_formats NPZ, YOLO_DETECTION; fragment_threshold 0; polygon_join_threshold 2; polygon_resolution 80; pixel priority off/ascending; operate_on_view False; default model vit_h; stream_window_size 250; multi_view_grid_mode 2_view  
**Edge cases handled:** If only bb_use_alias is present, the missing save_npz and save_txt default to true and overwrite any existing export_formats with NPZ + YOLO_DETECTION.; Values of the wrong type are accepted unchecked.; Unchecking the last selected format re-checks it.; Unknown format names are dropped; if none remain, the defaults are used.; Downgrading after a newer version added a setting loses all user settings  
**Suspected defect:** An unknown key resets everything, and a partial legacy file overwrites export_formats. | A single unknown key silently discards all user settings, changing which sidecar files are written and deleted. | A settings file from a newer version silently resets every preference, including Auto-Save.  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

### RULE-089: Operate On View chooses which pixels the AI segments
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:1567-1625; legacy/lazylabel/src/lazylabel/ui/main_window.py:1377-1408; legacy/lazylabel/src/lazylabel/ui/widgets/settings_widget.py:59-66; legacy/lazylabel/src/lazylabel/ui/managers/coordinate_transformer.py:33-56`  
**Plain English:** With Operate On View on, the model segments the brightness/contrast/gamma-adjusted image on screen; off (default), it segments the original file; toggling invalidates the current AI image state.  
**Specification:**  
  Given Brightness +40 applied; Operate On View off  
  When  The user clicks an object in AI mode  
  Then  The prediction is computed on the unadjusted original pixels  
**Parameters:** operate_on_view default False  
**Edge cases handled:** With it on, each adjustment forces re-encoding; Off: cached image features are keyed by file path for the session  
**Confidence:** High — citation confirmed by an independent referee

### RULE-090: Sequence frame load order and per-class merge
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:3577-3625; legacy/lazylabel/src/lazylabel/ui/main_window.py:3685-3739; legacy/lazylabel/src/lazylabel/core/segment_manager.py:97-172`  
**Plain English:** A timeline frame shows fresh propagated masks first (never on reference frames), else in-memory preloaded masks, else its annotation file; propagated or preloaded segments are merged into one segment per class.  
**Specification:**  
  Given Frame 22 has propagated masks for objects 1 and 2 (both class 0, touching) and an older img_022.npz  
  When  Frame 22 is displayed  
  Then  One class-0 segment (union of both objects) is shown; img_022.npz is ignored until the frame is saved  
**Parameters:** Undo history is cleared per frame  
**Edge cases handled:** Merged touching objects export as one box; Unknown object class falls back to the cached object map, then class 0 'Class 0'; Merge drops segments without a class; Frames loaded directly from disk are not merged; If no segment has a mask, merging does nothing.; The in-memory preload cache step between propagated masks and disk is never filled in this codebase.  
**Suspected defect:** Visiting a propagated frame before saving fuses same-class objects, while Save All (without visiting) keeps one box per object, so output depends on workflow. | Separate objects of the same class are fused before their first save.  
**Confidence:** High — citation confirmed by an independent referee; 2 near-duplicate card(s) from other lenses were folded in

### RULE-091: Up to 10 image embeddings are cached by file path and computed ahead for nearby images
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:223; legacy/lazylabel/src/lazylabel/ui/managers/embedding_cache_manager.py:18-72; legacy/lazylabel/src/lazylabel/ui/main_window.py:761-766; legacy/lazylabel/src/lazylabel/ui/managers/sam_preload_scheduler.py:24-133; legacy/lazylabel/src/lazylabel/ui/main_window.py:1604-1636; legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:244-267; legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:316-366; legacy/lazylabel/src/lazylabel/ui/main_window.py:5109-5117; legacy/lazylabel/src/lazylabel/ui/main_window.py:7361-7442; legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:1408-1463`  
**Plain English:** Embeddings are kept in a least-recently-used cache of 10 entries keyed by a hash of the image path. After each embed, the app waits 200 ms and then pre-computes the first uncached image among archetype frames, then the next, next-but-one and previous images, retrying every 500 ms while the current image is still embedding.  
**Specification:**  
  Given The cache holds 10 images; the user is on img_050 of 100  
  When  img_050 finishes embedding  
  Then  img_051 is pre-computed and the oldest entry is evicted, followed by img_052 and img_049 if uncached; the model is then pointed back at img_050  
**Parameters:** max_size 10; preload delay 200 ms; retry 500 ms; order: archetype priority queue, N+1, N+2, N-1  
**Edge cases handled:** The cache is never cleared: not on model switch, not on unload, not when a file changes on disk.; Keys are path-only, so embeddings from the previous model can be restored into a newly loaded model with compatible tensor shapes.  
**Suspected defect:** Stale embeddings from another model, or from an older version of the file, may be reused after switching models.  
**Confidence:** Medium — SME question: Should cached embeddings be invalidated on model change or file modification? In practice, do SAM variants with the same embedding shape (e.g. vit_b and vit_h) accept each other's cached features?

### RULE-092: Linked multi-view shape mirroring and class ids
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/multi_view_coordinator.py:42-47; legacy/lazylabel/src/lazylabel/ui/main_window.py:5778-5815; legacy/lazylabel/src/lazylabel/ui/managers/keyboard_event_manager.py:99-123; legacy/lazylabel/src/lazylabel/ui/main_window.py:6392-6456; legacy/lazylabel/src/lazylabel/ui/main_window.py:6938-7006; legacy/lazylabel/src/lazylabel/ui/managers/multi_view_coordinator.py:197-214; legacy/lazylabel/src/lazylabel/ui/managers/ai_segment_manager.py:301-403`  
**Plain English:** Viewers start linked, and linked operations apply to both viewers at the same coordinates; polygons share one class id, but boxes, circles and AI masks take each viewer's own active or next class id.  
**Specification:**  
  Given Linked viewers, viewer 1 classes {0,1}, viewer 2 classes {0}, no active class  
  When  The user draws a box  
  Then  Viewer 1's box gets class 2 and viewer 2's box gets class 1  
**Parameters:** Link default on; Link state default True  
**Edge cases handled:** Unlinked operations affect only the active viewer; Only viewers 0 and 1 exist despite a 4-view setting; Multi-view polygon add, erase, merge and delete are not undoable; When unlinked, only the active viewer is targeted.; Viewers with fewer than 3 points are skipped.; Each viewer's accepted AI mask takes that viewer's active class, else its next free id.; Multi-view polygon erases are not recorded for undo.  
**Suspected defect:** The same mirrored object is saved with different class ids in the two images, while a mirrored polygon would share one id. | Linked AI accept can give the same object different class IDs in the two images.  
**Confidence:** Medium — SME question: In linked mode must the same object always receive the same class ID in both images?

### RULE-093: Timeline is built from the file list order between Start and End
**Category:** Policy  
**Priority:** P1  
**Source:** `legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:1971-1999; legacy/lazylabel/src/lazylabel/ui/main_window.py:4949-4996`  
**Plain English:** A timeline contains every listed file from Start to End inclusive in the list's current sort and filter order; building it discards previous propagation state and opens frame 1.  
**Specification:**  
  Given List sorted Name A-Z; Start f010.png, End f001.png  
  When  The user clicks Build Timeline  
  Then  Frames f001..f010 (10 frames) in list order  
**Parameters:** None  
**Edge cases handled:** Hidden or search-filtered rows are excluded; Date or custom drag order changes frame order and therefore propagation results; Unsaved edits on the open image are not saved when frame 1 opens  
**Confidence:** High — citation confirmed by an independent referee

### RULE-094: Click selection toggles the topmost segment
**Category:** Policy  
**Priority:** P2  
**Source:** `legacy/lazylabel/src/lazylabel/ui/main_window.py:2306-2353`  
**Plain English:** In Selection mode a click toggles the selection of the most recently added segment covering that pixel.  
**Specification:**  
  Given Segments #1 and #3 both cover pixel (50,50)  
  When  The user clicks (50,50)  
  Then  Segment #3's selection toggles; #1 is unchanged  
**Parameters:** None  
**Edge cases handled:** If the topmost hit is hidden by the class filter, the next covering segment underneath is toggled instead  
**Confidence:** High — citation confirmed by an independent referee

## Rules requiring SME confirmation

Answer each question on the rule card (or in the brief's open questions). P0 rules block their phase until answered.

- [ ] **[RULE-001](#rule-001-coco-json-export-structure-and-area)** (P0, Medium) COCO JSON export structure and area: Should COCO 'area' be the mask pixel count (COCO convention) instead of the contour polygon area? Panel: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-003](#rule-003-npz-class-map-export-resolves-overlaps-to-lowest-class-and-stores-foreground)** (P0, Medium) NPZ Class Map export resolves overlaps to lowest class and stores foreground: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-004](#rule-004-pascal-voc-export-uses-alias-names-and-exclusive-max-bounds)** (P0, Medium) Pascal VOC export uses alias names and exclusive max bounds: Which VOC bound convention do downstream training tools expect? | Must VOC exports interoperate with standard VOC tooling (1-based inclusive) or only round-trip within LazyLabel? Panel: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-005](#rule-005-yolo-detection-export-line-format)** (P0, Medium) YOLO Detection export line format: Must YOLO class indices be contiguous 0..N-1 across the dataset? Panel: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. | The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' … (full question and evidence on the card)
- [ ] **[RULE-011](#rule-011-new-segments-take-the-active-class-otherwise-the-next-free-class-id-highest--1)** (P0, Medium) New segments take the active class, otherwise the next free class id (highest + 1): The compliance and fidelity judges rated this not P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-016](#rule-016-crop-is-clamped-to-the-image-and-blanks-everything-outside-it-on-save-including-the-last-row-and-column)** (P0, Medium) Crop is clamped to the image and blanks everything outside it on save, including the last row and column: Should a crop carry over to other images of the same size, as the unreachable loader does, or reset for each image? | Is crop end (x2, y2) meant to be inclusive or exclusive, and should a full-frame crop keep the entire image? Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-040](#rule-040-yolo-detection-import-validation-rounding-and-clamping)** (P0, Medium) YOLO Detection import validation, rounding and clamping: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-041](#rule-041-yolo-segmentation-import-validation)** (P0, Medium) YOLO Segmentation import validation: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-054](#rule-054-closing-the-application-never-saves-the-open-images-annotations)** (P0, Medium) Closing the application never saves the open image's annotations: Should closing auto-save (when Auto-Save is on) or prompt about unsaved annotations? Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-055](#rule-055-leaving-a-sequence-frame-saves-it-and-marks-it-saved-even-if-it-is-a-reference)** (P0, Medium) Leaving a sequence frame saves it and marks it Saved, even if it is a reference: Should a reference frame keep its 'reference' status after it is saved? Should clearing all masks on a propagated frame discard its propagated result? | The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-059](#rule-059-auto-save-current-image-before-switching-images-single-view)** (P0, Medium) Auto-save current image before switching images (single view): The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. | The compliance and fidelity judges found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. | The compliance judge found the specification unfaithful to the code. Correct the card … (full question and evidence on the card)
- [ ] **[RULE-060](#rule-060-propagated-frame-flagging-and-commit-keep-flagged-masks)** (P0, Medium) Propagated frame flagging and commit (Keep Flagged Masks): The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. | The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-078](#rule-078-annotations-load-from-the-best-file-present-and-a-damaged-non-npz-file-stops-the-search)** (P0, Medium) Annotations load from the best file present, and a damaged non-NPZ file stops the search: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-081](#rule-081-propagation-never-overwrites-reference-frames-and-by-default-frames-already-labeled)** (P0, Medium) Propagation never overwrites reference frames and, by default, frames already labeled: The fidelity judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-082](#rule-082-save-all-propagated-frames-eligibility)** (P0, Medium) Save All propagated frames eligibility: Should Save All first commit edits on the open frame, and should objects with unknown class be saved as class 0? | The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-083](#rule-083-saving-an-image-with-no-segments-deletes-all-of-its-annotation-files)** (P0, Medium) Saving an image with no segments deletes all of its annotation files: The compliance judge found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test. Judges' reasoning: analysis/lazylabel/P0_PANEL.md. | Should deletion happen only when the user explicitly removed previously loaded segments, and only for files LazyLabel itself wrote?
- [ ] **[RULE-017](#rule-017-merge-selected-segments-into-the-lowest-selected-class)** (P1, Medium) Merge selected segments into the lowest selected class: Should Merge assign to the active class when one is set? Panel: The compliance and fidelity judges rated this not P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-018](#rule-018-propagation-confidence-score-per-object)** (P1, Medium) Propagation confidence score per object: The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-019](#rule-019-sam-2-frame-staging-numbering-gap)** (P1, Medium) SAM 2 frame staging numbering gap: Does the SAM 2 video loader index frames by sorted list position (making numbering gaps shift frames), or by the number in the file name? Panel: The compliance judge rated this not P0 while the fidelity judge rated it P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-023](#rule-023-propagation-seeds-come-only-from-mask-segments-on-reference-frames)** (P1, Medium) Propagation seeds come only from mask segments on reference frames: Should drawn polygons, boxes and circles be rasterized and used as propagation seeds? | The compliance and fidelity judges rated this not P0. Decide whether it guards annotation data integrity and belongs in the behavior contract. Judges' reasoning: analysis/lazylabel/P0_PANEL.md.
- [ ] **[RULE-042](#rule-042-class-alias-editing-is-unvalidated)** (P1, Medium) Class alias editing is unvalidated: Must aliases be unique, non-empty, and defined once per project?
- [ ] **[RULE-045](#rule-045-crop-coordinate-validation-and-reuse-by-image-size)** (P1, Medium) Crop coordinate validation and reuse by image size: Should a crop automatically apply to every later image with the same resolution, and on all navigation paths?
- [ ] **[RULE-065](#rule-065-selecting-a-file-in-the-sequence-tab-jumps-to-its-frame-a-file-outside-the-timeline-bounces-back)** (P1, Medium) Selecting a file in the Sequence tab jumps to its frame; a file outside the timeline bounces back: Should selecting a file outside the timeline switch to single view, and should this save mark the frame Saved and clear its propagated masks?
- [ ] **[RULE-067](#rule-067-crop-persistence-across-image-navigation)** (P1, Medium) Crop persistence across image navigation: Should a crop apply to all images of the same size in a session, or only to the image where it was drawn?
- [ ] **[RULE-084](#rule-084-ai-features-require-segment-anything-and-pytorch-271)** (P1, Medium) AI features require segment-anything and PyTorch 2.7.1+: Are pre-release or nightly PyTorch builds supported? With such a build, does the uncaught ValueError during the import-time check stop the app from starting?
- [ ] **[RULE-085](#rule-085-model-type-detected-from-file-name)** (P1, Medium) Model type detected from file name: Should model type be chosen explicitly or read from checkpoint metadata? | Should model size come from checkpoint metadata rather than file-name substrings?
- [ ] **[RULE-086](#rule-086-active-class-toggle-and-recent-class-hotkey)** (P1, Medium) Active class toggle and recent-class hotkey: Citation was corrected by referee (The rule is right, but only half the citation supports it. The other half points at unused code that does the opposite. Live code, which implements the rule (main_window.py:2712-2738): - X is bound to toggle_recent_class (config/hotkeys.py:105), which calls _toggle_recent_class (main_window.py:1011). - It first uses get_last_toggled_class() and toggles that … (full question and evidence on the card)
- [ ] **[RULE-087](#rule-087-default-model-download-integrity-check)** (P1, Medium) Default model download integrity check: Should checkpoints be checksum-verified and partial downloads discarded?
- [ ] **[RULE-091](#rule-091-up-to-10-image-embeddings-are-cached-by-file-path-and-computed-ahead-for-nearby-images)** (P1, Medium) Up to 10 image embeddings are cached by file path and computed ahead for nearby images: Should cached embeddings be invalidated on model change or file modification? In practice, do SAM variants with the same embedding shape (e.g. vit_b and vit_h) accept each other's cached features?
- [ ] **[RULE-092](#rule-092-linked-multi-view-shape-mirroring-and-class-ids)** (P1, Medium) Linked multi-view shape mirroring and class ids: In linked mode must the same object always receive the same class ID in both images?
- [ ] **[RULE-051](#rule-051-supported-image-formats)** (P2, Medium) Supported image formats: Citation was corrected by referee (The rule is true, but 2 of the 5 cited ranges contradict it and should not count as evidence. Paths are relative to E:\\GitHub\\LazyLabel. WHAT SUPPORTS THE RULE (running code): - utils/fast_file_manager.py:37 defines IMAGE_EXTENSIONS as .png, .jpg, .jpeg, .tiff and .tif. - Listing: utils/fast_file_manager.py:186-250. FileScanner.run reads only the top level of … (full question and evidence on the card)

## Candidate rules rejected by the citation referees

Kept for audit. A rejected rule is not behavior to preserve.

| Name | Cited source | Referee verdict |
|---|---|---|
| Operate On View: which image SAM segments | `legacy/lazylabel/src/lazylabel/ui/main_window.py:1576-1622; legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:235-251; legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:604-643; legacy/lazylabel/src/lazylabel/ui/main_window.py:2875-2904` | refuted: Refuted. The synchronous half of the rule is right. The lazy half describes code that never runs. What holds: - E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/main_window.py:1576-1603. When Operate On View (OOV) is on, SAM gets `active_viewer._adjusted_pixmap`, converted from BGRA to RGB. That pixmap has saturation, brightness/contrast and gamma applied (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/photo_viewer.py:95-171). The cache key is MD5 of the pixels plus the threshold and FFT params (main_window.py:2875-2904). - main_window.py:1604-1622. When OOV is off, the key is MD5(path) and SAM loads the file with `set_image_from_path`. - The cache holds 10 entries (main_window.py:223, `EmbeddingCacheManager(max_size=10)`) with LRU eviction (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/managers/embedding_cache_manager.py:70-71). - This path is called from the image-load code: `load_selected_image` and `load_image_by_path` (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/managers/file_navigation_manager.py:201, 222, 366). What fails (the lazy path): - The OOV branch at E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:235-242 only runs if `self.mw._cached_original_image is not None`. - On MainWindow that attribute is only ever set to None (main_window.py:190 and 2164). Nothing else in legacy/lazylabel, tests included, writes to it. - The real image cache is a separate attribute on ImageAdjustmentManager (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:49, 480). That class is a component of MainWindow, not a base class (main_window.py:77, 645). - So lines 240-242 never run, and `get_current_modified_image` (image_adjustment_manager.py:604-643) is never reached from this path. What the lazy path actually does: - The cache key is always MD5(path) (sam_single_view_manager.py:245), even with OOV on. `current_image` stays None. - The cache lookup at lines 256-267 uses that path key, so it can restore embeddings of the unmodified image. - `SAMUpdateWorker` receives `current_image=None` and falls back to `set_image_from_path` (E:/GitHub/LazyLabel/legacy/lazylabel/src/lazylabel/ui/workers/sam_update_worker.py:45-56). - Threshold, rescale and FFT slider changes with OOV on only mark SAM dirty (image_adjustment_manager.py:227-228, 268-269, 305-306). `sam_update_timer.start` is never called, so the debounced synchronous path does not run either. - Net effect: after a slider change with OOV on, SAM re-embeds the original file from disk, not the rescale + threshold + FFT output. Corrected rule: - OOV is only honored when `_update_sam_model_image` runs, which happens on image load. - The lazy single-view path ignores OOV and always uses the original file, keyed by MD5(path). - The guard checks the wrong object. That looks like a latent bug, but this is my inference; no comment confirms intent. Question for an SME: when OOV is on, should SAM keep using the modified image after slider changes? I found no instruction-like text and no credentials in the cited regions. |
| Loading a different model resets prompts, crop and undo but keeps segments; Unload is undone by the next AI click | `legacy/lazylabel/src/lazylabel/ui/main_window.py:1214-1305; legacy/lazylabel/src/lazylabel/ui/main_window.py:2956-3037; legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:117-202; legacy/lazylabel/src/lazylabel/ui/managers/sam_single_view_manager.py:218-229; legacy/lazylabel/src/lazylabel/ui/managers/sam_multi_view_manager.py:92-181; legacy/lazylabel/src/lazylabel/ui/managers/sam_multi_view_manager.py:204-206` | refuted: All paths are under E:\\GitHub\\LazyLabel\\legacy\\lazylabel\\src\\lazylabel\\. Much of the reset logic described is real code. However, the spec's trigger can't happen in the running app, and one core claim is contradicted by the code, so the lines do not implement the rule as written. WHAT HOLDS (real code): - **AI extras check:** without the AI extras, Load shows the install hint (ui/main_window.py:1236-1238). - **Reset when a model is already loaded:** _load_model calls _reset_sam_state_for_model_switch only if a model is available (ui/main_window.py:1260-1261). - It stops the image-embedding worker (ui/main_window.py:2960-2972). This works because the main window's worker field forwards to the single-view manager (ui/main_window.py:272-279, ui/managers/sam_worker_manager.py:79-87). - It clears points (2985), the preview (2990-2993), the crop visuals and state (2996-3003) and undo history (3025-3026). It then redraws the segments (3037). - **Background load and label:** the model loads on a background thread (ui/main_window.py:1272-1274, ui/managers/sam_single_view_manager.py:117-151). The label reads "Loading: \<file name\>" (ui/main_window.py:1276-1279). - **Success:** shows "AI model ready for prompting" and requests a new embedding of the current image (ui/managers/sam_single_view_manager.py:173-184). - **Failure:** the status bar shows "AI model failed: ..." and the buttons switch to the not-loaded state (ui/managers/sam_single_view_manager.py:192-197). - **Unload** frees the model (ui/main_window.py:1287-1305). - **Single view:** the next AI click (ai_segment_manager.py:431, modes/single_view_mode.py:29, main_window.py:2219) clears the unloaded flag and starts a load (ui/managers/sam_single_view_manager.py:218-229). - **Multi-view:** after an explicit unload, automatic loading is blocked (ui/managers/sam_multi_view_manager.py:204-206). WHAT FAILS: 1. **The spec's click can't happen.** After any successful load, set_model_loaded_state(True) (ui/managers/sam_single_view_manager.py:171) disables the Load button (ui/widgets/model_selection_widget.py:212-215). - Only Unload (ui/main_window.py:1304) or a load error (ui/managers/sam_single_view_manager.py:197) turns it back on. Picking a model in the dropdown does not (ui/widgets/model_selection_widget.py:182-188). - _load_model can only be reached from that button (ui/widgets/model_selection_widget.py:177, ui/control_panel.py:558, ui/main_window.py:875). - So "Default SAM loaded, then the user clicks Load Model" can't happen in normal use. The only exception is a second click during a load, and then start_initialization returns False (ui/managers/sam_single_view_manager.py:123-124), so the chosen model never loads. - In practice a user switches with Unload then Load, and the reset comes from Unload (ui/main_window.py:1287). 2. **"Does nothing if the same custom model is loaded" is wrong.** The check reads sam_model.custom_model_path (ui/main_window.py:1247-1249). Neither model class has that attribute; both store current_model_path instead (models/sam_model.py:87, models/sam2_model.py:54). As a result: - The check always treats the loaded model as the default one. - Selecting the custom model that is already loaded triggers a full reset and reload. - Selecting Default while a custom model is loaded is refused with "Model already loaded". 3. **"Silently loads it again" is wrong on two counts.** - The pending custom model path is cleared after every successful load (ui/managers/sam_single_view_manager.py:158), so the auto-reload loads the Default model (ui/workers/single_view_sam_init_worker.py:43-48), not the custom model that was unloaded. - It is not silent: it shows "Initializing AI model..." (ui/managers/sam_single_view_manager.py:133) and rejects the click (ui/managers/ai_segment_manager.py:434-436). 4. **Re-embedding only happens by accident.** The embedding cache is keyed only by the image path hash and is never cleared (ui/managers/sam_single_view_manager.py:245,256-267; ui/managers/embedding_cache_manager.py:40-56). - In the spec's SAM1-to-SAM2 case, restoring the cached SAM1 data fails on a missing 'orig_hw' key (models/sam2_model.py:471,476-478), so the image is embedded again. - When switching within the same family (SAM1 to SAM1, or SAM2 to SAM2), the old model's cached embeddings would be reused instead. 5. **The multi-view failure latch outlives a model switch.** The failure flag is only reset in cleanup() (ui/managers/sam_multi_view_manager.py:370), which only the reset method calls (ui/main_window.py:2976). - That reset runs only when a single-view model is loaded (ui/main_window.py:1260, 1283-1285). If none is loaded, the flag can stay set for the whole session. - reset_init_failed() is never called. No text aimed at AI tools and no credentials were found in the cited code. |

## Near-duplicate cards folded into another card

The three extraction lenses often described the same behavior. Each group below was reviewed and merged into one card: sources, edge cases, parameters, suspected defects and SME questions were unioned, and the highest priority and the lowest confidence were kept. The folded card's own outcome is listed here so nothing a lens recorded is lost.

| Folded card | Lens category | Kept as | Folded card's outcome (Then) |
|---|---|---|---|
| COCO JSON export: categories, bbox, area, polygon | Calculation | [RULE-001](#rule-001-coco-json-export-structure-and-area) | categories=[{id:5,name:'dog',supercategory:'animal'}]; annotation {id:1,image_id:1,category_id:5,bbox:[10,10,10,10],area:81,segmentation:[[10,10,10,19,19,19,19,10]],iscrowd:0} And area = contour polygon area when the outline has 3+ points, otherwise bbox width x height; an alias with no dot uses the same text for name and supercategory; no file when there are no objects |
| CreateML export uses pixel center coordinates | Calculation | [RULE-002](#rule-002-createml-exportimport-pixel-center-boxes) | img_createml.json annotation {label 'dog', coordinates {x 105.0, y 55.0, width 10, height 10}} |
| NPZ Class Map export/import with foreground mask | Calculation | [RULE-003](#rule-003-npz-class-map-export-resolves-overlaps-to-lowest-class-and-stores-foreground) | class_map is 2 at the overlap and 0 at the class-0 pixel with foreground True; reload creates one segment per class id found in the foreground And No file when no pixel is labeled; on load a class map whose shape differs from the image is rejected; files without 'foreground' treat 0 as background |
| NPZ Class Map import requires matching size | Validation | [RULE-003](#rule-003-npz-class-map-export-resolves-overlaps-to-lowest-class-and-stores-foreground) | Segments for class 0 (the foreground zeros) and class 4 |
| Pascal VOC export/import: 0-based exclusive max bounds, depth always 3 | Calculation | [RULE-004](#rule-004-pascal-voc-export-uses-alias-names-and-exclusive-max-bounds) | \<base\>.xml has name 'cat', pose 'Unspecified', truncated 0, difficult 0, xmin 100, ymin 50, xmax 300, ymax 150, size depth 3; reload fills exactly columns 100-299, rows 50-149 And Missing bndbox fields default to '0'; missing name defaults to '0'; objects without name or bndbox are skipped |
| YOLO Detection export: normalized center/size box per object | Calculation | [RULE-005](#rule-005-yolo-detection-export-line-format) | \<base\>.txt contains '3 0.3125 0.20833333333333334 0.3125 0.20833333333333334' (cx=(100+200/2)/640, cy=(50+100/2)/480, w=200/640, h=100/480), written at full float precision with no rounding And No file is written when there are no objects or when image width/height is 0; the class value is the real class id, not the channel index |
| YOLO Segmentation export: simplified normalized polygons | Calculation | [RULE-006](#rule-006-yolo-segmentation-export-polygon-simplification) | \<base\>_seg.txt contains '0 0.1 0.1 0.1 0.19 0.19 0.19 0.19 0.1' (outline through pixel centers; epsilon = 0.001 x perimeter) And Outlines with only 1 or 2 points are written as a closed 4-point ring (repeated point or there-and-back pair) instead of being dropped |
| Label-to-class-id resolution for YOLO, VOC and CreateML labels | Calculation | [RULE-007](#rule-007-label-text-to-class-id-resolution-on-import) | '0' -\> class 0; 'dog' -\> class 1 (alias 'dog'); 'cat' -\> class 2 (alias 'cat') |
| One exported object per segment outline (instance separation) | Calculation | [RULE-008](#rule-008-detection-and-polygon-exports-keep-same-class-objects-separate) | Two lines are written, one box per segment, instead of one merged box And Instances are computed only when YOLO Det, YOLO Seg, COCO, Pascal VOC or CreateML is selected; NPZ-only saves skip it |
| Erase subtracts pixels, splits remainders and drops tiny parts | Calculation | [RULE-009](#rule-009-eraser-splits-segments-and-drops-pieces-of-10-pixels-or-less) | Original removed; one new 'AI' mask segment of 942 px, class 2, added at the end; the 8-px part is lost |
| Class assignment for new segments and next class ID | Calculation | [RULE-011](#rule-011-new-segments-take-the-active-class-otherwise-the-next-free-class-id-highest--1) | The new segment is class 5; with class 1 active it would be class 1 |
| Class id assignment for new segments | Calculation | [RULE-011](#rule-011-new-segments-take-the-active-class-otherwise-the-next-free-class-id-highest--1) | The new segment gets class 4 And If class 3 is active the segment gets class 3; toggling the active class again deactivates it |
| Pixel priority for overlapping classes | Policy | [RULE-012](#rule-012-pixel-priority-resolves-overlapping-classes) | Ascending keeps only class 1 at that pixel; Descending keeps only class 4; non-overlapping pixels are unchanged |
| Reassign class IDs from Class Order table | Calculation | [RULE-013](#rule-013-reassign-class-ids-from-class-table-order) | 4 becomes 0, 0 becomes 1, 1 becomes 2; aliases {0: 'car'} |
| NPZ export content | Calculation | [RULE-014](#rule-014-saved-class-channel-order-is-ascending-class-id-not-the-class-order-table) | img.npz holds mask shape (480, 640, 2), class_order [0, 3], class_aliases {0: 'car', 3: 'person'} |
| NPZ one-hot mask export and class channel order | Calculation | [RULE-014](#rule-014-saved-class-channel-order-is-ascending-class-id-not-the-class-order-table) | \<base\>.npz has mask shape (480,640,2) where channel 0 is class 2 and channel 1 is class 7, class_order [2,7], and class_aliases; overlapping classes are both 1 unless pixel priority is on And The file is skipped only when the tensor has zero size; a crop that removes every pixel still writes an all-zero NPZ |
| Crop removes annotations outside the rectangle but keeps full-image coordinates | Calculation | [RULE-016](#rule-016-crop-is-clamped-to-the-image-and-blanks-everything-outside-it-on-save-including-the-last-row-and-column) | Coordinates are clamped to x2=99, y2=99, so column 99 and row 99 are zeroed; a full-image box exports with width 99/100 And Drawn crops must be wider and taller than 5 px; edges are truncated, rounded, clamped and swapped if reversed; mode switches to AI points after drawing |
| Crop zeroes saved annotations outside the crop (last row and column always lost) | Calculation | [RULE-016](#rule-016-crop-is-clamped-to-the-image-and-blanks-everything-outside-it-on-save-including-the-last-row-and-column) | Column 639 and row 479 are zeroed; the box is 639x479 px: cx = 319.5/640 = 0.49921875, cy = 239.5/480 (0.498958...), w = 639/640 = 0.9984375, h = 479/480 (0.997916...) |
| Merge selected segments into the smallest class | Calculation | [RULE-017](#rule-017-merge-selected-segments-into-the-lowest-selected-class) | Both segments become class 1 (the active class 5 is ignored) |
| SAM 2 propagation confidence score | Calculation | [RULE-018](#rule-018-propagation-confidence-score-per-object) | Confidence = 0.99005, which passes the default 0.99 threshold; an average of 4.59 gives 0.98995 and is flagged |
| Model picks the highest-scoring candidate mask | Calculation | [RULE-020](#rule-020-sam-best-mask-selection-and-click-coordinate-mapping) | Candidate 2 (score 0.94) is shown |
| Auto-convert AI masks to polygons and polygon resolution mapping | Calculation | [RULE-021](#rule-021-auto-convert-ai-masks-to-polygons) | factor = 0.000219; the polygon is built from the largest blob only and the small blob is discarded; if fewer than 3 vertices result the mask stays an AI mask |
| Archetype (suggested reference frame) selection | Calculation | [RULE-022](#rule-022-find-archetypes-suggests-about-2-of-frames-between-5-and-50-as-references) | Budget 20, minimum cluster size 10; initial allocation 12/6/1 = 19; the extra slot goes to A, so 13/6/1 frames are suggested |
| Archetype reference suggestions | Policy | [RULE-022](#rule-022-find-archetypes-suggests-about-2-of-frames-between-5-and-50-as-references) | 12 pending frames marked suggested; message 'Only 12 reference frames identified (expected ~20)' |
| Only mask-based segments seed propagation | Validation | [RULE-023](#rule-023-propagation-seeds-come-only-from-mask-segments-on-reference-frames) | Only the class-1 object is propagated (object id 1); the polygon is ignored; with no mask segments at all: 'No valid segments in reference frames' |
| Only reference frames that actually have annotations become propagation prompts | Policy | [RULE-023](#rule-023-propagation-seeds-come-only-from-mask-segments-on-reference-frames) | Objects 1 and 2 come from frame 0's in-memory masks and object 3 from frame 99's file. Frame 50 contributes nothing, is not registered with the engine, and is also excluded from receiving results, so it stays unlabeled. Object class names come from the on-screen frame's alias table, otherwise 'Class \<id\>'. |
| Propagation direction and range | Policy | [RULE-025](#rule-025-propagation-direction-and-range) | Forward pass covers frames 21-99 and backward pass covers frames 19-0; frames between the references are filled only by the forward pass And A range start of the first frame and end of the last frame are passed as 'no limit'; a skipped range start snaps to the next valid frame and a skipped end to the previous one |
| The propagation range only limits one side of each pass | Calculation | [RULE-025](#rule-025-propagation-direction-and-range) | The forward pass covers frames 11-99, including 11-49, which are outside the requested range. The backward pass is skipped because the reference (10) is not after the range start (50). With the default range 1-200, no limits are passed, so frames 11-199 (forward) and 9 down to 0 (backward) are propagated. |
| Timelines longer than the window propagate in overlapping chunks | Policy | [RULE-026](#rule-026-streaming-chunked-propagation-windows) | Chunks cover frames 0-249, 245-494 and 490-599. Frames already produced by an earlier chunk are skipped in the overlap, and reference frames are never overwritten. If the user unticks Streaming with 600 frames, a warning estimates about 7 GB (600 x 12.6 MB / 1024) and defaults to keeping Streaming on. |
| AI fragment filter | Calculation | [RULE-027](#rule-027-the-fragment-filter-keeps-only-regions-at-least-x-of-the-largest-region) | Minimum area = 0.10 x 841 = 84.1, so only the 30x30 blob is kept; the 10x10 blob is dropped although it is 11% of the largest by pixel count And If every piece is dropped or the mask has zero contour area, nothing is added ('All segments filtered out by fragment threshold'); hotkey Z toggles between 0 and the last non-zero value (100 if none was set) |
| File list checkmarks come from annotation file names next to each image | Policy | [RULE-036](#rule-036-file-list-annotation-status-indicators) | img1 shows Class Map and YOLO Detection checks (the caption counts); img2 shows a YOLO Seg check; the NPZ column is empty for both |
| COCO JSON import: categories to aliases, polygon then bbox fallback | Calculation | [RULE-037](#rule-037-coco-json-import-with-polygon-then-box-fallback) | Class 5 alias becomes 'dog.animal' and one class-5 segment covers columns 90-99, rows 90-99 (x2=min(100, 90+20)) And Multiple polygons in one annotation create one segment each; RLE (dict) segmentation falls back to bbox; missing category_id defaults to class 0; COCO aliases are merged into existing aliases |
| NPZ import: class_order mapping and legacy layouts | Calculation | [RULE-038](#rule-038-npz-import-current-and-legacy-layouts) | Two segments: class 2 from channel 0 and class 7 from channel 1; aliases become exactly {2:'cat'} And A 'masks' key is accepted as the tensor; a 'masks' (N,H,W) stack with 'class_ids' yields one segment per mask (missing id -\> 0); a 2-D mask is treated as one channel; empty channels are skipped |
| YOLO Detection import: denormalize, round half-to-even, clamp | Calculation | [RULE-040](#rule-040-yolo-detection-import-validation-rounding-and-clamping) | One segment (class resolved from label '3') fills columns 100-299 and rows 50-149 (x1=round((cx-w/2)*640)=100, x2=round((cx+w/2)*640)=300 exclusive) And Lines with other than 5 tokens or non-numeric values are silently skipped; boxes that collapse to zero width or height after clamping are dropped |
| YOLO Segmentation import: polygon rasterization | Validation | [RULE-041](#rule-041-yolo-segmentation-import-validation) | Vertices (10,10),(10,19),(19,19),(19,10) are filled into a 100-pixel class-0 segment of type 'Loaded' that also keeps the vertices And Lines with fewer than 7 tokens, an even token count, or non-numeric values are skipped; polygons that fill zero pixels are skipped |
| Propagate needs the AI extras, a reference, a SAM 2 video model and no running job | Validation | [RULE-044](#rule-044-propagation-preconditions) | Nothing starts and the user sees 'SAM 2 video predictor not available'. With a SAM 2 model loaded, propagation starts in both directions. With no model: 'SAM model not loaded'. With no reference: 'Please set a reference frame first'. While running, the button reads 'Abort' and another click cancels. |
| Edit mode requires a selected polygon or circle | Validation | [RULE-046](#rule-046-edit-mode-eligibility-and-200-vertex-limit) | The user sees 'No editable shapes selected!' and the mode stays the same. After selecting #2 and #3, R enters edit mode: #3 gets 2 handles, and #2 gets none plus the warning 'Polygon has 350 vertices (max 200 for editing)'. |
| Polygon closes when clicking near the first point | Validation | [RULE-047](#rule-047-a-polygon-needs-3-points-and-closes-when-clicking-within-the-join-distance-of-its-first-point) | The polygon is finalized (Shift held makes it an eraser); a click exactly 2.0 px away adds a fourth point instead |
| Polygon completion and join threshold | Validation | [RULE-047](#rule-047-a-polygon-needs-3-points-and-closes-when-clicking-within-the-join-distance-of-its-first-point) | (101,101), distance 1.41: polygon closes and is saved; (102,100), distance 2.0: a 4th point is added |
| Reference frames must share one image size | Validation | [RULE-048](#rule-048-reference-frames-must-match-the-first-references-image-size) | Rejected: 'Cannot add reference: image is 1280x720 but reference requires 1920x1080' |
| Reference image size lock and skipped frames | Validation | [RULE-048](#rule-048-reference-frames-must-match-the-first-references-image-size) | Adding fails with 'Cannot add reference: image is 1280x720 but reference requires 1920x1080'; during propagation frame 40 is SKIPPED and gets no mask And Clearing all references clears the size lock and the skipped marks |
| Deleting segments cannot be undone | Lifecycle | [RULE-052](#rule-052-undoredo-history-scope) | 3 segments remain; Ctrl+Z tries to undo the earlier add and reports 'Cannot undo: Segment no longer exists' |
| Undo history is unbounded, per image, and does not cover deletes or class changes | Lifecycle | [RULE-052](#rule-052-undoredo-history-scope) | The first undo targets 'add C' at index 2, finds only 2 segments, and warns 'Cannot undo: Segment no longer exists'. The second undo targets 'add B' at index 1 and removes C instead of B. |
| Undo of an erase adds a phantom segment instead of restoring | Lifecycle | [RULE-053](#rule-053-undoing-an-erase-inserts-malformed-segment-records) | (Actual) the list holds the remaining piece plus a phantom entry with no mask or vertices that receives class 3; saves add an empty class-3 channel to NPZ and a class-3 category to COCO |
| Undoing an erase does not restore the erased shapes | Lifecycle | [RULE-053](#rule-053-undoing-an-erase-inserts-malformed-segment-records) | After the erase, the polygon is gone and two class-2 'AI' mask segments exist. After undo, a third record with no shape and class 3 is added, the two pieces remain, and the original polygon is not restored. Saving writes the erased result plus an empty class-3 channel in the NPZ. Redo removes the last record again. |
| Sequence frame auto-save when changing frames | Lifecycle | [RULE-055](#rule-055-leaving-a-sequence-frame-saves-it-and-marks-it-saved-even-if-it-is-a-reference) | img_022 outputs are written; frame 22 status saved; its propagated masks cleared so it reloads from disk |
| Multi-view pair navigation always saves or deletes both images | Policy | [RULE-057](#rule-057-multi-view-batch-navigation-always-saves-ignoring-the-auto-save-setting) | p1.npz and any other p1 annotation files are deleted, p2's selected formats are written, and the next pair loads |
| Auto-save on navigate | Lifecycle | [RULE-059](#rule-059-auto-save-current-image-before-switching-images-single-view) | A is exported in all selected formats before B loads (in sequence mode the frame is marked SAVED); an A with no segments has its sidecars deleted |
| Opening another image auto-saves the current one first | Lifecycle | [RULE-059](#rule-059-auto-save-current-image-before-switching-images-single-view) | a.npz and a.txt are written. The current image becomes b.png; segments, undo history and crop reset; b.png's annotations load from b.npz; and b.png's AI embedding is computed or restored from cache immediately if a model is loaded. |
| A propagated frame is Flagged when its weakest object scores below Min Conf | Calculation | [RULE-060](#rule-060-propagated-frame-flagging-and-commit-keep-flagged-masks) | Frame 12 becomes 'flagged' with confidence 0.9850 and no masks are stored. With Keep Flagged Masks on, both masks are kept but the frame is still 'flagged' at 0.985. If the scores were 0.995 and 0.992, the frame would become 'propagated' with confidence 0.992. |
| Keep Flagged Masks decides whether partial frames keep masks | Policy | [RULE-060](#rule-060-propagated-frame-flagging-and-commit-keep-flagged-masks) | Keep Flagged OFF: no masks stored, flagged at 0.97; ON: masks A and B stored, flagged at 0.97 |
| Low-confidence frames are flagged using the minimum object score | Policy | [RULE-060](#rule-060-propagated-frame-flagging-and-commit-keep-flagged-masks) | Frame confidence 0.985, status flagged; C does not affect the score |
| AI click versus drag and minimum shape sizes | Validation | [RULE-062](#rule-062-ai-mode-click-adds-a-point-a-drag-over-5-px-draws-a-box-space-accepts-the-preview) | (104,103): positive point at the release position; (130,108): drag \>5 but box 30x8, nothing happens; (130,130): SAM box prediction And Right-click adds a negative point |
| AI mode click versus drag thresholds | Validation | [RULE-062](#rule-062-ai-mode-click-adds-a-point-a-drag-over-5-px-draws-a-box-space-accepts-the-preview) | (103,103): positive point; (130,140): box preview 'press Space to confirm'; (108,106): nothing (8x6 box too small, no point either) |
| Switching tools discards unfinished work; startup mode | Policy | [RULE-069](#rule-069-edit-mode-entry-and-mode-toggling) | The 5 points are discarded |
| Sequence initialization excludes mismatched images | Validation | [RULE-071](#rule-071-first-propagation-sets-up-the-engine-once-and-marks-wrong-size-frames-skipped) | Frame 4 skipped; message '1 frames have different dimensions (reference is 1920x1080) and will be skipped during propagation' |
| Next/previous flagged, reference and suggested navigation wraps around | Policy | [RULE-072](#rule-072-frame-status-precedence-suggestions-and-timeline-sort) | Frame 5 opens (wrap-around). From frame 3, Shift+N opens frame 90. With no flagged frames the user sees 'No more flagged frames'. |
| Timeline colors and Sort order follow review status | Policy | [RULE-072](#rule-072-frame-status-precedence-suggestions-and-timeline-sort) | The display order is 2, 3, 5, 0, 1, 4 |
| Changing Min Conf re-flags frames in the engine but not on the timeline | Policy | [RULE-073](#rule-073-min-conf-change-re-evaluates-flags-in-the-engine-but-not-on-the-timeline) | The engine no longer flags frame 20, so Save All will now save it. Frame 20 is still red on the timeline, and the flagged count and Next Flagged navigation still include it. |
| Sequence frame status lifecycle: seven states, every frame starts Pending | Lifecycle | [RULE-076](#rule-076-timeline-frame-status-lifecycle) | A 120-frame timeline is built in file-list order. Frames 0-119 are all 'pending'. References, propagated masks, confidence scores, suggestions, the skipped set and the reference size are cleared, any earlier SAM 2 engine state is discarded, and frame 0 opens. |
| Timeline trim and keep range | Lifecycle | [RULE-077](#rule-077-trim-removes-frames-from-the-timeline-only-and-re-keys-state-by-image-path) | 90 frames remain; current frame becomes old frame 20 (new index 10); no files are changed; propagation must re-initialize |
| Timeline trim and keep ranges | Validation | [RULE-077](#rule-077-trim-removes-frames-from-the-timeline-only-and-re-keys-state-by-image-path) | Cut removes frames 3-6; Keep removes frames 0-2 and 7-9; files on disk are untouched And If the current frame is removed the nearest kept frame becomes current (lower index on a tie) |
| A damaged or empty higher-priority file blocks lower-priority files | Validation | [RULE-078](#rule-078-annotations-load-from-the-best-file-present-and-a-damaged-non-npz-file-stops-the-search) | 'Error loading COCO JSON ...' is logged, 0 segments load and img.xml is never tried; navigating away with Auto-Save on then deletes both files |
| Annotation load priority chain | Policy | [RULE-078](#rule-078-annotations-load-from-the-best-file-present-and-a-damaged-non-npz-file-stops-the-search) | Only foo_coco.json is loaded; foo.txt is ignored And The chain continues to the next file only when a loader raises an exception; 'already labelled' status uses the same chain (find_annotation_file) |
| Annotation load priority chain (one format wins) | Policy | [RULE-078](#rule-078-annotations-load-from-the-best-file-present-and-a-damaged-non-npz-file-stops-the-search) | Only the 3 polygons from img_seg.txt are loaded; img.txt is ignored |
| Skip Labeled protects frames that already have annotations | Policy | [RULE-081](#rule-081-propagation-never-overwrites-reference-frames-and-by-default-frames-already-labeled) | No masks stored for frame 30; timeline shows skipped; img_030.xml untouched |
| Save All writes propagated frames except those the engine currently flags | Policy | [RULE-082](#rule-082-save-all-propagated-frames-eligibility) | Frames 11 and 12 are written in every selected format, with each object's class taken from its reference annotation (otherwise class 0, 'Class 0'), and turn 'saved' (cyan). Frame 13 is excluded, frame 14 is skipped because its masks were already cleared, the user sees 'Saved 2 frames to NPZ', and the current frame is reloaded from disk. |
| Save All writes propagated, non-flagged frames | Lifecycle | [RULE-082](#rule-082-save-all-propagated-frames-eligibility) | Frames 21, 22, 24, 25 are written from the original propagated masks; frame 23 is not saved; frame 22's manual correction is overwritten and lost |
| Saving an image with zero segments deletes all of its annotation files | Policy | [RULE-083](#rule-083-saving-an-image-with-no-segments-deletes-all-of-its-annotation-files) | img_001.npz, img_001.txt and img_001.xml are deleted (and img_001_CM.npz, img_001_seg.txt, img_001_coco.json, img_001_createml.json if present); notification 'Deleted: img_001.npz, ...'; if no file existed the warning 'No segments to save.' is shown |
| Saving an image with zero segments deletes all sidecar files | Lifecycle | [RULE-083](#rule-083-saving-an-image-with-no-segments-deletes-all-of-its-annotation-files) | foo.npz, foo_CM.npz, foo.txt, foo_seg.txt, foo_coco.json, foo.xml and foo_createml.json are removed if present, with a 'Deleted: ...' notification ('No segments to save.' if nothing existed) And Multi-view applies the same rule per viewer; sequence mode applies it on frame change |
| AI features require segment-anything and PyTorch 2.7.1 or newer | Validation | [RULE-084](#rule-084-ai-features-require-segment-anything-and-pytorch-271) | Machine A: AI available. Machine B: AI unavailable, with the log message 'PyTorch 2.7.0 found but \>=2.7.1 is required for AI features.' |
| Model discovery and type detection by file name | Policy | [RULE-085](#rule-085-model-type-detected-from-file-name) | It is treated as SAM 2; the image predictor picks the small config because '_s' appears in '_segmenter', while the video predictor checks 'large' first and picks the large config |
| Toggle Recent Class hotkey fallback | Policy | [RULE-086](#rule-086-active-class-toggle-and-recent-class-hotkey) | Class 1 becomes the active class |
| Settings file loading, fallback and legacy migration | Policy | [RULE-088](#rule-088-one-unknown-key-in-settingsjson-resets-every-preference-old-save-flags-migrate-to-export-formats) | Unknown key future_option causes all defaults: auto_save true, formats NPZ + YOLO Detection; without future_option: auto_save false and formats [NPZ] |
| Settings persistence, legacy migration and reset | Policy | [RULE-088](#rule-088-one-unknown-key-in-settingsjson-resets-every-preference-old-save-flags-migrate-to-export-formats) | Export formats become ['NPZ']; a file containing an unrecognized key instead resets all settings to defaults (NPZ + YOLO Detection, auto-save on) |
| Sequence frame load priority and per-class merging | Lifecycle | [RULE-090](#rule-090-sequence-frame-load-order-and-per-class-merge) | Frame 30 shows one class-2 segment, its YOLO Detection file has one merged box, and frame 30 becomes SAVED |
| Sequence frames load propagated masks first and merge them into one mask per class | Policy | [RULE-090](#rule-090-sequence-frame-load-order-and-per-class-merge) | The two propagated masks merge into one class-1 'Loaded' segment and frame_040.npz is ignored. When the user leaves, that single merged mask is saved, so instance formats (YOLO, COCO, VOC, CreateML) can no longer separate the two objects where they touch. |
| Linked multi-view applies accept, erase and polygon completion to both viewers | Policy | [RULE-092](#rule-092-linked-multi-view-shape-mirroring-and-class-ids) | Both polygons are added with class 2 |
| Linked multi-view operations | Policy | [RULE-092](#rule-092-linked-multi-view-shape-mirroring-and-class-ids) | Viewer 0's segment is class 2 and viewer 1's is class 1; completing polygons in both viewers instead would give both class 2 |

