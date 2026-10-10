# LazyLabel web: how easy is it to pull the repo and launch the app?

| | |
|---|---|
| Question | "how easy is it for a new user to pull down the repo and launch the app, what do they need to make it work, what can be improved to make it more easy to get it launched by any user with the least amount of set up" |
| Evaluated | `origin/main-web` at `359738f` (2026-09-26). The full walkthrough ran on `ad35869`, and a first pass on `2c1d1f1` the day before. `ad35869` to `359738f` is 13 commits of web UI wording and behaviour, with no change to any README, `package.json`, lockfile, `deploy/` file, CI workflow, API config or entry point, or inference packaging. The key steps were re-run on a new clone of `359738f` with the same results (3.1, "Re-check on `359738f`"). |
| Machine | Windows 11, Git 2.50.0, Node 22.17.0, npm 11.4.2, uv 0.7.13, RTX 3080 (driver 591.86). No Docker. |
| Method | A fresh clone in the scratchpad, following only the written instructions. Isolated npm and uv caches, other ports (18787 to 18790, 15173 to 15175), an empty image folder made by a script. The existing `E:\venv\lazylabel-312` was used read-only to start the inference service. No checkpoint was downloaded. |
| Not verified | Docker (not installed here; CI evidence is used instead). macOS and Linux. A real model inference. A PyTorch install into a new environment (dry-run resolution only). |

---

## 1. Verdict

The app itself is ready for newcomers. The way you get it running is not. On a fresh clone the
application code behaves well:
- the API refuses to start without a dataset folder and says why;
- the AI tools switch themselves off with a clear message when there is no inference service, and the status bar says "No AI";
- an in-memory settings store raises a banner (new on 2026-09-26, verified);
- all dependencies ship as prebuilt binaries, so no compiler is needed;
- the suites pass on `359738f`: API 537 passed with 4 skipped, web 1559 passed.

The obstacles are all in packaging and documentation:
- **Nothing tells a newcomer the web app exists.** The root README on `main-web` is still the PyQt6 README: `pip install lazylabel-gui`, Python 3.10+.
- **The README they eventually find breaks when followed literally.** The API README's own four commands fail at step 3 (`TS2307`). `npm start` then dies with `ERR_MODULE_NOT_FOUND`. The documented build loop fails with `'tsc' is not recognized`. That lasts until you work out that the three shared libraries each need their own `npm install` first, which no README says.
- **The working sequence is still long.** It is 9 commands, in a fixed order, across 6 directories and 2 terminals. The environment variables are written in bash-only syntax, which fails in PowerShell and in cmd. The app then only exists at the Vite dev server's URL: the API answers `/` with a 404.

The machine cost is small: under a minute of installs and builds after the clone, and about 0.5 GB
of disk. So the no-AI path is a 15-minute job for a developer who guesses right. It is a dead end
for a non-technical annotator.

The AI path is expert-only:
- A Python 3.12 environment, with PyTorch from the right CUDA index. A default `pip install ".[ai]"` gets a different, unvalidated torch on each OS: CPU-only 2.14 on Windows, and 2.14 with CUDA 13 on Linux.
- SAM 2 installed from GitHub, whose build pulls a second PyTorch.
- OpenCV, which is not declared.
- Checkpoints downloaded by hand, 0.9 to 3.5 GB.
- A hand-written `manifest.json`. The committed example has the wrong size for SAM 2.1, which turns into a "partial download" error.
- A third terminal whose documented command fails three separate ways.

The Docker path that `CUTOVER.md` sends users to has never been run. Its AI profile cannot read
images.

**The web rewrite has removed the Qt half of the old install pain and quarantined the PyTorch
half, but it has not yet removed the PyTorch half.** Five small-to-medium changes would make the
no-AI app a two-command install (`npm install`, then `npm start "<folder>"`), and the AI a
three-command, opt-in add-on. Two of those changes were prototyped here and work.

| Path | Today (measured) | After the top recommendations |
|---|---|---|
| Manual annotation, developer | 9 commands in a fixed order, 2 terminals, bash-only syntax, 3 errors to diagnose. Under a minute of installs and builds, about 0.5 GB. | `npm install`, then `npm start "<folder>"`: one process, one URL. The workspace install is 128 MB instead of 392 MB. |
| Manual annotation, non-technical | Not realistic | The same two commands (Node and Git needed). Later, a zip with a double-click launcher and no prerequisites. |
| AI tools | About 15 manual steps, 4.9 GB environment plus 0.9 to 3.5 GB of checkpoints, several ways to get it silently wrong | `npm run ai:setup`, `npm run ai:models sam2.1-large`, `npm start "<folder>"` |
| Docker | Built in CI, never run. The AI profile is broken, there is no CPU profile, and the inference image has never been built. | `docker compose up` with prebuilt images, CPU and GPU profiles |

---

## 2. Prerequisites, as a newcomer would have to assemble them

### 2.1 What is needed

