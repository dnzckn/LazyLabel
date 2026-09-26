/**
 * The Rescale histogram dialog does what legacy's does and draws what legacy's draws.
 *
 * `test/fixtures/legacy-rescale-histogram.json` was recorded from legacy's own
 * `RescaleHistogramDialog` (`ui/widgets/rescale_histogram_dialog.py`) by
 * `generate_rescale_histogram_goldens.py`, on the same two images the API's goldens use. The dialog
 * here is given each image's level counts, which is what `/histogram` answers, and has to match:
 *
 * - every paint call of the histogram canvas, in order: bars, orange preview outlines, border, the
 *   dashed lines, the triangles (lighter while dragged), and every label, the rotated one included
 * - the lines after each press, move and release, with the same pointer positions
 * - Contrast Stretch's lines and labels for a spread of slider values, which is numpy's
 *   percentile ported
 * - the labels Equalize and CLAHE write, CLAHE re-running when Clip or Tile change, the stats line,
 *   the Linear/Log text, the tooltips and the controls' ranges
 * - what Apply sends in each state
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireHistogram } from "@lazylabel/contracts";

import golden from "../fixtures/legacy-rescale-histogram.json" with { type: "json" };
import {
  RescaleHistogramDialog,
  TOOLTIPS,
  type AppliedPreset,
} from "../../src/workspace/RescaleHistogramDialog.jsx";
import { pythonFloat } from "../../src/workspace/rescaleHistogram.js";

type Rgba = readonly number[];

interface Call {
  readonly op: "fillRect" | "rect" | "line" | "polygon" | "text";
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
  readonly points?: readonly (readonly number[])[];
  readonly text?: string;
  readonly pen?: { readonly rgba: Rgba; readonly width: number; readonly style: string } | null;
  readonly brush?: { readonly rgba: Rgba } | null;
  readonly translate?: readonly number[];
  readonly rotate?: number;
}

interface Image {
  readonly depth: 8 | 16;
  readonly pixels: number;
  readonly min: number;
  readonly max: number;
  readonly levels: readonly (readonly [number, number])[];
  readonly clahe: Readonly<Record<string, readonly (readonly [number, number])[]>>;
}

const images = golden.images as unknown as Readonly<Record<string, Image>>;
const [CANVAS_WIDTH, CANVAS_HEIGHT] = golden.layout.canvas as [number, number];

beforeEach(() => {
  // jsdom lays nothing out: the canvas is given the size legacy's has as the dialog opens.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        right: CANVAS_WIDTH,
        bottom: CANVAS_HEIGHT,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function histogramOf(name: string): WireHistogram {
  const image = images[name]!;
  return { depth: image.depth, width: 0, height: 0, pixels: image.pixels, min: image.min, max: image.max, levels: image.levels };
}

function mount(name: string, current: readonly (number | null)[]) {
  const image = images[name]!;
  const top = image.depth === 16 ? 65535 : 255;
  const onApplyWindow = vi.fn();
  const onApplyPreset = vi.fn<(preset: AppliedPreset) => void>();
  const onClose = vi.fn();
  const loadClahe = vi.fn(async (clip: number, tiles: number): Promise<WireHistogram> => {
    const levels = image.clahe[`${pythonFloat(clip)}:${tiles}`];
    if (levels === undefined) throw new Error(`no golden for CLAHE ${clip}:${tiles}`);
    return { ...histogramOf(name), levels };
  });
  render(
    <RescaleHistogramDialog
      histogram={histogramOf(name)}
      current={{ min: current[0] ?? 0, max: current[1] ?? top }}
      loadClahe={loadClahe}
      onApplyWindow={onApplyWindow}
      onApplyPreset={onApplyPreset}
      onClose={onClose}
    />,
  );
  return { onApplyWindow, onApplyPreset, onClose, loadClahe };
}

const canvas = () => screen.getByRole("group", { name: "Histogram" });
const stretchSlider = () => screen.getByRole("slider", { name: "Contrast Stretch" }) as HTMLInputElement;
const clipBox = () => document.querySelector<HTMLInputElement>(".histogram-dialog__clip")!;
const tileBox = () => document.querySelector<HTMLInputElement>(".histogram-dialog__tile")!;
const text = (selector: string) => document.querySelector(selector)?.textContent;

function setStretch(value: number) {
  fireEvent.change(stretchSlider(), { target: { value: String(value) } });
}

function setClip(value: string) {
  fireEvent.change(clipBox(), { target: { value } });
}

function setTile(value: string) {
  fireEvent.change(tileBox(), { target: { value } });
}

// ---- Reading the drawing back as legacy's paint calls -------------------------------------------

const RGB = /^rgb\((\d+) (\d+) (\d+)\)$/;

function colour(value: string | null, opacity: string | null): Rgba {
  const match = RGB.exec(value ?? "");
  if (match === null) throw new Error(`not a colour: ${value}`);
  const alpha = opacity === null ? 255 : Math.round(Number(opacity) * 255);
  return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
}

interface Normal {
  readonly op: string;
  readonly [key: string]: unknown;
}

function normalLegacy(call: Call): Normal {
  switch (call.op) {
    case "fillRect":
      return { op: "fillRect", x: call.x, y: call.y, width: call.width, height: call.height, fill: call.brush!.rgba };
    case "rect":
      return {
        op: "rect",
        x: call.x,
        y: call.y,
        width: call.width,
        height: call.height,
        fill: call.brush?.rgba ?? null,
        stroke: call.pen === null || call.pen === undefined ? null : { rgba: call.pen.rgba, width: call.pen.width },
      };
    case "line":
      return { op: "line", x1: call.x1, y1: call.y1, x2: call.x2, y2: call.y2, stroke: call.pen };
    case "polygon":
      expect(call.pen).toBeNull();
      return { op: "polygon", points: call.points, fill: call.brush!.rgba };
    case "text":
      return { op: "text", x: call.x, y: call.y, text: call.text, fill: call.pen!.rgba, translate: call.translate, rotate: call.rotate };
  }
}

function normalDrawn(element: Element): Normal {
  const attribute = (name: string) => element.getAttribute(name);
  const number = (name: string) => Number(attribute(name));
  switch (attribute("data-op")) {
    case "fillRect":
      return { op: "fillRect", x: number("x"), y: number("y"), width: number("width"), height: number("height"), fill: colour(attribute("fill"), null) };
    case "rect":
      return {
        op: "rect",
        x: number("x"),
        y: number("y"),
        width: number("width"),
        height: number("height"),
        fill: attribute("fill") === "none" ? null : colour(attribute("fill"), attribute("fill-opacity")),
        stroke:
          attribute("stroke") === null
            ? null
            : { rgba: colour(attribute("stroke"), attribute("stroke-opacity")), width: number("stroke-width") },
      };
    case "line":
      return {
        op: "line",
        x1: number("x1"),
        y1: number("y1"),
        x2: number("x2"),
        y2: number("y2"),
        stroke: {
          rgba: colour(attribute("stroke"), null),
          width: number("stroke-width"),
          style: attribute("stroke-dasharray") === "8 4" ? "dash" : "solid",
        },
      };
    case "polygon":
      return {
        op: "polygon",
        points: (attribute("points") ?? "").split(" ").map((pair) => pair.split(",").map(Number)),
        fill: colour(attribute("fill"), null),
      };
    case "text": {
      const transform = /^translate\((-?\d+) (-?\d+)\) rotate\((-?\d+)\)$/.exec(attribute("transform") ?? "");
      return {
        op: "text",
        x: number("x"),
        y: number("y"),
        text: element.textContent,
        fill: colour(attribute("fill"), null),
        translate: transform === null ? [0, 0] : [Number(transform[1]), Number(transform[2])],
        rotate: transform === null ? 0 : Number(transform[3]),
      };
    }
    default:
      throw new Error(`not a drawn element: ${element.outerHTML.slice(0, 80)}`);
  }
}

const drawn = () => [...canvas().querySelectorAll("svg > *")].map(normalDrawn);

// ---- The golden file -----------------------------------------------------------------------------

describe("the golden file", () => {
  it("covers 8- and 16-bit, both scales, both previews, both lines dragged", () => {
    const names = golden.paints.map((p) => p.name).join("\n");
    expect(names).toMatch(/Equalize's preview/);
    expect(names).toMatch(/CLAHE's preview/);
    expect(golden.paints.some((p) => !p.log)).toBe(true);
    expect(new Set(golden.paints.map((p) => p.dragging))).toEqual(new Set([null, "min", "max"]));
    expect(new Set(golden.paints.map((p) => p.image))).toEqual(new Set(["gray8", "gray16"]));
  });

  it("records legacy's sizes: a 650 by 560 dialog with a 634 by 280 canvas", () => {
    expect(golden.layout).toEqual({
      dialog: [650, 560],
      canvas: [634, 280],
      minimumDialog: [600, 520],
      minimumCanvas: [500, 280],
    });
  });
});

describe("drawing what legacy paints", () => {
  for (const paint of golden.paints) {
    it(paint.name, async () => {
      mount(paint.image, paint.current);
      if (paint.name.includes("Contrast Stretch at 3.5%")) setStretch(35);
      if (paint.name.includes("Equalize")) fireEvent.click(screen.getByRole("button", { name: "Equalize" }));
      if (paint.name.includes("CLAHE")) {
        fireEvent.click(screen.getByRole("button", { name: "CLAHE" }));
        await waitFor(() => expect(canvas().querySelector("text:last-of-type")?.textContent).toBe("preview"));
      }
      if (!paint.log) fireEvent.click(screen.getByRole("button", { name: "Linear" }));
      if (paint.dragging !== null) {
        // Into the dragging state the way a user gets there: a press on that line.
        const value = paint.dragging === "min" ? paint.min : paint.max;
        const top = images[paint.image]!.depth === 16 ? 65535 : 255;
        const x = 50 + Math.trunc((value / top) * (CANVAS_WIDTH - 70));
        fireEvent.pointerDown(canvas(), { clientX: x, clientY: 100, button: 0, pointerId: 1 });
        expect(canvas().dataset["dragging"]).toBe(paint.dragging);
      }

      expect(drawn()).toEqual((paint.calls as readonly Call[]).map(normalLegacy));
    });
  }
});

describe("dragging the lines", () => {
  for (const scenario of golden.scenarios) {
    it(scenario.name, () => {
      mount(scenario.image, scenario.current);

      scenario.steps.forEach((step, index) => {
        const at = { clientX: step.x, clientY: step.y, pointerId: 1 };
        if (step.event === "press") fireEvent.pointerDown(canvas(), { ...at, button: 0 });
        else if (step.event === "move") fireEvent.pointerMove(canvas(), { ...at, buttons: 1 });
        else fireEvent.pointerUp(canvas(), { ...at, button: 0 });

        const where = `step ${index + 1}, ${step.event} at (${step.x}, ${step.y})`;
        expect({
          where,
          min: text(".histogram-dialog__min"),
          max: text(".histogram-dialog__max"),
          dragging: canvas().dataset["dragging"] || null,
        }).toEqual({ where, min: step.minLabel, max: step.maxLabel, dragging: step.dragging });
      });
    });
  }
});

describe("Contrast Stretch", () => {
  for (const name of ["gray8", "gray16"]) {
    it(`sets legacy's lines and labels for every slider value, ${name}`, () => {
      // numpy's percentile, floor and ceil of it, as legacy's _preset_percentile (lines 512-528).
      mount(name, [null, null]);
      for (const expected of golden.stretches.filter((s) => s.image === name)) {
        setStretch(expected.slider);
        expect({
          slider: expected.slider,
          min: text(".histogram-dialog__min"),
          max: text(".histogram-dialog__max"),
          value: text(".histogram-dialog__percent"),
          preset: text(".histogram-dialog__preset"),
        }).toEqual({
          slider: expected.slider,
          min: `Min: ${expected.min}`,
          max: `Max: ${expected.max}`,
          value: expected.valueLabel,
          preset: expected.presetLabel,
        });
      }
    });
  }
});

describe("what it writes", () => {
  for (const expected of golden.texts) {
    it(`in legacy's words, ${expected.image}`, async () => {
      mount(expected.image, [null, null]);

      expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe(expected.title);
      expect(text(".histogram-dialog__stats")).toBe(expected.stats);
      expect(text(".histogram-dialog__min")).toBe(expected.min);
      expect(text(".histogram-dialog__max")).toBe(expected.max);
      expect(text(".histogram-dialog__percent")).toBe(expected.stretchValue);

      const scale = document.querySelector(".histogram-dialog__scale")!;
      const shown = [scale.textContent];
      fireEvent.click(scale);
      shown.push(scale.textContent);
      fireEvent.click(scale);
      shown.push(scale.textContent);
      expect(shown).toEqual(expected.log);

      fireEvent.click(screen.getByRole("button", { name: "Equalize" }));
      expect(text(".histogram-dialog__preset")).toBe(expected.equalize);
      // Clip changed with Equalize pending re-runs nothing (lines 542-545).
      setClip("2.5");
      expect(text(".histogram-dialog__preset")).toBe(expected.equalizeAfterClip);
      fireEvent.click(screen.getByRole("button", { name: "CLAHE" }));
      expect(text(".histogram-dialog__preset")).toBe(expected.clahe);
      setTile("4");
      expect(text(".histogram-dialog__preset")).toBe(expected.claheAfterTile);
      setClip("40");
      expect(text(".histogram-dialog__preset")).toBe(expected.claheAfterClip);
      await waitFor(() => expect(canvas().querySelector("text:last-of-type")?.textContent).toBe("preview"));
    });
  }

  it("carries legacy's tooltips and ranges", () => {
    const expected = golden.texts[0]!;
    mount("gray8", [null, null]);

    expect(TOOLTIPS).toEqual(expected.tooltips);
    expect(stretchSlider().title).toBe(expected.tooltips.stretch);
    expect(screen.getByRole("button", { name: "Equalize" }).title).toBe(expected.tooltips.equalize);
    expect(screen.getByRole("button", { name: "CLAHE" }).title).toBe(expected.tooltips.clahe);
    expect(clipBox().title).toBe(expected.tooltips.clip);
    expect(tileBox().title).toBe(expected.tooltips.tile);
    expect((document.querySelector(".histogram-dialog__scale") as HTMLElement).title).toBe(expected.tooltips.log);

    expect([Number(stretchSlider().min), Number(stretchSlider().max), Number(stretchSlider().value)]).toEqual(expected.ranges.stretch);
    const [low, high, step, decimals] = expected.ranges.clip as number[];
    expect([Number(clipBox().min), Number(clipBox().max), Number(clipBox().step)]).toEqual([low, high, step]);
    // QDoubleSpinBox shows two decimals: 2.00.
    expect(clipBox().value).toBe((2).toFixed(decimals));
    expect([Number(tileBox().min), Number(tileBox().max), tileBox().value]).toEqual([...expected.ranges.tile, "8"]);
  });

  it("has no paragraphs", () => {
    mount("gray8", [null, null]);
    expect(screen.getByRole("dialog").querySelectorAll("p, [role=alert], [role=status]")).toHaveLength(0);
  });
});

describe("what Apply sends", () => {
  for (const expected of golden.applies) {
    it(expected.name, async () => {
      const { onApplyWindow, onApplyPreset, onClose } = mount(expected.image, expected.current);

      switch (expected.name) {
        case "nothing touched: the lines as they opened":
          break;
        case "Equalize":
          fireEvent.click(screen.getByRole("button", { name: "Equalize" }));
          break;
        case "CLAHE":
          setClip("3.5");
          setTile("4");
          fireEvent.click(screen.getByRole("button", { name: "CLAHE" }));
          break;
        case "Equalize, then a line dragged: the lines win": {
          fireEvent.click(screen.getByRole("button", { name: "Equalize" }));
          const to = 50 + Math.trunc((60 / 255) * (CANVAS_WIDTH - 70));
          fireEvent.pointerDown(canvas(), { clientX: 50, clientY: 40, button: 0, pointerId: 1 });
          fireEvent.pointerMove(canvas(), { clientX: to, clientY: 40, buttons: 1, pointerId: 1 });
          fireEvent.pointerUp(canvas(), { clientX: to, clientY: 40, button: 0, pointerId: 1 });
          break;
        }
        case "Contrast Stretch":
          setStretch(10);
          break;
        case "Equalize, then Contrast Stretch: the stretch wins":
          fireEvent.click(screen.getByRole("button", { name: "Equalize" }));
          setStretch(10);
          break;
        case "Contrast Stretch, then CLAHE: CLAHE wins":
          setStretch(10);
          fireEvent.click(screen.getByRole("button", { name: "CLAHE" }));
          break;
        case "CLAHE, then Clip changed: CLAHE again with the new clip":
          fireEvent.click(screen.getByRole("button", { name: "CLAHE" }));
          setClip("6.5");
          break;
        default:
          throw new Error(`no action for ${expected.name}`);
      }
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));

      const sent = [
        ...onApplyWindow.mock.calls.map(([window]) => ({ signal: "applied", min: window.min, max: window.max })),
        ...onApplyPreset.mock.calls.map(([preset]) => ({ signal: "lut_applied", name: preset.name })),
      ];
      expect(sent).toEqual(expected.sent);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  }

  it("sends CLAHE's own numbers with its name", () => {
    const { onApplyPreset } = mount("gray8", [null, null]);
    setClip("3.5");
    setTile("4");
    fireEvent.click(screen.getByRole("button", { name: "CLAHE" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplyPreset).toHaveBeenCalledWith({ kind: "clahe", name: "CLAHE (clip=3.5, tile=4)", clipLimit: 3.5, tiles: 4 });
  });

  it("sends nothing on Cancel or Escape", () => {
    const first = mount("gray8", [30, 90]);
    setStretch(10);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(first.onClose).toHaveBeenCalledTimes(1);
    expect(first.onApplyWindow).not.toHaveBeenCalled();
    cleanup();

    const second = mount("gray8", [30, 90]);
    fireEvent.click(screen.getByRole("button", { name: "Equalize" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(second.onClose).toHaveBeenCalledTimes(1);
    expect(second.onApplyPreset).not.toHaveBeenCalled();
  });
});
