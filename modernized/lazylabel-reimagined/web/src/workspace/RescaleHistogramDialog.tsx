/**
 * The Rescale histogram dialog — legacy's `RescaleHistogramDialog`
 * (`ui/widgets/rescale_histogram_dialog.py:310-581`), opened by the Rescale section's Hist button.
 *
 * Laid out as legacy's is: the histogram canvas; Min, the stats line and Max under it; a Presets
 * group with the Contrast Stretch slider on one row and Equalize, CLAHE, Clip and Tile on the next,
 * then the preset line; and Linear/Log, Apply and Cancel at the bottom. Its words are legacy's, and
 * what explains a control is that control's own tooltip.
 *
 * WHAT EACH CONTROL DOES IS LEGACY'S:
 *
 * - Drag the green min or red max line on the histogram. A press within 8 px takes a line, the max
 *   line first; the lines cannot pass each other. Moving one drops a pending preset (lines 274-303,
 *   491-498).
 * - Contrast Stretch sets the lines at the chosen saturation's percentiles as the slider moves
 *   (lines 506-528). It sets lines, not a preset.
 * - Equalize and CLAHE make a PENDING preset and preview what it would make in orange; changing
 *   Clip or Tile re-runs a pending CLAHE (lines 530-564).
 * - Linear/Log toggles the histogram's scale; the button names the other one (lines 458-462, 500-502).
 * - Apply sends the pending preset if there is one, and the lines otherwise, then closes. Cancel and
 *   Escape close with nothing sent (lines 466-477, 576-581).
 *
 * WHERE THE NUMBERS COME FROM. The dialog is given the level counts of the image region legacy's
 * would be given (`/histogram`), and computes the bars, the stretch percentiles and Equalize's table
 * from them exactly as legacy computes them from its array (`rescaleHistogram.ts`). CLAHE is spatial,
 * so its preview's counts are asked of the server, which computes it as the pixels will be. The
 * preview arrives when that answer does; what CLAHE would apply does not wait for it.
 */

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { WireHistogram } from "@lazylabel/contracts";

import { Dialog } from "../shell/Dialog.jsx";
import {
  CANVAS_HEIGHT,
  CANVAS_MIN_WIDTH,
  binned,
  canvasDrawing,
  claheName,
  claheText,
  equalized,
  lineAt,
  mapped,
  plotOf,
  statsText,
  stretchText,
  stretchValueText,
  stretchWindow,
  withLineMoved,
  type Draw,
  type Line,
  type Rgba,
} from "./rescaleHistogram.js";

/** What Apply hands back when a preset is pending (line 578). */
export type AppliedPreset =
  | { readonly kind: "equalize"; readonly name: string }
  | { readonly kind: "clahe"; readonly name: string; readonly clipLimit: number; readonly tiles: number };

export interface RescaleHistogramDialogProps {
  /** The region's level counts, as `/histogram` answered for it. */
  readonly histogram: WireHistogram;
  /** The Rescale slider's values as the dialog opens: where its lines start (main_window.py:2801-2802). */
  readonly current: { readonly min: number; readonly max: number };
  /** The counts of what CLAHE makes of the region, for the preview. */
  readonly loadClahe: (clipLimit: number, tiles: number) => Promise<WireHistogram>;
  /** Apply with no preset pending: the lines, for the slider (`applied`, line 580). */
  readonly onApplyWindow: (window: { readonly min: number; readonly max: number }) => void;
  /** Apply with Equalize or CLAHE pending (`lut_applied`, line 578). */
  readonly onApplyPreset: (preset: AppliedPreset) => void;
  readonly onClose: () => void;
}

/** Legacy's tooltips, word for word (lines 389-392, 407-410, 416-419, 433, 442, 459). */
export const TOOLTIPS = {
  stretch: "Saturation %: how much of the tails to clip.\n0% = full min/max stretch, higher = more aggressive",
  equalize: "Histogram equalization — spreads intensity values\nuniformly for maximum global contrast",
  clahe: "Contrast Limited Adaptive Histogram Equalization\nEnhances local contrast while limiting noise amplification",
  clip: "CLAHE clip limit (higher = more contrast)",
  tile: "CLAHE tile grid size",
  log: "Toggle logarithmic / linear scale",
} as const;

type Pending = { readonly kind: "equalize" } | { readonly kind: "clahe"; readonly clip: number; readonly tile: number } | null;

const rgb = ([r, g, b]: Rgba) => `rgb(${r} ${g} ${b})`;