| Item | Needed for | Version: declared, real, tested | Documented? | Notes |
|---|---|---|---|---|
| Git | Cloning | Any. Tested 2.50.0. | Only in the PyQt6 README | GitHub's "Download ZIP" would also work. A clone downloads about 55 MB of history. |
| Node.js | API and web (everything without AI) | Declared `engines: >=22` in all five `package.json` files. **Real floor 22.13.0.** Tested 22.17.0. | **No README states it.** It appears only in `engines` and in a Dockerfile comment. | `node:sqlite` is unflagged from 22.13. Before that the API dies with `Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite`, reproduced with `--no-experimental-sqlite`. npm does not enforce `engines`. |
| npm | Installs | Ships with Node. Tested 11.4.2. | Implied | Needs registry access: about 46 MB of downloads (cold cache). |
| Browser | UI | Any current Chromium, Firefox or Safari. Tested in Chromium. | No | |
| Disk, no AI | | About 0.5 GB | No | Clone 82 MB. `node_modules` 392 MB across five installs (128 MB as one workspace). npm cache 46 MB. Builds about 2 MB. |
| RAM, no AI | | About 175 MB plus the browser tab | No | API about 66 MB RSS, Vite dev server about 106 MB (measured). |
| OS | | Windows 11 verified. macOS and Linux not tested. | README commands are bash-only | `sharp` installs prebuilt `@img/sharp-*` binaries: no compiler on any OS. |
| Python | AI only | `requires-python >=3.12`. Tested 3.12.11. | Inference README | The root README says "Python 3.10+" (PyQt6), which contradicts this for a newcomer on `main-web`. |
| uv or pip | AI only | uv 0.7.13 used by the owner | Inference README, with the owner's own paths (`E:/venv/lazylabel-312`) | |
| PyTorch and torchvision | AI only | Declared `torch>=2.10.0` (no ceiling) and `torchvision` (unpinned). Validated: `2.10.0+cu128` and `0.25.0+cu128`. | Inference README ("Setting it up with CUDA") | Which build you get depends on OS and index: see 3.4. The Windows cu128 wheel is 2.87 GB. The validated environment is 4.9 GB on disk, of which torch is 4.3 GB. |
| NVIDIA driver | AI at usable speed | One that supports CUDA 12.8 for `cu128`. Tested 591.86. | Inference README | No CUDA toolkit or cuDNN is needed. Without a GPU the service runs on CPU. It never uses Apple's MPS, so Macs are CPU-only. |
| SAM 2 | AI (SAM 2.1, propagation) | Git commit `2b90b9f5`. Not on PyPI. | pyproject comment and README | Needs `git` and GitHub access. Its build requires `torch>=2.5.1`, so build isolation installs a PyTorch just to build a pure-Python wheel. Set `SAM2_BUILD_CUDA=0`, or it tries to compile a CUDA extension. |
| segment-anything, scikit-learn, pillow, numpy | AI | `==1.0`, `>=1.3`, any, any | pyproject | |
| OpenCV | Every inference route that reads an image | **Not declared.** Validated: `opencv-python-headless` 5.0.0.93. | Inference README (CUDA section) and the Dockerfile | Deliberately undeclared (conflict with the desktop app's `opencv-python`), so a plain `pip install ".[ai]"` gives a service that fails on `import cv2`. |
| Checkpoints | AI | SAM 2.1 large, 898,083,611 B. SAM 1 vit_h, 2,564,550,879 B. MobileNetV3 small, 10,305,097 B. | `MODEL_MANIFEST.md` (URLs and verified SHA-256s) | Downloaded by hand, never at runtime (SEC-03). MobileNetV3 has **no download URL**: it is generated with a PyTorch snippet from the PyQt6 README. |
| `manifest.json` | AI | Hand-written from `inference/models/manifest.example.json` | Example `$comment` and the inference README | The example's SAM 2.1 `bytes` is wrong: 897,952,466 instead of 898,083,611 (see F3). |
| GPU memory | AI | Not stated | No | The owner's full suites filled a 10 GB RTX 3080 (`PROGRESS.md`). Interactive use needs less. Not measured here. |
| Docker | Optional path | Compose v2. For GPU: NVIDIA Container Toolkit (Linux) or Docker Desktop with WSL 2 (Windows). | `deploy/README.md` | No GPU path on macOS. |

### 2.2 The commands a newcomer must run today

This is the shortest sequence that works on `359738f` (and `ad35869`). No single document gives it
in this order.

```bash
git clone -b main-web https://github.com/dnzckn/LazyLabel.git && cd LazyLabel/modernized
(cd lazylabel/core/exporters && npm install)                 # not in any README
(cd lazylabel-reimagined/settings-schema && npm install)      # not in any README
(cd lazylabel-reimagined/contracts && npm install)            # not in any README
(cd lazylabel-reimagined/api && npm install)
cd lazylabel-reimagined
for p in ../lazylabel/core/exporters settings-schema contracts api; do (cd "$p" && npm run build); done
(cd web && npm install)
# terminal 1 (bash; PowerShell needs:  $env:LAZYLABEL_DATASET_ROOT="C:\images"; npm start)
cd api && LAZYLABEL_DATASET_ROOT=/path/to/images npm start
# terminal 2
cd web && npm run dev        # then open http://localhost:5173  (not 8787: the API answers / with 404)
```

### 2.3 Every environment variable

| Variable | Read by | Default | Needed? |
|---|---|---|---|
| `LAZYLABEL_DATASET_ROOT` | API | none: refuses to start | **Required** |
| `LAZYLABEL_DB` | API | `<dataset>/.lazylabel/lazylabel.db` (per folder; see F7) | Optional. `:memory:` warns and raises a banner. |
| `LAZYLABEL_PORT`, `LAZYLABEL_HOST` | API | `8787`, `127.0.0.1` | Optional |
| `LAZYLABEL_INFERENCE_URL` | API | none: AI off | Only for AI |
| `LAZYLABEL_LEGACY_SETTINGS_DIR` | API | `~/.config/lazylabel`, which is where the PyQt6 app keeps them on every OS | Optional. Imports desktop settings once, a nice touch. |
| `LAZYLABEL_API` | Vite dev server | `http://127.0.0.1:8787` | Only if the API port changes |
| `VITE_LAZYLABEL_API` | Web build | `/api` | Leave unset |
| `LAZYLABEL_MODEL_DIR` | Inference | none: refuses to start | Required for AI |
| `LAZYLABEL_MODEL_MANIFEST` | Inference | `<model dir>/manifest.json` | Optional |
| `LAZYLABEL_DATASET_ROOT` | Inference | none: every image route answers 503 | **Required for AI, and it must match the API's.** The reimagined README's command omits it. |
| `LAZYLABEL_INFERENCE_PORT`, `LAZYLABEL_INFERENCE_HOST` | Inference | `8788`, `127.0.0.1` | Optional |
| `SAM2_BUILD_CUDA=0` | SAM 2's `setup.py`, at install | `1` | Recommended |
| `DATASET_ROOT`, `MODEL_DIR`, `LAZYLABEL_INFERENCE_URL` | Docker Compose | none | Docker only |
| `LAZYLABEL_TEST_*` (3), `PYTHONPATH` | Live test suites | none | Developers only |

### 2.4 Where a newcomer has to guess

1. **That the web app exists, and where.** The root README describes only the PyQt6 app. The web README is two directories down, in `modernized/lazylabel-reimagined/README.md`.
2. **Which of about ten documents is authoritative.** Seven READMEs, plus `CUTOVER.md` and `PROGRESS.md`. The reimagined README says `PROGRESS.md` (1,900 lines) is "the one to read first".
3. **That each shared library needs its own `npm install`** before the API or web app can typecheck, build or start. The README says "Each package is independent: `npm install` then `npm test` inside it", and `npm test` passes without them, which hides the problem.
4. **The Node version.**
5. **How to set environment variables on Windows.**
6. **Which URL to open.** It is 5173, the dev server; 8787 answers 404. There is also no documented way to serve a production build outside Docker.
7. **That the API writes `.lazylabel/` into the image folder,** and that settings do not follow you to another folder.
8. For AI:
   - that the package must be installed (the quick start omits `pip install -e .`);
   - that OpenCV must be added by hand;
   - which PyTorch index to use;
   - `SAM2_BUILD_CUDA=0`;
   - how to write `manifest.json`, and where the hashes are;
   - that the inference service needs the dataset root too;
   - that the API must be restarted with `LAZYLABEL_INFERENCE_URL`;
   - where MobileNetV3 comes from.
9. For Docker:
   - that `MODEL_DIR` must contain a `manifest.json`;
   - that the AI profile will still not see the images (F6).

### 2.5 Documents that are missing, contradictory or stale

| Where | Problem |
|---|---|
| `README.md` (repo root, `main-web`) | Only the PyQt6 app: `pip install lazylabel-gui`, "Python 3.10+, 8GB RAM". Nothing about the web app, Node, or the `modernized/` tree. |
| `modernized/lazylabel-reimagined/README.md`, lines 47 to 57 | "Each package is independent", followed by a build loop that fails on a fresh clone. |
| Same file, line 79 (terminal 3) | `cd inference && LAZYLABEL_MODEL_DIR=... python -m lazylabel_inference.server` fails with `ModuleNotFoundError: No module named 'lazylabel_inference'` (not installed; the code is under `src/`). With the package installed it still answers 503: no manifest, and no `LAZYLABEL_DATASET_ROOT`. |
| Same file, line 135 | "The sequence timeline is built; propagation is not", which contradicts the same README's "C11 ... runs end to end" and every other document. |
| `modernized/lazylabel-reimagined/api/README.md`, lines 23 to 26 | `npm install`, `npm test`, `npm run typecheck`, `npm run build`: the third step fails on a fresh clone. |
| `web/vite.config.ts`, line 18, and `REIMAGINED_ARCHITECTURE.md` (container diagram) | "The API serves the built app in production". It does not: `GET /` answers `{"status":404,"code":"not_found","message":"no route for /"}`. |
| `inference/models/manifest.example.json`, line 18 | SAM 2.1 large `"bytes": 897952466`. The real file, the publisher's `Content-Length` and `MODEL_MANIFEST.md` all say 898,083,611. |
| `inference/README.md`, "Setting it up with CUDA" | Uses the owner's machine paths (`E:/venv/lazylabel-312`). |
| `deploy/*.Dockerfile` ("NEVER BUILT"), `deploy/compose.yaml` line 22, reimagined README line 103 | **Stale since 2026-09-26.** CI's "deployment images" job has built the API and web images and validated the compose file on every push since, `359738f` included. They are still never run. |
| `deploy/README.md` ("inference image builds weekly and on demand") | Those triggers (`schedule`, `workflow_dispatch`) only fire from a workflow file on the default branch (`main`), which does not have `modernized.yml`. GitHub reports 0 such runs, so the CUDA image has never been built. |
| `analysis/lazylabel/CUTOVER.md`, "What a user does" step 2 | Sends users to `DATASET_ROOT` in `deploy/example.env`: the Docker path, which has never been run. |

---

## 3. Fresh-clone walkthrough log

All times are wall-clock on this machine. Every npm install used a new, empty `--cache` directory,
to approximate a first-time user.

### 3.1 Manual annotation (no AI), `ad35869`

| # | Newcomer action (source) | Command | Time | Result |
|---|---|---|---|---|
| 0 | Clone | `git clone --branch main-web --single-branch E:/GitHub/LazyLabel fresh`, refreshed to `ad35869` with `git pull --ff-only` | 50.6 s first clone; 1 s pull; 60 s for the `359738f` clone | 82 to 83 MB (55 MB `.git`). A clone of that clone on the same drive took 6 s, so most of the time is copying across drives. |
| 1 | Reads the root README | none | | PyQt6 instructions only. |
| 2 | API README, "Running it" | `cd modernized/lazylabel-reimagined/api && npm install` | 3.8 s | 99 packages, 95 MB |
| 3 | | `npm test` | about 11 s | **Passes:** 37 files, 537 passed, 4 skipped (541), although the libraries are not installed. |
| 4 | | `npm run typecheck` | about 3 s | **FAIL**, exit 2: `../contracts/src/wire.ts(21,55): error TS2307: Cannot find module '@lazylabel/annotation-formats' or its corresponding type declarations.` and `wire.ts(199,37): error TS7006: Parameter 'failure' implicitly has an 'any' type.` |
| 5 | | `npm run build` | about 3 s | **FAIL**, same two errors, exit 2. A partial `dist` is still emitted. |
| 6 | | `LAZYLABEL_DATASET_ROOT=... npm start` | under 1 s | **FAIL**: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\api\node_modules\@lazylabel\annotation-formats\dist\index.js' imported from ...\api\dist\src\app.js` |
| 7 | Reimagined README build loop | `for p in ../lazylabel/core/exporters settings-schema contracts api; do (cd "$p" && npm run build); done` | about 3 s | **FAIL**, three times: `'tsc' is not recognized as an internal or external command, operable program or batch file.` Then TS2307 for the API. |
| 8 | What they had to know | `npm install` in each of `exporters`, `settings-schema`, `contracts` | 21 s | 65, 65 and 66 packages, 66 MB each. Each carries its own copy of TypeScript and vitest. |
| 9 | Build loop again | as step 7 | 10 s | OK |
| 10 | Start the API, default settings location | `LAZYLABEL_DATASET_ROOT=<images2> LAZYLABEL_PORT=18787 LAZYLABEL_LEGACY_SETTINGS_DIR= npm start` | under 1 s | Listening. It prints `ExperimentalWarning: SQLite is an experimental feature and might change at any time`, and creates `<images2>/.lazylabel/lazylabel.db`, `-wal` and `-shm` **inside the image folder**. `/health`: ok, `databaseInMemory: false`, AI: "no inference service is configured, so the AI tools are unavailable". |
| 11 | Do settings follow the user? | `PUT /users/me/settings` with `line_thickness=2.5` on `images2`, then restart on another folder | | The other folder shows `0.5`: **settings are per dataset folder.** |
| 12 | In-memory settings (new) | same, with `LAZYLABEL_DB=:memory:` | under 1 s | The log warns `settings and hotkeys are held in memory and will be lost when the API stops`. `/health` reports `databaseInMemory: true`. The UI shows the banner "Settings are kept in memory and will be lost when the API restarts." |
| 13 | Install the web app | `cd web && npm install` | 6 s | 212 packages, 99 MB |
| 14 | Start the web app | `LAZYLABEL_API=http://127.0.0.1:18787 npm run dev -- --port 15173 --strictPort` | ready in 0.4 s | Verified in a real browser: 5 images listed, one opened on the canvas, and the AI panel says "The models could not be listed: no inference service is configured, so the AI tools are unavailable". |
| 15 | Production build | `npm run build` (web) | 13 s | `dist` 421 KB (JS 128 KB gzipped). Nothing documented serves it outside Docker. |
| 16 | "Where is the app?" | `curl http://127.0.0.1:18787/` | | `404 {"status":404,"code":"not_found","message":"no route for /"}` |
| 17 | Suites on the clone | `npm test` in api and web | 11 s and 21 s | On `ad35869`, API: 37 files, 537 passed, 4 skipped. Web: 115 files, 1506 passed. For `359738f`, see the re-check below. |

The Windows shell steps, all on this machine:

| # | What | Result |
|---|---|---|
| 18 | README syntax in PowerShell | `The term 'LAZYLABEL_DATASET_ROOT=C:\path\to\images' is not recognized as the name of a cmdlet, function, script file, or operable program.` |
| 19 | README syntax in cmd.exe | `'LAZYLABEL_DATASET_ROOT' is not recognized as an internal or external command, operable program or batch file.` |
| 20 | PowerShell `npm start -- "C:\my images" --port 9000` | The script receives `["C:\\my images","9000"]`: npm.ps1 swallows `--`, and npm eats `--port`. A positional folder works in every shell: `npm start "C:\my images"` gives `["C:\\my images"]` in both bash and PowerShell. |
| 21 | A second API on a busy port | An unhandled `'error'` event stack trace: `Error: listen EADDRINUSE: address already in use 127.0.0.1:18787` |
| 22 | Started from a path reached through a directory junction (cmd, `cd /d <junction>\...\api && npm start`) | **Exits 0 silently.** Nothing is logged after npm's banner and nothing listens. The same command through the real path runs. Cause: the entry guard `import.meta.url === pathToFileURL(process.argv[1]).href` (`api/src/main.ts:146`) compares the resolved real path with the junction path. `subst` and mapped drives are likely the same; not tested. |
| 23 | Node without `node:sqlite` (simulated with `--no-experimental-sqlite`) | `Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite`, which is what Node 22.0 to 22.12 users get. |
| 24 | Web package only (`2c1d1f1`): `npm install`, `npm test`, `npm run build` | Tests pass (1328). The build fails with the same TS2307. The dev server transforms the shared-library modules fine. |

**Totals for the working sequence:**
- About 55 s of installs and builds, with a cold cache: 3.8 + 21 + 10 + 6 + 13.
- About 0.52 GB of disk.
- 9 commands, 2 terminals.
- 3 distinct errors to diagnose before it works, 5 on Windows if the README syntax is typed as written.

**Re-check on `359738f`.** This was a new clone, because the `ad35869` clone's `.git` had been
damaged outside this evaluation (see the appendix). It used a new, empty npm cache.

| Step | Time | Result |
|---|---|---|
| API README: `npm install`, `npm test`, `npm run typecheck`, `npm run build`, `npm start` | install 3 s | Unchanged: tests pass (37 files, 537 passed, 4 skipped), typecheck and build fail with the same `TS2307` and `TS7006`, and `npm start` fails with `ERR_MODULE_NOT_FOUND`. |
| The working sequence: three library installs, the build loop, the web install | 7 s, 8 s, 5 s | All builds exit 0. |
| API with `LAZYLABEL_DB=:memory:` on 18787, and the Vite dev server on 15173 | under 1 s each | In the browser: 5 images listed, an image opened on a 640x480 canvas, and the Sequence tab opened. The banners read "Settings are kept in memory and will be lost when the API restarts." and "The models could not be listed: no inference service is configured, so the AI tools are unavailable". The status bar reads "No AI". |
| `GET /` on the API | | Still `404 no route for /` |
| Web suite | about 25 s | 116 files, 1559 passed |

### 3.2 The AI path

| # | Action | Result |
|---|---|---|
| 25 | Reimagined README terminal 3, with a Python 3.12 that has not installed the package | `python.exe: Error while finding module specification for 'lazylabel_inference.server' (ModuleNotFoundError: No module named 'lazylabel_inference')` |
| 26 | The clone's `src` on `PYTHONPATH`, run from the existing 3.12 venv, without `LAZYLABEL_MODEL_DIR` | `{"level": "error", "message": "the inference service could not start", "reason": "LAZYLABEL_MODEL_DIR must name the directory holding the model checkpoints; this service will not guess, and it never downloads one"}`. Clear. |
| 27 | An empty model directory | Starts. The first `/health` takes 3.97 s (torch import and CUDA initialisation), later ones 8 to 23 ms. `503`, with `ai.available: true`, "PyTorch 2.10.0+cu128 and segment-anything are available", the accelerator named, and the reason "The model manifest could not be read: ... manifest.json could not be read: [Errno 2] No such file or directory". Clear, but the fix (write a JSON file with hashes) is manual. |
| 28 | No `LAZYLABEL_DATASET_ROOT`, as terminal 3 is written | `POST /inference/embeddings` answers `503 {"code":"inference_unavailable","message":"this service has no dataset root configured, so it cannot read images"}`. The service logs a hint at startup, which is good, but the README omits the variable. |
| 29 | The API pointed at it (`LAZYLABEL_INFERENCE_URL=http://127.0.0.1:18788`) | API `/health`: `ai.available: true`, carrying the manifest reason. `/inference/models`: `503 manifest_unreadable`. |
| 30 | A client disconnecting (a curl with a 1 s timeout during the first `/health`) | The service prints several full tracebacks: `ConnectionAbortedError: [WinError 10053] An established connection was aborted by the software in your host machine`. Harmless, but it looks like a crash. |

### 3.3 Checkpoints today

To enable AI, a user must:
1. Read `MODEL_MANIFEST.md`.
2. Download from `dl.fbaipublicfiles.com` by hand. SAM 2.1 large is 898,083,611 B and SAM 1 vit_h is 2,564,550,879 B, both confirmed by HEAD requests; nothing was downloaded.
3. Generate MobileNetV3 with a PyTorch snippet that lives in the PyQt6 README. It downloads torchvision's weights, and there is no URL of its own.
4. Copy `manifest.example.json` to `manifest.json` beside the files.
5. Paste in the three SHA-256s from `MODEL_MANIFEST.md`.
6. Correct the example's SAM 2.1 size, or the service reports `sam2.1_hiera_large.pt is 898083611 bytes; the manifest says 897952466. A partial download left in place is the usual cause.` That sends the user to re-download 898 MB for nothing.
7. Set `LAZYLABEL_MODEL_DIR`.

**Pain: high.** It is about ten manual steps, 0.9 to 3.5 GB, JSON editing and one trap.

MobileNetV3 has a further risk. `torch.save` output is not a stable artifact:
- saving the same tensors under two different file names gave different bytes, because the archive's records are prefixed with the file stem;
- the file carries version-dependent records (`.format_version`, `.storage_alignment`, `.data/serialization_id`).

So a newcomer who regenerates it may not match the verified SHA-256. This is untested, because it
would need the torchvision download.

### 3.4 Python dependency resolution (dry run)

Run with uv 0.7.13, against a requirements file equal to `dependencies` plus `[ai]`. SAM-2 was
replaced by its own runtime requirements, so no build was needed. OpenCV headless was added, as the
README does. No wheels were downloaded.

| Target | Index | Resolves to |
|---|---|---|
| Windows x64 | PyPI (the default) | torch 2.14.0 **CPU-only** (124 MB wheel), torchvision 0.29.0, 30 packages. Not the validated 2.10. It runs silently at CPU speed. |
| Linux x86_64 (manylinux_2_28) | PyPI | torch 2.14.0 **with CUDA 13 wheels** (`nvidia-*-cu13`, `cuda-toolkit 13.0.3`, `triton 3.8.0`), 48 packages. The torch wheel alone is 555 MB. It needs a CUDA 13 driver. It is **unsatisfiable on glibc older than 2.28.** |
| macOS arm64 | PyPI | torch 2.11.0, the newest with wheels for macOS before 14. CPU only in this service. |
| Windows x64 | `--torch-backend cu128` or `auto` | torch 2.11.0+cu128. Still not 2.10. |
| Windows x64 | the README's pins (`torch==2.10.0`, `torchvision==0.25.0`, cu128 index) | torch 2.10.0+cu128. **The only path to the validated version.** The Windows wheel is 2.87 GB. |

In short, the same `pip install ".[ai]"` produces four different PyTorch builds, and none of them is
the validated one unless the user copies the README's pins and index URL by hand. There is no
lockfile.

SAM-2 at `2b90b9f5` is a separate problem:
- its `pyproject.toml` requires `torch>=2.5.1` just to build, so pip or uv install a second PyTorch into the isolated build environment;
- the result is a pure-Python wheel (`py3-none-any`, 694 KB installed) when `SAM2_BUILD_CUDA=0`;
- it is Apache-2.0, so a prebuilt wheel can be redistributed.

The existing validated venv (`E:\venv\lazylabel-312`, read-only) is 4.9 GB on disk. `uv pip check`
says all packages are compatible.

### 3.5 Docker and CI (from GitHub's public API, read-only)

- `main-web` has been on GitHub since 2026-09-26. Each of the 19 pushes so far ran "Modernized services".
- **All 19 runs failed.**
  - The latest (`359738f`) fails only "differential against legacy", at "Compare readers against the legacy loaders". So did `e0e601b`'s.
  - The earliest also failed the API and web tests.
- **The "deployment images" job succeeded:** the API and web Docker images build and the compose file validates.
- The inference image job: 0 runs. Its `schedule` and `workflow_dispatch` triggers need the workflow on `main`.
- Nothing has run the containers.

Two findings come from reading `compose.yaml` and reproducing the service's behaviour outside
Docker (row 28):
- **The `ai` profile cannot read images.** The `inference` service gets neither `LAZYLABEL_DATASET_ROOT` nor the dataset mount, so every SAM request would answer 503.
- The compose file also needs a `manifest.json` inside `MODEL_DIR`, and `deploy/README.md` does not say so.

### 3.6 Two prototypes, built in the scratch clone and not committed anywhere

| Prototype | Result |
|---|---|
| **npm workspace** at `modernized/package.json` (five members, `build` and `test` across all of them) | `npm install`: 15 s (warm cache), **244 packages, 128 MB, against 392 MB for five separate installs**. `npm run build`: 24 s, all five in dependency order. The API starts. API tests: 537 passed, 4 skipped. |
| **API serves `web/dist`** on its own port | About 100 lines: a new `api/src/http/staticWeb.ts` plus edits to `server.ts` and `main.ts`. On one port (18790), `/` returns the app, `/api/*` and `/health` both reach the API, and traversal attempts get 404. API tests: 537 passed, 4 skipped. Typecheck clean. Verified in a browser: 5 images listed, one opened on a 640x480 canvas. |

The full diff is in `prototype-one-command.diff`, next to this report.

---

## 4. The friction points, ranked

Ranked by how many newcomers hit each one, times how badly it stops them.

| Rank | Friction | Who hits it | Severity | Evidence |
|---|---|---|---|---|
| **F1** | **No entry point.** The root README on `main-web` is the PyQt6 README (`pip install lazylabel-gui`, Python 3.10+). The web app is not mentioned at the top level, and ten documents compete. | Everyone | Blocker for discovery | 2.4 and 2.5 |
| **F2** | **Five separate npm installs and a manual build order.** The API README's own steps fail at `typecheck`. `npm start` gives `ERR_MODULE_NOT_FOUND`. The README's build loop gives `'tsc' is not recognized`. It works only after installing each shared library, which no README says, while `npm test` passes and hides it. | Everyone | Hard blocker | Steps 2 to 9 |
| **F3** | **The AI setup is expert-only.** A default install gets the wrong torch on every OS. SAM 2 comes from git, and its build pulls a second torch. OpenCV is undeclared. The quick start omits `pip install`. Three environment variables must agree across two processes (the dataset root is set twice). Checkpoints are fetched by hand, the manifest is hand-written with a wrong example size, and MobileNetV3 has no source. The documented command fails three ways. | Anyone who wants SAM | Blocker for AI | 3.2 to 3.4 |
| **F4** | **Bash-only instructions on a Windows-first project.** `VAR=value cmd` fails in PowerShell and cmd. PowerShell's `npm.ps1` drops `--`, so options vanish. Two terminals (three with AI). The owner's own paths appear in the docs. | Windows users | High | Steps 18 to 20 |
| **F5** | **No single process, port or URL.** The app lives only at the Vite dev server (5173). The API answers `/` with 404. No documented way to serve a production build outside Docker, despite the comment and architecture saying the API does it. | Everyone | High | Steps 14 to 16 |
| F6 | **The Docker path is unrun and its AI profile is broken.** No dataset for inference. `manifest.json` undocumented. No CPU profile. The CUDA image never built. Docker Desktop is a heavy prerequisite on Windows and macOS, and there is no GPU on a Mac. `CUTOVER.md` sends users here first. | Docker users | High for them | 3.5 |
| F7 | **The settings database lives in the dataset folder by default.** It writes `.lazylabel/lazylabel.db`, `-wal` and `-shm` beside the images, and settings do not follow the user to another folder (verified). By reading the code, startup fails when the folder is read-only (`fs.mkdir` in `main.ts`). SQLite's documentation says WAL does not work over network filesystems, where team datasets often live. Synced folders pick up the files. The owner's per-user default is pending. | Everyone, later | Medium | Steps 10 and 11 |
| F8 | **The Node floor is undocumented and mis-declared** (`>=22`, really 22.13). A scary `ExperimentalWarning` prints on every start. | Anyone on an older Node 22 | Medium | Steps 10 and 23 |
| F9 | **Rough failure modes.** Silent exit through a junction. An EADDRINUSE stack trace. Tracebacks when an inference client disconnects. | Some Windows users | Low to medium | Steps 21 and 22, row 30 |
| F10 | **Trust signals.** CI red on every `main-web` push. Stale "never built" banners. Contradictory README lines. | Evaluators, contributors | Low for running, medium for adoption | 3.5 and 2.5 |

---

## 5. Compared with the PyQt6 install

| Problem class | PyQt6 app (`main`, PyPI 2.0.8) | Web app today | Web app after the recommendations |
|---|---|---|---|
| GUI toolkit binaries | PyQt6 pinned `<6.10` for DLL breakage in PyInstaller builds. `qdarktheme` DLL failures. libGL and xcb on Linux. The CHANGELOG is full of these. | **Gone.** The UI is a browser. | Gone |
| Interpreter churn | Python 3.10, which reaches end of life in October 2026 | Node LTS for the app. Python 3.12 only for AI. | Same |
| One environment for UI and AI | `[include-ai]` puts torch into the GUI's environment. A broken torch can take the app down (RULE-084's version-parse crash). | **Separated:** the UI runs with no Python at all, and AI is a separate optional service. | Same, and the launcher starts AI when present |
| Reproducible installs | No lockfile | JS: a lockfile per package. Python: none. | One JS lockfile, plus `uv.lock` for AI |
| Native builds | opencv-python GUI or headless conflicts. A 7 to 8 GB PyInstaller folder that could not be built without checkpoints. | `sharp` prebuilt everywhere. No compiler. | Same, and optional zip releases of about 100 MB |
| PyTorch and CUDA matching | Hard: the CPU wheel from PyPI on Windows, the CUDA index, the driver. | **Unchanged:** the same problem, moved into the optional service. | Solved for the common cases by `cpu` and `cu128` extras in a lockfile |
| SAM 2 availability | Not declared at all; a separate `pip install git+...` | Declared by commit, but git plus a build that pulls a second torch | A vendored pure-Python wheel |
| Checkpoints | Auto-downloaded on first use (convenient, but unverified, with partial-file failures) | **Harder:** manual download and a hand-written manifest (the safer design, but on the user) | An opt-in, verified `fetch` command. Still never at runtime. |
| Number of toolchains | One (Python) | Two for AI (Node and Python), three processes, and environment variables that must agree | One command starts everything that is installed |
| Build order | None | **New:** five packages in a fixed order | Automatic (workspace plus `prepare`) |
| Node version floor | n/a | **New:** 22.13, undocumented | Checked and explained by the CLI |
| Install size, manual annotation only | PyQt6, numpy, OpenCV, scipy: a few hundred MB | About 0.5 GB (0.26 GB as a workspace) | About 0.26 GB, or a zip |
| Install size with AI | torch and CUDA (several GB) plus 2.5 GB checkpoint | 4.9 GB environment plus 0.9 to 3.5 GB checkpoints | The same bytes, but one command, and SAM 2.1 large alone (898 MB) is enough |

