/**
 * The image-processing chain, in RULE-032's order.
 *
 * WHY THIS IS ON THE SERVER AND NOT IN THE BROWSER. RULE-032 fixes the order as rescale, then
 * channel threshold, then FFT, then 16-bit to 8-bit, then the display adjustments — and the
 * browser only ever receives the output of the fourth step, because the API decodes every image to
 * 8-bit RGB before sending it. A rescale applied client-side would quantise a 16-bit image to 256
 * levels and then stretch those, which is not the rule and is worst on exactly the images that
 * need a rescale: a 16-bit scan whose data occupies a narrow band.
 *
 * So these three run here, on the source samples, and only the display adjustments stay in the
 * browser — where they belong, because they are the last step and they apply to the rendered
 * canvas.
 *
 * TWO CONSTRAINTS COME FROM THE RULE CARDS AND ARE EASY TO MISS:
 *
 *   - **Rescale is for grayscale images only** (RULE-032). On an RGB image legacy disables the
 *     control, and applying it anyway would shift the channels independently and change the hue of
 *     every pixel.
 *   - **Both are restricted to the crop region when a crop is active** (RULE-029 and RULE-032).
 *     Pixels outside the crop are left exactly as they were rather than processed and then
 *     discarded — which matters because the window a stretch computes and the bands a threshold
 *     makes are both derived from the pixels being processed.
 */

import { adjustImage, isNeutral, NEUTRAL, type Adjustments } from "@lazylabel/annotation-formats";
import { clahe } from "./clahe.js";
import {
  equalizeLut,
  posterize,
  rescale,
  MAX_8_BIT,
  MAX_16_BIT,
} from "./imageProcessing.js";
import { filterFrequencies } from "./fft.js";

/** Markers per channel. `gray` applies to all three at once, as legacy's Gray channel does. */
export interface ChannelMarkers {
  readonly gray?: readonly number[];
  readonly r?: readonly number[];
  readonly g?: readonly number[];
  readonly b?: readonly number[];
}

/** `[x1, y1, x2, y2]`, end-exclusive, as a crop is. */
export type Region = readonly [number, number, number, number];

/**
 * RULE-031's histogram presets: what legacy's Rescale histogram dialog applies when its Apply is
 * pressed after Equalize or CLAHE (`rescale_histogram_dialog.py:530-581`; `main_window.py:2809-2825`).
 *
 * Its third, Contrast Stretch, is not one of these. It moves the dialog's min and max lines and
 * Apply hands those to the slider (lines 512-528, 576-580), so what it leaves behind is an ordinary
 * `rescale` window, and that is how it arrives here.
 *
 * A preset REPLACES the window while it is set, as legacy's table replaces the linear rescale
 * (`rescale_widget.py:368-370`); moving a handle clears it (lines 305-314).
 */
export type Preset =
  /**
   * The equalization table, built from `source` — the region the dialog was opened on, which is
   * the crop at that moment or the whole image (`rescale_widget.py:420-430`). Legacy builds it
   * once, at Apply, and keeps it when a crop is drawn afterwards (`main_window.py:2837-2845` clears
   * only CLAHE), so the region it came from is part of the request. Without one, the current crop.
   */
  | { readonly kind: "equalize"; readonly source?: Region | null }
  /** Adaptive equalization of the crop region, per tile, with a clip limit. */
  | { readonly kind: "clahe"; readonly clipLimit: number; readonly tilesX: number; readonly tilesY: number };

export interface Processing {
  /**
   * A histogram preset, or null. GRAYSCALE ONLY, for the same reason the rescale is: these come
   * from legacy's rescale histogram dialog, which is the grayscale path. An RGB source keeps the
   * request and ignores it rather than failing, so a preset chosen on a scan does not turn the
   * next colour image into an error.
   */
  readonly preset?: Preset | null;
  /** Null for none. Ignored on an RGB source, which RULE-032 says has no rescale. */
  readonly rescale?: { readonly min: number; readonly max: number } | null;
  readonly channels?: ChannelMarkers;
  /** `[x1, y1, x2, y2]`, the same inclusive-clamped corners RULE-018 stores. */
  readonly crop?: readonly [number, number, number, number] | null;
  /**
   * Legacy's "Enable FFT Frequency Thresholding" box (`fft_threshold_widget.py:170-172, 328-330`).
   * Ticked, the filter runs even with no thresholds: the transform and back, then the plane
   * stretched to 0..255 (lines 410-453), which is not the image it started as.
   */
  readonly fft?: boolean;
  /**
   * RULE-030's radial cutoffs, 0..10000, and FRACTIONAL: legacy's frequency bar keeps where on the
   * track a marker sits, unrounded (`channel_threshold_widget.py:73-79`). Any given turns the filter on.
   */
  readonly frequencies?: readonly number[];
  /** RULE-030's posterization of the filtered result, 0..255. Any given turns the filter on. */
  readonly intensities?: readonly number[];
}

