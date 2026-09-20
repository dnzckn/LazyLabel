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

import sharp from "sharp";

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
   * Channels in the SOURCE file: 1 for grayscale, 3 for colour.
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
    // BMP always arrives as colour here, so a rescale request is carried and ignored rather than
    // applied -- which is RULE-032's own answer for an RGB source.
    const decoded = { ...bitmap, sourceDepth: 8 as const, sourceChannels: 3, sourceFormat: "bmp" };
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
  const sourceChannels = metadata.space === "b-w" || metadata.channels === 1 ? 1 : 3;

  if (!isWide) {
    const { data } = await sharp(bytes).removeAlpha().toColourspace("srgb").raw().toBuffer({
      resolveWithObject: true,
    });
    let samples: Uint8Array = new Uint8Array(data);
    // 8-bit: the chain runs on these samples directly, since there is no widening step to be
    // before. RULE-032's order is otherwise unchanged.
    if (processing !== undefined && !isEmpty(processing)) {
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

  const { data } = await sharp(bytes)
    .removeAlpha()
    // The true 16-bit samples, rather than whatever the library would reduce them to.
    .toColourspace("rgb16")
    .raw({ depth: "ushort" })
    .toBuffer({ resolveWithObject: true });

  const wide = new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2);

  // BEFORE to8Bit, which is the whole point. RULE-032 puts rescale and channel thresholding ahead
  // of the 16-bit conversion, so they work on the full range: a scan whose data sits between
  // 3,000 and 5,000 stretches across 65,536 levels here and across 8 if it is narrowed first.
  let filtered: Uint8Array | null = null;
  if (processing !== undefined && !isEmpty(processing)) {
    applyProcessing(wide, { width, height, sourceChannels }, processing);
    // The frequency filter's output is ALREADY 8-bit -- RULE-030 stretches the filtered plane to
    // 0..255 and there is no wider result to keep. So when it ran, `to8Bit` must NOT run after it:
    // shifting those bytes right by eight more would leave a black image.
    filtered = applyFrequencyFilter(wide, { width, height, sourceChannels }, processing);
  }

  return {
    width,
    height,
    data: filtered ?? to8Bit(wide),
    sourceDepth: 16,
    sourceChannels,
    sourceFormat: format ?? "unknown",
  };
}

/** The 8-bit chain for a decoder that produced its samples elsewhere, such as the BMP reader. */
function processed(decoded: DecodedImage, processing: Processing | undefined): DecodedImage {
  if (processing === undefined || isEmpty(processing)) return decoded;
  const samples = Uint8Array.from(decoded.data);
  const frame = {
    width: decoded.width,
    height: decoded.height,
    sourceChannels: decoded.sourceChannels,
  };
  applyProcessing(samples, frame, processing);
  return { ...decoded, data: applyFrequencyFilter(samples, frame, processing) ?? samples };
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
  /** 1 for a grayscale source, 3 for colour. See `DecodedImage.sourceChannels`. */
  readonly sourceChannels: number;
  readonly sourceFormat: string;
}

/**
 * The size and kind of an image, without decoding its pixels.
 *
 * The dataset browser needs the size to load annotations, because the text formats store normalized
 * coordinates — and asking for it should not cost a full decode of a 100-megapixel TIFF.
 */
export async function readImageMetadata(bytes: Uint8Array): Promise<ImageMetadata> {
  if (isBmp(bytes)) {
    // The BMP header carries the size in its first 26 bytes; no pixels are touched.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 26) throw new UnsupportedImageError("this BMP is too short to hold a header");
    return {
      width: view.getInt32(18, true),
      height: Math.abs(view.getInt32(22, true)),
      sourceDepth: 8,
      sourceChannels: 3,
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
    sourceChannels: metadata.space === "b-w" || metadata.channels === 1 ? 1 : 3,
    sourceFormat: metadata.format ?? "unknown",
  };
}

/**
 * Render an image as PNG for the browser to display.
 *
 * Always re-encoded rather than passed through, even for a file the browser could decode itself.
 * That is the point of having one pipeline: what the user looks at is the same 8-bit RGB the model
 * is given, so a 16-bit image cannot look one way on screen and arrive at SAM another.
 */
export async function renderPng(image: DecodedImage): Promise<Uint8Array> {
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
