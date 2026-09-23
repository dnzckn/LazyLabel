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
/**
 * Every package whose functions ship. The formats package was added on 2026-09-23: SEC-06's object
 * limit had no caller there while the text readers built unbounded masks, and it hid because this
 * list stopped at the app. A guard that does not look somewhere protects nothing there -- which
 * held again the same day, when adding the settings and contracts packages found the desktop
 * settings import that nothing called.
 */
const SOURCES = [
  path.join(HERE, "..", "..", "src"),
  path.join(HERE, "..", "..", "..", "api", "src"),
  path.join(HERE, "..", "..", "..", "settings-schema", "src"),
  path.join(HERE, "..", "..", "..", "contracts", "src"),
  path.join(HERE, "..", "..", "..", "..", "lazylabel", "core", "exporters", "src"),
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
 *
 * COMMENTS DO NOT COUNT, and that sentence is here because they used to. `resetForPropagation` was
 * written, tested, and called by no shipping code — and this guard reported it reached, because a
 * comment in its own module mentioned it by name. A guard that a sentence about a function can
 * satisfy stops working precisely when someone documents carefully, which is backwards.
 */
function withoutComments(text: string): string {
  /*
   * STRING-AWARE, because the first version was not and it swallowed seventy-seven lines of
   * `app.ts`. The route pattern "/projects/:projectId/images/*imagePath/metadata" contains the two
   * characters that open a block comment, INSIDE A STRING, and a bare comment regex ran from there
   * to the next close -- taking every route handler with it, including the one call to
   * `matchRoute`. It went unnoticed because an import line kept the count above zero; stripping
   * imports is what exposed it.
   *
   * Strings are matched first in one alternation and kept, so a comment marker inside a literal is
   * never mistaken for one. Regex literals are not protected: a comment marker inside one would
   * still cut its line short, which can only make something look LESS reached -- the loud
   * direction, which fails this test rather than hiding a defect behind it.
   */
  return text.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_whole, literal: string | undefined) => literal ?? " ",
  );
}

/**
 * IMPORTS AND RE-EXPORTS DO NOT COUNT EITHER — the second hole, found the same way as the first.
 *
 * A mutation that commented out every call to `assertMaskBudget` still passed this guard, because
 * the three `import { assertMaskBudget }` lines were still there and each one mentioned the name.
 * An import is a promise to call something, not a call. A function imported everywhere and called
 * nowhere is exactly the defect this file exists to find, and it was invisible to it.
 */
function withoutImports(text: string): string {
  // `[^;]` rather than `[\s\S]`, so a match cannot leave the statement it started in. The first
  // version used a lazy match over anything, and a local `export { a, b };` -- which has no `from`
  // -- let it run on to the NEXT `} from "..."` in the file, swallowing every line between. That
  // reported `matchRoute` unreached, while app.ts calls it on every request.
  return text
    .replace(/^[ 	]*import\s[^;]*?from\s*["'][^"']+["'];?/gm, " ")
    .replace(/^[ 	]*import\s*["'][^"']+["'];?/gm, " ")
    .replace(/^[ 	]*export\s*(?:type\s*)?\{[^;}]*\}\s*from\s*["'][^"']+["'];?/gm, " ");
}

function callsTo(name: string): number {
  const word = new RegExp(`\\b${name}\\b`, "g");
  const ownDeclaration = new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`, "gm");
  let total = 0;
  for (const [, text] of texts) {
    const code = withoutImports(withoutComments(text));
    total += (code.match(word) ?? []).length;
  }
  // Its own declaration is one of those matches, wherever it lives.
  return Math.max(0, total - 1);
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
    // Nothing is classified `dead` today -- the five that were got deleted instead, most recently
    // `summarizeSave`, whose job the save report already did inline and better. The check stays
    // because the next one will, and the rule for it should already be written down.
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
    expect(unreachedNow().length).toBe(3);
  });
});
