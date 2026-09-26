/**
 * The FFT Threshold section does what legacy's does and draws what legacy's draws.
 *
 * `test/fixtures/legacy-fft-slider.json` was recorded from legacy's own `FFTThresholdWidget` and its
 * two `FFTThresholdSlider`s (`ui/widgets/fft_threshold_widget.py`), driven with real Qt events on an
 * offscreen display by `generate_fft_slider_goldens.py`. Replayed here:
 *
 * - each bar's markers, in list order, and the marker being dragged, after every double-click,
 *   press, move, release and right-click: fractional cutoffs on the frequency bar, whole levels on
 *   the intensity bar, a double-click within ten units ignored, any marker removable
 * - each bar's paint calls: legacy's fixed colours whatever the theme, and its labels, a percent
 *   rounded as Python rounds or a whole level, never spread apart
 * - the box: a disabled bar takes nothing, ticking enables both, unticking clears both
 * - the status line, the group's title, the labels and tooltips, in legacy's words
 *
 * And what reaches the pixels URL: the box alone asks for the filter, because legacy's filter
 * changes the image with no thresholds at all.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import golden from "../fixtures/legacy-fft-slider.json" with { type: "json" };
import type { ApiClient } from "../../src/api/client.js";
import { FFT_TOOLTIPS, FrequencyPanel } from "../../src/workspace/FrequencyPanel.jsx";
import { processingQuery } from "../../src/workspace/processing.js";
import { ThresholdBar } from "../../src/workspace/ThresholdBar.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

type Kind = "frequency" | "intensity";

interface Step {
  readonly event: "dblclick" | "press" | "move" | "release" | "context";
  readonly x: number;
  readonly y: number;
  readonly markers: readonly number[];
  readonly dragging: number;
}

interface Call {
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

const BARS = {
  frequency: { name: "Frequency Bands", maximum: 10000 },
  intensity: { name: "Intensity Levels", maximum: 255 },
} as const;

let barWidth = 296;

beforeEach(() => {
  // jsdom lays nothing out, so each bar is given the width legacy's widget had.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({ x: 0, y: 0, left: 0, top: 0, width: barWidth, height: 60, right: barWidth, bottom: 60, toJSON: () => ({}) }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Harness({ kind, start }: { readonly kind: Kind; readonly start: readonly number[] }): ReactNode {
  const [markers, setMarkers] = useState<readonly number[]>(start);
  const bar = BARS[kind];
  return <ThresholdBar variant="fft" channel={bar.name} maximum={bar.maximum} markers={markers} enabled onChange={setMarkers} />;
}

const bar = (kind: Kind) => screen.getByRole("group", { name: `${BARS[kind].name} threshold` });

function shown(kind: Kind): { markers: number[]; dragging: number } {
  const handles = [...bar(kind).querySelectorAll<SVGRectElement>("[data-marker]")];
  return {
    markers: handles.map((handle) => Number(handle.dataset["marker"])),
    dragging: handles.findIndex((handle) => handle.classList.contains("threshold-bar__handle--dragging")),
  };
}

function send(target: HTMLElement, step: Pick<Step, "event" | "x" | "y">): void {
  const at = { clientX: step.x, clientY: step.y };
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
  }
}

describe("the two bars, replaying legacy's events", () => {
  for (const scenario of golden.scenarios) {
    it(scenario.name, () => {
      barWidth = scenario.width;
      const kind = scenario.kind as Kind;
      render(<Harness kind={kind} start={scenario.start} />);

      scenario.steps.forEach((step, index) => {
        send(bar(kind), step as Step);
        const where = `step ${index + 1}, ${step.event} at (${step.x}, ${step.y})`;
        expect({ where, ...shown(kind) }).toEqual({ where, markers: step.markers, dragging: step.dragging });
      });
    });
  }
});

// ---- The drawing ---------------------------------------------------------------------------------

const STYLES = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "styles.css"),
  "utf8",
);

/** A declaration from the first rule whose selector is exactly `selector`, or null. */
function declaration(selector: string, property: string): string | null {
  const start = STYLES.indexOf(`${selector} {`);
  if (start < 0) return null;
  const body = STYLES.slice(start, STYLES.indexOf("}", start));
  const match = new RegExp(`(?:^|[;\\s])${property.replace(/[-]/g, "\\-")}:\\s*([^;]+);`).exec(body);
  return match === null ? null : match[1]!.trim();
}

