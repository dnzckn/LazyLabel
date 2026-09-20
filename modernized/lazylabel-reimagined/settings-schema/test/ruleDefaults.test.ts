/**
 * Defaults that a rule card fixes, rather than a preference somebody picked.
 *
 * Most entries in this schema are taste: a window width, which columns show. A few are not — they
 * are recorded parameters of a P0 or P1 rule, and changing one changes what the app WRITES. Those
 * belong under test, because nothing else distinguishes them from the taste ones and a plausible
 * number typed into the wrong line reads as a decision nobody has to defend.
 *
 * This file exists because one of them was wrong. `propagation_confidence_threshold` shipped at
 * 0.5 against RULE-060's recorded 0.99, and 0.5 is not a milder setting — propagation scores
 * cluster just under 1, so at 0.5 essentially nothing is ever flagged. The user reviews nothing
 * and ships the model's unsure guesses, which is the failure that rule exists to prevent.
 */

import { describe, expect, it } from "vitest";

import { defaultSettings } from "../src/index.js";

const values = defaultSettings().values;

describe("defaults a rule card fixes", () => {
  it("Min Conf is 0.99 — RULE-060, and legacy's own default in five places", () => {
    expect(values["propagation_confidence_threshold"]).toBe(0.99);
  });

  it("Operate On View is off — RULE-089's recorded default", () => {
    // Off means the model segments the ORIGINAL file rather than the adjusted view. On by default
    // would quietly make every prediction depend on the brightness slider.
    expect(values["operate_on_view"]).toBe(false);
  });

  it("pixel priority is off and ascending — RULE-012's two settings", () => {
    // Which class wins an overlapping pixel. Both had no reader for a while; the defaults are what
    // decide the masks for everyone who never opens the panel.
    expect(values["pixel_priority_enabled"]).toBe(false);
    expect(values["pixel_priority_ascending"]).toBe(true);
  });

  it("the display adjustments start neutral", () => {
    // Not a rule card, but the same class of harm: a non-neutral default would change what every
    // user sees on their first image and look like a decode fault.
    expect(values["brightness"]).toBe(0);
    expect(values["contrast"]).toBe(0);
    expect(values["gamma"]).toBe(1);
    expect(values["saturation"]).toBe(1);
  });
});
