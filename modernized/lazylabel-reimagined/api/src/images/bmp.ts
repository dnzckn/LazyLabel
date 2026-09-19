/**
 * A BMP decoder, because the image library does not have one.
 *
 * Decision 9 adds `.bmp` to the supported image types, and legacy reads it through OpenCV without
 * thinking about it. `sharp` decodes jpeg, png, webp, tiff, gif and heif — not bmp — so refusing
 * BMP would be a regression against a format the brief explicitly promises.
 *
 * BMP is worth decoding by hand in a way most formats are not: the common cases are uncompressed
 * rows of pixels behind a fixed header, with no entropy coding and no colour management. What is
 * implemented is BI_RGB at 24 and 32 bits per pixel and 8-bit palettes, which is what cameras,
 * screenshots and conversion tools actually produce. Everything else — RLE, 16-bit packed, embedded
 * JPEG or PNG — is refused by name rather than guessed at, because a wrong guess here is silently
 * wrong pixels rather than an error.
 */

/** The bytes are not a BMP this decoder will read. */
export class BmpDecodeError extends Error {
  constructor(message: string) {
    super(`this BMP cannot be decoded: ${message}`);
    this.name = "BmpDecodeError";
  }
}

export interface DecodedBmp {
  readonly width: number;
  readonly height: number;
  /** RGB, 8 bits per channel, row-major, top row first. */
  readonly data: Uint8Array;
}

export function isBmp(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d; // "BM"
}

export function decodeBmp(bytes: Uint8Array): DecodedBmp {
  if (!isBmp(bytes)) throw new BmpDecodeError("it does not start with BM");
  if (bytes.length < 54) throw new BmpDecodeError("it is too short to hold a header");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  if (headerSize < 40) throw new BmpDecodeError(`an unsupported ${headerSize}-byte info header`);

  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);

  // A negative height means the rows are stored top-down; the usual layout is bottom-up.
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);

  if (width <= 0 || height <= 0) throw new BmpDecodeError(`it claims to be ${width}x${rawHeight}`);
  // BI_RGB is 0. BI_BITFIELDS (3) is accepted only at 32bpp, where the masks are almost always the
  // default BGRA layout; anything else would need the masks honoured properly.
  if (compression !== 0 && !(compression === 3 && bitsPerPixel === 32)) {
    throw new BmpDecodeError(`compression type ${compression} is not supported`);
  }
  if (![8, 24, 32].includes(bitsPerPixel)) {
    throw new BmpDecodeError(`${bitsPerPixel} bits per pixel is not supported`);
  }

  // Rows are padded to a multiple of four bytes.
  const rowStride = Math.ceil((width * bitsPerPixel) / 8 / 4) * 4;
  if (pixelOffset + rowStride * height > bytes.length) {
    throw new BmpDecodeError("the pixel data is shorter than the header says");
  }

  const palette = bitsPerPixel === 8 ? readPalette(view, bytes, headerSize) : null;
  const out = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    // Bottom-up is the default, so row 0 of the file is the LAST row of the image.
    const sourceRow = topDown ? y : height - 1 - y;
    let at = pixelOffset + sourceRow * rowStride;
    let to = y * width * 3;

    for (let x = 0; x < width; x += 1) {
      if (bitsPerPixel === 8) {
        const index = bytes[at]! * 4;
        // Palette entries are stored BGRA.
        out[to] = palette![index + 2]!;
        out[to + 1] = palette![index + 1]!;
        out[to + 2] = palette![index]!;
        at += 1;
      } else {
        // Pixels are stored BGR, low byte first; the fourth byte at 32bpp is alpha, which legacy
        // drops too because cv2.imread defaults to three channels.
        out[to] = bytes[at + 2]!;
        out[to + 1] = bytes[at + 1]!;
        out[to + 2] = bytes[at]!;
        at += bitsPerPixel / 8;
      }
      to += 3;
    }
  }

  return { width, height, data: out };
}

function readPalette(view: DataView, bytes: Uint8Array, headerSize: number): Uint8Array {
  const declared = view.getUint32(46, true); // biClrUsed
  const count = declared === 0 ? 256 : declared;
  const start = 14 + headerSize;

  if (start + count * 4 > bytes.length) throw new BmpDecodeError("its colour table is truncated");
  return bytes.subarray(start, start + count * 4);
}
