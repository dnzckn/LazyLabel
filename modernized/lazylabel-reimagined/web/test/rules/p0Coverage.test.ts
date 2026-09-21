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
  "RULE-042":
    "decision 7's sibling for class names: legacy accepts any alias, including an empty one and a "
    + "duplicate, and the exporters then write files whose class names collide. This validates on "
    + "entry instead, so the divergence is deliberate and the rule is not copied.",
  "RULE-065":
    "decision 8: legacy's Sequence tab briefly OPENS an image outside the timeline, saves the "
    + "current frame without marking it saved, and bounces back. That is three surprising things "
    + "to implement faithfully; here the dataset browser and the timeline are separate controls "
    + "and opening an image from either does what it says.",
  "RULE-073":
    "a legacy DEFECT this app fixes rather than reproduces: legacy re-evaluates flags in the "
    + "engine and not on the timeline, so a Min Conf change moves which frames Save All writes "
    + "without moving which ones look flagged. Here one threshold drives both, so there is "
    + "nothing to keep in step -- see decision 7 on never losing work silently.",
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

/**
 * P1 rules naming a feature this app has NOT BUILT. Not divergences — work.
 *
 * Kept apart from the deliberate list above on purpose. "We chose not to" and "nobody has yet" are
 * different sentences, and a table that blurs them lets unbuilt work retire quietly as a decision.
 */
const NOT_BUILT_YET: Readonly<Record<string, string>> = {
  "RULE-077":
    "Trim. Cut removes the frames between two markers from the timeline and Keep removes "
    + "everything outside them, touching no files. Nothing in the sequence panel offers either. "
    + "Its blocker is gone: the propagated masks were keyed by frame POSITION, which a trim "
    + "shifts, so a cut would have re-attributed every mask to the wrong picture. They are keyed "
    + "by image key now, which is RULE-017's principle applied to that store.",
};

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

  it("names every P1 rule too, or records it as a divergence or as unbuilt", async () => {
    /*
     * The same question of the next list down, and it has already earned its place: asking it of
     * P1 found `resetForPropagation` unwired (RULE-075), a recorded seeding divergence (RULE-023),
     * and propagation feeding SAM frames of the wrong size (RULE-071).
     *
     * P1 is not P0 -- these are not money, regulatory or data-integrity rules -- so an entry here
     * may be work rather than a decision, and `NOT_BUILT_YET` is where that is said out loud.
     */
    const markdown = await readFile(RULES, "utf-8");

    const p1 = [...markdown.matchAll(/^### (RULE-\d+):[\s\S]*?\*\*Priority:\*\*\s*(P\d)/gm)]
      .filter((match) => match[2] === "P1")
      .map((match) => match[1]!);

    expect(p1.length, "no P1 rules were found; the parse is wrong").toBeGreaterThan(30);

    const files = (await Promise.all(TEST_ROOTS.map(collectTests))).flat();
    const haystack = (await Promise.all(files.map((file) => readFile(file, "utf-8")))).join("\n");

    const unaccounted = p1.filter(
      (rule) =>
        !haystack.includes(rule)
        && DELIBERATELY_NOT_IMPLEMENTED[rule] === undefined
        && NOT_BUILT_YET[rule] === undefined,
    );

    expect(
      unaccounted,
      `these P1 rules are named by no test, no decision and no gap: ${unaccounted.join(", ")}`,
    ).toEqual([]);
  });

  it("does not let unbuilt work retire as a decision", () => {
    // The two lists must stay apart. A rule in both would be a gap wearing a decision's clothes.
    const both = Object.keys(NOT_BUILT_YET).filter(
      (rule) => DELIBERATELY_NOT_IMPLEMENTED[rule] !== undefined,
    );

    expect(both, "listed as both a decision and unbuilt").toEqual([]);
    for (const [rule, why] of Object.entries(NOT_BUILT_YET)) {
      expect(why.length, `${rule} does not say what is missing`).toBeGreaterThan(60);
    }
  });

  it("explains every deliberate divergence properly", () => {
    // A one-word excuse is how this list stops being read.
    for (const [rule, why] of Object.entries(DELIBERATELY_NOT_IMPLEMENTED)) {
      expect(why.length, `${rule}'s reason is too short to be one`).toBeGreaterThan(60);
      expect(why, `${rule} does not name the decision`).toMatch(/decision \d+/);
    }
  });
});
