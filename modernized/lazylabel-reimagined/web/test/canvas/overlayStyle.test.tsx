/**
 * What is drawn while something is being made, as legacy draws it: the AI tool's points and band,
 * a polygon in progress, and the box and circle rubber bands, in both views and in the Multi tab's
 * half not being edited.
 *
 * At the owner's annotation size multiplier of 4.7, which magnifies every difference in how a size
 * is computed. Legacy's sizes are IMAGE pixels: `point_radius x multiplier` = 1.41 and
 * `line_thickness x multiplier` = 2.35 (main_window.py:516-538). The picture is shown at half size,
 * so a size counted in screen pixels comes out twice as large and cannot pass for one.
 */

import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiLayer } from "../../src/canvas/AiLayer.jsx";
import { PolygonLayer } from "../../src/canvas/PolygonLayer.jsx";
import { ShapeLayer } from "../../src/canvas/ShapeLayer.jsx";
import { ViewKindContext, type ViewKind } from "../../src/canvas/viewKind.js";
import { IdlePress } from "../../src/split/IdlePress.jsx";
import type { PressTool } from "../../src/split/pairPress.js";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

const IMAGE = { width: 200, height: 100 };
/** Half size: one screen pixel is two image pixels. */
const RECT = { left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0 };

const POINT = 0.3 * 4.7;
const LINE = 0.5 * 4.7;
const DASH = `${4 * LINE} ${2 * LINE}`;

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...RECT, toJSON: () => RECT } as DOMRect);
});

function draw(node: ReactNode, view: ViewKind = "single") {
  renderWithSettings(<ViewKindContext.Provider value={view}>{node}</ViewKindContext.Provider>, {
    annotation_size_multiplier: 4.7,
  });
}

/** A press at an image pixel, given in screen pixels. */
const at = (x: number, y: number, button = 0) => ({ button, pointerId: 1, clientX: x / 2, clientY: y / 2 });

const attrs = (element: Element | null, ...names: string[]) =>
  Object.fromEntries(names.map((name) => [name, element?.getAttribute(name) ?? null]));

/** Waits for the owner's multiplier to arrive: the settings load after the first paint. */
async function sized(testId: string, radius: number) {
  await waitFor(() => expect(Number(screen.getByTestId(testId).getAttribute("rx"))).toBeCloseTo(radius, 10));
}

describe("the AI tool's points", () => {
  function aiLayer(view: ViewKind) {
    draw(<AiLayer width={IMAGE.width} height={IMAGE.height} onPrompt={vi.fn()} onAccept={vi.fn()} />, view);
    const surface = screen.getByLabelText("AI tool");
    fireEvent.pointerDown(surface, at(40, 40));
    fireEvent.pointerUp(surface, at(40, 40));
    fireEvent.pointerDown(surface, at(80, 40, 2));
    fireEvent.pointerUp(surface, at(80, 40, 2));
  }

  it("in the single view: point_radius x multiplier image pixels, at alpha 150, no outline", async () => {
    // ai_segment_manager.py:450-466. They were 4 screen pixels times the size ratio: 37.6 here.
    aiLayer("single");
    await sized("ai-positive-0", POINT);
    for (const id of ["ai-positive-0", "ai-negative-1"]) {
      expect(Number(screen.getByTestId(id).getAttribute("ry"))).toBeCloseTo(POINT, 10);
      expect(screen.getByTestId(id).getAttribute("stroke")).toBe("none");
    }
    expect(screen.getByTestId("ai-positive-0").getAttribute("fill")).toBe(`rgba(0, 255, 0, ${150 / 255})`);
  });

  it("in the Multi tab: the same radius, opaque, with a black pen one IMAGE pixel wide", async () => {
    // main_window.py:6764-6773. The pen was one screen pixel: 2 image pixels here.
    aiLayer("multi");
    await sized("ai-negative-1", POINT);
    expect(attrs(screen.getByTestId("ai-negative-1"), "fill", "stroke", "stroke-width")).toEqual({
      fill: "rgb(255, 0, 0)",
      stroke: "rgb(0, 0, 0)",
      "stroke-width": "1",
    });
  });

  it("drags a cyan band, Qt's DashLine on a pen line_thickness x multiplier image pixels wide", async () => {
    // single_view_mouse_handler.py:242-249. It was 4.7 screen pixels, 9.4 image pixels here.
    draw(<AiLayer width={IMAGE.width} height={IMAGE.height} onPrompt={vi.fn()} onAccept={vi.fn()} />);
    const surface = screen.getByLabelText("AI tool");
    fireEvent.pointerDown(surface, at(20, 20));
    fireEvent.pointerMove(surface, at(120, 80));
    await waitFor(() => expect(screen.getByTestId("ai-drag").getAttribute("stroke-width")).toBe(String(LINE)));
    expect(attrs(screen.getByTestId("ai-drag"), "stroke", "stroke-dasharray", "stroke-linecap", "fill")).toEqual({
      stroke: "rgb(0, 255, 255)",
      "stroke-dasharray": DASH,
      "stroke-linecap": "square",
      fill: "none",
    });
  });
});

