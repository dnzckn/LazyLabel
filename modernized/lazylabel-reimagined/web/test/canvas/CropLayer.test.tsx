/**
 * Dragging a crop on the image — RULE-018's other half.
 *
 * `cropFromDrag` was written, tested and reached by nothing: the panel takes two typed ranges and
 * that was the only way in. Typing `120:880` is a fine way to repeat a crop you already know and a
 * poor way to find one, which is what a user is doing the first time.
 *
 * The rule's arithmetic is tested in `tools/crop.test.ts`. What is tested here is the gesture, and
 * one thing about the drawing that is not decoration: the preview shows what is being REMOVED.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CropLayer } from "../../src/canvas/CropLayer.jsx";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

const IMAGE = { width: 100, height: 50 };
/** Displayed at double size and offset, so a port that used clientX raw would be caught. */
const RECT = { left: 30, top: 10, width: 200, height: 100, right: 230, bottom: 110, x: 30, y: 10 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

function layer(crop: { x1: number; y1: number; x2: number; y2: number } | null = null) {
  const onCrop = vi.fn();
  const onRefused = vi.fn();
  renderWithSettings(
    <CropLayer
      width={IMAGE.width}
      height={IMAGE.height}
      crop={crop}
      onCrop={onCrop}
      onRefused={onRefused}
    />,
  );
  return { onCrop, onRefused, surface: screen.getByLabelText("Crop tool") };
}

/** An image coordinate, converted back through the display box the way the DOM would. */
const at = (x: number, y: number) => ({
  button: 0,
  pointerId: 1,
  clientX: RECT.left + (x / IMAGE.width) * RECT.width,
  clientY: RECT.top + (y / IMAGE.height) * RECT.height,
});

function drag(surface: Element, from: readonly [number, number], to: readonly [number, number]) {
  fireEvent.pointerDown(surface, at(from[0], from[1]));
  fireEvent.pointerMove(surface, at(to[0], to[1]));
  fireEvent.pointerUp(surface, at(to[0], to[1]));
}

describe("dragging a crop", () => {
  it("reports the dragged rectangle", () => {
    const { onCrop, surface } = layer();

    drag(surface, [10, 5], [60, 40]);

    expect(onCrop).toHaveBeenCalledTimes(1);
    const crop = onCrop.mock.calls[0]![0];
    expect(crop.x1).toBe(10);
    expect(crop.y1).toBe(5);
    expect(crop.x2).toBeGreaterThan(55);
    expect(crop.y2).toBeGreaterThan(35);
  });

  it("works dragged in any direction", () => {
    // Bottom-right to top-left is the same rectangle. A user does not decide which corner to start
    // from, and legacy normalizes too.
    const { onCrop, surface } = layer();

    drag(surface, [60, 40], [10, 5]);

    const crop = onCrop.mock.calls[0]![0];
    expect(crop.x1).toBe(10);
    expect(crop.y1).toBe(5);
  });

  it("REFUSES a drag too small, with its size", () => {
    // Legacy discards it without a word. A user who has just dragged something is owed an answer,
    // and the number tells them whether they missed by a little or a lot.
    const { onCrop, onRefused, surface } = layer();

    drag(surface, [10, 10], [12, 11]);

    expect(onCrop).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0]![0]).toMatch(/must be more than .* pixels/);
  });

  it("uses the RELEASE position, not the last move", () => {
    // A fast drag can deliver no move at all between press and release -- the browser may coalesce
    // them -- and measuring the last move would refuse a drag the user plainly made.
    const { onCrop, surface } = layer();

    fireEvent.pointerDown(surface, at(10, 5));
    fireEvent.pointerUp(surface, at(70, 45));

    expect(onCrop).toHaveBeenCalledTimes(1);
    expect(onCrop.mock.calls[0]![0].x2).toBeGreaterThan(65);
  });

  it("abandons the drag on Escape, committing nothing", () => {
    const { onCrop, onRefused, surface } = layer();

    fireEvent.pointerDown(surface, at(10, 5));
    fireEvent.pointerMove(surface, at(60, 40));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerUp(surface, at(60, 40));

    expect(onCrop).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
  });

  it("ignores a right-click, which is a context menu", () => {
    const { onCrop, surface } = layer();

    fireEvent.pointerDown(surface, { ...at(10, 5), button: 2 });
    fireEvent.pointerUp(surface, at(60, 40));

    expect(onCrop).not.toHaveBeenCalled();
  });
});

describe("what the preview shows", () => {
  it("draws the REMOVED surround, not an outline round the kept part", () => {
    // A crop blanks every mask pixel outside it on save. An outline says "here is a thing I
    // added"; a dimmed surround says "everything out here is going away", which is what happens.
    const { surface } = layer();
    fireEvent.pointerDown(surface, at(20, 10));
    fireEvent.pointerMove(surface, at(80, 40));

    const surround = screen.getByTestId("crop-surround");
    const rects = [...surround.querySelectorAll("rect")];
    expect(rects).toHaveLength(4);
    // The top band spans the full width and stops where the crop starts.
    expect(rects[0]!.getAttribute("width")).toBe(String(IMAGE.width));
    expect(rects[0]!.getAttribute("height")).toBe("10");
  });

  it("shows the crop already in force before any drag", () => {
    // So a user can see what they are about to replace rather than dragging blind over it.
    layer({ x1: 5, y1: 5, x2: 50, y2: 30 });

    expect(screen.getByTestId("crop-surround")).toBeTruthy();
  });

  it("shows nothing when there is no crop and no drag", () => {
    layer();

    expect(screen.queryByTestId("crop-surround")).toBeNull();
  });
});
