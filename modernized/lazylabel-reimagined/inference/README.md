# LazyLabel inference service

SAM 1 and SAM 2.1 prompts, propagation jobs and archetype finding. Python, per decision 2: the
legacy model code is proven, SAM 2 video propagation has no browser equivalent, and rewriting either
would be risk taken for nothing.

Phase 2 scaffolded this service and **Phase 3 completed it**, meeting all four of its exit
criteria: SAM 1 and SAM 2.1 masks match legacy against the real weights, propagation matches frame
for frame and flags the same frames at the threshold, checkpoints load only through a hash-checked
manifest, and failures are typed errors rather than `None`.

Phase 6 put propagation and archetype finding on HTTP. Phase 3 had proven the modules equivalent to
legacy and stopped there on purpose: a propagation needs a job API with real cancellation, progress
and streaming limits, which is not a wrapper around a function call. That job API is now the
`/inference/propagations` routes below.

**A user does not start this service by hand.** From `modernized/`, `npm run ai:setup` installs it
([Setting it up](#setting-it-up)), `npm run ai:models sam2.1-large` fetches a checkpoint, and
`npm start "<folder>"` then runs it beside the app, on the same folder, and stops it with the app
(DEPLOYABILITY.md R6 to R8). By hand, installed as that section shows, from this folder:

```bash
python -m pytest                                        # the live tests skip without checkpoints
LAZYLABEL_MODEL_DIR=/path/to/checkpoints LAZYLABEL_DATASET_ROOT=/path/to/images python -m lazylabel_inference.server
```

```powershell
$env:LAZYLABEL_MODEL_DIR = "C:\path\to\checkpoints"; $env:LAZYLABEL_DATASET_ROOT = "C:\path\to\images"; python -m lazylabel_inference.server
```

`LAZYLABEL_MODEL_DIR` must hold a `manifest.json`. `lazylabel-models` writes it, with each
checkpoint it fetches ([Checkpoints](#checkpoints)); by hand, copy `models/manifest.example.json`
there and fill in each checkpoint's SHA-256 from `models/manifest.verified.json`.
`LAZYLABEL_DATASET_ROOT` must be the same folder the API serves.

To run the differential comparison against the legacy model, which needs a real checkpoint:

```bash
LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt PYTHONPATH=/path/to/legacy/lazylabel/src python -m pytest tests/test_differential_sam2.py -v
```

```powershell
$env:LAZYLABEL_TEST_CHECKPOINT = "C:\path\to\sam2.1_hiera_large.pt"; $env:PYTHONPATH = "C:\path\to\legacy\lazylabel\src"; python -m pytest tests/test_differential_sam2.py -v
```

| Variable | Default | What it is |
|---|---|---|
| `LAZYLABEL_MODEL_DIR` | *required* | Where the checkpoints are. The service will not guess, and it never downloads one. `npm start` passes the folder `npm run ai:models` fills: `%LOCALAPPDATA%\LazyLabel\models`, `~/Library/Application Support/LazyLabel/models`, or `${XDG_DATA_HOME:-~/.local/share}/lazylabel/models`, unless this is set. |
| `LAZYLABEL_MODEL_MANIFEST` | `<model dir>/manifest.json` | `lazylabel-models` writes the default one; by hand, copy `models/manifest.example.json` and fill in the real hashes. It lists the MobileNetV3 embedder too, which Find Archetypes needs. |
| `LAZYLABEL_DATASET_ROOT` | *none* | The folder the images are read from. Without it the service still starts, so `/health` and `/models` can help an operator installing checkpoints, and every route that reads an image answers 503 and says why. A path that is not a directory is refused at startup. |
| `LAZYLABEL_INFERENCE_PORT` | `8788` | |
| `LAZYLABEL_INFERENCE_HOST` | `127.0.0.1` | Only the API talks to this service. A model endpoint on every interface is not a default to fall into. |

## The model stack is optional, on purpose

PyTorch is imported lazily, inside the functions that need it, and only the `[ai]` extra installs
it. So most of the tests run with neither PyTorch nor a checkpoint, and CI needs neither. The ones
that do need a checkpoint skip themselves cleanly without one.

That is not austerity for its own sake. The two things this service must get right *before* a model
is ever loaded — is this checkpoint the one it claims to be, and can the AI stack run here at all —
are exactly the two that need no model to test. Both are legacy defects, and both are fixed here.

## Setting it up

`npm run ai:setup`, from `modernized/`, is the whole of it. It needs [uv](https://docs.astral.sh/uv/),
which brings its own Python, and runs, in this folder:

```
uv sync --locked --python 3.12 --extra ai --extra server --extra cu128     # or --extra cpu
```

`uv.lock` records one resolution for every platform, so this installs exactly what the suites ran
on: PyTorch 2.10.0 and torchvision 0.25.0 from PyTorch's own index, SAM 1, SAM 2 at commit
`2b90b9f5`, and OpenCV's headless build, into `.venv` beside this README, which `npm start` finds by
itself. Four things decide whether the GPU is used, and the setup handles each:

- **PyTorch comes from PyTorch's index, never PyPI.** From PyPI on Windows, pip picks a CPU-only
  build, and on Linux a CUDA 13 one. Nothing fails: the service starts, reports no accelerator, and
  runs at a tenth of the speed. `pyproject.toml` has uv's PyTorch pattern: two extras, `cpu` and
  `cu128`, that exclude each other, each pinned to its index.
- **The build matches the driver.** `cu128` needs a driver for CUDA 12.8 or later; `nvidia-smi`
  prints the highest CUDA version the driver supports, top right. The setup reads it and picks
  `cu128` or `cpu` (macOS is always `cpu`); `npm run ai:setup cpu` overrides it. The wheels carry
  the CUDA runtime inside them, so the machine needs the driver and nothing else: no CUDA toolkit,
  no cuDNN.
- **SAM 2 is prebuilt, without its CUDA extension.** It is not on PyPI. uv installs
  `vendor/sam_2-1.0-py3-none-any.whl`, built once from the pinned commit with `SAM2_BUILD_CUDA=0`:
  pure Python, 178 KB, Apache-2.0 (NOTICE, at the repository root, records its SHA-256 and how it
  was built). The extension needs a compiler and only fills holes in masks; every equivalence
  result was measured without it. `pip install ".[ai]"` still works, from the git URL, and then
  needs git and `SAM2_BUILD_CUDA=0`.
- **Import torch before anything that loads Qt.** On Windows, PyTorch 2.10 cannot load its DLLs
  once PyQt6 6.9 is loaded. The service never loads Qt. The test suite imports legacy, which does,
  so `tests/conftest.py` imports torch first.

`python -m lazylabel_inference.doctor` (run by `npm run doctor`) says what the environment has:
PyTorch and the CUDA it was built for, the device, the driver, whether cv2, sam2 and
segment_anything import, the manifest, and each checkpoint (`--full` hashes them).

After changing the dependencies in `pyproject.toml`, run `uv lock` here and commit `uv.lock`:
`uv sync --locked` refuses a lockfile that no longer matches, and CI checks it with `uv lock --locked`.

In a container the same holds. The image needs the driver passed through: Docker Desktop's WSL 2
backend on Windows, or the NVIDIA Container Toolkit on Linux, then `--gpus all`. It does not need
CUDA installed inside it beyond what the wheels bring. `deploy/inference.Dockerfile` has not been
built yet.

## Checkpoints

The service never downloads one. `lazylabel-models`, a separate command with nothing but the
standard library, fetches one when asked (`npm run ai:models` in `modernized/` runs it):

```
lazylabel-models list
lazylabel-models fetch sam2.1-large [--dir DIR] [--yes]
```

It shows the size and asks first, downloads to `<file>.part` (a second run resumes an interrupted
download), checks the size and then the SHA-256 against `models/manifest.verified.json`, renames
the file into place only then, and adds its entry to `DIR/manifest.json`, keeping every other
entry. A file of that name that is not the verified one is reported and left alone. `DIR` is
`LAZYLABEL_MODEL_DIR`, else the per-user folder `npm start` looks in. `manifest.verified.json`
holds the three checkpoints whose SHA-256 was computed from a downloaded copy (MODEL_MANIFEST.md);
MobileNetV3, which Find Archetypes needs, has no download of its own and is put there by hand.
`tests/test_fetch.py` holds every server module to never importing it.

## What it fixes

**RULE-087 — checkpoint integrity.** The legacy check is that the number of bytes received equals
`Content-Length`. That catches a truncated download and nothing else: not corruption on disk, not a
tampered mirror, not a partial file left by an earlier failure. Worse, the card records that a
network error leaves the partial file in place, so the next start *skips the download* and fails to
load a truncated checkpoint with no message saying why.

Here every checkpoint is pinned by SHA-256 in a manifest, the size is checked first because it is
free, and **nothing is downloaded at runtime** (SEC-03, SEC-05, SEC-17). A person puts the files
there, with `lazylabel-models` or by hand, and the fetch checks the size and the SHA-256 before the
file takes its name, so a partial download is never where the service looks.

**Every** path that loads a checkpoint checks it first: the prompt backend, the video predictor a
propagation builds, and the embedder Find Archetypes builds. Until 2026-09-23 only the first did;
`tests/test_checkpoint_paths.py` now holds the whole source to all three, so a fourth path cannot
skip the check without failing it.

**RULE-085 — what a checkpoint is.** Legacy decides SAM 1 versus SAM 2, and which size, by looking
for substrings in the *file name*. The card lists the cost:

| File | Legacy reads it as | Why |
|---|---|---|
| `my_vit_l.pth` | SAM 2 — and fails to load | contains `_l.` |
| `sam2_hiera_large_tuned.pt` | the *tiny* config | contains `_t` |
| `database_v2.pth` | SAM 1 `vit_b` | contains `base` |

Renaming a file changes how it is interpreted. Here the manifest states the family and the size, and
the file name is a place to find bytes, not a claim about what they are.

**RULE-084 — availability.** Legacy computes
`[int(p) for p in torch.__version__.split("+")[0].split(".")[:3]]` inside a guard that catches only
`ImportError`. A nightly PyTorch reporting `2.8.0a0` therefore raises `ValueError` and **stops the
application from starting** — a check for whether a feature is available taking the program down
with it. The parser here is total: anything it cannot read becomes an answer, never an exception,
and a pre-release newer than the minimum is allowed *and said to be* a pre-release.

## Routes

| Route | Status |
|---|---|
| `GET /health` | built — AI availability, checkpoint state, and *why* if not ready |
| `GET /models` | built — every declared checkpoint, verified in full |
| `POST /inference/embeddings` | built — encodes an image, returns a stable handle, says whether it was cached |
| `POST /inference/segment` | built — points and boxes, SAM 2.1, the mask bounded on the wire |
| `POST`/`GET /inference/propagations`, `DELETE /inference/propagations/{id}` | built — C11: start a propagation job, read its frames as they arrive, cancel it |
| `POST /inference/archetypes` | built — C10: which frames of a sequence are worth annotating by hand |

No route answers 501 any more. While some did, 501 was the honest status: the route existed, its
contract was fixed in `AI_NATIVE_SPEC.md` section 3, and the implementation was not there yet. A 200
with an empty mask would have been precisely the failure `ASSESSMENT.md` 5.4 records of the legacy
code — a failure presented as a successful empty result, which the caller cannot tell from a real
one.

`/health` reports its three failure modes separately, because they need different actions: PyTorch
missing is an installation problem, no checkpoints is a configuration problem, and a checkpoint that
fails verification is a corrupted file. Collapsing them into "unhealthy" helps nobody. The API turns
the `reason` into "AI tools disabled, and here is why" rather than a dead button.

## Placeholders that clean themselves up

Unbuilt routes carry `@pytest.mark.xfail(strict=True)`. Strict means that when the route starts
working, the unexpected **pass** fails the suite and forces the marker off — which is exactly what
happened when Phase 3 built the prompt routes, so the placeholder came off because the suite made
it come off rather than because anyone remembered.

None remain. The last one, for propagation, came off when the job API was built.

## What Phase 3 built, and how it is proven

**The prompt path.** `POST /inference/embeddings` encodes an image and returns a handle derived from
the cache key, so asking twice for the same image, model and view gives the same handle and a
`cached: true`. With Operate On View on (RULE-089), the API posts the rendered picture as `pixels`
with the `adjustments` and the `processing` chain it went through, and both are in the key. `POST /inference/segment` takes points and a box and returns the winning mask.

**Proven against the legacy model, not asserted.** `tests/test_differential_sam2.py` runs six point
prompts, a box prompt and the candidate choice through both this backend and the legacy
`Sam2Model`, on the same image with the same checkpoint. All nine pass with identical masks; the
tolerance decision 10 allows (IoU ≥ 0.98) is headroom, not slack, and the assertions print the
actual IoU so drift inside the tolerance is still visible.

What is under test is not the model — it is ours only in the sense that we call it — but everything
a port gets wrong around it: the order points are passed (positives first, then negatives, exactly
as legacy builds them), which of the three candidates wins (`argmax`, first maximum on a tie, which
is RULE-020), and how a failure is reported.

**Failures are typed, and differently typed.** Phase 3 exit criterion 4 is not satisfied by
replacing legacy's `None` with one 500. A bad prompt (422), an expired handle (404), an unreadable
image (422), a model that will not load (503) and a model that raised (500) need five different
things from the caller. The differential suite asserts the contrast directly: legacy returns `None`
for an empty prompt, and this raises `InvalidPromptError` saying what was wrong with the request.

**The embedding cache key is the design** (RULE-091). Legacy keys on a hash of the image *path*,
which is wrong three ways, and the middle one is not a near miss: every SAM 1 variant emits a
256 × 64 × 64 embedding, so `vit_b` features handed to a `vit_h` decoder are shape-compatible. No
exception, no warning, a wrong mask. The key here is (image identity, model SHA-256, the view:
display adjustments and processing chain), so invalidation is structural rather than a step someone
must remember. The processing joined it on 2026-09-23: without it, a new rescale under unchanged
adjustments answered from the old encoding.

**The cache holds the ENCODING, and a click puts its own image back first.** A predictor holds one
encoded image; the service caches ten, and RULE-091 encodes the open image's neighbours before
anyone asks. Until 2026-09-23 the cache held a marker, and the only check on a click was the image's
size. In a folder of same-sized images, a click was therefore answered from whichever neighbour had
been encoded last. Reproduced with SAM 2.1 large: a disc's 20,031 pixels became 286,131 of the
neighbour's background, with no error, and asking again said `cached` and changed nothing. Each
family's encoding is now exported after encoding, and put back when a click is for another image.
They are the fields legacy's `get_embeddings` saves, held on the CPU as legacy holds them.
`tests/test_live_encoding_cache.py` proves the round trip for both families with real checkpoints.
Model loading, encoding and prediction are serialised: the server is threaded, and two first
requests loading one model at once failed inside torch.

**The mask on the wire is checked across the language boundary.** The format is
`@lazylabel/contracts`' bounded form, which now has two implementations because one side is Python.
`tools/generate_mask_fixture.py` writes what this encodes and
`contracts/test/pythonFixture.test.ts` decodes it and checks every pixel, over the cases where an
off-by-one hides: a single pixel, a single row, a single column, a full mask, an empty mask, and two
blobs whose box is mostly nothing.

## The latency budget, measured

`AI_NATIVE_SPEC.md` sets **p95 of 150 ms from click to mask on a 12-megapixel image with a warm
embedding**. Nobody had measured it until 2026-09-23, and it was missed: 213 ms in-process and
342 ms over HTTP through the API, on an RTX 3080 with SAM 2.1 large. The model was not the tail --
its decoder takes about 55 ms -- the mask's wire encoding was: at a byte per pixel a large mask was
megabytes of base64 per click. Packed one bit per pixel (`@lazylabel/contracts` says how), the same
clicks take 94-97 ms in-process and 114 ms over HTTP, and the median response fell from 470 KiB to
59 KiB.

To take the number on your own hardware, with your own checkpoints:

```bash
LAZYLABEL_MODEL_DIR=/path/to/checkpoints PYTHONPATH=src python tools/measure_latency.py "SAM 2.1 large"
```

```powershell
$env:LAZYLABEL_MODEL_DIR = "C:\path\to\checkpoints"; $env:PYTHONPATH = "src"; python tools/measure_latency.py "SAM 2.1 large"
```

It exits 0 when the budget is met in-process. What it does not include is the browser: decoding
the packed mask and drawing it, a few milliseconds more at this size.

## What this list used to say was still to do

Each of these was open when Phase 3 closed, and each is done. Kept as a list so a reader who
remembers the old one can see where each item went.

- **SAM 1.** Built. `tests/test_differential_sam1.py` compares it with legacy against the real
  `vit_h` weights.
- **The neighbour prefetch** (RULE-091). Built in the browser, `web/src/workspace/prefetch.ts`,
  because the browser is what knows which image the user will open next. The cache here is what it
  warms.
- **Find Archetypes** (C10). Built: `POST /inference/archetypes`. The embedder is a manifest entry
  like any other, `family: "embedder"`, found by family and hash-checked before it loads.
- **The propagation differential.** `tests/test_differential_propagation.py` compares the port with
  *legacy's* propagation, masks and flagged frames both.
- **The propagation golden.** `tests/goldens/propagation/synthetic-shapes` is legacy's sequence
  mode, run headless on a clip of moving shapes (`tests/fixtures/synthetic_clip.py`, the owner's
  choice on 2026-09-23 in place of a recording). It holds every object's mask and score on every
  frame, and what legacy's window did with them under Keep Flagged Masks and Skip Labeled, on and
  off. `tests/test_propagation_goldens.py` holds the runner to it with a checkpoint and no legacy
  install. Recapture with `tests/fixtures/capture_propagation_goldens.py`; `synthetic_clip.py
  --out <folder>` prints the whole command.
- **API-to-inference contract tests** (exit criterion 4). `tests/test_contract.py` and the API's
  own suite hold both sides to `contracts/fixtures/inference-contract.json`.