/**
 * How many pixels the frequency filter will accept.
 *
 * It is a two-dimensional DFT and it is not cheap: measured here, a 1 MP image takes about
 * 0.7 seconds, 2 MP about 2 and 6 MP about 5. A 50-megapixel scan would hold a request open for
 * the best part of a minute, and the user would have no way to tell that from a hung server.
 *
 * So there is a limit and it REFUSES rather than waiting, with the number in the message. Legacy
 * has no limit and simply freezes its window.
 */
export const MAX_FFT_PIXELS = 8_000_000;

export class ImageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageTooLargeError";
  }
}

export interface Frame {
  readonly width: number;
  readonly height: number;
  /** 1 for a grayscale source, 3 for colour. Decides whether rescale runs at all. */
  readonly sourceChannels: number;
}

/** Whether a processing request would change anything, so the decoder can skip the whole chain. */
export function isEmpty(processing: Processing | undefined): boolean {
  if (processing === undefined) return true;
  const markers = processing.channels ?? {};
  const anyMarkers = [markers.gray, markers.r, markers.g, markers.b].some(
    (list) => list !== undefined && list.length > 0,
  );
  return (processing.rescale == null || processing.rescale.max <= processing.rescale.min)
    && (processing.preset ?? null) === null
    && !anyMarkers
    && !frequencyFiltering(processing);
}

/** Whether the FFT filter runs: legacy's box ticked, or thresholds asked for. */
function frequencyFiltering(processing: Processing): boolean {
  return processing.fft === true
    || (processing.frequencies ?? []).length > 0
    || (processing.intensities ?? []).length > 0;
}

/**
 * RULE-030's frequency filter, the third step of RULE-032's order, on the crop region.
 *
 * Legacy runs it on the crop when there is one and writes the result back where the region was,
 * into the image as it is, then converts to 8 bits (`image_adjustment_manager.py:402-407, 655-663`).
 * The filter's output is 8-bit whatever the source: the plane is stretched to 0..255.
 *
 * - WITHOUT A CROP the whole image is the filter's output, so this returns a new 8-bit interleaved
 *   buffer, and the 16-bit conversion must not run after it.
 * - WITH ONE the region is written back into `samples` in place and this returns null, so the
 *   conversion runs over the whole image as legacy's does. On a 16-bit image that divides the
 *   region's 0..255 by 256 as well, and the region comes out black. That is legacy's arithmetic,
 *   reproduced as the rest of RULE-024 is; it is recorded as a difference for the owner.
 *
 * GRAYSCALE ONLY, AND THE TEST IS ON THE DATA: an image whose three channels agree, which is what a
 * grayscale source is once RULE-024 has made it its first channel. Legacy's box can be ticked on a
 * colour image, and does nothing there (`fft_threshold_widget.py:328-330`).
 */
export function applyFrequencyFilter(
  samples: Uint8Array | Uint16Array,
  frame: Frame,
  processing: Processing,
): Uint8Array | null {
  if (!frequencyFiltering(processing)) return null;
  if (!channelsAreEqual(samples)) return null;
  const frequencies = processing.frequencies ?? [];
  const intensities = processing.intensities ?? [];

  const crop = processing.crop ?? null;
  const [x1, y1, x2, y2] = clampRegion(frame, crop);
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return null;

  const pixels = width * height;
  if (pixels > MAX_FFT_PIXELS) {
    throw new ImageTooLargeError(
      `the frequency filter is limited to ${MAX_FFT_PIXELS.toLocaleString()} pixels and this image `
        + `has ${pixels.toLocaleString()}; it would take about `
        + `${Math.round(pixels / 1_000_000)} seconds and the request would look like a hang`,
    );
  }

  // One plane out of the interleaved buffer. The three are equal, so any of them is the image.
  const plane = samples instanceof Uint16Array ? new Uint16Array(pixels) : new Uint8Array(pixels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) plane[y * width + x] = samples[((y + y1) * frame.width + (x + x1)) * 3]!;
  }

  const filtered = filterFrequencies(plane, height, width, frequencies, intensities);

  if (crop === null) {
    const out = new Uint8Array(pixels * 3);
    for (let i = 0; i < pixels; i += 1) {
      const value = filtered[i]!;
      out[i * 3] = value;
      out[i * 3 + 1] = value;
      out[i * 3 + 2] = value;
    }
    return out;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = filtered[y * width + x]!;
      const at = ((y + y1) * frame.width + (x + x1)) * 3;
      samples[at] = value;
      samples[at + 1] = value;
      samples[at + 2] = value;
    }
  }
  return null;
}

