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

export const PLACEHELD = ["C3", "C8", "C10", "C11", "C12", "C14"] as const;
