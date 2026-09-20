/**
 * How big the drawing aids are, from three settings that had no reader.
 *
 * The interesting part is the unit change. Legacy sizes handles in IMAGE pixels, so they grow as
 * you zoom; this app sizes them on SCREEN, so they stay grabbable when you are looking at the
 * whole image. Legacy's defaults are 0.3 and 0.5 — read as screen lengths those are invisible
 * handles, so they are read as ratios against themselves instead, and the user's intent ports even
 * though the number does not.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_SIZING, sizingFrom } from "../../src/canvas/sizing.js";

describe("sizing from settings", () => {
  it("draws exactly what it drew before, at the defaults", () => {
    // The whole safety of the ratio reading. A user who never opens the panel must see no change.
    expect(sizingFrom({ point_radius: 0.3, line_thickness: 0.5, annotation_size_multiplier: 1 }))
      .toEqual(DEFAULT_SIZING);
  });

  it("doubles the handles when the radius is doubled", () => {
    expect(sizingFrom({ point_radius: 0.6, line_thickness: 0.5 }).point).toBe(2);
  });

  it("scales the outline independently of the handles", () => {
    const sizing = sizingFrom({ point_radius: 0.3, line_thickness: 1.5 });

    expect(sizing.point).toBe(1);
    expect(sizing.line).toBe(3);
  });

  it("multiplies both by the annotation size, as legacy computes it", () => {
    // `settings.point_radius * settings.annotation_size_multiplier`, main_window.py:516-538.
    const sizing = sizingFrom({
      point_radius: 0.6,
      line_thickness: 0.5,
      annotation_size_multiplier: 1.5,
    });

    expect(sizing.point).toBe(3);
    expect(sizing.line).toBe(1.5);
  });

  it("falls back to the multiplier alone when a length is missing", () => {
    expect(sizingFrom({ annotation_size_multiplier: 2 })).toEqual({ point: 2, line: 2 });
  });

  it("REFUSES a zero or negative size rather than drawing nothing", () => {
    // Reachable by hand-editing the settings file, which a user has every right to do. Getting
    // back an app that appears to have no polygon tool is not a fair consequence of one bad
    // number.
    expect(sizingFrom({ point_radius: 0 }).point).toBe(1);
    expect(sizingFrom({ point_radius: -5 }).point).toBe(1);
    expect(sizingFrom({ annotation_size_multiplier: 0 })).toEqual(DEFAULT_SIZING);
  });

  it("refuses a value that is not a number", () => {
    expect(sizingFrom({ point_radius: "big", line_thickness: null })).toEqual(DEFAULT_SIZING);
    expect(sizingFrom({})).toEqual(DEFAULT_SIZING);
  });

  it("bounds an enormous size, so the handles cannot cover the image", () => {
    expect(sizingFrom({ point_radius: 3000 }).point).toBe(10);
    expect(sizingFrom({ annotation_size_multiplier: 3000 }).point).toBe(10);
  });
});
