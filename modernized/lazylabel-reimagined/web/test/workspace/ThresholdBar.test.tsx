/**
 * The threshold bar does what legacy's does, event for event, and draws what legacy's draws.
 *
 * `test/fixtures/legacy-channel-slider.json` was recorded from legacy's own `MultiIndicatorSlider`
 * (`ui/widgets/channel_threshold_widget.py`), driven with real Qt events on an offscreen display by
 * `generate_channel_slider_goldens.py`. Each scenario is replayed here against the web bar at the
 * same width, with the same pointer positions, and after every step the markers (in list order)
 * and the marker being dragged have to be legacy's.
 *
 * A legacy double-click is Qt's press, release, double-click, release; the browser's is
 * pointerdown, pointerup, pointerdown, pointerup, dblclick. The replay sends the browser's, which is
 * what matters here: the second press lands on whatever the first left behind.
 *
 * The drawing is held to legacy's PAINT CALLS, captured by standing a recording painter in for
 * QPainter: every rounded rectangle and every piece of text, in paint order, with position, size,
 * radius and colour. Theme colours come from the stylesheet's tokens, so those are read from
 * `styles.css` for the light and dark themes and compared too.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import golden from "../fixtures/legacy-channel-slider.json" with { type: "json" };
import { ThresholdBar } from "../../src/workspace/ThresholdBar.jsx";
import { type BarChannel } from "../../src/workspace/thresholdBar.js";

interface Step {
  readonly event: "dblclick" | "press" | "move" | "release" | "context" | "check" | "uncheck";
  readonly x?: number;
  readonly y?: number;
  readonly markers: readonly number[];
  readonly dragging?: number;
}

interface Scenario {
  readonly name: string;
  readonly channel: BarChannel;
  readonly maximum: number;
  readonly width: number;
  readonly start?: readonly number[];
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
  readonly pen?: { readonly rgba: readonly number[]; readonly width: number } | null;
  readonly brush?: { readonly rgba: readonly number[] } | null;
}

interface Paint {
  readonly name: string;
  readonly channel: BarChannel;
  readonly maximum: number;
  readonly width: number;
  readonly markers: readonly number[];
  readonly dragging: number;
  readonly dark: boolean;
  readonly calls: readonly PaintCall[];
}

const scenarios = golden.scenarios as unknown as readonly Scenario[];
const paints = golden.paints as unknown as readonly Paint[];

let barWidth = 296;

beforeEach(() => {
  // jsdom lays nothing out, so the bar is given the width legacy's widget had.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: barWidth,
        height: 60,
        right: barWidth,
        bottom: 60,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Harness({
  channel,
  maximum,
  start,
  onCommit,
}: {
  readonly channel: BarChannel;
  readonly maximum: number;
  readonly start: readonly number[];
  readonly onCommit?: (markers: readonly number[]) => void;
}): ReactNode {
  const [markers, setMarkers] = useState<readonly number[]>(start);
  return (
    <ThresholdBar
      channel={channel}
      maximum={maximum}
      markers={markers}
      enabled
      onChange={(next) => {
        onCommit?.(next);
        setMarkers(next);
      }}
    />
  );
}

function bar(channel: BarChannel): HTMLElement {
  return screen.getByRole("group", { name: `${channel} threshold` });
}

/** The markers as drawn, in list order, and which one is being dragged. */
function shown(channel: BarChannel): { markers: number[]; dragging: number } {
  const handles = [...bar(channel).querySelectorAll<SVGRectElement>("[data-marker]")];
  return {
    markers: handles.map((handle) => Number(handle.dataset["marker"])),
    dragging: handles.findIndex((handle) =>
      handle.classList.contains("threshold-bar__handle--dragging"),
    ),
  };
}

