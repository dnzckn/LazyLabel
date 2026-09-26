/**
 * Channel thresholding matches legacy's pixels, from the file to the picture — RULE-029 with
 * RULE-024's channel decision in front of it.
 *
 * `test/fixtures/goldens/legacy-channel-threshold.json` is written by the generator beside it,
 * which runs LEGACY'S OWN CODE rather than a transcription: `ImageAdjustmentManager` decides the
 * channels and `get_current_modified_image` produces the pixels, on PNG files it wrote. Those
 * pixels are what the viewer shows once thresholding is active and what SAM is given under
 * Operate On View. Each file goes through `decodeImage` with the query the web sends for the same
 * markers, and the result has to match byte for byte.
 *
 * Two things only the pixels can show, and the reason the cases include images a header calls
 * colour:
 *
 *   - WHICH CHANNELS EXIST is decided from the pixels. A three-channel file whose channels agree
 *     to within 3 (8-bit) or 768 (16-bit) is one Gray channel (RULE-024), and the web has to offer
 *     one Gray bar for it, as legacy does. Asking the file header answers "colour".
 *   - SUCH AN IMAGE IS PROCESSED AS ITS FIRST CHANNEL. Legacy collapses it to red before
 *     thresholding, so the result is gray, not three near-identical channels thresholded apart.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeImage, readImageMetadata } from "../../src/images/pipeline.js";
import { processingFromQuery } from "../../src/images/processing.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "goldens",
  "legacy-channel-threshold.json",
);

interface Case {
  readonly image: string;
  readonly markers: Readonly<Record<string, readonly number[]>>;
  readonly crop: readonly number[] | null;
  readonly query: string;
  /** The bars legacy's widget offers for this file: ["Gray"], ["Red", "Green", "Blue"] or []. */
  readonly channels: readonly string[];
  readonly active: boolean;
  readonly width: number;
  readonly height: number;
  /** Legacy's result, widened to RGB when it is a single channel, base64. */
  readonly rgb: string;
}

const golden = JSON.parse(await readFile(FIXTURE, "utf8")) as {
  readonly images: Readonly<Record<string, string>>;
  readonly cases: readonly Case[];
};

const png = (name: string): Uint8Array => new Uint8Array(Buffer.from(golden.images[name]!, "base64"));

function firstDifference(actual: Uint8Array, expected: Uint8Array, width: number): string | null {
  if (actual.length !== expected.length) return `${actual.length} bytes, expected ${expected.length}`;
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] !== expected[i]) {
      const pixel = Math.floor(i / 3);
      return `pixel (${pixel % width}, ${Math.floor(pixel / width)}) channel ${i % 3}: `
        + `${actual[i]}, legacy ${expected[i]}`;
    }
  }
  return null;
}

describe("the golden file", () => {
  it("covers gray, colour, near-gray, 16-bit and a crop, or it proves less than it claims", () => {
    const images = new Set(golden.cases.map((c) => c.image));
    for (const name of ["gray8", "rgb8", "neargray8", "gray16", "rgb16", "neargray16"]) {
      expect(images.has(name)).toBe(true);
    }
    expect(golden.cases.some((c) => c.crop !== null)).toBe(true);
  });
});

describe("the pixels, against legacy's own pipeline", () => {
  for (const testCase of golden.cases.filter((c) => c.active)) {
    it(`${testCase.image} with ${testCase.query}`, async () => {
      const decoded = await decodeImage(
        png(testCase.image),
        processingFromQuery(new URLSearchParams(testCase.query)),
      );

      expect([decoded.width, decoded.height]).toEqual([testCase.width, testCase.height]);
      const expected = new Uint8Array(Buffer.from(testCase.rgb, "base64"));
      expect(firstDifference(decoded.data, expected, decoded.width)).toBeNull();
    });
  }
});

describe("which channels an image has, decided as legacy decides it", () => {
  const byImage = new Map(golden.cases.map((c) => [c.image, c.channels]));

  for (const [image, channels] of byImage) {
    // Four-channel colour is the one image legacy offers NO bars for: its channel widget is fed
    // the file with alpha still attached and calls four channels unsupported
    // (image_adjustment_manager.py:510-512; channel_threshold_widget.py:446-450), while its
    // processing path drops alpha and would threshold it happily. The web offers the three bars;
    // that difference is recorded in the report rather than reproduced.
    const expected = channels.length === 1 ? 1 : 3;

    it(`${image}: legacy offers ${channels.length === 0 ? "none" : channels.join(", ")}`, async () => {
      expect((await readImageMetadata(png(image))).sourceChannels).toBe(expected);
      expect((await decodeImage(png(image))).sourceChannels).toBe(expected);
    });
  }
});

describe("an effectively-gray image with nothing asked of it", () => {
  it("keeps its own colours, because legacy shows the file itself until processing is active", async () => {
    // `apply_image_processing_fast` reloads the original pixmap when nothing is active
    // (image_adjustment_manager.py:376-379); the collapse to the first channel happens only on the
    // processing path. So the near-gray file is shown as it is.
    const decoded = await decodeImage(png("neargray8"));
    let differing = 0;
    for (let i = 0; i < decoded.data.length; i += 3) {
      if (decoded.data[i] !== decoded.data[i + 1]) differing += 1;
    }
    expect(differing).toBeGreaterThan(0);
  });
});