/** Whether every pixel's three channels agree, which is what makes an RGB buffer a grayscale image. */
function channelsAreEqual(samples: Uint8Array | Uint16Array): boolean {
  for (let i = 0; i < samples.length; i += 3) {
    if (samples[i] !== samples[i + 1] || samples[i] !== samples[i + 2]) return false;
  }
  return true;
}

/**
 * Apply the chain to interleaved RGB samples, in place.
 *
 * `samples` is three values per pixel whatever the source was: a grayscale image arrives with its
 * value repeated across the three, which is what the decoder produces and what keeps one code path
 * here. `maximum` is 255 or 65535 and is what the arithmetic scales to — passing the wrong one
 * quantises a 16-bit image without anything failing.
 */
export function applyProcessing(
  samples: Uint8Array | Uint16Array,
  frame: Frame,
  processing: Processing,
): void {
  if (isEmpty(processing)) return;

  const maximum = samples instanceof Uint16Array ? MAX_16_BIT : MAX_8_BIT;
  const grayscale = frame.sourceChannels === 1;
  const preset = grayscale ? (processing.preset ?? null) : null;
  const crop = processing.crop ?? null;

  /*
   * A PRESET IS LEGACY'S RESCALE STEP, not a step of its own. Legacy's rescale widget applies its
   * table when one is set and its linear window otherwise (`rescale_widget.py:363-393`), first in
   * the chain and inside the crop (`image_adjustment_manager.py:619-623`). So both run here, where
   * the window does, before the threshold and the FFT, on the source samples.
   *
   * `equalize` is a lookup table built from its source region. `clahe` is a picture, computed on
   * the crop region at the source's own depth and written over it (`rescale_widget.py:397-406`) --
   * 16-bit CLAHE on a 16-bit image, as OpenCV does it for legacy.
   */
  if (preset?.kind === "clahe") claheRegion(samples, frame, crop, preset);
  const lut = preset?.kind === "equalize"
    ? equalizeLut(channelValues(samples, frame, preset.source ?? crop), maximum)
    : null;

  const window = processing.rescale ?? null;
  // RULE-032: grayscale only. An RGB image keeps its rescale request and ignores it, rather than
  // failing -- a stored setting from a grayscale image should not make the next image an error.
  // And a preset replaces the window while it is set.
  const rescaling = preset === null && frame.sourceChannels === 1 && window !== null && window.max > window.min;

  const markers = processing.channels ?? {};
  // A grayscale source has one channel and legacy calls it Gray, so `gray` drives all three. On an
  // RGB source the per-channel lists drive their own, and `gray` is not offered.
  const perChannel: readonly (readonly number[])[] =
    frame.sourceChannels === 1
      ? [markers.gray ?? [], markers.gray ?? [], markers.gray ?? []]
      : [markers.r ?? [], markers.g ?? [], markers.b ?? []];
  const thresholding = perChannel.some((list) => list.length > 0);

  if (!rescaling && !thresholding && lut === null) return;

  for (const [x, y] of pixelsIn(frame, processing.crop ?? null)) {
    const at = (y * frame.width + x) * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      let value = samples[at + channel]!;
      // The order is the rule. Thresholding first would put the bands at values the rescale is
      // about to move.
      // The equalization table replaces the window rather than following it: both would apply a
      // contrast change twice, and the table was built from the untouched values.
      if (lut !== null) value = lut[Math.min(lut.length - 1, Math.max(0, value))]!;
      else if (rescaling) value = rescale(value, window!.min, window!.max, maximum);
      const list = perChannel[channel]!;
      if (list.length > 0) value = posterize(value, list, maximum);
      samples[at + channel] = value;
    }
  }
}