**In short:**
- **What the web stack removes:** everything Qt, the desktop-binary problems, and the coupling of the UI to PyTorch.
- **What it keeps:** the PyTorch and CUDA matching, and SAM 2 not being on PyPI.
- **What it adds:** a second toolchain, a multi-package build order, a Node version floor, and manual checkpoints.

The last group is fixable with packaging work. None of it needs architectural change.

---

## 6. Recommendations, ranked by impact on adoption against effort

Effort: **S** is under a day, **M** is 1 to 3 days, **L** is over a week. The paths below are
relative to the repository root.

| Rank | Recommendation | Effort | Removes | Mainly helps |
|---|---|---|---|---|
| **R1** | A web quick start at the top of the `main-web` root README, plus fixes to the broken and stale docs | S | F1, most of F4 and F10 | Everyone |
| **R2** | An npm workspace at `modernized/` that installs and builds everything in one step | S (M with CI and Dockerfiles) | F2 | Everyone |
| **R3** | The API serves the built web app: one process, one port, one URL | S | F5 | Everyone |
| **R4** | A cross-platform `lazylabel` CLI: `npm start "<folder>"` | S | F4, F8, F9 | Everyone, Windows most |
| **R5** | A per-user settings database by default (the pending decision) | S | F7 | Everyone |
| **R6** | A reproducible AI environment: `uv.lock` with `cpu` and `cu128` extras, pinned torch, declared OpenCV, a vendored SAM-2 wheel, `npm run ai:setup` | M | Most of F3 | AI users |
| **R7** | An opt-in, verified model fetch and a committed verified manifest | M | The rest of F3 | AI users |
| **R8** | The CLI starts the inference service itself when it is installed; the UI says how to enable AI | S to M | The F3 and F4 coordination | AI users |
| **R9** | `npm run doctor`, a preflight check | S to M | Support load for all of F2 to F8 | Everyone |
| **R10** | Docker: fix the `ai` profile, add a CPU profile, run it once, publish images | M | F6 | Servers, Linux, teams |
| **R11** | Release zips with a portable Node and a double-click launcher, plus "Open Folder" in the app. A desktop wrapper later, if ever. | M to L | Every prerequisite | Non-technical annotators |
| **R12** | Robustness and trust: `engines`, the entry guard, EADDRINUSE, CI green, inference disconnect noise | S | F8 to F10 | Everyone |
| **R13** | The AI tools in the zip too: a portable Python, PyTorch, SAM 2.1 and the embedder, in parts under GitHub's 2 GiB, joined by the launcher | M | F3 for AI users | Non-technical annotators who want AI |

