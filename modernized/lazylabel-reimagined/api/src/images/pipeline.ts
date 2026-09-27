/**
 * The image pipeline: one decoder, one conversion, one answer about what an image's pixels are.
 *
 * The architecture gives this to the API rather than the browser, and the reason is RULE-024 rather
 * than convenience. A 16-bit image is shown to the user, and sent to SAM, as `value / 256`
 * TRUNCATED — so display and inference have to agree, and they only can if one place decides. The
 * browser also cannot decode 16-bit TIFF at all, which settles where that place is.
 *
 * TWO DECODERS, ONE RULE. `sharp` handles jpeg, png, webp, tiff, gif and heif; it does not handle
 * BMP, which decision 9 adds and legacy reads through OpenCV. So BMP has its own decoder in
 * `bmp.ts`. What neither of them does is the 16-bit conversion: that is applied here, once, to
 * whichever decoder produced the pixels.
 *
 * WHY NOT LET THE LIBRARY DO IT. `sharp` will happily hand back 8-bit pixels for a 16-bit file, and
 * as it happens its conversion agrees with RULE-024 today. Depending on that would mean the rule
 * lives inside libvips, where nothing in this repository can see it and a version bump could change
 * it silently. `toColourspace("rgb16")` gives the true 16-bit values instead, and the divide is
 * written out below where a test can hold it.
 */

import sharp, { type Metadata } from "sharp";

import { decodeBmp, isBmp } from "./bmp.js";
import { applyFrequencyFilter, applyProcessing, isEmpty, type Processing } from "./processing.js";

/**
 * The container formats this service will decode — SEC-02.
 *
 * The assessment's mitigation is to name the decoders rather than let the library pick one from
 * file content, and the reason is concrete: `sharp` also decodes SVG and HEIF. SVG is not an image
 * in the sense this application means. It is a document that can reference external resources, and
 * handing one to librsvg because a file called `photo.png` happened to contain one is a class of
 * bug this service should not be able to have.
 *
 * Content still decides WHICH of these a file is — a .png holding a TIFF decodes as a TIFF, exactly
 * as `cv2.imread` would. The extension is never trusted; it only decides what is offered in the
 * listing. This is the second gate: the format the content turns out to be must also be on the list.
 */
const DECODABLE: ReadonlySet<string> = new Set(["jpeg", "png", "webp", "tiff", "gif"]);

/** The bytes are not an image this service can decode. */
export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** RGB, 8 bits per channel, row-major, three bytes per pixel. */
  readonly data: Uint8Array;
  /** Bit depth of the SOURCE file: 8, or 16 when RULE-024's conversion was applied. */
  readonly sourceDepth: 8 | 16;
  /**
   * 1 for a grayscale image, 3 for colour, decided as legacy decides it (`channelsOf`).
   *
   * The output is always three channels, so this is the only place the distinction survives — and
   * two rules turn on it. RULE-032 disables rescale for an RGB image, and RULE-029 offers a single
   * Gray channel for a grayscale one against three separate ones for colour. Without this the
   * client cannot tell which controls to show, and the server cannot tell which to honour.
   */
  readonly sourceChannels: number;
  readonly sourceFormat: string;
}

/**
 * Whether a colour image is grayscale in all but name — RULE-024.
 *
 * Legacy looks at the PIXELS, not the file header: a three-channel image whose adjacent channels
 * never differ by more than 3 (8-bit) or 768 (16-bit) is one Gray channel
 * (`image_adjustment_manager.py:546-560`). That is a JPEG of a grayscale scene, or a grayscale
 * scan saved as colour, and legacy gives it one Gray threshold bar, rescale and the FFT filter.
 * Asking the header answers "colour" for all of them.
 *
 * THE 16-BIT DIFFERENCES ARE THE TRUE ONES, NOT LEGACY'S. A DELIBERATE DIFFERENCE, the owner's
 * decision of 2026-09-27 ("Fix it in the web"). Legacy casts the samples to int16 before
 * differencing (`image_adjustment_manager.py:556`), so a sample above 32767 wraps negative and the
 * difference is taken modulo 65536: two channels 32768 or more apart come out 65536 minus that far
 * apart, and exactly 32768 apart comes out -32768, which `np.abs` leaves negative. So a pixel of
 * 65535 red and 0 green differs by 1, and an image of saturated primaries, or of bright green on
 * black, is "gray" to legacy: one Gray bar, and its processing path keeps the red channel alone, so
 * a green of 65535 is shown black. Here the difference is the plain one, in a JavaScript number,
 * which no 16-bit value can overflow. The tolerances, 3 and 768, are legacy's.
 *
 * Stops at the first pixel past the tolerance, so a colour photograph is decided in its first row.
 */