/**
 * What the FFT bar's element gets for a property: its own FFT rule first, then the bar's base rule,
 * as the cascade gives it (the FFT rules are more specific).
 */
function styleOf(element: Element, property: string): string {
  const classes = [...element.classList];
  const own = classes.includes("threshold-bar__handle--dragging")
    ? "threshold-bar__handle--dragging"
    : classes.find((name) => name.startsWith("threshold-bar__"))!;
  const value = declaration(`.threshold-bar--fft .${own}`, property) ?? declaration(`.${own}`, property);
  if (value === null) throw new Error(`.${own} has no ${property}`);
  return value;
}

function rgb(value: string): number[] {
  const match = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(value);
  if (match === null) throw new Error(`not a fixed colour: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function drawn(kind: Kind): Call[] {
  const svg = bar(kind).querySelector("svg")!;
  return [...svg.children].map((element) => {
    const number = (name: string) => Number(element.getAttribute(name));
    if (element.tagName === "text") {
      return {
        op: "text",
        x: number("x"),
        y: number("y"),
        text: element.textContent ?? "",
        pen: { rgba: [...rgb(styleOf(element, "fill")), 255], width: 1 },
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
    if (element.classList.contains("threshold-bar__band")) {
      const alpha = Math.round(Number(element.getAttribute("fill-opacity")) * 255);
      return { ...base, pen: { rgba: [0, 0, 0, 0], width: 1 }, brush: { rgba: [...rgb(element.getAttribute("fill")!), alpha] } };
    }
    return {
      ...base,
      pen: { rgba: [...rgb(styleOf(element, "stroke")), 255], width: Number.parseInt(styleOf(element, "stroke-width"), 10) },
      brush: { rgba: [...rgb(styleOf(element, "fill")), 255] },
    };
  });
}

describe("each bar, drawing what legacy paints", () => {
  for (const paint of golden.paints) {
    it(paint.name, () => {
      barWidth = paint.width;
      const kind = paint.kind as Kind;
      render(<Harness kind={kind} start={paint.markers} />);
      if (paint.dragging >= 0) {
        // Into the dragging state the way a user gets there: a press on that handle, at a pixel no
        // earlier handle in the list covers (a press takes the first handle that contains it).
        const at = (value: number) => 20 + Math.trunc((value / BARS[kind].maximum) * (paint.width - 40));
        const target = at(paint.markers[paint.dragging]!);
        const earlier = paint.markers.slice(0, paint.dragging).map(at);
        const x = [...Array(12).keys()]
          .map((offset) => target - 6 + offset)
          .find((candidate) => earlier.every((other) => candidate < other - 6 || candidate >= other + 6))!;
        fireEvent.pointerDown(bar(kind), { clientX: x, clientY: 30, button: 0, pointerId: 1 });
        expect(shown(kind).dragging).toBe(paint.dragging);
      }

      expect(drawn(kind)).toEqual((paint.calls as readonly Call[]).filter((call) => call.op !== "font"));
    });
  }

  it("paints its own colours in either theme: none of them is a theme token", () => {
    // FFTThresholdSlider.paintEvent never asks the palette (fft_threshold_widget.py:27-119).
    for (const part of ["text", "track", "handle"]) {
      for (const property of ["fill", "stroke"]) {
        const value = declaration(`.threshold-bar--fft .threshold-bar__${part}`, property);
        if (value !== null) expect(value).not.toMatch(/var\(/);
      }
    }
    expect(golden.paints.every((p) => p.calls[0]?.op === "font" && (p.calls[0] as { pointSize?: number }).pointSize === 9)).toBe(true);
  });
});

// ---- The section, wired to the workspace ---------------------------------------------------------

const IMAGE: WireDatasetImage = { key: "a.png", name: "a.png", sidecars: {}, annotated: false, sharesSidecarsWith: [] };

function Probe(): ReactNode {
  const { openImage, processing } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE)}>open</button>
      <p data-testid="query">{processingQuery(processing)}</p>
    </>
  );
}

function mount(sourceChannels: number) {
  const client = {
    imageMetadata: async () => ({ width: 40, height: 20, sourceFormat: "png", sourceDepth: 8, sourceChannels }),
    loadAnnotations: async () => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;
  return render(
    <WorkspaceProvider client={client} projectId="p">
      <Probe />
      <FrequencyPanel />
    </WorkspaceProvider>,
  );
}

async function open(sourceChannels: number) {
  const view = mount(sourceChannels);
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.queryByText("Load a single channel (grayscale) image")).toBeNull());
  return view;
}

const query = () => screen.getByTestId("query").textContent;
const box = () => screen.getByRole("checkbox", { name: "Enable FFT Frequency Thresholding" }) as HTMLInputElement;
const status = (text: string) => golden.statuses.find((s) => s.image === text)!;

describe("the section, in legacy's words", () => {
  it("has legacy's group, box, labels, tooltips and instructions, and no paragraphs", () => {
    barWidth = 296;
    const { container } = mount(1);
    const section = container.querySelector(".fft")!;

    expect(section.querySelector("legend")?.textContent).toBe(golden.texts.group);
    expect(box().parentElement?.textContent).toBe(golden.texts.checkbox);
    // The status line, the two bar labels and the instructions, in legacy's order.
    const labels = [...section.querySelectorAll("span")].map((span) => span.textContent);
    expect(labels).toEqual(golden.texts.labels);
    expect(FFT_TOOLTIPS).toEqual({ frequency: golden.texts.frequencyTooltip, intensity: golden.texts.intensityTooltip });
    expect(bar("frequency").title).toBe(golden.texts.frequencyTooltip);
    expect(bar("intensity").title).toBe(golden.texts.intensityTooltip);
    expect(section.querySelectorAll("p, [role=alert], [role=status]")).toHaveLength(0);
  });

  it("says what the image allows, as legacy's status line does", async () => {
    barWidth = 296;
    mount(1);
    expect(screen.getByText(status("none").text)).toBeTruthy();
    cleanup();

    await open(1);
    expect(screen.getByText(status("gray").text).className).toContain("processing__info--good");
    cleanup();

    await open(3);
    expect(screen.getByText(status("colour").text).className).toContain("processing__info--bad");
  });
});

describe("the box, replaying legacy's", () => {
  it("keeps the bars disabled until ticked, and clears both when unticked", async () => {
    barWidth = 296;
    await open(1);

    for (const [index, step] of golden.widget.entries()) {
      const where = `step ${index + 1}, ${step.event}`;
      if (step.event === "check" || step.event === "uncheck") fireEvent.click(box());
      else send(bar(step.slider as Kind), { event: "dblclick", x: step.x!, y: step.y! });

      await waitFor(() =>
        expect({
          where,
          checked: box().checked,
          frequency: shown("frequency").markers,
          intensity: shown("intensity").markers,
        }).toEqual({ where, checked: step.checked, frequency: step.frequency, intensity: step.intensity }),
      );
    }
  });
});

describe("what reaches the pixels URL", () => {
  it("asks for the filter when the box is ticked, before any threshold", async () => {
    // Legacy's filter changes the image with no thresholds: the transform and back, stretched to
    // 0..255 (fft_threshold_widget.py:410-453).
    barWidth = 296;
    await open(1);
    expect(query()).toBe("");

    fireEvent.click(box());

    await waitFor(() => expect(query()).toBe("?fft=1"));
  });

  it("sends a cutoff where the bar leaves it, fraction and all", async () => {
    barWidth = 296;
    await open(1);
    fireEvent.click(box());

    send(bar("frequency"), { event: "dblclick", x: 33, y: 30 });
    send(bar("intensity"), { event: "dblclick", x: 148, y: 30 });

    await waitFor(() => expect(query()).toBe("?fft=1&frequencies=507.8125&intensities=127"));
  });

  it("asks for nothing once the box is unticked", async () => {
    barWidth = 296;
    await open(1);
    fireEvent.click(box());
    send(bar("frequency"), { event: "dblclick", x: 148, y: 30 });
    await waitFor(() => expect(query()).toBe("?fft=1&frequencies=5000"));

    fireEvent.click(box());

    await waitFor(() => expect(query()).toBe(""));
  });

  it("can be emptied: every cutoff removable, the box still on", async () => {
    barWidth = 296;
    await open(1);
    fireEvent.click(box());
    send(bar("frequency"), { event: "dblclick", x: 148, y: 30 });
    await waitFor(() => expect(query()).toBe("?fft=1&frequencies=5000"));

    send(bar("frequency"), { event: "context", x: 148, y: 30 });

    await waitFor(() => expect(query()).toBe("?fft=1"));
  });
});
