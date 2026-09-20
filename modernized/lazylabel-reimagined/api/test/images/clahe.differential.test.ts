/**
 * CLAHE matches OpenCV, byte for byte.
 *
 * `test/fixtures/goldens/legacy-clahe.json` holds what `cv2.createCLAHE` actually produces. The cases
 * exercise the three things no description of the algorithm pins down: how clipped histogram mass
 * is redistributed, how tile tables are blended, and what happens where the grid does not divide
 * the image.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { clahe } from "../../src/images/clahe.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "goldens",
  "legacy-clahe.json",
);

interface Case {
  readonly label: string;
  readonly height: number;
  readonly width: number;
  readonly clipLimit: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly input: readonly number[];
  readonly expected: readonly number[];
}

let cases: readonly Case[];

beforeAll(async () => {
  cases = (JSON.parse(await readFile(FIXTURE, "utf8")) as { cases: Case[] }).cases;
});

describe("against OpenCV's own output", () => {
  it("includes a grid that does not divide the image", () => {
    // Without it, the padding and border handling are untested -- and they are where a
    // from-description implementation differs first.
    expect(cases.some((c) => c.width % c.tilesX !== 0 || c.height % c.tilesY !== 0)).toBe(true);
  });

  /**
   * BYTE FOR BYTE ON EVERY CASE, INCLUDING THE UNEVEN GRID.
   *
   * This used to allow a measured gap of three pixels on the 22x30-on-8x8 case, each off by one,
   * with a note saying the residue had to be in how OpenCV's interpolation body formulates its
   * arithmetic rather than in the algorithm. That turned out to be exactly right, and reading
   * `CLAHE_Interpolation_Body` named three things a from-description port gets wrong:
   *
   *   1. **It is `float`, not double.** `float res = ...`, with float weights throughout. Every
   *      operation rounds to single precision, and a double-precision version of the identical
   *      formula lands on the other side of a rounding tie often enough to shift a few pixels.
   *   2. **It multiplies by a reciprocal.** `inv_tw = 1.0f / tileSize.width` computed once, then
   *      `x * inv_tw`. `x * (1/w)` and `x / w` are different numbers in floating point.
   *   3. **The weight comes from the UNCLAMPED tile index.** `tx1 = cvFloor(txf)` gives the
   *      weight, and only then is it clamped into range — so the half-tile border uses a real
   *      fractional weight rather than 0 or 1.
   *
   * With all three, the count went from three to zero. Nothing is allowed now, so any drift shows
   * up immediately rather than hiding under a tolerance.
   */
  it("matches OpenCV byte for byte on every case", () => {
    const failures: string[] = [];

    for (const testCase of cases) {
      const result = clahe(Uint8Array.from(testCase.input), testCase.height, testCase.width, {
        clipLimit: testCase.clipLimit,
        tilesX: testCase.tilesX,
        tilesY: testCase.tilesY,
      });

      let wrong = 0;
      let worst = 0;
      let firstAt = -1;
      for (let i = 0; i < result.length; i += 1) {
        const difference = Math.abs(result[i]! - testCase.expected[i]!);
        if (difference > 0) {
          if (firstAt < 0) firstAt = i;
          wrong += 1;
          if (difference > worst) worst = difference;
        }
      }

      if (wrong > 0) {
        failures.push(
          `${testCase.label}: ${wrong} of ${result.length} bytes differ, worst by ${worst}, `
            + `first at (${firstAt % testCase.width}, ${Math.floor(firstAt / testCase.width)})`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
