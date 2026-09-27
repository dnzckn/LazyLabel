/**
 * The image pipeline decodes what OpenCV decodes.
 *
 * Legacy reads every image through `cv2.imread`; this reads them through `sharp`, plus a
 * hand-written BMP decoder for the format sharp does not handle. Those are different decoders, and
 * RULE-024's 16-bit conversion has to come out the same from both — otherwise a 16-bit image looks
 * one way on screen and arrives at SAM another, and the mask comes back a pixel wide of where the
 * user clicked.
 *
 * `tools/generate_image_fixtures.py` writes each fixture together with the pixels cv2 reads from
 * it, BGR reordered to RGB and 16-bit truncated by 256. This decodes the same files and compares.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { decodeImage, isEffectivelyGray, readImageMetadata, to8Bit } from "../../src/images/pipeline.js";
import { processingFromQuery } from "../../src/images/processing.js";

interface Case {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  /** False for JPEG, where two conformant decoders may legitimately differ by a level or two. */
  readonly exact: boolean;
  readonly rgb: string;
}

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "images");
const { cases } = JSON.parse(await readFile(path.join(FIXTURES, "expected.json"), "utf-8")) as {
  cases: Case[];
};

function worstDifference(a: Uint8Array, b: Uint8Array): { at: number; delta: number } {
  let at = -1;
  let delta = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i]! - b[i]!);
    if (d > delta) {
      delta = d;
      at = i;
    }
  }
  return { at, delta };
}

describe("the image pipeline against OpenCV", () => {
  it("has fixtures to compare", () => {
    expect(cases.length).toBeGreaterThan(5);
    expect(cases.some((c) => c.file.endsWith(".bmp"))).toBe(true);
    expect(cases.some((c) => c.file.includes("16"))).toBe(true);
  });

  for (const testCase of cases) {
    it(`decodes ${testCase.file} as OpenCV does`, async () => {
      const bytes = new Uint8Array(await readFile(path.join(FIXTURES, testCase.file)));
      const decoded = await decodeImage(bytes);
      const expected = new Uint8Array(Buffer.from(testCase.rgb, "base64"));

      expect(decoded.width).toBe(testCase.width);
      expect(decoded.height).toBe(testCase.height);
      expect(decoded.data.length).toBe(expected.length);

      const { at, delta } = worstDifference(decoded.data, expected);
      if (testCase.exact) {
        expect(delta, `worst difference ${delta} at byte ${at}`).toBe(0);
      } else {
        // JPEG only. A bound, stated rather than pretended away.
        expect(delta, `worst difference ${delta} at byte ${at}`).toBeLessThanOrEqual(2);
      }
    });
  }

  it("reports the source depth so a caller knows a conversion happened", async () => {
    const wide = await decodeImage(new Uint8Array(await readFile(path.join(FIXTURES, "edges16.tiff"))));
    const narrow = await decodeImage(new Uint8Array(await readFile(path.join(FIXTURES, "gradient8.png"))));

    expect(wide.sourceDepth).toBe(16);
    expect(narrow.sourceDepth).toBe(8);
  });

  it("reads size and depth without decoding the pixels", async () => {
    for (const testCase of cases) {
      const bytes = new Uint8Array(await readFile(path.join(FIXTURES, testCase.file)));
      const metadata = await readImageMetadata(bytes);

      // The dataset browser needs the size to load annotations, and asking should not cost a full
      // decode of a 100-megapixel TIFF.
      expect(metadata.width, testCase.file).toBe(testCase.width);
      expect(metadata.height, testCase.file).toBe(testCase.height);
    }
  });
});

describe("RULE-024's conversion, in isolation", () => {
  it("truncates rather than scaling", () => {
    // The two plausible conversions disagree on exactly these values, and the difference is
    // invisible on screen: 255 truncates to 0 and scales to 1; 511 truncates to 1 and scales to 2.
    const samples = Uint16Array.from([0, 1, 255, 256, 257, 511, 512, 32767, 32768, 65535]);
    expect([...to8Bit(samples)]).toEqual([0, 0, 0, 1, 1, 1, 2, 127, 128, 255]);
  });

  it("agrees with Python's floor division across the whole 16-bit range", () => {
    // Every value, not a sample: the conversion is cheap and being wrong anywhere is being wrong.
    const all = new Uint16Array(65536);
    for (let v = 0; v < 65536; v += 1) all[v] = v;

    const converted = to8Bit(all);
    for (let v = 0; v < 65536; v += 1) {
      expect(converted[v]).toBe(Math.floor(v / 256));
    }
  });
});

/*
 * A DELIBERATE DIFFERENCE FROM LEGACY, the owner's decision of 2026-09-27: "Fix it in the web".
 * Legacy decides gray from int16 differences (image_adjustment_manager.py:556). A sample above
 * 32767 wraps negative, so channels 32768 or more apart come out 65536 minus that far apart, and
 * exactly 32768 apart comes out -32768, which np.abs leaves negative. The web takes the true
 * difference. Each colour case below is gray to legacy's arithmetic.
 */
describe("RULE-024's gray test on 16-bit samples, without legacy's int16 wrap", () => {
  it("calls channels 32768 or more apart colour, where the wrap made them close", () => {
    // int16(65535) - int16(0) is -1 - 0: legacy's difference is 1.
    expect(isEffectivelyGray(Uint16Array.from([65535, 0, 0]))).toBe(false);
    expect(isEffectivelyGray(Uint16Array.from([0, 65535, 0]))).toBe(false);
    expect(isEffectivelyGray(Uint16Array.from([0, 65535, 65535]))).toBe(false);
    // Exactly 32768 apart: legacy's difference is -32768, under any tolerance.
    expect(isEffectivelyGray(Uint16Array.from([0, 32768, 0]))).toBe(false);
    // 64768 apart: legacy's difference is 768, its tolerance exactly.
    expect(isEffectivelyGray(Uint16Array.from([0, 64768, 64768]))).toBe(false);
  });

  it("keeps legacy's tolerance of 768, above the wrap point as below it", () => {
    expect(isEffectivelyGray(Uint16Array.from([1000, 1768, 1000]))).toBe(true);
    expect(isEffectivelyGray(Uint16Array.from([1000, 1769, 1769]))).toBe(false);
    expect(isEffectivelyGray(Uint16Array.from([65535, 64767, 65535]))).toBe(true);
    expect(isEffectivelyGray(Uint16Array.from([40000, 40769, 40769]))).toBe(false);
    expect(isEffectivelyGray(Uint16Array.from([32767, 32768, 33535]))).toBe(true);
  });

  it("shows bright green bright once processing is on, where the red channel showed it black", async () => {
    // Bright green, green just past the wrap point, and black. To legacy this file is gray, and its
    // processing path keeps the red channel alone, which is 0 at every pixel.
    const file = await sharp(Uint16Array.from([0, 65535, 0, 0, 32768, 0, 0, 0, 0]), {
      raw: { width: 3, height: 1, channels: 3 },
    })
      .toColourspace("rgb16")
      .png()
      .toBuffer();
    const bytes = new Uint8Array(file);

    // A colour image's Green bar, one marker below both greens: each goes to the top band.
    const decoded = await decodeImage(bytes, processingFromQuery(new URLSearchParams("markers_g=30000")));
    expect([...decoded.data]).toEqual([0, 255, 0, 0, 255, 0, 0, 0, 0]);
    expect(decoded.sourceChannels).toBe(3);
    expect(await readImageMetadata(bytes)).toMatchObject({ sourceDepth: 16, sourceChannels: 3 });
  });
});
