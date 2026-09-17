# TRANSFORMATION NOTES: annotation format library

| | |
|---|---|
| Phase | 1 of `analysis/lazylabel/MODERNIZATION_BRIEF.md`, the pilot |
| From | `legacy/lazylabel/src/lazylabel/core/` at 2a7d5d8, Python 3.10 with NumPy and OpenCV |
| To | `modernized/lazylabel/core/exporters`, TypeScript 6.0.3 on Node 22.17, no runtime dependencies |
| Proof | 1,745 unit and characterization tests, 60 byte-level differential cases, 24 NumPy array comparisons |
| Date | 2026-09-17 |

The library reads and writes all seven annotation formats and decides which file wins when an image
has several. It holds no file system access: writers return content and the caller writes it, so the
same code serves the browser, the API and the tests.

## Equivalence, and how it was proven

Dual execution was available: the legacy package imports and runs in the project venv, so both
implementations ran on identical inputs.

| Proof | Scope | Result |
|---|---|---|
| Byte-level differential | 5 text and XML formats x 12 fixture cases | 60 of 60 identical after line-ending normalization |
| NumPy array comparison | 2 NPZ formats x 12 cases | 24 of 24 identical, aliases equal by value |
| OpenCV corpus | 395 masks, 941 contours, 8,603 simplifications, 247 fills | 1,551 of 1,551 |
| Extended differential (not committed) | ~250,000 comparisons against live OpenCV | 0 divergences |
| CPython parity | float repr, `json.dump`, `os.path.splitext`, `round` | 64 float cases and all others identical |
| Round trip | write then read, all 12 cases | pixel-exact, circles and pixel priority included |

Mutation testing checked that the tests bite: removing the contour reversal broke 372 tests,
removing the Bresenham outline from the polygon fill broke more, and dropping the float narrowing in
the perimeter calculation broke 287.

## Mapping

| Behavior | Legacy | Target |
|---|---|---|
| Export context shape, format registry, load priority | `core/exporters/__init__.py:14-110` | `src/types.ts` |
| Object enumeration, contour to polygon | `core/exporters/__init__.py:114-156` | `src/format/objects.ts` |
| One-hot mask tensor, pixel priority | `core/segment_manager.py:212-252, 317-373` | `src/mask/tensor.ts` |
| Crop application | `core/file_manager.py:712-739` | `src/mask/tensor.ts` |
| Per-object contours | `core/segment_manager.py:254-315` | `src/mask/tensor.ts` |
| Polygon and circle rasterization | `core/segment_manager.py:174-203` | `src/mask/tensor.ts` with `src/geometry/rasterize.ts` |
| `cv2` contour tracing, simplification, fills, measurements | OpenCV 4.12 | `src/geometry/` |
| YOLO Segmentation write and read | `core/exporters/yolo_segmentation.py:25-56`, `core/file_manager.py:542-600` | `src/format/yoloSegmentation.ts` |
| YOLO Detection write and read | `core/exporters/yolo_detection.py:19-46`, `core/file_manager.py:412-454` | `src/format/yoloDetection.ts` |
| COCO write and read | `core/exporters/coco.py:19-97`, `core/file_manager.py:602-710` | `src/format/coco.ts` |
| Pascal VOC write and read | `core/exporters/pascal_voc.py:22-59`, `core/file_manager.py:456-493` | `src/format/pascalVoc.ts` |
| CreateML write and read | `core/exporters/createml.py:33-64`, `core/file_manager.py:495-540` | `src/format/createMl.ts` |
| NPZ write and read | `core/exporters/npz.py:15-30`, `core/file_manager.py:224-280` | `src/format/npz.ts` |
| NPZ Class Map write and read | `core/exporters/npz_class_map.py:20-73`, `core/file_manager.py:282-333` | `src/format/npzClassMap.ts` |
| Label to class id resolution | `core/file_manager.py:345-379` | `src/format/labels.ts` |
| Imported boxes to segments | `core/file_manager.py:381-410` | `src/format/boxes.ts` |
| Load priority chain | `core/file_manager.py:125-205` | `src/load/chain.ts` |
| NumPy `.npy` and `.npz` containers | NumPy | `src/util/npy.ts`, `src/util/zip.ts` |
| Python float repr and `json.dump` | CPython | `src/format/pyRepr.ts`, `src/util/pythonJson.ts` |

