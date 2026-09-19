/**
 * NPZ Class Map: one class id per pixel, plus a foreground mask so class 0 survives a round trip.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:20-73.
 * Reader ported from FileManager.load_npz_class_map (file_manager.py:282-333).
 *
 * Implements the rule card "NPZ Class Map export resolves overlaps to lowest class and stores
 * foreground". Two traps the rule review confirmed against the code:
 *   - "lowest class wins an overlap" is really "the FIRST channel wins", which only coincides with
 *     lowest because callers pass a sorted classOrder.
 *   - ids are stored as 16-bit, so an id above 65535 cannot be represented; the legacy writer
 *     raises rather than wrapping, and so does this one.
 */

import { ALIAS_MEMBER, readAliasMember } from "./aliases.js";
import { assertPixels } from "../limits.js";
import { decodeNpy, encodeNpy, encodeNpyString } from "../util/npy.js";
import { readZip, writeZip } from "../util/zip.js";
import type { ExportContext, LoadedAnnotations, Segment , RenderOptions } from "../types.js";

const MAX_CLASS_ID = 0xffff;

/** Render the archive, or null when the tensor is empty or no pixel carries a class. */
export async function renderNpzClassMap(ctx: ExportContext, options?: RenderOptions): Promise<Uint8Array | null> {
  assertConsistent(ctx);
  const { height, width, data } = ctx.maskTensor;
  const channels = ctx.classOrder.length;
  if (height * width * channels === 0 && options?.writeEmpty !== true) return null;

  // "The first channel wins an overlap" only equals "the lowest class wins" while the order is
  // ascending, which every in-library builder guarantees and a hand-built context might not.
  for (let i = 1; i < ctx.classOrder.length; i += 1) {
    if (ctx.classOrder[i]! <= ctx.classOrder[i - 1]!) {
      throw new RangeError("a class map needs an ascending class order, or overlaps resolve wrongly");
    }
  }

  for (const id of ctx.classOrder) {
    if (id < 0 || id > MAX_CLASS_ID) {
      throw new RangeError(`class id ${id} does not fit the 16-bit class map; legacy raises here too`);
    }
  }

  const pixels = height * width;
  const classMap = new Uint8Array(pixels * 2); // uint16, little-endian
  const classView = new DataView(classMap.buffer);
  const foreground = new Uint8Array(pixels);
  let anyActive = false;

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const base = pixel * channels;
    for (let channel = 0; channel < channels; channel += 1) {
      if (!data[base + channel]) continue;
      classView.setUint16(pixel * 2, ctx.classOrder[channel]!, true); // first channel wins
      foreground[pixel] = 1;
      anyActive = true;
      break;
    }
  }
  if (!anyActive && options?.writeEmpty !== true) return null;

  const aliases = Object.fromEntries([...ctx.classAliases].map(([id, name]) => [String(id), name]));
  return writeZip([
    { name: "class_map.npy", data: encodeUint16(classMap, height, width) },
    { name: "foreground.npy", data: encodeNpy({ dtype: "bool", shape: [height, width], data: foreground }) },
    {
      name: "class_order.npy",
      data: encodeNpy({ dtype: "int64", shape: [channels], data: Float64Array.from(ctx.classOrder) }),
    },
    { name: `${ALIAS_MEMBER}.npy`, data: encodeNpyString(JSON.stringify(aliases)) },
  ]);
}

/**
 * Parse a class map into one segment per distinct class id present.
 *
 * Without a `foreground` member, a pixel of 0 is treated as background, which silently drops every
 * class-0 annotation in files written before that member existed. A class map whose shape does not
 * match the image is rejected, and the caller must surface that rather than show an empty canvas
 * (decision 15c).
 */
