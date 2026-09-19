# LazyLabel inference service

SAM 1 and SAM 2.1 prompts, propagation jobs and archetype finding. Python, per decision 2: the
legacy model code is proven, SAM 2 video propagation has no browser equivalent, and rewriting either
would be risk taken for nothing.

Phase 2 scaffolded this service. **Phase 3 has built the SAM 2.1 prompt path** — embeddings,
point and box prompts, and the cache — and proven it against the legacy `Sam2Model`. SAM 1 and
propagation remain.

```bash
python -m pytest                                        # 129 tests, no PyTorch needed
LAZYLABEL_MODEL_DIR=/path/to/checkpoints python -m lazylabel_inference.server
```

To run the differential comparison against the legacy model, which needs a real checkpoint:

```bash
LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt PYTHONPATH=/path/to/legacy/lazylabel/src python -m pytest tests/test_differential_sam2.py -v
```

| Variable | Default | What it is |
|---|---|---|
| `LAZYLABEL_MODEL_DIR` | *required* | Where the checkpoints are. The service will not guess, and it never downloads one. |
| `LAZYLABEL_MODEL_MANIFEST` | `<model dir>/manifest.json` | |
| `LAZYLABEL_INFERENCE_PORT` | `8788` | |
| `LAZYLABEL_INFERENCE_HOST` | `127.0.0.1` | Only the API talks to this service. A model endpoint on every interface is not a default to fall into. |

## The model stack is optional, on purpose

PyTorch is imported lazily, inside the functions that need it, and only the `[ai]` extra installs
it. So 129 of the tests run with neither PyTorch nor a checkpoint, in about two seconds, and CI
needs neither. The nine that do need a checkpoint skip themselves cleanly without one.

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
| `POST`/`GET /inference/propagations`, `DELETE /inference/propagations/{id}` | **501**, C11, Phase 3 |
| `POST /inference/archetypes` | **501**, C10, Phase 3 |

For the routes that still answer 501, that is the honest status: the route exists, its contract is
fixed in `AI_NATIVE_SPEC.md` section 3,
and the implementation is not here. A 200 with an empty mask would be precisely the failure
`ASSESSMENT.md` 5.4 records of the legacy code — a failure presented as a successful empty result,
which the caller cannot tell from a real one.

`/health` reports its three failure modes separately, because they need different actions: PyTorch
missing is an installation problem, no checkpoints is a configuration problem, and a checkpoint that
fails verification is a corrupted file. Collapsing them into "unhealthy" helps nobody. The API turns
the `reason` into "AI tools disabled, and here is why" rather than a dead button.

## Placeholders that clean themselves up

Unbuilt routes carry `@pytest.mark.xfail(strict=True)`. Strict means that when the route starts
working, the unexpected **pass** fails the suite and forces the marker off — which is exactly what
happened when Phase 3 built the prompt routes, so the placeholder came off because the suite made
it come off rather than because anyone remembered.

One remains, for propagation.

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

## Still to do in Phase 3

- **SAM 1.** `load_backend` refuses `family: "sam1"` with a typed error rather than guessing. It
  needs a checkpoint to be written against; none is mirrored yet (`MODEL_MANIFEST.md`).
- **The neighbour prefetch.** RULE-091 specifies pre-computing the next, next-but-one and previous
  images after a settle. The cache is ready for it; the scheduling is not built.
- **Find Archetypes** (C10). Phase 3 work on the model side: the brief lists
  `reference_finder_worker.py` in Phase 3's scope. Only the timeline UI is Phase 6.
- **The propagation differential.** Staging, confidence and the error path are built and tested,
  and `tests/test_propagation_live.py` proves the whole thing against the real SAM 2 video
  predictor: a 40x40 rectangle sliding 12 pixels a frame is tracked at exactly 1600 pixels on every
  frame, in the right place, attributed to the right source image. What exit criterion 2 still
  wants is the comparison against *legacy's* propagation on a recorded sequence, which needs both
  video states stood up side by side.
- **API-to-inference contract tests** (exit criterion 4). The API does not proxy these routes
  yet, so nothing tests the two services talking to each other.
