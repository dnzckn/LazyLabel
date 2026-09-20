# Running LazyLabel yourself

```bash
cp example.env .env          # then point DATASET_ROOT at your folder of images
docker compose --env-file .env up --build
```

Then open <http://127.0.0.1:5173>.

For the AI tools, set `MODEL_DIR` and `LAZYLABEL_INFERENCE_URL` in `.env` and add `--profile ai`.

## None of this has been built

**Every file in this folder is reasoned, not observed.** Docker is not installed on the machine
they were written on, so no image here has been built and no container has been run. The
configuration they describe is checked — the environment variables are the ones the services
actually read, the API's `/api` default and the nginx proxy match, and the build contexts account
for the exporters package living outside the rebuild directory — but that is a different claim
from "this works".

A Dockerfile that has not been built is a plan. Treat it as one until someone builds it, and
expect the first attempt to need changes. The likely places, roughly in order:

1. **The inference image.** It installs PyTorch against a CUDA base, which is where container
   builds usually break. Check that `pip install .[ai]` resolves a CUDA-enabled torch rather than
   the CPU wheel — on some index configurations it silently picks CPU, and the service then starts,
   reports no accelerator, and runs at a tenth of the speed with nothing obviously wrong.
2. **`npm install` against `file:` dependencies inside a container.** The API and web images copy
   the local packages in and let npm link them. npm's handling of `file:` paths in a fresh
   container has been known to differ from a warm developer machine.
3. **sharp's platform binaries.** The API image reuses the build stage's `node_modules` rather than
   reinstalling, specifically so the binaries match — but the two stages must stay the same base
   image for that to hold.
4. **The nginx proxy path.** `proxy_pass http://api:8787/` with trailing slashes on both sides
   strips `/api` before forwarding. Getting that wrong 404s every route, and it is the kind of
   thing that looks right until you try it.

When it is built and run, the honest thing is to replace this section with what actually happened.

## The choices, and why

**One published port, on loopback.** Only the web container is published, only to `127.0.0.1`, and
it proxies `/api` to the API over the compose network. That follows the app's own default — it
asks for `/api`, a same-origin relative path — and it buys three things: no CORS on an API that has
none and needs none, no API address compiled into a static bundle that could not read one at
runtime anyway, and no unauthenticated service holding your files reachable from your network.

There is no authentication in this app **by design**. Decision 3 settled it as single-user
self-hosted: one trusted user per deployment, with a single local credential or whatever reverse
proxy you put in front. Putting that proxy there is a deliberate act. Binding `0.0.0.0` by default
would make skipping it the accident.

**The dataset is a bind mount, not a volume.** Decision 5 makes the annotation sidecars beside your
images the source of truth. A named volume would put them inside Docker, where you cannot copy,
diff or back them up without the daemon — which is exactly the property the desktop app had, and
that this rebuild is not allowed to give up. The SQLite database holds only settings, hotkeys,
projects and job records; losing it costs preferences, not annotations.

**The model directory is read-only.** Nothing in the inference service writes a checkpoint, and
SEC-03 forbids downloading one at runtime. A writable mount could only ever be a way for something
to go wrong.

**Neither service runs as root.** The API reads and writes a user's annotation files; running it
as root would turn a path-traversal bug it does not have today into a bug against the whole
filesystem rather than one mounted folder. The inference service loads model checkpoints, where
RULE-084's weights-only guard is a code-level defence and an unprivileged user is the one below it.

**No inference service is a supported deployment.** `LAZYLABEL_INFERENCE_URL` empty means there is
none, the AI routes answer 503 with a reason, and everything else works. A machine with no GPU
should run this app rather than refuse to start. The address is logged at startup either way, so
an operator learns the AI tools will be unavailable before a user clicks an object and finds out.

## What is not here

- **TLS.** Put a reverse proxy in front. Terminating TLS inside this compose file would mean
  managing certificates for a single-user application on loopback, which is machinery for nothing.
- **Any adapter beyond the two defaults.** Decision 5's storage ports exist so a hosted install
  with PostgreSQL or S3 nearby can point at them — but no such adapter is built until a deployment
  needs one, and this compose file is the local-directory shape the tool is for.
- **A healthcheck on the inference service.** It would need to know whether a checkpoint is loaded,
  which `/health` reports as a degraded-but-running state; a container marked unhealthy for a
  configuration fact would restart forever without fixing it.
