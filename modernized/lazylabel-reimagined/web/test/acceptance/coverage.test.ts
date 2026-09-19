/**
 * The capability table and the acceptance suite must agree.
 *
 * This is what makes `test.todo` safe for unbuilt capabilities: a capability marked built with
 * nothing testing it, or a pending one whose placeholder was deleted, fails here.
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
    const pending = CAPABILITIES.filter((entry) => entry.webStatus === "pending").map((entry) => entry.id);
    expect([...PLACEHELD].sort()).toEqual([...pending].sort());
  });

  it("has an acceptance test file for every capability marked built", async () => {
    const files = await readdir(HERE);
    const built = CAPABILITIES.filter((entry) => entry.webStatus === "built");

    expect(built.length, "nothing is marked built; the scaffold proves nothing").toBeGreaterThan(0);
    for (const entry of built) {
      const prefix = `${entry.id.toLowerCase()}.`;
      expect(
        files.some((file) => file.startsWith(prefix) && file.includes(".test.")),
        `${entry.id} is marked built but has no ${prefix}*.test file`,
      ).toBe(true);
    }
  });

  it("covers every capability the specification lists", async () => {
    const spec = await readFile(SPEC, "utf-8");
    const inSpec = [...spec.matchAll(/^\|\s*(C\d+)\s*\|/gm)].map((match) => match[1]!);

    expect(inSpec.length).toBeGreaterThan(0);
    expect(CAPABILITIES.map((entry) => entry.id).sort(byNumber)).toEqual([...new Set(inSpec)].sort(byNumber));
  });

  it("gives every capability a status that means something here", () => {
    for (const entry of CAPABILITIES) {
      expect(["built", "pending", "not-this-service"]).toContain(entry.webStatus);
      if (entry.webStatus === "not-this-service") {
        expect(entry.webPhase, `${entry.id} is not-this-service but names a phase`).toBeUndefined();
      }
    }
  });
});

function byNumber(a: string, b: string): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}
