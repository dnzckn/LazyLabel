# LazyLabel, reimagined

The web rebuild. **To run it, follow the quick start at the top of the
[repository's README](../../README.md#lazylabel-web-this-branch).** This file is for working on it.

**Phases 1 to 5 of
[`MODERNIZATION_BRIEF.md`](../../analysis/lazylabel/MODERNIZATION_BRIEF.md) have met their exit
criteria; Phase 6 is in progress.** [`PROGRESS.md`](../../analysis/lazylabel/PROGRESS.md) is the
log against the plan and the one to read first on the engineering;
[`CUTOVER.md`](../../analysis/lazylabel/CUTOVER.md) is what to read when the question is whether
to switch.

## The packages

| Package | What it is | Runs in |
|---|---|---|
| [`api`](api) | Reads and writes annotation sidecars in place, owns the image pipeline, serves settings, proxies inference | Node |
| [`web`](web) | The browser app: dataset browser, canvas editor, AI tools, timeline | Browser |
| [`inference`](inference) | SAM 1 and SAM 2.1 prompts, propagation jobs, archetype finding | Python |
| [`converter`](converter) | Rewrites a legacy NPZ's pickled class names as JSON, without executing it | Python, run once |
| [`contracts`](contracts) | The HTTP wire shapes and the mask codec both sides use | Both |
| [`settings-schema`](settings-schema) | The settings and hotkey schema, its legacy importer, and the validation rules | Both |
| [`../lazylabel/core/exporters`](../lazylabel/core/exporters) | The seven annotation formats, proven equivalent to the legacy Python (Phase 1) | Both |

Three of the five are shared libraries, and that is the point rather than an accident. Every rule
that decides what a file contains, what a request looks like, or whether a setting is legal has
**exactly one implementation**. The brief's first binding design rule says so for file content, and
the same reasoning applies wherever the browser and the server both have to be right about the same
thing: two implementations of one rule do not stay equal, and the disagreement shows up as a
corrupted export or a hotkey that works on one side only.

The dependency direction is strictly one way. Shared packages know nothing about `node:fs`,
`node:sqlite` or the DOM, so either side can import them.

```
   web  ─┬─ contracts ─── annotation-formats
         └─ settings-schema
   api  ─┬─ contracts ─── annotation-formats
         └─ settings-schema

   inference          (its own stack: torch, segment-anything, scikit-learn)
```

The inference service shares nothing with the other two by design: its interface speaks masks and
scores, never LazyLabel classes or file formats, so nothing about annotation semantics can leak into
it.

## Running it

**One npm workspace holds all five JavaScript packages:** [`../package.json`](../package.json),
in `modernized/`. It was five separate installs, and every package needed its own, the three
shared libraries included, because a library's imports resolve from its own folder. Nothing said
so, and `npm test` passing without them hid it. From `modernized/`:

```bash
npm install          # installs everything, then builds all five in dependency order
npm test             # every package's suite
npm run typecheck    # every package's typecheck
npm run build        # all five again, after changing a library
```

One package at a time works from `modernized/` with `-w`, as in `npm test -w lazylabel-reimagined/api`,
or from the package's own folder with a plain `npm test`: npm finds the workspace from there.

Cross-package dependencies are `file:` links resolved to the other package's **TypeScript source**
through a `development` export condition, so tests and typechecks have no build ordering and no way
to read a stale `dist`.

**Running the built API is different, and it is easy to trip over.** At runtime the same imports
resolve to each library's `dist`, so the libraries must be built before the API starts — otherwise
Node reports `ERR_MODULE_NOT_FOUND` for a package that is plainly installed. `npm install` builds
them, in the order the workspace lists them; after changing a library, `npm run build` again.

No build script may call npm itself: each nested `npm run` adds a `node_modules\.bin` entry to
PATH for every folder above the package, and four levels took PATH past what cmd.exe reads, so
`tsc` stopped being found halfway through an install (`api/test/workspace.test.ts` says more).

To run it, from `modernized/`: `npm start`, then Open Image Folder in the app, or
`npm start "/path/to/your/images"` to open that folder at start. That is the launcher,
`api/src/cli.ts`: it checks the Node version, starts the API, which serves the built web app on the
same port, prints the address and opens the browser. Its options (`--help` lists them) go through
`lazylabel.cmd` or `lazylabel.sh` beside `package.json`, because PowerShell's npm drops the `--`
that `npm start` needs before them. Each option sets the variable of the same meaning in the API's
[README](api/README.md#running-it), and every variable still works on its own.

The API without the launcher, configured only by those variables, is `npm start` in `api/`, which
is what the Docker image runs:

```bash
LAZYLABEL_DATASET_ROOT=/path/to/your/images npm start -w lazylabel-reimagined/api
```

```powershell
$env:LAZYLABEL_DATASET_ROOT = "C:\path\to\your\images"; npm start -w lazylabel-reimagined/api
```

To work on the web app with hot reload, run the Vite dev server beside it, `npm run dev` in a
second terminal, and open <http://localhost:5173> instead: it proxies `/api` to the API.

That is the whole app except the AI tools, and running without them is a supported deployment
rather than a broken one: everything but SAM prompts and propagation works. To add them, with
[uv](https://docs.astral.sh/uv/) installed, from `modernized/` (DEPLOYABILITY.md R6 to R8):

```
npm run ai:setup                  # PyTorch 2.10.0, SAM 1 and SAM 2 from inference/uv.lock, into inference/.venv
npm run ai:models sam2.1-large    # asks, downloads 898 MB, checks the SHA-256, writes manifest.json
npm start                         # now starts the inference service too, and stops it on exit
```

`npm run ai:setup` picks PyTorch's CUDA 12.8 build when `nvidia-smi` reports a driver for CUDA
12.8 or later and the CPU build otherwise (`npm run ai:setup cpu` chooses). The models go in a
per-user folder, or `LAZYLABEL_MODEL_DIR`; `npm start` looks there, starts
`python -m lazylabel_inference.server` on the same folder of images and a free port from 8788, and
shows its lines marked `[ai]`. Without the environment or a model it says which of the two commands
is missing, and the model section of the app says `AI tools off: run npm run ai:setup`.
`npm run doctor "<folder>"` checks all of it, down to each checkpoint's size (`--full`: its hash).

A service run some other way, such as the Docker image or another machine's, is named instead, and
then none is started:

```bash
./lazylabel.sh "/path/to/your/images" --inference http://127.0.0.1:8788
```

```powershell
.\lazylabel.cmd "C:\path\to\your\images" --inference http://127.0.0.1:8788
```

The address is logged at startup either way, so `"inference":"none"` in the API's first line tells
you the AI tools will be unavailable before a user clicks an object and finds out.

## Storage

The owner settled this on 2026-09-18: **the local directory is the default**, and the ports exist so
a hosted deployment with a SQL database or object store nearby can point at one
([architecture §3.1](../../analysis/lazylabel/REIMAGINED_ARCHITECTURE.md)). Only the two default
adapters are built — the mounted dataset folder, and a SQLite file, which is per user
(`~/.config/lazylabel/lazylabel-web.db`) unless `LAZYLABEL_DB` says otherwise.

What is not configurable, on any adapter: **the annotation sidecars are the source of truth**. The
architecture review killed a segment table duplicating the file chain, and it stays dead.

## Deploying it

[`deploy/`](deploy) holds a compose file for a self-hosted install: the web app, the API, and an
opt-in inference service. **It is unverified.** CI has built the API and web images, and validated
the compose file, on every push to `main-web` since 2026-09-26, but nothing has ever RUN them, and
the inference image has never been built. Its README says so first and names what to check. For
running the app on your own machine, the quick start in the repository's README is the tested path.

## What works today

All fourteen capabilities are built, each with an acceptance test named for it. **C11**,
propagating an annotation along a sequence, was the last: it runs end to end, from the browser's
reference masks through the API to a SAM 2 video predictor. What is not yet claimed is that its
results match legacy's on a real recording -- that needs a golden captured from the owner's frames.
One refinement is named rather than implied: a linked pair (**C14**) links adding and erasing, as
legacy does, while deleting and merging act on one image, as legacy's per-viewer buttons do.

Every package's `capabilities.ts` lists each capability with the phase that built it,
and a guard test fails if those tables disagree with the test suites. That guard is worth knowing
about: it went stale once, listing eight built capabilities as pending, and nothing was prompted to
notice because a table nobody updates still passes its own shape checks.

Some of it is worth naming because the behaviour is not what you would assume:

- **The annotation formats** are byte-identical to legacy on every golden, after EOL
  normalisation — including the off-by-one that makes a crop lose the image's last row and column.
- **The image-processing chain runs on the SERVER**, because RULE-032 puts rescale, channel
  thresholds and the FFT *before* the 16-bit to 8-bit conversion and the browser only ever receives
  what comes after it. Only the display adjustments are the browser's.
- **CLAHE matches OpenCV byte for byte**, which took matching three things at once: single
  precision, multiplying by a precomputed reciprocal, and taking the interpolation weight from the
  unclamped tile index.
- **Masks and propagation match legacy** against the real checkpoints, frame for frame, and flag
  the same frames at the confidence threshold. Those suites **skip themselves without a
  checkpoint**, so a green CI run says nothing about them — `PROGRESS.md` has the command.
- **The sequence timeline** is built, and propagates along a sequence through the inference
  service (C11, above).

## Phase exit criteria

| Phase | What it was | State |
|---|---|---|
| 1 | The seven annotation formats | complete |
| 2 | Architecture and scaffolds | complete |
| 3 | The inference service | complete |
| 4 | Workspace, dataset browser, persistence | complete |
| 5 | The drawing, AI and image tools | complete |
| 6 | Sequence propagation, split view, cutover | in progress |

Phase 6's remaining work and its one open entry criterion — a recorded sequence with legacy's
propagation outputs captured as golden data — are in
[`PROGRESS.md`](../../analysis/lazylabel/PROGRESS.md).
