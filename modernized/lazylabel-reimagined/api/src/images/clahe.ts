/**
 * CLAHE — contrast-limited adaptive histogram equalization, part of RULE-031.
 *
 * Global equalization uses one lookup table for the whole image, so a bright region and a dark one
 * are stretched by the same curve and whichever is smaller loses. CLAHE builds a table PER TILE and
 * blends between them, so local contrast survives — and it clips each tile's histogram first, so a
 * flat region does not have its noise amplified into a texture.
 *
 * MATCHED AGAINST OPENCV, NOT AGAINST A DESCRIPTION. The rule card names the parameters (clip 2.0,
 * 8x8 tiles) and not the algorithm, and three of its steps are choices no description pins down:
 * how the clipped histogram mass is redistributed, how tile tables are interpolated between, and
 * what happens where the grid does not divide the image. `test/fixtures/goldens/legacy-clahe.json`
 * holds the bytes `cv2.createCLAHE` actually produces, and `legacy-rescale-presets.json` what
 * legacy's dialog makes with it.
 *
 * 8-BIT AND 16-BIT, AS OPENCV DOES BOTH. Legacy hands a 16-bit image to `cv2.createCLAHE` as it is
 * (`rescale_histogram_dialog.py:50-73`), and OpenCV equalizes it over 65,536 levels
 * (`CLAHE_Impl::apply`: `histSize = 65536` for `CV_16UC1`). Equalizing its 8-bit conversion
 * instead is a different operation on different numbers, and gives different pixels.
 */

export interface ClaheOptions {
  readonly clipLimit?: number;
  readonly tilesX?: number;
  readonly tilesY?: number;
}

/**
 * Apply CLAHE to a single-channel image, 8-bit or 16-bit, returning the same kind.
 *
 * The image is PADDED when the grid does not divide it, by reflection, exactly as OpenCV does —
 * tiles are then all the same size and the padding is discarded at the end. Uneven tiles would be
 * simpler and would give different numbers at every border.
 */
export function clahe<T extends Uint8Array | Uint16Array>(
  pixels: T,
  height: number,
  width: number,
  options: ClaheOptions = {},
): T {
  const histogramSize = pixels instanceof Uint16Array ? 65536 : 256;
  const tilesX = Math.max(1, Math.trunc(options.tilesX ?? 8));
  const tilesY = Math.max(1, Math.trunc(options.tilesY ?? 8));
  const clipLimit = options.clipLimit ?? 2;

  const padded = padToGrid(pixels, height, width, tilesX, tilesY);
  const tileWidth = padded.width / tilesX;
  const tileHeight = padded.height / tilesY;

  const luts = buildLuts(padded, tilesX, tilesY, tileWidth, tileHeight, clipLimit, histogramSize);
  const interpolated = interpolate(padded, tilesX, tilesY, tileWidth, tileHeight, luts, histogramSize - 1);

  // Back to the original size, dropping the reflected border.
  const out = (pixels instanceof Uint16Array ? new Uint16Array(height * width) : new Uint8Array(height * width)) as T;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) out[y * width + x] = interpolated[y * padded.width + x]!;
  }
  return out;
}

interface Padded {
  readonly data: Uint8Array | Uint16Array;
  readonly height: number;
  readonly width: number;
}

/**
 * `copyMakeBorder(..., BORDER_REFLECT_101)`: the edge pixel itself is not repeated.
 *
 * OpenCV pads only when the grid fails to divide the image in EITHER direction, and then pads BOTH
 * by `tiles - size % tiles` -- so a direction the grid does divide gets a whole extra tile's worth
 * (`CLAHE_Impl::apply`). A 24x20 image under an 8x8 grid is padded to 32x24, not 24x24, and its
 * tiles are 4 wide rather than 3. Padding only the direction that needs it gives different tiles
 * and different pixels everywhere.
 */