export function isEffectivelyGray(samples: Uint8Array | Uint16Array): boolean {
  const tolerance = samples instanceof Uint16Array ? 768 : 3;
  for (let i = 0; i + 2 < samples.length; i += 3) {
    const green = samples[i + 1]!;
    if (Math.abs(green - samples[i]!) > tolerance || Math.abs(samples[i + 2]! - green) > tolerance) return false;
  }
  return true;
}

/**
 * The channel count legacy works with: 1 when the header says grayscale or the pixels do.
 *
 * The header's answer is taken when it says grayscale, because such a file decodes to three equal
 * channels and the pixel test could only agree.
 */
export function channelsOf(headerChannels: number, samples: Uint8Array | Uint16Array): number {
  return headerChannels === 1 || isEffectivelyGray(samples) ? 1 : 3;
}

/**
 * An effectively-gray image becomes its first channel before it is processed.
 *
 * Legacy's processing path reads the file, converts it to RGB and keeps `image[:, :, 0]` — red —
 * when RULE-024 calls it gray (`image_adjustment_manager.py:469-478`). So a threshold, a rescale or
 * the FFT works on red alone and the result is gray, rather than three near-identical channels
 * thresholded apart. Only on the processing path: with nothing active legacy shows the file
 * itself, colours and all (lines 376-379), and so does this.
 */
function toFirstChannel(samples: Uint8Array | Uint16Array): void {
  for (let i = 0; i + 2 < samples.length; i += 3) {
    samples[i + 1] = samples[i]!;
    samples[i + 2] = samples[i]!;
  }
}

/** 8-bit RGB samples, three per pixel, alpha dropped as `cv2.imread` drops it. */
async function eightBitSamples(bytes: Uint8Array): Promise<Uint8Array> {
  const { data } = await sharp(bytes).removeAlpha().toColourspace("srgb").raw().toBuffer({
    resolveWithObject: true,
  });
  return new Uint8Array(data);
}

/** The true 16-bit samples, rather than whatever the library would reduce them to. */
async function wideSamples(bytes: Uint8Array): Promise<Uint16Array> {
  const { data } = await sharp(bytes)
    .removeAlpha()
    .toColourspace("rgb16")
    .raw({ depth: "ushort" })
    .toBuffer({ resolveWithObject: true });
  return new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2);
}

/** 1 for a grayscale header, 3 otherwise: all that is known before the pixels are read. */
function headerChannelsOf(metadata: Metadata): number {
  return metadata.space === "b-w" || metadata.channels === 1 ? 1 : 3;
}

/**
 * Decode an image to 8-bit RGB.
 *
 * Alpha is dropped, which is what `cv2.imread` does by default and therefore what every legacy
 * pixel comparison assumes.
 */
export async function decodeImage(
  bytes: Uint8Array,
  processing?: Processing,
): Promise<DecodedImage> {
  if (isBmp(bytes)) {
    const bitmap = decodeBmp(bytes);
    // BMP always arrives as three channels, so whether it is gray is the pixels' answer alone.
    const decoded = {
      ...bitmap,
      sourceDepth: 8 as const,
      sourceChannels: channelsOf(3, bitmap.data),
      sourceFormat: "bmp",
    };
    return processed(decoded, processing);
  }

  let metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch (cause) {
    throw new UnsupportedImageError(
      `these bytes could not be read as an image: ${cause instanceof Error ? cause.message : cause}`,
    );
  }

  const { width, height, format } = metadata;
  if (!width || !height) {
    throw new UnsupportedImageError(`the image has no usable size (${width}x${height})`);
  }
  assertDecodable(format);

  // `depth` describes the source samples. Anything wider than a byte takes the 16-bit path.
  const isWide = metadata.depth !== undefined && metadata.depth !== "uchar" && metadata.depth !== "char";

  // `channels` and `space` describe the SOURCE, before removeAlpha and the colourspace conversion
  // below turn everything into three-channel RGB. Read here, while the answer still exists.
  const headerChannels = headerChannelsOf(metadata);

  if (!isWide) {
    let samples: Uint8Array = await eightBitSamples(bytes);
    const sourceChannels = channelsOf(headerChannels, samples);
    // 8-bit: the chain runs on these samples directly, since there is no widening step to be
    // before. RULE-032's order is otherwise unchanged.
    if (processing !== undefined && !isEmpty(processing)) {
      if (sourceChannels === 1) toFirstChannel(samples);
      applyProcessing(samples, { width, height, sourceChannels }, processing);
      samples = applyFrequencyFilter(samples, { width, height, sourceChannels }, processing) ?? samples;
    }
    return {
      width,
      height,
      data: samples,
      sourceDepth: 8,
      sourceChannels,
      sourceFormat: format ?? "unknown",
    };
  }

  const wide = await wideSamples(bytes);
  const sourceChannels = channelsOf(headerChannels, wide);

  // BEFORE to8Bit, which is the whole point. RULE-032 puts rescale and channel thresholding ahead
  // of the 16-bit conversion, so they work on the full range: a scan whose data sits between
  // 3,000 and 5,000 stretches across 65,536 levels here and across 8 if it is narrowed first.
  let filtered: Uint8Array | null = null;
  if (processing !== undefined && !isEmpty(processing)) {
    if (sourceChannels === 1) toFirstChannel(wide);
    applyProcessing(wide, { width, height, sourceChannels }, processing);
    // The frequency filter's output is ALREADY 8-bit -- RULE-030 stretches the filtered plane to
    // 0..255 and there is no wider result to keep. So when it ran, `to8Bit` must NOT run after it:
    // shifting those bytes right by eight more would leave a black image.
    filtered = applyFrequencyFilter(wide, { width, height, sourceChannels }, processing);
  }

  const eightBit = filtered ?? to8Bit(wide);

  return {
    width,
    height,
    data: eightBit,
    sourceDepth: 16,
    sourceChannels,
    sourceFormat: format ?? "unknown",
  };
}

