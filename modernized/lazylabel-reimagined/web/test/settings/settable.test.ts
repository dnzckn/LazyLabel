/**
 * Can a user SET each setting? -- the question the settings guard (`honoured.ts`) does not ask.
 *
 * That guard checks every key is READ. On 2026-09-23 thirteen keys were read and settable by no one:
 * they kept their default unless a desktop import brought a value, so a new user could never turn on
 * Operate On View or pixel priority. Twelve got controls (`SettingsEditor.tsx`); the rest are below.
 *
 * Every key not listed here must be referenced by a file that saves settings. A key added to the
 * schema with no control fails until it gets one or a reason -- "read and unsettable" is then a
 * decision somebody wrote down, not a gap nobody noticed.
 */

import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@lazylabel/settings-schema";

/** Keys deliberately without a control, each with why. */
const NOT_EDITABLE: Readonly<Record<string, string>> = {
  window_width: "desktop window geometry; a browser tab sizes itself",
  window_height: "desktop window geometry; a browser tab sizes itself",
  left_panel_width: "desktop panel geometry; the workspace grid reflows instead",
  right_panel_width: "desktop panel geometry; the workspace grid reflows instead",
  default_model_type: "dropped: the model picker chooses from the manifest (`ai_model`)",
  default_model_filename: "dropped: checkpoints come from the manifest, never a file name",
  auto_save: "dropped by decision 7: nothing is written without an explicit act",
  multi_view_grid_mode: "dropped: only two viewers ever existed behind the four-view setting",
  file_manager_show_name: "the name column is always shown; a file list without names is unusable",
  line_thickness: "import-only, as in legacy, which has no control for it either",
  // A GAP, not a decision, and named as one. This guard found it the day it was written.
  stream_window_size:
    "AWAITING legacy's streaming controls (RULE-026), which are not built: propagation reads the "
    + "window size and only an import can change it",
};

const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

async function sources(dir: string, into: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await sources(full, into);
    else if (/\.(ts|tsx)$/.test(entry.name)) into.push(full);
  }
  return into;
}

it("gives every setting a control, or a reason it has none", async () => {
  const texts = await Promise.all((await sources(SOURCE)).map((file) => readFile(file, "utf-8")));
  // A file that writes settings at all: the provider's save, or a panel's own setter over it.
  const writers = texts.filter((text) => /\bsave\(\s*\{|\bsetValue\(|\bput\(/.test(text));
  expect(writers.length, "found no file that saves settings; the pattern is wrong").toBeGreaterThan(3);

  const unsettable = Object.keys(DEFAULT_SETTINGS)
    .filter((key) => NOT_EDITABLE[key] === undefined)
    .filter((key) => !writers.some((text) => new RegExp(`["'\`]${key}["'\`]`).test(text)))
    .sort();

  expect(unsettable, "read by the app and settable by no one: add a control or a reason").toEqual([]);
});

it("holds no reason for a key that no longer exists", () => {
  expect(Object.keys(NOT_EDITABLE).filter((key) => !(key in DEFAULT_SETTINGS))).toEqual([]);
});
