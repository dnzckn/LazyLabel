import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ["development"],
  },
  test: {
    environment: "jsdom",
    // Fills jsdom's PointerEvent gap; see test/setup.ts for why that is a shim rather than a
    // change of API in the components.
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
