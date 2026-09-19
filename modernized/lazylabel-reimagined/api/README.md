# LazyLabel API — Phase 2 scaffold

The Node.js service that reads and writes annotation files in the user's folder, owns the image
pipeline, serves settings, and proxies inference. This is the **Phase 2 pilot slice**: the first of
the three scaffolds, taken end to end so the seams are proved by something that runs rather than
asserted in a document.

| | |
|---|---|
| Phase | 2 of [`MODERNIZATION_BRIEF.md`](../../../analysis/lazylabel/MODERNIZATION_BRIEF.md) |
| Specification | [`AI_NATIVE_SPEC.md`](../../../analysis/lazylabel/AI_NATIVE_SPEC.md) |
| Architecture | [`REIMAGINED_ARCHITECTURE.md`](../../../analysis/lazylabel/REIMAGINED_ARCHITECTURE.md) |
| Depends on | `@lazylabel/annotation-formats` (Phase 1), `@lazylabel/contracts`, `@lazylabel/settings-schema` |

## Running it

```bash
npm install
npm test
npm run typecheck
npm run build
```

To start it against a folder of images:

```bash
LAZYLABEL_DATASET_ROOT=/path/to/your/images npm start
```

| Variable | Default | What it is |
|---|---|---|
| `LAZYLABEL_DATASET_ROOT` | *required* | The folder holding your images. The API refuses to start without it rather than guessing. |
| `LAZYLABEL_DB` | `<root>/.lazylabel/lazylabel.db` | SQLite file for settings, hotkeys and job records. |
| `LAZYLABEL_PORT` | `8787` | |
| `LAZYLABEL_HOST` | `127.0.0.1` | Loopback by default. Decision 3 is one trusted user, so exposing this is a deliberate act behind a reverse proxy, not a default. |

## Shape

Two ports, one adapter each, per [architecture §3.1](../../../analysis/lazylabel/REIMAGINED_ARCHITECTURE.md):

```
             ┌──────────────────────────────┐
  HTTP  ───▶ │ app.ts   routes, validation  │
             │ annotations/service.ts       │──▶ @lazylabel/annotation-formats
             └───────┬──────────────┬───────┘     (every rule about file CONTENT)
                     │              │
            ports/blobStore   ports/metadataStore
                     │              │
          DirectoryBlobStore   SqliteMetadataStore
          (the user's folder)  (settings, hotkeys, jobs)
```

The owner settled the storage question on 2026-09-18: **the local directory is the default**, and
the ports exist so a hosted deployment with a SQL database or object store nearby can point at one.
No adapter beyond the two defaults is built. `test/adapters/blobStore.conformance.test.ts` is one
suite run against every blob adapter, so a third one is a known quantity rather than a hope — and an
object-storage adapter will have to earn the atomicity test without a rename, which architecture
§3.1 records as a known cost.

What never becomes configurable: **the annotation sidecars are the source of truth**, on every
adapter. The architecture review killed a segment table duplicating the file chain, and it stays
dead.

## What works

| Capability | Status |
|---|---|
| C2 — load an image's annotations from the best file present | **built**, `test/acceptance/c2.loadAnnotations.test.ts` |
| C13 — keep settings and hotkeys across sessions | **built**, `test/acceptance/c13.settings.test.ts`; the schema itself lives in `@lazylabel/settings-schema` |
| the other twelve | listed in [`src/capabilities.ts`](src/capabilities.ts) with the phase that builds them |

Routes: `GET`/`PUT /projects/{projectId}/images/{imagePath}/annotations`,
`GET`/`PUT /users/me/settings`, `GET /health`.

The C2 test is the pilot's point. It writes real sidecars into a real temporary folder and proves
the contract that matters most: a damaged high-priority file does not hide the healthy one beside
it (decision 15c), the recovery is reported rather than silent, and when nothing can be read the
answer is **409, never an empty canvas** (decision 15d) — the failure that, with legacy's auto-save,
turned an unreadable file into lost work.

## Deliberate deviations

Four, each with its reason.

**1. Pending capabilities are `test.todo`, not failing tests.** Phase 2 exit criterion 2 says
acceptance tests for unbuilt capabilities should "fail". They are todos instead. A permanently red
suite satisfies the letter of criterion 2 and destroys criterion 4 in the same stroke — CI that is
always red tells you nothing on the day something actually breaks. The intent is that an unbuilt
capability is *visible* and never mistaken for a passing one, which todos provide.
`test/acceptance/coverage.test.ts` closes the gap that made "fail" tempting: it fails for real if
the capability table and the acceptance suite ever disagree about what is built. That guard was
mutation-tested, not merely written.

**2. The wire format is provisional.** Phase 4 builds the real client and the format is its to
settle. What is fixed now is only what the spec's contracts already promise — a load carries its
source format, the names the file established, the count it rejected, and every failure it walked
past. Masks travel bounded (a box plus its bytes) rather than as full-image planes, because the
obvious encoding is what the memory NFR exists to forbid: 500 objects on a 50-megapixel image is
25 GB of mostly zeros.

**3. `GET` takes the image size as a query parameter.** The text formats store normalized
coordinates, so a reader cannot recover pixels without the image's dimensions, and the API cannot
know them until the image pipeline (C8, Phase 5) can decode the file. The client states it until
then. The seam is left visible rather than hidden behind a half-built decoder that would be wrong
for 16-bit TIFF — which is precisely the case the pipeline exists for.

**4. A malformed hotkey entry keeps its default binding.** Legacy does
`keys.get("primary_key", "")`, binding the action to the empty string: it stops working, nothing is
reported, and the user finds out by pressing it. Same class of silent loss as RULE-088, so it is
fixed and warned about rather than reproduced. (This now lives in `@lazylabel/settings-schema`,
because the browser needs the same rules locally.)

## The empty-save rule, closed in Phase 4

A save with zero segments now writes an **empty file** for each selected format rather than writing
nothing. The architecture review found that writing nothing lets the next load resurrect deleted
work: the user clears an image, saves, and the stale sidecar is still there to be read back.
Deleting it would also look correct and is the one thing decision 7 rules out, so the answer had to
be an empty file.

What an empty file *is* was the part worth waiting for, and it turned out not to need inventing.
Every writer already builds its whole document and only short-circuits at the very end when there
is nothing in it — so the empty form is exactly what that writer produces with no objects. An empty
COCO file carries its `images` entry with empty `annotations` and `categories`; an empty Pascal VOC
carries the filename and size with no `<object>`; an empty NPZ is the same three members with zero
channels. Each one parses back through the *same* reader as zero segments, rather than being a
special case the reader has to know about.

The option defaults off in the library, so every byte-identity proof against legacy is untouched,
and on in the save path, which is where the rule applies.

## One change to Phase 1

`@lazylabel/annotation-formats` now exports `stripExtension` alongside `outputPathFor`, because the
API needs the same `os.path.splitext` semantics to group an image with its sidecars, and a second
implementation of that rule is the drift the library exists to prevent.

Its `exports` map also lists the `development` condition **first**. Condition order decides
precedence, and with `types` ahead of it a consumer asking for `development` still received the
built `.d.ts` — stale by construction. Tests and typechecking here now resolve the library's
TypeScript source, so there is no build ordering between the two packages and no way to test against
a stale `dist`.