## Deliberate deviations

Each traces to an approved decision in the brief's section 7.

1. **Class aliases are JSON, not pickle** (decision 4, closes SEC-01). The legacy NPZ writers store
   the alias table as a pickled Python dict, so opening one executes whatever it contains. Here it
   is JSON inside a NumPy unicode scalar, which NumPy still reads with a plain `str()`. A pickled
   member in an incoming file is refused rather than executed, and read as absent. This is a one-way
   break: legacy LazyLabel reads the masks of a file this library writes but not its aliases. The
   offline converter for existing files is a Phase 4 deliverable.
2. **A damaged file is reported, not swallowed** (decisions 7 and 15c). In legacy, five of seven
   loaders catch their own errors and return normally, so a corrupt file yields an empty canvas and
   the chain stops. With auto-save on, navigating away then deletes the user's healthy files. Here
   the chain raises, and the caller must surface it. The priority order is unchanged.
3. **Nothing is deleted by this library** (decision 7). The legacy save path deletes every sidecar of
   an image whose segments are empty, whatever wrote them. Deletion is not part of the format layer.
4. **Text output uses LF** (decision 10). Legacy opens files in text mode and emits CRLF on Windows,
   so differential comparison normalizes line endings.
5. **Import text is UTF-8 with the byte-order mark stripped** (decision 15b). Legacy uses the host
   locale encoding, which makes byte equivalence undefined for non-ASCII files and turns a leading
   mark into a class name.
6. **Readers return aliases instead of mutating a shared store**, which is what let the load chain be
   a pure function.

## Not migrated

- `FileManager.save_npz` and `save_bb_txt` (`core/file_manager.py:38-123`): dead second writers.
  `save_bb_txt` writes the class NAME where the live exporter writes the id, so porting it would
  have corrupted every YOLO file.
- `_save_viewer_output` (`ui/managers/save_export_manager.py`): no callers. A judge cited it as
  evidence for an eighth output file; the rule review refuted that from the call graph.
- `delete_all_outputs` (`core/exporters/__init__.py:209-215`): deletion is out of scope per decision 7.
- The `Exporter` protocol's `delete_output` methods, for the same reason.
- Legacy NPZ layouts are READ but never written: the `masks` key and the `(N, H, W)` stack with
  `class_ids`.

## Residual risks

1. **Unstable sort.** OpenCV sorts fill edges with `std::sort`, which is unstable; the port uses
   JavaScript's stable sort. Distinguishable only for edges equal in start row, x and slope but
   differing in end row. 9,001 targeted cases found no difference, which is evidence, not proof.
2. **Fixed-point width.** OpenCV keeps fill arithmetic in 64-bit integers; the port uses doubles,
   exact while coordinates stay under about 2^36, far beyond any real image.
3. **Line endings.** Golden files captured on Windows carry CRLF. Any comparison that skips
   normalization will fail on one platform and pass on the other.
4. **Locale-encoded legacy files.** A non-ASCII annotation file written by a Windows legacy install
   in cp1252 will not decode as UTF-8. The converter in Phase 4 has to handle it.

## Follow-ups for the phases that consume this

- **Phase 2 and 4:** the caller owns paths, atomic writes and the stale-sidecar warning that
  decision 15f requires. The library deliberately does none of it.
- **Phase 4:** the offline converter for pickled alias tables, and an import report that surfaces
  the load errors this library now raises.
- **Phase 4:** sidecar discovery still matches on the image base name, so `foo.png` and `foo.jpg`
  share files (decision 15e keeps that, and it needs a user-visible warning).
- **Phase 5:** the segment model here covers what export needs. Editing operations, undo and the
  class table stay with the workspace store.
