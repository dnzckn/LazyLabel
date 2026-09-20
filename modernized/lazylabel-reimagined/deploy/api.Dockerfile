# The Node API: reads and writes annotation sidecars, owns the image pipeline, proxies inference.
#
# NEVER BUILT. Docker is not installed on the machine this was written on, so every line here is
# reasoned rather than observed. `deploy/README.md` says what to check first and why that matters
# more than it sounds — a Dockerfile that has not been built is a plan, not a deployment.
#
# THE BUILD CONTEXT IS `modernized/`, NOT `modernized/lazylabel-reimagined/`, and that is not a
# detail: the API depends on `@lazylabel/annotation-formats` at `file:../../lazylabel/core/
# exporters`, which is a sibling of the rebuild rather than inside it. A context rooted at the
# rebuild cannot see it, and `COPY ../..` is not allowed — Docker refuses paths outside the
# context. The first draft of this file got that wrong.

# 22 is the floor `api/package.json` states, and it is a real floor rather than a preference: the
# metadata store uses `node:sqlite`, which does not exist before it.
FROM node:22-bookworm-slim AS build

WORKDIR /src

# Manifests first, so editing source does not re-resolve every dependency. The `file:` dependencies
# mean npm needs those packages on disk before it can link them, so they are copied whole rather
# than manifest-first — npm reads more than the manifest when linking a local path.
COPY lazylabel/core/exporters lazylabel/core/exporters
COPY lazylabel-reimagined/contracts lazylabel-reimagined/contracts
COPY lazylabel-reimagined/settings-schema lazylabel-reimagined/settings-schema
COPY lazylabel-reimagined/api lazylabel-reimagined/api

WORKDIR /src/lazylabel-reimagined/api
RUN npm install --no-audit --no-fund && npm run build

# sharp ships platform-specific binaries, so the runtime image reuses the build's node_modules
# rather than reinstalling and risking a different set.
FROM node:22-bookworm-slim

# NOT ROOT. This process reads and writes a user's annotation files. Running it as root would make
# a path-traversal bug it does not have today into a bug against the whole filesystem rather than
# against one mounted folder.
USER node
WORKDIR /app

COPY --from=build --chown=node:node /src/lazylabel-reimagined/api/dist dist
COPY --from=build --chown=node:node /src/lazylabel-reimagined/api/node_modules node_modules
COPY --from=build --chown=node:node /src/lazylabel-reimagined/api/package.json package.json

ENV NODE_ENV=production
EXPOSE 8787

# Exec form, so the process is PID 1 and `docker stop` reaches it as SIGTERM rather than having a
# shell swallow it.
# `dist/src/main.js`, not `dist/main.js`: the build's rootDir is the package root so that
# `tools/` compiles alongside `src/`, which is what makes `npm run acceptance` runnable.
CMD ["node", "dist/src/main.js"]
