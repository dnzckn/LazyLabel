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

import { clahe } from "./clahe.js";
import {
  equalizeLut,
  posterize,
  rescale,
  stretchWindow,
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

/**
 * RULE-031's histogram presets — the three ways to choose a rescale other than by hand.
 *
 * Mutually exclusive with a manual `rescale` window, which is the rule's own edge case: "dragging
 * the rescale handles clears any preset". Both at once has no meaning, so the type does not allow
 * anyone to ask for it.
 */
export type Preset =
  /** min/max at the tail percentiles. `saturation` is a PERCENT, 0..50; 0 uses the data range. */
  | { readonly kind: "stretch"; readonly saturation: number }
  /** A CDF lookup table over the whole image. */
  | { readonly kind: "equalize" }
  /** Adaptive equalization, per tile, with a clip limit. */
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
  /** RULE-030's radial cutoffs, 0..10000. Empty for no frequency filtering. */
  readonly frequencies?: readonly number[];
  /** RULE-030's posterization of the filtered result, 0..255. */
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
    && (processing.frequencies ?? []).length === 0
    && (processing.intensities ?? []).length === 0;
}

/**
 * RULE-030's frequency filter, the third step of RULE-032's order.
 *
 * Returns a new 8-BIT interleaved buffer when it ran, or null when it did not. Eight bits whatever
 * the source was, because the rule says so: the filtered plane is min-max stretched to 0..255, and
 * there is no wider result to keep.
 *
 * GRAYSCALE ONLY, AND THE TEST IS ON THE DATA. The rule card says "2-D or exactly equal-channel
 * images", so an RGB file whose three channels happen to be identical — a grayscale scan saved as
 * colour, which is extremely common — IS processed. Testing `sourceChannels` instead would refuse
 * exactly those, and they are the images most likely to want this.
 */
export function applyFrequencyFilter(
  samples: Uint8Array | Uint16Array,
  frame: Frame,
  processing: Processing,
): Uint8Array | null {
  const frequencies = processing.frequencies ?? [];
  const intensities = processing.intensities ?? [];
  if (frequencies.length === 0 && intensities.length === 0) return null;
  if (!channelsAreEqual(samples)) return null;

  const pixels = frame.width * frame.height;
  if (pixels > MAX_FFT_PIXELS) {
    throw new ImageTooLargeError(
      `the frequency filter is limited to ${MAX_FFT_PIXELS.toLocaleString()} pixels and this image `
        + `has ${pixels.toLocaleString()}; it would take about `
        + `${Math.round(pixels / 1_000_000)} seconds and the request would look like a hang`,
    );
  }

  // One plane out of the interleaved buffer. The three are equal, so any of them is the image.
  const plane = samples instanceof Uint16Array
    ? new Uint16Array(pixels)
    : new Uint8Array(pixels);
  for (let i = 0; i < pixels; i += 1) plane[i] = samples[i * 3]!;

  const filtered = filterFrequencies(plane, frame.height, frame.width, frequencies, intensities);

  const out = new Uint8Array(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    const value = filtered[i]!;
    out[i * 3] = value;
    out[i * 3 + 1] = value;
    out[i * 3 + 2] = value;
  }
  return out;
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

  /*
   * A PRESET IS A WAY OF CHOOSING THE RESCALE, not a step of its own -- RULE-031 comes from the
   * rescale histogram dialog, and the rule's edge case says dragging the handles clears a preset.
   * So `stretch` computes the window the manual controls would have been dragged to, and the one
   * loop below applies it either way. Two separate stages would be two places for RULE-032's order
   * to be got wrong.
   *
   * `equalize` is not a window at all -- it is a lookup table over the whole image -- so it
   * replaces the rescale rather than choosing one. `clahe` is neither: it works on 8-bit data and
   * belongs after the conversion, so `pipeline.ts` applies it and this function ignores it.
   */
  const stretched =
    preset?.kind === "stretch" ? stretchWindow(channelValues(samples, frame, processing.crop ?? null), preset.saturation) : null;
  const lut = preset?.kind === "equalize"
    ? equalizeLut(channelValues(samples, frame, processing.crop ?? null), maximum)
    : null;

  const window = stretched ?? processing.rescale ?? null;
  // RULE-032: grayscale only. An RGB image keeps its rescale request and ignores it, rather than
  // failing -- a stored setting from a grayscale image should not make the next image an error.
  const rescaling = frame.sourceChannels === 1 && window !== null && window.max > window.min;

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

  const frequencies = numberList(query, "frequencies", 0, 10_000);
  const intensities = numberList(query, "intensities", 0, 255);

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
    frequencies,
    intensities,
  };
}

