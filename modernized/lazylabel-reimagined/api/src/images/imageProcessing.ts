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
 *
 * IN SINGLE PRECISION, AS LEGACY'S IS. It converts the image to float32 and does each step there
 * (`rescale_widget.py:378-391`), so the quotient and the product are each rounded to float32 before
 * the truncation. On 8-bit data that never changes the answer — every window was checked — but on
 * 16-bit data float64 lands one level lower for some values under most windows, and a threshold
 * marker on that level then puts the pixel in the other band. `Math.fround` after each operation
 * is exactly numpy's float32 result, because double precision holds a float32 operation exactly
 * enough for one rounding.
 */
export function rescale(value: number, min: number, max: number, outputMax = MAX_8_BIT): number {
  if (max <= min) return value;
  const clipped = Math.min(max, Math.max(min, value));
  return Math.trunc(Math.fround(Math.fround((clipped - min) / (max - min)) * outputMax));
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


/**
 * The window a contrast stretch would use — RULE-031's first preset.
 *
 * `saturation` is the percentage of pixels sacrificed at EACH tail, so 0.4 (the default) means the
 * darkest 0.4% all become black and the brightest 0.4% all become white. That is the point of the
 * preset: a handful of outlying pixels otherwise hold the whole range hostage, and one hot pixel
 * in a dark frame makes every real value sit in the bottom few levels.
 *
 * The bounds are floor and ceil rather than round, which widens the window by up to a level at
 * each end. Legacy does this, and it is the safer direction: a window that is a hair too wide
 * keeps a pixel that a too-narrow one would have clipped.
 *
 * A saturation of 0 uses the actual data range, which is a stretch with nothing sacrificed.
 */
export function stretchWindow(
  values: Uint8Array | Uint16Array,
  saturation = 0.4,
): { readonly min: number; readonly max: number } {
  if (values.length === 0) return { min: 0, max: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const lowest = sorted[0]!;
  const highest = sorted[sorted.length - 1]!;

  if (saturation <= 0) return { min: lowest, max: highest };

  // Counted, not indexed by a fraction of the length. The question the preset answers is "how
  // many pixels am I willing to sacrifice", so the tail is a COUNT of pixels -- and on a
  // hundred-pixel image 1% has to mean one pixel rather than rounding to none.
  const fraction = Math.min(50, saturation) / 100;
  const sacrifice = Math.floor(sorted.length * fraction);
  const low = sorted[Math.min(sorted.length - 1, sacrifice)]!;
  const high = sorted[Math.max(0, sorted.length - 1 - sacrifice)]!;

  // Clamped to the data range, so a percentile that lands outside it cannot produce a window the
  // image does not occupy.
  return {
    min: Math.max(lowest, Math.floor(low)),
    max: Math.min(highest, Math.ceil(high)),
  };
}

/**
 * The equalization lookup table — RULE-031's second preset.
 *
 * `(cdf - cdfMin) / max(1, N - cdfMin) x maximum`, clipped and truncated. It spreads the values
 * the image actually uses across the whole range, so a histogram with three tight clusters becomes
 * three widely separated ones.
 *
 * `cdfMin` is the FIRST NON-ZERO cumulative count, not the count at level zero. Using the latter
 * makes the darkest occupied level map somewhere above black on any image that does not contain a
 * true black pixel — the image comes out washed out, subtly, and only on some images.
 *
 * `max(1, ...)` is legacy's guard against a single-valued image, where N equals cdfMin and the
 * denominator would be zero.
 */
export function equalizeLut(
  values: Uint8Array | Uint16Array,
  maximum = MAX_8_BIT,
): Uint32Array {
  const levels = maximum + 1;
  const histogram = new Uint32Array(levels);
  for (const value of values) {
    const level = Math.min(maximum, Math.max(0, value));
    histogram[level] = (histogram[level] ?? 0) + 1;
  }

  const lut = new Uint32Array(levels);
  const total = values.length;
  if (total === 0) return lut;

  let cumulative = 0;
  let cdfMin = 0;
  let seen = false;

  for (let level = 0; level < levels; level += 1) {
    cumulative += histogram[level]!;
    if (!seen && cumulative > 0) {
      cdfMin = cumulative;
      seen = true;
    }
    const scaled = ((cumulative - cdfMin) / Math.max(1, total - cdfMin)) * maximum;
    lut[level] = Math.min(maximum, Math.max(0, Math.trunc(scaled)));
  }

  return lut;
}

