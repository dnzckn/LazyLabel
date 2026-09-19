/**
 * Importing a legacy configuration — the C13 acceptance test.
 *
 * Phase 2 exit criterion 3: the settings schema imports a legacy `settings.json` and `hotkeys.json`
 * in a test, tolerating unknown keys.
 *
 * The fixtures in `test/fixtures/legacy-config/` were written by the LEGACY code itself, at commit
 * 2a7d5d8 — `Settings().save_to_file` and `HotkeyManager.save_hotkeys` — not typed out here. A
 * hand-written fixture only proves the importer agrees with whoever wrote the fixture.
 *
 * RULE-088 is the rule under test, and it is a data-loss defect rather than an inconvenience: the
 * legacy loader does `cls(**data)`, so ONE unrecognized key raises TypeError, the handler catches
 * it, and every preference the user ever set is silently replaced by defaults.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, DEFAULT_HOTKEYS } from "../src/schema.js";
import { importLegacySettings } from "../src/importLegacy.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "legacy-config");

async function fixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURES, name), "utf-8");
}

describe("C13: importing a legacy configuration", () => {
  it("imports a settings.json written by the legacy app, key for key", async () => {
    const legacy = JSON.parse(await fixture("settings.json")) as Record<string, unknown>;
    const { settings, warnings } = importLegacySettings(JSON.stringify(legacy), null);

    expect(warnings).toEqual([]);
    for (const [key, value] of Object.entries(legacy)) {
      expect(settings.values[key], `setting ${key}`).toEqual(value);
    }
    // Every key the legacy app writes is one this schema knows. A key it writes that we do not
    // recognize would still be preserved, but it would mean the schema had drifted from 2a7d5d8.
    expect(Object.keys(legacy).filter((key) => !(key in DEFAULT_SETTINGS))).toEqual([]);
  });

  it("imports a hotkeys.json written by the legacy app", async () => {
    const legacy = JSON.parse(await fixture("hotkeys.json")) as Record<
      string,
      { primary_key: string; secondary_key: string | null }
    >;
    const { settings, warnings } = importLegacySettings(null, JSON.stringify(legacy));

    expect(warnings).toEqual([]);
    for (const [name, binding] of Object.entries(legacy)) {
      expect(settings.hotkeys[name], `hotkey ${name}`).toEqual({
        primary: binding.primary_key,
        secondary: binding.secondary_key,
      });
    }

    // Mouse bindings cannot be rebound, so legacy never persists them; they still have to be
    // present afterwards, from the defaults.
    expect(legacy["left_click"]).toBeUndefined();
    expect(settings.hotkeys["left_click"]).toEqual({ primary: "Left Click", secondary: null });
  });

  it("keeps every other preference when one key is unrecognized (RULE-088)", async () => {
    const legacy = JSON.parse(await fixture("settings.json")) as Record<string, unknown>;
    const edited = {
      ...legacy,
      point_radius: 0.9,
      dark_mode: false,
      a_key_from_a_newer_build: { nested: [1, 2, 3] },
    };

    const { settings, warnings } = importLegacySettings(JSON.stringify(edited), null);

    // This is the whole rule. Legacy returns defaults for all 37 keys here.
    expect(settings.values["point_radius"]).toBe(0.9);
    expect(settings.values["dark_mode"]).toBe(false);
    expect(settings.values["window_width"]).toBe(legacy["window_width"]);

    // The unknown key is kept, not dropped: it is usually a key a NEWER build understands, and
    // discarding it turns running an older build once into permanent data loss.
    expect(settings.values["a_key_from_a_newer_build"]).toEqual({ nested: [1, 2, 3] });

    expect(warnings).toEqual([
      {
        kind: "unknown-key",
        key: "a_key_from_a_newer_build",
        detail: "not a setting this version knows; kept unchanged",
      },
    ]);
  });

  it("falls back per key, not wholesale, when a value has the wrong type", async () => {
    const legacy = JSON.parse(await fixture("settings.json")) as Record<string, unknown>;
    const edited = { ...legacy, window_width: "wide", dark_mode: false };

    const { settings, warnings } = importLegacySettings(JSON.stringify(edited), null);

    expect(settings.values["window_width"]).toBe(DEFAULT_SETTINGS["window_width"]);
    expect(settings.values["dark_mode"]).toBe(false); // untouched by its neighbour's problem
    expect(warnings.map((warning) => warning.kind)).toEqual(["wrong-type"]);
  });

  it("migrates the pre-2.0 save flags into export_formats", () => {
    const { settings, warnings } = importLegacySettings(
      JSON.stringify({ save_npz: false, save_txt: true, bb_use_alias: true, save_class_aliases: true }),
      null,
    );

    expect(settings.values["export_formats"]).toEqual(["YOLO_DETECTION"]);
    expect(settings.values["save_npz"]).toBeUndefined();
    expect(settings.values["bb_use_alias"]).toBeUndefined();
    expect(warnings.map((warning) => warning.key)).toEqual(["save_npz/save_txt"]);
  });

  it("keeps a binding rather than unbinding the action when a hotkey entry is malformed", () => {
    const { settings, warnings } = importLegacySettings(
      null,
      JSON.stringify({ undo: { secondary_key: "Ctrl+Shift+Z" } }),
    );

    // DELIBERATE DEVIATION. Legacy does keys.get("primary_key", "") and binds Undo to the empty
    // string: the action stops working, nothing is reported, and the user finds out by pressing it.
    expect(settings.hotkeys["undo"]).toEqual({
      primary: DEFAULT_HOTKEYS["undo"]!.primary,
      secondary: DEFAULT_HOTKEYS["undo"]!.secondary,
    });
    expect(warnings).toEqual([
      {
        kind: "malformed-hotkey",
        key: "undo",
        detail: "no primary key; the default binding was kept rather than unbinding the action",
      },
    ]);
  });

  it("uses defaults, and says so, only when a file is not JSON at all", () => {
    const { settings, warnings } = importLegacySettings("}{ not json", "also not json");

    expect(settings.values).toEqual({ ...DEFAULT_SETTINGS });
    expect(warnings.map((warning) => warning.kind)).toEqual(["unparsable", "unparsable"]);
  });
});
