/**
 * Which exported functions does no production code call?
 *
 * The general form of this project's longest-running defect family. Eleven times now the shape has
 * been identical — a function that works, a test that proves it works, and nothing calling it —
 * and eleven times it was found by a person noticing. `EditLayer` never rendered; undo had no
 * caller; `HttpInferenceClient` was never constructed; `markSaved` never ran, so nothing cleared
 * "unsaved"; `onNavigateAway` never ran, so opening another image discarded the work in silence.
 *
 * A test suite cannot catch this, and it is worth being precise about why: a suite tests the
 * pieces it is given, and this family is about the pieces nobody joined. The unit test passes. The
 * function is correct. Nothing is broken except that the user cannot reach it.
 *
 * So the question is asked of the whole tree instead, the way it was asked of every setting and
 * every hotkey. `unreached.ts` records an answer for each, and a new one fails here.
 */

import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { UNREACHED } from "./unreached.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = [
  path.join(HERE, "..", "..", "src"),
  path.join(HERE, "..", "..", "..", "api", "src"),
];

/** Exported function name to the file that declares it. */
const declared = new Map<string, string>();
/** File path to its text, for counting references. */
const texts = new Map<string, string>();

const EXPORTED = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm;

beforeAll(async () => {
  for (const root of SOURCES) await walk(root);
  for (const [file, text] of texts) {
    for (const match of text.matchAll(EXPORTED)) declared.set(match[1]!, file);
  }
});

async function walk(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) texts.set(full, await readFile(full, "utf-8"));
  }
}

/**
 * How many times production code mentions this name, not counting its own declaration.
 *
 * Same-file uses COUNT: a helper called by the module that exports it is reached, and exporting it
 * so a test can name it directly is ordinary. What is being looked for is a function no line of
 * shipping code runs.
 */
function callsTo(name: string): number {
  const word = new RegExp(`\\b${name}\\b`, "g");
  const ownDeclaration = new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`, "gm");
  let total = 0;
  for (const [file, text] of texts) {
    total += (text.match(word) ?? []).length;
    if (file === declared.get(name)) total -= (text.match(ownDeclaration) ?? []).length;
  }
  return total;
}

const unreachedNow = (): readonly string[] =>
  [...declared.keys()].filter((name) => callsTo(name) === 0).sort();

describe("every unreached function is accounted for", () => {
  it("finds no function that nobody has explained", () => {
    const surprises = unreachedNow().filter((name) => UNREACHED[name] === undefined);

    expect(
      surprises,
      "these are exported, probably tested, and no production code calls them -- which is how "
        + "eleven defects in this project reached a user as a feature that did not exist. Wire it "
        + "up, delete it, or record why it is waiting in `unreached.ts`",
    ).toEqual([]);
  });

  it("holds no entry for a function that is now called", () => {
    // The other direction, and the one that makes the list worth reading: once something is wired
    // up its excuse has to go, or the next person believes a working feature is still missing.
    const stale = Object.keys(UNREACHED).filter(
      (name) => declared.has(name) && callsTo(name) > 0,
    );

    expect(stale, "these are reached now; remove their entries").toEqual([]);
  });

  it("holds no entry for a function that no longer exists", () => {
    const gone = Object.keys(UNREACHED).filter((name) => !declared.has(name));

    expect(gone).toEqual([]);
  });
});

describe("the reasons are usable", () => {
  it("names the slice every waiting function waits for", () => {
    for (const [name, reason] of Object.entries(UNREACHED)) {
      if (reason.kind !== "awaiting") continue;
      // Long enough to name the rule or the missing piece. "not built" tells the next person
      // nothing they could not have guessed from the fact that it is on this list.
      expect(reason.slice.length, `${name} does not say what it waits for`).toBeGreaterThan(25);
    }
  });

  it("names what replaced every dead one", () => {
    // Nothing is classified `dead` today -- the four that were got deleted instead. The check
    // stays because the next one will, and the rule for it should already be written down.
    for (const [name, reason] of Object.entries(UNREACHED)) {
      if (reason.kind !== "dead") continue;
      expect(reason.instead.length, `${name} does not say what took its place`).toBeGreaterThan(25);
    }
  });
});

describe("what the sweep currently finds", () => {
  it("reports the count, so a change in it shows up in the diff", () => {
    // Asserted rather than printed. Wiring one up fails this test, and the person who wired it
    // then removes its entry -- which is the whole mechanism.
    expect(unreachedNow().length).toBe(5);
  });
});
