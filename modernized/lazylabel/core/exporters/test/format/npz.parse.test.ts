/**
 * NPZ import: the current layout and the two legacy ones.
 *
 * RULE-038. NPZ is first in the load priority and the only lossless format, so a reader that
 * mis-maps a channel to a class silently relabels a user's whole image. The round-trip test in
 * test/util/npz.roundtrip.test.ts covers the current layout written by this library; nothing
 * covered the legacy layouts, the class_order fallbacks, or the empty-channel skip.
 *
 * ORACLE: the LEGACY `FileManager._load_npz` and `_add_mask_stack`
 * (legacy/lazylabel/src/lazylabel/core/file_manager.py:224-280), run read-only under
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 * on an archive built with np.savez_compressed holding exactly the arrays each test builds here,
 * reporting each segment's class id, set-pixel count and inclusive pixel bounds.
 */

import { describe, expect, it } from "vitest";

import { parseNpz } from "../../src/format/npz.js";
import { encodeNpy } from "../../src/util/npy.js";
import { writeZip } from "../../src/util/zip.js";
import type { BinaryMask, LoadedAnnotations } from "../../src/types.js";
import { maskBounds } from "../helpers/fixtures.js";

const HEIGHT = 8;
const WIDTH = 10;

function pixels(mask: BinaryMask | undefined): number {
  if (!mask) return 0;
  let total = 0;
  for (const value of mask.data) if (value) total += 1;
  return total;
}

function shape(loaded: LoadedAnnotations) {
  return loaded.segments.map((segment) => [
    segment.classId,
    pixels(segment.mask),
    segment.mask ? maskBounds(segment.mask) : null,
  ]);
}

/** (8, 10, 3) channel-last: channel 0 holds a 2x2 block at the origin, channel 2 a 3x2 block. */
function oneHotTensor(): Uint8Array {
  const data = new Uint8Array(HEIGHT * WIDTH * 3);
  for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) data[(y * WIDTH + x) * 3 + 0] = 1;
  for (let y = 4; y < 6; y += 1) for (let x = 4; x < 7; x += 1) data[(y * WIDTH + x) * 3 + 2] = 1;
  return data;
}

/** (N, 8, 10) stack: plane 0 is the 2x2 block, plane 1 empty, plane 2 the 3x2 block. */
function maskStack(): Uint8Array {
  const plane = HEIGHT * WIDTH;
  const data = new Uint8Array(plane * 3);
  for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) data[0 * plane + y * WIDTH + x] = 1;
  for (let y = 4; y < 6; y += 1) for (let x = 4; x < 7; x += 1) data[2 * plane + y * WIDTH + x] = 1;
  return data;
}

function ints(name: string, values: readonly number[]) {
  return { name, data: encodeNpy({ dtype: "int64", shape: [values.length], data: Float64Array.from(values) }) };
}

describe("NPZ import: the current layout (RULE-038)", () => {
  it("maps each channel through class_order and skips an empty channel", async () => {
    // Oracle: two segments, class 0 (4 px, x 0..1 y 0..1) and class 7 (6 px, x 4..6 y 4..5).
    // class_order is [0, 3, 7] and channel 1 is empty, so class 3 contributes no segment at all.
    const archive = await writeZip([
      { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [HEIGHT, WIDTH, 3], data: oneHotTensor() }) },
      ints("class_order.npy", [0, 3, 7]),
    ]);

    expect(shape(await parseNpz(archive))).toEqual([
      [0, 4, [0, 0, 1, 1]],
      [7, 6, [4, 4, 6, 5]],
    ]);
  });

  it("falls back to the channel index when the file predates class_order", async () => {
    // Oracle: classes 0 and 2, the channel indices themselves.
    const archive = await writeZip([
      { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [HEIGHT, WIDTH, 3], data: oneHotTensor() }) },
    ]);
    expect(shape(await parseNpz(archive)).map((entry) => entry[0])).toEqual([0, 2]);
  });

  it("uses the channel index for channels past the end of a short class_order", async () => {
    // Oracle: class 5 for channel 0 (class_order[0]) and class 2 for channel 2 (its own index).
    const archive = await writeZip([
      { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [HEIGHT, WIDTH, 3], data: oneHotTensor() }) },
      ints("class_order.npy", [5]),
    ]);
    expect(shape(await parseNpz(archive)).map((entry) => entry[0])).toEqual([5, 2]);
  });

  it("reads a 2-D mask as a single channel", async () => {
    // Oracle: one class-6 segment of 6 px at x 1..3, y 1..2.
    const flat = new Uint8Array(HEIGHT * WIDTH);
    for (let y = 1; y < 3; y += 1) for (let x = 1; x < 4; x += 1) flat[y * WIDTH + x] = 1;

    const archive = await writeZip([
      { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [HEIGHT, WIDTH], data: flat }) },
      ints("class_order.npy", [6]),
    ]);
    expect(shape(await parseNpz(archive))).toEqual([[6, 6, [1, 1, 3, 2]]]);
  });
});

