/**
 * Emit the TypeScript library's NPZ output for every fixture case, for the NumPy cross-check.
 *
 * The two NPZ formats are binary, so they are not compared byte for byte like the text formats.
 * This writes what the port produces into .differential/, and tools/compare_npz.py then loads both
 * that and the legacy golden in NumPy and compares the arrays, which is what decision 10 requires.
 *
 * Run: npx vitest run test/differential  then  python tools/compare_npz.py .differential
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { renderNpz } from "../../src/format/npz.js";
import { renderNpzClassMap } from "../../src/format/npzClassMap.js";
import { buildExportContext, CASE_IDS, PACKAGE_ROOT } from "../helpers/fixtures.js";

const OUT = join(PACKAGE_ROOT, ".differential");

describe("emit NPZ archives for the NumPy cross-check", () => {
  beforeAll(() => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
  });

  for (const id of CASE_IDS) {
    it(`writes ${id}`, async () => {
      const { context } = buildExportContext(id);

      const npz = await renderNpz(context);
      expect(npz, "every fixture has at least one class, so NPZ is always written").not.toBeNull();
      writeFileSync(join(OUT, `${id}.npz`), npz!);

      const classMap = await renderNpzClassMap(context);
      expect(classMap).not.toBeNull();
      writeFileSync(join(OUT, `${id}_CM.npz`), classMap!);
    });
  }
});
