/**
 * RULE-070: what legacy records as the previous mode, and where Select, Pan and Edit go back to.
 *
 * Legacy's ModeManager writes the previous mode itself, except when leaving Selection or Edit
 * (mode_manager.py:123-124, 182-183), and then sets the mode through the view model, whose setter
 * records the mode it replaces on every change (main_window.py:475-478;
 * single_view_viewmodel.py:127-142). The setter wins whenever the mode changes, so "previous" is
 * the mode just left. Edit is the "none" tool here.
 */

import { describe, expect, it } from "vitest";

import { chooseMode, toggleMode, type ModeState } from "../../src/tools/modes.js";

const from = (tool: ModeState["tool"], previous: ModeState["tool"]): ModeState => ({ tool, previous });

describe("1 to 4, legacy's set_mode", () => {
  it("records the mode left", () => {
    expect(chooseMode(from("select", "ai"), "polygon")).toEqual(from("polygon", "select"));
  });

  it("records the mode itself when it is chosen again, unless it is Selection or Edit", () => {
    // mode_manager.py:123-124 runs before the view model refuses the unchanged mode (135-136).
    expect(chooseMode(from("polygon", "select"), "polygon")).toEqual(from("polygon", "polygon"));
    const selecting = from("select", "ai");
    expect(chooseMode(selecting, "select")).toBe(selecting);
  });
});

describe("E, Q and R, legacy's toggle_mode", () => {
  it("enters the mode and records the one left", () => {
    expect(toggleMode(from("ai", "polygon"), "select")).toEqual(from("select", "ai"));
  });

  it("goes back to the previous mode when pressed in it, recording the mode left", () => {
    expect(toggleMode(from("pan", "circle"), "pan")).toEqual(from("circle", "pan"));
  });

  it("stays put when the previous mode is the mode itself", () => {
    const start = from("none", "none");
    expect(toggleMode(start, "none")).toBe(start);
  });

  it("walks the card's E R R E from AI: Selection, Edit, Selection, Edit", () => {
    // RULE-070's example: R does not go back to AI, and the last E goes to Edit.
    const e = (state: ModeState) => toggleMode(state, "select");
    const r = (state: ModeState) => toggleMode(state, "none");
    const steps: ModeState[] = [];
    let state = from("ai", "polygon");
    for (const press of [e, r, r, e]) {
      state = press(state);
      steps.push(state);
    }

    expect(steps).toEqual([
      from("select", "ai"),
      from("none", "select"),
      from("select", "none"),
      from("none", "select"),
    ]);
  });
});
