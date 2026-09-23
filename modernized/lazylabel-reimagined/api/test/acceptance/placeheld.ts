/**
 * Capabilities the acceptance suite holds a placeholder for.
 *
 * A plain module rather than part of `pending.test.ts`, because `coverage.test.ts` needs to read
 * this list, and importing one test file from another registers its tests a second time — which is
 * exactly what happened the first time this was written: eight placeholders reported as sixteen.
 *
 * `coverage.test.ts` asserts this equals the set `capabilities.ts` marks pending, so neither list
 * can drift from the other unnoticed.
 */

// Empty since 2026-09-23, when C8's tiles were built and drawn. Kept rather than deleted: the next
// capability someone plans without building belongs here, and `coverage.test.ts` will say so.
export const PLACEHELD: readonly string[] = [];
