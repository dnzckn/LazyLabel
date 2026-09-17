import { defineConfig } from "vitest/config";

// A separate vitest.config.ts (rather than test options inside vite.config.ts) is what the
// preflight smoke test proved works on this toolchain.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
