/**
 * What a settings save changed, and applying it on top of what the server holds.
 *
 * The provider sends only these, so a mistake here is a setting that silently does not save -- or
 * worse, one that puts back a value another control had just changed.
 */

import { describe, expect, it } from "vitest";

import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import { applyChanges, changesBetween, mergeChanges } from "../../src/settings/changes.js";

const base = defaultSettings();

function withValues(values: Record<string, unknown>, from: StoredSettings = base): StoredSettings {
  return { ...from, values: { ...from.values, ...values } };
}

function without(key: string, from: StoredSettings = base): Record<string, unknown> {
  const values: Record<string, unknown> = { ...from.values };
  delete values[key];
  return values;
}

describe("what a save changed", () => {
  it("is only the keys whose value differs from the settings the caller was shown", () => {
    const changes = changesBetween(base, withValues({ brightness: 40 }));

    expect([...changes.values]).toEqual([["brightness", 40]]);
    expect(changes.hotkeys.size).toBe(0);
  });

  it("compares by value, so a list the server sent back again is not a change", () => {
    // Every answer from the server is a fresh object; the format list nobody touched must not
    // travel with the next save as though someone had.
    const next = withValues({ export_formats: [...(base.values["export_formats"] as string[])] });

    expect(changesBetween(base, next).values.size).toBe(0);
  });

  it("includes a rebinding, and a key the caller dropped", () => {
    const next: StoredSettings = {
      ...base,
      values: without("brightness"),
      hotkeys: { ...base.hotkeys, undo: { primary: "F19", secondary: null } },
    };

    const changes = changesBetween(base, next);

    expect(changes.values.get("brightness")).toBeUndefined();
    expect(changes.values.has("brightness")).toBe(true);
    expect(changes.hotkeys.get("undo")).toEqual({ primary: "F19", secondary: null });
  });
});

describe("applying changes", () => {
  it("lands two saves made from the same snapshot together, which sending each whole did not", () => {
    // The defect: both were built from `base`, and the second sent brightness 0 back.
    const first = changesBetween(base, withValues({ brightness: 40 }));
    const second = changesBetween(base, withValues({ auto_save: false }));

    const stored = applyChanges(applyChanges(base, first), second);

    expect(stored.values["brightness"]).toBe(40);
    expect(stored.values["auto_save"]).toBe(false);
  });

  it("removes a dropped key and keeps every key nobody touched, unknown ones included", () => {
    const from = withValues({ from_a_newer_version: [1, 2] });

    const stored = applyChanges(from, changesBetween(from, { ...from, values: without("brightness", from) }));

    expect("brightness" in stored.values).toBe(false);
    expect(stored.values["from_a_newer_version"]).toEqual([1, 2]);
    expect(stored.values["gamma"]).toBe(base.values["gamma"]);
  });

  it("keeps the identity of a part nothing changed, so the hotkey map is not rebuilt for a slider", () => {
    const stored = applyChanges(base, changesBetween(base, withValues({ brightness: 5 })));

    expect(stored.hotkeys).toBe(base.hotkeys);
  });
});

describe("merging changes that wait for the same request", () => {
  it("lets the later one win where both touch a key", () => {
    const merged = mergeChanges(
      changesBetween(base, withValues({ brightness: 10, contrast: 5 })),
      changesBetween(base, withValues({ brightness: 30 })),
    );

    const stored = applyChanges(base, merged);

    expect(stored.values["brightness"]).toBe(30);
    expect(stored.values["contrast"]).toBe(5);
  });
});
