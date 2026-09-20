/**
 * What the browser asks the server to do to an image before sending it.
 *
 * THE RULES THEMSELVES ARE NOT HERE, AND THAT IS THE POINT. RULE-032 fixes the order as rescale,
 * then channel threshold, then FFT, then 16-bit to 8-bit, then the display adjustments — and the
 * browser only ever receives the output of the fourth step. A rescale applied here would quantise
 * a 16-bit image to 256 levels and then stretch those, which is not the rule and is worst on
 * exactly the images a rescale exists for. So the first three run in the API, against the source
 * samples, and this file only says what to ask for.
 *
 * The display adjustments stay in the browser (`tools/adjustments.ts`) because they are the last
 * step and apply to the rendered canvas.
 */

import type { Crop } from "../tools/crop.js";

/**
 * 8-bit and 16-bit maxima, which is what the sliders' ranges are built from.
 *
 * Stated here as well as in the API's arithmetic, and that is not duplication worth removing: 255
 * and 65535 are what those bit depths ARE, not a decision either side could make differently.
 */
export const MAX_8_BIT = 255;
export const MAX_16_BIT = 65535;

/** `channel_threshold_widget.py`: markers closer together than this are not allowed. */
export const MIN_MARKER_SPACING = 10;

/**
 * Whether a set of markers is legal.
 *
 * A WIDGET rule, not an arithmetic one, which is why it lives on this side: the server posterizes
 * whatever markers it is given, and legacy's limit exists to stop a user making bands they cannot
 * see or aim at. Stated in ABSOLUTE units, so on a 16-bit image ten levels is a two-thousandth of
 * the range and effectively no constraint at all — the rule card notes this, and it is worth
 * knowing before someone treats the limit as meaningful there.
 */
export function markersAreLegal(markers: readonly number[]): boolean {
  const sorted = [...markers].sort((a, b) => a - b);
  return sorted.every(
    (marker, index) => index === 0 || marker - sorted[index - 1]! >= MIN_MARKER_SPACING,
  );
}

/** A channel a threshold can be set on. `gray` exists only for a grayscale source. */
export type Channel = "gray" | "r" | "g" | "b";

export interface ImageProcessing {
  /** Null for none. The server ignores it on a colour image, as RULE-032 says to. */
  readonly rescale: { readonly min: number; readonly max: number } | null;
  readonly markers: Readonly<Partial<Record<Channel, readonly number[]>>>;
  readonly crop: Crop | null;
}

export const NO_PROCESSING: ImageProcessing = { rescale: null, markers: {}, crop: null };

/** Which channels a source offers: one Gray for a grayscale image, three for colour (RULE-029). */
export function channelsFor(sourceChannels: number): readonly Channel[] {
  return sourceChannels === 1 ? ["gray"] : ["r", "g", "b"];
}

/** Whether rescale applies at all. RULE-032: grayscale only. */
export function rescaleApplies(sourceChannels: number): boolean {
  return sourceChannels === 1;
}

/**
 * The query string for a processing request, or "" when there is nothing to ask for.
 *
 * Empty rather than a string of nulls, so the URL of an unprocessed image is the same string it
 * has always been — which is what keeps the browser's own image cache working for the common case.
 */
export function processingQuery(processing: ImageProcessing): string {
  const query = new URLSearchParams();

  if (processing.rescale !== null && processing.rescale.max > processing.rescale.min) {
    query.set("rescaleMin", String(processing.rescale.min));
    query.set("rescaleMax", String(processing.rescale.max));
  }

  for (const channel of ["gray", "r", "g", "b"] as const) {
    const markers = processing.markers[channel];
    if (markers !== undefined && markers.length > 0) {
      query.set(`markers_${channel}`, [...markers].sort((a, b) => a - b).join(","));
    }
  }

  // Sent only when something else is: a crop with no processing to restrict would make the URL
  // differ for no change in the pixels, and the crop's real effect is on the SAVE, not the view.
  const crop = processing.crop;
  if ([...query.keys()].length > 0 && crop !== null) {
    query.set("crop", `${crop.x1},${crop.y1},${crop.x2},${crop.y2}`);
  }

  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}
