/**
 * Placeholders for the capabilities the web app has not built.
 *
 * Phase 2's web-app scope is bootstrap, configuration, logging, and the settings and hotkey schema.
 * Everything a user would call "the app" is Phase 4 and later, and this is where that is visible
 * rather than implied.
 *
 * They are `test.todo` rather than failing tests, for the reason the API records: a permanently red
 * suite makes the CI gate meaningless. `coverage.test.ts` fails for real if this list and the
 * capability table disagree.
 */

import { describe, expect, it } from "vitest";

import { CAPABILITIES, capability } from "../../src/capabilities.js";
import { PLACEHELD } from "./placeheld.js";

describe("capabilities the web app has not built yet", () => {
  for (const id of PLACEHELD) {
    const entry = capability(id);
    it.todo(`${entry.id} [${entry.webPhase}] ${entry.summary} — ${entry.missing}`);
  }

  it("names a phase and what is missing for every pending capability", () => {
    for (const entry of CAPABILITIES.filter((item) => item.webStatus === "pending")) {
      expect(entry.webPhase, `${entry.id} has no phase`).toBeTruthy();
      expect(entry.missing, `${entry.id} does not say what is missing`).toBeTruthy();
    }
  });
});
