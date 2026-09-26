# LazyLabel API

The Node.js service that reads and writes annotation files in the user's folder, owns the image
pipeline, serves settings, and proxies inference. It began as Phase 2's pilot slice — the first of
the three scaffolds, taken end to end so the seams were proved by something that ran — and Phases
4 and 5 filled it in.

**RULE-032's processing chain lives here, not in the browser**, and that is the one thing about
this service worth knowing before reading it: rescale, channel thresholds and the FFT belong
*before* the 16-bit to 8-bit conversion, and the browser only ever receives what comes after it. A
rescale applied client-side would quantise a 16-bit scan to 256 levels and then stretch those.

| | |
|---|---|
| Phases | 2, 4 and 5 of [`MODERNIZATION_BRIEF.md`](../../../analysis/lazylabel/MODERNIZATION_BRIEF.md), all complete |
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
| `LAZYLABEL_DB` | `<root>/.lazylabel/lazylabel.db` | SQLite file for settings, hotkeys and job records. `:memory:` keeps them only while the process runs: the API warns at startup, `/health` reports `databaseInMemory`, and the web app shows a banner, because every save succeeds and none survives a restart. |
| `LAZYLABEL_PORT` | `8787` | |
| `LAZYLABEL_INFERENCE_URL` | *none* | Where the inference service listens, such as `http://127.0.0.1:8788`. Unset is a supported deployment: every route except SAM prompts, propagation and archetypes works, and those answer 503 with the reason. A value that is not an http or https URL is refused at startup, quoted. |
| `LAZYLABEL_HOST` | `127.0.0.1` | Loopback by default. Decision 3 is one trusted user, so exposing this is a deliberate act behind a reverse proxy, not a default. |
| `LAZYLABEL_LEGACY_SETTINGS_DIR` | `~/.config/lazylabel` | Where the desktop app kept `settings.json` and `hotkeys.json`. Read once, at startup, while this database holds no settings; after that the stored settings are the truth and these files are never read again. Empty turns the import off. |

### The acceptance round trip (Phase 6's exit criterion 4)

`npm run acceptance -- <corpus> --oracle <legacy re-saves>` opens every annotated image under the
corpus, saves it again the way the web app does, and compares every file with what the DESKTOP app
writes when it opens and saves the same image. Both paths must be absolute. Text formats are compared
after normalising line endings; the NPZ formats array by array, with the class names by value,
because both apps pickle the name table but in different pickle protocols. Exit 0 is a pass, 1
means files differed, and 2 means nothing was compared.

In Windows PowerShell, run it as `npm.cmd run acceptance -- ...`: plain `npm` resolves to `npm.ps1`,
which swallows the `--`, so `--oracle` never reaches the tool and every instance format "differs".

- **The oracle matters.** The desktop app does not reproduce its own files either. Its NPZ holds
  one mask per class, so opening an image merges a class's instances, and the YOLO, COCO, Pascal
  VOC and CreateML files it writes afterwards differ from the ones it wrote first. Without
  `--oracle`, the files are compared with the originals, and those differences show up as failures
  that are the desktop app's behaviour, not this app's.
- **The class names need no converter.** Every NPZ the desktop app writes pickles its class names.
  Since 2026-09-25 the web app reads that table as data and writes it the same way, never unpickling
  anything (SEC-01), so a corpus is used exactly as the desktop app saved it. A name table in any
  other shape is refused, and the image is reported as having unreadable class names.

`tools/generate_acceptance_corpus.py` writes the synthetic corpus the owner chose, and its oracle,
with the desktop app's own code. `test/acceptance/corpus.test.ts` runs both checks over it on every
test run. Its docstring gives the command, which needs the legacy app's Python environment.

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

Routes: `GET /projects/{projectId}/images` (the dataset listing),
`GET`/`PUT /projects/{projectId}/images/{imagePath}/annotations`,
`GET .../metadata`, `GET .../pixels`, `GET .../thumbnail`, `GET .../tiles/{z}/{x}/{y}` (the
processed view as 512-pixel tiles; level 0 is the image's own pixels and each level above is the
one below averaged in 2x2 blocks, the geometry shared with the browser through
`@lazylabel/contracts`),
`GET`/`PUT /users/me/settings`, `GET /health`.

## The image pipeline

The architecture gives this to the API rather than the browser, and the reason is RULE-024 rather
than convenience: a 16-bit image is shown to the user, and sent to SAM, as `value / 256` **truncated**
— so display and inference have to agree, and they only can if one place decides. The browser also
cannot decode 16-bit TIFF at all, which settles where that place is.

Two decoders, one rule. `sharp` handles jpeg, png, webp, tiff and gif; it does not handle BMP, which
decision 9 adds and legacy reads through OpenCV, so BMP has its own decoder in `src/images/bmp.ts`.
Neither of them does the 16-bit conversion — that is applied once, to whichever decoder produced the
pixels.

`sharp` will happily return 8-bit pixels for a 16-bit file, and its conversion happens to agree with
RULE-024 today. Depending on that would put the rule inside libvips, where nothing here can see it
and a version bump could change it silently. `toColourspace("rgb16")` gives the true 16-bit samples
instead, and the divide is written out where a test can hold it.

**Proven against OpenCV, not asserted.** `tools/generate_image_fixtures.py` writes each fixture
together with the pixels `cv2.imread` reads from it, BGR reordered and 16-bit truncated the way
legacy truncates. `test/images/differential.test.ts` decodes the same files through this pipeline
and compares: exact for PNG, TIFF, 16-bit TIFF and BMP; within two levels for JPEG, where two
conformant decoders legitimately differ. The conversion itself is checked across all 65,536 values.

The C2 test is the pilot's point. It writes real sidecars into a real temporary folder and proves
the contract that matters most: a damaged high-priority file does not hide the healthy one beside
it (decision 15c), the recovery is reported rather than silent, and when nothing can be read the
answer is **409, never an empty canvas** (decision 15d) — the failure that, with legacy's auto-save,
turned an unreadable file into lost work.

## Deliberate deviations

Four, each with its reason.

**1. Pending capabilities are `test.todo`, not failing tests.** Phase 2's exit criterion 2 said
acceptance tests for unbuilt capabilities should "fail". They are todos instead. A permanently red
suite satisfies the letter of criterion 2 and destroys criterion 4 in the same stroke — CI that is
always red tells you nothing on the day something actually breaks. The intent is that an unbuilt
capability is *visible* and never mistaken for a passing one, which todos provide.
`test/acceptance/coverage.test.ts` closes the gap that made "fail" tempting: it fails for real if
the capability table and the acceptance suite ever disagree about what is built. That guard was
mutation-tested, not merely written.

**2. The wire format was provisional, and Phase 4 settled it.** What it fixed is what the spec's
contracts promise — a load carries its
source format, the names the file established, the count it rejected, and every failure it walked
past. Masks travel bounded (a box plus its bytes) rather than as full-image planes, because the
obvious encoding is what the memory NFR exists to forbid: 500 objects on a 50-megapixel image is
25 GB of mostly zeros.

**3. `GET` takes the image size as a query parameter.** The text formats store normalized
coordinates, so a reader cannot recover pixels without the image's dimensions. The pipeline can
decode the file now, so the API *could* measure it itself — and it still does not, because the
client already asks for the metadata to size its canvas and a second decode per load would be the
same answer bought twice. The parameter stays; what changed is that it is now a choice rather than
a gap.

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