/**
 * The pixels a crop lets through, or all of them when there is none.
 *
 * The kept region is `x1..x2 - 1` by `y1..y2 - 1`, exclusive of the far edge — the same off-by-one
 * RULE-018 applies when a crop blanks a mask. Using an inclusive bound here would process one more
 * row and column than the crop keeps, so the strip about to be blanked would come out processed
 * and the two halves of the same crop would disagree.
 */
function* pixelsIn(
  frame: Frame,
  crop: readonly [number, number, number, number] | null,
): Generator<readonly [number, number]> {
  const [x1, y1, x2, y2] =
    crop === null ? [0, 0, frame.width, frame.height] : crop;

  const left = Math.max(0, Math.min(frame.width, x1));
  const top = Math.max(0, Math.min(frame.height, y1));
  const right = Math.max(left, Math.min(frame.width, x2));
  const bottom = Math.max(top, Math.min(frame.height, y2));

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) yield [x, y];
  }
}

/**
 * Read a processing request off a URL's query string.
 *
 * Every parameter is optional and a malformed one is REFUSED rather than ignored, because the
 * failure mode of ignoring it is an image that looks untouched for a reason nobody can see. The
 * caller turns the thrown message into a 400.
 */
export function processingFromQuery(query: URLSearchParams): Processing {
  const rescaleMin = intOr(query, "rescaleMin", null);
  const rescaleMax = intOr(query, "rescaleMax", null);

  if ((rescaleMin === null) !== (rescaleMax === null)) {
    throw new Error("rescaleMin and rescaleMax must be given together");
  }

  const channels: {
    gray?: readonly number[];
    r?: readonly number[];
    g?: readonly number[];
    b?: readonly number[];
  } = {};
  for (const name of ["gray", "r", "g", "b"] as const) {
    const raw = query.get(`markers_${name}`);
    if (raw === null || raw === "") continue;
    const values = raw.split(",").map((part) => Number.parseInt(part.trim(), 10));
    if (values.some((value) => !Number.isInteger(value))) {
      throw new Error(`markers_${name} must be a comma-separated list of whole numbers`);
    }
    channels[name] = values;
  }

  const frequencies = decimalList(query, "frequencies", 0, 10_000);
  const intensities = numberList(query, "intensities", 0, 255);
  const fftRaw = query.get("fft");
  if (fftRaw !== null && fftRaw !== "" && fftRaw !== "1") throw new Error("fft must be 1, or left out");
  const fft = fftRaw === "1";

  const cropRaw = query.get("crop");
  let crop: readonly [number, number, number, number] | null = null;
  if (cropRaw !== null && cropRaw !== "") {
    const parts = cropRaw.split(",").map((part) => Number.parseInt(part.trim(), 10));
    if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value))) {
      throw new Error("crop must be four whole numbers, x1,y1,x2,y2");
    }
    crop = [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
  }

  const preset = presetFromQuery(query);
  if (preset !== null && rescaleMin !== null) {
    // RULE-031's own edge case, enforced rather than resolved by precedence: dragging the rescale
    // handles CLEARS a preset, so a request carrying both is a client that has lost track of which
    // the user chose. Picking one silently would show them a picture neither control describes.
    throw new Error("a preset and a manual rescale window cannot both be given");
  }

  return {
    preset,
    rescale: rescaleMin === null || rescaleMax === null ? null : { min: rescaleMin, max: rescaleMax },
    channels,
    crop,
    fft,
    frequencies,
    intensities,
  };
}

/**
 * `preset=equalize`, `preset=equalize:x1,y1,x2,y2` and `preset=clahe:2:8:8` — the dialog's two.
 *
 * Every number is bounded by the dialog's own ranges and a value outside it is REFUSED, not
 * clamped: Clip 0.5 to 40, Tile 2 to 32 (`rescale_histogram_dialog.py:428-444`). These change what
 * the user sees rather than what is written, so a silently adjusted clip limit would leave them
 * adjusting a control that had stopped responding.
 */
