# MODEL MANIFEST: the checkpoints LazyLabel web supports

| | |
|---|---|
| Phase | 3 entry criterion 3 of `MODERNIZATION_BRIEF.md` |
| Rules | RULE-085 (what a checkpoint is), RULE-087 (whether it is intact), RULE-084 (whether it can run) |
| Implemented by | `modernized/lazylabel-reimagined/inference/src/lazylabel_inference/manifest.py` |
| Produced | 2026-09-19 |

This document is the human-readable half of the machine manifest the inference service reads. The
service will not load a checkpoint that is not listed, and will not load one whose SHA-256 does not
match. Nothing is downloaded at runtime.

## Why a manifest exists at all

Two legacy behaviours, both recorded as defects on their rule cards, and both fixed by the same
mechanism.

**A file name is not a statement about its contents (RULE-085).** Legacy decides SAM 1 versus SAM 2,
and which size, by matching substrings in the file name. Its own failure cases:

| File | Legacy reads it as | Because |
|---|---|---|
| `my_vit_l.pth` | SAM 2 large — fails to load | contains `_l.` |
| `sam2_hiera_large_tuned.pt` | SAM 2 **tiny** — loads, wrong config | contains `_t` |
| `database_v2.pth` | SAM 1 `vit_b` | contains `base` |

The middle row is the one that matters: it does not error. It wraps a tiny config around large
weights and quietly degrades the user's output. Worse, the image and video predictors match
*different* substring tables, so one file can be two different models depending on which code path
reached it.

**Content-Length is not integrity (RULE-087).** The only legacy check is that the bytes received
equal `Content-Length`. That sees a truncated download and nothing else — not corruption on disk,
not a mirror serving something different, not a file edited afterwards. And it does not reliably
catch even its own case: a network error leaves the partial file in place, so the next start *skips
the download*, and the user gets a load failure that retrying cannot fix.

## The supported checkpoints

`family` and `size` are what the service uses; the file name is only where the bytes are.

### SAM 1 — `segment-anything`

| Name | family | size | Filename | Config | Source |
|---|---|---|---|---|---|
| SAM 1 huge | `sam1` | `vit_h` | `sam_vit_h_4b8939.pth` | built in | `https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth` |
| SAM 1 large | `sam1` | `vit_l` | `sam_vit_l_0b3195.pth` | built in | `https://dl.fbaipublicfiles.com/segment_anything/sam_vit_l_0b3195.pth` |
| SAM 1 base | `sam1` | `vit_b` | `sam_vit_b_01ec64.pth` | built in | `https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth` |

SAM 1 has no config file: the variant selects a builder in code (`build_sam_vit_h` and friends).
The hex in each file name is upstream's own short tag, **not** a SHA-256, and must not be used as
one.

All three emit a 256 × 64 × 64 embedding, which is why the embedding cache key must include the
model hash — see RULE-091. They are mutually shape-compatible and silently interchangeable, so a
cache keyed on anything less will serve one variant's features to another's decoder.

### SAM 2.1 — `sam2`

Configs are those shipped inside the installed `sam2` package, verified present on this machine.

| Name | family | size | Filename | Config | Source |
|---|---|---|---|---|---|
| SAM 2.1 large | `sam2` | `large` | `sam2.1_hiera_large.pt` | `configs/sam2.1/sam2.1_hiera_l.yaml` | `https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt` |
| SAM 2.1 base+ | `sam2` | `base_plus` | `sam2.1_hiera_base_plus.pt` | `configs/sam2.1/sam2.1_hiera_b+.yaml` | `https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt` |
| SAM 2.1 small | `sam2` | `small` | `sam2.1_hiera_small.pt` | `configs/sam2.1/sam2.1_hiera_s.yaml` | `https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt` |
| SAM 2.1 tiny | `sam2` | `tiny` | `sam2.1_hiera_tiny.pt` | `configs/sam2.1/sam2.1_hiera_t.yaml` | `https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt` |

Only SAM 2 can propagate through a sequence. A deployment with SAM 1 checkpoints only is a working
install with no propagation, and `/health` reports `videoCapable: false` rather than failing when a
propagation is requested.

### Embedder — `torchvision`

Find Archetypes needs a feature extractor rather than a segmenter, and it goes through this same
manifest rather than a second mechanism, because the guarantee wanted from it is identical: a
checkpoint that is not listed is not loadable, and one that is listed is hash-checked before it is
read.

| Name | family | size | Filename | Config | Source |
|---|---|---|---|---|---|
| MobileNetV3 small | `embedder` | `mobilenet_v3_small` | `mobilenetv3_small_tv.pth` | built in | `torchvision`'s `MobileNet_V3_Small_Weights.IMAGENET1K_V1`, saved as a state dict |

