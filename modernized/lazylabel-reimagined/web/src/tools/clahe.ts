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
 * what happens where the grid does not divide the image. `test/fixtures/legacy-clahe.json` holds
 * the bytes `cv2.createCLAHE` actually produces.
 */

const HISTOGRAM_SIZE = 256;

export interface ClaheOptions {
  readonly clipLimit?: number;
  readonly tilesX?: number;
  readonly tilesY?: number;
}

/**
 * Apply CLAHE to an 8-bit single-channel image.
 *
 * The image is PADDED when the grid does not divide it, by reflection, exactly as OpenCV does —
 * tiles are then all the same size and the padding is discarded at the end. Uneven tiles would be
 * simpler and would give different numbers at every border.
 */
export function clahe(
  pixels: Uint8Array,
  height: number,
  width: number,
  options: ClaheOptions = {},
): Uint8Array {
  const tilesX = Math.max(1, Math.trunc(options.tilesX ?? 8));
  const tilesY = Math.max(1, Math.trunc(options.tilesY ?? 8));
  const clipLimit = options.clipLimit ?? 2;

  const padded = padToGrid(pixels, height, width, tilesX, tilesY);
  const tileWidth = padded.width / tilesX;
  const tileHeight = padded.height / tilesY;

  const luts = buildLuts(padded, tilesX, tilesY, tileWidth, tileHeight, clipLimit);
  const interpolated = interpolate(padded, tilesX, tilesY, tileWidth, tileHeight, luts);

  // Back to the original size, dropping the reflected border.
  const out = new Uint8Array(height * width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) out[y * width + x] = interpolated[y * padded.width + x]!;
  }
  return out;
}

interface Padded {
  readonly data: Uint8Array;
  readonly height: number;
  readonly width: number;
}

/** `copyMakeBorder(..., BORDER_REFLECT_101)`: the edge pixel itself is not repeated. */
function padToGrid(
  pixels: Uint8Array,
  height: number,
  width: number,
  tilesX: number,
  tilesY: number,
): Padded {
  const extraX = width % tilesX === 0 ? 0 : tilesX - (width % tilesX);
  const extraY = height % tilesY === 0 ? 0 : tilesY - (height % tilesY);
  if (extraX === 0 && extraY === 0) return { data: pixels, height, width };

  const newWidth = width + extraX;
  const newHeight = height + extraY;
  const data = new Uint8Array(newWidth * newHeight);

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
 * One lookup table per tile.
 *
 * The clip limit is `max(1, clipLimit x tileArea / 256)`, so it scales with the tile rather than
 * being an absolute count — a limit of 2 means "no level may hold more than twice its share".
 * Everything above it is cut and REDISTRIBUTED evenly, with the remainder spread at a stride, which
 * is OpenCV's choice and not a rounding detail: dropping the clipped mass instead would darken
 * every tile with a peak in it.
 */
function buildLuts(
  padded: Padded,
  tilesX: number,
  tilesY: number,
  tileWidth: number,
  tileHeight: number,
  clipLimit: number,
): Uint8Array[] {
  const tileArea = tileWidth * tileHeight;
  const lutScale = (HISTOGRAM_SIZE - 1) / tileArea;
  const limit =
    clipLimit > 0
      ? Math.max(1, Math.trunc((clipLimit * tileArea) / HISTOGRAM_SIZE))
      : 0;

  const luts: Uint8Array[] = [];

  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const histogram = new Int32Array(HISTOGRAM_SIZE);

      for (let y = 0; y < tileHeight; y += 1) {
        const row = (ty * tileHeight + y) * padded.width + tx * tileWidth;
        for (let x = 0; x < tileWidth; x += 1) histogram[padded.data[row + x]!]! += 1;
      }

      if (limit > 0) {
        let clipped = 0;
        for (let i = 0; i < HISTOGRAM_SIZE; i += 1) {
          if (histogram[i]! > limit) {
            clipped += histogram[i]! - limit;
            histogram[i] = limit;
          }
        }

        const batch = Math.trunc(clipped / HISTOGRAM_SIZE);
        let residual = clipped - batch * HISTOGRAM_SIZE;
        for (let i = 0; i < HISTOGRAM_SIZE; i += 1) histogram[i]! += batch;

        if (residual > 0) {
          const step = Math.max(Math.trunc(HISTOGRAM_SIZE / residual), 1);
          for (let i = 0; i < HISTOGRAM_SIZE && residual > 0; i += step, residual -= 1) {
            histogram[i]! += 1;
          }
        }
      }

      const lut = new Uint8Array(HISTOGRAM_SIZE);
      let sum = 0;
      for (let i = 0; i < HISTOGRAM_SIZE; i += 1) {
        sum += histogram[i]!;
        lut[i] = Math.min(255, Math.max(0, roundHalfToEven(sum * lutScale)));
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
  luts: readonly Uint8Array[],
): Uint8Array {
  const out = new Uint8Array(padded.data.length);

  for (let y = 0; y < padded.height; y += 1) {
    const yf = y / tileHeight - 0.5;
    const y1raw = Math.floor(yf);
    const ya = yf - y1raw;
    const y1 = Math.min(Math.max(y1raw, 0), tilesY - 1);
    const y2 = Math.min(y1raw + 1, tilesY - 1);

    for (let x = 0; x < padded.width; x += 1) {
      const xf = x / tileWidth - 0.5;
      const x1raw = Math.floor(xf);
      const xa = xf - x1raw;
      const x1 = Math.min(Math.max(x1raw, 0), tilesX - 1);
      const x2 = Math.min(x1raw + 1, tilesX - 1);

      const value = padded.data[y * padded.width + x]!;

      const topLeft = luts[y1 * tilesX + x1]![value]!;
      const topRight = luts[y1 * tilesX + x2]![value]!;
      const bottomLeft = luts[y2 * tilesX + x1]![value]!;
      const bottomRight = luts[y2 * tilesX + x2]![value]!;

      // Grouped X FIRST, then Y, which is OpenCV's order. Summing the four weighted corners
      // instead is algebraically identical and rounds differently, which shows up as a handful of
      // pixels off by one on the uneven-tile golden.
      const top = topLeft * (1 - xa) + topRight * xa;
      const bottom = bottomLeft * (1 - xa) + bottomRight * xa;
      const blended = top * (1 - ya) + bottom * ya;

      out[y * padded.width + x] = Math.min(255, Math.max(0, roundHalfToEven(blended)));
    }
  }

  return out;
}

/**
 * `cvRound`, which is what `saturate_cast<uchar>` uses: round to nearest, TIES TO EVEN.
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
