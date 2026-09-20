/**
 * RULE-031's histogram presets, finally reachable.
 *
 * All three were built and proven — `stretchWindow`, `equalizeLut` and `clahe`, the last a
 * byte-exact port of OpenCV's matched against six goldens — and none had a caller. The processing
 * query had no way to ASK for a preset, so the pipeline never applied one and a user could not
 * reach adaptive equalization at all.
 *
 * The arithmetic of each is tested where it lives. What is tested here is the part that was
 * missing: that a request reaches it, at the right point in RULE-032's order, on the right pixels.
 */

import { describe, expect, it } from "vitest";

import {
  applyClahe,
  applyProcessing,
  isEmpty,
  processingFromQuery,
  type Processing,
} from "../../src/images/processing.js";

const GRAY = { width: 8, height: 4, sourceChannels: 1 } as const;

/** A grayscale ramp, expanded to three equal channels the way the decoders produce it. */
function ramp(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 3);
  values.forEach((value, i) => {
    out[i * 3] = value;
    out[i * 3 + 1] = value;
    out[i * 3 + 2] = value;
  });
  return out;
}

const channel0 = (data: Uint8Array): number[] =>
  [...data].filter((_, i) => i % 3 === 0);

const query = (raw: string): Processing => processingFromQuery(new URLSearchParams(raw));

describe("asking for a preset", () => {
  it("parses each of the three", () => {
    expect(query("preset=equalize").preset).toEqual({ kind: "equalize" });
    expect(query("preset=stretch:1.5").preset).toEqual({ kind: "stretch", saturation: 1.5 });
    expect(query("preset=clahe:3:4:6").preset).toEqual({
      kind: "clahe",
      clipLimit: 3,
      tilesX: 4,
      tilesY: 6,
    });
  });

  it("uses the rule's own defaults when the parameters are left off", () => {
    // Stretch 0.4%, CLAHE clip 2.0 and 8x8 tiles.
    expect(query("preset=stretch").preset).toEqual({ kind: "stretch", saturation: 0.4 });
    expect(query("preset=clahe").preset).toEqual({
      kind: "clahe",
      clipLimit: 2,
      tilesX: 8,
      tilesY: 8,
    });
  });

  it("REFUSES a value outside the rule's range rather than clamping it", () => {
    // These change what the user sees, so a silently adjusted clip limit leaves them adjusting a
    // control that has stopped responding.
    expect(() => query("preset=stretch:80")).toThrow(/0 to 50/);
    expect(() => query("preset=clahe:100")).toThrow(/0.5 to 40/);
    expect(() => query("preset=clahe:2:1")).toThrow(/2 to 32/);
    expect(() => query("preset=sharpen")).toThrow(/stretch, equalize or clahe/);
  });

  it("refuses a preset AND a manual window together", () => {
    // RULE-031's edge case: dragging the handles clears a preset. A request carrying both is a
    // client that has lost track of which the user chose, and picking one silently would show them
    // a picture neither control describes.
    expect(() => query("preset=equalize&rescaleMin=10&rescaleMax=200")).toThrow(/cannot both/);
  });

  it("counts as processing, so the pipeline does not skip it", () => {
    // `isEmpty` is the early return on every path. A preset it did not know about would be a
    // request accepted, parsed, and dropped.
    expect(isEmpty(query("preset=equalize"))).toBe(false);
    expect(isEmpty(query(""))).toBe(true);
  });
});

describe("stretch", () => {
  it("sets the window from the data, so a flat image gains contrast", () => {
    // Everything sits in 100..140; after a full-range stretch the ends reach 0 and 255. Thirty-two
    // values, because the frame is 8x4 and a short buffer would be read past its end.
    const row = [100, 110, 120, 130, 140, 100, 120, 140];
    const data = ramp([...row, ...row, ...row, ...row]);
    applyProcessing(data, GRAY, query("preset=stretch:0"));

    const out = channel0(data);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
  });

  it("leaves a already-full-range image alone", () => {
    const values = [0, 36, 72, 109, 145, 182, 218, 255];
    const data = ramp([...values, ...values, ...values, ...values]);

    applyProcessing(data, GRAY, query("preset=stretch:0"));

    expect(channel0(data).slice(0, 8)).toEqual(values);
  });

  it("is computed on the CROP region, not the whole frame", () => {
    // RULE-031 says so, and it matters: a stretch over the whole frame sets its window from pixels
    // the user has cropped away, which is exactly what a crop exists to exclude.
    const bright = [200, 210, 220, 230, 200, 210, 220, 230];
    const dark = [0, 5, 10, 15, 0, 5, 10, 15];
    const data = ramp([...bright, ...bright, ...dark, ...dark]);

    // Crop to the two BRIGHT rows. Their own range becomes 0..255.
    applyProcessing(data, GRAY, query("preset=stretch:0&crop=0,0,8,2"));

    const out = channel0(data);
    expect(Math.min(...out.slice(0, 16))).toBe(0);
    expect(Math.max(...out.slice(0, 16))).toBe(255);
    // Outside the crop is untouched, as every other step in this pipeline leaves it.
    expect(out.slice(16, 24)).toEqual(dark);
  });
});