This is the one checkpoint with no public URL of its own: it is torchvision's ImageNet weights,
which legacy obtains by calling `mobilenet_v3_small(weights=…)` — **a download at runtime**, on the
user's first Find Archetypes, with a hand-download instruction as the fallback. That is exactly the
runtime fetch SEC-03, SEC-05 and SEC-17 rule out, so the port does not do it: `weights=None` builds
the architecture and reads only the manifest's bytes. Legacy also *deletes* its cached copy and
re-downloads when the load fails, which would silently discard a file a user deliberately put
there; the port reports the failure instead.

The weights are 576-dimensional once the classifier head is replaced with an identity. That width
is asserted at load and again per batch, because a checkpoint of a different width is a different
model, and the symptom would otherwise be clustering that is merely somewhat worse.

## SHA-256 values

**Partly met: the two checkpoints the pilot actually runs are verified, the rest are not, and it is
honest to say which is which rather than fill the table with plausible-looking digests.**

| Checkpoint | SHA-256 | State |
|---|---|---|
| `sam2.1_hiera_large.pt` | `2647878d5dfa5098f2f8649825738a9345572bae2d4350a2468587ece47dd318` | **verified**, computed from the copy on the maintainer's machine (898,083,611 bytes) |
| `sam_vit_h_4b8939.pth` | `a7bf3b02f3ebf1267aba913ff637d9a2d5c33d3173bb679e46d9f338c26f262e` | **verified**, computed from the copy on the maintainer's machine (2,564,550,879 bytes) |
| `mobilenetv3_small_tv.pth` | `23581817e8e9f35d7c155d24a68d62dadd8bc96e5649304638e1193412baa0e2` | **verified**, computed from the copy on the maintainer's machine (10,305,097 bytes) |
| `mobilenet_v3_small-047dcff4.pth` | `047dcff4addef86ea5bc2eff13c9614dc11f47ab1160d0a71a25e7db994f4e1f` | **verified** 2026-09-27, computed from a copy downloaded from `https://download.pytorch.org/models/` (10,306,551 bytes): torchvision's `IMAGENET1K_V1` file, which the desktop app downloads and re-saves as `mobilenetv3_small_tv.pth` (L ui/workers/reference_finder_worker.py:99-118). Its 244 tensors equal that file's, so Find Archetypes answers the same. `npm run ai:models mobilenet-v3-small` fetches it |
| every other row above | — | **not yet mirrored** |

A digest may only be entered here after the file has been downloaded from the source URL above and
hashed locally. Copying a digest from a third-party page would defeat the point of having one: the
manifest is supposed to say "these are the bytes we verified", not "these are the bytes someone
said to expect".

Phase 3 started against SAM 2.1 large alone, because it was the only mirrored checkpoint and it
does single-image prediction as well as propagation; that substitution for the SAM 1 checkpoint the
brief's pilot slice names was recorded in the phase notes rather than left as a silent deviation.
The SAM 1 checkpoint has since been supplied by the maintainer and verified, so the substitution no
longer stands: Phase 3 exit criterion 1 requires parity with legacy's `SamModel` **and**
`Sam2Model`, and both halves are now proven against the real weights
(`inference/tests/test_differential_sam1.py` and `test_differential_sam2.py`). Both suites skip
themselves when no checkpoint is configured, so CI stays green on a machine with no 2.4 GB file —
which also means a green CI run is not evidence they ran. They are run locally, deliberately.

To add a digest:

```bash
python -c "import hashlib,sys;h=hashlib.sha256();f=open(sys.argv[1],'rb');[h.update(c) for c in iter(lambda:f.read(1<<20),b'')];print(h.hexdigest(), f.tell())" <checkpoint>
```

## The machine manifest

`manifest.json` lives beside the checkpoints and is what the service actually reads.
`inference/models/manifest.example.json` is a template. Each entry requires `name`, `family`,
`size`, `filename`, `sha256` and `bytes`; the parser refuses a size that is not valid for its
family, a digest that is not 64 hex characters, a duplicate name, and a filename that is anything
other than one plain path component — a manifest is configuration, and configuration that can name
`../../etc/passwd` is an attack surface.

An entry with a missing or empty hash is refused outright. It would be worse than no entry: it looks
like a verified checkpoint and verifies nothing.

## What still has to happen in Phase 3

Hash verification and **weights-only loading** are different defences against different mistakes,
and Phase 3's exit criterion 3 needs both. A checkpoint that passes its hash must still be loaded
with `weights_only=True`, so that a wrong manifest entry is a failed load rather than arbitrary code
execution (SEC-01, SEC-03, SEC-05, SEC-17).

## Accelerator, for Phase 3 entry criterion 4

Recorded from the development machine on 2026-09-19:

| | |
|---|---|
| PyTorch | 2.7.1+cu126 |
| CUDA available | yes |
| Device | NVIDIA GeForce RTX 3080 |
| `segment_anything` | installed |
| `sam2` | installed |

Criterion 4 is met. Note for the equivalence work: decision 10 sets an IoU tolerance of 0.98 rather
than requiring exact equality precisely because GPU kernels are not bit-reproducible across devices,
so golden data should be generated on CPU where a bit-exact reference is wanted.
