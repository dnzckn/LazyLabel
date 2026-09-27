/**
 * Clicking the image to select an annotation.
 *
 * `tools/selection.test.ts` pins WHICH shape a point hits. This pins that a click reaches that
 * decision with the right coordinate, and the one behaviour that is a judgement call rather than
 * arithmetic: a click on empty space does not clear the selection.
 *
 * What a selection LOOKS like is the canvas's (`test/workspace/selectionHighlight.test.tsx`): this
 * layer draws nothing.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import { SelectLayer } from "../../src/canvas/SelectLayer.jsx";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

const IMAGE = { width: 40, height: 20 };
/** Displayed at double size and offset, so neither scale nor origin is the identity. */
const RECT = { left: 12, top: 6, width: 80, height: 40, right: 92, bottom: 46, x: 12, y: 6 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

const square: WireSegment = {
  type: "Polygon",
  classId: 1,
  vertices: [[5, 5], [15, 5], [15, 15], [5, 15]],
};

const other: WireSegment = {
  type: "Polygon",
  classId: 2,
  vertices: [[25, 2], [35, 2], [35, 12], [25, 12]],
};

function layer() {
  const onToggle = vi.fn();
  const onMiss = vi.fn();

  renderWithSettings(
    <SelectLayer
      width={IMAGE.width}
      height={IMAGE.height}
      segments={[square, other]}
      onToggle={onToggle}
      onMiss={onMiss}
    />,
  );

  return { onToggle, onMiss, surface: screen.getByLabelText("Selection tool") };
}

/** Click at an IMAGE coordinate, converted through the display box as the DOM would. */
function clickAt(surface: Element, x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerDown(surface, {
    button: 0,
    clientX: RECT.left + (x / IMAGE.width) * RECT.width,
    clientY: RECT.top + (y / IMAGE.height) * RECT.height,
    ...init,
  });
}

describe("selecting by clicking", () => {
  it("toggles the annotation under the pointer", () => {
    const { surface, onToggle } = layer();
    clickAt(surface, 10, 10);

    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it("maps the click through the display box, not straight from client coordinates", () => {
    // The canvas is at double size and offset. Using clientX directly would land at (28,34) --
    // outside both shapes -- and the tool would look like it never selects anything.
    const { surface, onToggle } = layer();
    clickAt(surface, 30, 7);

    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it("reports a miss instead of selecting something nearby", () => {
    const { surface, onToggle, onMiss } = layer();
    clickAt(surface, 20, 18);

    expect(onToggle).not.toHaveBeenCalled();
    expect(onMiss).toHaveBeenCalledTimes(1);
  });

  it("does NOT clear the selection on a miss", () => {
    // Selection toggles, so building a multi-shape selection takes several clicks, and a near-miss
    // between two of them would otherwise throw the work away. Clearing is an explicit button.
    // Toggling is the only way this layer changes the selection, so no toggle is no change.
    const { surface, onToggle, onMiss } = layer();
    clickAt(surface, 20, 18);

    expect(onToggle).not.toHaveBeenCalled();
    expect(onMiss).toHaveBeenCalledTimes(1);
  });

  it("ignores a right-click", () => {
    const { surface, onToggle, onMiss } = layer();
    clickAt(surface, 10, 10, { button: 2 });

    expect(onToggle).not.toHaveBeenCalled();
    expect(onMiss).not.toHaveBeenCalled();
  });

  it("ignores a click outside the image", () => {
    const { surface, onToggle, onMiss } = layer();
    fireEvent.pointerDown(surface, { button: 0, clientX: 0, clientY: 0 });

    expect(onToggle).not.toHaveBeenCalled();
    expect(onMiss).not.toHaveBeenCalled();
  });
});

describe("what it draws", () => {
  it("draws nothing: no fill and no outline over the canvas's highlight", () => {
    // Legacy's selection is one yellow overlay at alpha 180 with a transparent pen
    // (segment_display_manager.py:515-529), and the canvas paints it. This layer drew a second fill
    // and a yellow outline twice the line width over it until 2026-09-27.
    const { surface } = layer();

    expect(surface.children).toHaveLength(0);
    expect(surface.querySelector("[stroke], [fill]")).toBeNull();
  });
});
