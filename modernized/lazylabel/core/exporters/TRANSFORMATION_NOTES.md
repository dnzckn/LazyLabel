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
   member in an incoming file is refused rather than executed, and read as absent.

   The member is named `class_aliases_json`, not `class_aliases`, and that detail decides whether
   the desktop app can open these files at all. Legacy's `_restore_aliases` calls `.item()` on the
   member inside a try and `.items()` on the result outside it, so a unicode scalar under the old
   name raises and the entire legacy load fails with zero segments. Under the new name legacy takes
   its early exit and reads the masks, losing only the names. Verified by running the legacy loader
   against this library's output, and gated by `tools/compare_npz.py`. The offline converter for
   existing pickled files is a Phase 4 deliverable.
2. **A damaged file is reported, not swallowed** (decisions 7 and 15c). In legacy, the loaders that
   catch their own errors return normally, so a corrupt file yields an empty canvas and the chain
   stops there; the ones that raise let the chain continue to a lower-priority file. With auto-save
   on, the first case then deletes the user's healthy files on the next navigation. Here any
   unreadable winner raises `AnnotationLoadError`, the caller must surface it, and the chain never
   falls through. The priority order is unchanged. Readers also return a `rejected` count, so a
   file that is readable but mostly junk can be reported as "412 unreadable lines" rather than as
   an empty canvas.
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

## Architecture review, 2026-09-17

An adversarial review verified its findings by execution and reported eight high-severity items.
All eight are fixed, each with a test that fails without the fix:

| Finding | Fix |
|---|---|
| Legacy could not read ANY NPZ this library wrote, and these notes claimed otherwise | alias member renamed; legacy read proven and gated |
| A corrupt NPZ crashed the Node process and produced an empty error message | both stream ends handled; failures carry a message |
| "Damaged files are reported" held for four of seven formats | XML and text readers now refuse binary and non-XML, and count rejects |
| `src/mask/tensor.ts`, four P0 rules, had no test of its own | direct suite against the manifest and the goldens; mutation-checked |
| `classAliases` meant two different things depending on which file won | readers return only what the file establishes; caller merges |
| No input limits existed, so a 204-byte file allocated 1.8 GB | `src/limits.ts`, enforced in the archive and array readers |
| The load chain was not exported and the package had no build output | exported; `npm run build` emits `dist/` with declarations |
| Reads past the end of a member, and silent corruption from a self-contradictory context | bounded views, truncation checks, context consistency checks |

Two of those fixes were themselves corrected by testing against real data. An expansion-ratio guard
against zip bombs rejected ordinary annotation files, because a sparse mask legitimately compresses
about 1027 to 1 while deflate cannot exceed roughly 1032 to 1; the absolute size cap is the control
that works. And the new NPZ gate exhausted the heap by converting a 67-million-value mask into a
JavaScript array, which is the dense-mask cost recorded below.

Accepted and not acted on, with reasons:

- **Dense full-image masks per segment** (measured: 150 objects on a 3000x3000 image retain 1350 MB).
  Region-bounded masks are the right model for a browser, but the type belongs to the workspace
  store that Phase 4 designs, and changing it now would be speculative. The pixel cap in
  `src/limits.ts` bounds the damage meanwhile. **Phase 4 entry should settle this first.**
- **Export is O(segments x pixels)**, about 5 s of main-thread work for 150 objects on a 3000x3000
  image, of which only the 380 ms NPZ step is async. Bounding-box tracing per segment would fix it.
  Until then, exports belong in a worker.
- **No format registry or context builder**, so each consumer writes its own switch over the seven
  writers. Phase 2 should add `renderAnnotations(ctx, formats)` and a context builder rather than
  copy that logic into the web app and the API.
- **A damaged winner dead-ends the load** even when a healthy lower-priority file sits beside it.
  That is decision 15c working as intended, but `AnnotationLoadError` should carry the list of
  available fallbacks so Phase 4 can offer one.
- **Small-integer dtypes** (`<i4` and friends) are refused for `class_order`, which files from an
  older NumPy on Windows may use. Worth accepting for the id arrays when a real file turns up.

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
