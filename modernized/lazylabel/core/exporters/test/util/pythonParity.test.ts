/**
 * Parity with CPython for the three helpers whose output reaches annotation files verbatim.
 *
 * The expected values in python-expectations.json were produced by CPython 3.10 in the project
 * venv, not by this implementation, so these are characterization tests rather than a restatement
 * of the code. Regenerate them with the snippet in tools/README.md if the corpus needs extending.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { pyRepr } from "../../src/format/pyRepr.js";
import { pythonJsonDumps } from "../../src/util/pythonJson.js";
import { stripExtension } from "../../src/paths.js";
import { roundHalfToEven } from "../../src/util/pyNumbers.js";

interface Expectations {
  repr: [string, number][];
  splitext: [string, string][];
  json: string;
  rounding: [number, number][];
}

const expectations = JSON.parse(
  readFileSync(join(import.meta.dirname, "python-expectations.json"), "utf-8"),
) as Expectations;

describe("Python parity", () => {
  // RULE-005: the YOLO writers interpolate floats straight into the line, so layout is the contract.
  // legacy: core/exporters/yolo_detection.py:33, yolo_segmentation.py:39-43
  it("formats floats exactly as Python's repr", () => {
    const wrong: string[] = [];
    for (const [expected, value] of expectations.repr) {
      const actual = pyRepr(value);
      if (actual !== expected) wrong.push(`${value}: got ${actual}, Python gives ${expected}`);
    }
    expect(wrong).toEqual([]);
  });

  it("differs from naive String() where Python does", () => {
    // Guards against someone "simplifying" pyRepr into String(v).
    expect(pyRepr(1)).toBe("1.0");
    expect(String(1)).toBe("1");
    expect(pyRepr(6.103515625e-5)).toBe("6.103515625e-05");
    expect(String(6.103515625e-5)).toBe("0.00006103515625");
  });

  // RULE-001: COCO and CreateML are written with json.dump(..., indent=2), ensure_ascii on.
  // legacy: core/exporters/coco.py:95, createml.py:63
  it("serializes JSON exactly as json.dump with indent=2", () => {
    const document = {
      images: [{ id: 1, file_name: "s.png", width: 30, height: 20 }],
      annotations: [{ id: 1, bbox: [1, 2, 3, 4], iscrowd: 0, segmentation: [[1, 2, 3, 4, 5, 6]] }],
      categories: [
        { id: 5, name: "細胞", supercategory: "細胞" },
        { id: 1, name: 'a"b\\c', supercategory: "x\ny" },
      ],
    };
    expect(pythonJsonDumps(document)).toBe(expectations.json);
  });

  // The file name a format writes comes from os.path.splitext, which keeps leading dots.
  // legacy: every exporter's get_output_path, e.g. yolo_segmentation.py:56
  it("strips extensions exactly as os.path.splitext", () => {
    const wrong: string[] = [];
    for (const [path, expected] of expectations.splitext) {
      const actual = stripExtension(path);
      if (actual !== expected) wrong.push(`${path}: got ${actual}, Python gives ${expected}`);
    }
    expect(wrong).toEqual([]);
  });

  // RULE-040 and RULE-041: every importer denormalizes with int(round(v)), which is half-to-even.
  // legacy: core/file_manager.py:446-449 and :573
  it("rounds ties to even, as Python's round does", () => {
    for (const [value, expected] of expectations.rounding) {
      expect(roundHalfToEven(value), `round(${value})`).toBe(expected);
    }
    // The divergence that moves a box edge: JavaScript sends ties upward.
    expect(roundHalfToEven(102.5)).toBe(102);
    expect(Math.round(102.5)).toBe(103);
  });
});
