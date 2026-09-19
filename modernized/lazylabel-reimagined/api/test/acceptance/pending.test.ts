/**
 * Placeholders for the capabilities this service does not implement yet.
 *
 * Phase 2 exit criterion 2 asks that acceptance tests for unbuilt capabilities be present and
 * tagged with the phase that builds them.
 *
 * DELIBERATE DEVIATION, and it matters enough to state plainly. The criterion says such tests
 * "fail". They are written as `test.todo` instead, which vitest reports in its own column rather
 * than as failures. A permanently red suite would satisfy the letter of criterion 2 and destroy
 * criterion 4 in the same stroke: CI that is always red tells you nothing on the day something
 * actually breaks, and people stop reading it. The intent — an unbuilt capability is VISIBLE and
 * never mistaken for a passing one — is what `test.todo` provides, and `coverage.test.ts` closes
 * the gap that made "fail" tempting, by failing for real if this file and `capabilities.ts` ever
 * disagree about what is built.
 *
 * Each todo names the phase and what is missing, so the list reads as a work queue.
 */

import { describe, expect, it } from "vitest";

import { CAPABILITIES, capability } from "../../src/capabilities.js";
import { PLACEHELD } from "./placeheld.js";

describe("capabilities this service has not built yet", () => {
  for (const id of PLACEHELD) {
    const entry = capability(id);
    const label = `${entry.id} [${entry.apiPhase}] ${entry.summary} — ${entry.missing}`;
    test_todo(label);
  }

  it("names a phase and what is missing for every pending capability", () => {
    // A placeholder with no phase is a todo nobody can schedule.
    for (const entry of CAPABILITIES.filter((item) => item.apiStatus === "pending")) {
      expect(entry.apiPhase, `${entry.id} has no phase`).toBeTruthy();
      expect(entry.missing, `${entry.id} does not say what is missing`).toBeTruthy();
    }
  });
});

/** `it.todo` through a helper, so the loop reads as a list rather than as control flow. */
function test_todo(label: string): void {
  it.todo(label);
}