function send(target: HTMLElement, step: Step): void {
  const at = { clientX: step.x ?? 0, clientY: step.y ?? 0 };
  switch (step.event) {
    case "dblclick":
      fireEvent.pointerDown(target, { ...at, button: 0, pointerId: 1 });
      fireEvent.pointerUp(target, { ...at, button: 0, pointerId: 1 });
      fireEvent.pointerDown(target, { ...at, button: 0, pointerId: 1 });
      fireEvent.pointerUp(target, { ...at, button: 0, pointerId: 1 });
      fireEvent.doubleClick(target, { ...at, button: 0 });
      return;
    case "press":
      fireEvent.pointerDown(target, { ...at, button: 0, pointerId: 1 });
      return;
    case "move":
      fireEvent.pointerMove(target, { ...at, button: -1, buttons: 1, pointerId: 1 });
      return;
    case "release":
      fireEvent.pointerUp(target, { ...at, button: 0, pointerId: 1 });
      return;
    case "context":
      fireEvent.pointerDown(target, { ...at, button: 2, pointerId: 1 });
      fireEvent.pointerUp(target, { ...at, button: 2, pointerId: 1 });
      fireEvent.contextMenu(target, { ...at, button: 2 });
      return;
    default:
      throw new Error(`not a bar event: ${step.event}`);
  }
}

describe("the golden file", () => {
  it("covers adding, dragging and removing, at more than one width and depth", () => {
    const events = new Set(scenarios.flatMap((s) => s.steps.map((step) => step.event)));
    for (const event of ["dblclick", "press", "move", "release", "context"]) {
      expect(events.has(event as Step["event"])).toBe(true);
    }
    expect(new Set(scenarios.map((s) => s.width)).size).toBeGreaterThan(1);
    expect(scenarios.some((s) => s.maximum === 65536)).toBe(true);
  });
});

describe("replaying legacy's events", () => {
  for (const scenario of scenarios.filter((s) => s.name !== "enable")) {
    it(scenario.name, () => {
      barWidth = scenario.width;
      render(<Harness channel={scenario.channel} maximum={scenario.maximum} start={scenario.start ?? []} />);

      scenario.steps.forEach((step, index) => {
        send(bar(scenario.channel), step);
        const where = `step ${index + 1}, ${step.event} at (${step.x}, ${step.y})`;
        expect({ where, ...shown(scenario.channel) }).toEqual({
          where,
          markers: step.markers,
          dragging: step.dragging ?? -1,
        });
      });
    });
  }
});

