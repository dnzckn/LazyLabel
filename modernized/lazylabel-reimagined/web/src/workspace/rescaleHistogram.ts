/**
 * Legacy's Rescale histogram dialog, as arithmetic and geometry —
 * `ui/widgets/rescale_histogram_dialog.py`.
 *
 * Everything here is computed from what the API's `/histogram` sends: how many pixels of the region
 * sit at each level, at the image's own depth. That is all legacy's dialog ever reads of its image,
 * so the numbers are its numbers:
 *
 * - the 256 bars, binned as `np.histogram(..., bins=256, range=(0, max))` bins them (lines 110-126)
 * - Contrast Stretch's window, `floor` and `ceil` of `np.percentile` with numpy's default 'linear'
 *   method, ported from numpy 2.2's own `_quantile` and `_lerp` (lines 512-528)
 * - Equalize's table and the histogram of what it makes (lines 28-47, 530-540)
 * - the canvas: its plot rectangle, where a value sits on it, which line a press takes, and every
 *   rectangle, line, triangle and label its paint draws, in paint order (lines 86-307)
 *
 * `test/fixtures/legacy-rescale-histogram.json` is recorded from the dialog itself, and the tests
 * hold this to it call for call.
 */

/** `[level, count]` for every level present, lowest first: the API's answer. */
export type Levels = readonly (readonly [number, number])[];

/** Both histograms have 256 bars: `min(256, max - min + 1)` for any range legacy opens (line 117). */
export const BINS = 256;

/** The canvas's margins around the plot (lines 91-94). */
export const MARGIN_LEFT = 50;
export const MARGIN_RIGHT = 20;
export const MARGIN_TOP = 20;
export const MARGIN_BOTTOM = 40;

/** The canvas's minimum size, and its height as the dialog opens (lines 108, 332-334). */
export const CANVAS_MIN_WIDTH = 500;
export const CANVAS_HEIGHT = 280;

/** The level a bar covers, as `np.histogram` bins it over `(0, max)` with 256 equal bins. */
export function binOf(value: number, dataMax: number): number {
  return Math.min(BINS - 1, Math.floor((value * BINS) / dataMax));
}

/** The 256 bar heights, before any log (lines 120-123, 76-83). */
export function binned(levels: Levels, dataMax: number): number[] {
  const bins = Array<number>(BINS).fill(0);
  for (const [level, count] of levels) bins[binOf(level, dataMax)]! += count;
  return bins;
}

/** The `k`-th smallest value, counting from 0: what `np.partition` puts at `k`. */
function orderStatistic(levels: Levels, k: number): number {
  let seen = 0;
  for (const [level, count] of levels) {
    seen += count;
    if (seen > k) return level;
  }
  return levels.at(-1)?.[0] ?? 0;
}

/**
 * `np.percentile(image, q)`, numpy 2.2's default 'linear' method.
 *
 * The index is `(n - 1) * (q / 100)`; past the last one the answer is the maximum. Between two
 * order statistics `a` and `b` numpy interpolates from whichever end is nearer:
 * `a + (b - a) * t` below one half and `b - (b - a) * (1 - t)` from it (`_lerp`). The two are the
 * same number in exact arithmetic and not always in floating point, and `floor` or `ceil` of the
 * result is the window legacy sets.
 */
export function percentile(levels: Levels, pixels: number, q: number): number {
  const virtual = (pixels - 1) * (q / 100);
  if (virtual >= pixels - 1) return orderStatistic(levels, pixels - 1);
  const previous = Math.floor(virtual);
  const gamma = virtual - previous;
  const a = orderStatistic(levels, previous);
  const b = orderStatistic(levels, previous + 1);
  const difference = b - a;
  return gamma >= 0.5 ? b - difference * (1 - gamma) : a + difference * gamma;
}

/**
 * Contrast Stretch's window for a saturation percent (`_preset_percentile`, lines 512-528).
 *
 * At 0% it is the data's own range. Otherwise `floor` of the `pct` percentile and `ceil` of the
 * `100 - pct` one, kept inside `0..max`.
 */
export function stretchWindow(
  levels: Levels,
  pixels: number,
  pct: number,
  dataMax: number,
): { readonly min: number; readonly max: number } {
  if (pct <= 0) return { min: levels[0]?.[0] ?? 0, max: levels.at(-1)?.[0] ?? 0 };
  const low = Math.floor(percentile(levels, pixels, pct));
  const high = Math.ceil(percentile(levels, pixels, 100 - pct));
  return { min: Math.max(0, low), max: Math.min(dataMax, high) };
}

/**
 * Equalize's table, level by level (`_build_equalization_lut`, lines 28-47):
 * `(cdf - cdfMin) / max(1, N - cdfMin) x max`, clipped and truncated, where `cdfMin` is the first
 * non-zero cumulative count. Returned for the levels present, which are the only ones it is read at.
 */
export function equalized(levels: Levels, pixels: number, dataMax: number): Map<number, number> {
  const table = new Map<number, number>();
  const cdfMin = levels[0]?.[1] ?? 0;
  const denominator = Math.max(1, pixels - cdfMin);
  let cumulative = 0;
  for (const [level, count] of levels) {
    cumulative += count;
    const value = ((cumulative - cdfMin) / denominator) * dataMax;
    table.set(level, Math.trunc(Math.min(dataMax, Math.max(0, value))));
  }
  return table;
}