/** One drawn thing as SVG, carrying legacy's numbers in its attributes. */
function svgOf(draw: Draw, key: number): ReactNode {
  switch (draw.op) {
    case "fillRect":
      return <rect key={key} data-op="fillRect" x={draw.x} y={draw.y} width={draw.width} height={draw.height} fill={rgb(draw.fill)} />;
    case "rect":
      return (
        <rect
          key={key}
          data-op="rect"
          x={draw.x}
          y={draw.y}
          width={draw.width}
          height={draw.height}
          fill={draw.fill === null ? "none" : rgb(draw.fill)}
          fillOpacity={draw.fill === null ? undefined : draw.fill[3] / 255}
          stroke={draw.stroke === null ? undefined : rgb(draw.stroke)}
          strokeOpacity={draw.stroke === null ? undefined : draw.stroke[3] / 255}
          strokeWidth={draw.stroke === null ? undefined : 1}
        />
      );
    case "line":
      // Qt's DashLine at width 2: dashes of 4 and gaps of 2, in pen widths.
      return (
        <line
          key={key}
          data-op="line"
          x1={draw.x1}
          y1={draw.y1}
          x2={draw.x2}
          y2={draw.y2}
          stroke={rgb(draw.stroke)}
          strokeWidth={2}
          strokeDasharray="8 4"
        />
      );
    case "polygon":
      return (
        <polygon key={key} data-op="polygon" points={draw.points.map((p) => p.join(",")).join(" ")} fill={rgb(draw.fill)} />
      );
    case "text":
      return (
        <text
          key={key}
          data-op="text"
          x={draw.x}
          y={draw.y}
          fill={rgb(draw.fill)}
          transform={draw.rotated === undefined ? undefined : `translate(${draw.rotated.x} ${draw.rotated.y}) rotate(-90)`}
        >
          {draw.text}
        </text>
      );
  }
}

