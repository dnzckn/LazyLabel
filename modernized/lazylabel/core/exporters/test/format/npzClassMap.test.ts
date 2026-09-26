/**
 * NPZ Class Map: the clauses the golden comparison cannot reach, and the whole reader.
 *
 * RULE-003. The 12 golden cases prove class_map, foreground and class_order array for array
 * against the legacy archives, but no fixture uses a class id near the 16-bit ceiling, and nothing
 * exercised the reader - where a missing foreground member silently deletes every class-0 label.
 *
 * ORACLE for the writer expectations: the LEGACY `NpzClassMapExporter.export`
 * (legacy/lazylabel/src/lazylabel/core/exporters/npz_class_map.py:20-73), run read-only under
 *   PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe
 * with the context each test names, recording whether a file was written and any exception.
 *
 * ORACLE for the reader expectations: the LEGACY `FileManager.load_npz_class_map`
 * (legacy/lazylabel/src/lazylabel/core/file_manager.py:282-333) run the same way over an archive
 * np.savez_compressed built from the same arrays.
 */

import { describe, expect, it } from "vitest";

import { parseNpzClassMap, renderNpzClassMap } from "../../src/format/npzClassMap.js";
import { encodeNpy } from "../../src/util/npy.js";
import { readZip, writeZip } from "../../src/util/zip.js";
import type { BinaryMask, LoadedAnnotations } from "../../src/types.js";
import { emptyMask, maskBounds, maskFromRects, syntheticContext } from "../helpers/fixtures.js";

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

/**
 * A uint16 .npy member, which the general encoder deliberately does not carry: only the dtypes
 * LazyLabel stores are supported there, and this one is built only to feed the reader.
 */
function encodeUint16(values: Uint16Array, height: number, width: number): Uint8Array {
  const header = `{'descr': '<u2', 'fortran_order': False, 'shape': (${height}, ${width}), }`;
  const padding = 64 - ((10 + header.length + 1) % 64);
  const padded = header + " ".repeat(padding === 64 ? 0 : padding) + "\n";
  const out = new Uint8Array(10 + padded.length + values.length * 2);
  out.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0], 0);
  const view = new DataView(out.buffer);
  view.setUint16(8, padded.length, true);
  out.set(new TextEncoder().encode(padded), 10);
  for (let i = 0; i < values.length; i += 1) view.setUint16(10 + padded.length + i * 2, values[i]!, true);
  return out;
}

/** A 4x5 class map: one class-3 pixel at (1,1), and one class-0 pixel at (2,2) in foreground. */
function classMapArchive(options: { withForeground: boolean }): Promise<Uint8Array> {
  const values = new Uint16Array(4 * 5);
  values[1 * 5 + 1] = 3;
  const foreground = new Uint8Array(4 * 5);
  foreground[1 * 5 + 1] = 1;
  foreground[2 * 5 + 2] = 1;

  const members = [{ name: "class_map.npy", data: encodeUint16(values, 4, 5) }];
  if (options.withForeground) {
    members.push({ name: "foreground.npy", data: encodeNpy({ dtype: "bool", shape: [4, 5], data: foreground }) });
  }
  return writeZip(members);
}

