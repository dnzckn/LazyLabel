# The Node API: reads and writes annotation sidecars, owns the image pipeline, proxies inference.
#
# BUILT BY CI, NEVER RUN. CI's "deployment images" job has built this image on every push to
# main-web since 2026-09-26; no container has ever been started from it. It was written on a machine
# with no Docker, and the build stage's shell steps were run by hand on a clean export of the
# repository, where the result started and answered /health (2026-09-23). `deploy/README.md` says
# what to check first and why that matters more than it sounds — an image that has not been run is
# a plan, not a deployment.
#
# THE BUILD CONTEXT IS `modernized/`, NOT `modernized/lazylabel-reimagined/`, and that is not a
# detail: `modernized/package.json` is the npm workspace that holds every JavaScript package, and
# the API depends on `@lazylabel/annotation-formats` at `lazylabel/core/exporters`, a sibling of the
# rebuild rather than inside it. A context rooted at the rebuild cannot see either, and
# `COPY ../..` is not allowed — Docker refuses paths outside the context. The first draft of this
# file got that wrong.

# 22.13 is the floor `api/package.json` states, and it is a real floor rather than a preference: the
# metadata store uses `node:sqlite`, which needs a flag before it. `22` is the newest 22 release.
FROM node:22-bookworm-slim AS build

WORKDIR /src

# THE WHOLE WORKSPACE: its manifest, its one lockfile, and every member it lists, the web app
# included, so what is installed is exactly the tree the lockfile describes. (`npm ci` does not
# refuse a missing member: tried on a clean export, it silently installed a smaller tree.)
COPY package.json package-lock.json ./
COPY lazylabel/core/exporters lazylabel/core/exporters
COPY lazylabel-reimagined/settings-schema lazylabel-reimagined/settings-schema
COPY lazylabel-reimagined/contracts lazylabel-reimagined/contracts
COPY lazylabel-reimagined/api lazylabel-reimagined/api
COPY lazylabel-reimagined/web lazylabel-reimagined/web

# ONE install, which also builds (DEPLOYABILITY.md R2): `npm ci` runs the workspace's `prepare`,
# which builds all five packages in dependency order. This replaced a loop of per-package installs
# and builds that had to be found by hand, twice, on a clean export: contracts imports the format
# library, and a library's imports resolve from ITS folder; and at run time Node resolves
# `@lazylabel/*` to each library's `dist`, so an unbuilt library is ERR_MODULE_NOT_FOUND on start.
RUN npm ci --no-audit --no-fund

# The compilers and test runners out, from every member at once, before the tree is copied: the
# runtime needs the libraries' dist and the API's production dependencies, not the tooling that
# built them.
RUN npm prune --omit=dev --no-audit --no-fund

# sharp ships platform-specific binaries, so the runtime image reuses the build's node_modules
# rather than reinstalling and risking a different set.
FROM node:22-bookworm-slim

# NOT ROOT. This process reads and writes a user's annotation files. Running it as root would make
# a path-traversal bug it does not have today into a bug against the whole filesystem rather than
# against one mounted folder.
USER node

# THE WHOLE TREE, not the API's folder alone. npm links each workspace member into the root
# `node_modules` as a symbolic link to the member's own folder, so copying only `node_modules`
# would copy links to folders this image did not have -- which the first version did, per package.
# Keeping the layout keeps the links pointing somewhere.
COPY --from=build --chown=node:node /src /app
WORKDIR /app/lazylabel-reimagined/api

ENV NODE_ENV=production
EXPOSE 8787

# Exec form, so the process is PID 1 and `docker stop` reaches it as SIGTERM rather than having a
# shell swallow it.
# `dist/src/main.js`, not `dist/main.js`: the build's rootDir is the package root so that
# `tools/` compiles alongside `src/`, which is what makes `npm run acceptance` runnable.
CMD ["node", "dist/src/main.js"]
