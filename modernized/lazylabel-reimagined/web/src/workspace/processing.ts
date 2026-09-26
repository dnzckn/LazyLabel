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
 * What the Rescale histogram dialog's Apply leaves after Equalize or CLAHE — legacy's preset
 * (`rescale_histogram_dialog.py:530-581`; `main_window.py:2809-2825`). Its Contrast Stretch leaves
 * a `rescale` window instead, as legacy's hands its lines to the slider.
 *
 * A preset REPLACES the window while it is set (`rescale_widget.py:368-370`), and the window is
 * kept under it, as legacy's slider keeps its handles: moving one clears the preset and applies
 * the window from there (lines 305-314). The query sends the preset alone while one is set.
 *
 * `source` is the region Equalize's table was built from, the crop at Apply or the whole image:
 * legacy builds it once and keeps it when a crop is drawn afterwards (main_window.py:2837-2845).
 * A crop drawn after CLAHE drops the preset instead (the same lines), which the workspace does.
 */
export type Preset =
  | { readonly kind: "equalize"; readonly source: readonly [number, number, number, number] }
  | { readonly kind: "clahe"; readonly clipLimit: number; readonly tilesX: number; readonly tilesY: number };

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
  /**
   * Legacy's "Enable FFT Frequency Thresholding" box (`fft_threshold_widget.py:170-172`). Ticked,
   * the filter runs even with no thresholds; unticking it clears both lists (lines 236-251).
   */
  readonly fft?: boolean;
  /** RULE-030's radial cutoffs, 0..10000, fractions kept as the bar leaves them. */
  readonly frequencies: readonly number[];
  /** RULE-030's posterization of the filtered result, whole levels 0..255. */
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

  // A preset replaces the window while it is set, and the API refuses a request carrying both --
  // deliberately, because a client sending both has lost track of which applies. Sending the
  // preset alone when it is set keeps that refusal unreachable from here.
  const preset = processing.preset;
  if (preset !== null) {
    query.set(
      "preset",
      preset.kind === "equalize"
        ? `equalize:${preset.source.join(",")}`
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

  // The box alone asks for the filter: with no thresholds it is still the transform and back,
  // stretched to 0..255, which changes the image (fft_threshold_widget.py:410-453).
  if (processing.fft === true) query.set("fft", "1");
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
