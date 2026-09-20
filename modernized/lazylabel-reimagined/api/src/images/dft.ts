/**
 * A 2-D discrete Fourier transform for arbitrary image sizes.
 *
 * Radix-2 alone is not enough: legacy accepts whatever size the image is, and a 1000x800 frame is
 * not a power of two. Padding to one is not an option either — it changes the spectrum, and the
 * band boundaries RULE-030 computes are fractions of the image's own half-diagonal. So
 * non-power-of-two lengths go through Bluestein's algorithm, which expresses a DFT of any length
 * as a convolution that a radix-2 transform can do.
 *
 * Nothing here is LazyLabel-specific; it is the transform `fft.ts` bands. It lives in its own
 * file for that reason — a bug in a Fourier transform and a bug in a band boundary want different
 * kinds of test, and mixing them makes both harder to trust.
 */

/** In-place radix-2 Cooley-Tukey. `re.length` must be a power of two. */
function radix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }

  const sign = inverse ? 1 : -1;

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (sign * 2 * Math.PI) / length;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let start = 0; start < n; start += length) {
      let curRe = 1;
      let curIm = 0;

      for (let k = 0; k < length / 2; k += 1) {
        const evenIndex = start + k;
        const oddIndex = start + k + length / 2;

        const oddRe = re[oddIndex]! * curRe - im[oddIndex]! * curIm;
        const oddIm = re[oddIndex]! * curIm + im[oddIndex]! * curRe;

        re[oddIndex] = re[evenIndex]! - oddRe;
        im[oddIndex] = im[evenIndex]! - oddIm;
        re[evenIndex] = re[evenIndex]! + oddRe;
        im[evenIndex] = im[evenIndex]! + oddIm;

        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

function nextPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) power <<= 1;
  return power;
}

/**
 * Bluestein's algorithm: a DFT of ANY length, as a convolution.
 *
 * The chirp `exp(-i pi k^2 / n)` turns the transform into a convolution of length `2n - 1`, which
 * is padded up to a power of two and done with `radix2`. The cost is three radix-2 transforms
 * instead of one, which is why power-of-two lengths skip it entirely.
 */
function bluestein(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  const m = nextPowerOfTwo(n * 2 + 1);
  const sign = inverse ? 1 : -1;

  const chirpRe = new Float64Array(n);
  const chirpIm = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    // (i*i % (2n)) rather than i*i keeps the angle exact for large n: i*i overflows the range
    // where a double represents every integer, and the phase would drift.
    const angle = (sign * Math.PI * ((i * i) % (2 * n))) / n;
    chirpRe[i] = Math.cos(angle);
    chirpIm[i] = Math.sin(angle);
  }

  const aRe = new Float64Array(m);
  const aIm = new Float64Array(m);
  for (let i = 0; i < n; i += 1) {
    aRe[i] = re[i]! * chirpRe[i]! - im[i]! * chirpIm[i]!;
    aIm[i] = re[i]! * chirpIm[i]! + im[i]! * chirpRe[i]!;
  }

  const bRe = new Float64Array(m);
  const bIm = new Float64Array(m);
  bRe[0] = chirpRe[0]!;
  bIm[0] = -chirpIm[0]!;
  for (let i = 1; i < n; i += 1) {
    bRe[i] = chirpRe[i]!;
    bIm[i] = -chirpIm[i]!;
    bRe[m - i] = chirpRe[i]!;
    bIm[m - i] = -chirpIm[i]!;
  }

  radix2(aRe, aIm, false);
  radix2(bRe, bIm, false);

  for (let i = 0; i < m; i += 1) {
    const productRe = aRe[i]! * bRe[i]! - aIm[i]! * bIm[i]!;
    aIm[i] = aRe[i]! * bIm[i]! + aIm[i]! * bRe[i]!;
    aRe[i] = productRe;
  }

  radix2(aRe, aIm, true);
  for (let i = 0; i < m; i += 1) {
    aRe[i] = aRe[i]! / m;
    aIm[i] = aIm[i]! / m;
  }

  for (let i = 0; i < n; i += 1) {
    re[i] = aRe[i]! * chirpRe[i]! - aIm[i]! * chirpIm[i]!;
    im[i] = aRe[i]! * chirpIm[i]! + aIm[i]! * chirpRe[i]!;
  }
}

/** One dimension, whatever its length. */
export function dft1d(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) === 0) radix2(re, im, inverse);
  else bluestein(re, im, inverse);
}

/**
 * A 2-D transform: every row, then every column.
 *
 * `inverse` divides by `height x width` at the end, matching numpy's `ifft2` — numpy puts the
 * whole 1/N on the inverse, and splitting it differently would scale every pixel.
 */
export function dft2d(
  re: Float64Array,
  im: Float64Array,
  height: number,
  width: number,
  inverse: boolean,
): void {
  const rowRe = new Float64Array(width);
  const rowIm = new Float64Array(width);

  for (let y = 0; y < height; y += 1) {
    const offset = y * width;
    rowRe.set(re.subarray(offset, offset + width));
    rowIm.set(im.subarray(offset, offset + width));
    dft1d(rowRe, rowIm, inverse);
    re.set(rowRe, offset);
    im.set(rowIm, offset);
  }

  const columnRe = new Float64Array(height);
  const columnIm = new Float64Array(height);

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      columnRe[y] = re[y * width + x]!;
      columnIm[y] = im[y * width + x]!;
    }
    dft1d(columnRe, columnIm, inverse);
    for (let y = 0; y < height; y += 1) {
      re[y * width + x] = columnRe[y]!;
      im[y * width + x] = columnIm[y]!;
    }
  }

  if (inverse) {
    const total = height * width;
    for (let i = 0; i < re.length; i += 1) {
      re[i] = re[i]! / total;
      im[i] = im[i]! / total;
    }
  }
}

/**
 * `numpy.fft.fftshift` on a 2-D plane: swap quadrants so the zero frequency is at the centre.
 *
 * The roll is by `floor(n / 2)`, which is numpy's. `ifftshift` rolls by `ceil(n / 2)` — the
 * negative of it — so the two agree only when `n` is even. Legacy calls THIS one twice instead of
 * pairing it with its inverse, so an odd-sized image comes back shifted, and reproducing that is
 * the point of the odd goldens.
 *
 * Getting this backwards is the easy mistake, and it is invisible on every even-sized test: my
 * first version rolled by `ceil`, which is `ifftshift`, and passed all four even cases while
 * failing both odd ones.
 */
export function fftShift2d(
  values: Float64Array,
  height: number,
  width: number,
): Float64Array {
  const out = new Float64Array(values.length);
  const shiftY = Math.floor(height / 2);
  const shiftX = Math.floor(width / 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[((y + shiftY) % height) * width + ((x + shiftX) % width)] = values[y * width + x]!;
    }
  }

  return out;
}
