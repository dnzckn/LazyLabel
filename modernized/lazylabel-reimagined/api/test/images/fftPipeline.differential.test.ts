/**
 * The FFT Threshold section matches legacy's pixels, from the file to the picture.
 *
 * `test/fixtures/goldens/legacy-fft-pipeline.json` is written by the generator beside it, which
 * runs LEGACY'S OWN CODE: its `FFTThresholdWidget`, with scipy's transform as the application
 * imports it, inside its `ImageAdjustmentManager`, on PNG files. The box is ticked and the
 * thresholds set through the sliders' own `set_indicators`, and `get_current_modified_image`
 * produces the pixels. Each file goes through `decodeImage` with the query the web sends for the
 * same state.
 *
 * What only these cases show:
 *
 *   - THE BOX ALONE CHANGES THE IMAGE. Ticked with no thresholds, legacy's filter still transforms
 *     and stretches (`fft_threshold_widget.py:410-453`); the web sent nothing until a cutoff was set.
 *   - A VALUE ON AN INTENSITY THRESHOLD IS IN THE LEVEL BELOW IT (lines 476-494), where a channel
 *     threshold's marker puts it in the band above.
 *   - CUTOFFS ARE FRACTIONAL, as the frequency bar leaves them.
 *   - THE FILTER RUNS ON THE CROP, and on a 16-bit image legacy's crop region comes out black.
 *     The web's does not: A DELIBERATE DIFFERENCE, the owner's decision of 2026-09-27 ("Fix it in
 *     the web"). Those cases match legacy byte for byte outside the crop, and inside it they are
 *     the filter's result on the region (`widened` below).
 *
 * EXACT, WITH ONE CHARACTERIZED EXCEPTION. With the box alone on an even-sized image the filter is
 * the image transformed and transformed back, so each value comes out a whole number give or take
 * the transform's rounding noise, and truncation keeps it or drops it by one depending on the sign
 * of that noise. Legacy's noise comes from scipy's pocketfft and its twiddle factors from the C
 * runtime's cos and sin, which are not V8's (they disagree on about 4% of pocketfft's twiddle
 * arguments, and neither is correctly rounded), so no port can reproduce it bit for bit. Those
 * cases may differ by exactly one level, and after the intensity levels only where that one level
 * moves a pixel across a threshold. Everything else is byte for byte.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { filterFrequencies } from "../../src/images/fft.js";
import { decodeImage } from "../../src/images/pipeline.js";
import { clampRegion, processingFromQuery } from "../../src/images/processing.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "goldens",
  "legacy-fft-pipeline.json",
);

interface Case {
  readonly image: string;
  readonly frequencies: readonly number[];
  readonly intensities: readonly number[];
  readonly crop: readonly number[] | null;
  readonly window: readonly number[] | null;
  readonly markers: Readonly<Record<string, readonly number[]>>;
  readonly active: boolean;
  readonly query: string;
  readonly width: number;
  readonly height: number;
  readonly rgb: string;
}

const golden = JSON.parse(await readFile(FIXTURE, "utf8")) as {
  readonly images: Readonly<Record<string, string>>;
  readonly cases: readonly Case[];
};

const png = (name: string): Uint8Array => new Uint8Array(Buffer.from(golden.images[name]!, "base64"));
const bytesOf = (testCase: Case): Uint8Array => new Uint8Array(Buffer.from(testCase.rgb, "base64"));

async function ours(image: string, query: string): Promise<Uint8Array> {
  return (await decodeImage(png(image), processingFromQuery(new URLSearchParams(query)))).data;
}

/** The box alone: no cutoffs and nothing before the filter, so the filter is transform and back. */
function boxAlone(testCase: Case): boolean {
  return testCase.frequencies.length === 0 && testCase.window === null && Object.keys(testCase.markers).length === 0;
}

/**
 * A crop on a 16-bit image: the one case the web answers differently, by the owner's decision.
 * The PNG's own header says the depth (IHDR's bit depth, byte 24).
 */
function widened(testCase: Case): boolean {
  return testCase.crop !== null && png(testCase.image)[24] === 16;
}

/**
 * Outside the crop, legacy's pixels byte for byte. Inside it legacy's are all 0, its black region,
 * and the web's are the filter's result on the region at the region's own 16 bits: the function
 * `legacy-fft.json` proves against legacy, and this file's uncropped 16-bit cases in the pipeline.
 */