/**
 * `preset=stretch:0.4`, `preset=equalize`, `preset=clahe:2:8:8` — RULE-031's three.
 *
 * Every number is bounded by the rule's own recorded range and a value outside it is REFUSED, not
 * clamped. These change what the user sees rather than what is written, so a silently adjusted
 * clip limit would leave them adjusting a control that had stopped responding.
 */
function presetFromQuery(query: URLSearchParams): Preset | null {
  const raw = query.get("preset");
  if (raw === null || raw === "") return null;

  const [kind, ...rest] = raw.split(":");
  if (kind === "equalize") {
    if (rest.length > 0) throw new Error("preset=equalize takes no parameters");
    return { kind: "equalize" };
  }

  if (kind === "stretch") {
    const saturation = rest.length === 0 ? 0.4 : Number(rest[0]);
    if (!Number.isFinite(saturation) || saturation < 0 || saturation > 50) {
      throw new Error("preset=stretch takes a saturation percent from 0 to 50");
    }
    return { kind: "stretch", saturation };
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

  throw new Error(`preset must be stretch, equalize or clahe, got ${JSON.stringify(kind)}`);
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

function intOr(query: URLSearchParams, name: string, fallback: number | null): number | null {
  const raw = query.get(name);
  if (raw === null || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) throw new Error(`${name} must be a whole number`);
  return value;
}

/**
 * One channel's values over the region a preset is computed from.
 *
 * Channel 0, because a preset is grayscale-only and a grayscale source is expanded to three equal
 * channels by the decoder. The CROP, because RULE-031 says the preset is computed on the crop
 * region: a stretch over the whole frame would set its window from pixels the user has cropped
 * away, which is exactly the case a crop exists to exclude.
 */
function channelValues(
  samples: Uint8Array | Uint16Array,
  frame: Frame,
  crop: readonly [number, number, number, number] | null,
): Uint8Array | Uint16Array {
  const out = samples instanceof Uint16Array ? new Uint16Array(countIn(frame, crop)) : new Uint8Array(countIn(frame, crop));
  let at = 0;
  for (const [x, y] of pixelsIn(frame, crop)) out[at++] = samples[(y * frame.width + x) * 3]!;
  return out.subarray(0, at);
}

function countIn(frame: Frame, crop: readonly [number, number, number, number] | null): number {
  if (crop === null) return frame.width * frame.height;
  const [x1, y1, x2, y2] = crop;
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/**
 * RULE-031's CLAHE, applied to 8-bit data — the last step before display.
 *
 * SEPARATE FROM `applyProcessing`, and the separation is the rule rather than tidiness. CLAHE is
 * defined on 8-bit intensities and RULE-032 fixes the order as rescale, threshold, FFT, then the
 * 16-bit conversion; adaptive equalization of 16-bit samples would be a different operation
 * producing different pixels. So it runs where the data is 8-bit, which is after that conversion,
 * and every path through the pipeline calls it at its own end.
 *
 * ON THE CROP REGION, as the rule says. CLAHE is spatial — its tiles are laid over whatever it is
 * given — so running it over the whole frame and then cropping would equalize against pixels the
 * user cropped away, and the visible result would change when the crop did for no reason the user
 * could see.
 *
 * Grayscale only, like the other two presets. A colour image keeps the request and ignores it.
 */
export function applyClahe(data: Uint8Array, frame: Frame, processing: Processing | undefined): void {
  const preset = processing?.preset ?? null;
  if (preset === null || preset.kind !== "clahe" || frame.sourceChannels !== 1) return;

  const crop = processing?.crop ?? null;
  const x1 = crop === null ? 0 : Math.max(0, crop[0]);
  const y1 = crop === null ? 0 : Math.max(0, crop[1]);
  const x2 = crop === null ? frame.width : Math.min(frame.width, crop[2]);
  const y2 = crop === null ? frame.height : Math.min(frame.height, crop[3]);
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return;

  const plane = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      plane[y * width + x] = data[((y + y1) * frame.width + (x + x1)) * 3]!;
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
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
    }
  }
}
