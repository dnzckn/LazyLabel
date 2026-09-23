/**
 * The tile pyramid both sides agree on — the spec's `/images/{imagePath}/tiles/{z}/{x}/{y}`.
 *
 * Level 0 is the image's own pixels. Each level above halves both sides, rounding UP, so a ragged
 * edge keeps its last half-pixel instead of losing it, and the levels stop at the first one that
 * fits in a single tile. A tile is `TILE_SIZE` square except along the right and bottom edges,
 * where it is whatever is left.
 *
 * SHARED, like the mask codec, because the browser must ask for exactly the tiles the server has.
 * The two sides counting levels differently is a request for a tile that does not exist, answered
 * 404, and a hole in the picture that nothing reports.
 *
 * WHY TILES AT ALL. Measured 2026-09-23 on a noisy 50-megapixel 16-bit TIFF, the spec's supported
 * working size, sent whole as one PNG: 41 MB, 2.4 s from click to pixels cold, and a 0.5 s
 * main-thread stall while the browser decodes it; over a 100 Mbit/s link the transfer alone is
 * about 3.3 s. Fitted to a pane, that image needs one level of the pyramid and a handful of tiles.
 * Zoomed in, it needs only the tiles in view.
 */

/** Tile side in pixels. 512 rather than a map's 256: a picture is looked at whole far more often. */
export const TILE_SIZE = 512;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The size of level `z`.
 *
 * `ceil(side / 2^z)` is the same as halving `z` times with a ceiling each time -- a property of
 * ceiling division -- so the server, which halves level by level, and the browser, which asks
 * directly, cannot disagree about any level's size.
 */
export function levelSize(width: number, height: number, z: number): Size {
  const scale = 2 ** z;
  return { width: Math.ceil(width / scale), height: Math.ceil(height / scale) };
}

/** How many levels there are: 0, up to and including the first that fits in one tile. */
export function levelCount(width: number, height: number): number {
  for (let z = 0; ; z += 1) {
    const size = levelSize(width, height, z);
    if (size.width <= TILE_SIZE && size.height <= TILE_SIZE) return z + 1;
  }
}

/** Columns and rows of tiles at level `z`. */
export function tileGrid(width: number, height: number, z: number): { readonly columns: number; readonly rows: number } {
  const size = levelSize(width, height, z);
  return { columns: Math.ceil(size.width / TILE_SIZE), rows: Math.ceil(size.height / TILE_SIZE) };
}

/**
 * The coarsest level that still gives every device pixel at least one pixel of its own.
 *
 * `devicePixelsPerImagePixel` is how the image is being drawn: 0.25 when a 4000-pixel-wide image
 * fills a 1000-device-pixel pane. A level whose pixels each cover 2^z image pixels is enough while
 * 2^z <= 1 / that, so zooming out asks for coarser tiles and zooming in never asks for more detail
 * than the image has.
 */
export function levelFor(width: number, height: number, devicePixelsPerImagePixel: number): number {
  const top = levelCount(width, height) - 1;
  if (!(devicePixelsPerImagePixel > 0)) return top;
  const z = Math.floor(Math.log2(1 / devicePixelsPerImagePixel));
  return Math.max(0, Math.min(top, z));
}
