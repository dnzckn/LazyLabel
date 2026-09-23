/**
 * Can a user SET each setting? -- the question the settings guard (`honoured.ts`) does not ask.
 *
 * That guard checks every key is READ. On 2026-09-23 seven keys were read and settable by no one:
 * they kept their default unless a desktop import brought a value, so a new user could never turn on
 * Operate On View or pixel priority. Six got controls (`SettingsEditor.tsx`); the seventh,
 * `line_thickness`, is below with the other keys that have none on purpose.
 *
 * Every key not listed here must be referenced by a file that saves settings. A key added to the
 * schema with no control fails until it gets one or a reason -- "read and unsettable" is then a
 * decision somebody wrote down, not a gap nobody noticed.
 *
 * THE FIRST ANSWER WAS FOURTEEN, and seven were wrong: the file list's format columns ARE set, by
 * the dataset browser's Columns chooser, through a computed key whose names live in `columns.ts`.
 * They got a second set of switches before anyone noticed. `NAMED_FOR` is that indirection,
 * declared and checked, so the guard reads what the writer reads.
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
};

/**
 * A file that NAMES setting keys for a writer that saves them through a computed key, and that
 * writer. The pair is checked: the writer must save settings and import the names.
 */
const NAMED_FOR: readonly (readonly [names: string, writer: string])[] = [
  ["dataset/columns.ts", "dataset/DatasetBrowser.tsx"],
];

/** A file that writes settings at all: the provider's save, or a panel's own setter over it. */
const WRITES = /\bsave\(\s*\{|\bsetValue\(|\bput\(/;

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
  const writers = texts.filter((text) => WRITES.test(text));
  expect(writers.length, "found no file that saves settings; the pattern is wrong").toBeGreaterThan(3);
  for (const [names] of NAMED_FOR) writers.push(await readFile(path.join(SOURCE, names), "utf-8"));

  const unsettable = Object.keys(DEFAULT_SETTINGS)
    .filter((key) => NOT_EDITABLE[key] === undefined)
    .filter((key) => !writers.some((text) => new RegExp(`["'\`]${key}["'\`]`).test(text)))
    .sort();

  expect(unsettable, "read by the app and settable by no one: add a control or a reason").toEqual([]);
});

it("counts a file's names only for a writer that saves settings and imports them", async () => {
  for (const [names, writer] of NAMED_FOR) {
    const text = await readFile(path.join(SOURCE, writer), "utf-8");
    const module = `./${path.basename(names).replace(/\.tsx?$/, ".js")}`;

    expect(WRITES.test(text), `${writer} does not save settings`).toBe(true);
    expect(text, `${writer} does not import ${names}`).toContain(`from "${module}"`);
  }
});

it("holds no reason for a key that no longer exists", () => {
  expect(Object.keys(NOT_EDITABLE).filter((key) => !(key in DEFAULT_SETTINGS))).toEqual([]);
});