export function RescaleHistogramDialog({
  histogram,
  current,
  loadClahe,
  onApplyWindow,
  onApplyPreset,
  onClose,
}: RescaleHistogramDialogProps): ReactNode {
  const dataMax = histogram.depth === 16 ? 65535 : 255;
  const [bins] = useState(() => binned(histogram.levels, dataMax));
  const [window, setWindow] = useState(current);
  const [dragging, setDragging] = useState<Line | null>(null);
  const [log, setLog] = useState(true);
  const [preview, setPreview] = useState<readonly number[] | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [presetText, setPresetText] = useState("");
  // The slider opens at 4 (0.4%) and does nothing until it MOVES (lines 386-393).
  const [stretch, setStretch] = useState(4);
  const [clip, setClip] = useState(2);
  const [clipText, setClipText] = useState("2.00");
  const [tile, setTile] = useState(8);
  const [tileText, setTileText] = useState("8");
  // Each CLAHE preview asked for, so an answer that comes back after a later action is dropped.
  const asked = useRef(0);

  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(634);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (element === null) return undefined;
    const measure = () => setWidth(Math.max(CANVAS_MIN_WIDTH, element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** A line moved: legacy's `_on_values_changed` drops whatever preset was pending (lines 491-498). */
  const linesMoved = (next: { readonly min: number; readonly max: number }) => {
    asked.current += 1;
    setWindow(next);
    setPending(null);
    setPresetText("");
    setPreview(null);
  };

  const runClahe = (clipLimit: number, tiles: number) => {
    setPending({ kind: "clahe", clip: clipLimit, tile: tiles });
    setPresetText(claheText(clipLimit, tiles));
    asked.current += 1;
    const ask = asked.current;
    void loadClahe(clipLimit, tiles).then(
      (answer) => {
        if (asked.current === ask) setPreview(binned(answer.levels, dataMax));
      },
      () => undefined,
    );
  };

  const local = (event: { clientX: number; clientY: number; currentTarget: Element }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      plot: plotOf(Math.max(CANVAS_MIN_WIDTH, rect.width), CANVAS_HEIGHT),
    };
  };

  // The drag, and the lines as it leaves them, in refs as well as state: two pointer events can
  // arrive before a render, and each must see what the one before it did.
  const drag = useRef<Line | null>(null);
  const lines = useRef(window);
  lines.current = window;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const { x, y, plot } = local(event);
    const line = lineAt(lines.current, x, y, dataMax, plot);
    if (line === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = line;
    setDragging(line);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const line = drag.current;
    if (line === null) return;
    const { x, plot } = local(event);
    const next = withLineMoved(lines.current, line, x, dataMax, plot);
    lines.current = next;
    linesMoved(next);
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(null);
  };

  const drawing = canvasDrawing({
    width,
    height: CANVAS_HEIGHT,
    dataMax,
    bins,
    preview,
    min: window.min,
    max: window.max,
    log,
    dragging,
  });

  const apply = () => {
    if (pending?.kind === "equalize") onApplyPreset({ kind: "equalize", name: "Histogram Equalization" });
    else if (pending?.kind === "clahe") {
      onApplyPreset({ kind: "clahe", name: claheName(pending.clip, pending.tile), clipLimit: pending.clip, tiles: pending.tile });
    } else onApplyWindow(window);
    onClose();
  };

  return (
    <Dialog title="Rescale Histogram" onClose={onClose} closeButton={false} modal>
      <div className="histogram-dialog">
        <div className="histogram-dialog__caption">Rescale Histogram</div>
        <div
          ref={canvas}
          className={dragging === null ? "histogram-dialog__canvas" : "histogram-dialog__canvas histogram-dialog__canvas--dragging"}
          role="group"
          aria-label="Histogram"
          data-dragging={dragging ?? ""}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => {
            if (event.button === 0) endDrag();
          }}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        >
          <svg width="100%" height={CANVAS_HEIGHT} className="histogram-dialog__drawing">
            {drawing.map(svgOf)}
          </svg>
        </div>

        <div className="histogram-dialog__info">
          <span className="histogram-dialog__min">Min: {window.min}</span>
          <span className="histogram-dialog__stats">{statsText(histogram.pixels, histogram.min, histogram.max)}</span>
          <span className="histogram-dialog__max">Max: {window.max}</span>
        </div>

        <fieldset className="histogram-dialog__presets">
          <legend>Presets</legend>
          <div className="histogram-dialog__row">
            <span>Contrast Stretch</span>
            <input
              type="range"
              min={0}
              max={500}
              value={stretch}
              aria-label="Contrast Stretch"
              title={TOOLTIPS.stretch}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (value === stretch) return;
                setStretch(value);
                linesMoved(stretchWindow(histogram.levels, histogram.pixels, value / 10, dataMax));
                setPresetText(stretchText(value));
              }}
            />
            <span className="histogram-dialog__percent">{stretchValueText(stretch)}</span>
          </div>
          <div className="histogram-dialog__row">
            <button
              type="button"
              title={TOOLTIPS.equalize}
              onClick={() => {
                asked.current += 1;
                setPending({ kind: "equalize" });
                setPresetText("Histogram Equalization (preview in orange)");
                const table = equalized(histogram.levels, histogram.pixels, dataMax);
                setPreview(binned(mapped(histogram.levels, table), dataMax));
              }}
            >
              Equalize
            </button>
            <button type="button" title={TOOLTIPS.clahe} onClick={() => runClahe(clip, tile)}>
              CLAHE
            </button>
            <span className="histogram-dialog__separator" aria-hidden="true" />
            <label>
              Clip:
              <input
                type="number"
                className="histogram-dialog__clip"
                min={0.5}
                max={40}
                step={0.5}
                value={clipText}
                title={TOOLTIPS.clip}
                onChange={(event) => {
                  setClipText(event.currentTarget.value);
                  // QDoubleSpinBox keeps two decimals and takes only what is in range (lines 428-431).
                  const value = Math.round(Number(event.currentTarget.value) * 100) / 100;
                  if (event.currentTarget.value === "" || !Number.isFinite(value) || value < 0.5 || value > 40) return;
                  if (value === clip) return;
                  setClip(value);
                  if (pending?.kind === "clahe") runClahe(value, tile);
                }}
                onBlur={() => setClipText(clip.toFixed(2))}
              />
            </label>
            <label>
              Tile:
              <input
                type="number"
                className="histogram-dialog__tile"
                min={2}
                max={32}
                step={1}
                value={tileText}
                title={TOOLTIPS.tile}
                onChange={(event) => {
                  setTileText(event.currentTarget.value);
                  const value = Number(event.currentTarget.value);
                  if (event.currentTarget.value === "" || !Number.isInteger(value) || value < 2 || value > 32) return;
                  if (value === tile) return;
                  setTile(value);
                  if (pending?.kind === "clahe") runClahe(clip, value);
                }}
                onBlur={() => setTileText(String(tile))}
              />
            </label>
          </div>
          <span className="histogram-dialog__preset">{presetText}</span>
        </fieldset>

        <div className="histogram-dialog__buttons">
          <button type="button" className="histogram-dialog__scale" title={TOOLTIPS.log} onClick={() => setLog((on) => !on)}>
            {log ? "Linear" : "Log"}
          </button>
          <span className="histogram-dialog__stretch" />
          <button type="button" className="histogram-dialog__apply" onClick={apply}>
            Apply
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
