import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The format library publishes a "development" condition pointing at its TypeScript source, so
    // tests run against the source rather than a build output that may be stale. tsconfig.json sets
    // the matching customConditions so the typechecker resolves it the same way.
    conditions: ["development"],
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