/** An image's first channel at its own depth, and what legacy calls it. */
export interface SourcePlane {
  readonly width: number;
  readonly height: number;
  readonly sourceDepth: 8 | 16;
  /** 1 for a grayscale image, 3 for colour, decided as `channelsOf` decides it. */
  readonly sourceChannels: number;
  /** One value per pixel, 8-bit or 16-bit as the file is. */
  readonly plane: Uint8Array | Uint16Array;
}

/**
 * The first channel of an image at the depth of the file: what legacy's Rescale widget holds.
 *
 * Legacy reads the file with `cv2.IMREAD_UNCHANGED`, so a 16-bit image stays 16-bit, and keeps the
 * first channel when RULE-024 calls it gray (`image_adjustment_manager.py:501-516`). That array is
 * what its histogram dialog is given (`rescale_widget.py:420-430`), before any processing.
 */
export async function decodeSourcePlane(bytes: Uint8Array): Promise<SourcePlane> {
  if (isBmp(bytes)) {
    const bitmap = decodeBmp(bytes);
    return {
      width: bitmap.width,
      height: bitmap.height,
      sourceDepth: 8,
      sourceChannels: channelsOf(3, bitmap.data),
      plane: firstChannel(bitmap.data, new Uint8Array(bitmap.width * bitmap.height)),
    };
  }

  let metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch (cause) {
    throw new UnsupportedImageError(
      `these bytes could not be read as an image: ${cause instanceof Error ? cause.message : cause}`,
    );
  }
  const { width, height, format } = metadata;
  if (!width || !height) {
    throw new UnsupportedImageError(`the image has no usable size (${width}x${height})`);
  }
  assertDecodable(format);

  const isWide = metadata.depth !== undefined && metadata.depth !== "uchar" && metadata.depth !== "char";
  const headerChannels = headerChannelsOf(metadata);
  const samples = isWide ? await wideSamples(bytes) : await eightBitSamples(bytes);
  return {
    width,
    height,
    sourceDepth: isWide ? 16 : 8,
    sourceChannels: channelsOf(headerChannels, samples),
    plane: firstChannel(samples, isWide ? new Uint16Array(width * height) : new Uint8Array(width * height)),
  };
}

function firstChannel<T extends Uint8Array | Uint16Array>(samples: Uint8Array | Uint16Array, out: T): T {
  for (let i = 0; i < out.length; i += 1) out[i] = samples[i * 3]!;
  return out;
}

/** The 8-bit chain for a decoder that produced its samples elsewhere, such as the BMP reader. */
function processed(decoded: DecodedImage, processing: Processing | undefined): DecodedImage {
  if (processing === undefined || isEmpty(processing)) return decoded;
  const samples = Uint8Array.from(decoded.data);
  if (decoded.sourceChannels === 1) toFirstChannel(samples);
  const frame = {
    width: decoded.width,
    height: decoded.height,
    sourceChannels: decoded.sourceChannels,
  };
  applyProcessing(samples, frame, processing);
  const data = applyFrequencyFilter(samples, frame, processing) ?? samples;
  return { ...decoded, data };
}

