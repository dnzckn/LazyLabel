# Characterization tests for the annotation format library

These tests describe what the **legacy Python does**, not what anyone thinks it should do. Where
the legacy computes something surprising, the test asserts the surprising value and a comment
above it names the rule id and the `legacy/...:line` it came from. Fixing a legacy bug is a
separate decision from proving equivalence.

Current slice: **YOLO Segmentation**, the Phase 1 pilot
(`analysis/lazylabel/MODERNIZATION_BRIEF.md` §3, Phase 1).

| File | Covers |
| --- | --- |
| `helpers/fixtures.ts` | Rebuilds the `ExportContext` the legacy writer saw, from `tools/fixtures.json` |
| `format/yoloSegmentation.render.test.ts` | `renderYoloSegmentation` vs `goldens/<case>/image_seg.txt` |
| `format/yoloSegmentation.parse.test.ts` | `parseYoloSegmentation` vs `FileManager.load_yolo_seg_txt` |

## Running them

```sh
npm test                 # vitest run
npx vitest               # watch mode
npx vitest run test/format/yoloSegmentation.parse.test.ts
npm run typecheck        # tsc --noEmit, includes test/
```

These tests were written before the implementation, against the API fixed in `src/index.ts` and
`src/types.ts`. If `src/format/yoloSegmentation.ts`, `src/format/pyRepr.ts` or
`src/geometry/contours.ts` is missing, both files fail at import rather than at an assertion.

### Known failures

Three parse tests fail against the current implementation. They are not flaky and must not be
weakened: each asserts a value taken from the legacy and confirmed by a read-only Python run.

| Test | Legacy | Port |
| --- | --- | --- |
| `accepts an underscore-grouped literal...` | `float("1_0")` is `10.0` (PEP 515), so the line loads | `parseFloatLikePython` rejects it and skips the line |
| `reads the underscore-grouped label 1_0...` | `int("1_0")` is `10`, so the label is numeric | `parseIntLikePython` rejects it, making `1_0` a new named class |
| `fails on a coordinate beyond int32...` | `np.int32` conversion raises, abandoning the load | the polygon loads, clipped |

The first two are the same defect in two code paths; the doc comment on `parseFloatLikePython`
has the direction of the `1_0` divergence backwards. The third is a judgment call for the owner:
if reproducing a numpy dtype limit is out of scope, record that under decision 15(c) and turn the
test into `it.skip` with the reason — do not delete it.

## The oracle

`tools/fixtures.json` declares the inputs. `tools/generate_golden.py` runs the **legacy** exporters
over them and writes `goldens/<case id>/` plus `goldens/manifest.json`. The goldens are the only
source of truth for expected output; nothing in `test/` was produced by running TypeScript.

Two consequences worth knowing:

- The goldens were captured on Windows and carry **CRLF**. The target always writes LF, so every
  differential comparison normalizes line endings first, per `MODERNIZATION_BRIEF.md` decision 10.
  `normalizeEol` in `helpers/fixtures.ts` is the only place that happens.
- `manifest.json` records `classOrder`, `classLabels`, `maskSetPixels` and `instanceCount` for each
  case. The first `describe` in the render suite asserts the TypeScript-built context against those
  numbers, so an input built wrongly fails loudly instead of quietly changing the expected output.
  Note `instanceCount` counts instance RECORDS (one per contour-bearing segment) while
  `ExportContext.instances` is flattened to one entry per contour; they differ for a segment that
  traces to several islands.

To confirm a value against the legacy directly (read-only, encouraged):

```sh
PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe -c "..."
```

Never edit anything under `legacy/`.

## Adding a case

**A new golden case** (a new input shape worth pinning end to end):

1. Add an entry to `tools/fixtures.json` with an `id` and a `why` naming the rule it guards.
2. Regenerate the goldens: `PYTHONPATH=... python tools/generate_golden.py`. This rewrites the
   whole `goldens/` directory, so review the diff — an unexpected change to another case means the
   legacy snapshot moved, not that your case is fine.
3. If the case uses a `Polygon` or `Circle` segment, add its raster to `RECORDED_SHAPE_RASTER` in
   `helpers/fixtures.ts` (row spans captured from the legacy rasterizer) until `src/geometry/`
   grows a real rasterizer.
4. Nothing else: both `it.each(CASES)` suites pick the case up from `CASE_IDS` automatically.

**A new targeted test** (a branch or boundary the goldens do not reach):

1. Derive the expected value from the legacy source, then confirm it with a read-only Python run.
   Never paste a value produced by the TypeScript implementation.
2. Write the concrete input and the literal expected string or number — no "should round
   correctly".
3. Put the rule id and the `legacy/<file>.py:<line>` range in a comment directly above the test.
   If no card mentions the behavior, say so in the comment (`NOT IN ANY CARD`) so the rule review
   can pick it up.
4. For inputs that mask tracing cannot produce (coordinates on or past the image edge, zero-size
   images, unsorted instance order), build the context with `syntheticContext` and say in the
   comment why no fixture reaches it.

**A behavior the target has not implemented yet** gets `it.skip("pending ...")` with the legacy
behavior spelled out in the body. Never delete a case to make the suite green.

## Things the cards get wrong

Recorded here because the tests assert the code, not the cards:

- `RULE-006` inherits "One line per object" from the exporter docstring
  (`yolo_segmentation.py:19-23`). The writer emits one line per **outer contour**; one segment in
  two islands writes two lines.
- `RULE-041`'s "fewer than 3 points is dropped" guard (`file_manager.py:576`) is unreachable: the
  7-token/odd-count check at `:564` already guarantees three points.
- `RULE-041` says "all numeric" values are required. Only `parts[1:]` is parsed; the label may be
  any string, and `nan`/`inf` pass `float()` and then abort the **whole file**.
- `tools/fixtures.json` claims the `tiny-box-huge-image` case reaches Python's exponential float
  form. For YOLO Segmentation it does not: the pixel sits at (0, 0), so every coordinate is `0.0`.
- `ARCHITECTURE.md:179-180` says one-pixel-wide objects export as a bounding-box outline;
  `contour_to_polygon` (`exporters/__init__.py:139-157`) writes a there-and-back ring instead.
