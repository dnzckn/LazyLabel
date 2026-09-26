/**
 * The Rescale slider does what legacy's does, event for event, and draws what legacy's draws.
 *
 * `test/fixtures/legacy-rescale-slider.json` was recorded from legacy's own `RescaleSlider`
 * (`ui/widgets/rescale_widget.py:25-180`), driven with real Qt events on an offscreen display by
 * `generate_rescale_slider_goldens.py`. Each scenario is replayed here against the web slider at
 * the same width, with the same pointer positions, and after every step the two values and the
 * handle being dragged have to be legacy's. The first scenarios are the point of CP-29: a dragged
 * handle stops at the other one, so the window can never be inverted.
 *
 * The drawing is held to legacy's PAINT CALLS, captured by standing a recording painter in for
 * QPainter: every rounded rectangle and every piece of text, in paint order, with position, size,
 * radius and colour. Theme colours come from the stylesheet's tokens, read from `styles.css` for
 * the light and dark themes.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import golden from "../fixtures/legacy-rescale-slider.json" with { type: "json" };
import { RescaleSlider } from "../../src/workspace/RescaleSlider.jsx";
import type { Window } from "../../src/workspace/rescaleSlider.js";

interface Step {
  readonly event: "press" | "move" | "release";
  readonly x: number;
  readonly y: number;
  readonly min: number;
  readonly max: number;
  readonly dragging: "min" | "max" | null;
  readonly emitted: readonly (readonly number[])[];
}

interface Scenario {
  readonly name: string;
  readonly maximum: number;
  readonly width: number;
  readonly start: readonly [number, number];
  readonly steps: readonly Step[];
}

interface PaintCall {
  readonly op: "font" | "text" | "roundedRect";
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly radius?: readonly number[];
  readonly text?: string;
  readonly pointSize?: number;
  readonly pen?: { readonly rgba: readonly number[]; readonly width: number } | null;
  readonly brush?: { readonly rgba: readonly number[] } | null;
}

interface Paint {
  readonly name: string;
  readonly maximum: number;
  readonly width: number;
  readonly values: readonly [number, number];
  readonly dragging: "min" | "max" | null;
  readonly dark: boolean;
  readonly calls: readonly PaintCall[];
}

const scenarios = golden.scenarios as unknown as readonly Scenario[];
const paints = golden.paints as unknown as readonly Paint[];

let sliderWidth = 296;

beforeEach(() => {
  // jsdom lays nothing out, so the slider is given the width legacy's widget had.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: sliderWidth,
        height: 50,
        right: sliderWidth,
        bottom: 50,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Harness({
  maximum,
  start,
  onCommit,
}: {
  readonly maximum: number;
  readonly start: Window;
  readonly onCommit?: (window: Window) => void;
}): ReactNode {
  const [window, setWindow] = useState<Window>(start);
  return (
    <RescaleSlider
      maximum={maximum}
      window={window}
      enabled
      onChange={(next) => {
        onCommit?.(next);
        setWindow(next);
      }}
    />
  );
}

const slider = () => screen.getByRole("group", { name: "Rescale range" });

/** The values as drawn, and which handle is being dragged. */
function shown(): { min: number; max: number; dragging: "min" | "max" | null } {
  const handles = [...slider().querySelectorAll<SVGRectElement>("[data-handle]")];
  const value = (name: string) => Number(handles.find((h) => h.dataset["handle"] === name)!.dataset["value"]);
  const dragged = handles.find((h) => h.classList.contains("rescale-slider__handle--dragging"));
  return {
    min: value("min"),
    max: value("max"),
    dragging: (dragged?.dataset["handle"] as "min" | "max" | undefined) ?? null,
  };
}

function send(step: Step): void {
  const at = { clientX: step.x, clientY: step.y, pointerId: 1 };
  if (step.event === "press") fireEvent.pointerDown(slider(), { ...at, button: 0 });
  else if (step.event === "move") fireEvent.pointerMove(slider(), { ...at, button: -1, buttons: 1 });
  else fireEvent.pointerUp(slider(), { ...at, button: 0 });
}

describe("the golden file", () => {
  it("covers both handles stopping at each other, an overlap, 16-bit and a narrow slider", () => {
    const names = scenarios.map((s) => s.name).join("\n");
    expect(names).toMatch(/max handle stops at the min/);
    expect(names).toMatch(/min handle stops at the max/);
    expect(names).toMatch(/overlap/);
    expect(scenarios.some((s) => s.maximum === 65535)).toBe(true);
    expect(new Set(scenarios.map((s) => s.width)).size).toBeGreaterThan(1);
  });
});

describe("replaying legacy's events", () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      sliderWidth = scenario.width;
      const commits: Window[] = [];
      render(
        <Harness
          maximum={scenario.maximum}
          start={{ min: scenario.start[0], max: scenario.start[1] }}
          onCommit={(w) => commits.push(w)}
        />,
      );

      // What the web hands over: once per drag that moved, on release, with the values legacy
      // reported last. Legacy reports on every move; the image is asked for once.
      const expectedCommits: Window[] = [];
      let reported = false;
      scenario.steps.forEach((step, index) => {
        send(step);
        const where = `step ${index + 1}, ${step.event} at (${step.x}, ${step.y})`;
        expect({ where, ...shown() }).toEqual({ where, min: step.min, max: step.max, dragging: step.dragging });

        if (step.emitted.length > 0) reported = true;
        if (step.event === "release") {
          if (reported) expectedCommits.push({ min: step.min, max: step.max });
          reported = false;
        }
      });

      expect(commits).toEqual(expectedCommits);
    });
  }
});

