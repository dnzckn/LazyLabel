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

/** A channel a threshold can be set on. `gray` exists only for a grayscale source. */
export type Channel = "gray" | "r" | "g" | "b";

/** Legacy's names for the channel bars (`channel_threshold_widget.py:438-445`). */
export const CHANNEL_NAMES = {
  gray: "Gray",
  r: "Red",
  g: "Green",
  b: "Blue",
} as const satisfies Record<Channel, string>;

/**
 * RULE-031's histogram presets — the three ways to set the rescale other than by hand.
 *
 * Mutually exclusive with `rescale`, which is the rule's own edge case: "dragging the rescale
 * handles clears any preset". `setPreset` and `setRescale` each clear the other rather than
 * letting both be set, so the API never has to decide which the user meant.
 */
export type Preset =
  | { readonly kind: "stretch"; readonly saturation: number }
  | { readonly kind: "equalize" }
  | { readonly kind: "clahe"; readonly clipLimit: number; readonly tilesX: number; readonly tilesY: number };

export const PRESET_DEFAULTS = {
  stretch: { kind: "stretch", saturation: 0.4 },
  equalize: { kind: "equalize" },
  clahe: { kind: "clahe", clipLimit: 2, tilesX: 8, tilesY: 8 },
} as const satisfies Record<string, Preset>;

export interface ImageProcessing {
  /** A histogram preset, or null. Grayscale only, like the rescale it replaces. */
  readonly preset: Preset | null;
  /** Null for none. The server ignores it on a colour image, as RULE-032 says to. */
  readonly rescale: { readonly min: number; readonly max: number } | null;
  /**
   * Each channel's threshold markers, in the bar's LIST order (the query sorts them).
   *
   * Only a ticked channel has any: unticking one clears its markers, as legacy's does
   * (`channel_threshold_widget.py:351-357`), so every list here is one the server should apply.
   */
  readonly markers: Readonly<Partial<Record<Channel, readonly number[]>>>;
  /**
   * Which channels' checkboxes are ticked. A ticked channel with no markers changes no pixels, so
   * this never reaches the query; it is here because it belongs to the image, like the markers,
   * and goes when the image does.
   */
  readonly enabled?: Readonly<Partial<Record<Channel, boolean>>>;
  readonly crop: Crop | null;
  /** RULE-030's radial cutoffs, 0..10000. Empty for no frequency filtering. */
  readonly frequencies: readonly number[];
  /** RULE-030's posterization of the filtered result, 0..255. */
  readonly intensities: readonly number[];
}

export const NO_PROCESSING: ImageProcessing = {
  preset: null,
  rescale: null,
  markers: {},
  enabled: {},
  crop: null,
  frequencies: [],
  intensities: [],
};

/** The frequency slider's range: 0.01% steps of the half-diagonal (RULE-030). */
export const FREQUENCY_SLIDER_MAX = 10_000;

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
  const text = processingParams(processing);
  return text === "" ? "" : `?${text}`;
}

/**
 * The same parameters without the "?", as Operate On View sends them in an embed request's body
 * (RULE-089). One builder for both, so the model is asked for exactly the view the pixels show.
 */
export function processingParams(processing: ImageProcessing): string {
  const query = new URLSearchParams();

  // A preset and a manual window are exclusive, and the API refuses a request carrying both --
  // deliberately, because a client sending both has lost track of which the user chose. Sending
  // the preset alone when it is set keeps that refusal unreachable from here.
  const preset = processing.preset;
  if (preset !== null) {
    query.set(
      "preset",
      preset.kind === "equalize"
        ? "equalize"
        : preset.kind === "stretch"
          ? `stretch:${preset.saturation}`
          : `clahe:${preset.clipLimit}:${preset.tilesX}:${preset.tilesY}`,
    );
  } else if (processing.rescale !== null && processing.rescale.max > processing.rescale.min) {
    query.set("rescaleMin", String(processing.rescale.min));
    query.set("rescaleMax", String(processing.rescale.max));
  }

  for (const channel of ["gray", "r", "g", "b"] as const) {
    const markers = processing.markers[channel];
    if (markers !== undefined && markers.length > 0) {
      query.set(`markers_${channel}`, [...markers].sort((a, b) => a - b).join(","));
    }
  }

  if (processing.frequencies.length > 0) {
    query.set("frequencies", [...processing.frequencies].sort((a, b) => a - b).join(","));
  }
  // Sent even with no cutoffs, because RULE-030 treats intensity thresholding as part of the same
  // step: with no cutoffs it is a plain contrast stretch followed by posterization, which is a
  // real thing to ask for and not a no-op.
  if (processing.intensities.length > 0) {
    query.set("intensities", [...processing.intensities].sort((a, b) => a - b).join(","));
  }

  // Sent only when something else is: a crop with no processing to restrict would make the URL
  // differ for no change in the pixels, and the crop's real effect is on the SAVE, not the view.
  const crop = processing.crop;
  if ([...query.keys()].length > 0 && crop !== null) {
    query.set("crop", `${crop.x1},${crop.y1},${crop.x2},${crop.y2}`);
  }

  return query.toString();
}
