/**
 * Legacy's multi-marker threshold bar, as geometry and rules — `MultiIndicatorSlider` in
 * `ui/widgets/channel_threshold_widget.py:22-313`.
 *
 * Kept apart from the component so the arithmetic can be held to legacy's own numbers:
 * `test/fixtures/legacy-channel-slider.json` is recorded from the widget itself, driven with real
 * Qt events, and the tests replay it against this.
 *
 * EVERYTHING IS IN THE WIDGET'S PIXELS, as legacy's is. The bar is 60 px tall and at least 200 wide;
 * the track is inset 20 px each side, 25 px down and 10 tall. A marker's value comes from where it
 * sits on the track and is truncated to a whole level, so the same click lands on the same level
 * in both apps at the same width.
 */

/** The bar's fixed height and minimum width (`channel_threshold_widget.py:39-41`). */
export const BAR_HEIGHT = 60;
export const BAR_MIN_WIDTH = 200;

/** The track: `QRect(20, 25, width - 40, 10)` (`channel_threshold_widget.py:57-60`). */
export const TRACK_MARGIN = 20;
export const TRACK_TOP = 25;
export const TRACK_HEIGHT = 10;

/**
 * Two markers closer than this are not allowed: a double-click that close to one is IGNORED
 * (`channel_threshold_widget.py:249-253`). Not snapped, not refused with a message. In absolute
 * levels, so on a 16-bit bar it is less than a pixel and barely a constraint.
 */
export const MIN_MARKER_SPACING = 10;

/** The bar's range: 0 to 256 for an 8-bit image, 0 to 65536 for 16-bit (lines 429-435). */
export function barMaximum(sourceDepth: 8 | 16): number {
  return sourceDepth === 16 ? 65536 : 256;
}

/** Legacy's name for a channel's bar and the colour its bands are drawn in (lines 44-55). */
export const CHANNEL_COLOURS = {
  Red: [255, 100, 100],
  Green: [100, 255, 100],
  Blue: [100, 100, 255],
  Gray: [200, 200, 200],
} as const satisfies Record<string, readonly [number, number, number]>;

export type BarChannel = keyof typeof CHANNEL_COLOURS;

