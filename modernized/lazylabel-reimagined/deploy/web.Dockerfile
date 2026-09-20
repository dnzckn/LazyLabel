# The browser app, built to static files and served by nginx.
#
# NEVER BUILT. See `deploy/README.md`.
#
# Context is `modernized/`, for the same reason as the API: the web app depends on the exporters
# package, which lives outside the rebuild directory.

FROM node:22-bookworm-slim AS build

WORKDIR /src

COPY lazylabel/core/exporters lazylabel/core/exporters
COPY lazylabel-reimagined/contracts lazylabel-reimagined/contracts
COPY lazylabel-reimagined/settings-schema lazylabel-reimagined/settings-schema
COPY lazylabel-reimagined/web lazylabel-reimagined/web

# NO API ADDRESS IS BAKED IN, and that is deliberate. The app defaults its base to `/api`
# (`web/src/main.tsx`), a same-origin relative path, and `nginx.conf` proxies that to the api
# service. Compiling an absolute URL in would mean rebuilding the image to move the deployment,
# and would need CORS on an API that has none and needs none.
#
# `VITE_LAZYLABEL_API` still exists for anyone who genuinely wants a separate origin. It is not
# set here.
WORKDIR /src/lazylabel-reimagined/web
RUN npm install --no-audit --no-fund && npm run build

FROM nginx:1.27-alpine

COPY --from=build /src/lazylabel-reimagined/web/dist /usr/share/nginx/html
# Replaces the default server block: this one also proxies /api, which is what makes the app and
# its API one origin.
COPY lazylabel-reimagined/deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
