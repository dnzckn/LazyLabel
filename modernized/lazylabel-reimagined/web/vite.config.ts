import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // loadEnv rather than process.env: it keeps this file free of Node globals, and it reads the
  // .env files a developer would expect Vite to read.
  const env = loadEnv(mode, process.cwd(), "");
  const target = env["LAZYLABEL_API"] ?? "http://127.0.0.1:8787";

  return {
    plugins: [react()],
    resolve: {
      // The workspace packages publish a "development" condition pointing at their TypeScript
      // source, so the dev server uses the source rather than a build output that may be stale.
      // tsconfig.json sets the matching customConditions for the typechecker.
      conditions: ["development"],
    },
    server: {
      // The API serves the built app itself, on its own port (`api/src/http/staticWeb.ts`); in
      // development Vite proxies to it, so the browser sees one origin either way and there is no
      // CORS configuration to get wrong.
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ""),
          // The API opens another folder only for its own page (POST /folder), which it knows by the
          // page's Origin matching the Host it was reached at, and `changeOrigin` makes that Host
          // the target's. So a request from this server's own page is passed on as the target's.
          configure: (proxy) => {
            proxy.on("proxyReq", (outgoing, incoming) => {
              const origin = incoming.headers.origin;
              if (origin !== undefined && URL.canParse(origin) && new URL(origin).host === incoming.headers.host) {
                outgoing.setHeader("origin", new URL(target).origin);
              }
            });
          },
        },
      },
    },
  };
});
