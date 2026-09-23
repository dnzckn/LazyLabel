/**
 * Tiles: the image a piece at a time, at the size it is drawn — C8's last missing part.
 *
 * The geometry is `@lazylabel/contracts`' (`levelCount`, `levelSize`, `TILE_SIZE`), so the browser
 * asks for exactly the tiles built here. This is the pixels: the pyramid, how a level is made from
 * the one below it, and a cache that keeps one decode serving every tile of a view.
 *
 * A LEVEL IS THE ONE BELOW IT, AVERAGED IN 2x2 BLOCKS -- fewer at a ragged edge -- with integer
 * rounding. Not sharp's resize: its kernels are tuned for looks and have changed between releases,
 * and a tile should be the same bytes on every machine, so that a test can predict it and a change
 * shows up as a failure rather than as a picture that is subtly softer than last month.
 *
 * ONE DECODE PER VIEW. Showing a view is dozens of tile requests arriving together, and decoding a
 * 50-megapixel TIFF dozens of times is the one outcome worse than not tiling. So the pyramid is built
 * once per (image, revision, processing) -- concurrent requests wait for the same build -- and kept,
 * a few views at a time, by size.
 */

import { TILE_SIZE, levelCount } from "@lazylabel/contracts";

/** One level of the pyramid: RGB, row-major, as `decodeImage` produces level 0. */
export interface Level {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** The next level up: both sides halved rounding up, each pixel the rounded mean of its block. */
export function halve(level: Level): Level {
  const width = Math.ceil(level.width / 2);
  const height = Math.ceil(level.height / 2);
  const data = new Uint8Array(width * height * 3);
  const source = level.data;
  const stride = level.width * 3;

  for (let y = 0; y < height; y += 1) {
    const top = 2 * y;
    const rows = top + 1 < level.height ? 2 : 1;
    for (let x = 0; x < width; x += 1) {
      const left = 2 * x;
      const columns = left + 1 < level.width ? 2 : 1;
      const count = rows * columns;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let dy = 0; dy < rows; dy += 1) {
          const row = (top + dy) * stride + channel;
          for (let dx = 0; dx < columns; dx += 1) sum += source[row + (left + dx) * 3]!;
        }
        // Rounded half up, in integers: the same answer on every machine.
        data[(y * width + x) * 3 + channel] = Math.floor((2 * sum + count) / (2 * count));
      }
    }
  }
  return { width, height, data };
}

/** Every level, 0 first, up to and including the first that fits in one tile. */
export function pyramidOf(image: Level): readonly Level[] {
  const levels: Level[] = [{ width: image.width, height: image.height, data: image.data }];
  const count = levelCount(image.width, image.height);
  while (levels.length < count) levels.push(halve(levels[levels.length - 1]!));
  return levels;
}

/** Tile (x, y) of a level, or null when the level has no such tile. */
export function tileOf(level: Level, x: number, y: number): Level | null {
  const left = x * TILE_SIZE;
  const top = y * TILE_SIZE;
  if (left >= level.width || top >= level.height) return null;

  const width = Math.min(TILE_SIZE, level.width - left);
  const height = Math.min(TILE_SIZE, level.height - top);
  const data = new Uint8Array(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    const from = ((top + row) * level.width + left) * 3;
    data.set(level.data.subarray(from, from + width * 3), row * width * 3);
  }
  return { width, height, data };
}

/**
 * Pyramids by view, the most recently used kept, up to a byte budget.
 *
 * 512 MB holds two 50-megapixel views with room to spare (level 0 is 150 MB of RGB and the levels
 * above add a third), which is what a user flicking between two images needs. A view bigger than
 * the whole budget is still built and served; it simply is not kept.
 */
export class PyramidCache {
  private readonly built = new Map<string, readonly Level[]>();
  private readonly building = new Map<string, Promise<readonly Level[]>>();

  constructor(private readonly budget = 512 * 1024 * 1024) {}

  async get(key: string, build: () => Promise<Level>): Promise<readonly Level[]> {
    const ready = this.built.get(key);
    if (ready !== undefined) {
      // Most recently used moves to the back, so eviction takes from the front.
      this.built.delete(key);
      this.built.set(key, ready);
      return ready;
    }

    const pending = this.building.get(key);
    if (pending !== undefined) return pending;

    const made = (async () => pyramidOf(await build()))();
    this.building.set(key, made);
    try {
      const levels = await made;
      this.keep(key, levels);
      return levels;
    } finally {
      this.building.delete(key);
    }
  }

  /** How many views are held; for tests. */
  get size(): number {
    return this.built.size;
  }

  private keep(key: string, levels: readonly Level[]): void {
    const bytes = sizeOf(levels);
    if (bytes > this.budget) return;
    this.built.set(key, levels);
    let total = 0;
    for (const held of this.built.values()) total += sizeOf(held);
    for (const [oldest, held] of this.built) {
      if (total <= this.budget) break;
      this.built.delete(oldest);
      total -= sizeOf(held);
    }
  }
}

function sizeOf(levels: readonly Level[]): number {
  return levels.reduce((sum, level) => sum + level.data.byteLength, 0);
}
