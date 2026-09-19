# LazyLabel inference service — Phase 2 scaffold

SAM 1 and SAM 2.1 prompts, propagation jobs and archetype finding. Python, per decision 2: the
legacy model code is proven, SAM 2 video propagation has no browser equivalent, and rewriting either
would be risk taken for nothing.

Phase 2 scaffolds this service. **Phase 3 builds the model work.**

```bash
python -m pytest                                        # no PyTorch needed
LAZYLABEL_MODEL_DIR=/path/to/checkpoints python -m lazylabel_inference.server
```

| Variable | Default | What it is |
|---|---|---|
| `LAZYLABEL_MODEL_DIR` | *required* | Where the checkpoints are. The service will not guess, and it never downloads one. |
| `LAZYLABEL_MODEL_MANIFEST` | `<model dir>/manifest.json` | |
| `LAZYLABEL_INFERENCE_PORT` | `8788` | |
| `LAZYLABEL_INFERENCE_HOST` | `127.0.0.1` | Only the API talks to this service. A model endpoint on every interface is not a default to fall into. |

## Zero dependencies, on purpose

The scaffold runs on the standard library alone, so its 89 tests need neither PyTorch nor a
checkpoint and CI is measured in seconds. The model stack arrives in Phase 3 under the `[ai]` extra.

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
| `POST /inference/embeddings`, `POST /inference/segment` | **501**, C3, Phase 3 |
| `POST`/`GET /inference/propagations`, `DELETE /inference/propagations/{id}` | **501**, C11, Phase 6 |
| `POST /inference/archetypes` | **501**, C10, Phase 6 |

501 is the honest answer: the route exists, its contract is fixed in `AI_NATIVE_SPEC.md` section 3,
and the implementation is not here. A 200 with an empty mask would be precisely the failure
`ASSESSMENT.md` 5.4 records of the legacy code — a failure presented as a successful empty result,
which the caller cannot tell from a real one.

`/health` reports its three failure modes separately, because they need different actions: PyTorch
missing is an installation problem, no checkpoints is a configuration problem, and a checkpoint that
fails verification is a corrupted file. Collapsing them into "unhealthy" helps nobody. The API turns
the `reason` into "AI tools disabled, and here is why" rather than a dead button.

## Placeholders that clean themselves up

Two tests carry `@pytest.mark.xfail(strict=True)` for routes Phase 3 will implement. Strict means
that when the route starts working, the unexpected **pass** fails the suite and forces the marker
off. A placeholder that cannot rot into a test nobody notices is worth the small oddity of a test
that asserts something untrue today.
