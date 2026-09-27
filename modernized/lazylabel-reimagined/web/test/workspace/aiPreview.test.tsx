/**
 * An AI suggestion not yet accepted looks as legacy's does: yellow whatever the class, with no
 * outline, at alpha 150 in the single view and 128 in the Multi tab.
 *
 * The owner, 2026-09-27: the "ai suggested segment (not yet accepted) has a thick border looks like,
 * check pyqt6 styling on this try to mimic". Legacy paints the mask as a plain yellow pixmap
 * (ai_segment_manager.py:511 with utils.py:5; main_window.py:6824-6825). This one was painted in
 * the class colour at 0.6. jsdom has no canvas, so the pixels are caught where the preview puts
 * them on its own.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WireSegmentResponse } from "../../src/api/client.js";
import type { ViewKind } from "../../src/canvas/viewKind.js";
import { AiPreview } from "../../src/workspace/AiTool.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The RGBA of each preview painted, caught as it is put on its canvas. */
let painted: Uint8ClampedArray[] = [];

beforeEach(() => {
  painted = [];
  const context = {
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (pixels: { data: Uint8ClampedArray }) => painted.push(pixels.data),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,");
});

/** A 2x2 region at (1, 1) of a 4x4 image, its first and last pixels set. */
function answer(): WireSegmentResponse {
  return {
    mask: { height: 4, width: 4, box: [1, 1, 3, 3], data: btoa(String.fromCharCode(1, 0, 0, 1)) },
    score: 0.9,
    chosen: 0,
    alternatives: [0.9],
  };
}

function preview(view: ViewKind): number[] {
  render(
    <svg>
      <AiPreview result={answer()} view={view} />
    </svg>,
  );
  return [...painted.at(-1)!];
}

describe("an AI suggestion not yet accepted", () => {
  it("is legacy's yellow at 150 in the single view", () => {
    const pixels = preview("single");

    expect(pixels.slice(0, 4)).toEqual([255, 255, 0, 150]);
    expect(pixels.slice(4, 8)).toEqual([0, 0, 0, 0]);
    expect(pixels.slice(12, 16)).toEqual([255, 255, 0, 150]);
  });

  it("is yellow at 128 in the Multi tab", () => {
    const pixels = preview("multi");

    expect(pixels.slice(0, 4)).toEqual([255, 255, 0, 128]);
    expect(pixels.slice(12, 16)).toEqual([255, 255, 0, 128]);
  });

  it("is the mask alone, over its own box, with no outline", () => {
    preview("single");

    const group = screen.getByTestId("ai-mask");
    expect(group.children).toHaveLength(1);
    expect(group.querySelector("[stroke]")).toBeNull();
    const image = screen.getByTestId("ai-preview");
    expect(["x", "y", "width", "height"].map((name) => image.getAttribute(name))).toEqual(["1", "1", "2", "2"]);
  });
});
