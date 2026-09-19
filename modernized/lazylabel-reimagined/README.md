# LazyLabel, reimagined

The web rebuild. Phase 2 of [`MODERNIZATION_BRIEF.md`](../../analysis/lazylabel/MODERNIZATION_BRIEF.md)
scaffolds these; phases 3 through 6 fill them in.

## The packages

| Package | What it is | Runs in |
|---|---|---|
| [`api`](api) | Reads and writes annotation sidecars in place, owns the image pipeline, serves settings, proxies inference | Node |
| [`web`](web) | The browser app: dataset browser, canvas editor, AI tools, timeline | Browser |
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
   web  ─┐                          ┌─ contracts ─┐
         ├─ settings-schema         │             ├─ annotation-formats
   api  ─┘                          └─────────────┘
```

## Running it

Each package is independent: `npm install` then `npm test` inside it. Cross-package dependencies are
`file:` links resolved to the other package's **TypeScript source** through a `development` export
condition, so there is no build ordering and no way to test against a stale `dist`.

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

Two capabilities, end to end:

- **C2, loading annotations** — the API reads the highest-priority readable sidecar, reports every
  damaged file it walked past, and answers 409 rather than an empty canvas when nothing can be read.
- **C13, settings and hotkeys** — schema, legacy import, conflict and export-format validation, and
  persistence across a restart.

Everything else is listed in each package's `capabilities.ts` with the phase that builds it and what
is missing. A guard test in each package fails if those tables ever disagree with the test suites,
so nothing can quietly read as built that is not.

## Phase 2 exit criteria

| # | Criterion | State |
|---|---|---|
| 1 | Both checkpoints approved, architecture matches the brief | met |
| 2 | Each scaffold builds and its tests run; unbuilt capabilities tagged with their phase | met for the API and the web app; the inference service is not scaffolded |
| 3 | The settings schema imports a legacy `settings.json` and `hotkeys.json`, tolerating unknown keys | met |
| 4 | CI builds and tests all services on every push to `main-web` | met for what exists |

The inference service is the remaining scaffold.
