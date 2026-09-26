/**
 * The binary formats, gated by the normal test run.
 *
 * tools/compare_npz.py is the independent check: it opens both archives in NumPy and also proves the
 * legacy desktop app still reads what this library writes. It needs Python and the legacy package,
 * so it cannot run on a plain CI machine, which left NPZ, the highest-priority and only lossless
 * format, with no automated gate at all.
 *
 * This reads the legacy golden archives with the library's own reader and compares them member by
 * member against what the library writes for the same input. It needs nothing but Node.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readLegacyAliasNpy } from "../../src/format/legacyAliases.js";
import { renderNpz } from "../../src/format/npz.js";
import { renderNpzClassMap } from "../../src/format/npzClassMap.js";
import { decodeNpy } from "../../src/util/npy.js";
import { readZip } from "../../src/util/zip.js";
import { buildExportContext, CASE_IDS, GOLDENS_DIR } from "../helpers/fixtures.js";

async function members(archive: Uint8Array): Promise<Map<string, ReturnType<typeof decodeNpy>>> {
  const out = new Map<string, ReturnType<typeof decodeNpy>>();
  for (const entry of await readZip(archive)) {
    const name = entry.name.replace(/\.npy$/, "");
    // The class-name table is a pickled object array, not a numeric one; the tests below compare it
    // by the names it carries, since NumPy pickles it as protocol 4 and this library as protocol 2.
    if (name === "class_aliases") continue;
    out.set(name, decodeNpy(entry.data));
  }
  return out;
}

function golden(id: string, file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(GOLDENS_DIR, id, file)));
}

/**
 * Compare two arrays element by element, reporting the first difference.
 *
 * Never convert these to plain arrays: the largest fixture mask holds 67 million values, and
 * Array.from on it exhausts the heap. That is the same dense-mask cost the notes record as a
 * follow-up for Phase 4.
 */
function expectSameValues(actual: ArrayLike<number>, expected: ArrayLike<number>, what: string): void {
  expect(actual.length, `${what} length`).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      expect.fail(`${what} differs at index ${i}: ${String(actual[i])} instead of ${String(expected[i])}`);
    }
  }
}

describe("NPZ archives match the legacy arrays", () => {
  for (const id of CASE_IDS) {
    it(`one-hot tensor for ${id}`, async () => {
      const { context } = buildExportContext(id);
      const produced = await renderNpz(context);
      expect(produced).not.toBeNull();

      const ours = await members(produced!);
      const theirs = await members(golden(id, "image.npz"));

      expect([...theirs.keys()].sort()).toEqual(["class_order", "mask"]);
      for (const [name, expected] of theirs) {
        const actual = ours.get(name);
        expect(actual, `member ${name}`).toBeDefined();
        expect(actual!.shape, `${name} shape`).toEqual(expected.shape);
        expect(actual!.dtype, `${name} dtype`).toBe(expected.dtype);
        expectSameValues(actual!.data as ArrayLike<number>, expected.data as ArrayLike<number>, name);
      }
    });

    it(`class map for ${id}`, async () => {
      const { context } = buildExportContext(id);
      const produced = await renderNpzClassMap(context);
      expect(produced).not.toBeNull();

      // class_map is 16-bit, which the general decoder does not carry, so compare it as raw bytes.
      const ourEntries = new Map((await readZip(produced!)).map((e) => [e.name, e.data]));
      const theirEntries = new Map((await readZip(golden(id, "image_CM.npz"))).map((e) => [e.name, e.data]));

      for (const name of ["class_map.npy", "foreground.npy", "class_order.npy"]) {
        expect(ourEntries.has(name), `member ${name}`).toBe(true);
        expectSameValues(ourEntries.get(name)!, theirEntries.get(name)!, name);
      }
    });
  }

  for (const id of CASE_IDS) {
    it(`class names for ${id}, in both archives`, async () => {
      const { context } = buildExportContext(id);
      for (const [produced, file] of [
        [(await renderNpz(context))!, "image.npz"],
        [(await renderNpzClassMap(context))!, "image_CM.npz"],
      ] as const) {
        const ours = (await readZip(produced)).find((entry) => entry.name === "class_aliases.npy");
        const theirs = (await readZip(golden(id, file))).find((entry) => entry.name === "class_aliases.npy");
        expect(ours, `${file} carries the desktop app's class_aliases member`).toBeDefined();
        const names = readLegacyAliasNpy(ours!.data);
        expect(names).not.toBeNull();
        expect(names, file).toEqual(readLegacyAliasNpy(theirs!.data));
      }
    });
  }
});
