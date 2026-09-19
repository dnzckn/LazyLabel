/**
 * The class colours match the ones Qt produced.
 *
 * `test/fixtures/legacy-class-colors.json` holds what `QColor.fromHsv` returned for every class id
 * from 0 to 99, plus a few larger ones, computed by running the legacy expression from
 * `segment_display_manager.py:239-241`. Regenerate it with:
 *
 *     QT_QPA_PLATFORM=offscreen python -c "
 *     from PyQt6.QtWidgets import QApplication; from PyQt6.QtGui import QColor
 *     import sys, json; app = QApplication(sys.argv)
 *     out = {str(c): list(QColor.fromHsv(int((c*222.4922359)%360), 220, 220).getRgb()[:3])
 *            for c in list(range(100)) + [255, 1000, 10000]}
 *     out['null'] = list(QColor.fromHsv(0,0,128).getRgb()[:3]); print(json.dumps(out))"
 *
 * This is the difference between matching the rule card and matching the application. The card says
 * "hue = int(class_id x 222.4922359) mod 360"; the code says `int((class_id * 222.4922359) % 360)`.
 * Those orders are not obviously the same, and only one of them is what users have been looking at.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { classColor } from "../../src/canvas/classColor.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "legacy-class-colors.json",
);

const { colors } = JSON.parse(await readFile(FIXTURE, "utf-8")) as {
  colors: Record<string, [number, number, number]>;
};

describe("class colours against Qt", () => {
  it("has a fixture with real entries", () => {
    expect(Object.keys(colors).length).toBeGreaterThan(100);
  });

  it("matches Qt exactly for every class id in the fixture", () => {
    for (const [key, expected] of Object.entries(colors)) {
      if (key === "null") continue;
      const { r, g, b } = classColor(Number(key));
      expect([r, g, b], `class ${key}`).toEqual(expected);
    }
  });

  it("matches Qt for a segment with no class", () => {
    const { r, g, b } = classColor(null);
    expect([r, g, b]).toEqual(colors["null"]);
  });

  it("agrees on the first four, which the rule card writes out", () => {
    expect(colors["0"]).toEqual([220, 30, 30]);
    expect(colors["1"]).toEqual([30, 87, 220]);
    expect(colors["2"]).toEqual([144, 220, 30]);
    expect(colors["3"]).toEqual([220, 30, 198]);
  });
});
