/**
 * Minimal reader and writer for NumPy's .npy array format, version 1.0.
 *
 * An .npz file is a zip of .npy members, so this plus src/util/zip.ts is all the NPZ formats need.
 * Only the dtypes LazyLabel actually stores are supported: uint8 masks and 64-bit integer class
 * lists. Anything else is refused loudly rather than guessed at, because a silently misread mask
 * would corrupt annotations.
 *
 * Format reference: a 6-byte magic, a version pair, a 2-byte little-endian header length, then a
 * Python dict literal padded so the data starts on a 64-byte boundary.
 */

import { assertWithin, DEFAULT_LIMITS, type AnnotationLimits } from "../limits.js";

const MAGIC = new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]); // \x93NUMPY

export type NpyDType = "uint8" | "int64" | "bool" | "str";

export interface NpyArray {
  readonly dtype: NpyDType;
  readonly shape: readonly number[];
  /**
   * Row-major values. int64 arrays come back as numbers, since LazyLabel never stores ids beyond
   * 2^53, and a "str" array comes back as the string itself.
   */
  readonly data: Uint8Array | Float64Array | string;
}

const DESCR: Record<Exclude<NpyDType, "str">, string> = { uint8: "|u1", int64: "<i8", bool: "|b1" };
const ITEM_BYTES: Record<Exclude<NpyDType, "str">, number> = { uint8: 1, int64: 8, bool: 1 };

/**
 * A 0-dimensional NumPy unicode scalar, which is what `np.array("some text")` produces.
 *
 * NumPy stores unicode as UTF-32 little-endian code points, so Python reads the value back with a
 * plain `str(data["key"])`. This is how class aliases travel now that pickle is banned: the alias
 * table is JSON inside one of these (MODERNIZATION_BRIEF.md decision 4).
 */
export function encodeNpyString(value: string): Uint8Array {
  const points = [...value];
  const body = new Uint8Array(points.length * 4);
  const view = new DataView(body.buffer);
  points.forEach((char, index) => view.setUint32(index * 4, char.codePointAt(0)!, true));
  return encodeWithHeader(`'<U${points.length}'`, "", body); // 0-d array: NumPy writes "shape': ()"
}

export function encodeNpy(array: NpyArray): Uint8Array {
  if (array.dtype === "str") {
    if (typeof array.data !== "string") throw new TypeError("a str array needs string data");
    return encodeNpyString(array.data);
  }
  const shape = array.shape.length === 1 ? `${array.shape[0]},` : array.shape.join(", ");
  return encodeWithHeader(`'${DESCR[array.dtype]}'`, shape, encodeBody(array));
}

function encodeWithHeader(descr: string, shape: string, body: Uint8Array): Uint8Array {
  let header = `{'descr': ${descr}, 'fortran_order': False, 'shape': (${shape}), }`;
  // Header length must make the total a multiple of 64, and the header ends with a newline.
  const preamble = MAGIC.length + 2 + 2;
  const padding = 64 - ((preamble + header.length + 1) % 64);
  header += " ".repeat(padding === 64 ? 0 : padding) + "\n";

  const out = new Uint8Array(preamble + header.length + body.length);
  out.set(MAGIC, 0);
  out[6] = 1; // major version
  out[7] = 0; // minor version
  new DataView(out.buffer).setUint16(8, header.length, true);
  out.set(new TextEncoder().encode(header), 10);
  out.set(body, preamble + header.length);
  return out;
}

function encodeBody(array: NpyArray): Uint8Array {
  const count = array.shape.reduce((a, b) => a * b, 1);
  if (array.dtype === "uint8" || array.dtype === "bool") {
    if (!(array.data instanceof Uint8Array)) throw new TypeError("uint8 array needs Uint8Array data");
    // Without this, a tensor whose data and shape disagree is written silently: two thirds of the
    // mask survives, misattributed to the wrong classes, with no error anywhere.
    if (array.data.length !== count) {
      throw new RangeError(`this array declares ${count} elements but carries ${array.data.length}`);
    }
    return array.data;
  }
  const out = new Uint8Array(count * 8);
  const view = new DataView(out.buffer);
  for (let i = 0; i < count; i += 1) view.setBigInt64(i * 8, BigInt(Math.trunc(Number(array.data[i]))), true);
  return out;
}

export function decodeNpy(bytes: Uint8Array, limits: AnnotationLimits = DEFAULT_LIMITS): NpyArray {
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) throw new Error("not an .npy array: bad magic");
  }
  const major = bytes[6]!;
  const headerLength =
    major === 1
      ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(8, true)
      : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  const headerStart = major === 1 ? 10 : 12;
  const header = new TextDecoder().decode(bytes.subarray(headerStart, headerStart + headerLength));

  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const fortran = /'fortran_order':\s*(True|False)/.exec(header)?.[1];
  const shapeText = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1] ?? "";
  if (!descr) throw new Error("not an .npy array: no dtype in header");
  if (fortran === "True") throw new Error("column-major .npy arrays are not supported");

  const shape = shapeText
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10));
  const count = shape.reduce((a, b) => a * b, 1);
  assertWithin(
    Number.isFinite(count) && count >= 0 && count <= limits.maxPixels * limits.maxChannels,
    `this array declares ${count} elements, more than the limits allow`,
  );
  const body = bytes.subarray(headerStart + headerLength);

  // NumPy unicode: "<U<n>" holds n UTF-32 little-endian code points per item, trailing zeros trimmed.
  const unicode = /^[<|=]?U(\d+)$/.exec(descr);
  if (unicode) {
    const points = Number.parseInt(unicode[1]!, 10);
    if (count !== 1) throw new Error("only a single unicode string is supported, not an array of them");
    if (body.length < points * 4) throw new Error("truncated .npy string");
    const view32 = new DataView(body.buffer, body.byteOffset, body.byteLength);
    let text = "";
    for (let i = 0; i < points; i += 1) {
      const code = view32.getUint32(i * 4, true);
      if (code === 0) break; // NumPy pads short strings with NUL
      text += String.fromCodePoint(code);
    }
    return { dtype: "str", shape, data: text };
  }

  const dtype = (Object.keys(DESCR) as Exclude<NpyDType, "str">[]).find((key) => DESCR[key] === descr);
  if (!dtype) {
    throw new Error(
      descr.startsWith("|O")
        ? "this .npy member is a pickled Python object; LazyLabel never unpickles (SEC-01). Convert the file first."
        : `unsupported .npy dtype ${descr}; expected a mask, an id list or a string`,
    );
  }
  if (body.length < count * ITEM_BYTES[dtype]) throw new Error("truncated .npy array");

  if (dtype === "uint8" || dtype === "bool") {
    return { dtype, shape, data: body.subarray(0, count) };
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const values = new Float64Array(count);
  for (let i = 0; i < count; i += 1) values[i] = Number(view.getBigInt64(i * 8, true));
  return { dtype, shape, data: values };
}
