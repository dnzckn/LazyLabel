/**
 * The step that puts RULE-028's adjustments on the canvas.
 *
 * `tools/adjustments.ts` proves the arithmetic against legacy. What is proved here is the part
 * around it: that neutral adjustments cost nothing, that the annotations are drawn AFTER so their
 * class colours are untouched, and that a canvas which refuses to be read shows the image rather
 * than nothing.
 */

import { describe, expect, it, vi } from "vitest";

import { applyAdjustments } from "../../src/canvas/AnnotationCanvas.jsx";
import { NEUTRAL } from "../../src/tools/adjustments.js";

/** Enough of a 2D context for this one function, with a buffer a test can inspect. */
function context(pixels: readonly number[]) {
  const data = new Uint8ClampedArray(pixels);
  const frame = { data, width: pixels.length / 4, height: 1 };
  return {
    getImageData: vi.fn(() => frame),
    putImageData: vi.fn(),
    frame,
  };
}

describe("when there is nothing to do", () => {
  it("does not touch the canvas at all", () => {
    // The common case, and it runs on every redraw. Reading a whole image out and writing it back
    // costs four bytes a pixel each way; doing that to change nothing would be felt on a large
    // image.
    const ctx = context([10, 20, 30, 255]);

    applyAdjustments(ctx as unknown as CanvasRenderingContext2D, 1, 1, NEUTRAL);

    expect(ctx.getImageData).not.toHaveBeenCalled();
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });

  it("skips a zero-sized canvas rather than asking for a zero-sized frame", () => {
    // getImageData throws an IndexSizeError on a zero width, which would turn "the image has not
    // been measured yet" into a reported failure.
    const ctx = context([]);

    applyAdjustments(ctx as unknown as CanvasRenderingContext2D, 0, 0, { ...NEUTRAL, contrast: 20 });

    expect(ctx.getImageData).not.toHaveBeenCalled();
  });
});

describe("when there is", () => {
  it("adjusts the pixels and writes them back", () => {
    const ctx = context([100, 100, 100, 255]);

    applyAdjustments(ctx as unknown as CanvasRenderingContext2D, 1, 1, {
      ...NEUTRAL,
      brightness: 50,
    });

    expect(ctx.putImageData).toHaveBeenCalledOnce();
    expect(ctx.frame.data[0]).toBe(150);
  });

  it("leaves the alpha channel alone", () => {
    // Adjusting alpha would fade the image rather than brighten it, and on the overlay it would
    // change how much of the photo shows through.
    const ctx = context([100, 100, 100, 128]);

    applyAdjustments(ctx as unknown as CanvasRenderingContext2D, 1, 1, {
      ...NEUTRAL,
      brightness: 50,
    });

    expect(ctx.frame.data[3]).toBe(128);
  });

  it("reproduces the negative-brightness fold rather than clamping to black", () => {
    // cv2.convertScaleAbs takes the absolute value. A dark pixel darkened comes back BRIGHT, which
    // is legacy's behaviour and is why the panel warns about it.
    const ctx = context([10, 10, 10, 255]);

    applyAdjustments(ctx as unknown as CanvasRenderingContext2D, 1, 1, {
      ...NEUTRAL,
      brightness: -50,
    });

    expect(ctx.frame.data[0]).toBe(40);
  });
});

describe("when the canvas will not be read", () => {
  it("reports it and leaves the image showing", () => {
    // A tainted canvas -- an image served cross-origin without CORS headers. The app's images come
    // from its own API, but a misconfigured deployment must not blank the view.
    const onError = vi.fn();
    const ctx = {
      getImageData: () => {
        throw new Error("SecurityError: tainted canvas");
      },
      putImageData: vi.fn(),
    };

    applyAdjustments(
      ctx as unknown as CanvasRenderingContext2D,
      1,
      1,
      { ...NEUTRAL, brightness: 50 },
      onError,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]).toContain("shown unadjusted");
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });

  it("does not throw when nobody is listening", () => {
    const ctx = {
      getImageData: () => {
        throw new Error("nope");
      },
      putImageData: vi.fn(),
    };

    expect(() =>
      applyAdjustments(ctx as unknown as CanvasRenderingContext2D, 1, 1, {
        ...NEUTRAL,
        brightness: 50,
      }),
    ).not.toThrow();
  });
});