async function expectWidened(testCase: Case, actual: Uint8Array): Promise<void> {
  const processing = processingFromQuery(new URLSearchParams(testCase.query));
  const { width, height } = testCase;
  const [x1, y1, x2, y2] = clampRegion({ width, height }, processing.crop ?? null);
  const { data } = await sharp(png(testCase.image))
    .removeAlpha()
    .toColourspace("rgb16")
    .raw({ depth: "ushort" })
    .toBuffer({ resolveWithObject: true });
  const wide = new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const across = x2 - x1;
  const plane = Uint16Array.from(
    { length: across * (y2 - y1) },
    (_, i) => wide[((y1 + Math.floor(i / across)) * width + x1 + (i % across)) * 3]!,
  );
  const filtered = filterFrequencies(plane, y2 - y1, across, processing.frequencies ?? [], processing.intensities ?? []);

  const expected = bytesOf(testCase);
  const wrong = { outside: 0, inside: 0, legacyNotBlack: 0 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        const at = (y * width + x) * 3 + c;
        if (x < x1 || x >= x2 || y < y1 || y >= y2) {
          if (actual[at] !== expected[at]) wrong.outside += 1;
          continue;
        }
        if (expected[at] !== 0) wrong.legacyNotBlack += 1;
        if (actual[at] !== filtered[(y - y1) * across + (x - x1)]) wrong.inside += 1;
      }
    }
  }
  expect(wrong).toEqual({ outside: 0, inside: 0, legacyNotBlack: 0 });
  expect(Math.max(...filtered)).toBeGreaterThan(0);
}

function differing(actual: Uint8Array, expected: Uint8Array): number[] {
  const at: number[] = [];
  for (let i = 0; i < actual.length; i += 1) if (actual[i] !== expected[i]) at.push(i);
  return at;
}

describe("the golden file", () => {
  it("covers the box alone, fractions, intensity edges, odd sizes, 16-bit and crops", () => {
    expect(golden.cases.some((c) => c.frequencies.length === 0 && c.intensities.length === 0)).toBe(true);
    expect(golden.cases.some((c) => c.frequencies.some((f) => !Number.isInteger(f)))).toBe(true);
    expect(golden.cases.some((c) => c.image === "odd8")).toBe(true);
    expect(golden.cases.some((c) => c.image === "gray16" && c.crop !== null)).toBe(true);
    expect(golden.cases.some((c) => !c.active)).toBe(true);
  });
});

describe("the pixels, against legacy's own pipeline", () => {
  for (const testCase of golden.cases) {
    it(`${testCase.image} with ${testCase.query}`, async () => {
      const decoded = await decodeImage(png(testCase.image), processingFromQuery(new URLSearchParams(testCase.query)));
      expect([decoded.width, decoded.height]).toEqual([testCase.width, testCase.height]);
      if (widened(testCase)) {
        await expectWidened(testCase, decoded.data);
        return;
      }

      const expected = bytesOf(testCase);
      const off = differing(decoded.data, expected);
      if (off.length === 0) return;

      // Only the box alone may differ at all, and only by legacy's rounding noise.
      expect({ query: testCase.query, boxAlone: boxAlone(testCase) }).toEqual({ query: testCase.query, boxAlone: true });

      if (testCase.intensities.length === 0) {
        // One level, never more.
        for (const i of off) expect(Math.abs(decoded.data[i]! - expected[i]!)).toBe(1);
        return;
      }

      // After the levels: only where the value before them differs by one level, which is legacy's
      // same case without the levels.
      const before = golden.cases.find(
        (c) => c.image === testCase.image && boxAlone(c) && c.intensities.length === 0
          && JSON.stringify(c.crop) === JSON.stringify(testCase.crop),
      )!;
      expect(before).toBeDefined();
      const theirs = bytesOf(before);
      const unlevelled = await ours(before.image, before.query);
      for (const i of off) expect(Math.abs(unlevelled[i]! - theirs[i]!)).toBe(1);
    });
  }

  it("differs from legacy only on the box alone, and exactly everywhere else", async () => {
    // The characterized exception above, counted, so it cannot quietly spread to other cases.
    const inexact: string[] = [];
    for (const testCase of golden.cases) {
      if (widened(testCase)) continue; // the owner's difference, checked case by case above
      const actual = await ours(testCase.image, testCase.query);
      if (differing(actual, bytesOf(testCase)).length > 0) inexact.push(testCase.query);
    }
    expect(inexact.every((query) => !query.includes("frequencies"))).toBe(true);
    expect(golden.cases.filter(widened).map((c) => c.query)).toEqual(["fft=1&frequencies=800&crop=5,4,30,25"]);
    expect(golden.cases.filter((c) => c.frequencies.length > 0).length).toBeGreaterThan(10);
  });
});
