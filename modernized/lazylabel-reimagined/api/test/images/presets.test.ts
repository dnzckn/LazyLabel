/**
 * The Rescale histogram dialog's two presets, as the processing query asks for them.
 *
 * Legacy's dialog has three ways to set a rescale: Contrast Stretch, Equalize and CLAHE
 * (`rescale_histogram_dialog.py:367-453`). Contrast Stretch moves the min and max lines and Apply
 * hands them to the slider, so it arrives as an ordinary window. The other two leave a PRESET in
 * the rescale widget, which replaces its linear window while it is set (`rescale_widget.py:363-370`)
 * and sits first in the chain, before the channel threshold (`image_adjustment_manager.py:619-630`).
 *
 * The pixels are held to legacy's own pipeline in `rescalePresets.differential.test.ts`. What is
 * tested here is the query and the order.
 */

import { describe, expect, it } from "vitest";

import {
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

const channel0 = (data: Uint8Array | Uint16Array): number[] =>
  [...data].filter((_, i) => i % 3 === 0);

const query = (raw: string): Processing => processingFromQuery(new URLSearchParams(raw));

describe("asking for a preset", () => {
  it("parses both, and the region an equalization table comes from", () => {
    expect(query("preset=equalize").preset).toEqual({ kind: "equalize" });
    expect(query("preset=equalize:1,2,7,4").preset).toEqual({ kind: "equalize", source: [1, 2, 7, 4] });
    expect(query("preset=clahe:3:4:6").preset).toEqual({
      kind: "clahe",
      clipLimit: 3,
      tilesX: 4,
      tilesY: 6,
    });
    // Python writes the dialog's clip as a float, "2.0".
    expect(query("preset=clahe:2.0:8:8").preset).toEqual({ kind: "clahe", clipLimit: 2, tilesX: 8, tilesY: 8 });
  });

  it("uses the dialog's defaults when the parameters are left off", () => {
    // Clip 2.0 and 8 tiles (rescale_histogram_dialog.py:428-441).
    expect(query("preset=clahe").preset).toEqual({
      kind: "clahe",
      clipLimit: 2,
      tilesX: 8,
      tilesY: 8,
    });
  });

  it("REFUSES a value outside the dialog's range rather than clamping it", () => {
    expect(() => query("preset=clahe:100")).toThrow(/0.5 to 40/);
    expect(() => query("preset=clahe:2:1")).toThrow(/2 to 32/);
    expect(() => query("preset=equalize:1,2,3")).toThrow(/x1,y1,x2,y2/);
    expect(() => query("preset=sharpen")).toThrow(/equalize or clahe/);
  });

  it("has no contrast-stretch preset: the dialog's stretch arrives as a window", () => {
    // Its Apply sends the min and max lines to the slider (rescale_histogram_dialog.py:576-580).
    expect(() => query("preset=stretch:0.4")).toThrow(/equalize or clahe/);
  });

  it("refuses a preset AND a manual window together", () => {
    // A request carrying both is a client that has lost track of which the user chose.
    expect(() => query("preset=equalize&rescaleMin=10&rescaleMax=200")).toThrow(/cannot both/);
  });

  it("counts as processing, so the pipeline does not skip it", () => {
    expect(isEmpty(query("preset=equalize"))).toBe(false);
    expect(isEmpty(query("preset=clahe"))).toBe(false);
    expect(isEmpty(query(""))).toBe(true);
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

  it("builds its table from the region it names, and applies it inside the crop", () => {
    // Legacy builds the table once, from the region the dialog was opened on, and keeps it when a
    // crop is drawn afterwards (main_window.py:2837-2845).
    const bright = [200, 210, 220, 230, 200, 210, 220, 230];
    const dark = [0, 5, 10, 15, 0, 5, 10, 15];

    const fromWhole = ramp([...bright, ...bright, ...dark, ...dark]);
    applyProcessing(fromWhole, GRAY, query("preset=equalize:0,0,8,4&crop=0,2,8,4"));

    const fromCrop = ramp([...bright, ...bright, ...dark, ...dark]);
    applyProcessing(fromCrop, GRAY, query("preset=equalize&crop=0,2,8,4"));

    // Outside the crop nothing moves either way.
    expect(channel0(fromWhole).slice(0, 16)).toEqual([...bright, ...bright]);
    expect(channel0(fromCrop).slice(0, 16)).toEqual([...bright, ...bright]);
    // Inside it, a table over the whole image puts the dark rows in its bottom half; one over the
    // dark rows alone spreads them over the whole range.
    expect(Math.max(...channel0(fromWhole).slice(16))).toBeLessThan(255);
    expect(Math.max(...channel0(fromCrop).slice(16))).toBe(255);
  });

  it("replaces the rescale window rather than following it", () => {
    // Legacy applies its table instead of the linear window while one is set
    // (rescale_widget.py:368-370). The query cannot carry both; this pins the internal precedence
    // for a caller that builds a Processing by hand.
    const values = [0, 36, 72, 109, 145, 182, 218, 255];
    const alone = ramp([...values, ...values, ...values, ...values]);
    applyProcessing(alone, GRAY, { preset: { kind: "equalize" } });

    const both = ramp([...values, ...values, ...values, ...values]);
    applyProcessing(both, GRAY, { preset: { kind: "equalize" }, rescale: { min: 100, max: 200 } });

    expect(channel0(both)).toEqual(channel0(alone));
  });
});

describe("CLAHE", () => {
  it("runs in the rescale step, BEFORE the channel threshold", () => {
    // Legacy's CLAHE picture replaces the image in the rescale step (rescale_widget.py:397-406),
    // and the threshold is applied to what comes out of it (image_adjustment_manager.py:619-630).
    const values = [10, 20, 30, 40, 200, 210, 220, 230];
    const clahed = ramp([...values, ...values, ...values, ...values]);
    applyProcessing(clahed, GRAY, query("preset=clahe:2:2:2"));

    const both = ramp([...values, ...values, ...values, ...values]);
    applyProcessing(both, GRAY, query("preset=clahe:2:2:2&markers_gray=128"));

    expect(channel0(both)).toEqual(channel0(clahed).map((v) => (v < 128 ? 0 : 255)));
  });

  it("equalizes 16-bit data at 16 bits, as OpenCV does for legacy", () => {
    // Four 16-bit values that the 8-bit conversion would merge into two.
    const values = [4000, 4100, 4200, 4300, 60000, 60100, 60200, 60300];
    const wide = Uint16Array.from([...values, ...values, ...values, ...values].flatMap((v) => [v, v, v]));

    applyProcessing(wide, GRAY, query("preset=clahe:2:2:2"));

    const out = channel0(wide);
    expect(Math.max(...out)).toBeGreaterThan(255);
    expect(new Set(out.slice(0, 4)).size).toBe(4);
  });

  it("writes the same value into all three channels", () => {
    const values = [10, 20, 30, 40, 200, 210, 220, 230];
    const data = ramp([...values, ...values, ...values, ...values]);

    applyProcessing(data, GRAY, query("preset=clahe:2:2:2"));

    for (let i = 0; i < data.length; i += 3) {
      expect(data[i + 1]).toBe(data[i]);
      expect(data[i + 2]).toBe(data[i]);
    }
  });

  it("touches only the crop region", () => {
    const values = [10, 20, 30, 40, 200, 210, 220, 230];
    const data = ramp([...values, ...values, ...values, ...values]);

    applyProcessing(data, GRAY, query("preset=clahe:2:2:2&crop=0,0,8,2"));

    expect(channel0(data).slice(0, 8)).not.toEqual(values);
    // The last two rows are outside the crop and unchanged.
    expect(channel0(data).slice(16, 24)).toEqual(values);
  });

  it("does nothing on a COLOUR source", () => {
    // Legacy disables the whole Rescale widget for colour (rescale_widget.py:278-283).
    const values = [10, 20, 30, 40, 200, 210, 220, 230];
    const data = ramp([...values, ...values, ...values, ...values]);

    applyProcessing(data, { ...GRAY, sourceChannels: 3 }, query("preset=clahe"));

    expect(channel0(data).slice(0, 8)).toEqual(values);
  });
});