describe("equalize", () => {
  it("spreads a clustered histogram across the range", () => {
    const values = [10, 10, 11, 11, 12, 12, 13, 13];
    const data = ramp([...values, ...values, ...values, ...values]);

    applyProcessing(data, GRAY, query("preset=equalize"));

    const out = channel0(data);
    expect(Math.max(...out)).toBe(255);
    expect(new Set(out).size).toBeGreaterThan(1);
  });

  it("replaces the rescale rather than following it", () => {
    // Both would apply a contrast change twice, and the table was built from the untouched values.
    // The manual window cannot even be requested alongside a preset, so this pins the internal
    // precedence for a caller that builds a Processing by hand.
    const values = [0, 36, 72, 109, 145, 182, 218, 255];
    const alone = ramp([...values, ...values, ...values, ...values]);
    applyProcessing(alone, GRAY, { preset: { kind: "equalize" } });

    const both = ramp([...values, ...values, ...values, ...values]);
    applyProcessing(both, GRAY, { preset: { kind: "equalize" }, rescale: { min: 100, max: 200 } });

    // Identical: the window was ignored, not applied first or second.
    expect(channel0(both)).toEqual(channel0(alone));
    // And genuinely different from what that window alone would have produced.
    const windowed = ramp([...values, ...values, ...values, ...values]);
    applyProcessing(windowed, GRAY, { rescale: { min: 100, max: 200 } });
    expect(channel0(both)).not.toEqual(channel0(windowed));
  });
});

describe("CLAHE", () => {
  it("runs on 8-bit data, after the conversion", () => {
    // `applyProcessing` deliberately ignores it: RULE-032 fixes the order as rescale, threshold,
    // FFT, then the 16-bit conversion, and adaptive equalization of 16-bit samples would be a
    // different operation on different numbers.
    const values = [10, 20, 30, 40, 200, 210, 220, 230];
    const untouched = ramp([...values, ...values, ...values, ...values]);
    applyProcessing(untouched, GRAY, query("preset=clahe"));
    expect(channel0(untouched).slice(0, 8)).toEqual(values);

    const data = ramp([...values, ...values, ...values, ...values]);
    applyClahe(data, GRAY, query("preset=clahe:2:2:2"));

    expect(channel0(data).slice(0, 8)).not.toEqual(values);
  });

  it("writes the same value into all three channels", () => {
    // The source is grayscale, so a viewer reading any channel must see the same number.
    const values = [10, 20, 30, 40, 200, 210, 220, 230];
    const data = ramp([...values, ...values, ...values, ...values]);

    applyClahe(data, GRAY, query("preset=clahe:2:2:2"));

    for (let i = 0; i < data.length; i += 3) {
      expect(data[i + 1]).toBe(data[i]);
      expect(data[i + 2]).toBe(data[i]);
    }
  });

  it("touches only the crop region", () => {
    const values = [10, 20, 30, 40, 200, 210, 220, 230];
    const data = ramp([...values, ...values, ...values, ...values]);

    applyClahe(data, GRAY, query("preset=clahe:2:2:2&crop=0,0,8,2"));

    // The last two rows are outside the crop and unchanged.
    expect(channel0(data).slice(16, 24)).toEqual(values);
  });

  it("does nothing on a COLOUR source", () => {
    // Grayscale only, like the other two: these come from the rescale histogram dialog, which is
    // the grayscale path. A colour image keeps the request and ignores it rather than failing.
    const values = [10, 20, 30, 40, 200, 210, 220, 230];
    const data = ramp([...values, ...values, ...values, ...values]);

    applyClahe(data, { ...GRAY, sourceChannels: 3 }, query("preset=clahe"));

    expect(channel0(data).slice(0, 8)).toEqual(values);
  });
});