/** The histogram of `table[image]`: Equalize's orange preview (lines 537-540). */
export function mapped(levels: Levels, table: ReadonlyMap<number, number>): Levels {
  const counts = new Map<number, number>();
  for (const [level, count] of levels) {
    const to = table.get(level)!;
    counts.set(to, (counts.get(to) ?? 0) + count);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
}

// ---- The canvas -------------------------------------------------------------------------------------

export interface Plot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** `_plot_rect` (lines 140-146). Its right and bottom are Qt's, `left + width - 1` and `top + height - 1`. */
export function plotOf(width: number, height: number): Plot {
  return {
    left: MARGIN_LEFT,
    top: MARGIN_TOP,
    width: width - MARGIN_LEFT - MARGIN_RIGHT,
    height: height - MARGIN_TOP - MARGIN_BOTTOM,
  };
}

const right = (plot: Plot) => plot.left + plot.width - 1;
const bottom = (plot: Plot) => plot.top + plot.height - 1;

/** `_val_to_x` (lines 148-151). */
export function valueToX(value: number, dataMax: number, plot: Plot): number {
  return plot.left + Math.trunc((value / Math.max(1, dataMax)) * plot.width);
}

/** `_x_to_val` (lines 153-157): clamped to the plot, truncated to a whole level. */
export function xToValue(x: number, dataMax: number, plot: Plot): number {
  const ratio = Math.max(0, Math.min(1, (x - plot.left) / Math.max(1, plot.width)));
  return Math.trunc(ratio * dataMax);
}

export type Line = "min" | "max";

/**
 * The line a press takes, or null (lines 274-286): within 8 px of it, the MAX line first, and from
 * 5 px above the plot to 15 below it, where the triangles hang.
 */
export function lineAt(
  window: { readonly min: number; readonly max: number },
  x: number,
  y: number,
  dataMax: number,
  plot: Plot,
): Line | null {
  if (y < plot.top - 5 || y > bottom(plot) + 15) return null;
  if (Math.abs(x - valueToX(window.max, dataMax, plot)) <= 8) return "max";
  if (Math.abs(x - valueToX(window.min, dataMax, plot)) <= 8) return "min";
  return null;
}

/**
 * Where a dragged line goes (lines 288-298): straight to the pointer, no grab offset, clamped, and
 * never past the other line.
 */
export function withLineMoved(
  window: { readonly min: number; readonly max: number },
  line: Line,
  x: number,
  dataMax: number,
  plot: Plot,
): { readonly min: number; readonly max: number } {
  const value = Math.max(0, Math.min(dataMax, xToValue(x, dataMax, plot)));
  return line === "min"
    ? { min: Math.min(value, window.max), max: window.max }
    : { min: window.min, max: Math.max(value, window.min) };
}

export type Rgba = readonly [number, number, number, number];

/** One thing the canvas draws, in the terms legacy's painter was asked for it. */
export type Draw =
  | { readonly op: "fillRect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly fill: Rgba }
  | {
      readonly op: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly fill: Rgba | null;
      readonly stroke: Rgba | null;
    }
  | { readonly op: "line"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly stroke: Rgba }
  | { readonly op: "polygon"; readonly points: readonly (readonly [number, number])[]; readonly fill: Rgba }
  | {
      readonly op: "text";
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly fill: Rgba;
      /** `translate(12, centre)` then `rotate(-90)`, for the y-axis label only. */
      readonly rotated?: { readonly x: number; readonly y: number };
    };

const IN_RANGE: Rgba = [100, 180, 255, 200];
const OUT_OF_RANGE: Rgba = [120, 120, 120, 150];
const PREVIEW: Rgba = [255, 180, 50, 220];
const MIN_COLOUR: Rgba = [50, 200, 50, 255];
const MAX_COLOUR: Rgba = [200, 50, 50, 255];
/** `QColor.lighter(150)` of the two, as Qt computes it and the golden records it (line 263). */
const MIN_DRAGGED: Rgba = [109, 255, 109, 255];
const MAX_DRAGGED: Rgba = [255, 109, 109, 255];
const AXIS: Rgba = [200, 200, 200, 255];

export interface CanvasState {
  readonly width: number;
  readonly height: number;
  readonly dataMax: number;
  readonly bins: readonly number[];
  /** Equalize's or CLAHE's bars, drawn over the others in orange outline; null for none. */
  readonly preview: readonly number[] | null;
  readonly min: number;
  readonly max: number;
  readonly log: boolean;
  readonly dragging: Line | null;
}

/** `paintEvent` (lines 159-257), as a list of what it draws, in its order. */
export function canvasDrawing(state: CanvasState): Draw[] {
  const plot = plotOf(state.width, state.height);
  const { dataMax } = state;
  const box = { x: plot.left, y: plot.top, width: plot.width, height: plot.height };
  const drawn: Draw[] = [{ op: "fillRect", ...box, fill: [30, 30, 30, 255] }];

  const scale = (values: readonly number[]) => (state.log ? values.map((v) => Math.log1p(v)) : [...values]);
  const counts = scale(state.bins);
  const peak = (values: readonly number[]) => {
    const most = Math.max(...values);
    return most > 0 ? most : 1;
  };
  let maxCount = peak(counts);
  const previewCounts = state.preview === null ? null : scale(state.preview);
  if (previewCounts !== null) maxCount = Math.max(maxCount, peak(previewCounts));

  // The bins' edges are `linspace(0, max, 257)`, exact, and a bar sits on its bin's centre.
  const step = dataMax / BINS;
  const centre = (i: number) => (i * step + (i + 1) * step) / 2;
  const barWidth = Math.max(1, plot.width / BINS);
  const bars = (values: readonly number[], style: (i: number) => { fill: Rgba | null; stroke: Rgba | null }) =>
    values.forEach((value, i) => {
      const x = valueToX(centre(i), dataMax, plot);
      const h = Math.trunc((value / maxCount) * plot.height);
      drawn.push({
        op: "rect",
        x: Math.trunc(x - barWidth / 2),
        y: bottom(plot) - h,
        width: Math.max(1, Math.trunc(barWidth)),
        height: h,
        ...style(i),
      });
    });

  bars(counts, (i) => ({
    fill: state.min <= centre(i) && centre(i) <= state.max ? IN_RANGE : OUT_OF_RANGE,
    stroke: null,
  }));
  if (previewCounts !== null) bars(previewCounts, () => ({ fill: null, stroke: PREVIEW }));

  drawn.push({ op: "rect", ...box, fill: null, stroke: [80, 80, 80, 255] });

  const minX = valueToX(state.min, dataMax, plot);
  const maxX = valueToX(state.max, dataMax, plot);
  drawn.push({ op: "line", x1: minX, y1: plot.top, x2: minX, y2: bottom(plot), stroke: MIN_COLOUR });
  drawn.push({ op: "line", x1: maxX, y1: plot.top, x2: maxX, y2: bottom(plot), stroke: MAX_COLOUR });

  const triangle = (x: number, fill: Rgba): Draw => ({
    op: "polygon",
    points: [
      [x, bottom(plot)],
      [x - 6, bottom(plot) + 10],
      [x + 6, bottom(plot) + 10],
    ],
    fill,
  });
  drawn.push(triangle(minX, state.dragging === "min" ? MIN_DRAGGED : MIN_COLOUR));
  drawn.push(triangle(maxX, state.dragging === "max" ? MAX_DRAGGED : MAX_COLOUR));

  const middle = Math.floor(dataMax / 2);
  drawn.push({ op: "text", x: plot.left, y: bottom(plot) + 15, text: "0", fill: AXIS });
  drawn.push({ op: "text", x: valueToX(middle, dataMax, plot) - 10, y: bottom(plot) + 15, text: String(middle), fill: AXIS });
  drawn.push({ op: "text", x: right(plot) - 30, y: bottom(plot) + 15, text: String(dataMax), fill: AXIS });
  drawn.push({
    op: "text",
    x: -20,
    y: 0,
    text: state.log ? "log(count)" : "count",
    fill: AXIS,
    rotated: { x: 12, y: Math.floor((plot.top + bottom(plot)) / 2) },
  });

  drawn.push({ op: "text", x: minX - 15, y: bottom(plot) + 30, text: String(state.min), fill: MIN_COLOUR });
  drawn.push({ op: "text", x: maxX - 15, y: bottom(plot) + 30, text: String(state.max), fill: MAX_COLOUR });
  if (previewCounts !== null) {
    drawn.push({ op: "text", x: right(plot) - 80, y: plot.top + 14, text: "preview", fill: [255, 180, 50, 255] });
  }
  return drawn;
}

// ---- What the dialog writes -------------------------------------------------------------------------

/** Python's `repr` of a float, which is what legacy's labels write a Clip value with: 2.0, not 2. */
export function pythonFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

/** The stretch slider's value label, `f"{pct:.1f}%"` (line 509). */
export function stretchValueText(slider: number): string {
  return `${(slider / 10).toFixed(1)}%`;
}

/** The preset line after Contrast Stretch (lines 517, 523). */
export function stretchText(slider: number): string {
  return slider <= 0
    ? "Min/Max stretch (full data range)"
    : `Contrast stretch (${(slider / 10).toFixed(1)}% saturation)`;
}

/** The preset line after CLAHE (lines 559-561). */
export function claheText(clip: number, tile: number): string {
  return `CLAHE clip=${pythonFloat(clip)} tile=${tile}×${tile} (preview in orange)`;
}

/** The name legacy gives a CLAHE preset, which the Rescale section's status line shows (line 558). */
export function claheName(clip: number, tile: number): string {
  return `CLAHE (clip=${pythonFloat(clip)}, tile=${tile})`;
}

/** The stats line (lines 353-357): the pixel count with thousands separators, and the range. */
export function statsText(pixels: number, min: number, max: number): string {
  return `Pixels: ${pixels.toLocaleString("en-US")}  |  Image range: ${min}–${max}`;
}
