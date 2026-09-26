/**
 * The Rescale histogram dialog's presets match legacy's pixels, from the file to the picture.
 *
 * `test/fixtures/goldens/legacy-rescale-presets.json` is written by the generator beside it, which
 * runs LEGACY'S OWN CODE rather than a transcription: the dialog is built on the rescale widget's
 * image as the Hist button builds it, its Equalize or CLAHE button (or its Contrast Stretch slider)
 * is used, Apply is pressed, and `get_current_modified_image` produces the pixels. Each file goes
 * through `decodeImage` with the query the web sends for the same state, and the result has to
 * match byte for byte.
 *
 * What only these cases can show:
 *
 *   - A PRESET IS THE RESCALE STEP. It runs first, before the channel threshold and the FFT
 *     (`image_adjustment_manager.py:619-635`), not after the 16-bit conversion as a last step.
 *   - CLAHE ON 16-BIT DATA IS 16-BIT CLAHE: legacy hands the 16-bit image to OpenCV as it is
 *     (`rescale_histogram_dialog.py:67-73`), which equalizes it over 65,536 levels.
 *   - AN EQUALIZATION TABLE REMEMBERS ITS REGION: built from the image the dialog was opened on,
 *     and kept, table and all, when a crop is drawn afterwards (`main_window.py:2837-2845`).
 *   - CONTRAST STRETCH IS A WINDOW, from numpy's percentile, handed to the slider on Apply.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeImage } from "../../src/images/pipeline.js";
import { processingFromQuery } from "../../src/images/processing.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "goldens",
  "legacy-rescale-presets.json",
);

interface Case {
  readonly image: string;
  readonly action: { readonly kind: string };
  readonly cropAtApply: readonly number[] | null;
  readonly cropAfter: readonly number[] | null;
  readonly markers: Readonly<Record<string, readonly number[]>>;
  readonly fft: unknown;
  readonly window: readonly [number, number];
  readonly preset: string | null;
  readonly info: string;
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

function firstDifference(actual: Uint8Array, expected: Uint8Array, width: number): string | null {
  if (actual.length !== expected.length) return `${actual.length} bytes, expected ${expected.length}`;
  let count = 0;
  let first: string | null = null;
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] !== expected[i]) {
      count += 1;
      if (first === null) {
        const pixel = Math.floor(i / 3);
        first = `pixel (${pixel % width}, ${Math.floor(pixel / width)}) channel ${i % 3}: `
          + `${actual[i]}, legacy ${expected[i]}`;
      }
    }
  }
  return first === null ? null : `${count} bytes differ; first at ${first}`;
}

describe("the golden file", () => {
  it("covers both presets and the stretch, 8- and 16-bit, crops before and after, and what follows", () => {
    const kinds = new Set(golden.cases.map((c) => c.action.kind));
    expect([...kinds].sort()).toEqual(["clahe", "equalize", "stretch"]);
    expect(golden.cases.some((c) => c.image === "gray16" && c.action.kind === "clahe")).toBe(true);
    expect(golden.cases.some((c) => c.cropAtApply !== null)).toBe(true);
    expect(golden.cases.some((c) => c.cropAfter !== null && c.action.kind === "equalize")).toBe(true);
    expect(golden.cases.some((c) => Object.keys(c.markers).length > 0 && c.action.kind === "clahe")).toBe(true);
  });
});

describe("the pixels, against legacy's own pipeline", () => {
  for (const testCase of golden.cases) {
    const title = `${testCase.image}: ${JSON.stringify(testCase.action)}`
      + (testCase.cropAfter === null ? "" : ` then a crop`)
      + ` -> ${testCase.query === "" ? "(nothing)" : testCase.query}`;
    it(title, async () => {
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
