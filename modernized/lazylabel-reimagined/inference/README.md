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

```bash
python -m pytest                                        # the live tests skip without checkpoints
LAZYLABEL_MODEL_DIR=/path/to/checkpoints LAZYLABEL_DATASET_ROOT=/path/to/images python -m lazylabel_inference.server
```

To run the differential comparison against the legacy model, which needs a real checkpoint:

```bash
LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt PYTHONPATH=/path/to/legacy/lazylabel/src python -m pytest tests/test_differential_sam2.py -v
```

| Variable | Default | What it is |
|---|---|---|
| `LAZYLABEL_MODEL_DIR` | *required* | Where the checkpoints are. The service will not guess, and it never downloads one. |
| `LAZYLABEL_MODEL_MANIFEST` | `<model dir>/manifest.json` | Copy `models/manifest.example.json` and fill in the real hashes. It lists the MobileNetV3 embedder too, which Find Archetypes needs. |
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

## What it fixes

**RULE-087 — checkpoint integrity.** The legacy check is that the number of bytes received equals
`Content-Length`. That catches a truncated download and nothing else: not corruption on disk, not a
tampered mirror, not a partial file left by an earlier failure. Worse, the card records that a
network error leaves the partial file in place, so the next start *skips the download* and fails to
load a truncated checkpoint with no message saying why.

Here every checkpoint is pinned by SHA-256 in a manifest, the size is checked first because it is
free, and **nothing is downloaded at runtime** (SEC-03, SEC-05, SEC-17). The build pipeline puts the
files there.

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
the cache key, so asking twice for the same image, model and adjustments gives the same handle and a
`cached: true`. `POST /inference/segment` takes points and a box and returns the winning mask.

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
exception, no warning, a wrong mask. The key here is (image identity, model SHA-256, display
adjustments), so invalidation is structural rather than a step someone must remember.

**The mask on the wire is checked across the language boundary.** The format is
`@lazylabel/contracts`' bounded form, which now has two implementations because one side is Python.
`tools/generate_mask_fixture.py` writes what this encodes and
`contracts/test/pythonFixture.test.ts` decodes it and checks every pixel, over the cases where an
off-by-one hides: a single pixel, a single row, a single column, a full mask, an empty mask, and two
blobs whose box is mostly nothing.

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
  *legacy's* propagation, masks and flagged frames both. What is still open is a golden captured
  from a real recording, which needs the owner's frames:
  `tests/fixtures/capture_propagation_goldens.py`.
- **API-to-inference contract tests** (exit criterion 4). `tests/test_contract.py` and the API's
  own suite hold both sides to `contracts/fixtures/inference-contract.json`.
