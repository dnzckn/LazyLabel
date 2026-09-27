/**
 * Drawing a polygon with a pointer and a keyboard.
 *
 * `tools/polygon.test.ts` pins WHEN a click closes; this pins that a click actually reaches that
 * decision with the right coordinate, and that the keys do what they should. The two failures it
 * exists to catch are a click landing on the wrong image pixel because the canvas is scaled, and
 * Space finishing a polygon while the user is typing a class name.
 */

import { StrictMode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PolygonLayer } from "../../src/canvas/PolygonLayer.jsx";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

const IMAGE = { width: 200, height: 100 };

/** Displayed at half size and offset, so neither the scale nor the origin is the identity. */
const RECT = { left: 30, top: 10, width: 100, height: 50, right: 130, bottom: 60, x: 30, y: 10 };

beforeEach(() => {
  // jsdom lays nothing out, so every rect is zero and every click would read as outside. Spied on
  // Element rather than SVGElement: getBoundingClientRect is defined on Element in jsdom, and a spy
  // on the subclass never gets called.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

function layer(
  props: Partial<Parameters<typeof PolygonLayer>[0]> = {},
  settings: Readonly<Record<string, unknown>> = {},
) {
  // Typed as mocks rather than as the prop signatures, so `.mock.calls` is available: the argument
  // a callback received is half of what these tests are checking.
  const onComplete = vi.fn(props.onComplete);
  const onErase = vi.fn(props.onErase);
  const onRefused = vi.fn(props.onRefused);

  renderWithSettings(
    <PolygonLayer
      width={IMAGE.width}
      height={IMAGE.height}
      {...(props.joinThreshold === undefined ? {} : { joinThreshold: props.joinThreshold })}
      onComplete={onComplete}
      onErase={onErase}
      onRefused={onRefused}
    />,
    settings,
  );

  return { onComplete, onErase, onRefused, surface: screen.getByLabelText("Polygon tool") };
}

/** Click at an IMAGE coordinate, converted back through the display box the way the DOM would. */
function clickAt(surface: Element, x: number, y: number, init: Partial<PointerEventInit> = {}) {
  fireEvent.pointerDown(surface, {
    button: 0,
    clientX: RECT.left + (x / IMAGE.width) * RECT.width,
    clientY: RECT.top + (y / IMAGE.height) * RECT.height,
    ...init,
  });
}

const vertexAt = (index: number) => screen.queryByTestId(`vertex-${index}`);

describe("placing vertices", () => {
  it("puts a vertex at the image pixel that was clicked, not the client one", () => {
    // The canvas is displayed at half size and offset by (30,10). A port that used clientX
    // directly would put this vertex at (40,20) instead of (20,20), and it would look plausible.
    const { surface } = layer();
    clickAt(surface, 20, 20);

    expect(vertexAt(0)?.getAttribute("cx")).toBe("20");
    expect(vertexAt(0)?.getAttribute("cy")).toBe("20");
  });

  it("collects several", () => {
    const { surface } = layer();
    clickAt(surface, 10, 10);
    clickAt(surface, 50, 10);
    clickAt(surface, 50, 50);

    expect(vertexAt(2)).not.toBeNull();
    expect(vertexAt(3)).toBeNull();
  });

  it("ignores a click outside the image rather than clamping it to an edge", () => {
    const { surface } = layer();
    fireEvent.pointerDown(surface, { button: 0, clientX: 0, clientY: 0 });

    expect(vertexAt(0)).toBeNull();
  });

  it("ignores a right-click, which is a context menu and not a vertex", () => {
    const { surface } = layer();
    clickAt(surface, 20, 20, { button: 2 });

    expect(vertexAt(0)).toBeNull();
  });
});

describe("closing the polygon", () => {
  function triangle(props: Parameters<typeof layer>[0] = {}) {
    const handles = layer(props);
    clickAt(handles.surface, 10, 10);
    clickAt(handles.surface, 50, 10);
    clickAt(handles.surface, 50, 50);
    return handles;
  }

  it("completes when the click lands within the join threshold of the first vertex", () => {
    const { surface, onComplete } = triangle({ joinThreshold: 2 });
    clickAt(surface, 11, 11);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toEqual([
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 50 },
    ]);
  });

  it("clears the draft afterwards, so the next click starts a new polygon", () => {
    const { surface } = triangle({ joinThreshold: 2 });
    clickAt(surface, 11, 11);

    expect(vertexAt(0)).toBeNull();
  });

  it("erases instead when shift is held", () => {
    const { surface, onComplete, onErase } = triangle({ joinThreshold: 2 });
    clickAt(surface, 11, 11, { shiftKey: true });

    expect(onErase).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("adds a fourth vertex when the click is exactly at the threshold", () => {
    // The strictly-less-than boundary, reached through a real pointer event rather than a
    // function call: squared distance 4 against a threshold of 2 does not close.
    const { surface, onComplete } = triangle({ joinThreshold: 2 });
    clickAt(surface, 12, 10);

    expect(onComplete).not.toHaveBeenCalled();
    expect(vertexAt(3)).not.toBeNull();
  });
});

describe("the keyboard", () => {
  function twoPoints() {
    const handles = layer();
    clickAt(handles.surface, 10, 10);
    clickAt(handles.surface, 50, 10);
    return handles;
  }

  function triangle() {
    const handles = twoPoints();
    clickAt(handles.surface, 50, 50);
    return handles;
  }

  it("finishes on Space", () => {
    const { onComplete } = triangle();
    fireEvent.keyDown(document, { key: " ", code: "Space" });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("finishes on Enter too", () => {
    const { onComplete } = triangle();
    fireEvent.keyDown(document, { key: "Enter" });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("erases on Shift+Space", () => {
    const { onErase } = triangle();
    fireEvent.keyDown(document, { key: " ", code: "Space", shiftKey: true });

    expect(onErase).toHaveBeenCalledTimes(1);
  });

  it("says why a two-point polygon will not finish", () => {
    // Legacy does nothing at all here, so a user concludes the key is not bound.
    const { onRefused, onComplete } = twoPoints();
    fireEvent.keyDown(document, { key: " ", code: "Space" });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0]?.[0]).toContain("at least 3 points");
  });

  it("does NOT finish when the user is typing in a field", () => {
    // A Space in a class-name field is a space. Binding on the document without this check is the
    // usual way a drawing tool eats text input.
    const input = document.createElement("input");
    document.body.appendChild(input);

    const { onComplete } = triangle();
    fireEvent.keyDown(input, { key: " " });

    expect(onComplete).not.toHaveBeenCalled();
    input.remove();
  });

  it("abandons the draft on C, legacy's clear-points key, as the AI tool's C does", () => {
    // Legacy's C clears what is being drawn in every tool (CONTROL_PARITY.md CP-20).
    const { onComplete } = triangle();
    fireEvent.keyDown(document, { key: "c", code: "KeyC" });

    expect(vertexAt(0)).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("abandons the draft on Escape", () => {
    const { onComplete } = triangle();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(vertexAt(0)).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("hears nothing pressed inside a modal dialog: Escape, Enter and Ctrl+Z there are the dialog's", () => {
    // It listens in the capture phase, before the dialog can stop the key, so the Escape that closed
    // the hotkey dialog also threw the polygon away, and Enter on its Close button finished it.
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const close = document.createElement("button");
    dialog.appendChild(close);
    document.body.appendChild(dialog);

    const { onComplete } = triangle();
    fireEvent.keyDown(close, { key: "Escape" });
    fireEvent.keyDown(close, { key: "Enter" });
    fireEvent.keyDown(close, { key: "z", ctrlKey: true });

    expect(vertexAt(2)).not.toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("puts a vertex back on Ctrl+Shift+Z or Ctrl+Y, as legacy's redo re-adds a point", () => {
    // Ctrl+Shift+Z took a vertex AWAY while the undo check ignored Shift (CONTROL_PARITY.md CP-21).
    triangle();
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(vertexAt(1)).toBeNull();

    fireEvent.keyDown(document, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(vertexAt(1)).not.toBeNull();
    expect(vertexAt(2)).toBeNull();

    fireEvent.keyDown(document, { key: "y", ctrlKey: true });
    expect(vertexAt(2)).not.toBeNull();
  });

  it("puts back even the last vertex undone, which had emptied the draft", () => {
    triangle();
    for (let i = 0; i < 3; i += 1) fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(vertexAt(0)).toBeNull();

    fireEvent.keyDown(document, { key: "y", ctrlKey: true });

    expect(vertexAt(0)).not.toBeNull();
  });

  it("takes back one vertex on Ctrl+Z, rather than the whole polygon", () => {
    const { surface } = triangle();
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    expect(vertexAt(2)).toBeNull();
    expect(vertexAt(1)).not.toBeNull();
    // And the polygon is still being drawn, so a further click continues it.
    clickAt(surface, 60, 60);
    expect(vertexAt(2)).not.toBeNull();
  });

  it("does nothing on a key press when no polygon is being drawn", () => {
    const { onComplete, onRefused } = layer();
    fireEvent.keyDown(document, { key: " ", code: "Space" });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
  });
});

describe("no close-range hint, as legacy gives none", () => {
  it("draws nothing new when the pointer comes into range of the first vertex", () => {
    // polygon_drawing_manager.py:95-159 draws nothing for the pointer. Until 2026-09-27 the first
    // vertex grew here and a dashed closing edge appeared.
    const { surface } = layer({ joinThreshold: 2 });
    clickAt(surface, 10, 10);
    clickAt(surface, 50, 10);
    clickAt(surface, 50, 50);
    const before = surface.innerHTML;

    fireEvent.pointerMove(surface, {
      clientX: RECT.left + (11 / IMAGE.width) * RECT.width,
      clientY: RECT.top + (11 / IMAGE.height) * RECT.height,
    });

    expect(surface.innerHTML).toBe(before);
  });
});

describe("how big the drawing aids are", () => {
  /** The radius of the first drawn vertex, which is what `point_radius` has to reach. */
  const vertexRadius = () => {
    const ellipse = document.querySelector("ellipse");
    return ellipse === null ? null : Number(ellipse.getAttribute("rx"));
  };

  it("draws a vertex at the default size when nothing is set", () => {
    const { surface } = layer();
    clickAt(surface, 10, 10);

    expect(vertexRadius()).toBeGreaterThan(0);
  });

  it("DOUBLES the vertex when point_radius is doubled", async () => {
    // The wire this project keeps finding broken: a setting that is stored, shown, and reaches no
    // pixel. Asserting the ratio rather than the number, because the number is a screen radius
    // converted into image units and the conversion is not what this is about.
    const plain = layer();
    clickAt(plain.surface, 10, 10);
    const before = vertexRadius();

    cleanup();

    const bigger = layer({}, { point_radius: 0.6 });
    clickAt(bigger.surface, 10, 10);

    // Awaited: the settings arrive from the client, so the first paint is still the defaults.
    await waitFor(() => expect(vertexRadius()).toBeCloseTo((before ?? 0) * 2, 10));
  });

  it("thickens the outline when line_thickness is raised", async () => {
    const plain = layer();
    clickAt(plain.surface, 10, 10);
    clickAt(plain.surface, 30, 10);
    const before = Number(document.querySelector("line")?.getAttribute("stroke-width"));

    cleanup();

    const thicker = layer({}, { line_thickness: 1.5 });
    clickAt(thicker.surface, 10, 10);
    clickAt(thicker.surface, 30, 10);

    await waitFor(() =>
      expect(Number(document.querySelector("line")?.getAttribute("stroke-width"))).toBeCloseTo(
        before * 3,
        10,
      ),
    );
  });
});

describe("under StrictMode, as main.tsx renders the app", () => {
  // StrictMode runs a state updater twice. Space and Shift+Space finished the polygon INSIDE
  // `setDraft`'s updater, so in the running app every Space-finished polygon was added twice, each
  // with a new class, and took two Ctrl+Z to undo; React also warned "Cannot update a component
  // while rendering a different component". Found in a real browser on 2026-09-27: these tests
  // rendered without StrictMode, where the updater runs once.
  function strictLayer() {
    const onComplete = vi.fn();
    const onErase = vi.fn();
    renderWithSettings(
      <StrictMode>
        <PolygonLayer width={IMAGE.width} height={IMAGE.height} onComplete={onComplete} onErase={onErase} />
      </StrictMode>,
    );
    const surface = screen.getByLabelText("Polygon tool");
    clickAt(surface, 10, 10);
    clickAt(surface, 50, 10);
    clickAt(surface, 50, 50);
    return { onComplete, onErase };
  }

  it("finishes a polygon on Space once", () => {
    const { onComplete } = strictLayer();
    fireEvent.keyDown(document, { key: " ", code: "Space" });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("erases on Shift+Space once", () => {
    const { onErase } = strictLayer();
    fireEvent.keyDown(document, { key: " ", code: "Space", shiftKey: true });

    expect(onErase).toHaveBeenCalledTimes(1);
  });
});
