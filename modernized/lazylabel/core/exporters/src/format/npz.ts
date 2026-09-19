/**
 * NPZ: the one-hot mask tensor, first in the load priority and the only lossless format.
 *
 * Writer ported from legacy/lazylabel/src/lazylabel/core/exporters/npz.py:15-30.
 * Reader ported from FileManager._load_npz (file_manager.py:224-280) and _add_mask_stack (:268-280).
 *
 * One deliberate deviation, approved as decision 4: the legacy writer stores `class_aliases` as a
 * pickled Python dict, so loading one executes arbitrary code (SEC-01). Here the aliases travel as
 * JSON inside a NumPy unicode scalar, and a pickled member is refused rather than unpickled.
 *
 * The JSON lives under the name `class_aliases_json`, NOT `class_aliases`, and that detail is
 * load-bearing. Legacy's _restore_aliases (file_manager.py:335-343) calls `.item()` on the member
 * inside a try and then `.items()` on the result OUTSIDE it; for a unicode scalar `.item()` returns
 * a str, so `.items()` raises and the whole legacy load fails with zero segments. Under the new
 * name legacy takes its `if "class_aliases" not in data: return` early exit and reads the masks
 * normally, losing only the alias names. Both names are accepted on read.
 */

import { ALIAS_MEMBER, readAliasMember } from "./aliases.js";
import { decodeNpy, encodeNpy, encodeNpyString } from "../util/npy.js";
import { readZip, writeZip } from "../util/zip.js";
import type { BinaryMask, ExportContext, LoadedAnnotations, Segment , RenderOptions } from "../types.js";

/** Render the archive, or null where the legacy exporter writes no file (an empty tensor). */
export async function renderNpz(ctx: ExportContext, options?: RenderOptions): Promise<Uint8Array | null> {
  assertConsistent(ctx);
  const { height, width, data } = ctx.maskTensor;
  const channels = ctx.classOrder.length;
  // An empty archive is the same three members with no classes: mask is (H, W, 0), class_order
  // is empty, and the alias table is "{}". It reads back through parseNpz as zero segments.
  if (height * width * channels === 0 && options?.writeEmpty !== true) return null;

  const aliases = Object.fromEntries([...ctx.classAliases].map(([id, name]) => [String(id), name]));
  return writeZip([
    { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [height, width, channels], data }) },
    {
      name: "class_order.npy",
      data: encodeNpy({ dtype: "int64", shape: [channels], data: Float64Array.from(ctx.classOrder) }),
    },
    { name: `${ALIAS_MEMBER}.npy`, data: encodeNpyString(JSON.stringify(aliases)) },
  ]);
}

/**
 * Parse an NPZ into segments, one per non-empty channel.
 *
 * Three layouts are accepted, as the legacy loader accepts them: the current `mask` (H, W, C)
 * tensor, a legacy `masks` key holding the same, and a legacy `masks` (N, H, W) stack paired with
 * `class_ids`. A channel maps to a class id through `class_order` when present; without it the
 * channel index is the id, which is only correct for files written before that key existed.
 */
export async function parseNpz(bytes: Uint8Array): Promise<LoadedAnnotations> {
  const members = new Map<string, Uint8Array>();
  for (const entry of await readZip(bytes)) {
    members.set(entry.name.replace(/\.npy$/, ""), entry.data);
  }

  const { aliases: classAliases, unreadable } = readAliasMember(members);
  const segments: Segment[] = [];

  if (members.has("masks") && members.has("class_ids") && !members.has("mask")) {
    const stack = decodeNpy(members.get("masks")!);
    const ids = decodeNpy(members.get("class_ids")!);
    const [count = 0, height = 0, width = 0] = stack.shape;
    const pixels = height * width;
    for (let i = 0; i < count; i += 1) {
      const plane = (stack.data as Uint8Array).subarray(i * pixels, (i + 1) * pixels);
      if (!plane.some((v) => v !== 0)) continue;
      segments.push(loadedSegment(toMask(plane, height, width), idAt(ids.data, i)));
    }
    return { segments, classAliases, rejected: 0, unreadableAliases: unreadable };
  }

  const maskKey = members.has("mask") ? "mask" : members.has("masks") ? "masks" : null;
  if (!maskKey) return { segments, classAliases, rejected: 0, unreadableAliases: unreadable };

  const mask = decodeNpy(members.get(maskKey)!);
  const [height = 0, width = 0, channels = 1] = mask.shape; // a 2-D mask is one channel
  const classOrder = members.has("class_order")
    ? Array.from(decodeNpy(members.get("class_order")!).data as Float64Array, Number)
    : null;

  const data = mask.data as Uint8Array;
  for (let channel = 0; channel < channels; channel += 1) {
    const plane = new Uint8Array(height * width);
    let any = false;
    for (let pixel = 0; pixel < height * width; pixel += 1) {
      const value = mask.shape.length === 2 ? data[pixel]! : data[pixel * channels + channel]!;
      if (value) {
        plane[pixel] = 1;
        any = true;
      }
    }
    if (!any) continue;
    const classId = classOrder && channel < classOrder.length ? classOrder[channel]! : channel;
    segments.push(loadedSegment(toMask(plane, height, width), classId));
  }
  return { segments, classAliases, rejected: 0, unreadableAliases: unreadable };
}

function idAt(data: Uint8Array | Float64Array | string, index: number): number {
  if (typeof data === "string") return 0;
  const value = data[index];
  return value === undefined ? 0 : Number(value);
}

function toMask(data: Uint8Array, height: number, width: number): BinaryMask {
  return { height, width, data };
}

function loadedSegment(mask: BinaryMask, classId: number): Segment {
  return { type: "Loaded", classId, mask };
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