export async function parseNpzClassMap(
  bytes: Uint8Array,
  imageSize?: readonly [number, number],
): Promise<LoadedAnnotations> {
  const members = new Map<string, Uint8Array>();
  for (const entry of await readZip(bytes)) members.set(entry.name.replace(/\.npy$/, ""), entry.data);

  const raw = members.get("class_map");
  if (!raw) throw new Error("not a LazyLabel class map: no class_map member");
  const { height, width, values } = decodeUint16(raw);

  if (imageSize && (height !== imageSize[0] || width !== imageSize[1])) {
    throw new Error(
      `class map is ${height}x${width} but the image is ${imageSize[0]}x${imageSize[1]}; refusing to load`,
    );
  }

  const foregroundMember = members.get("foreground");
  const foreground = foregroundMember
    ? (decodeNpy(foregroundMember).data as Uint8Array)
    : Uint8Array.from(values, (value) => (value !== 0 ? 1 : 0));

  const byClass = new Map<number, Uint8Array>();
  for (let pixel = 0; pixel < height * width; pixel += 1) {
    if (!foreground[pixel]) continue;
    const classId = values[pixel]!;
    let mask = byClass.get(classId);
    if (!mask) {
      mask = new Uint8Array(height * width);
      byClass.set(classId, mask);
    }
    mask[pixel] = 1;
  }

  const segments: Segment[] = [...byClass.entries()]
    .sort(([a], [b]) => a - b) // np.unique returns ascending ids
    .map(([classId, mask]) => ({ type: "Loaded" as const, classId, mask: { height, width, data: mask } }));

  return { segments, classAliases: readAliasMember(members), rejected: 0 };
}

function encodeUint16(data: Uint8Array, height: number, width: number): Uint8Array {
  // NumPy dtype "<u2" is not in the general encoder, which only carries the dtypes LazyLabel stores.
  const header = `{'descr': '<u2', 'fortran_order': False, 'shape': (${height}, ${width}), }`;
  const preamble = 10;
  const padding = 64 - ((preamble + header.length + 1) % 64);
  const padded = header + " ".repeat(padding === 64 ? 0 : padding) + "\n";
  const out = new Uint8Array(preamble + padded.length + data.length);
  out.set(new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]), 0);
  new DataView(out.buffer).setUint16(8, padded.length, true);
  out.set(new TextEncoder().encode(padded), 10);
  out.set(data, preamble + padded.length);
  return out;
}

function decodeUint16(bytes: Uint8Array): { height: number; width: number; values: Uint16Array } {
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(8, true);
  const header = new TextDecoder().decode(bytes.subarray(10, 10 + headerLength));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  if (descr !== "<u2" && descr !== "|u2" && descr !== "=u2") {
    throw new Error(`class_map has dtype ${descr}, expected 16-bit unsigned`);
  }
  const shape = (/'shape':\s*\(([^)]*)\)/.exec(header)?.[1] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);
  const [height = 0, width = 0] = shape;
  assertPixels(height, width);
  const body = bytes.subarray(10 + headerLength);
  if (body.length < height * width * 2) throw new Error("truncated class_map array");
  const values = new Uint16Array(height * width);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  for (let i = 0; i < values.length; i += 1) values[i] = view.getUint16(i * 2, true);
  return { height, width, values };
}

/**
 * Refuse a context that contradicts itself.
 *
 * ExportContext carries the class order twice, once at the top level and once inside the mask
 * tensor, and the two are assembled by hand in the web app and in the API. When they disagree the
 * mask is written with the wrong channel count and silently misattributed to the wrong classes.
 */
function assertConsistent(ctx: ExportContext): void {
  const tensorOrder = ctx.maskTensor.classOrder;
  const sameOrder =
    tensorOrder.length === ctx.classOrder.length &&
    tensorOrder.every((id, index) => id === ctx.classOrder[index]);
  if (!sameOrder) {
    throw new RangeError(
      `the context's class order [${ctx.classOrder.join(", ")}] does not match the mask tensor's ` +
        `[${tensorOrder.join(", ")}]`,
    );
  }
  const expected = ctx.maskTensor.height * ctx.maskTensor.width * tensorOrder.length;
  if (ctx.maskTensor.data.length !== expected) {
    throw new RangeError(
      `the mask tensor says ${ctx.maskTensor.height}x${ctx.maskTensor.width}x${tensorOrder.length} ` +
        `(${expected} values) but carries ${ctx.maskTensor.data.length}`,
    );
  }
}
