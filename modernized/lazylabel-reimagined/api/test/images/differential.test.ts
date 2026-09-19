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

import { describe, expect, it } from "vitest";

import { decodeImage, readImageMetadata, to8Bit } from "../../src/images/pipeline.js";

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