function padToGrid(
  pixels: Uint8Array | Uint16Array,
  height: number,
  width: number,
  tilesX: number,
  tilesY: number,
): Padded {
  if (width % tilesX === 0 && height % tilesY === 0) return { data: pixels, height, width };
  const extraX = tilesX - (width % tilesX);
  const extraY = tilesY - (height % tilesY);

  const newWidth = width + extraX;
  const newHeight = height + extraY;
  const data = pixels instanceof Uint16Array ? new Uint16Array(newWidth * newHeight) : new Uint8Array(newWidth * newHeight);

  const reflect = (value: number, limit: number): number => {
    if (limit === 1) return 0;
    // 101 reflection: ...c b | a b c d | c b...
    let v = value;
    while (v >= limit) v = 2 * (limit - 1) - v;
    return v;
  };

  for (let y = 0; y < newHeight; y += 1) {
    for (let x = 0; x < newWidth; x += 1) {
      data[y * newWidth + x] = pixels[reflect(y, height) * width + reflect(x, width)]!;
    }
  }

  return { data, height: newHeight, width: newWidth };
}

/**
 * One lookup table per tile (`CLAHE_CalcLut_Body`).
 *
 * The clip limit is `max(1, clipLimit x tileArea / levels)`, so it scales with the tile rather than
 * being an absolute count — a limit of 2 means "no level may hold more than twice its share".
 * Everything above it is cut and REDISTRIBUTED evenly, with the remainder spread at a stride, which
 * is OpenCV's choice and not a rounding detail: dropping the clipped mass instead would darken
 * every tile with a peak in it.
 *
 * The table's scale is a FLOAT, `(levels - 1) / tileArea`, and each entry is `sum * scale` in
 * single precision before it is rounded, as OpenCV computes them.
 */
function buildLuts(
  padded: Padded,
  tilesX: number,
  tilesY: number,
  tileWidth: number,
  tileHeight: number,
  clipLimit: number,
  histogramSize: number,
): (Uint8Array | Uint16Array)[] {
  const tileArea = tileWidth * tileHeight;
  const lutScale = Math.fround((histogramSize - 1) / tileArea);
  const limit =
    clipLimit > 0
      ? Math.max(1, Math.trunc((clipLimit * tileArea) / histogramSize))
      : 0;
  const top = histogramSize - 1;

  const luts: (Uint8Array | Uint16Array)[] = [];
  const histogram = new Int32Array(histogramSize);

  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      histogram.fill(0);

      for (let y = 0; y < tileHeight; y += 1) {
        const row = (ty * tileHeight + y) * padded.width + tx * tileWidth;
        for (let x = 0; x < tileWidth; x += 1) histogram[padded.data[row + x]!]! += 1;
      }

      if (limit > 0) {
        let clipped = 0;
        for (let i = 0; i < histogramSize; i += 1) {
          if (histogram[i]! > limit) {
            clipped += histogram[i]! - limit;
            histogram[i] = limit;
          }
        }

        const batch = Math.trunc(clipped / histogramSize);
        let residual = clipped - batch * histogramSize;
        for (let i = 0; i < histogramSize; i += 1) histogram[i]! += batch;

        if (residual > 0) {
          const step = Math.max(Math.trunc(histogramSize / residual), 1);
          for (let i = 0; i < histogramSize && residual > 0; i += step, residual -= 1) {
            histogram[i]! += 1;
          }
        }
      }

      const lut = histogramSize === 256 ? new Uint8Array(histogramSize) : new Uint16Array(histogramSize);
      let sum = 0;
      for (let i = 0; i < histogramSize; i += 1) {
        sum += histogram[i]!;
        lut[i] = Math.min(top, Math.max(0, roundHalfToEven(Math.fround(sum * lutScale))));
      }

      luts.push(lut);
    }
  }

  return luts;
}

/**
 * Blend the four surrounding tile tables bilinearly.
 *
 * The `- 0.5` puts a tile's table at its CENTRE rather than its corner, which is what stops a
 * visible seam at every tile boundary. Pixels in the outer half-tile have no neighbour on one
 * side, and the index clamp is what handles them: they use the edge tile's table alone.
 */
