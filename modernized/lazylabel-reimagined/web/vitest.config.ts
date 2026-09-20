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
    /*
     * One jsdom per WORKER rather than one per file, keeping per-file isolation.
     *
     * This is not a speed tweak, it is a correctness one. Building a fresh jsdom for each of fifty
     * files was two thirds of the run's wall-clock and left workers badly contended -- enough that
     * an async assertion waiting FIVE SECONDS for a resolved promise timed out on roughly one run
     * in three. The flake was in the AI flow test, which does the most awaiting, but nothing about
     * it was specific to that file: any test waiting on a promise chain could lose the same race.
     *
     * Raising the timeout again was the alternative and it treats the symptom. Tests should fail
     * because the code is wrong.
     */
    pool: "vmThreads",
    /*
     * Longer than `asyncUtilTimeout` in test/setup.ts, and that relationship is the point.
     *
     * With both at five seconds, a waitFor that was going to fail consumed the whole test budget
     * first, so vitest killed the test with "timed out in 5000ms" and the assertion never got to
     * say what it had actually been waiting for. Every diagnosis had to start by widening this.
     */
    testTimeout: 20_000,
  },
});