/**
 * RULE-024's 16-bit to 8-bit conversion: `value / 256`, TRUNCATED.
 *
 * Not `value * 255 / 65535`, which is the other obvious scaling and is what most image libraries
 * do. They differ: 255 truncates to 0 and scales to 1; 511 truncates to 1 and scales to 2. Using
 * the wrong one would shift every pixel of a 16-bit image by up to one level, which is invisible on
 * screen and is exactly the kind of difference that makes a SAM mask come out a pixel wider.
 */
export function to8Bit(samples: Uint16Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i]! >>> 8;
  return out;
}

/** SEC-02: refuse a container this service does not mean to decode, whatever it is called. */
function assertDecodable(format: string | undefined): void {
  if (format === undefined || !DECODABLE.has(format)) {
    throw new UnsupportedImageError(
      `this file decodes as ${format ?? "an unknown format"}, which is not an image type LazyLabel opens`,
    );
  }
}

export interface ImageMetadata {
  readonly width: number;
  readonly height: number;
  readonly sourceDepth: 8 | 16;
  /** 1 for a grayscale image, 3 for colour. See `DecodedImage.sourceChannels`. */
  readonly sourceChannels: number;
  readonly sourceFormat: string;
}

/**
 * The size and kind of an image, decoding its pixels only when the header cannot answer.
 *
 * The dataset browser needs the size to load annotations, because the text formats store normalized
 * coordinates, and the size is read from the header alone. The channel count usually is too: a
 * grayscale header settles it. A COLOUR header does not, because RULE-024 decides from the pixels
 * and a grayscale scan saved as colour is one Gray channel to legacy (`channelsOf`). So a colour
 * file is decoded once here, and the test stops at its first colourful pixel.
 *
 * If the pixels cannot be read, the header's answer stands and the pixels route reports the
 * failure, as it did before the pixels were asked anything here.
 */
export async function readImageMetadata(bytes: Uint8Array): Promise<ImageMetadata> {
  if (isBmp(bytes)) {
    // The BMP header carries the size in its first 26 bytes.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 26) throw new UnsupportedImageError("this BMP is too short to hold a header");
    return {
      width: view.getInt32(18, true),
      height: Math.abs(view.getInt32(22, true)),
      sourceDepth: 8,
      sourceChannels: await pixelChannels(3, async () => decodeBmp(bytes).data),
      sourceFormat: "bmp",
    };
  }

  let metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch (cause) {
    throw new UnsupportedImageError(
      `these bytes could not be read as an image: ${cause instanceof Error ? cause.message : cause}`,
    );
  }

  if (!metadata.width || !metadata.height) {
    throw new UnsupportedImageError("the image has no usable size");
  }
  assertDecodable(metadata.format);
  const isWide = metadata.depth !== undefined && metadata.depth !== "uchar" && metadata.depth !== "char";
  return {
    width: metadata.width,
    height: metadata.height,
    sourceDepth: isWide ? 16 : 8,
    sourceChannels: await pixelChannels(headerChannelsOf(metadata), () =>
      isWide ? wideSamples(bytes) : eightBitSamples(bytes),
    ),
    sourceFormat: metadata.format ?? "unknown",
  };
}

/** `channelsOf`, reading the pixels only for a colour header and keeping its answer on failure. */
async function pixelChannels(
  headerChannels: number,
  samples: () => Promise<Uint8Array | Uint16Array>,
): Promise<number> {
  if (headerChannels === 1) return 1;
  try {
    return channelsOf(headerChannels, await samples());
  } catch {
    return headerChannels;
  }
}

/**
 * Render an image as PNG for the browser to display.
 *
 * Always re-encoded rather than passed through, even for a file the browser could decode itself.
 * That is the point of having one pipeline: what the user looks at is the same 8-bit RGB the model
 * is given, so a 16-bit image cannot look one way on screen and arrive at SAM another.
 */
/** Any RGB raster as PNG: a decoded image, or one tile of it. */
export async function renderPng(
  image: Pick<DecodedImage, "width" | "height" | "data">,
): Promise<Uint8Array> {
  const png = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

/** A small preview for the dataset browser, longest side `size`, aspect ratio kept. */
export async function renderThumbnail(bytes: Uint8Array, size = 160): Promise<Uint8Array> {
  const image = await decodeImage(bytes);
  const thumbnail = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return new Uint8Array(thumbnail);
}