### R1. The entry point, and the docs as written (S)

**Root `README.md` on `main-web`:** a new first section, "LazyLabel web (this branch)", holding:
- prerequisites: Node.js 22.13 or later, and Git;
- the literal commands from section 7 (after R2 to R4; until then, section 2.2 with PowerShell equivalents);
- one line that AI is optional, with a link to the AI setup;
- the existing PyQt6 content kept below, under "Desktop app (PyQt6, branch `main`, PyPI 2.0.8)".

**Corrections to make now:**
- **`modernized/lazylabel-reimagined/README.md`:**
  - Lines 47 to 57: until R2 lands, install all packages before building: `for p in ../lazylabel/core/exporters settings-schema contracts api web; do (cd "$p" && npm install); done`, then the build loop.
  - Line 79: `pip install -e ".[ai]" opencv-python-headless`, add `LAZYLABEL_DATASET_ROOT`, and the manifest step.
  - Line 135: delete "propagation is not".
- **`api/README.md` lines 23 to 26:** point to the root quick start, or add the library installs.
- **Every `VAR=value cmd` example:** add the PowerShell form `$env:VAR="value"; cmd`.
- **`web/vite.config.ts` line 18:** make the comment true (R3) or correct it.
- **`inference/models/manifest.example.json` line 18:** `897952466` becomes `898083611`.
- **`inference/README.md`:** replace `E:/venv/lazylabel-312` with a relative `.venv`.
- **The "NEVER BUILT" banners** in `deploy/*.Dockerfile`, `compose.yaml:22` and the reimagined README line 103: "API and web images built by CI since 2026-09-26; never run; the inference image has never been built".
- **`CUTOVER.md` "What a user does" step 2:** point at the local quick start until Docker has been run.

