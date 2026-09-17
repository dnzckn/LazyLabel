# Tests for the annotation format library

Phase 1 of the LazyLabel modernization. These tests decide whether the port is equivalent to the
legacy Python, so how an expected value was obtained matters as much as the value itself.

## The rule that matters

**Never paste a value produced by this TypeScript implementation into a test.** Every expectation
comes from one of four oracles:

| Oracle | What it proves | Where |
|---|---|---|
| `goldens/<case>/` | Legacy exporter output, byte for byte | written by `tools/generate_golden.py` |
| `goldens/manifest.json` | Class order, pixel counts, instance counts from the legacy run | same generator |
| `test/geometry/opencv-corpus.json` | OpenCV 4.12 contour, simplification and fill results | `test/geometry/generate_corpus.py` |
| `test/util/python-expectations.json` | CPython float repr, `json.dump`, `splitext`, `round` | `tools/generate_expectations.py` |

A test that restates the implementation proves nothing. When a rule card and the code disagree, read
the legacy source and decide from it; the cards carry an "Answer" line where one was corrected.

## Layout

| Path | Scope |
|---|---|
| `test/RULE_COVERAGE.md` | Which test covers which P0 rule assigned to Phase 1, and what is deferred |
| `test/helpers/fixtures.ts` | Rebuilds each declared case's INPUT, independently of `src/mask/` |
| `test/format/` | Per-format characterization, the all-format differential, the load chain, the NPZ gate |
| `test/mask/` | The shipped mask composition, crop, pixel priority and instance contours |
| `test/geometry/` | Contour tracing, simplification and fills against the OpenCV corpus |
| `test/util/` | CPython parity, archive limits, corrupt-archive handling |
| `test/differential/` | Emits NPZ files for the Python cross-check; excluded from `npm test` |

A fifth oracle sits alongside the four in the table above: the legacy code run read-only for one
value, with the command and the legacy `file:line` in a comment beside the expectation. That is how
the reader tests and the branches no golden fixture reaches were written. Use it the same way:

```bash
PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
```

The fixture helper deliberately reimplements mask composition so the test input does not come from
the code under test. `test/mask/tensor.test.ts` then exercises the shipped path against the same
goldens, so neither copy can drift unnoticed.

## Running

```bash
npm test
```

```bash
npm run typecheck
```

The binary cross-check needs the project venv and the legacy package, so it is separate:

```bash
npm run test:differential
```

```bash
PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe tools/compare_npz.py .differential
```

That script compares arrays in NumPy and also loads each file with the legacy `FileManager`, which
is how a file this library writes is proven still readable by the desktop app.

## Traps these tests exist to catch

Each has a comment naming the legacy file and line, because each would otherwise look like a
simplification worth making:

- Python's float repr differs from `String(v)` on whole numbers and below 1e-4.
- `round` sends ties to the even integer; `Math.round` sends them up, moving a box edge by a pixel.
- `json.dump` escapes non-ASCII and Python distinguishes int from float, so a whole centre is `20.0`.
- OpenCV returns contours in reverse discovery order, and that order is visible in the file.
- `fillPoly` unions a scanline fill with a Bresenham outline; a plain fill loses boundary pixels.
- The crop clamps inclusively and slices exclusively, so the last row and column never survive.
- Polygon vertices truncate toward zero; circle radii round half to even.