function presetFromQuery(query: URLSearchParams): Preset | null {
  const raw = query.get("preset");
  if (raw === null || raw === "") return null;

  const [kind, ...rest] = raw.split(":");
  if (kind === "equalize") {
    if (rest.length === 0) return { kind: "equalize" };
    const parts = rest.length === 1 ? rest[0]!.split(",").map((part) => Number(part.trim())) : [];
    if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error("preset=equalize takes the region its table comes from, x1,y1,x2,y2");
    }
    return { kind: "equalize", source: [parts[0]!, parts[1]!, parts[2]!, parts[3]!] };
  }

  if (kind === "clahe") {
    const clipLimit = rest.length > 0 ? Number(rest[0]) : 2;
    const tilesX = rest.length > 1 ? Number(rest[1]) : 8;
    const tilesY = rest.length > 2 ? Number(rest[2]) : tilesX;
    if (!Number.isFinite(clipLimit) || clipLimit < 0.5 || clipLimit > 40) {
      throw new Error("preset=clahe takes a clip limit from 0.5 to 40");
    }
    for (const tiles of [tilesX, tilesY]) {
      if (!Number.isInteger(tiles) || tiles < 2 || tiles > 32) {
        throw new Error("preset=clahe takes tile counts from 2 to 32");
      }
    }
    return { kind: "clahe", clipLimit, tilesX, tilesY };
  }

  throw new Error(`preset must be equalize or clahe, got ${JSON.stringify(kind)}`);
}

/** A comma-separated list of whole numbers within bounds, or [] when the parameter is absent. */
function numberList(
  query: URLSearchParams,
  name: string,
  low: number,
  high: number,
): readonly number[] {
  const raw = query.get(name);
  if (raw === null || raw === "") return [];
  const values = raw.split(",").map((part) => Number.parseInt(part.trim(), 10));
  if (values.some((value) => !Number.isInteger(value) || value < low || value > high)) {
    throw new Error(`${name} must be a comma-separated list of whole numbers between ${low} and ${high}`);
  }
  return values;
}

/**
 * A comma-separated list of numbers within bounds, fractions allowed, or [] when absent.
 *
 * For the frequency cutoffs, which legacy keeps as the fraction of the track a marker sits at
 * (`x_to_value`, `channel_threshold_widget.py:68-79`): 3906.25, not 3906. Rounding one moves a band
 * edge, and on a large image that moves pixels between bands.
 */
function decimalList(
  query: URLSearchParams,
  name: string,
  low: number,
  high: number,
): readonly number[] {
  const raw = query.get(name);
  if (raw === null || raw === "") return [];
  const values = raw.split(",").map((part) => (part.trim() === "" ? Number.NaN : Number(part.trim())));
  if (values.some((value) => !Number.isFinite(value) || value < low || value > high)) {
    throw new Error(`${name} must be a comma-separated list of numbers between ${low} and ${high}`);
  }
  return values;
}

function intOr(query: URLSearchParams, name: string, fallback: number | null): number | null {
  const raw = query.get(name);
  if (raw === null || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) throw new Error(`${name} must be a whole number`);
  return value;
}

/**
 * One channel's values over a region: what a preset is computed from.
 *
 * Channel 0, because a preset is grayscale-only and a grayscale source is expanded to three equal
 * channels by the decoder (its first channel, when RULE-024 calls a colour file gray). The region
 * is the crop, or the region the dialog was opened on: legacy's dialog is given the crop
 * (`rescale_widget.py:420-430`), so a table over the whole frame would come from pixels the user
 * has cropped away.
 */
function channelValues(
  samples: Uint8Array | Uint16Array,
  frame: Frame,
  crop: Region | null,
): Uint8Array | Uint16Array {
  const out = samples instanceof Uint16Array ? new Uint16Array(countIn(frame, crop)) : new Uint8Array(countIn(frame, crop));
  let at = 0;
  for (const [x, y] of pixelsIn(frame, crop)) out[at++] = samples[(y * frame.width + x) * 3]!;
  return out.subarray(0, at);
}