**Check:** a person with only Node and Git, reading only the root README, reaches the app.

### R2. One install, one build (S; M including CI and Docker)

1. Add `modernized/package.json`, prototyped and working. Git already tracks it: `.gitignore` re-includes `/modernized/**/*.json`. A repository-root `package.json` would instead need `!/package.json` and `!/package-lock.json` added to `.gitignore`.
   ```json
   {
     "name": "lazylabel-web",
     "private": true,
     "engines": { "node": ">=22.13" },
     "workspaces": [
       "lazylabel/core/exporters",
       "lazylabel-reimagined/settings-schema",
       "lazylabel-reimagined/contracts",
       "lazylabel-reimagined/api",
       "lazylabel-reimagined/web"
     ],
     "scripts": {
       "prepare": "npm run build",
       "build": "npm run build --workspaces --if-present",
       "test": "npm test --workspaces --if-present",
       "start": "node lazylabel-reimagined/api/dist/src/cli.js",
       "doctor": "node scripts/doctor.mjs"
     }
   }
   ```
   npm runs the root package's `prepare` after a plain local `npm install`, so installing also builds. The member order in `workspaces` is the build order.
2. Run `npm install` in `modernized/` and commit `modernized/package-lock.json`. Delete the five nested `package-lock.json` files, which a workspace does not use.
3. **`.github/workflows/modernized.yml`, `services` job:**
   - `working-directory: modernized`;
   - one `npm ci`;
   - `npm run typecheck -w <package>` and `npm test -w <package>`;
   - delete the "Install the linked libraries" step.
4. **`deploy/api.Dockerfile` and `web.Dockerfile`:**
   - copy `modernized/package.json`, the lockfile and the members;
   - one `npm ci`, which builds through `prepare`;
   - `npm prune --omit=dev` at the root.

**Check:** a fresh clone, then `cd modernized && npm install`, builds all five packages; `npm test` runs all five suites.

### R3. The API serves the built web app (S)

Take the prototype in `prototype-one-command.diff`:
- **`api/src/http/staticWeb.ts`:** serves `/`, `/index.html`, `/assets/*` and top-level static files from the web build, with a path-traversal check. Fingerprinted assets are cached as immutable; `index.html` is not cached.
- **`api/src/server.ts`:** `/api/*` is stripped to the existing routes, which is what the browser calls. The unprefixed routes keep working, so the dev proxy and nginx are unaffected.
- **`api/src/main.ts`:** `webRoot` comes from `LAZYLABEL_WEB_DIST`, or defaults to `../web/dist` beside the built API. The startup log prints the URL.

Add tests:
- `/` returns HTML when built;
- `/api/health` equals `/health`;
- `..` and `%2e%2e` are refused;
- the API alone still works when the web app is not built.

Update the comment in `vite.config.ts`. Later, in R10, the nginx container can go.

**Check:** `npm start "<folder>"`, then open `http://127.0.0.1:8787/` to see the app. The prototype did exactly this on port 18790.

### R4. A cross-platform CLI instead of environment-variable syntax (S)

Add `api/src/cli.ts`, compiled to `dist/src/cli.js`. It is the process entry. With no import guard,
the junction silent exit cannot happen.

```
lazylabel [folder] [--port 8787] [--host 127.0.0.1] [--db <file>|:memory:] [--inference <url>] [--no-open]
```

It:
- takes the folder as a positional argument, falling back to `LAZYLABEL_DATASET_ROOT`, and prints usage if neither is set. Every existing variable stays as an override.
- checks `process.versions.node >= 22.13` and prints the nodejs.org link instead of `ERR_UNKNOWN_BUILTIN_MODULE`.
- hides the SQLite `ExperimentalWarning`: `--disable-warning=ExperimentalWarning` in the `start` script, or a warning filter.
- turns EADDRINUSE into "Port 8787 is in use (is LazyLabel already running?). Use --port 8790."
- prints `LazyLabel is running at http://127.0.0.1:8787/ (Ctrl+C to stop)` and opens the browser with `start`, `open` or `xdg-open`, unless `--no-open` is given.

Add two shims beside `modernized/package.json`, so options also work in PowerShell, where npm drops
`--`:
- `lazylabel.cmd`: `@node "%~dp0lazylabel-reimagined\api\dist\src\cli.js" %*`
- `lazylabel`, for POSIX sh: `exec node "$(dirname "$0")/lazylabel-reimagined/api/dist/src/cli.js" "$@"`

**Check:** `npm start "C:\my images"` works in PowerShell, cmd and bash. `.\lazylabel "C:\my images" --port 9000` works in PowerShell. Both behaviours were verified with a stub script.

### R5. A per-user settings database by default (S; resolves the pending decision)

In `api/src/config.ts`, the default `databasePath` becomes
`path.join(os.homedir(), ".config", "lazylabel", "lazylabel-web.db")`. `main.ts` already creates the
directory.

Why this is safe and better:
- It matches the owner's own instance, and the PyQt6 app's config directory on every OS, which the API already reads for the one-time settings import.
- The store holds one `settings` table keyed by `user_id` (`sqliteMetadataStore.ts`), so nothing dataset-specific can mix across folders.
- It fixes three things: settings now follow the user; nothing is written into dataset folders, which may be read-only, network shares, or synced; and WAL stays off network filesystems.

