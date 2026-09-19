/**
 * RULE-049: a key already bound to another action cannot be assigned to a second one.
 */

import { describe, expect, it } from "vitest";

import { defaultSettings, type HotkeyBinding } from "../src/schema.js";
import {
  actionHolding,
  canRebind,
  checkAssignment,
  findConflicts,
} from "../src/hotkeyConflicts.js";

const bindings = (): Record<string, HotkeyBinding> => ({ ...defaultSettings().hotkeys });

describe("canRebind", () => {
  it("allows an ordinary action", () => {
    expect(canRebind("merge_segments")).toBe(true);
  });

  it("refuses mouse bindings, which legacy never lets you change or save", () => {
    for (const action of ["left_click", "right_click", "mouse_drag"]) {
      expect(canRebind(action), action).toBe(false);
    }
  });

  it("refuses an action that does not exist", () => {
    expect(canRebind("summon_a_pony")).toBe(false);
  });
});

describe("actionHolding", () => {
  it("finds the action holding a key as its primary", () => {
    expect(actionHolding(bindings(), "M")).toBe("merge_segments");
  });

  it("finds a key held as a secondary, not only as a primary", () => {
    // Redo's secondary is Ctrl+Shift+Z. A check that only looked at primaries would call it free.
    expect(actionHolding(bindings(), "Ctrl+Shift+Z")).toBe("redo");
  });

  it("returns null for a key nobody holds", () => {
    expect(actionHolding(bindings(), "F19")).toBeNull();
  });

  it("does not count the action being edited as holding its own key", () => {
    expect(actionHolding(bindings(), "M", "merge_segments")).toBeNull();
  });
});

describe("checkAssignment", () => {
  it("allows a free key", () => {
    expect(checkAssignment(bindings(), "merge_segments", "primary", "F19")).toBeNull();
  });

  it("blocks a key another action already holds, and names that action", () => {
    const result = checkAssignment(bindings(), "delete_segments", "primary", "M");
    expect(result).toEqual({
      action: "delete_segments",
      key: "M",
      heldBy: "merge_segments",
      slot: "primary",
    });
  });

  it("blocks a key another action holds as its secondary", () => {
    const result = checkAssignment(bindings(), "merge_segments", "primary", "Ctrl+Shift+Z");
    expect(result).toMatchObject({ heldBy: "redo" });
  });

  it("allows an action to keep the key it already has", () => {
    expect(checkAssignment(bindings(), "merge_segments", "primary", "M")).toBeNull();
  });

  it("allows clearing a secondary key", () => {
    expect(checkAssignment(bindings(), "redo", "secondary", null)).toBeNull();
  });

  it("refuses to clear a primary key", () => {
    expect(checkAssignment(bindings(), "redo", "primary", null)).toEqual({
      reason: "redo must keep a primary key",
    });
  });

  it("refuses the empty string, which is how legacy silently unbinds an action", () => {
    expect(checkAssignment(bindings(), "redo", "primary", "")).toEqual({
      reason: "a binding cannot be the empty string",
    });
  });

  it("refuses to rebind a mouse action", () => {
    expect(checkAssignment(bindings(), "left_click", "primary", "F19")).toEqual({
      reason: "left_click is a mouse binding and cannot be reassigned",
    });
  });

  it("refuses an action it has never heard of", () => {
    expect(checkAssignment(bindings(), "summon_a_pony", "primary", "F19")).toEqual({
      reason: 'there is no action called "summon_a_pony"',
    });
  });
});

describe("findConflicts", () => {
  it("finds nothing in the shipped defaults", () => {
    // Worth asserting rather than assuming: a default set that shipped with a conflict would make
    // every import warn, and the warning would be trained out of people within a day.
    expect(findConflicts(defaultSettings().hotkeys)).toEqual([]);
  });

  it("finds a conflict a hand-edited file introduced", () => {
    const edited = bindings();
    edited["delete_segments"] = { primary: "M", secondary: null };

    const conflicts = findConflicts(edited);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: "M", heldBy: "delete_segments" });
  });

  it("reports one conflict per collision, not one per action involved", () => {
    const edited = bindings();
    edited["delete_segments"] = { primary: "M", secondary: null };
    edited["pan_up"] = { primary: "M", secondary: null };

    // Three actions on M is two collisions past the first holder, not three separate problems.
    expect(findConflicts(edited)).toHaveLength(2);
  });

  it("ignores mouse bindings, which legitimately share their labels with nothing", () => {
    const edited = bindings();
    edited["left_click"] = { primary: "Left Click", secondary: null };
    expect(findConflicts(edited)).toEqual([]);
  });

  it("ignores an empty or absent secondary", () => {
    const edited = bindings();
    edited["pan_up"] = { primary: "W", secondary: "" };
    edited["pan_down"] = { primary: "S", secondary: "" };
    expect(findConflicts(edited)).toEqual([]);
  });
});
