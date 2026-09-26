# The browser app, built to static files and served by nginx.
#
# BUILT BY CI, NEVER RUN: built on every push to main-web since 2026-09-26, never started. See
# `deploy/README.md`.
#
# Context is `modernized/`, for the same reason as the API: `modernized/package.json` is the npm
# workspace, and the web app depends on the exporters package, which lives outside the rebuild
# directory.

FROM node:22-bookworm-slim AS build

WORKDIR /src

# The whole workspace, as in the API's image: its manifest, its one lockfile and every member.
COPY package.json package-lock.json ./
COPY lazylabel/core/exporters lazylabel/core/exporters
COPY lazylabel-reimagined/settings-schema lazylabel-reimagined/settings-schema
COPY lazylabel-reimagined/contracts lazylabel-reimagined/contracts
COPY lazylabel-reimagined/api lazylabel-reimagined/api
COPY lazylabel-reimagined/web lazylabel-reimagined/web

# NO API ADDRESS IS BAKED IN, and that is deliberate. The app defaults its base to `/api`
# (`web/src/main.tsx`), a same-origin relative path, and `nginx.conf` proxies that to the api
# service. Compiling an absolute URL in would mean rebuilding the image to move the deployment,
# and would need CORS on an API that has none and needs none.
#
# `VITE_LAZYLABEL_API` still exists for anyone who genuinely wants a separate origin. It is not
# set here.
#
# ONE install, which also builds: `npm ci` runs the workspace's `prepare`, which builds every
# package in dependency order, this app last. It replaced per-library installs that had to be
# found on a clean export (2026-09-23): contracts imports the format library, and a library's
# imports resolve from ITS folder, so without them the app's typecheck failed.
RUN npm ci --no-audit --no-fund

FROM nginx:1.27-alpine

COPY --from=build /src/lazylabel-reimagined/web/dist /usr/share/nginx/html
# Replaces the default server block: this one also proxies /api, which is what makes the app and
# its API one origin.
COPY lazylabel-reimagined/deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
