# LazyLabel, reimagined

The web rebuild. Phase 2 of [`MODERNIZATION_BRIEF.md`](../../analysis/lazylabel/MODERNIZATION_BRIEF.md)
scaffolds these; phases 3 through 6 fill them in.

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

   inference          (standard library only; Phase 3 adds the model stack)
```

The inference service shares nothing with the other two by design: its interface speaks masks and
scores, never LazyLabel classes or file formats, so nothing about annotation semantics can leak into
it.

## Running it

Each package is independent: `npm install` then `npm test` inside it. Cross-package dependencies
are `file:` links resolved to the other package's **TypeScript source** through a `development`
export condition, so tests and typechecks have no build ordering and no way to read a stale `dist`.

**Running the built API is different, and it is easy to trip over.** At runtime the same imports
resolve to each library's `dist`, so the libraries must be built before `npm start` — otherwise Node
reports `ERR_MODULE_NOT_FOUND` for a package that is plainly installed. Build them in dependency
order:

```bash
for p in ../lazylabel/core/exporters settings-schema contracts api; do (cd "$p" && npm run build); done
```

To run the two services together:

```bash
# terminal 1 — the API, pointed at a folder of images
cd api && LAZYLABEL_DATASET_ROOT=/path/to/your/images npm start
```

```bash
# terminal 2 — the web app, which proxies /api to it
cd web && npm run dev
```

## Storage

The owner settled this on 2026-09-18: **the local directory is the default**, and the ports exist so
a hosted deployment with a SQL database or object store nearby can point at one
([architecture §3.1](../../analysis/lazylabel/REIMAGINED_ARCHITECTURE.md)). Only the two default
adapters are built — the mounted dataset folder, and a SQLite file.

What is not configurable, on any adapter: **the annotation sidecars are the source of truth**. The
architecture review killed a segment table duplicating the file chain, and it stays dead.

## What works today

Two capabilities end to end, plus the parts of a third that can be correct before a model loads:

- **C2, loading annotations** — the API reads the highest-priority readable sidecar, reports every
  damaged file it walked past, and answers 409 rather than an empty canvas when nothing can be read.
- **C13, settings and hotkeys** — schema, legacy import, conflict and export-format validation, and
  persistence across a restart.
- **C1, the dataset browser** — a folder listed with per-format annotation status, the two things
  legacy never told anyone (images that share sidecars, files that were not recognized), and opening
  one with its annotations loaded.
- **C9's save path** — the seven formats, atomic per file, and a cleared image writing an empty file
  rather than leaving the old one to be read back.
- **The image pipeline** — one decoder for jpeg, png, webp, tiff, gif and bmp, with RULE-024's
  16-bit conversion applied once, proven pixel-for-pixel against OpenCV.
- **C12, converting a dataset** — open a folder labelled in one format, choose the formats your
  pipeline needs, and write them beside the images. Byte-identical to legacy on all twelve goldens.
- **The alias converter**, which recovers class names from a legacy NPZ's pickled table without
  executing it.
- **Checkpoint integrity and AI availability** — the inference service pins every checkpoint by
  SHA-256 and never downloads one, and its version check cannot crash the way legacy's does.

Everything else is listed in each package's `capabilities.ts` with the phase that builds it and what
is missing. A guard test in each package fails if those tables ever disagree with the test suites,
so nothing can quietly read as built that is not.

## Phase 2 exit criteria

| # | Criterion | State |
|---|---|---|
| 1 | Both checkpoints approved, architecture matches the brief | met |
| 2 | Each scaffold builds and its tests run; unbuilt capabilities tagged with their phase | met |
| 3 | The settings schema imports a legacy `settings.json` and `hotkeys.json`, tolerating unknown keys | met |
| 4 | CI builds and tests all services on every push to `main-web` | met |

**Phase 2 is complete.** Phase 3 builds the inference service: the SAM 1 and SAM 2.1 predictors, the
embedding cache, and the model loading that the manifest already guards.
