/**
 * Rescale and channel thresholding — RULE-032 and RULE-029.
 *
 * THE ORDER IS PART OF THE CONTRACT, and RULE-032 states it: rescale, then channel threshold, then
 * FFT, then 16-bit to 8-bit, then the display adjustments in `adjustments.ts`. Each step reads the
 * previous one's output, so moving any of them changes every pixel — thresholding before rescaling
 * puts the bands in different places, and converting to 8 bits early throws away the precision the
 * earlier steps work in.
 *
 * Both of these operate on the raw image, which may be 16-bit. That is why the maximum is a
 * parameter rather than 255: doing the arithmetic in 8 bits first and widening afterwards would
 * quantise a 16-bit image to 256 levels before anything had a chance to use the rest.
 */

/** 8-bit and 16-bit maxima, which is what the widgets' ranges are built from. */
export const MAX_8_BIT = 255;
export const MAX_16_BIT = 65535;

/**
 * Stretch a clipped range to the full one — RULE-032.
 *
 * `(clip(v, min, max) - min) / (max - min) x outputMax`, truncated. Everything at or below `min`
 * becomes 0 and everything at or above `max` becomes the maximum, so it is a contrast stretch that
 * discards what falls outside the window rather than compressing it.
 *
 * `max <= min` leaves the image ALONE rather than dividing by zero or blanking it. A user dragging
 * the handles past each other should see nothing happen, not lose their image.
 */
export function rescale(value: number, min: number, max: number, outputMax = MAX_8_BIT): number {
  if (max <= min) return value;
  const clipped = Math.min(max, Math.max(min, value));
  return Math.trunc(((clipped - min) / (max - min)) * outputMax);
}

export function rescaleAll(
  values: Uint8Array | Uint16Array,
  min: number,
  max: number,
  outputMax = MAX_8_BIT,
): void {
  if (max <= min) return;
  for (let i = 0; i < values.length; i += 1) values[i] = rescale(values[i]!, min, max, outputMax);
}

/**
 * Posterize a channel into bands — RULE-029.
 *
 * N markers make N+1 bands. Below the first is 0, at or above the last is the maximum, and middle
 * band `i` becomes `trunc(i / N x maximum)`.
 *
 * THE BOUNDS ARE HALF-OPEN: lower inclusive, upper exclusive. With markers [50, 150] a value of
 * exactly 50 is in the middle band and a value of exactly 150 is at the top, which is what the
 * rule card's example turns on — 49 and 50 land in different bands, and so do 149 and 150.
 */
export function posterize(value: number, markers: readonly number[], maximum = MAX_8_BIT): number {
  if (markers.length === 0) return value;

  const sorted = [...markers].sort((a, b) => a - b);
  const bands = sorted.length;

  if (value < sorted[0]!) return 0;
  if (value >= sorted[bands - 1]!) return maximum;

  // Which gap it falls in. Band i runs from sorted[i-1] (inclusive) to sorted[i] (exclusive).
  let band = 0;
  for (let i = 0; i < bands; i += 1) {
    if (value >= sorted[i]!) band = i + 1;
  }

  return Math.trunc((band / bands) * maximum);
}

export function posterizeAll(
  values: Uint8Array | Uint16Array,
  markers: readonly number[],
  maximum = MAX_8_BIT,
): void {
  if (markers.length === 0) return;
  for (let i = 0; i < values.length; i += 1) values[i] = posterize(values[i]!, markers, maximum);
}

/** `channel_threshold_widget.py`: markers closer together than this are not allowed. */
export const MIN_MARKER_SPACING = 10;

/**
 * Whether a set of markers is legal.
 *
 * The spacing rule keeps a user from making bands they cannot see or aim at. It is stated in
 * absolute units, so on a 16-bit image ten units is a two-thousandth of the range and effectively
 * no constraint — which the rule card notes and which is worth knowing before someone treats the
 * limit as meaningful there.
 */
export function markersAreLegal(markers: readonly number[]): boolean {
  const sorted = [...markers].sort((a, b) => a - b);
  return sorted.every((marker, index) => index === 0 || marker - sorted[index - 1]! >= MIN_MARKER_SPACING);
}