Other steps:
- Keep `LAZYLABEL_DB` and `:memory:`, whose banner already works.
- On first start, if `<dataset>/.lazylabel/lazylabel.db` exists and the per-user database does not, import its settings once and say so in the log, the way the legacy import already works.
- Update the API README table.

**Check:** change a setting, open a different folder, and the setting is still there.

### R6. A reproducible AI environment (M)

**`modernized/lazylabel-reimagined/inference/pyproject.toml`:**
- Pin the validated versions: `torch==2.10.0` and `torchvision==0.25.0` in `ai`. Move them to a tested range when a newer pair has passed the live suites.
- Add a `server = ["opencv-python-headless"]` extra. The two-distribution conflict that kept OpenCV undeclared does not apply in the dedicated venv this path creates.
- Add uv's documented PyTorch pattern:
  ```toml
  [project.optional-dependencies]
  cpu   = ["torch==2.10.0", "torchvision==0.25.0"]
  cu128 = ["torch==2.10.0", "torchvision==0.25.0"]

  [tool.uv]
  conflicts = [[{ extra = "cpu" }, { extra = "cu128" }]]

  [tool.uv.sources]
  torch       = [{ index = "pytorch-cpu", extra = "cpu" }, { index = "pytorch-cu128", extra = "cu128" }]
  torchvision = [{ index = "pytorch-cpu", extra = "cpu" }, { index = "pytorch-cu128", extra = "cu128" }]
  sam-2       = { path = "vendor/sam_2-1.0-py3-none-any.whl" }

  [[tool.uv.index]]
  name = "pytorch-cpu"
  url = "https://download.pytorch.org/whl/cpu"
  explicit = true

  [[tool.uv.index]]
  name = "pytorch-cu128"
  url = "https://download.pytorch.org/whl/cu128"
  explicit = true
  ```
  On macOS, use `cpu`. If the CPU index lacks a macOS wheel, use the marker form from uv's PyTorch guide.

**The SAM-2 wheel:** build it once at `2b90b9f5` with `SAM2_BUILD_CUDA=0`. The result is pure Python and Apache-2.0.
- Commit it as `inference/vendor/sam_2-1.0-py3-none-any.whl`, with its SHA-256 and upstream LICENSE, and add a NOTICE entry.
- Keep the git URL in `project.dependencies` for pip users.
- This removes the need for git, the build, and the second PyTorch.

**Lock and wrap:**
- Run `uv lock` and commit `inference/uv.lock`.
- Add `modernized/scripts/ai-setup.mjs`, run as `npm run ai:setup`. It uses `cu128` when `nvidia-smi` reports CUDA 12.8 or later, and `cpu` otherwise. It runs `uv sync --project lazylabel-reimagined/inference --extra ai --extra server --extra <cpu|cu128>`, creating `inference/.venv`. If uv is missing, it prints uv's one-line installer.

**Check:** on a machine with only uv, `npm run ai:setup`, then `.venv` Python can `import torch, sam2, segment_anything, cv2`, `torch.__version__` starts with `2.10.0`, and `torch.cuda.is_available()` is True on NVIDIA.

**Done 2026-09-27** (`86d5b5a`): torch and torchvision pinned in `ai`, `cpu` and `cu128`, a `server` extra for OpenCV, uv's PyTorch pattern, and SAM 2 vendored as a 177,863-byte pure-Python wheel (SHA-256 86ee2715..., NOTICE entry). `inference/uv.lock` (uv 0.7.13) locks 60 packages: torch 2.10.0+cu128, +cpu, and the macOS CPU wheel. `npm run ai:setup` measured: exit 0, PyTorch 2.10.0+cu128 on the RTX 3080, a 4.61 GB environment and a 2.7 GiB torch download. CI checks `uv lock --locked`.

### R7. Models: an opt-in, verified fetch (M; runtime stays download-free)

**`inference/models/manifest.verified.json`:** the three verified entries from `MODEL_MANIFEST.md`, with correct `bytes`, plus a `url` for the two SAM files.

**The `lazylabel-models` console script,** in `lazylabel_inference/fetch.py`, standard library only:
- `list`;
- `fetch sam2.1-large [--dir DIR] [--yes]`, which:
  1. shows the size and asks first;
  2. downloads to `<file>.part`, resuming with HTTP Range;
  3. checks the size, then the SHA-256, then renames;
  4. merges the entry into `DIR/manifest.json`.
- A test asserts that no server module imports `fetch`, so SEC-03 (nothing at runtime) stays enforced.

**Defaults:**
- A per-user model directory: `%LOCALAPPDATA%\LazyLabel\models`, `~/Library/Application Support/LazyLabel/models`, or `${XDG_DATA_HOME:-~/.local/share}/lazylabel/models`. The CLI passes it as `LAZYLABEL_MODEL_DIR`. `--dir` reuses an existing folder, such as the PyQt6 app's.
- Recommend **SAM 2.1 large alone** (898 MB) as the default download. It does single-image prompts and propagation.

**MobileNetV3.** The owner downloads torchvision's published `mobilenet_v3_small-047dcff4.pth` from `download.pytorch.org/models/`, hashes it locally per `MODEL_MANIFEST.md`'s rule, and adds it. The embedder loader then accepts that state dict, dropping the classifier keys it replaces with an identity anyway. That gives Find Archetypes a real, stable source.

**The wrapper:** `npm run ai:models sam2.1-large`.

**Check:** a fresh machine goes from nothing to `/health` 200, with SAM 2.1 large usable, with no hand-written JSON.

**Done 2026-09-27** (`fdcc489`): `models/manifest.verified.json`, `lazylabel-models list|fetch` (asks, `.part` with Range resume, size and SHA-256 before rename, merges `manifest.json`), a per-user default folder, and `npm run ai:models`, tested against a loopback server, with an AST test that no server module imports it. MobileNetV3 got its URL on 2026-09-27 (`066d4d3`): torchvision's published file, hashed from a downloaded copy, whose tensors equal the desktop app's re-saved copy.

### R8. One command starts what is installed (S to M)

In `cli.ts`:
- If `inference/.venv` (or `LAZYLABEL_PYTHON`) exists and the model directory holds a `manifest.json`:
  - spawn `<venv python> -m lazylabel_inference.server` with the same `LAZYLABEL_DATASET_ROOT`, the model directory, and a free port;
  - set the API's inference URL;
  - prefix its log lines;
  - stop it on exit.
- Otherwise log "AI tools off: run `npm run ai:setup`".

In the web app's "AI unavailable" message, add the same instruction or a link.

In `inference/server.py`, catch `ConnectionAbortedError` and `BrokenPipeError` in `_write`, so a disconnect is one quiet line rather than tracebacks.

**Check:** `npm start "<folder>"` alone gives working SAM clicks once R6 and R7 have been run once.

**Done 2026-09-27** (`95dfc24`): `npm start` runs the inference service as its child on a free port from 8788, with `[ai]` lines, and stops it on exit; otherwise it names the missing command. The web shows "AI tools off: run npm run ai:setup". A client disconnect is one log line.

### R9. `npm run doctor` (S to M)

`modernized/scripts/doctor.mjs` reports OK or FAIL, with the exact fix command for each failure:
- the Node version, and that `node:sqlite` imports;
- the builds are present;
- the port is free;
- the folder is readable, and the settings location is writable.

When `inference/.venv` exists, it also runs `python -m lazylabel_inference.doctor`, a new module that reports:
- Python and torch versions, `torch.version.cuda`, and whether CUDA is available;
- the device name and the driver's CUDA version (from `nvidia-smi`);
- whether `cv2`, `sam2` and `segment_anything` import;
- whether the manifest parses;
- each checkpoint's presence and size, with `--full` hashing too.

**Done 2026-09-27** (`2d8d833`): `npm run doctor` plus `python -m lazylabel_inference.doctor [--full]`; CI's quick start runs it on three OSes.

### R10. Docker that has been run (M)

**Deferred.** The owner's decision, 2026-09-27: "Keep deferring."

1. **`deploy/compose.yaml`, `inference` service:** add `LAZYLABEL_DATASET_ROOT: /data` and `- ${DATASET_ROOT}:/data:ro`. Staging goes to a temp directory (`runner.py:185`), so read-only is enough. Bake `manifest.verified.json` into the image, with `LAZYLABEL_MODEL_MANIFEST` set, so users only drop the files into `MODEL_DIR`.
2. **Profiles:** `ai-cpu`, from `python:3.12-slim` with the `cpu` extra (small wheels, and it works on Macs), and `ai-gpu`, the current CUDA image.
3. **After R3:** one `app` image, the API serving the web app, published on `127.0.0.1:8787`. Drop the nginx image.
4. **CI:**
   - publish the images to `ghcr.io` on pushes to `main-web`, so users `docker compose pull` instead of building;
   - build the inference image on pushes that touch `inference/**` or `deploy/inference.Dockerfile` (a `paths` filter), because `schedule` and `workflow_dispatch` will not fire from a non-default branch.
5. **Run it once end to end,** and replace `deploy/README.md`'s warnings with what happened.

### R11. No prerequisites at all for manual annotation (M to L)

