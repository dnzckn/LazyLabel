/**
 * The polygon close boundary matches legacy's, at every offset and every threshold.
 *
 * `test/fixtures/legacy-polygon-close.json` holds one grid per join threshold 1..10: for every
 * click offset from -11 to +11 in both axes, whether legacy's own expression closes the polygon.
 * Regenerate it with:
 *
 *     python -c "
 *     import json
 *     def closes(dx, dy, t): return dx**2 + dy**2 < t**2
 *     R = 11
 *     grids = {str(t): [''.join('C' if closes(dx, dy, t) else '.' for dx in range(-R, R+1))
 *                       for dy in range(-R, R+1)] for t in range(1, 11)}
 *     print(json.dumps(grids))"
 *
 * `closes` is transcribed from `polygon_drawing_manager.py:77-86`, which computes
 * `distance_squared = (pos.x() - first.x())**2 + (pos.y() - first.y())**2` and tests
 * `distance_squared < self.mw.polygon_join_threshold**2`.
 *
 * `polygon.test.ts` pins the rule card's worked example and the reasoning. This pins the whole
 * decision surface, which is where a port drifts without anyone noticing: comparing distance to
 * the threshold instead of the squares, or using <= instead of <, is right at the card's example
 * and wrong on a ring of offsets around it.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { click, type PolygonDraft } from "../../src/tools/polygon.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "legacy-polygon-close.json",
);

interface Fixture {
  readonly radius: number;
  readonly grids: Readonly<Record<string, readonly string[]>>;
}

let fixture: Fixture;

beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE, "utf8")) as Fixture;
});

/** Three vertices, so the "more than two" gate is open and only the distance decides. */
const FIRST = { x: 10, y: 10 };
const TRIANGLE: PolygonDraft = {
  vertices: [FIRST, { x: 50, y: 10 }, { x: 50, y: 50 }],
};

describe("the close boundary", () => {
  it("covers every threshold legacy allows", () => {
    expect(Object.keys(fixture.grids).map(Number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("agrees with legacy at every offset, for every threshold", () => {
    const disagreements: string[] = [];

    for (const [threshold, rows] of Object.entries(fixture.grids)) {
      rows.forEach((row, rowIndex) => {
        const dy = rowIndex - fixture.radius;
        [...row].forEach((cell, columnIndex) => {
          const dx = columnIndex - fixture.radius;
          const outcome = click(
            TRIANGLE,
            { x: FIRST.x + dx, y: FIRST.y + dy },
            { joinThreshold: Number(threshold) },
          );
          const ours = outcome.kind === "close" ? "C" : ".";
          if (ours !== cell) {
            disagreements.push(`threshold ${threshold}, offset (${dx},${dy}): legacy ${cell}, ours ${ours}`);
          }
        });
      });
    }

    expect(disagreements).toEqual([]);
  });

  it("is a ring of disagreement if the comparison loses its squares", () => {
    // Guards the guard. If `dx*dx + dy*dy < t*t` were written as `sqrt(...) < t*t` or the squares
    // dropped, the card's own example at (1,1) still passes -- so a test that only checks the card
    // would not notice. Offsets like (2,2) under threshold 3 are where the two disagree.
    const wrongWay = (dx: number, dy: number, t: number) => dx + dy < t;

    expect(wrongWay(2, 2, 3)).toBe(false);
    expect(click(TRIANGLE, { x: 12, y: 12 }, { joinThreshold: 3 }).kind).toBe("close");
  });

  it("closes exactly the 3x3 block at the default threshold", () => {
    // Worth stating as a shape rather than a formula: threshold 2 means the eight pixels around the
    // first vertex and the vertex itself, and nothing else. That is a two-pixel target on screen at
    // 1:1 zoom, which is why the canvas needs the close-range hint.
    const closing: string[] = [];
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (click(TRIANGLE, { x: FIRST.x + dx, y: FIRST.y + dy }, { joinThreshold: 2 }).kind === "close") {
          closing.push(`${dx},${dy}`);
        }
      }
    }

    expect(closing).toEqual([
      "-1,-1", "0,-1", "1,-1",
      "-1,0", "0,0", "1,0",
      "-1,1", "0,1", "1,1",
    ]);
  });
});
