/**
 * Loader for the OpenCV ground-truth corpus.
 *
 * `opencv-corpus.json` is produced by `generate_corpus.py` running against OpenCV
 * 4.12.0 in the project venv; it is committed so the suite needs no Python. Nothing in
 * here derives an expectation from the TypeScript implementation - every number in the
 * file came out of OpenCV.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BinaryMask } from "../../src/types.js";

export interface ApproxCase {
  readonly eps: number;
  readonly closed: boolean;
  readonly out: readonly (readonly [number, number])[];
}

export interface ContourCase {
  readonly points: readonly (readonly [number, number])[];
  readonly arcLengthClosed: number;
  readonly arcLengthOpen: number;
  readonly boundingRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly area: number;
  readonly areaOriented: number;
  readonly approx: readonly ApproxCase[];
}

export interface MaskCase {
  readonly name: string;
  readonly height: number;
  readonly width: number;
  /** Run-length encoding, alternating runs starting with a run of zeros. */
  readonly mask: readonly number[];
  readonly contoursNone: readonly (readonly (readonly [number, number])[])[];
  readonly contours: readonly ContourCase[];
}

export interface FillPolyCase {
  readonly name: string;
  readonly height: number;
  readonly width: number;
  readonly polygons: readonly (readonly (readonly [number, number])[])[];
  readonly mask: readonly number[];
}

export interface CircleCase {
  readonly name: string;
  readonly height: number;
  readonly width: number;
  readonly centre: readonly [number, number];
  readonly radius: number;
  readonly mask: readonly number[];
}

export interface CurveCase extends ContourCase {
  readonly name: string;
}

export interface Corpus {
  readonly generatedBy: string;
  readonly opencv: string;
  readonly numpy: string;
  readonly python: string;
  readonly seed: number;
  readonly masks: readonly MaskCase[];
  readonly fillPoly: readonly FillPolyCase[];
  readonly circles: readonly CircleCase[];
  readonly curves: readonly CurveCase[];
}

const here = dirname(fileURLToPath(import.meta.url));

export const corpus: Corpus = JSON.parse(
  readFileSync(join(here, "opencv-corpus.json"), "utf8"),
) as Corpus;

/** Expand the run-length encoding back into a row-major binary mask. */
export function decodeMask(
  height: number,
  width: number,
  runs: readonly number[],
): BinaryMask {
  const data = new Uint8Array(height * width);
  let at = 0;
  let value = 0;
  for (const run of runs) {
    if (value === 1 && run > 0) data.fill(1, at, at + run);
    at += run;
    value ^= 1;
  }
  if (at !== height * width) {
    throw new Error(`corrupt corpus mask: ${at} pixels encoded, ${height * width} expected`);
  }
  return { height, width, data };
}

/** Compare doubles exactly, but treat -0 and 0 as the same value (Python prints -0.0). */
export function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Turn a mask into a list of set pixels, so a failure names the pixels that differ. */
export function setPixels(mask: BinaryMask): string[] {
  const out: string[] = [];
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x] !== 0) out.push(`${x},${y}`);
    }
  }
  return out;
}