**A release workflow** runs a matrix on `windows-latest`, `macos-latest` and `ubuntu-latest`:
1. `npm ci`, then `npm prune --omit=dev`.
2. Add a portable Node, checked against nodejs.org's `SHASUMS256.txt`.
3. Add a launcher: `Start LazyLabel.cmd`, `.command` or `.sh`.
4. Zip it, at about 100 MB, and attach it to a GitHub Release. The `sharp` binaries are per platform, so it is one zip per OS and architecture.

**"Open Folder" in the web app,** so nobody types a path. This is a loopback-only folder-browser endpoint in the API, the same trust model as the desktop app (decision 3).

**An `npx lazylabel-web "<folder>"` package on npm** is the cheaper alternative, with Node as the only prerequisite. It is a new distribution channel, so it is the owner's call; decision 1 froze PyPI, not npm.

**A desktop wrapper** (Electron) is **L**, with signing and notarisation cost on every release. Defer it unless the zip proves insufficient. AI would remain an add-on in any case.

**Done 2026-09-27** (`d0db15f`, `e7109d6`): `.github/workflows/release.yml` builds `LazyLabel-web-<os>-<arch>.zip` on windows-latest (x64), macos-latest (arm64) and ubuntu-latest (x64) with `scripts/build-release.mjs`: `npm ci` and `npm prune --omit=dev` in a copy of `modernized/`, nodejs.org's Node checked against `SHASUMS256.txt`, only the packages the API loads (workspace links made real folders), a launcher (`Start LazyLabel.cmd`, `Start LazyLabel.command`, `start-lazylabel.sh`) and a `.sha256`. `scripts/release-smoke.mjs` unzips each zip and starts it through its launcher before upload. A `web-v*` tag on a main-web commit builds and proves everything and creates a Release, as a DRAFT (see below), with `--latest=false`, so the desktop app keeps Latest; a push to main-web that touches the tooling builds the zips unpublished; `workflow_dispatch` fires only once the file is on the default branch. **"Open Folder" is in the app since 2026-09-29** (`a4b3e34`, `9f9f181`, `ce6c8c2`, `4ca0377`), by the owner's words that day: "when starting the launch.cmd it asked me for a folder for images, why is that a part of the launch? in the gui the user should be able to select a folder to load". Until then the launcher showed the system's folder dialog (`--choose-folder`) before the server started, or asked in its window. Now the launchers ask nothing: LazyLabel starts with no folder open and opens the browser, and the file panel's **Open Image Folder**, legacy's button (right_panel.py:112-114), opens one through `POST /api/folder`, which either has the API show the system's folder dialog, "Select Image Folder" as legacy titles it, on the computer it runs on (`LAZYLABEL_FOLDER_CHOICE=dialog`, which the launcher sets on a desktop), or opens a typed path (`path`, where there is no desktop, as over SSH). A deployment's folder stays fixed (`fixed`, the default), so the Docker image cannot be pointed at another folder from a browser. Being an endpoint, it refuses what another web page could send: a body that is not JSON (415), which a cross-site page cannot send without a CORS preflight the API never grants, and a request from another origin (403); the API still listens on loopback by default, as decision 3 has it. The image open is saved, or asked about, before the folder changes; the inference service is pointed at the new folder (`POST /dataset-root`); a folder dropped on the launcher, or named after `npm start`, still opens at start. The smoke test starts the launcher with no folder and opens its images through the endpoint (CONTROL_PARITY.md CP-76). Measured on Windows with Node 22.17.0: **39.7 MB zipped**, 102.0 MB in 213 files unzipped (Node 82 MB, the app 21 MB, mostly sharp's libvips). Unzipped outside the repository, its launcher served the app, `/api/health` (`"dataset":"ok"`), six copied images and a sharp thumbnail on port 18800, and stopped. Not run here: the macOS and Linux zips (CI builds and starts them), and a click through the dialog. The zip carries no inference package, so its banner reads "AI tools: off: not in this download (README.txt says how to add them)", not `npm run ai:setup`, which a zip user has no npm to run. Open: macOS signing and notarisation (until then, Open Anyway once; the launcher then clears the folder's quarantine mark), Windows code signing, and the first `web-v` tag.

### R12. Small robustness and trust fixes (S)

- **`engines`:** `>=22.13` in all five `package.json` files.
- **The entry guard:** if `main.ts` keeps its guard, compare `realpathSync(process.argv[1])` with `fileURLToPath(import.meta.url)`. R4 removes the need.
- **A friendly EADDRINUSE message.**
- **Get CI green.** The differential job fails on every push, and a red badge is the first thing an evaluator sees. **Done 2026-09-26** (`c2dd71a`): the job lacked libEGL and libGL, so importing legacy's loaders failed on QtGui; every job has passed since. Still open: bump the actions warned about Node 20.

### R13. The AI tools with nothing to install (M)

The owner, 2026-09-28, choosing it over an "Add AI tools" download step: "fine build without sam1,
getting sam2.1 + the embeddings model and to have it all working without a python environment
would be a huge unlock". R11's zip covers manual annotation only; AI needed Git, Node, uv and three
commands (R6 to R8).

**Built 2026-09-28.** `node scripts/build-release.mjs --ai <cu128|cpu>` builds
`LazyLabel-web-ai-<os>-<arch>`: R11's zip plus
- **CPython 3.12.11**, the python-build-standalone build uv installs, which runs from any folder,
  copied into `python/`, with `inference/uv.lock`'s packages installed straight into it by
  `uv sync` (the portable Python as uv's project environment): PyTorch 2.10.0, SAM 1 and SAM 2, the
  same set `npm run ai:setup` installs, and nothing for tests;
- **the inference service's code** where `aiPlan` runs it from, `app/lazylabel-reimagined/inference/src`;
- **SAM 2.1 large and MobileNetV3 small**, fetched and verified by the service's own
  `lazylabel-models`, which writes the `manifest.json` the service reads. SAM 1 is left out, by the
  owner's choice (2.6 GB on its own);
- **THIRD-PARTY-NOTICES.txt** and SAM 2's licences.

PyTorch's CUDA build on Windows and Linux, which falls back to the processor where there is no NVIDIA
card, and its CPU build on macOS, which has no CUDA.

**Parts.** GitHub takes no release file of 2 GiB, and PyTorch's CUDA build alone is 2.9 GB, so
`scripts/pack_parts.py` splits the bundle. Part 1 holds everything the app and the unpacking need:
Node, the app, Python and its standard library, every small file. PyTorch's large libraries and the
checkpoints go first-fit, largest first, into the room left, measured compressed. Every part is a
whole zip under the same top folder, its last entry a mark, `.lazylabel/part-<i>-of-<n>`; part 1
also carries `bundle.json`, which names the parts. A person downloads every part into one folder,
unzips part 1 and starts it. `api/src/bundle.ts` finds the other parts in the bundle's folder, the
three above it or Downloads (Explorer's "Extract All" puts the bundle two folders below the zip),
and has the bundle's own Python unpack them into place: every file's CRC checked, written beside
its place and moved in, an entry that would land outside the folder refused, and the mark last, so
a part stopped half-way is unpacked again next time. Until every part is in, the app runs without
AI and names the files and the folder they go in. The bundle's Python runs with PYTHONHOME,
PYTHONPATH and the user's site folder kept out.

**Measured 2026-09-28,** Windows here and all three on CI's runners (`3afda90`):

| Bundle | PyTorch | Unpacked | Download |
|---|---|---|---|
| `windows-x64` | CUDA 12.8 | 6.0 GB, 25,462 files | 2 parts: 2.00 and 1.93 GB |
| `macos-arm64` | CPU | 1.8 GB, 24,614 files | 1 zip: 1.12 GB |
| `linux-x64` | CUDA 12.8 | 8.9 GB, 28,041 files | 3 parts: 2.00, 2.00 and 1.28 GB |

Every part is at least 7% under GitHub's limit. The largest single file is Windows' `torch_cuda.dll`,
908 MB. Linux is the largest because its CUDA libraries come as separate packages, NCCL among them.

**Proof.** `scripts/release-smoke.mjs --ai` takes the bundle the way a person gets it: part 1
unzipped into a scratch folder, the other parts left beside it, the launcher started with a folder
of generated images. The launcher must unpack the parts and start the AI tools; then, through the
app, SAM 2.1 must segment a bright square from one click in its middle, and Find Archetypes, which
runs the embedder, must answer. `.github/workflows/release.yml`'s `ai-zip` job runs it on Windows,
macOS and Linux, on the processor, since a runner has no GPU, and a `web-v*` tag puts the parts
in the draft Release beside R11's zips. All three passed on 2026-09-28 (`3afda90`); on Windows here the same test ran on the
RTX 3080, where one click segmented the square (box [28,20,68,52], score 0.990) in 15 s with the
model's load.

**What the first CI run found.** The macOS and Linux bundles went out without PyTorch, at 0.9 GB:
uv's CPython has `bin/python3` as a link, and Node's `cpSync` keeps a link inside a tree as a link to
the original file, `dereference` or not. The bundle's "Python" was uv's own, so `uv sync` installed
into uv's store and the build's import check passed from there. The copy is `cp -RL` now, and the
build stops unless the copy reports its own folder as its prefix and PyTorch imports from inside
it. A failed smoke test also reports, as a public annotation, what the unzipped bundle holds: a job's
log needs a signed-in account to read.

**Open:** macOS signing and notarisation, as for R11; the macOS bundle runs on the processor.

**NVIDIA's files, read 2026-10-08** (the owner asked before publishing: "why don't you read their terms real quick and get back to me"; then "fix first then publish"). The Windows and Linux bundles carry NVIDIA's CUDA libraries, which NVIDIA's own agreements govern. The CUDA Toolkit agreement lets an application redistribute the files its Attachment A lists, unmodified, inside an application that has functionality of its own and alone uses them, on terms consistent with NVIDIA's; cuDNN, cuSPARSELt and NVSHMEM have agreements of their own that cover their runtime files; NCCL is open source; none requires NVIDIA's licence text to travel with the files. Each file in the bundles was checked against those lists, and PyTorch's CUDA packages carry a few that are on none of them: CUPTI's profiling helpers (`nvperf_host`, `nvperf_target`, `libcheckpoint`, `libpcsamplingutil`), cuSOLVER's multi-GPU library (`cusolverMg`), the header files in each NVIDIA package's `include` folder (the agreement names some headers and not these, and nothing reads them at run time) and, on Linux, Triton, which bundles NVIDIA's developer tools (`ptxas`, `cuobjdump`, `nvdisasm`). LazyLabel uses none of them, so `build-release.mjs` leaves them out (`settleNvidiaFiles`, the rules in `scripts/nvidia-files.mjs`, pinned to real file names by `api/test/nvidiaFiles.test.ts`) and stops if an NVIDIA file turns up that no agreement read covers; `release-smoke.mjs` checks the finished bundle. cuBLAS, cuDNN, cuSOLVER, cuFFT, cuRAND, cuSPARSE, NVRTC and half-precision attention ran on the RTX 3080 without them. Kept although not named: the "alt" builds of NVRTC, the listed library in an alternate build. One reading to be aware of: NVIDIA's agreements speak of applications "for use in systems with NVIDIA GPUs", and the bundle also runs on a processor alone, where the files sit unused; PyTorch's own downloads are in the same position. `THIRD-PARTY-NOTICES.txt` named a licence folder that Windows does not have, since PyTorch's Windows build carries the files inside its own folder with no NVIDIA licence beside them; it now says where each file is and which agreement governs it, with NVIDIA's addresses. A reading of the text, not legal advice.

**Releasing.** A `web-v*` tag on a main-web commit runs the whole workflow, and its `publish` job creates the Release as a DRAFT, `--latest=false`, holding every zip, every AI part and every `.sha256` (18 files, about ten gigabytes, none over GitHub's 2 GiB). The job names what it uploaded in an annotation, which anyone can read; the owner looks at the draft, downloads a part to try, and publishes it. A draft because that step had never run, and a public release that stopped half-way would show half the files to everyone. A tag on any commit that is not on main-web publishes nothing.

**Released again 2026-10-10: `web-v1.0.1`**, from `11e3b91`: the fix for Load model before a folder is open. Its release files were run through the whole loop on Windows, Linux (WSL) and a macOS arm64 runner before it was published, and the smoke test now presses Load model before it opens a folder.

**Released 2026-10-08: `web-v1.0.0`**, from `3ea5300`, the owner's "fix first then publish". Three tagged builds: the first (`4eaab7f`) was deleted before anyone saw it, to take out the NVIDIA files above; the second stopped on the Linux bundle, because its new guard met `libnvblas.so.12`, which NVIDIA's list does name and the rules had not; the third passed on all three systems, six downloads, 18 files, 10.07 GB. Two things the tags taught: the plain macOS zip waited for a runner for fifteen minutes and was cancelled, because GitHub's macOS arm64 runners are short of capacity (`gh run rerun <run> --job <id>` runs just that job and the publish after it); and pushing the branch and the tag together starts two runs, which compete for those runners, so the branch run is cancelled. The draft was published with the REST API and `make_latest=false`: a publish defaults to making the release the repository's Latest, and Latest stays the desktop app's v2.0.8. Each upload was compared with its `.sha256` through the digest GitHub computes, and the published release was read without signing in: the page, the file list, and the first bytes of every zip.

### Which of these gets a non-technical annotator labelling fastest?

- **R1 to R5** make it two commands after installing Node and Git: `npm install`, then `npm start "<folder>"`. The browser opens by itself.
- **R11** removes even those: download, unzip, double-click, Open Folder.
- **R13** does the same with the AI tools: download the parts, unzip part 1, double-click.
- For AI, **R6, R7 and R8** make it three commands with one confirmation prompt.

### Which make the fewest assumptions about the machine?

From fewest assumptions to most:
1. **R11's zip, and R13's with the AI tools:** a browser only, per OS and architecture; for the AI
   at speed, an NVIDIA driver.
2. **npx:** Node only.
3. **Clone and npm:** Git and Node.
4. **The uv AI add-on:** uv, plus an NVIDIA driver for speed.
5. **Docker:** Docker Engine or Desktop, virtualisation or WSL 2, often admin rights, and the NVIDIA Container Toolkit for a GPU.

Docker assumes the most, but for a Linux server it removes all the Node, Python and CUDA work, so it
is the right tool for teams, not for laptops.

---

## 7. The ideal first run, as literal commands

### 7.1 Manual annotation: Windows PowerShell, macOS and Linux alike (after R1 to R5)

Prerequisites: Git, and Node.js 22 LTS (22.13 or later) or 24 LTS.

```
git clone -b main-web https://github.com/dnzckn/LazyLabel.git
cd LazyLabel/modernized
npm install
npm start
```

`npm install` fetches about 46 MB, installs 244 packages (128 MB) and builds all five packages in
under a minute. The prototype took 15 s to install with a warm cache and 24 s to build. `npm start`
prints:
```
LazyLabel is running at http://127.0.0.1:8787/ (Ctrl+C to stop)
```
and opens the browser, where **Open Image Folder** chooses the folder of images (since 2026-09-29;
`npm start "C:\Users\me\Pictures\my-dataset"` still opens one at start). Settings live in `~/.config/lazylabel/lazylabel-web.db`. Nothing is written
into the dataset folder except the annotation files you save.

If anything fails: `npm run doctor`.

### 7.2 Adding the AI tools (opt-in, after R6 to R8)

Prerequisites: uv, and an NVIDIA driver whose `nvidia-smi` shows CUDA 12.8 or later (for GPU speed;
otherwise it is CPU).

```
npm run ai:setup
npm run ai:models sam2.1-large
npm start
```

- `npm run ai:setup` runs `uv sync` with the `cu128` or `cpu` extra from the lockfile: torch 2.10.0 and SAM 2.
- `npm run ai:models sam2.1-large` asks "Download 898 MB from dl.fbaipublicfiles.com?", verifies the SHA-256 and writes `manifest.json`.
- `npm start` now also starts the inference service, and the AI tool works on the first click.

### 7.3 Zero-install (after R11)

Download `LazyLabel-web-<os>-<arch>.zip` from the newest `web-v*` GitHub Release, unzip it and
double-click **Start LazyLabel**. The browser opens by itself; click **Open Image Folder** and
choose the folder of images (since 2026-09-29; the launcher asked for it before then).

With the AI tools (R13): download every part of `LazyLabel-web-ai-<os>-<arch>` into one folder,
unzip part 1 only, and do the same. The first start unpacks the other parts, then starts the AI
tools with the app.

### 7.4 A shared server (after R10)

```
cd LazyLabel/modernized/lazylabel-reimagined/deploy
cp example.env .env                       # set DATASET_ROOT (and MODEL_DIR for AI)
docker compose --profile ai-gpu up -d     # or --profile ai-cpu, or no profile for manual annotation only
```

This pulls prebuilt images from `ghcr.io`. Open `http://127.0.0.1:8787`.

---

### Appendix: evidence in this folder

| File | What |
|---|---|
| `fresh/` | A new clone at `359738f`, used for the re-check. The `ad35869` walkthrough clone it replaces had a damaged `.git`. Its `node_modules` and `dist` were deleted afterwards. |
| `fresh-ws/` | The workspace and one-port prototype clone. `node_modules` and `dist` deleted; the prototype files kept (`modernized/package.json`, `package-lock.json`, `api/src/http/staticWeb.ts`, the edited `server.ts` and `main.ts`). |
| `prototype-one-command.diff` | The full prototype: `modernized/package.json`, `api/src/http/staticWeb.ts`, and the `server.ts` and `main.ts` edits. **Use this copy.** At 04:04:33 on 2026-09-26, something other than this evaluation removed the npm `@lazylabel` links and a git pack index in the `ad35869` clones. That left `fresh-ws/.git` incomplete and is why `fresh/` was re-cloned. The `fresh-ws` working tree and every file listed here are intact, and all the `ad35869` measurements had finished before then. |
| `api-*.log`, `web-*.log`, `inference-*.log`, `junction.log` | Raw output of the runs quoted above |
| `py/ai-requirements.in`, `py/resolved-*.txt` | The dependency dry-run inputs and resolutions per platform |
| `make_images.mjs`, `images/`, `images2/` | The test-image generator (standard-library Node) and the two test folders. The `.lazylabel/` settings databases the API created are inside the folders. |
