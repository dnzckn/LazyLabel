/**
 * A label file that is not text is refused, not read as "no annotations".
 *
 * `assertText` is what stops a JPEG renamed to `.txt` from winning the load chain and showing an
 * empty canvas. Both YOLO readers call it, and nothing tested it -- which mattered on 2026-09-23,
 * when the NUL it searches for was rewritten from a raw byte in the source to the `\u0000` escape.
 * The raw byte made git treat `labels.ts` as a BINARY file, so every change to this parser had
 * been shown in review as "Binary files differ". The escape is the same string at runtime, and
 * this is what proves it.
 */

import { describe, expect, it } from "vitest";

import { MalformedAnnotationError } from "../../src/format/labels.js";
import { parseYoloDetection } from "../../src/format/yoloDetection.js";
import { parseYoloSegmentation } from "../../src/format/yoloSegmentation.js";

/** A valid line with one NUL in the middle, the way a binary file read as text looks. */
const WITH_NUL = `0 0.5 0.5 0.2 0.2\n${String.fromCharCode(0)}\n`;

describe("a file with a NUL byte in it", () => {
  it("is refused by YOLO Detection, and says it is binary", () => {
    expect(() => parseYoloDetection(WITH_NUL, [100, 200])).toThrow(MalformedAnnotationError);
    expect(() => parseYoloDetection(WITH_NUL, [100, 200])).toThrow(/binary data, not text/);
  });

  it("is refused by YOLO Segmentation", () => {
    const polygon = `0 0.1 0.1 0.2 0.1 0.15 0.2\n${String.fromCharCode(0)}`;

    expect(() => parseYoloSegmentation(polygon, [100, 200])).toThrow(/binary data, not text/);
  });

  it("is not confused with an ordinary control character", () => {
    // Only NUL is the signal. A stray tab or carriage return is text, and CRLF files are ordinary.
    const loaded = parseYoloDetection("0 0.5 0.5 0.2 0.2\r\n", [100, 200]);

    expect(loaded.segments.length).toBe(1);
  });
});
