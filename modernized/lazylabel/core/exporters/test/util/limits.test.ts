/**
 * Input limits, which Phase 1 exit criterion 5 requires and section 2 of the brief makes the
 * default posture. Before these existed, a 204-byte archive declaring a 30000x30000 class map
 * allocated 1.8 GB before failing on a bounds error.
 */

import { describe, expect, it } from "vitest";

import { parseNpz, parseNpzClassMap } from "../../src/index.js";
import { AnnotationTooLargeError, DEFAULT_LIMITS } from "../../src/limits.js";
import { encodeNpy, encodeNpyString } from "../../src/util/npy.js";
import { readZip, writeZip } from "../../src/util/zip.js";

/** A .npy header that claims a huge array while carrying almost no data. */
function lyingHeader(descr: string, shape: string): Uint8Array {
  const header = `{'descr': '${descr}', 'fortran_order': False, 'shape': (${shape}), }`;
  const padded = header + " ".repeat(64 - ((10 + header.length + 1) % 64)) + "\n";
  const out = new Uint8Array(10 + padded.length + 8);
  out.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0], 0);
  new DataView(out.buffer).setUint16(8, padded.length, true);
  out.set(new TextEncoder().encode(padded), 10);
  return out;
}

describe("input limits", () => {
  it("refuses a class map far larger than the pixel cap", async () => {
    const archive = await writeZip([
      { name: "class_map.npy", data: lyingHeader("<u2", "30000, 30000") },
      { name: "class_aliases_json.npy", data: encodeNpyString("{}") },
    ]);
    await expect(parseNpzClassMap(archive)).rejects.toBeInstanceOf(AnnotationTooLargeError);
  });

  it("refuses a mask array that declares more elements than the limits allow", async () => {
    const archive = await writeZip([{ name: "mask.npy", data: lyingHeader("|u1", "100000, 100000, 64") }]);
    await expect(parseNpz(archive)).rejects.toBeInstanceOf(AnnotationTooLargeError);
  });

  it("refuses a truncated array rather than reading neighbouring bytes", async () => {
    // Declares 4096 uint8 values but carries none.
    const archive = await writeZip([{ name: "mask.npy", data: lyingHeader("|u1", "64, 64, 1") }]);
    await expect(parseNpz(archive)).rejects.toThrow(/truncated/i);
  });

  it("refuses an archive with absurdly many members", async () => {
    const members = Array.from({ length: DEFAULT_LIMITS.maxArchiveMembers + 1 }, (_, i) => ({
      name: `member${i}.npy`,
      data: encodeNpy({ dtype: "uint8", shape: [1], data: new Uint8Array([1]) }),
    }));
    const archive = await writeZip(members);
    await expect(readZip(archive)).rejects.toBeInstanceOf(AnnotationTooLargeError);
  });

  it("refuses an archive that decompresses past the total cap", async () => {
    // A zip bomb is caught by the absolute total, not by a compression ratio: a real annotation
    // mask is mostly zeros and legitimately compresses about 1027 to 1.
    const archive = await writeZip([{ name: "mask.npy", data: new Uint8Array(4_000_000) }]);
    await expect(
      readZip(archive, { ...DEFAULT_LIMITS, maxUncompressedBytes: 1_000_000 }),
    ).rejects.toBeInstanceOf(AnnotationTooLargeError);
  });

  it("accepts the highly compressible masks real annotations produce", async () => {
    // 4 MB of zeros compresses about 1000 to 1; this must not look like an attack.
    const archive = await writeZip([{ name: "mask.npy", data: new Uint8Array(4_000_000) }]);
    const entries = await readZip(archive);
    expect(entries[0]?.data.length).toBe(4_000_000);
  });

  it("still reads a real archive well inside the limits", async () => {
    const archive = await writeZip([
      { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [2, 2, 1], data: new Uint8Array([1, 0, 0, 1]) }) },
      { name: "class_order.npy", data: encodeNpy({ dtype: "int64", shape: [1], data: Float64Array.from([7]) }) },
    ]);
    const loaded = await parseNpz(archive);
    expect(loaded.segments).toHaveLength(1);
    expect(loaded.segments[0]?.classId).toBe(7);
  });
});
