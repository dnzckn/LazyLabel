/**
 * What legacy's Rescale histogram dialog is given: the level counts of the image region it opens on.
 *
 * The dialog draws a histogram, states the region's pixel count and range, and computes its presets
 * from the region's values (`rescale_histogram_dialog.py:28-83, 110-126, 353-356, 512-564`). Every
 * one of those is a function of how many pixels sit at each level, so that is what this sends: one
 * count per level present, at the image's own depth, and the browser computes the rest exactly as
 * legacy does. Sending the drawn bins instead would lose what Contrast Stretch's percentiles and
 * Equalize's table are computed from.
 *
 * With `clahe`, the counts are of the CLAHE result instead — what the dialog previews in orange
 * when CLAHE is pressed (lines 547-564). CLAHE is spatial, so the browser cannot derive it from
 * counts; this computes it where the pixels are, with the same code the pipeline applies.
 */

import type { WireHistogram } from "@lazylabel/contracts";

import { clahe as claheOf } from "./clahe.js";
import type { SourcePlane } from "./pipeline.js";
import { clampRegion, type Region } from "./processing.js";

export interface ClaheRequest {
  readonly clipLimit: number;
  readonly tiles: number;
}

/**
 * The region `image[y1:y2, x1:x2]` of the first channel, counted by level. The crop is clamped to
 * the image as numpy's slicing clamps it.
 */
export function regionHistogram(
  source: SourcePlane,
  crop: Region | null,
  clahe: ClaheRequest | null = null,
): WireHistogram {
  const [x1, y1, x2, y2] = clampRegion(source, crop);
  const width = x2 - x1;
  const height = y2 - y1;

  let region: Uint8Array | Uint16Array =
    source.plane instanceof Uint16Array ? new Uint16Array(width * height) : new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) region[y * width + x] = source.plane[(y + y1) * source.width + (x + x1)]!;
  }
  if (clahe !== null && width > 0 && height > 0) {
    region = claheOf(region, height, width, { clipLimit: clahe.clipLimit, tilesX: clahe.tiles, tilesY: clahe.tiles });
  }

  const counts = new Uint32Array(source.sourceDepth === 16 ? 65536 : 256);
  for (const value of region) counts[value]! += 1;

  const levels: [number, number][] = [];
  for (let level = 0; level < counts.length; level += 1) {
    if (counts[level]! > 0) levels.push([level, counts[level]!]);
  }

  return {
    depth: source.sourceDepth,
    width,
    height,
    pixels: region.length,
    min: levels[0]?.[0] ?? 0,
    max: levels.at(-1)?.[0] ?? 0,
    levels,
  };
}

/**
 * `clahe=clip:tiles`, the dialog's Clip and Tile boxes: 0.5 to 40, and 2 to 32 tiles a side
 * (`rescale_histogram_dialog.py:428-444`). Out of range is refused, as the processing query's is.
 */
export function claheFromQuery(query: URLSearchParams): ClaheRequest | null {
  const raw = query.get("clahe");
  if (raw === null || raw === "") return null;
  const [clip, tiles, ...rest] = raw.split(":");
  const clipLimit = Number(clip);
  const count = Number(tiles);
  if (rest.length > 0 || !Number.isFinite(clipLimit) || clipLimit < 0.5 || clipLimit > 40) {
    throw new Error("clahe takes a clip limit from 0.5 to 40 and a tile count, clip:tiles");
  }
  if (!Number.isInteger(count) || count < 2 || count > 32) {
    throw new Error("clahe takes a tile count from 2 to 32");
  }
  return { clipLimit, tiles: count };
}