function countIn(frame: Frame, crop: Region | null): number {
  if (crop === null) return frame.width * frame.height;
  const [x1, y1, x2, y2] = crop;
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/** A region clamped to the frame, as numpy's slicing clamps `image[y1:y2, x1:x2]`. */
export function clampRegion(frame: Pick<Frame, "width" | "height">, crop: Region | null): Region {
  if (crop === null) return [0, 0, frame.width, frame.height];
  const left = Math.max(0, Math.min(frame.width, crop[0]));
  const top = Math.max(0, Math.min(frame.height, crop[1]));
  return [left, top, Math.max(left, Math.min(frame.width, crop[2])), Math.max(top, Math.min(frame.height, crop[3]))];
}

/**
 * CLAHE over the crop region, written back over it — legacy's CLAHE preset.
 *
 * Legacy computes it once, in the dialog, on the region the dialog was given, at the image's own
 * depth (`rescale_histogram_dialog.py:50-73, 547-564`), and its rescale step then puts that picture
 * where the crop is, or in place of the whole image (`rescale_widget.py:397-406`). A crop drawn
 * afterwards drops it (`main_window.py:2837-2845`), so the region it was computed on is always the
 * crop it is shown in, and the request only has to say the crop.
 */
function claheRegion(
  samples: Uint8Array | Uint16Array,
  frame: Frame,
  crop: Region | null,
  preset: Extract<Preset, { kind: "clahe" }>,
): void {
  const [x1, y1, x2, y2] = clampRegion(frame, crop);
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return;

  const plane = samples instanceof Uint16Array ? new Uint16Array(width * height) : new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      plane[y * width + x] = samples[((y + y1) * frame.width + (x + x1)) * 3]!;
    }
  }

  const equalized = clahe(plane, height, width, {
    clipLimit: preset.clipLimit,
    tilesX: preset.tilesX,
    tilesY: preset.tilesY,
  });

  // Back into all three channels: the source is grayscale, so the three are equal and a viewer
  // reading any of them must see the same value.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = equalized[y * width + x]!;
      const at = ((y + y1) * frame.width + (x + x1)) * 3;
      samples[at] = value;
      samples[at + 1] = value;
      samples[at + 2] = value;
    }
  }
}

/**
 * RULE-028's display adjustments, applied where they belong: LAST.
 *
 * RULE-032 fixes the order as rescale, channel threshold, FFT, the 16-bit conversion, and then
 * these. They are the only step defined on what a person SEES rather than on the image's own
 * values, which is why they come after everything that reasons about the data.
 *
 * The browser applies these too, for its own display, and that is not a duplicate implementation:
 * it calls the same `adjustImage` from the shared package. The API needs them so it can hand a
 * model exactly the pixels a user is looking at -- RULE-089's Operate On View -- and two different
 * answers here would mean a mask returned for an image nobody saw.
 *
 * The samples here are three channels per pixel, not four: the browser's canvas buffer is RGBA and
 * this is not, so the loop is per-pixel rather than `adjustImage`'s stride of four. Alpha is the
 * thing that differs, and there is none.
 */
export function applyAdjustments(data: Uint8Array, adjustments: Adjustments): void {
  if (isNeutral(adjustments)) return;
  // A four-channel view lets the shared function do the work rather than this file repeating the
  // arithmetic. The alpha it leaves alone is discarded with the view.
  const rgba = new Uint8ClampedArray((data.length / 3) * 4);
  for (let at = 0, out = 0; at < data.length; at += 3, out += 4) {
    rgba[out] = data[at]!;
    rgba[out + 1] = data[at + 1]!;
    rgba[out + 2] = data[at + 2]!;
  }
  adjustImage(rgba, adjustments);
  for (let at = 0, out = 0; at < data.length; at += 3, out += 4) {
    data[at] = rgba[out]!;
    data[at + 1] = rgba[out + 1]!;
    data[at + 2] = rgba[out + 2]!;
  }
}

/**
 * `adjust=brightness,contrast,gamma,saturation` — the four in the order the panel shows them.
 *
 * One parameter rather than four, because they are applied as a set and a request carrying two of
 * them has not said what the other two are. Out of range is REFUSED rather than clamped, like
 * every other parameter here: a slider that stops responding is worse than an error.
 */
export function adjustmentsFromQuery(query: URLSearchParams): Adjustments {
  const raw = query.get("adjust");
  if (raw === null || raw === "") return NEUTRAL;

  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error("adjust must be four numbers: brightness,contrast,gamma,saturation");
  }
  const [brightness, contrast, gamma, saturation] = parts as [number, number, number, number];
  if (brightness < -100 || brightness > 100) throw new Error("brightness must be -100 to 100");
  if (contrast < -100 || contrast > 100) throw new Error("contrast must be -100 to 100");
  if (gamma <= 0 || gamma > 10) throw new Error("gamma must be greater than 0 and at most 10");
  if (saturation < 0 || saturation > 10) throw new Error("saturation must be 0 to 10");
  return { brightness, contrast, gamma, saturation };
}
