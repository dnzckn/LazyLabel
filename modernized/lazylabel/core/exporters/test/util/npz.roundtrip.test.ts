import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderNpz, parseNpz } from "../../src/format/npz.js";
import type { ExportContext } from "../../src/types.js";

/** Build the same input as the "two-classes-sparse-ids" golden case. */
function context(): ExportContext {
  const height = 20;
  const width = 30;
  const classOrder = [3, 7];
  const data = new Uint8Array(height * width * classOrder.length);
  const set = (x: number, y: number, c: number) => {
    data[(y * width + x) * classOrder.length + c] = 1;
  };
  for (let y = 5; y < 10; y += 1) for (let x = 4; x < 14; x += 1) set(x, y, 0);
  for (let y = 12; y < 18; y += 1) for (let x = 20; x < 28; x += 1) set(x, y, 1);

  return {
    imagePath: "sample.png",
    imageSize: [height, width],
    classOrder,
    classLabels: ["cat", "dog"],
    classAliases: new Map([[3, "cat"], [7, "dog"]]),
    maskTensor: { height, width, classOrder, data },
    cropCoords: null,
    instances: [],
  };
}

describe("NPZ archive", () => {
  // RULE: "NPZ one-hot mask export and class channel order" / "NPZ import (current and legacy layouts)"
  // legacy: core/exporters/npz.py:15-30 and core/file_manager.py:224-280
  it("round trips masks, class order and aliases", async () => {
    const bytes = await renderNpz(context());
    expect(bytes).not.toBeNull();

    const loaded = await parseNpz(bytes!);
    expect(loaded.segments).toHaveLength(2);
    expect(loaded.segments.map((s) => s.classId)).toEqual([3, 7]);
    expect(loaded.classAliases.get(3)).toBe("cat");
    expect(loaded.classAliases.get(7)).toBe("dog");

    const first = loaded.segments[0]!.mask!;
    expect(first.data.reduce((sum, v) => sum + v, 0)).toBe(5 * 10);
    expect(first.data[5 * 30 + 4]).toBe(1);
    expect(first.data[4 * 30 + 4]).toBe(0);
  });

  // Written for the Python cross-check in tools/compare_npz.py, which proves NumPy reads our output.
  it("writes an archive NumPy can open", async () => {
    const bytes = await renderNpz(context());
    const dir = mkdtempSync(join(tmpdir(), "lazylabel-npz-"));
    const path = join(dir, "ts_output.npz");
    writeFileSync(path, bytes!);
    console.log(`NPZ_FOR_PYTHON=${path}`);
    expect(bytes!.length).toBeGreaterThan(100);
  });
});