describe("a polygon in progress", () => {
  function polygon(view: ViewKind) {
    draw(<PolygonLayer width={IMAGE.width} height={IMAGE.height} onComplete={vi.fn()} />, view);
    const surface = screen.getByLabelText("Polygon tool");
    for (const [x, y] of [[20, 20], [120, 20], [120, 80]] as const) fireEvent.pointerDown(surface, at(x, y));
    return surface;
  }

  it("in the single view: blue dots and cyan edges at alpha 150, a cyan fill at 100 from the third vertex", async () => {
    // polygon_drawing_manager.py:95-159. The fill is there with the pointer nowhere near the first
    // vertex: it came only in range to close, the edges and dots were opaque.
    polygon("single");
    await sized("vertex-0", POINT);
    expect(attrs(screen.getByTestId("vertex-2"), "fill", "stroke")).toEqual({
      fill: `rgba(0, 0, 255, ${150 / 255})`,
      stroke: "none",
    });
    for (const id of ["edge-0", "edge-1"]) {
      expect(attrs(screen.getByTestId(id), "stroke", "stroke-width", "stroke-linecap")).toEqual({
        stroke: `rgba(0, 255, 255, ${150 / 255})`,
        "stroke-width": String(LINE),
        "stroke-linecap": "square",
      });
    }
    expect(attrs(screen.getByTestId("draft-fill"), "fill", "stroke")).toEqual({
      fill: `rgba(0, 255, 255, ${100 / 255})`,
      stroke: "none",
    });
    // Legacy lays the fill and the edges again over the dots at every click.
    const order = [...document.querySelectorAll("[data-testid]")].map((node) => node.getAttribute("data-testid"));
    expect(order.indexOf("draft-fill")).toBeGreaterThan(order.indexOf("vertex-2"));
    expect(order.indexOf("edge-0")).toBeGreaterThan(order.indexOf("draft-fill"));
  });

  it("with two vertices, no fill yet", () => {
    draw(<PolygonLayer width={IMAGE.width} height={IMAGE.height} onComplete={vi.fn()} />);
    const surface = screen.getByLabelText("Polygon tool");
    fireEvent.pointerDown(surface, at(20, 20));
    fireEvent.pointerDown(surface, at(120, 20));
    expect(screen.queryByTestId("draft-fill")).toBeNull();
  });

  it("in the Multi tab: opaque cyan dots with a black 1 px pen over opaque cyan edges 2 px wide, no fill", async () => {
    // main_window.py:5659-5678, the same in the other viewer when linked (5688-5706).
    polygon("multi");
    await sized("vertex-1", POINT);
    expect(attrs(screen.getByTestId("vertex-1"), "fill", "stroke", "stroke-width")).toEqual({
      fill: "rgb(0, 255, 255)",
      stroke: "rgb(0, 0, 0)",
      "stroke-width": "1",
    });
    expect(attrs(screen.getByTestId("edge-1"), "stroke", "stroke-width")).toEqual({
      stroke: "rgb(0, 255, 255)",
      "stroke-width": "2",
    });
    expect(screen.queryByTestId("draft-fill")).toBeNull();
    const order = [...document.querySelectorAll("[data-testid]")].map((node) => node.getAttribute("data-testid"));
    expect(order.indexOf("vertex-0")).toBeGreaterThan(order.indexOf("edge-1"));
  });
});

describe("the box and circle rubber bands", () => {
  const band = { stroke: "rgb(255, 0, 0)", "stroke-dasharray": DASH, "stroke-linecap": "square", fill: "none" };
  const names = ["stroke", "stroke-dasharray", "stroke-linecap", "fill"];

  it.each(["box", "circle"] as const)("the %s's is red, dashed, and not filled, whatever the class", async (kind) => {
    // single_view_mouse_handler.py:143-166. It was the class colour, solid, over a 0.25 fill.
    draw(<ShapeLayer kind={kind} width={IMAGE.width} height={IMAGE.height} onComplete={vi.fn()} />);
    const surface = screen.getByLabelText(kind === "box" ? "Box tool" : "Circle tool");
    fireEvent.pointerDown(surface, at(20, 20));
    fireEvent.pointerMove(surface, at(120, 80));
    await waitFor(() => expect(screen.getByTestId("shape-preview").getAttribute("stroke-width")).toBe(String(LINE)));
    expect(attrs(screen.getByTestId("shape-preview"), ...names)).toEqual(band);
  });

  it.each([
    ["box", "press-band", "rgb(255, 0, 0)"],
    ["circle", "press-circle", "rgb(255, 0, 0)"],
    ["ai", "press-band", "rgb(0, 255, 255)"],
  ] as const)("on the Multi tab's other half, the %s's too", async (tool, testId, stroke) => {
    // main_window.py:5449-5456, 5724-5726, 5832-5834. They were the class colour, the box's in a
    // dash of 3 and 3.
    draw(<IdlePress tool={tool as PressTool} name="b.png" width={IMAGE.width} height={IMAGE.height} onPress={vi.fn()} />, "multi");
    const surface = screen.getByLabelText("Draw on b.png");
    fireEvent.pointerDown(surface, at(20, 20));
    fireEvent.pointerMove(surface, at(120, 80));
    await waitFor(() => expect(screen.getByTestId(testId).getAttribute("stroke-width")).toBe(String(LINE)));
    expect(attrs(screen.getByTestId(testId), ...names)).toEqual({ ...band, stroke });
  });
});