describe("class map export (RULE-003)", () => {
  it("refuses a class id past the 16-bit ceiling instead of wrapping it", async () => {
    // Oracle: np.array(class_order, dtype=np.uint16) at npz_class_map.py:71 raises
    // "OverflowError: Python integer 65536 out of bounds for uint16" under numpy 2.2.6, and
    // nothing in export_all catches it. Wrapping to class 0 would silently relabel the image.
    const mask = maskFromRects(4, 4, [[0, 0, 1, 1]]);
    await expect(
      renderNpzClassMap(syntheticContext({ imageSize: [4, 4], classOrder: [65536], channelMasks: [mask] })),
    ).rejects.toBeInstanceOf(RangeError);

    // Oracle: a negative id fails the same way ("Python integer -1 out of bounds for uint16").
    await expect(
      renderNpzClassMap(syntheticContext({ imageSize: [4, 4], classOrder: [-1], channelMasks: [mask] })),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("accepts the highest id uint16 can hold", async () => {
    // Oracle: class id 65535 writes a file normally.
    const mask = maskFromRects(4, 4, [[0, 0, 1, 1]]);
    const archive = await renderNpzClassMap(
      syntheticContext({ imageSize: [4, 4], classOrder: [65535], channelMasks: [mask] }),
    );
    expect(archive).not.toBeNull();
    expect((await readZip(archive!)).map((entry) => entry.name).sort()).toEqual([
      "class_aliases.npy",
      "class_map.npy",
      "class_order.npy",
      "foreground.npy",
    ]);
  });

  it("writes nothing when no pixel carries a class, and nothing for a zero-channel tensor", async () => {
    // Oracle: both guards return None (npz_class_map.py:21-26). Returning null means "write
    // nothing"; it must never be read as "delete the existing file".
    const blank = syntheticContext({ imageSize: [4, 4], classOrder: [1, 4] });
    expect(await renderNpzClassMap(blank)).toBeNull();
    expect(await renderNpzClassMap(syntheticContext({ imageSize: [4, 4], classOrder: [] }))).toBeNull();
  });

  it("always writes the foreground member, because class 0 is a real class", async () => {
    const archive = await renderNpzClassMap(
      syntheticContext({
        imageSize: [4, 4],
        classOrder: [0, 3],
        channelMasks: [maskFromRects(4, 4, [[0, 0, 2, 2]]), maskFromRects(4, 4, [[3, 3, 4, 4]])],
      }),
    );
    expect((await readZip(archive!)).map((entry) => entry.name)).toContain("foreground.npy");
  });
});

describe("class map import (RULE-003)", () => {
  it("uses foreground to tell a class-0 label from background, ids ascending", async () => {
    // Oracle: two segments, class 0 (1 px at (2,2)) then class 3 (1 px at (1,1)) - np.unique
    // returns ascending ids, so a class-0 pixel comes back FIRST despite being second in the map.
    const loaded = await parseNpzClassMap(await classMapArchive({ withForeground: true }), [4, 5]);
    expect(shape(loaded)).toEqual([
      [0, 1, [2, 2, 2, 2]],
      [3, 1, [1, 1, 1, 1]],
    ]);
  });

  it("loses every class-0 label when the file predates the foreground member", async () => {
    // Oracle: the class-3 segment alone. `class_map != 0` is the fallback at file_manager.py:303-307,
    // which is exactly why the writer must never stop emitting foreground.
    const loaded = await parseNpzClassMap(await classMapArchive({ withForeground: false }), [4, 5]);
    expect(shape(loaded)).toEqual([[3, 1, [1, 1, 1, 1]]]);
  });

  it("refuses a class map whose shape does not match the image", async () => {
    // Legacy logs the mismatch and returns with nothing loaded, which ENDS the load chain and
    // leaves an empty canvas (file_manager.py:313-318). Decision 15c makes it a reported failure.
    await expect(parseNpzClassMap(await classMapArchive({ withForeground: true }), [9, 9])).rejects.toThrow(
      /does not match|refusing/i,
    );
  });

  it("refuses an archive with no class_map member", async () => {
    // Legacy logs "No class_map in ..." and returns (file_manager.py:298-300).
    const archive = await writeZip([
      { name: "foreground.npy", data: encodeNpy({ dtype: "bool", shape: [2, 2], data: new Uint8Array(4) }) },
    ]);
    await expect(parseNpzClassMap(archive, [2, 2])).rejects.toThrow(/class_map/);
  });

  it("returns one segment per distinct id, in ascending id order", async () => {
    // Oracle: ids 7, 2 and 5 laid out left to right in row 0 come back as 2, 5, 7 - the segment
    // order is np.unique's, not the pixel order.
    const values = new Uint16Array(4 * 5);
    values[0] = 7;
    values[1] = 2;
    values[2] = 5;
    const foreground = Uint8Array.from(values, (value) => (value !== 0 ? 1 : 0));

    const archive = await writeZip([
      { name: "class_map.npy", data: encodeUint16(values, 4, 5) },
      { name: "foreground.npy", data: encodeNpy({ dtype: "bool", shape: [4, 5], data: foreground }) },
    ]);
    expect(shape(await parseNpzClassMap(archive, [4, 5]))).toEqual([
      [2, 1, [1, 0, 1, 0]],
      [5, 1, [2, 0, 2, 0]],
      [7, 1, [0, 0, 0, 0]],
    ]);
  });

  it("round trips a class-0 annotation through the writer and the reader", async () => {
    // The whole reason foreground exists: class 0 must survive the round trip.
    const context = syntheticContext({
      imageSize: [4, 4],
      classOrder: [0, 3],
      channelMasks: [maskFromRects(4, 4, [[0, 0, 2, 2]]), maskFromRects(4, 4, [[3, 3, 4, 4]])],
    });
    const archive = await renderNpzClassMap(context);
    expect(shape(await parseNpzClassMap(archive!, [4, 4]))).toEqual([
      [0, 4, [0, 0, 1, 1]],
      [3, 1, [3, 3, 3, 3]],
    ]);
  });

  it("hands an overlapped pixel to the first channel of the class order", async () => {
    // Oracle: argmax returns the first maximum (npz_class_map.py:64-73), so with the ascending
    // class order every in-library builder produces, the LOWEST class wins the overlap.
    const overlap = maskFromRects(4, 4, [[1, 1, 3, 3]]);
    const context = syntheticContext({
      imageSize: [4, 4],
      classOrder: [2, 7],
      channelMasks: [overlap, overlap],
    });
    const archive = await renderNpzClassMap(context);
    expect(shape(await parseNpzClassMap(archive!, [4, 4]))).toEqual([[2, 4, [1, 1, 2, 2]]]);
  });

  it("refuses a context whose class order is not ascending, where the first channel would not be the lowest class", async () => {
    // Not a legacy behavior: legacy would silently hand the overlap to class 7. Callers inside
    // this library always sort, so a descending order means the context was built by hand and the
    // overlap rule would be wrong (src/format/npzClassMap.ts:36-40).
    const mask = maskFromRects(4, 4, [[0, 0, 2, 2]]);
    await expect(
      renderNpzClassMap(
        syntheticContext({ imageSize: [4, 4], classOrder: [7, 2], channelMasks: [mask, emptyMask(4, 4)] }),
      ),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
