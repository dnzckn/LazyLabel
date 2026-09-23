/**
 * Which tiles a view of the image needs, and where each one lands — C8's browser half.
 *
 * The API serves the image as a pyramid of 512-pixel tiles (`/images/{key}/tiles/{z}/{x}/{y}`,
 * geometry in `@lazylabel/contracts`). This decides what to ask for: the level whose pixels are
 * just fine enough for how large the image is drawn, and only the tiles of it that are in view,
 * plus a one-tile margin so a small scroll does not open onto a blank edge.
 *
 * PURE, like `segmentPixels`: jsdom has no canvas, so the arithmetic is held here, where a test can
 * reach it, and `AnnotationCanvas` is left with nothing but the painting.
 */

import { TILE_SIZE, levelCount, levelFor, tileGrid } from "@lazylabel/contracts";

/** A rectangle in IMAGE pixels, right and bottom exclusive. */
export interface ViewRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface TileKey {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** A screen rectangle, as `getBoundingClientRect` gives one. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The part of the image a pane shows, in image pixels, or null when none of it is on screen.
 *
 * `drawn` is where the image is drawn on screen; `pane` is the scrolling box it sits in. The
 * intersection, scaled by how many image pixels each screen pixel covers, is what is visible.
 */
export function visibleRegion(
  drawn: ScreenRect,
  pane: ScreenRect,
  width: number,
  height: number,
): ViewRect | null {
  if (drawn.width <= 0 || drawn.height <= 0) return null;
  const left = Math.max(drawn.left, pane.left);
  const top = Math.max(drawn.top, pane.top);
  const right = Math.min(drawn.right, pane.right);
  const bottom = Math.min(drawn.bottom, pane.bottom);
  if (right <= left || bottom <= top) return null;

  const scaleX = width / drawn.width;
  const scaleY = height / drawn.height;
  return {
    left: Math.max(0, (left - drawn.left) * scaleX),
    top: Math.max(0, (top - drawn.top) * scaleY),
    right: Math.min(width, (right - drawn.left) * scaleX),
    bottom: Math.min(height, (bottom - drawn.top) * scaleY),
  };
}

/** The coarsest level: one tile holding the whole image, which is what a view shows first. */
export function topLevel(width: number, height: number): number {
  return levelCount(width, height) - 1;
}

/**
 * The tiles of the right level for a view, nearest the view's centre first.
 *
 * `devicePixelsPerImagePixel` is how large the image is drawn -- CSS width over image width, times
 * the screen's device pixel ratio -- and picks the level (`levelFor`). Centre-first because that is
 * where a user is looking, and a view of thirty tiles arrives over several frames.
 */
export function tilesInView(
  width: number,
  height: number,
  view: ViewRect,
  devicePixelsPerImagePixel: number,
  margin = 1,
): readonly TileKey[] {
  const z = levelFor(width, height, devicePixelsPerImagePixel);
  const span = TILE_SIZE * 2 ** z; // image pixels one tile covers at level z
  const { columns, rows } = tileGrid(width, height, z);

  const x0 = Math.max(0, Math.floor(view.left / span) - margin);
  const y0 = Math.max(0, Math.floor(view.top / span) - margin);
  const x1 = Math.min(columns - 1, Math.ceil(view.right / span) - 1 + margin);
  const y1 = Math.min(rows - 1, Math.ceil(view.bottom / span) - 1 + margin);

  const centreX = (view.left + view.right) / 2;
  const centreY = (view.top + view.bottom) / 2;
  const keys: { key: TileKey; distance: number }[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x + 0.5) * span - centreX;
      const dy = (y + 0.5) * span - centreY;
      keys.push({ key: { z, x, y }, distance: dx * dx + dy * dy });
    }
  }
  return keys.sort((a, b) => a.distance - b.distance).map(({ key }) => key);
}

/**
 * Where a tile lands on the image, in image pixels.
 *
 * `tileWidth` and `tileHeight` are the tile's own size in level pixels -- smaller than a full tile
 * along the right and bottom edges. Each level pixel covers 2^z image pixels, except the last one
 * at a ragged edge, which covers fewer; drawing it full size puts the excess past the edge of the
 * canvas, which clips it, so nothing inside the image is stretched.
 */
export function tileRect(
  key: TileKey,
  tileWidth: number,
  tileHeight: number,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const scale = 2 ** key.z;
  return {
    x: key.x * TILE_SIZE * scale,
    y: key.y * TILE_SIZE * scale,
    width: tileWidth * scale,
    height: tileHeight * scale,
  };
}

export function tileId(key: TileKey): string {
  return `${key.z}/${key.x}/${key.y}`;
}
