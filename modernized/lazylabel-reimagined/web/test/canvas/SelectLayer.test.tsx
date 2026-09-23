/**
 * Clicking the image to select an annotation.
 *
 * `tools/selection.test.ts` pins WHICH shape a point hits. This pins that a click reaches that
 * decision with the right coordinate, and the one behaviour that is a judgement call rather than
 * arithmetic: a click on empty space does not clear the selection.
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

function layer(selected: readonly number[] = []) {
  const onToggle = vi.fn();
  const onMiss = vi.fn();

  renderWithSettings(
    <SelectLayer
      width={IMAGE.width}
      height={IMAGE.height}
      segments={[square, other]}
      selected={selected}
      onToggle={onToggle}
      onMiss={onMiss}
    />,
  );

  return { onToggle, onMiss, surface: screen.getByLabelText("Selection tool") };
}

describe("an outline drawn before any click", () => {
  it("is sized in screen pixels from the first paint", () => {
    // The layer was measured only during render, and the first render comes before the surface
    // exists. At the image's own size that cannot show; this harness displays it at double size,
    // where a measured outline is half as wide in image units.
    const OWN = { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20, x: 0, y: 0 };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...OWN, toJSON: () => OWN } as DOMRect);
    layer([0]);
    const atOwnSize = Number(screen.getByTestId("outline-0").getAttribute("stroke-width"));
    cleanup();

    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...RECT, toJSON: () => RECT } as DOMRect);
    layer([0]);

    expect(Number(screen.getByTestId("outline-0").getAttribute("stroke-width"))).toBeCloseTo(atOwnSize / 2, 5);
  });
});

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
    const { surface, onToggle } = layer([0]);
    clickAt(surface, 20, 18);

    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByTestId("outline-0")).not.toBeNull();
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

describe("showing what is selected", () => {
  it("outlines only the selected shapes", () => {
    // Outlining everything would repeat what the canvas underneath already draws, and hide the one
    // thing this layer exists to show.
    layer([1]);

    expect(screen.queryByTestId("outline-1")).not.toBeNull();
    expect(screen.queryByTestId("outline-0")).toBeNull();
  });

  it("outlines several at once", () => {
    layer([0, 1]);

    expect(screen.queryByTestId("outline-0")).not.toBeNull();
    expect(screen.queryByTestId("outline-1")).not.toBeNull();
  });

  it("draws nothing for a selected mask, which has no outline to draw", () => {
    const onToggle = vi.fn();
    renderWithSettings(
      <SelectLayer
        width={IMAGE.width}
        height={IMAGE.height}
        segments={[{ type: "AI", classId: 0 }]}
        selected={[0]}
        onToggle={onToggle}
      />,
    );

    expect(screen.queryByTestId("outline-0")).toBeNull();
  });
});