export interface Track {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The track for a bar of this width. */
export function trackOf(width: number): Track {
  return { left: TRACK_MARGIN, top: TRACK_TOP, width: width - 2 * TRACK_MARGIN, height: TRACK_HEIGHT };
}

/** `value_to_x` (lines 62-66): the left edge plus the truncated fraction of the track. */
export function valueToX(value: number, maximum: number, track: Track): number {
  return track.left + Math.trunc((value / maximum) * track.width);
}

/**
 * `x_to_value` (lines 68-79): clamped to the track, then truncated to a whole level. A channel
 * bar's maximum is 256 or 65536, both of which legacy truncates.
 */
export function xToValue(x: number, maximum: number, track: Track): number {
  const ratio = Math.max(0, Math.min(1, (x - track.left) / track.width));
  return Math.trunc(ratio * maximum);
}

/**
 * Whether a point is on the track, where a double-click adds a marker (line 246).
 *
 * Qt's `QRect.contains` includes the last pixel column and row, `left + width - 1` and
 * `top + height - 1`. Half-open intervals say the same for whole pixels and extend it to the
 * fractional ones a zoomed browser reports.
 */
export function onTrack(x: number, y: number, track: Track): boolean {
  return x >= track.left && x < track.left + track.width && y >= track.top && y < track.top + track.height;
}

/**
 * The marker a point grabs, or -1: the FIRST in list order whose handle contains it, which is
 * what decides an overlap (lines 227-239 for a press, 286-297 for a right-click). A handle is
 * `QRect(x - 6, top - 3, 12, height + 6)`, 12 by 16 around the marker.
 */
export function handleAt(
  markers: readonly number[],
  x: number,
  y: number,
  maximum: number,
  track: Track,
): number {
  if (y < track.top - 3 || y >= track.top + track.height + 3) return -1;
  return markers.findIndex((value) => {
    const at = valueToX(value, maximum, track);
    return x >= at - 6 && x < at + 6;
  });
}

/**
 * A double-click's new marker list, or null when legacy would ignore it (lines 241-258): off the
 * track, or closer than `MIN_MARKER_SPACING` to any marker already there. The list comes back
 * SORTED, as legacy sorts it on every add, which also tidies an order a drag left behind.
 */
export function withMarkerAt(
  markers: readonly number[],
  x: number,
  y: number,
  maximum: number,
  track: Track,
): number[] | null {
  if (!onTrack(x, y, track)) return null;
  const value = xToValue(x, maximum, track);
  if (markers.some((existing) => Math.abs(value - existing) < MIN_MARKER_SPACING)) return null;
  return [...markers, value].sort((a, b) => a - b);
}

/**
 * Where a dragged marker goes (lines 260-272): the pointer less the offset it was grabbed at,
 * clamped to the bar. Nothing else moves and the list is NOT re-sorted, so a marker dragged past
 * another keeps its place in the list.
 */
export function withMarkerMoved(
  markers: readonly number[],
  index: number,
  pointerX: number,
  offset: number,
  maximum: number,
  track: Track,
): number[] {
  const value = Math.max(0, Math.min(maximum, xToValue(pointerX - offset, maximum, track)));
  return markers.map((existing, at) => (at === index ? value : existing));
}

/** One band of the track, between two markers or a marker and an end (lines 106-152). */
export interface Band {
  readonly x: number;
  readonly width: number;
  /** 50 for the lowest band up to 200 for the highest, out of 255. */
  readonly alpha: number;
}

/**
 * The bands, drawn from the SORTED markers: one faint band when there are none, otherwise
 * N + 1, their opacity rising evenly from `50` to `200` — the same ramp the thresholding applies
 * to the pixels, so the bar reads darkest to brightest the way the image will.
 */
export function bandsOf(markers: readonly number[], maximum: number, track: Track): Band[] {
  const sorted = [...markers].sort((a, b) => a - b);
  if (sorted.length === 0) return [{ x: track.left, width: track.width, alpha: 50 }];

  const bands: Band[] = [];
  for (let i = 0; i <= sorted.length; i += 1) {
    const start = valueToX(i === 0 ? 0 : sorted[i - 1]!, maximum, track);
    const end = valueToX(i === sorted.length ? maximum : sorted[i]!, maximum, track);
    bands.push({ x: start, width: end - start, alpha: Math.trunc(50 + (i / sorted.length) * 150) });
  }
  return bands;
}

/** Where a marker's value is written: `drawText(x - 15, bottom + 15)` after spacing (185-219). */
export interface Label {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

/**
 * The value labels under the handles, pushed apart as legacy pushes them.
 *
 * Sorted by position, each label at least 30 px right of the one before it, but never past
 * `track right - 15`. That cap can put the last label to the LEFT of its neighbour when both are
 * crowded at the top of the range, overlapping it; legacy does, and so does this.
 */
export function labelsOf(markers: readonly number[], maximum: number, track: Track): Label[] {
  const placed = markers
    .map((value) => ({ x: valueToX(value, maximum, track), text: String(Math.trunc(value)) }))
    .sort((a, b) => a.x - b.x);

  const right = track.left + track.width - 1 - 15;
  const adjusted: { x: number; text: string }[] = [];
  for (const label of placed) {
    const previous = adjusted.at(-1);
    if (previous === undefined || label.x - previous.x >= 30) adjusted.push(label);
    else adjusted.push({ x: Math.min(previous.x + 30, right), text: label.text });
  }

  const baseline = track.top + track.height - 1 + 15;
  return adjusted.map(({ x, text }) => ({ x: Math.trunc(x - 15), y: baseline, text }));
}

/** Whether two marker lists are the same list, order included. */
export function sameMarkers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
