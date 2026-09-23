# The Node API: reads and writes annotation sidecars, owns the image pipeline, proxies inference.
#
# NEVER BUILT. Docker is not installed on the machine this was written on, so every line here is
# reasoned rather than observed -- except the build stage's shell steps, which were run on a clean
# export of the repository and the result started and answered /health (2026-09-23). `deploy/README.md` says what to check first and why that matters
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

# THE LIBRARIES FIRST, installed AND built. Found 2026-09-23 by running these steps on a clean export
# of the repository -- Docker is still not available here, so that is as close as it gets. The first
# version missed two things, and either one alone stopped this image:
#   - contracts imports the format library, and a library's imports resolve from ITS folder, so
#     without contracts' own install `tsc` could not find it and `npm run build` below failed; and
#   - at run time Node resolves `@lazylabel/*` to each library's `dist`, which nothing built, so a
#     build that had succeeded would still have died with ERR_MODULE_NOT_FOUND on start.
# In dependency order, because contracts builds against the format library.
RUN for lib in lazylabel/core/exporters lazylabel-reimagined/settings-schema lazylabel-reimagined/contracts; do       (cd "/src/$lib" && npm ci --no-audit --no-fund && npm run build) || exit 1;     done

WORKDIR /src/lazylabel-reimagined/api
RUN npm install --no-audit --no-fund && npm run build

# The compilers and test runners out of every package before the tree is copied: the runtime needs
# the libraries' dist and the API's production dependencies, not the tooling that built them.
RUN for pkg in lazylabel/core/exporters lazylabel-reimagined/settings-schema lazylabel-reimagined/contracts lazylabel-reimagined/api; do       (cd "/src/$pkg" && npm prune --omit=dev --no-audit --no-fund) || exit 1;     done

# sharp ships platform-specific binaries, so the runtime image reuses the build's node_modules
# rather than reinstalling and risking a different set.
FROM node:22-bookworm-slim

# NOT ROOT. This process reads and writes a user's annotation files. Running it as root would make
# a path-traversal bug it does not have today into a bug against the whole filesystem rather than
# against one mounted folder.
USER node

# THE WHOLE TREE, not the API's folder alone. npm links a `file:` dependency as a symbolic link to the
# library's own folder, so copying only `api/node_modules`, as the first version did, copied three
# links to folders this image did not have. Keeping the layout keeps the links pointing somewhere.
COPY --from=build --chown=node:node /src /app
WORKDIR /app/lazylabel-reimagined/api

ENV NODE_ENV=production
EXPOSE 8787

# Exec form, so the process is PID 1 and `docker stop` reaches it as SIGTERM rather than having a
# shell swallow it.
# `dist/src/main.js`, not `dist/main.js`: the build's rootDir is the package root so that
# `tools/` compiles alongside `src/`, which is what makes `npm run acceptance` runnable.
CMD ["node", "dist/src/main.js"]
