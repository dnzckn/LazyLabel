/**
 * What a save may store -- SEC-16's "per-field validation", asked of the values and the bindings.
 *
 * The import validated per key; the API's save stored whatever arrived. A known key with the wrong
 * type and a malformed binding are what this refuses, and an UNKNOWN key is what it must not refuse:
 * keeping those is RULE-088's fix, and a check that dropped them would reintroduce the defect it
 * sits next to.
 */

import { describe, expect, it } from "vitest";

import { defaultSettings } from "../src/schema.js";
import { shapeProblems } from "../src/shape.js";

const base = defaultSettings();

describe("what is accepted", () => {
  it("the defaults, as the browser sends them", () => {
    // The control. A check that refused this would refuse every save the app makes.
    expect(shapeProblems(base.values, base.hotkeys)).toEqual([]);
  });

  it("a key this version does not know (RULE-088)", () => {
    expect(shapeProblems({ ...base.values, from_a_newer_version: { anything: true } }, base.hotkeys)).toEqual([]);
  });

  it("an integer where the default is a float, because JSON has one number type", () => {
    expect(shapeProblems({ ...base.values, gamma: 1 }, base.hotkeys)).toEqual([]);
  });

  it("a binding with no secondary key, read as unbound", () => {
    expect(shapeProblems(base.values, { ...base.hotkeys, undo: { primary: "Ctrl+Z" } })).toEqual([]);
  });

  it("an export-format list of any shape, which normalizeExportFormats corrects and reports", () => {
    expect(shapeProblems({ ...base.values, export_formats: "NPZ" }, base.hotkeys)).toEqual([]);
  });
});

describe("what is refused, each with the reason", () => {
  it("a known key with the wrong type", () => {
    expect(shapeProblems({ ...base.values, gamma: "abc" }, base.hotkeys)).toEqual([
      "gamma must be a number, not a string",
    ]);
  });

  it("a number that is not finite", () => {
    // JSON cannot carry NaN, but a value computed in the browser can reach the wire as null.
    expect(shapeProblems({ ...base.values, gamma: null }, base.hotkeys)).toEqual([
      "gamma must be a number, not null",
    ]);
  });

  it("a binding that is not an object -- the value that crashed legacy on every launch", () => {
    expect(shapeProblems(base.values, { ...base.hotkeys, undo: null })).toEqual([
      "the binding for undo must be an object, not null",
    ]);
    expect(shapeProblems(base.values, { ...base.hotkeys, undo: 5 })).toEqual([
      "the binding for undo must be an object, not a number",
    ]);
  });

  it("a binding whose keys are not text", () => {
    expect(shapeProblems(base.values, { ...base.hotkeys, undo: { primary: 5, secondary: [] } })).toEqual([
      "the binding for undo needs a primary key as text",
      "the secondary key for undo must be text or null",
    ]);
  });

  it("values or hotkeys that are not objects at all", () => {
    expect(shapeProblems([], "keys")).toEqual([
      "values must be an object, not an array",
      "hotkeys must be an object, not a string",
    ]);
  });
});
