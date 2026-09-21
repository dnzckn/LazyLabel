/**
 * Does any test in this repository mention this rule?
 *
 * The settings guard asked "does anything read this key", the reach guard asked "does anything
 * call this function", and between them they found twenty-six things that were built and could not
 * be used. This asks the third version of the question, of the list that matters most: the brief's
 * §5 says the P0 rules -- money, regulatory, data integrity -- must be proven equivalent before
 * any phase ships.
 *
 * WHAT THIS CHECKS IS TRACEABILITY, NOT CORRECTNESS. A rule named in a test may still be tested
 * badly. But a rule named in NO test cannot be audited at all: a reviewer asking "where is
 * RULE-058 proven?" has nowhere to look, and the honest answers -- "it is covered by a test that
 * does not say so" and "it is not covered" -- are indistinguishable. That ambiguity is what this
 * removes.
 *
 * A rule this app DELIBERATELY does not implement is listed below with the decision that says so.
 * That is the same shape as the settings table's DROPPED, and for the same reason: a deliberate
 * divergence recorded is a decision, and an unrecorded one is a defect waiting to be found by a
 * user.
 */

import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..", "..", "..", "..", "..");
const RULES = path.join(REPO, "analysis", "lazylabel", "BUSINESS_RULES.md");

/** Every package's test tree. The formats package lives outside the app folder. */
const TEST_ROOTS = [
  path.join(REPO, "modernized", "lazylabel-reimagined"),
  path.join(REPO, "modernized", "lazylabel"),
];

/**
 * P0 rules this app deliberately does not implement, with the decision that says so.
 *
 * Each is legacy losing the user's work, and decision 7 is the single answer to all of them:
 * nothing is written or discarded without an explicit act. Copying them would mean copying the
 * defect -- which this project has refused to do once already, for `file_manager_show_name`.
 */
const DELIBERATELY_NOT_IMPLEMENTED: Readonly<Record<string, string>> = {
  "RULE-054":
    "decision 7: closing never saves, and this app never had anything to save on close -- "
    + "annotations are written by an explicit act, so there is no auto-save to suppress.",
  "RULE-059":
    "decision 7: auto-save on navigate is the mechanism that deletes a sidecar for an image whose "
    + "segments happen to be empty. `auto_save` is kept in the schema so a legacy settings file "
    + "round-trips, and is honoured by nothing.",
};

async function collectTests(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, insideTests: boolean): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
          continue;
        }
        await walk(full, insideTests || entry.name === "test" || entry.name === "tests");
        continue;
      }
      if (!insideTests) continue;
      if (/\.(ts|tsx|py)$/.test(entry.name)) found.push(full);
    }
  }

  await walk(root, false);
  return found;
}

describe("every P0 rule is traceable to a test", () => {
  it("names each one, or records why this app does not implement it", async () => {
    const markdown = await readFile(RULES, "utf-8");

    const p0 = [...markdown.matchAll(/^### (RULE-\d+):[\s\S]*?\*\*Priority:\*\*\s*(P\d)/gm)]
      .filter((match) => match[2] === "P0")
      .map((match) => match[1]!);

    expect(p0.length, "no P0 rules were found; the parse is wrong").toBeGreaterThan(20);

    const files = (await Promise.all(TEST_ROOTS.map(collectTests))).flat();
    expect(files.length, "no test files were found; the walk is wrong").toBeGreaterThan(50);

    const haystack = (await Promise.all(files.map((file) => readFile(file, "utf-8")))).join("\n");

    const untraceable = p0.filter(
      (rule) => !haystack.includes(rule) && DELIBERATELY_NOT_IMPLEMENTED[rule] === undefined,
    );

    expect(
      untraceable,
      `these P0 rules are named by no test and by no decision: ${untraceable.join(", ")}`,
    ).toEqual([]);
  });

  it("explains every deliberate divergence properly", () => {
    // A one-word excuse is how this list stops being read.
    for (const [rule, why] of Object.entries(DELIBERATELY_NOT_IMPLEMENTED)) {
      expect(why.length, `${rule}'s reason is too short to be one`).toBeGreaterThan(60);
      expect(why, `${rule} does not name the decision`).toMatch(/decision \d+/);
    }
  });
});
