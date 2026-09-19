# DATA OBJECTS: `lazylabel`

Core records, entities and file payloads of LazyLabel 2.0.8 (`legacy/lazylabel` at 2a7d5d8), catalogued on 2026-09-19 by the modernize-extract-rules workflow. Rule IDs refer to `analysis/lazylabel/BUSINESS_RULES.md`.

| Data object | Source | Fields | Rules |
|---|---|---|---|
| [Segment (annotation record)](#segment-annotation-record) | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:14` | 6 | 12 |
| [SegmentManager state (per-image class registry)](#segmentmanager-state-per-image-class-registry) | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:13` | 5 | 5 |
| [Multi-view view payload (segment['views'][viewer_index])](#multi-view-view-payload-segmentviewsviewerindex) | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:797` | 2 | 2 |
| [Erased-segment backup record](#erased-segment-backup-record) | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:525` | 2 | 2 |
| [Instance contour record](#instance-contour-record) | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:307` | 3 | 6 |
| [Final mask tensor](#final-mask-tensor) | `legacy/lazylabel/src/lazylabel/core/segment_manager.py:223` | 3 | 5 |
| [ExportContext](#exportcontext) | `legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:97` | 8 | 8 |
| [ExportFormat registry and load priority](#exportformat-registry-and-load-priority) | `legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:14` | 6 | 4 |
| [FileManager._LOAD_CHAIN entry](#filemanagerloadchain-entry) | `legacy/lazylabel/src/lazylabel/core/file_manager.py:128` | 2 | 3 |
| [Imported box tuple (label, x1, y1, x2, y2)](#imported-box-tuple-label-x1-y1-x2-y2) | `legacy/lazylabel/src/lazylabel/core/file_manager.py:381` | 3 | 5 |
| [Label-to-class-id map](#label-to-class-id-map) | `legacy/lazylabel/src/lazylabel/core/file_manager.py:345` | 3 | 3 |
| [NPZ archive (.npz)](#npz-archive-npz) | `legacy/lazylabel/src/lazylabel/core/exporters/npz.py:21` | 3 | 2 |
| [NPZ Class Map archive (_CM.npz)](#npz-class-map-archive-cmnpz) | `legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:37` | 4 | 1 |
| [COCO JSON document (_coco.json)](#coco-json-document-cocojson) | `legacy/lazylabel/src/lazylabel/core/exporters/coco.py:87` | 6 | 2 |
| [YOLO Detection line (.txt)](#yolo-detection-line-txt) | `legacy/lazylabel/src/lazylabel/core/exporters/yolo_detection.py:33` | 4 | 2 |
| [YOLO Segmentation line (_seg.txt)](#yolo-segmentation-line-segtxt) | `legacy/lazylabel/src/lazylabel/core/exporters/yolo_segmentation.py:43` | 4 | 2 |
| [Pascal VOC XML document (.xml)](#pascal-voc-xml-document-xml) | `legacy/lazylabel/src/lazylabel/core/exporters/pascal_voc.py:25` | 5 | 2 |
| [CreateML JSON document (_createml.json)](#createml-json-document-createmljson) | `legacy/lazylabel/src/lazylabel/core/exporters/createml.py:38` | 4 | 2 |
| [Settings (settings.json)](#settings-settingsjson) | `legacy/lazylabel/src/lazylabel/config/settings.py:12` | 12 | 8 |
| [Control-panel save settings dict](#control-panel-save-settings-dict) | `legacy/lazylabel/src/lazylabel/ui/widgets/settings_widget.py:148` | 5 | 5 |
| [HotkeyAction (hotkeys.json)](#hotkeyaction-hotkeysjson) | `legacy/lazylabel/src/lazylabel/config/hotkeys.py:10` | 6 | 4 |
| [FileInfo (file list row)](#fileinfo-file-list-row) | `legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:138` | 7 | 4 |
| [Undo/redo action record](#undoredo-action-record) | `legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:25` | 10 | 3 |
| [Crop state](#crop-state) | `legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:30` | 4 | 3 |
| [PropagationState](#propagationstate) | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:78` | 11 | 7 |
| [PropagationResult](#propagationresult) | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:47` | 5 | 4 |
| [ReferenceAnnotation (propagation engine)](#referenceannotation-propagation-engine) | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:58` | 5 | 2 |
| [ReferenceAnnotation (sequence mode) — divergent twin](#referenceannotation-sequence-mode--divergent-twin) | `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:32` | 5 | 3 |
| [ChunkConfig](#chunkconfig) | `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:69` | 3 | 2 |
| [ReferenceSegmentData](#referencesegmentdata) | `legacy/lazylabel/src/lazylabel/ui/workers/propagation_worker.py:205` | 5 | 2 |
| [SequenceViewMode frame state](#sequenceviewmode-frame-state) | `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:72` | 11 | 9 |
| [FrameStatus (two divergent enums)](#framestatus-two-divergent-enums) | `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:20` | 3 | 3 |
| [Timeline frame model](#timeline-frame-model) | `legacy/lazylabel/src/lazylabel/ui/widgets/timeline_widget.py:57` | 7 | 4 |
| [Confidence histogram model](#confidence-histogram-model) | `legacy/lazylabel/src/lazylabel/ui/widgets/confidence_histogram_dialog.py:26` | 4 | 3 |
| [Image adjustment state](#image-adjustment-state) | `legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:43` | 5 | 3 |
| [Channel threshold parameters](#channel-threshold-parameters) | `legacy/lazylabel/src/lazylabel/ui/widgets/channel_threshold_widget.py:577` | 3 | 3 |
| [FFT threshold settings](#fft-threshold-settings) | `legacy/lazylabel/src/lazylabel/ui/widgets/fft_threshold_widget.py:498` | 4 | 3 |
| [Rescale widget state](#rescale-widget-state) | `legacy/lazylabel/src/lazylabel/ui/widgets/rescale_widget.py:252` | 4 | 3 |
| [SAM prediction result](#sam-prediction-result) | `legacy/lazylabel/src/lazylabel/models/sam_model.py:233` | 4 | 4 |
| [Model entry (display_name, full_path)](#model-entry-displayname-fullpath) | `legacy/lazylabel/src/lazylabel/core/model_manager.py:58` | 4 | 4 |
| [SAM2 video staging directory](#sam2-video-staging-directory) | `legacy/lazylabel/src/lazylabel/models/sam2_model.py:779` | 4 | 3 |
| [Embedding cache entry](#embedding-cache-entry) | `legacy/lazylabel/src/lazylabel/ui/managers/embedding_cache_manager.py:24` | 3 | 3 |
| [AppContext / UIContext / FullContext](#appcontext--uicontext--fullcontext) | `legacy/lazylabel/src/lazylabel/core/app_context.py:35` | 5 | 3 |
| [Drawing / AI interaction state](#drawing--ai-interaction-state) | `legacy/lazylabel/src/lazylabel/ui/managers/drawing_state_manager.py:40` | 7 | 8 |
| [Class display colour](#class-display-colour) | `legacy/lazylabel/src/lazylabel/ui/managers/segment_display_manager.py:219` | 3 | 3 |

## Segment (annotation record)

**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:14`

| Field | Type | Note |
|---|---|---|
| `type` | `str` | 'AI' (live SAM mask, save_export_manager.py:183), 'Polygon' (single_view_mode.py:279), 'Circle' (single_view_mouse_handler.py:522), 'Loaded' (from disk, file_manager.py:262). Drives every rasterization/export branch (segment_manager.py:232-239) |
| `mask` | `np.ndarray (H,W) bool \| None` | Set for AI/Loaded; None for Polygon/Circle, which are rasterized on demand (segment_manager.py:233-239) |
| `vertices` | `list[[float,float]] \| None` | QPointF list is converted to [x,y] pairs on add (segment_manager.py:45-53). For Circle it is exactly [center, radius_point] (single_view_mouse_handler.py:517-524) |
| `class_id` | `int \| None` | If absent on add, takes active_class_id else next_class_id (segment_manager.py:34-39) |
| `views` | `dict[int, {mask, vertices}] \| None` | Optional multi-view payload keyed by viewer index (segment_manager.py:794-803) |
| `_source_viewer` | `int \| None` | Legacy multi-view marker, stripped before export (save_export_manager.py:372-390) |

**Rules that read or produce it:** RULE-011 (New segments take the active class, otherwise the next free class id (highest + 1)); RULE-019 (Merge selected segments into the lowest selected class); RULE-013 (Reassign class ids from class table order); RULE-015 (Shape rasterization before export (truncated vertices, rounded circles)); RULE-010 (Final per-class mask composition); RULE-009 (Eraser splits segments and drops pieces of 10 pixels or less); RULE-021 (Auto-convert AI masks to polygons); RULE-008 (Detection and polygon exports keep same-class objects separate); RULE-023 (Propagation seeds come only from mask segments on reference frames); RULE-090 (Sequence frame load order and per-class merge); RULE-052 (Undo/redo history scope); RULE-092 (Linked multi-view shape mirroring and class ids)

## SegmentManager state (per-image class registry)

**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:13`

| Field | Type | Note |
|---|---|---|
| `segments` | `list[dict[str, Any]]` | Ordered; index is the identity used by the segment table and undo records |
| `class_aliases` | `dict[int, str]` | Unvalidated free text; also round-tripped through NPZ (npz.py:25) and COCO categories (file_manager.py:635) |
| `next_class_id` | `int` | max(existing ids)+1, 0 when empty (segment_manager.py:816-826) |
| `active_class_id` | `int \| None` |  |
| `last_toggled_class_id` | `int \| None` | Hotkey fallback: last toggled, else highest existing id (segment_manager.py:425-440) |

**Rules that read or produce it:** RULE-086 (Active class toggle and recent-class hotkey); RULE-042 (Class alias editing is unvalidated); RULE-011 (New segments take the active class, otherwise the next free class id (highest + 1)); RULE-013 (Reassign class ids from class table order); RULE-007 (Label text to class ID resolution on import)

## Multi-view view payload (segment['views'][viewer_index])

**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:797`

| Field | Type | Note |
|---|---|---|
| `mask` | `np.ndarray bool \| None` |  |
| `vertices` | `list[[int,int]] \| None` | Erase mirrored into other viewers keeps only the largest contour (segment_manager.py:616-622) |

**Rules that read or produce it:** RULE-092 (Linked multi-view shape mirroring and class ids); RULE-057 (Multi-view batch navigation always saves, ignoring the Auto-Save setting)

## Erased-segment backup record

**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:525`

| Field | Type | Note |
|---|---|---|
| `index` | `int` | Index the segment held before erase |
| `segment` | `dict` | Shallow copy of the pre-erase Segment |

**Rules that read or produce it:** RULE-053 (Undoing an erase inserts malformed segment records); RULE-009 (Eraser splits segments and drops pieces of 10 pixels or less)

## Instance contour record

**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:307`

| Field | Type | Note |
|---|---|---|
| `class_id` | `int` |  |
| `channel` | `int` | Index into ExportContext.class_order / mask_tensor third axis |
| `contours` | `list[np.ndarray]` | cv2.findContours RETR_EXTERNAL output for the single segment, intersected with the final tensor channel (segment_manager.py:297-305) |

**Rules that read or produce it:** RULE-008 (Detection and polygon exports keep same-class objects separate); RULE-005 (YOLO Detection export line format); RULE-006 (YOLO Segmentation export polygon simplification); RULE-001 (COCO JSON export structure and area); RULE-004 (Pascal VOC export uses alias names and exclusive max bounds); RULE-002 (CreateML export/import: pixel center boxes)

## Final mask tensor

**Source:** `legacy/lazylabel/src/lazylabel/core/segment_manager.py:223`

| Field | Type | Note |
|---|---|---|
| `shape` | `(H, W, len(class_order)) uint8` | One binary channel per class, OR-merged across segments of that class |
| `channel order` | `list[int] class_order` | Built from get_unique_class_ids() (save_export_manager.py:400), i.e. ascending class id — not the Class Order table |
| `pixel priority` | `applied in place` | Overlapping pixels collapse to argmin/argmax of channel index (segment_manager.py:346-371) |

**Rules that read or produce it:** RULE-010 (Final per-class mask composition); RULE-012 (Pixel priority resolves overlapping classes); RULE-014 (Saved class channel order is ascending class ID, not the Class Order table); RULE-003 (NPZ Class Map export resolves overlaps to lowest class and stores foreground); RULE-018 (Crop is clamped to the image and blanks everything outside it on save, including the last row and column)

## ExportContext

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:97`

| Field | Type | Note |
|---|---|---|
| `image_path` | `str` | Every exporter derives its sidecar name from splitext(image_path)[0] + suffix |
| `image_size` | `tuple[int,int] (height, width)` | Read from the viewer pixmap, not the file (save_export_manager.py:396-399) |
| `class_order` | `list[int]` |  |
| `class_labels` | `list[str]` | Aliases, positional with class_order; used by VOC and CreateML names |
| `class_aliases` | `dict[int, str]` |  |
| `mask_tensor` | `np.ndarray (H,W,C) uint8` |  |
| `crop_coords` | `tuple[int,int,int,int] \| None` | Carried for information; the crop is already applied to mask_tensor at save_export_manager.py:413-417 |
| `instances` | `list[dict]` | Empty unless an instance-aware format is selected (save_export_manager.py:445-452); empty means exporters contour merged channels instead |

**Rules that read or produce it:** RULE-079 (Export writes every selected format and never removes other files); RULE-005 (YOLO Detection export line format); RULE-006 (YOLO Segmentation export polygon simplification); RULE-001 (COCO JSON export structure and area); RULE-004 (Pascal VOC export uses alias names and exclusive max bounds); RULE-002 (CreateML export/import: pixel center boxes); RULE-014 (Saved class channel order is ascending class ID, not the Class Order table); RULE-003 (NPZ Class Map export resolves overlaps to lowest class and stores foreground)

## ExportFormat registry and load priority

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:14`

| Field | Type | Note |
|---|---|---|
| `ExportFormat` | `Enum(NPZ, NPZ_CLASS_MAP, YOLO_DETECTION, YOLO_SEGMENTATION, COCO_JSON, PASCAL_VOC, CREATEML)` |  |
| `LOAD_PRIORITY` | `tuple[ExportFormat, ...]` | NPZ \> YOLO seg \> COCO \> NPZ class map \> VOC \> CreateML \> YOLO det (exporters/__init__.py:73-81); FileManager._LOAD_CHAIN mirrors it |
| `INSTANCE_AWARE_FORMATS` | `frozenset[ExportFormat]` | The five box/polygon formats (exporters/__init__.py:86-94) |
| `DEFAULT_EXPORT_FORMATS` | `set[ExportFormat]` | {NPZ, YOLO_DETECTION} (exporters/__init__.py:60-63) |
| `EXPORTERS` | `dict[ExportFormat, Exporter]` | Each exporter exposes export/get_output_path/delete_output (exporters/__init__.py:160-177) |
| `_OUTPUT_EXTENSIONS` | `set[str]` | '.npz', '_CM.npz', '.txt', '_seg.txt', '_coco.json', '.xml', '_createml.json' — the delete-all set |

**Rules that read or produce it:** RULE-078 (Annotations load from the best file present, and a damaged non-NPZ file stops the search); RULE-079 (Export writes every selected format and never removes other files); RULE-080 (Sidecar file naming and suffix collisions); RULE-083 (Saving an image with no segments deletes all of its annotation files)

## FileManager._LOAD_CHAIN entry

**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:128`

| Field | Type | Note |
|---|---|---|
| `suffix` | `str` | Appended to splitext(image_path)[0]: '.npz', '_seg.txt', '_coco.json', '_CM.npz', '.xml', '_createml.json', '.txt' |
| `fmt` | `str` | Loader key dispatched at file_manager.py:187-201 |

**Rules that read or produce it:** RULE-078 (Annotations load from the best file present, and a damaged non-NPZ file stops the search); RULE-080 (Sidecar file naming and suffix collisions); RULE-036 (File list annotation-status indicators)

## Imported box tuple (label, x1, y1, x2, y2)

**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:381`

| Field | Type | Note |
|---|---|---|
| `label` | `str` | Raw text; resolved through _build_label_map |
| `x1, y1` | `int` | Inclusive pixel min, clamped to \>= 0 |
| `x2, y2` | `int` | Exclusive pixel max, clamped to image w/h; box dropped if it collapses (file_manager.py:394-398) |

**Rules that read or produce it:** RULE-040 (YOLO Detection import validation, rounding and clamping); RULE-004 (Pascal VOC export uses alias names and exclusive max bounds); RULE-039 (Pascal VOC and CreateML import rules); RULE-002 (CreateML export/import: pixel center boxes); RULE-037 (COCO JSON import with polygon-then-box fallback)

## Label-to-class-id map

**Source:** `legacy/lazylabel/src/lazylabel/core/file_manager.py:345`

| Field | Type | Note |
|---|---|---|
| `label_map` | `dict[str, int]` | Resolution order: existing alias, then int(label), then freshly assigned id after all numeric labels claim theirs |
| `reverse_aliases` | `dict[str, int]` | Inverted class_aliases; duplicate alias text silently collapses |
| `unnamed` | `list[str]` | Non-numeric labels; each gets the lowest free id and is registered as an alias (file_manager.py:370-377) |

**Rules that read or produce it:** RULE-007 (Label text to class ID resolution on import); RULE-041 (YOLO Segmentation import validation); RULE-039 (Pascal VOC and CreateML import rules)

## NPZ archive (.npz)

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/npz.py:21`

| Field | Type | Note |
|---|---|---|
| `mask` | `np.ndarray (H,W,C) uint8` | Loader also accepts legacy key 'masks' with the same layout, and a (N,H,W) stack + 'class_ids' (file_manager.py:234-266) |
| `class_order` | `np.ndarray[int]` | Channel i maps to class_order[i]; absent in pre-key files, where channel index is taken as the class id (file_manager.py:254-258) |
| `class_aliases` | `dict[int, str] (pickled object array)` | Requires allow_pickle=True on load (file_manager.py:231, 335-343) |

**Rules that read or produce it:** RULE-014 (Saved class channel order is ascending class ID, not the Class Order table); RULE-038 (NPZ import (current and legacy layouts))

## NPZ Class Map archive (_CM.npz)

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:37`

| Field | Type | Note |
|---|---|---|
| `class_map` | `np.ndarray (H,W) uint16` | Overlaps resolve to the lowest channel index via argmax first-occurrence (npz_class_map.py:56-73) |
| `foreground` | `np.ndarray (H,W) bool` | Disambiguates class id 0 from background; missing in old files, which fall back to class_map != 0 (file_manager.py:303-307) |
| `class_order` | `np.ndarray[int]` |  |
| `class_aliases` | `dict[int, str]` |  |

**Rules that read or produce it:** RULE-003 (NPZ Class Map export resolves overlaps to lowest class and stores foreground)

## COCO JSON document (_coco.json)

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/coco.py:87`

| Field | Type | Note |
|---|---|---|
| `images[0]` | `{id:1, file_name:str, width:int, height:int}` | Always a single image with id 1 (coco.py:54) |
| `categories[]` | `{id:int, name:str, supercategory:str}` | Alias 'name.super' is split on the last dot (coco.py:19-27); loader rebuilds the dotted alias (file_manager.py:626-637) |
| `annotations[].bbox` | `[x, y, w, h] int` | cv2.boundingRect of the object contour |
| `annotations[].area` | `int` | contourArea when \>= 3 points, else w*h (coco.py:73-77) |
| `annotations[].segmentation` | `[[x1,y1,...]]` | Degenerate 1-2 point contours are padded into a closed ring (exporters/__init__.py:139-157) |
| `annotations[].iscrowd` | `int (always 0)` |  |

**Rules that read or produce it:** RULE-001 (COCO JSON export structure and area); RULE-037 (COCO JSON import with polygon-then-box fallback)

## YOLO Detection line (.txt)

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/yolo_detection.py:33`

| Field | Type | Note |
|---|---|---|
| `class_id` | `int` | Written as the raw class id, not the alias |
| `cx, cy` | `float` | (x + w/2)/W, (y + h/2)/H, full repr precision, space separated |
| `nw, nh` | `float` | w/W, h/H |
| `line grammar on import` | `exactly 5 whitespace tokens` | Other line lengths are silently skipped (file_manager.py:433-441) |

**Rules that read or produce it:** RULE-005 (YOLO Detection export line format); RULE-040 (YOLO Detection import validation, rounding and clamping)

## YOLO Segmentation line (_seg.txt)

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/yolo_segmentation.py:43`

| Field | Type | Note |
|---|---|---|
| `class_id` | `int` |  |
| `polygon` | `list[float] normalized x,y pairs` | approxPolyDP with epsilon = 0.001 * arcLength before normalizing (yolo_segmentation.py:34-36) |
| `import validation` | `\>= 7 tokens and odd token count` | Even-length lines rejected; \< 3 points dropped (file_manager.py:562-577) |
| `stored vertices` | `list[[int,int]]` | Import keeps both a rasterized mask and the vertices (file_manager.py:590-598) |

**Rules that read or produce it:** RULE-006 (YOLO Segmentation export polygon simplification); RULE-041 (YOLO Segmentation import validation)

## Pascal VOC XML document (.xml)

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/pascal_voc.py:25`

| Field | Type | Note |
|---|---|---|
| `filename` | `str` |  |
| `size` | `{width:int, height:int, depth:'3'}` | depth is hardcoded to 3 regardless of the real image (pascal_voc.py:31) |
| `object[].name` | `str` | Alias text from ExportContext.class_labels, not the numeric id |
| `object[].bndbox` | `{xmin, ymin, xmax, ymax} int` | xmax = x + w, i.e. exclusive; the loader reads it the same way (pascal_voc.py:48-49, file_manager.py:456-492) |
| `object[].pose/truncated/difficult` | `'Unspecified' / '0' / '0'` | Constant placeholders |

**Rules that read or produce it:** RULE-004 (Pascal VOC export uses alias names and exclusive max bounds); RULE-039 (Pascal VOC and CreateML import rules)

## CreateML JSON document (_createml.json)

**Source:** `legacy/lazylabel/src/lazylabel/core/exporters/createml.py:38`

| Field | Type | Note |
|---|---|---|
| `[0].image` | `str` | basename of the image |
| `annotations[].label` | `str` | Alias text |
| `annotations[].coordinates` | `{x, y, width, height}` | x,y are the pixel box centre (x + w/2), width/height are integers (createml.py:42-46) |
| `import shape guard` | `list whose first element is a dict` | Anything else is ignored (file_manager.py:509-510) |

**Rules that read or produce it:** RULE-002 (CreateML export/import: pixel center boxes); RULE-039 (Pascal VOC and CreateML import rules)

## Settings (settings.json)

**Source:** `legacy/lazylabel/src/lazylabel/config/settings.py:12`

| Field | Type | Note |
|---|---|---|
| `auto_save` | `bool = True` |  |
| `export_formats` | `list[str] = ['NPZ','YOLO_DETECTION']` | Stored as strings; sets of ExportFormat are normalized on update (settings.py:120-132) |
| `pixel_priority_enabled / pixel_priority_ascending` | `bool = False / True` |  |
| `polygon_join_threshold / fragment_threshold` | `int = 2 / 0` |  |
| `auto_polygon_enabled / polygon_resolution` | `bool = False / int = 80` |  |
| `brightness / contrast / gamma / saturation` | `float = 0.0 / 0.0 / 1.0 / 1.0` |  |
| `default_model_type / default_model_filename / operate_on_view` | `str = 'vit_h' / str = 'sam_vit_h_4b8939.pth' / bool = False` |  |
| `stream_window_size` | `int = 250` |  |
| `annotation_size_multiplier / pan_multiplier` | `float = 1.0 / 1.0` |  |
| `file_manager_show_* / file_manager_sort_order` | `bool / int = 0` |  |
| `load behaviour` | `cls(**data)` | Any unknown key raises TypeError and the whole file falls back to defaults (settings.py:96-98) |
| `legacy migration` | `save_npz/save_txt -\> export_formats` | bb_use_alias and save_class_aliases are dropped with no equivalent (settings.py:100-118) |

**Rules that read or produce it:** RULE-088 (One unknown key in settings.json resets every preference; old save flags migrate to export formats); RULE-059 (Auto-save current image before switching images (single view)); RULE-050 (Annotation setting input limits); RULE-033 (Annotation marker size, pan step and zoom); RULE-026 (Streaming (chunked) propagation windows); RULE-021 (Auto-convert AI masks to polygons); RULE-028 (Display image adjustments (saturation, brightness/contrast, gamma)); RULE-089 (Operate On View chooses which pixels the AI segments)

## Control-panel save settings dict

**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/settings_widget.py:148`

| Field | Type | Note |
|---|---|---|
| `auto_save` | `bool` |  |
| `export_formats` | `set[ExportFormat]` | Coerced from list[str] when read back (save_export_manager.py:118-120) |
| `operate_on_view` | `bool` |  |
| `pixel_priority_enabled` | `bool` |  |
| `pixel_priority_ascending` | `bool` |  |

**Rules that read or produce it:** RULE-079 (Export writes every selected format and never removes other files); RULE-012 (Pixel priority resolves overlapping classes); RULE-059 (Auto-save current image before switching images (single view)); RULE-089 (Operate On View chooses which pixels the AI segments); RULE-088 (One unknown key in settings.json resets every preference; old save flags migrate to export formats)

## HotkeyAction (hotkeys.json)

**Source:** `legacy/lazylabel/src/lazylabel/config/hotkeys.py:10`

| Field | Type | Note |
|---|---|---|
| `name` | `str` | Stable key in hotkeys.json |
| `description` | `str` |  |
| `primary_key` | `str` | QKeySequence text, e.g. 'Ctrl+Z', 'Space' |
| `secondary_key` | `str \| None` |  |
| `category` | `str = 'General'` | Navigation / Modes / Actions / Segments / View |
| `mouse_related` | `bool = False` | True blocks reassignment and excludes the action from the saved file (hotkeys.py:210-222, 244-258) |

**Rules that read or produce it:** RULE-049 (Hotkey assignment conflicts are blocked); RULE-086 (Active class toggle and recent-class hotkey); RULE-068 (Enter completes pending work then saves); RULE-088 (One unknown key in settings.json resets every preference; old save flags migrate to export formats)

## FileInfo (file list row)

**Source:** `legacy/lazylabel/src/lazylabel/utils/fast_file_manager.py:138`

| Field | Type | Note |
|---|---|---|
| `path / name` | `Path / str` |  |
| `size / modified` | `int / float` | Both lazily populated; the scanner does no stat calls (fast_file_manager.py:224) |
| `has_npz / has_cm_npz` | `bool` | Derived from sibling file stems, not from file contents (fast_file_manager.py:195-199) |
| `has_txt / has_seg_txt` | `bool` | '_seg' suffix split at fast_file_manager.py:200-204 |
| `has_coco_json / has_createml_json / has_xml` | `bool` |  |
| `thumbnail` | `QPixmap \| None` |  |
| `image extension set` | `{'.png','.jpg','.jpeg','.tiff','.tif'}` | fast_file_manager.py:37 and file_manager.py:743; image_discovery_worker.py:8 accepts three more (.bmp/.gif/.webp) — the two lists disagree |

**Rules that read or produce it:** RULE-036 (File list annotation-status indicators); RULE-051 (Supported image formats); RULE-080 (Sidecar file naming and suffix collisions); RULE-093 (Timeline is built from the file list order between Start and End)

## Undo/redo action record

**Source:** `legacy/lazylabel/src/lazylabel/core/undo_redo_manager.py:25`

| Field | Type | Note |
|---|---|---|
| `type` | `str` | add_segment \| add_point \| add_polygon_point \| move_polygon \| move_vertex \| move_circle \| multi_view_polygon_point \| erase_segments \| delete_segments (undo_redo_manager.py:65-82). Unknown types warn and are popped back off the stack |
| `segment_index / vertex_index` | `int` | Positional; stale after any list mutation (undo_redo_manager.py:556-561) |
| `old_pos / new_pos` | `[x, y]` | move_vertex (editable_vertex.py:53-62) |
| `old_center / new_center / old_radius_pt / new_radius_pt` | `[x, y]` | move_circle (main_window.py:2626-2637); undo writes both entries back as vertices, so a centre-only drag also restores the old radius |
| `initial_vertices / final_vertices` | `dict[int, list]` | move_polygon (single_view_mouse_handler.py:313-321) |
| `removed_segments` | `list[{index, segment}]` | erase_segments; undo feeds these wrappers straight into add_segment (undo_redo_manager.py:596-597) |
| `deleted_segments` | `list[dict]` | delete_segments path exists but the delete button never records it (segment_table_manager.py:79-86) |
| `point_item / dot_item` | `QGraphicsItem` | Live Qt objects stored in the history — not serializable |
| `viewer_mode / viewer_index` | `str = 'single' \| int` |  |
| `history` | `list, unbounded` | Cleared per image/frame (main_window.py:3588-3589); no size cap anywhere |

**Rules that read or produce it:** RULE-052 (Undo/redo history scope); RULE-053 (Undoing an erase inserts malformed segment records); RULE-061 (Undoing a circle center drag changes the circle's radius)

## Crop state

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/crop_manager.py:30`

| Field | Type | Note |
|---|---|---|
| `current_crop_coords` | `tuple[int,int,int,int] \| None` | (x1, y1, x2, y2) in image pixels |
| `crop_coords_by_size` | `dict[(width,height), (x1,y1,x2,y2)]` | Keyed by image size, so the crop reapplies to every same-sized image (crop_manager.py:144-145) |
| `clamping` | `0..w-1 / 0..h-1` | crop_manager.py:131-134; combined with the zeroing at file_manager.py:728-737 the last row and column are always blanked |
| `crop_mode / crop_rect_item / overlays` | `bool / QGraphicsRectItem / list` | Transient drawing state |

**Rules that read or produce it:** RULE-018 (Crop is clamped to the image and blanks everything outside it on save, including the last row and column); RULE-067 (Crop persistence across image navigation); RULE-045 (Crop coordinate validation and reuse by image size)

## PropagationState

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:78`

| Field | Type | Note |
|---|---|---|
| `is_initialized / image_dir / total_frames` | `bool / str\|None / int` |  |
| `reference_frame_indices` | `set[int]` | SAM2 index space |
| `reference_annotations` | `list[ReferenceAnnotation]` |  |
| `propagated_frames / flagged_frames` | `set[int]` | Timeline index space |
| `frame_results` | `dict[int, list[PropagationResult]]` | Timeline index space |
| `confidence_threshold` | `float = 0.99` | set_confidence_threshold recomputes flagged_frames from frame_results (propagation_manager.py:1254-1271) but does not touch SequenceViewMode statuses |
| `sam2_to_timeline / timeline_to_sam2` | `dict[int,int]` | Two index spaces; skipped frames exist only in the timeline space |
| `skipped_frame_indices` | `set[int]` |  |
| `reference_dimensions` | `tuple[int,int] \| None` | (height, width) lock for the whole sequence |
| `all_image_paths / image_cache` | `list[str] / dict[str, np.ndarray] \| None` |  |
| `chunk_config` | `ChunkConfig` |  |

**Rules that read or produce it:** RULE-025 (Propagation direction and range); RULE-044 (Propagation preconditions); RULE-048 (Reference frames must match the first reference's image size); RULE-071 (First propagation sets up the engine once and marks wrong-size frames Skipped); RULE-073 (Min Conf change re-evaluates flags in the engine but not on the timeline); RULE-075 (Each Propagate run resets earlier results except reference and skipped frames); RULE-081 (Propagation never overwrites reference frames and, by default, frames already labeled)

## PropagationResult

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:47`

| Field | Type | Note |
|---|---|---|
| `frame_idx` | `int` |  |
| `obj_id` | `int` | 1-based object id assigned per reference segment |
| `mask` | `np.ndarray` |  |
| `confidence` | `float` | Compared against state.confidence_threshold at propagation_manager.py:764 and 1096 |
| `image_path` | `str` |  |

**Rules that read or produce it:** RULE-016 (Propagation confidence score per object); RULE-060 (Propagated frame flagging and commit (Keep Flagged Masks)); RULE-082 (Save All propagated frames eligibility); RULE-035 (Confidence histogram binning)

## ReferenceAnnotation (propagation engine)

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:58`

| Field | Type | Note |
|---|---|---|
| `frame_idx` | `int` | Stored in SAM2 index space after translation (propagation_manager.py:401-415) |
| `obj_id` | `int` | Auto-assigned as max(existing)+1 when not supplied |
| `mask` | `np.ndarray` | Copied on store |
| `class_id` | `int` |  |
| `class_name` | `str` | Alias, or 'Class {id}' fallback (propagation_manager.py:458-460) |

**Rules that read or produce it:** RULE-023 (Propagation seeds come only from mask segments on reference frames); RULE-044 (Propagation preconditions)

## ReferenceAnnotation (sequence mode) — divergent twin

**Source:** `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:32`

| Field | Type | Note |
|---|---|---|
| `frame_idx` | `int` | Timeline index space, unlike the engine's copy |
| `obj_id` | `int` | seg_idx + 1 (sequence_view_mode.py:261) |
| `mask` | `np.ndarray` |  |
| `class_id` | `int = 0` |  |
| `points / labels` | `list / list` | Present here but absent from the engine dataclass; never populated in the code read |

**Rules that read or produce it:** RULE-023 (Propagation seeds come only from mask segments on reference frames); RULE-048 (Reference frames must match the first reference's image size); RULE-022 (Find Archetypes suggests about 2% of frames (between 5 and 50) as references)

## ChunkConfig

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/propagation_manager.py:69`

| Field | Type | Note |
|---|---|---|
| `chunk_size` | `int = 250` | Frames per chunk, documented as ~3 GB of frame tensor |
| `overlap` | `int = 5` | Frames shared between consecutive chunks |
| `streaming` | `bool = True` | False falls back to full-context propagation |

**Rules that read or produce it:** RULE-026 (Streaming (chunked) propagation windows); RULE-025 (Propagation direction and range)

## ReferenceSegmentData

**Source:** `legacy/lazylabel/src/lazylabel/ui/workers/propagation_worker.py:205`

| Field | Type | Note |
|---|---|---|
| `frame_idx` | `int` |  |
| `mask` | `np.ndarray` |  |
| `class_id` | `int` |  |
| `class_name` | `str` |  |
| `obj_id` | `int` |  |

**Rules that read or produce it:** RULE-023 (Propagation seeds come only from mask segments on reference frames); RULE-044 (Propagation preconditions)

## SequenceViewMode frame state

**Source:** `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:72`

| Field | Type | Note |
|---|---|---|
| `_image_paths` | `list[str]` | Defines the timeline; index is position in this list |
| `_frame_statuses` | `dict[int, FrameStatus]` | Every frame initialized PENDING (sequence_view_mode.py:140-141) |
| `_propagated_masks` | `dict[int, dict[obj_id, np.ndarray]]` | Merged per frame; deleted when the frame is marked Saved (sequence_view_mode.py:365-373) |
| `_confidence_scores` | `dict[int, float]` | Per frame minimum across objects (sequence_view_mode.py:307-313) |
| `_obj_class_map` | `dict[int, (class_id, class_name)]` | Survives engine cleanup and trim |
| `_reference_annotations` | `dict[int, list[ReferenceAnnotation]]` |  |
| `_reference_dimensions / _skipped_frame_indices` | `tuple[int,int]\|None / set[int]` |  |
| `_suggested_frames` | `list[int]` | Find Archetypes output |
| `_confidence_threshold` | `float = 0.99` | Setter only stores the value; statuses are re-evaluated solely in mark_frame_propagated (sequence_view_mode.py:315-318, 539-541) |
| `to_dict/from_dict snapshot` | `dict` | image_paths, current_frame_idx, reference_frame_indices, frame_statuses, confidence_scores, confidence_threshold, obj_class_map (sequence_view_mode.py:711-718) — no production caller; only tests invoke it |
| `trim re-keying` | `path-keyed snapshots` | All per-frame maps are rebuilt from image-path keys (sequence_view_mode.py:627-673) |

**Rules that read or produce it:** RULE-076 (Timeline frame status lifecycle); RULE-072 (Frame status precedence, suggestions and timeline sort); RULE-077 (Trim removes frames from the timeline only and re-keys state by image path); RULE-056 (Leaving the Sequence tab or clicking New Timeline discards all sequence work without saving); RULE-055 (Leaving a sequence frame saves it and marks it Saved, even if it is a reference); RULE-090 (Sequence frame load order and per-class merge); RULE-022 (Find Archetypes suggests about 2% of frames (between 5 and 50) as references); RULE-064 (Clear Flags repaints non-reference frames as pending without touching results); RULE-073 (Min Conf change re-evaluates flags in the engine but not on the timeline)

## FrameStatus (two divergent enums)

**Source:** `legacy/lazylabel/src/lazylabel/ui/modes/sequence_view_mode.py:20`

| Field | Type | Note |
|---|---|---|
| `sequence_view_mode.FrameStatus` | `Enum(PENDING, REFERENCE, PROPAGATED, FLAGGED, SAVED, SKIPPED, SUGGESTED)` | Seven states; the timeline renders these strings |
| `propagation_manager.FrameStatus` | `Enum(PENDING, REFERENCE, PROPAGATED, FLAGGED, SKIPPED)` | propagation_manager.py:37-44 — a second, five-state enum with the same name; no SAVED or SUGGESTED |
| `wire format` | `str value` | Signals carry status.value, not the enum (sequence_view_mode.py:322) |

**Rules that read or produce it:** RULE-076 (Timeline frame status lifecycle); RULE-072 (Frame status precedence, suggestions and timeline sort); RULE-060 (Propagated frame flagging and commit (Keep Flagged Masks))

## Timeline frame model

**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/timeline_widget.py:57`

| Field | Type | Note |
|---|---|---|
| `frame_statuses` | `dict[int, str]` |  |
| `_frame_names / _confidence_scores` | `list[str] / dict[int, float]` |  |
| `_display_order / _reverse_order` | `list[int] / dict[int,int]` | Indirection layer so sorting never renumbers real indices |
| `_trim_left / _trim_right` | `int \| None` | Real frame indices; Keep inverts the range (main_window.py:5303-5336) |
| `COLORS` | `dict[str, QColor]` | reference gold, propagated green, pending grey, flagged red, saved cyan, skipped brown, suggested purple, current blue (timeline_widget.py:31-40) |
| `_STATUS_PRIORITY` | `dict[str,int]` | reference 0 \< saved 1 \< propagated 2 \< suggested 3 \< pending 4 \< flagged 5 \< skipped 6; unknown statuses default to 3 (timeline_widget.py:43-51, 112) |
| `_zoom / _scroll_offset / _visible_count` | `float / int / int` |  |

**Rules that read or produce it:** RULE-072 (Frame status precedence, suggestions and timeline sort); RULE-077 (Trim removes frames from the timeline only and re-keys state by image path); RULE-093 (Timeline is built from the file list order between Start and End); RULE-065 (Selecting a file in the Sequence tab jumps to its frame; a file outside the timeline bounces back)

## Confidence histogram model

**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/confidence_histogram_dialog.py:26`

| Field | Type | Note |
|---|---|---|
| `NUM_BINS` | `int = 50` | Fixed bin count |
| `_bins` | `list[int]` | idx = int((s - view_min)/span * 50), clamped to 49 (confidence_histogram_dialog.py:73-75) |
| `scores` | `list[float]` | Per-frame confidence values |
| `_threshold` | `float` | Draggable Min Conf marker |

**Rules that read or produce it:** RULE-035 (Confidence histogram binning); RULE-016 (Propagation confidence score per object); RULE-060 (Propagated frame flagging and commit (Keep Flagged Masks))

## Image adjustment state

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/image_adjustment_manager.py:43`

| Field | Type | Note |
|---|---|---|
| `brightness / contrast` | `float` | Seeded from Settings; defaults 0.0 |
| `gamma` | `float` | Slider value / 100 → 0.01-2.0 (image_adjustment_manager.py:94) |
| `saturation` | `float` | Slider value / 100 → 0.0-2.0, 0 = grayscale (image_adjustment_manager.py:105) |
| `_cached_original_image` | `np.ndarray \| None` | Pre-adjustment pixels, the source for Operate On View |
| `_cached_multi_view_original_images` | `list[np.ndarray\|None] \| None` |  |

**Rules that read or produce it:** RULE-028 (Display image adjustments (saturation, brightness/contrast, gamma)); RULE-024 (Grayscale detection tolerance and 16-bit display conversion); RULE-089 (Operate On View chooses which pixels the AI segments)

## Channel threshold parameters

**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/channel_threshold_widget.py:577`

| Field | Type | Note |
|---|---|---|
| `params[channel]` | `{'indicators': list[int] sorted, 'enabled': bool}` | Channel key is 'Gray' for 1-channel images, 'Red'/'Green'/'Blue' for 3-channel (channel_threshold_widget.py:513-522) |
| `get_threshold_settings()` | `dict[str, list[int]]` | A second, thinner shape returning only the indicator list (channel_threshold_widget.py:496-501) |
| `posterization levels` | `(level_idx / (num_levels-1)) * 255` | Evenly redistributed output values (channel_threshold_widget.py:490-494) |

**Rules that read or produce it:** RULE-029 (Channel threshold posterization); RULE-028 (Display image adjustments (saturation, brightness/contrast, gamma)); RULE-024 (Grayscale detection tolerance and 16-bit display conversion)

## FFT threshold settings

**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/fft_threshold_widget.py:498`

| Field | Type | Note |
|---|---|---|
| `frequency_thresholds` | `list[int]` | Frequency-band cut points |
| `intensity_thresholds` | `list[int]` | Post-inverse-FFT posterization cut points |
| `is_active` | `bool` |  |
| `_cached_fft_shifted / _cached_freq_distance / _cached_image_shape` | `np.ndarray \| tuple` | Invalidated when the crop region changes (fft_threshold_widget.py:519-523) |

**Rules that read or produce it:** RULE-030 (FFT frequency-band thresholding for grayscale images); RULE-029 (Channel threshold posterization); RULE-045 (Crop coordinate validation and reuse by image size)

## Rescale widget state

**Source:** `legacy/lazylabel/src/lazylabel/ui/widgets/rescale_widget.py:252`

| Field | Type | Note |
|---|---|---|
| `_is_grayscale` | `bool` | Only len(shape) == 2 enables the control; RGB disables it (rescale_widget.py:275-283) |
| `_slider_max / _output_max` | `int` | 65535 for uint16, else 255 (rescale_widget.py:284-290) |
| `_lut / _preset_name / _clahe_image` | `np.ndarray \| str \| np.ndarray` | Preset LUT is cleared as soon as a handle is dragged manually (rescale_widget.py:303-312) |
| `_crop_coords` | `tuple \| None` | Histogram is computed over the crop region only |

**Rules that read or produce it:** RULE-032 (Linear min/max rescale for grayscale images); RULE-031 (Histogram presets: contrast stretch, equalization, CLAHE); RULE-024 (Grayscale detection tolerance and 16-bit display conversion)

## SAM prediction result

**Source:** `legacy/lazylabel/src/lazylabel/models/sam_model.py:233`

| Field | Type | Note |
|---|---|---|
| `mask` | `np.ndarray` | masks[argmax(scores)] — the single highest-scoring candidate; float masks are thresholded at \> 0.5 by the caller (save_export_manager.py:247-248) |
| `score` | `float` | scores[best_mask_idx] |
| `logits` | `np.ndarray` | logits[best_mask_idx]; returned but unused on the save path |
| `box variant` | `predict_from_box(box)` | Same tuple shape (sam_model.py:238-251) |

**Rules that read or produce it:** RULE-020 (SAM best-mask selection and click coordinate mapping); RULE-066 (Accepting AI previews); RULE-062 (AI mode: click adds a point, a drag over 5 px draws a box, Space accepts the preview); RULE-027 (The fragment filter keeps only regions at least X% of the largest region)

## Model entry (display_name, full_path)

**Source:** `legacy/lazylabel/src/lazylabel/core/model_manager.py:58`

| Field | Type | Note |
|---|---|---|
| `display_name` | `str` | Path relative to the models folder; list sorted by this |
| `full_path` | `str` | Any .pth or .pt found by os.walk (model_manager.py:67) |
| `detected type` | `str` | Substring match on the lowercased filename: sam2/hiera/_t./_s./_b+./_l. → sam2_*, else vit_l/vit_b/vit_h with vit_h as the fallback (model_manager.py:74-104) |
| `SAM1 fallback mapping` | `dict[str,str]` | sam2_tiny/small→vit_b, base_plus→vit_l, large→vit_h (model_manager.py:151-157) |

**Rules that read or produce it:** RULE-085 (Model type detected from file name); RULE-084 (AI features require segment-anything and PyTorch 2.7.1+); RULE-044 (Propagation preconditions); RULE-087 (Default model download integrity check)

## SAM2 video staging directory

**Source:** `legacy/lazylabel/src/lazylabel/models/sam2_model.py:779`

| Field | Type | Note |
|---|---|---|
| `staged filename` | `f'{i:05d}.jpg'` | i is the position in the filtered path list; SAM2 requires numeric names |
| `video_image_paths` | `list[str]` | Original paths kept in parallel for index translation |
| `unreadable frame` | `continue` | sam2_model.py:800-802 skips writing without removing the index, so the staged sequence has a numbering gap while video_image_paths still counts it |
| `already-JPEG frames` | `symlink, copy2 fallback` | sam2_model.py:788-796 |

**Rules that read or produce it:** RULE-017 (SAM 2 frame staging numbering gap); RULE-048 (Reference frames must match the first reference's image size); RULE-071 (First propagation sets up the engine once and marks wrong-size frames Skipped)

## Embedding cache entry

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/embedding_cache_manager.py:24`

| Field | Type | Note |
|---|---|---|
| `key` | `str` | Image file path |
| `value` | `SAM embeddings (opaque)` | None values are refused (embedding_cache_manager.py:66-67) |
| `_max_size` | `int = 10` | OrderedDict LRU; oldest evicted on overflow (embedding_cache_manager.py:18, 69-71) |

**Rules that read or produce it:** RULE-091 (Up to 10 image embeddings are cached by file path and computed ahead for nearby images); RULE-074 (AI embedding goes dirty, then updating, then ready, and a failed embed is reported as ready); RULE-020 (SAM best-mask selection and click coordinate mapping)

## AppContext / UIContext / FullContext

**Source:** `legacy/lazylabel/src/lazylabel/core/app_context.py:35`

| Field | Type | Note |
|---|---|---|
| `segment_manager / model_manager / file_manager` | `required managers` | The three required constructor args |
| `undo_redo_manager` | `UndoRedoManager \| None` | Injected after construction (app_context.py:68-74) |
| `paths / settings / hotkey_manager` | `Paths \| Settings \| HotkeyManager, all optional` |  |
| `_ui_state` | `dict[str, Any]` | Untyped key-value bag, the escape hatch for anything not modelled (app_context.py:66, 102-132) |
| `UIContext` | `viewer, control_panel, right_panel, notification_manager, status_bar, multi_view_viewers, multi_view_info_labels` | All typed Any (app_context.py:135-158) |

**Rules that read or produce it:** RULE-069 (Edit mode entry and mode toggling); RULE-088 (One unknown key in settings.json resets every preference; old save flags migrate to export formats); RULE-070 (Mode toggles fail to return to the last drawing mode)

## Drawing / AI interaction state

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/drawing_state_manager.py:40`

| Field | Type | Note |
|---|---|---|
| `_positive_points / _negative_points` | `list[QPointF]` | AI click prompts |
| `_polygon_points` | `list[QPointF]` | Needs \>= 3 to finalize (single_view_mode.py:266-267); closes within the join threshold of point 0 |
| `_ai_click_start_pos / _ai_click_time` | `QPointF \| None / int` | Click-vs-drag discrimination inputs |
| `_ai_bbox_preview_mask / _ai_bbox_preview_rect` | `np.ndarray \| None / QRectF \| None` | Accepted by Space; cleared on accept (save_export_manager.py:205-206) |
| `_preview_mask_item` | `QGraphicsPixmapItem \| None` |  |
| `_is_dragging_polygon / _drag_initial_vertices` | `bool / dict` | Feeds the move_polygon undo record |
| `annotation slider bounds` | `size 1-50, pan 1-100, join 1-10` | annotation_settings_widget.py:68-91; size and pan are stored as value/10 |

**Rules that read or produce it:** RULE-062 (AI mode: click adds a point, a drag over 5 px draws a box, Space accepts the preview); RULE-047 (A polygon needs 3 points and closes when clicking within the join distance of its first point); RULE-043 (Manual box and circle minimum sizes); RULE-066 (Accepting AI previews); RULE-050 (Annotation setting input limits); RULE-033 (Annotation marker size, pan step and zoom); RULE-046 (Edit mode eligibility and 200-vertex limit); RULE-069 (Edit mode entry and mode toggling)

## Class display colour

**Source:** `legacy/lazylabel/src/lazylabel/ui/managers/segment_display_manager.py:219`

| Field | Type | Note |
|---|---|---|
| `hue` | `int` | (class_id * 222.4922359) % 360 — golden-angle spacing (segment_display_manager.py:239) |
| `saturation / value` | `220 / 220` | Fixed; class_id None renders as HSV(0,0,128) |
| `_class_color_cache` | `dict[int, QColor]` | Memoized per class id |

**Rules that read or produce it:** RULE-034 (Class display color); RULE-072 (Frame status precedence, suggestions and timeline sort); RULE-094 (Click selection toggles the topmost segment)