function interpolate(
  padded: Padded,
  tilesX: number,
  tilesY: number,
  tileWidth: number,
  tileHeight: number,
  luts: readonly (Uint8Array | Uint16Array)[],
  top: number,
): Uint8Array | Uint16Array {
  const out = padded.data instanceof Uint16Array ? new Uint16Array(padded.data.length) : new Uint8Array(padded.data.length);

  /*
   * EVERY STEP IS SINGLE PRECISION, because OpenCV's is: `float res = ...` in
   * `CLAHE_Interpolation_Body::operator()`, with float weights throughout. JavaScript has only
   * doubles, so each operation is rounded back to float with `Math.fround`. That is not pedantry
   * -- a double-precision version of the identical formula lands on the other side of a rounding
   * tie often enough to differ on a handful of pixels, which is exactly the residue this port had.
   *
   * The reciprocal is also OpenCV's: it computes `1.0f / tileWidth` ONCE and multiplies, where the
   * obvious port divides. `x * (1/w)` and `x / w` are different numbers in floating point.
   */
  const invTileWidth = Math.fround(1 / tileWidth);
  const invTileHeight = Math.fround(1 / tileHeight);

  for (let y = 0; y < padded.height; y += 1) {
    const yf = Math.fround(Math.fround(y * invTileHeight) - 0.5);
    const y1raw = Math.floor(yf);
    // The weight comes from the UNCLAMPED index, and the index is clamped afterwards. Clamping
    // first would make the half-tile border weights 0 or 1 instead of what OpenCV uses there.
    const ya = Math.fround(yf - y1raw);
    const ya1 = Math.fround(1 - ya);
    const y1 = Math.min(Math.max(y1raw, 0), tilesY - 1);
    const y2 = Math.min(Math.max(y1raw + 1, 0), tilesY - 1);

    for (let x = 0; x < padded.width; x += 1) {
      const xf = Math.fround(Math.fround(x * invTileWidth) - 0.5);
      const x1raw = Math.floor(xf);
      const xa = Math.fround(xf - x1raw);
      const xa1 = Math.fround(1 - xa);
      const x1 = Math.min(Math.max(x1raw, 0), tilesX - 1);
      const x2 = Math.min(Math.max(x1raw + 1, 0), tilesX - 1);

      const value = padded.data[y * padded.width + x]!;

      const topLeft = luts[y1 * tilesX + x1]![value]!;
      const topRight = luts[y1 * tilesX + x2]![value]!;
      const bottomLeft = luts[y2 * tilesX + x1]![value]!;
      const bottomRight = luts[y2 * tilesX + x2]![value]!;

      // Grouped X FIRST, then Y, which is OpenCV's order. Summing the four weighted corners
      // instead is algebraically identical and rounds differently, which shows up as a handful of
      // pixels off by one on the uneven-tile golden.
      const upper = Math.fround(Math.fround(topLeft * xa1) + Math.fround(topRight * xa));
      const lower = Math.fround(Math.fround(bottomLeft * xa1) + Math.fround(bottomRight * xa));
      const blended = Math.fround(Math.fround(upper * ya1) + Math.fround(lower * ya));

      // `saturate_cast` is cvRound then clamp, and cvRound is round-half-to-EVEN.
      out[y * padded.width + x] = Math.min(top, Math.max(0, roundHalfToEven(blended)));
    }
  }

  return out;
}

/**
 * `cvRound`, which is what `saturate_cast` uses: round to nearest, TIES TO EVEN.
 *
 * `Math.round` breaks ties upward instead, and the difference is invisible until it is not: four
 * of the six golden cases matched with `Math.round` and two differed by exactly one on a hundred
 * pixels. Ties are common here because both call sites land on exact halves whenever a histogram
 * sum or a bilinear blend divides evenly.
 */
function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;

  if (fraction > 0.5) return floor + 1;
  if (fraction < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}
