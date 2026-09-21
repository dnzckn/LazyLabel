/**
 * Dragging the zoomed image around — legacy's hand mode, the last of the six zoom-and-pan keys.
 *
 * The counterpart to the four `pan_*` keys: they move by a step, this by however far the hand
 * goes. Both scroll the PANE rather than transforming the canvas, so there is one way to position
 * the image and the scrollbar cannot disagree with it.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";

import { PanLayer } from "../../src/canvas/PanLayer.jsx";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

function layer(multiplier?: number) {
  const scrollBy = vi.fn();
  const pane = createRef<HTMLDivElement>();
  (pane as { current: unknown }).current = { scrollBy };
  renderWithSettings(
    <PanLayer
      width={100}
      height={50}
      pane={pane}
      {...(multiplier === undefined ? {} : { multiplier })}
    />,
  );
  return { scrollBy, surface: screen.getByLabelText("Pan tool") };
}

const at = (x: number, y: number) => ({ button: 0, pointerId: 1, clientX: x, clientY: y });

describe("dragging to pan", () => {
  it("scrolls OPPOSITE the pointer, which is what grabbing the picture means", () => {
    // Dragging the image right moves the view left. Scrolling the same way as the drag would feel
    // like dragging a scrollbar, and this is not one.
    const { scrollBy, surface } = layer();

    fireEvent.pointerDown(surface, at(100, 100));
    fireEvent.pointerMove(surface, at(130, 120));

    expect(scrollBy).toHaveBeenCalledWith({ left: -30, top: -20, behavior: "auto" });
  });

  it("scales by the pan multiplier, the same factor the arrow keys use", () => {
    const { scrollBy, surface } = layer(2);

    fireEvent.pointerDown(surface, at(100, 100));
    fireEvent.pointerMove(surface, at(90, 100));

    expect(scrollBy).toHaveBeenCalledWith({ left: 20, top: 0, behavior: "auto" });
  });

  it("measures each move from the LAST one, so a drag does not accelerate", () => {
    // Measuring from the press would make every frame of one drag scroll further than the last.
    const { scrollBy, surface } = layer();

    fireEvent.pointerDown(surface, at(100, 100));
    fireEvent.pointerMove(surface, at(90, 100));
    fireEvent.pointerMove(surface, at(80, 100));

    expect(scrollBy).toHaveBeenLastCalledWith({ left: 10, top: 0, behavior: "auto" });
  });

  it("does nothing until a drag starts, and stops when it ends", () => {
    const { scrollBy, surface } = layer();

    fireEvent.pointerMove(surface, at(50, 50));
    expect(scrollBy).not.toHaveBeenCalled();

    fireEvent.pointerDown(surface, at(100, 100));
    fireEvent.pointerUp(surface, at(100, 100));
    fireEvent.pointerMove(surface, at(60, 60));

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("ignores a right-click, which is a context menu", () => {
    const { scrollBy, surface } = layer();

    fireEvent.pointerDown(surface, { ...at(100, 100), button: 2 });
    fireEvent.pointerMove(surface, at(60, 60));

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