describe("NPZ import: the legacy layouts (RULE-038)", () => {
  it("reads a masks key that holds the same (H, W, C) tensor", async () => {
    // Oracle: identical to the current layout - classes 0 and 7.
    const archive = await writeZip([
      { name: "masks.npy", data: encodeNpy({ dtype: "uint8", shape: [HEIGHT, WIDTH, 3], data: oneHotTensor() }) },
      ints("class_order.npy", [0, 3, 7]),
    ]);
    expect(shape(await parseNpz(archive))).toEqual([
      [0, 4, [0, 0, 1, 1]],
      [7, 6, [4, 4, 6, 5]],
    ]);
  });

  it("reads an (N, H, W) stack paired with class_ids, one segment per non-empty plane", async () => {
    // Oracle: class 4 (4 px) and class 6 (6 px); plane 1 is empty so class 9 never appears.
    const archive = await writeZip([
      { name: "masks.npy", data: encodeNpy({ dtype: "bool", shape: [3, HEIGHT, WIDTH], data: maskStack() }) },
      ints("class_ids.npy", [4, 9, 6]),
    ]);
    expect(shape(await parseNpz(archive))).toEqual([
      [4, 4, [0, 0, 1, 1]],
      [6, 6, [4, 4, 6, 5]],
    ]);
  });

  it("gives a stack plane with no matching class id the class 0", async () => {
    // Oracle: class 4 then class 0 (`int(class_ids[i]) if i < len(class_ids) else 0`).
    const plane = HEIGHT * WIDTH;
    const stack = new Uint8Array(plane * 2);
    for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) stack[y * WIDTH + x] = 1;
    for (let y = 3; y < 5; y += 1) for (let x = 3; x < 5; x += 1) stack[plane + y * WIDTH + x] = 1;

    const archive = await writeZip([
      { name: "masks.npy", data: encodeNpy({ dtype: "bool", shape: [2, HEIGHT, WIDTH], data: stack }) },
      ints("class_ids.npy", [4]),
    ]);
    expect(shape(await parseNpz(archive))).toEqual([
      [4, 4, [0, 0, 1, 1]],
      [0, 4, [3, 3, 4, 4]],
    ]);
  });

  it("prefers a mask key over a masks key when both are present", async () => {
    // The legacy stack branch is guarded by `"mask" not in data` (file_manager.py:234).
    const flat = new Uint8Array(HEIGHT * WIDTH);
    flat[0] = 1;
    const archive = await writeZip([
      { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [HEIGHT, WIDTH], data: flat }) },
      { name: "masks.npy", data: encodeNpy({ dtype: "bool", shape: [3, HEIGHT, WIDTH], data: maskStack() }) },
      ints("class_ids.npy", [4, 9, 6]),
      ints("class_order.npy", [8]),
    ]);
    expect(shape(await parseNpz(archive))).toEqual([[8, 1, [0, 0, 0, 0]]]);
  });
});

describe("NPZ import: an archive with nothing to load (RULE-038, RULE-078)", () => {
  it("returns no segments, and does not raise, for an archive with neither mask nor masks", async () => {
    // Legacy returns at file_manager.py:241-242 without raising, so this is EMPTY rather than
    // FAILED: the file still wins the chain and no lower-priority sidecar is consulted.
    const archive = await writeZip([ints("class_order.npy", [1, 2, 3])]);
    const loaded = await parseNpz(archive);
    expect(loaded.segments).toHaveLength(0);
    expect(loaded.rejected).toBe(0);
  });

  it("never checks the mask size against the image, so a mismatched file still loads", async () => {
    // Oracle: the legacy loader takes no image size at all; the mismatch only surfaces later, as a
    // save failure. parseNpz has the same signature for the same reason.
    const archive = await writeZip([
      { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [HEIGHT, WIDTH, 3], data: oneHotTensor() }) },
      ints("class_order.npy", [0, 3, 7]),
    ]);
    const loaded = await parseNpz(archive);
    expect(loaded.segments[0]?.mask?.height).toBe(HEIGHT);
    expect(loaded.segments[0]?.mask?.width).toBe(WIDTH);
  });
});
