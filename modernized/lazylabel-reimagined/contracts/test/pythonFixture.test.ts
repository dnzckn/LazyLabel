/**
 * The Python encoder and this decoder must agree.
 *
 * The inference service is Python and the web app is TypeScript, so the bounded mask format has two
 * implementations — the one thing `@lazylabel/contracts` exists to prevent, and unavoidable here
 * because the two sides cannot share code across languages. What CAN be shared is the evidence:
 * `test/fixtures/python-masks.json` was produced by `lazylabel_inference.service.encode_mask`, and
 * this decodes it and checks every pixel.
 *
 * A mask that decodes wrong in a browser and nowhere else is the hardest kind of bug to find, and
 * the cases below are the ones where an off-by-one would hide: a single pixel, a single row, a
 * single column, a full-image mask, an empty mask, and two blobs whose bounding box contains a lot
 * of nothing.
 *
 * Regenerate the fixture with `inference/tools/generate_mask_fixture.py` after any change to either
 * encoder.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeMask, type WireMask } from "../src/wire.js";

interface Case {
  readonly name: string;
  readonly wire: WireMask;
  /** Every set pixel as [x, y], sorted. The ground truth the decode must reconstruct. */
  readonly setPixels: readonly (readonly [number, number])[];
}

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "python-masks.json",
);

const { cases } = JSON.parse(await readFile(FIXTURE, "utf-8")) as { cases: Case[] };

/** The set pixels of a decoded mask, as [x, y], sorted the same way Python sorted them. */
function setPixelsOf(mask: ReturnType<typeof decodeMask>): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x] !== 0) out.push([x, y]);
    }
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

describe("masks encoded by the Python inference service", () => {
  it("has a fixture with cases in it", () => {
    // A fixture that silently became empty would make every test below vacuously true.
    expect(cases.length).toBeGreaterThan(5);
  });

  it("carries bits from Python, apart from the one case kept at a byte per pixel", () => {
    // Bit packing is what brought the spec's latency tail under budget (2026-09-23). A generator
    // that stopped packing would still decode, and would quietly put the megabytes back.
    for (const testCase of cases) {
      const expected = testCase.name.startsWith("a byte per pixel") || testCase.wire.box === null ? undefined : "bits";
      expect(testCase.wire.packing, testCase.name).toBe(expected);
    }
  });

  for (const testCase of cases) {
    it(`decodes "${testCase.name}" to exactly the pixels Python encoded`, () => {
      const decoded = decodeMask(testCase.wire);

      expect(decoded.height).toBe(testCase.wire.height);
      expect(decoded.width).toBe(testCase.wire.width);

      const expected = testCase.setPixels.map(([x, y]) => [x, y] as [number, number]);
      expected.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      expect(setPixelsOf(decoded)).toEqual(expected);
    });
  }

  it("agrees with Python about the bounding box, not merely about the pixels", () => {
    // Same pixels from a different box would still be a format disagreement: the box is what the
    // API and the browser use to place the mask without decoding it.
    const rectangle = cases.find((c) => c.name === "a rectangle");
    expect(rectangle?.wire.box).toEqual([30, 40, 140, 120]);
  });

  it("represents an empty mask as a null box on both sides", () => {
    const empty = cases.find((c) => c.name === "empty");
    expect(empty?.wire.box).toBeNull();
    expect(empty?.wire.data).toBe("");
    expect(decodeMask(empty!.wire).data.some((v) => v !== 0)).toBe(false);
  });
});
