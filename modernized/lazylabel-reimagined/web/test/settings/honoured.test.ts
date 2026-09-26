/**
 * Does anything read this setting?
 *
 * The question that would have caught four defects in this project, each of which was instead
 * found by someone noticing: `operate_on_view`, RULE-012's two pixel-priority keys, and
 * `propagation_confidence_threshold`. All four were stored, shown in a panel, and read by nothing
 * — a control that remembers a value and changes nothing, which is undetectable from the outside.
 *
 * `honoured.ts` classifies every key as read, deliberately dropped, or a gap. This checks that
 * classification against the actual source of both packages, in both directions:
 *
 *   - a key called READ must appear in the source, so a reader cannot quietly be deleted;
 *   - a key called DROPPED or GAP must NOT appear, so the reason cannot go stale after someone
 *     wires it up;
 *   - every key in the schema must be classified, so a new setting cannot be added without the
 *     question being asked once, when it is cheapest to answer.
 */

import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { HONOURED } from "./honoured.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES = [
  path.join(HERE, "..", "..", "src"),
  path.join(HERE, "..", "..", "..", "api", "src"),
];

/** Every source file's text, concatenated. Small enough that reading it once beats grepping. */
let sources = "";

beforeAll(async () => {
  const parts: string[] = [];
  for (const root of PACKAGES) parts.push(await readTree(root));
  sources = parts.join("\n");
});

async function readTree(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) parts.push(await readTree(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) parts.push(await readFile(full, "utf-8"));
  }
  return parts.join("\n");
}

/**
 * Whether the source looks this key up.
 *
 * The quoted key, which is how every reader spells it: `settings.values["brightness"]`. Matching
 * the bare word would count the schema's own definition and every comment mentioning it.
 */
const isRead = (key: string): boolean => sources.includes(`"${key}"`);

const KEYS = Object.keys(defaultSettings().values);

describe("every setting is accounted for", () => {
  it("classifies every key in the schema", () => {
    const unclassified = KEYS.filter((key) => HONOURED[key] === undefined);

    expect(
      unclassified,
      "a new setting was added without anyone answering whether code reads it",
    ).toEqual([]);
  });

  it("classifies nothing that is not in the schema", () => {
    // A leftover entry is a reason nobody can act on, attached to a key that no longer exists.
    const extra = Object.keys(HONOURED).filter((key) => !KEYS.includes(key));

    expect(extra).toEqual([]);
  });
});

/**
 * What the desktop app keeps across a restart, as its own code wrote it: `Settings().save_to_file`
 * and `HotkeyManager.save_hotkeys` at 2a7d5d8, the settings package's fixtures (its README says
 * why they are generated rather than typed). The owner's "the settings of the app should save
 * between sessions" (2026-09-26) starts with each of these having somewhere to be kept here.
 */
describe("every setting and hotkey legacy keeps across a restart has a place here", () => {
  const fixture = (name: string) =>
    path.join(HERE, "..", "..", "..", "settings-schema", "test", "fixtures", "legacy-config", name);

  it("has a schema key for every field of legacy's settings.json (config/settings.py:12-75)", async () => {
    const legacy = JSON.parse(await readFile(fixture("settings.json"), "utf-8")) as Record<string, unknown>;

    const missing = Object.keys(legacy).filter((key) => !KEYS.includes(key));

    expect(Object.keys(legacy).length, "the fixture is legacy's whole file").toBeGreaterThan(30);
    expect(missing, "legacy keeps these and the web app has nowhere to keep them").toEqual([]);
  });

  it("has an action for every binding legacy's hotkeys.json holds (config/hotkeys.py:244-258)", async () => {
    const legacy = JSON.parse(await readFile(fixture("hotkeys.json"), "utf-8")) as Record<string, unknown>;

    const missing = Object.keys(legacy).filter((action) => !(action in defaultSettings().hotkeys));

    expect(missing).toEqual([]);
  });
});

describe("the classification matches the source", () => {
  it("every key called READ is actually read", () => {
    const broken = KEYS.filter((key) => HONOURED[key]?.kind === "read" && !isRead(key));

    expect(
      broken,
      "these are recorded as honoured and nothing looks them up; the user's value does nothing",
    ).toEqual([]);
  });

  it("no key called DROPPED or GAP is secretly read", () => {
    const stale = KEYS.filter((key) => HONOURED[key]?.kind !== "read" && isRead(key));

    expect(
      stale,
      "these are wired up now, so their recorded reason is out of date and misleads the next reader",
    ).toEqual([]);
  });
});

describe("the reasons are usable", () => {
  it("says what is missing for every gap", () => {
    for (const key of KEYS) {
      const entry = HONOURED[key];
      if (entry?.kind !== "gap") continue;
      // Long enough to name the rule or the reason. "not built" on its own tells the next person
      // nothing they could not have guessed.
      expect(entry.missing.length, `${key}'s gap is not explained`).toBeGreaterThan(30);
    }
  });

  it("says which decision dropped it, for every dropped key", () => {
    for (const key of KEYS) {
      const entry = HONOURED[key];
      if (entry?.kind !== "dropped") continue;
      expect(entry.why.length, `${key}'s removal is not explained`).toBeGreaterThan(30);
    }
  });
});

describe("what the scan currently finds", () => {
  it("reports the counts, so a change in them is visible in the diff", () => {
    // Not a threshold to pass — a number to notice. When a gap is closed this test fails and the
    // person closing it moves the key to `read`, which is exactly the prompt that was missing.
    // It has now done that job thirteen times: the table opened at thirteen unread settings and
    // the last of them, `stream_window_size`, closed when the browser learned to propagate.
    const counted = (kind: string) => KEYS.filter((key) => HONOURED[key]?.kind === kind).length;

    expect({ read: counted("read"), dropped: counted("dropped"), gap: counted("gap") }).toEqual({
      read: 31,
      dropped: 8,
      gap: 0,
    });
  });
});
