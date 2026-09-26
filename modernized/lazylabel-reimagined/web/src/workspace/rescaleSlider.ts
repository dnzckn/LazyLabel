/**
 * Legacy's Rescale slider, as geometry and rules — `RescaleSlider` in
 * `ui/widgets/rescale_widget.py:25-180`.
 *
 * ONE SLIDER WITH TWO HANDLES THAT CANNOT PASS EACH OTHER. A dragged min handle stops at the max
 * handle and the other way round (lines 155-167), so the window can never be inverted. Where the
 * two overlap, a press takes the MAX handle (lines 143-153), which can then only move up; that is
 * how legacy separates them, and so is this.
 *
 * Kept apart from the component so the arithmetic can be held to legacy's own numbers:
 * `test/fixtures/legacy-rescale-slider.json` is recorded from the widget itself, driven with real
 * Qt events, and the tests replay it against this.
 *
 * EVERYTHING IS IN THE WIDGET'S PIXELS, as legacy's is. The slider is 50 px tall and at least 200
 * wide; the track is inset 20 px each side, 18 px down and 10 tall. A value comes from where it sits
 * on the track and is truncated to a whole level, so the same drag lands on the same level in both
 * apps at the same width. Truncation both ways also means a handle grabbed and moved by nothing can
 * land a level lower, as legacy's does.
 */

/** The slider's fixed height and minimum width (`rescale_widget.py:41-44`). */
export const SLIDER_HEIGHT = 50;
export const SLIDER_MIN_WIDTH = 200;

/** The track: `QRect(20, 18, width - 40, 10)` (lines 71-73). */
export const TRACK_MARGIN = 20;
export const TRACK_TOP = 18;
export const TRACK_HEIGHT = 10;

export type Handle = "min" | "max";

export interface Window {
  readonly min: number;
  readonly max: number;
}

export interface Track {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The track for a slider of this width. */
export function trackOf(width: number): Track {
  return { left: TRACK_MARGIN, top: TRACK_TOP, width: width - 2 * TRACK_MARGIN, height: TRACK_HEIGHT };
}

/** `_val_to_x` (lines 75-78): the left edge plus the truncated fraction of the track. */
export function valueToX(value: number, maximum: number, track: Track): number {
  return track.left + Math.trunc((value / Math.max(1, maximum)) * track.width);
}

/** `_x_to_val` (lines 80-84): clamped to the track, then truncated to a whole level. */
export function xToValue(x: number, maximum: number, track: Track): number {
  const ratio = Math.max(0, Math.min(1, (x - track.left) / Math.max(1, track.width)));
  return Math.trunc(ratio * maximum);
}

/**
 * The handle a press takes, or null (lines 140-153): the MAX handle first, so it wins where the
 * two overlap. A handle is `QRect(x - 6, top - 3, 12, height + 6)`, 12 by 16 around its value.
 *
 * Qt's `QRect.contains` includes the last pixel column and row; half-open intervals say the same
 * for whole pixels and extend it to the fractional ones a zoomed browser reports.
 */
export function handleAt(window: Window, x: number, y: number, maximum: number, track: Track): Handle | null {
  if (y < track.top - 3 || y >= track.top + track.height + 3) return null;
  const on = (value: number) => {
    const at = valueToX(value, maximum, track);
    return x >= at - 6 && x < at + 6;
  };
  if (on(window.max)) return "max";
  if (on(window.min)) return "min";
  return null;
}

/**
 * Where a dragged handle goes (lines 155-167): the pointer less the offset it was grabbed at,
 * clamped to the range, and never past the other handle.
 */
export function withHandleMoved(
  window: Window,
  handle: Handle,
  pointerX: number,
  offset: number,
  maximum: number,
  track: Track,
): Window {
  const value = Math.max(0, Math.min(maximum, xToValue(pointerX - offset, maximum, track)));
  return handle === "min"
    ? { min: Math.min(value, window.max), max: window.max }
    : { min: window.min, max: Math.max(value, window.min) };
}

/** The highlighted part of the track, between the two handles (lines 106-112). */
export function rangeOf(window: Window, maximum: number, track: Track): { readonly x: number; readonly width: number } {
  const x = valueToX(window.min, maximum, track);
  return { x, width: valueToX(window.max, maximum, track) - x };
}

/** Where each value is written: `drawText(x - 15, bottom + 14)`, min first (lines 128-138). */
export function labelsOf(window: Window, maximum: number, track: Track): { x: number; y: number; text: string }[] {
  const baseline = track.top + track.height - 1 + 14;
  return [window.min, window.max].map((value) => ({
    x: valueToX(value, maximum, track) - 15,
    y: baseline,
    text: String(value),
  }));
}
