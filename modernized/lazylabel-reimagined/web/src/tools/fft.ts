/**
 * RULE-030's frequency banding, without the transform.
 *
 * The FFT itself is a standard algorithm; what is specific to LazyLabel is everything around it —
 * how a pixel's distance from the centre becomes a frequency, how thresholds become bands, what
 * weight each band gets, and how the result comes back to 8 bits. Those are here and tested, so
 * when the transform lands it has a verified frame to sit in rather than one being written at the
 * same time.
 *
 * `test/fixtures/legacy-fft.json` holds the end-to-end goldens, including two odd-sized cases that
 * distinguish legacy's `fftshift`-instead-of-`ifftshift` from the correct inverse.
 */

/** The slider's range: 0..10000, giving 0.01% steps (`fft_threshold_widget.py:283-330`). */
export const FREQUENCY_SLIDER_MAX = 10000;

/**
 * Each pixel's distance from the spectrum's centre, normalized to 0..1.
 *
 * The centre is `height // 2, width // 2` — integer division, so on an odd-sized image it is the
 * exact middle pixel and on an even one it is the one just past it. The scale is the HALF-DIAGONAL
 * `sqrt((h/2)^2 + (w/2)^2)`, which uses true division, so the two disagree slightly on odd sizes.
 * Both are legacy's, and reproducing one without the other shifts every band boundary.
 *
 * Clipped to 1, because a corner of an even-sized image is fractionally past the half-diagonal.
 */
export function frequencyDistance(height: number, width: number): Float64Array {
  const distance = new Float64Array(height * width);
  const centreY = Math.floor(height / 2);
  const centreX = Math.floor(width / 2);
  const maxFrequency = Math.sqrt((height / 2) ** 2 + (width / 2) ** 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const raw = Math.sqrt((y - centreY) ** 2 + (x - centreX) ** 2) / maxFrequency;
      distance[y * width + x] = Math.min(1, Math.max(0, raw));
    }
  }

  return distance;
}

/**
 * The weight every pixel of the spectrum gets, from a set of slider thresholds.
 *
 * N thresholds make N+1 bands. Band 0 is weighted 0 and the last 1, evenly in between — so the
 * LOWEST frequencies are removed and the highest kept, which is a high-pass filter. With one
 * threshold the result is a plain high-pass: everything below it is multiplied by zero.
 *
 * The band bounds are `<=` for the first and `>` for the rest, which puts a pixel exactly on a
 * threshold in the LOWER band. That matters at the centre pixel, whose distance is exactly 0.
 */
export function bandWeights(
  distance: Float64Array,
  thresholds: readonly number[],
): Float64Array {
  const weights = new Float64Array(distance.length);

  if (thresholds.length === 0) {
    weights.fill(1);
    return weights;
  }

  const normalized = [...thresholds].sort((a, b) => a - b).map((t) => t / FREQUENCY_SLIDER_MAX);
  const bands = normalized.length + 1;

  for (let i = 0; i < distance.length; i += 1) {
    const d = distance[i]!;

    let band = bands - 1;
    if (d <= normalized[0]!) band = 0;
    else {
      for (let b = 1; b < bands - 1; b += 1) {
        if (d > normalized[b - 1]! && d <= normalized[b]!) {
          band = b;
          break;
        }
      }
    }

    weights[i] = bands > 1 ? band / (bands - 1) : 1;
  }

  return weights;
}

/**
 * Bring a filtered plane back to 8 bits — subtract the minimum, scale the maximum to 255, truncate.
 *
 * TRUNCATED, not rounded: `astype(np.uint8)` drops the fraction, and after this normalization
 * almost every value is fractional, so rounding would differ on most pixels of most images.
 *
 * An entirely flat result is left at zero rather than divided by its own zero range, which is what
 * legacy's `if np.max(...) > 0` guard does.
 */
export function normalizeToByte(values: Float64Array): Uint8Array {
  const out = new Uint8Array(values.length);
  if (values.length === 0) return out;

  let lowest = Infinity;
  for (const value of values) if (value < lowest) lowest = value;

  let highest = 0;
  for (const value of values) {
    const shifted = value - lowest;
    if (shifted > highest) highest = shifted;
  }

  if (highest <= 0) return out;

  for (let i = 0; i < values.length; i += 1) {
    out[i] = Math.min(255, Math.max(0, Math.trunc(((values[i]! - lowest) / highest) * 255)));
  }

  return out;
}