describe("what a drag commits", () => {
  it("shows the handle moving at once and hands the list over only on release", () => {
    // Legacy re-renders the image on release when Operate On View is on, and live otherwise; the
    // web always asks on release (the component's header says why). The bar itself is live.
    barWidth = 296;
    const commits: (readonly number[])[] = [];
    render(<Harness channel="Red" maximum={256} start={[50, 150]} onCommit={(m) => commits.push(m)} />);

    fireEvent.pointerDown(bar("Red"), { clientX: 170, clientY: 30, button: 0, pointerId: 1 });
    fireEvent.pointerMove(bar("Red"), { clientX: 120, clientY: 30, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(bar("Red"), { clientX: 110, clientY: 30, buttons: 1, pointerId: 1 });

    expect(shown("Red").markers).toEqual([50, 90]);
    expect(commits).toEqual([]);

    fireEvent.pointerUp(bar("Red"), { clientX: 110, clientY: 30, button: 0, pointerId: 1 });

    expect(commits).toEqual([[50, 90]]);
  });

  it("commits nothing for a press and release that moved nothing", () => {
    barWidth = 296;
    const commits: (readonly number[])[] = [];
    render(<Harness channel="Red" maximum={256} start={[128]} onCommit={(m) => commits.push(m)} />);

    fireEvent.pointerDown(bar("Red"), { clientX: 148, clientY: 30, button: 0, pointerId: 1 });
    fireEvent.pointerUp(bar("Red"), { clientX: 148, clientY: 30, button: 0, pointerId: 1 });

    expect(commits).toEqual([]);
  });

  it("keeps the browser's menu off the bar, as legacy shows none", () => {
    barWidth = 296;
    render(<Harness channel="Red" maximum={256} start={[]} />);

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 60, clientY: 30 });
    bar("Red").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe("a bar whose box is unticked", () => {
  it("takes no double-click, drag or right-click, as legacy's disabled slider takes none", () => {
    barWidth = 296;
    const onChange = vi.fn();
    render(<ThresholdBar channel="Red" maximum={256} markers={[128]} enabled={false} onChange={onChange} />);

    send(bar("Red"), { event: "dblclick", x: 60, y: 30, markers: [] });
    send(bar("Red"), { event: "press", x: 148, y: 30, markers: [] });
    send(bar("Red"), { event: "move", x: 100, y: 30, markers: [] });
    send(bar("Red"), { event: "release", x: 100, y: 30, markers: [] });
    send(bar("Red"), { event: "context", x: 148, y: 30, markers: [] });

    expect(onChange).not.toHaveBeenCalled();
    expect(shown("Red")).toEqual({ markers: [128], dragging: -1 });
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

/** `rgb(30 30 30)` or `#4caf50`, resolving `var(--token)` in the given theme's block. */
function colour(value: string, dark: boolean): number[] {
  const token = /^var\((--[\w-]+)\)$/.exec(value);
  if (token !== null) {
    return colour(declaration(dark ? ':root[data-theme="dark"]' : ":root", token[1]!), dark);
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(value);
  if (rgb === null) throw new Error(`not a colour this test reads: ${value}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

interface Drawn {
  readonly op: "text" | "roundedRect";
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly radius?: readonly number[];
  readonly text?: string;
  readonly pen: { readonly rgba: readonly number[]; readonly width: number } | null;
  readonly brush: { readonly rgba: readonly number[] } | null;
}

/** The SVG's children as the paint calls legacy would have made for them. */
function drawn(channel: BarChannel, dark: boolean): Drawn[] {
  const svg = bar(channel).querySelector("svg")!;
  return [...svg.children].map((element) => {
    const number = (name: string) => Number(element.getAttribute(name));
    const classes = element.classList;
    const rule = (property: string): string => {
      const selector = classes.contains("threshold-bar__handle--dragging")
        ? ".threshold-bar__handle--dragging"
        : `.${[...classes].find((name) => name.startsWith("threshold-bar__"))!}`;
      return declaration(selector, property);
    };

    if (element.tagName === "text") {
      return {
        op: "text",
        x: number("x"),
        y: number("y"),
        text: element.textContent ?? "",
        pen: { rgba: [...colour(rule("fill"), dark), 255], width: 1 },
        brush: null,
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
    if (classes.contains("threshold-bar__band")) {
      const fill = colour(element.getAttribute("fill")!, dark);
      const alpha = Math.round(Number(element.getAttribute("fill-opacity")) * 255);
      // Legacy draws a band with a TRANSPARENT pen: no outline.
      return { ...base, pen: { rgba: [0, 0, 0, 0], width: 1 }, brush: { rgba: [...fill, alpha] } };
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
      barWidth = paint.width;
      render(<Harness channel={paint.channel} maximum={paint.maximum} start={paint.markers} />);
      if (paint.dragging >= 0) {
        // Into the dragging state the way a user gets there: a press on that handle.
        const value = paint.markers[paint.dragging]!;
        const x = 20 + Math.trunc((value / paint.maximum) * (paint.width - 40));
        fireEvent.pointerDown(bar(paint.channel), { clientX: x, clientY: 30, button: 0, pointerId: 1 });
        expect(shown(paint.channel).dragging).toBe(paint.dragging);
      }

      const expected = paint.calls
        .filter((call) => call.op !== "font")
        .map((call) =>
          call.op === "text"
            ? { op: "text", x: call.x, y: call.y, text: call.text, pen: call.pen, brush: null }
            : {
                op: "roundedRect",
                x: call.x,
                y: call.y,
                width: call.width,
                height: call.height,
                radius: call.radius,
                pen: call.pen,
                brush: call.brush,
              },
        );

      expect(drawn(paint.channel, paint.dark)).toEqual(expected);
    });
  }

  it("writes in legacy's 9 pt, which is 12 px on the Windows default", () => {
    // Every paint above starts with `setPointSize(9)` (channel_threshold_widget.py:92-94).
    expect(paints.every((paint) => paint.calls[0]?.op === "font" && (paint.calls[0] as { pointSize?: number }).pointSize === 9)).toBe(true);
    expect(declaration(".threshold-bar__text", "font-size")).toBe("12px");
  });
});