describe("the handles never cross", () => {
  it("keeps min at or below max whatever the pointer does", () => {
    sliderWidth = 296;
    render(<Harness maximum={255} start={{ min: 100, max: 120 }} />);

    fireEvent.pointerDown(slider(), { clientX: 120, clientY: 23, button: 0, pointerId: 1 });
    for (const x of [140, 200, 276, 400, 0, 250]) {
      fireEvent.pointerMove(slider(), { clientX: x, clientY: 23, buttons: 1, pointerId: 1 });
      const { min, max } = shown();
      expect(min).toBeLessThanOrEqual(max);
      expect(max).toBe(120);
    }
  });
});

describe("a disabled slider", () => {
  it("takes no drag, as legacy's disabled widget takes none", () => {
    sliderWidth = 296;
    const onChange = vi.fn();
    render(<RescaleSlider maximum={255} window={{ min: 0, max: 255 }} enabled={false} onChange={onChange} />);

    fireEvent.pointerDown(slider(), { clientX: 20, clientY: 23, button: 0, pointerId: 1 });
    fireEvent.pointerMove(slider(), { clientX: 120, clientY: 23, buttons: 1, pointerId: 1 });
    fireEvent.pointerUp(slider(), { clientX: 120, clientY: 23, button: 0, pointerId: 1 });

    expect(onChange).not.toHaveBeenCalled();
    expect(shown()).toEqual({ min: 0, max: 255, dragging: null });
  });
});

// ---- The drawing ---------------------------------------------------------------------------------

const STYLES = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "styles.css"),
  "utf8",
);

/** A declaration's value from the first rule whose selector is exactly `selector`. */
function declaration(selector: string, property: string): string {
  const start = STYLES.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule ${selector}`);
  const body = STYLES.slice(start, STYLES.indexOf("}", start));
  const match = new RegExp(`(?:^|[;\\s])${property.replace(/[-]/g, "\\-")}:\\s*([^;]+);`).exec(body);
  if (match === null) throw new Error(`${selector} has no ${property}`);
  return match[1]!.trim();
}

/** `rgb(30 30 30)`, resolving `var(--token)` in the given theme's block. */
function colour(value: string, dark: boolean): number[] {
  const token = /^var\((--[\w-]+)\)$/.exec(value);
  if (token !== null) {
    return colour(declaration(dark ? ':root[data-theme="dark"]' : ":root", token[1]!), dark);
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(value);
  if (rgb === null) throw new Error(`not a colour this test reads: ${value}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

/** The SVG's children as the paint calls legacy would have made for them. */
function drawn(dark: boolean): PaintCall[] {
  const svg = slider().querySelector("svg")!;
  return [...svg.children].map((element) => {
    const number = (name: string) => Number(element.getAttribute(name));
    const classes = element.classList;
    const selector = classes.contains("rescale-slider__handle--dragging")
      ? ".rescale-slider__handle--dragging"
      : `.${[...classes].find((name) => name.startsWith("rescale-slider__"))!}`;
    const rule = (property: string) => declaration(selector, property);

    if (element.tagName === "text") {
      return {
        op: "text",
        x: number("x"),
        y: number("y"),
        text: element.textContent ?? "",
        pen: { rgba: [...colour(rule("fill"), dark), 255], width: 1 },
      };
    }

    const base = {
      op: "roundedRect" as const,
      x: number("x"),
      y: number("y"),
      width: number("width"),
      height: number("height"),
      radius: [number("rx"), number("ry")],
    };
    if (classes.contains("rescale-slider__range")) {
      const alpha = Math.round(Number(element.getAttribute("fill-opacity")) * 255);
      // Legacy draws the range with NO pen.
      return { ...base, pen: null, brush: { rgba: [...colour(element.getAttribute("fill")!, dark), alpha] } };
    }
    return {
      ...base,
      pen: { rgba: [...colour(rule("stroke"), dark), 255], width: Number.parseInt(rule("stroke-width"), 10) },
      brush: { rgba: [...colour(rule("fill"), dark), 255] },
    };
  });
}

describe("drawing what legacy paints", () => {
  for (const paint of paints) {
    it(paint.name, () => {
      sliderWidth = paint.width;
      render(<Harness maximum={paint.maximum} start={{ min: paint.values[0], max: paint.values[1] }} />);
      if (paint.dragging !== null) {
        // Into the dragging state the way a user gets there: a press on that handle. Where the two
        // overlap only the max handle can be pressed, and no paint here asks for the min one there.
        const value = paint.dragging === "min" ? paint.values[0] : paint.values[1];
        const x = 20 + Math.trunc((value / paint.maximum) * (paint.width - 40));
        fireEvent.pointerDown(slider(), { clientX: x, clientY: 23, button: 0, pointerId: 1 });
        expect(shown().dragging).toBe(paint.dragging);
      }

      expect(drawn(paint.dark)).toEqual(paint.calls.filter((call) => call.op !== "font"));
    });
  }

  it("writes the values in legacy's 8 pt", () => {
    // Every paint above sets `setPointSize(8)` before its text (rescale_widget.py:129-131).
    for (const paint of paints) {
      expect(paint.calls.find((call) => call.op === "font")?.pointSize).toBe(8);
    }
    expect(declaration(".rescale-slider__text", "font-size")).toBe("8pt");
  });
});
