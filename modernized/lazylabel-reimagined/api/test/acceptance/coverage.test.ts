/**
 * The capability table and the acceptance suite must agree.
 *
 * This is the test that makes `test.todo` safe to use for unbuilt capabilities. Without it, the
 * failure mode is quiet and permanent: a capability marked "built" with nothing testing it, or a
 * pending one whose placeholder was deleted along with the work that was supposed to replace it.
 * Either way the table says one thing, the suite does another, and nobody finds out.
 *
 * It also checks the table against the specification, so a capability added to
 * `AI_NATIVE_SPEC.md` cannot go unnoticed here.
 */

import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CAPABILITIES } from "../../src/capabilities.js";
import { PLACEHELD } from "./placeheld.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEC = path.join(HERE, "..", "..", "..", "..", "..", "analysis", "lazylabel", "AI_NATIVE_SPEC.md");

describe("the capability table matches the acceptance suite", () => {
  it("holds a placeholder for exactly the pending capabilities", () => {
    const pending = CAPABILITIES.filter((entry) => entry.apiStatus === "pending").map((entry) => entry.id);
    expect([...PLACEHELD].sort()).toEqual([...pending].sort());
  });

  it("has an acceptance test file for every capability marked built", async () => {
    const files = await readdir(HERE);
    const built = CAPABILITIES.filter((entry) => entry.apiStatus === "built");

    expect(built.length, "nothing is marked built; the pilot proves nothing").toBeGreaterThan(0);
    for (const entry of built) {
      const prefix = `${entry.id.toLowerCase()}.`;
      expect(
        files.some((file) => file.startsWith(prefix) && file.endsWith(".test.ts")),
        `${entry.id} is marked built but has no ${prefix}*.test.ts`,
      ).toBe(true);
    }
  });

  it("covers every capability the specification lists", async () => {
    const spec = await readFile(SPEC, "utf-8");
    // The capability table's rows begin "| C1 | ...".
    const inSpec = [...spec.matchAll(/^\|\s*(C\d+)\s*\|/gm)].map((match) => match[1]!);

    expect(inSpec.length).toBeGreaterThan(0);
    expect(CAPABILITIES.map((entry) => entry.id).sort(byNumber)).toEqual([...new Set(inSpec)].sort(byNumber));
  });

  it("gives every capability a status that means something here", () => {
    for (const entry of CAPABILITIES) {
      expect(["built", "pending", "not-this-service"]).toContain(entry.apiStatus);
      if (entry.apiStatus === "not-this-service") {
        // "The API owes this nothing" is a claim worth being deliberate about: it is the one status
        // that produces neither a test nor a todo, so a mistake here is invisible.
        expect(entry.apiPhase, `${entry.id} is not-this-service but names a phase`).toBeUndefined();
      }
    }
  });
});

function byNumber(a: string, b: string): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}
