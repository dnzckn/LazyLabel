/**
 * The desktop app's class-name table, read and written as data (the owner's decision, 2026-09-25).
 *
 * Every NPZ legacy LazyLabel writes stores its class names as `class_aliases`, a pickled Python
 * dict. This library now writes that member too and reads it without unpickling anything, so names
 * cross between the desktop app and the web app in both directions.
 *
 * ORACLES, both run with the desktop app's own code on 2026-09-25:
 *   - NumPy 2.2.6 reads each golden archive's member as the dict in GOLDEN_NAMES below
 *     (`np.load(path, allow_pickle=True)["class_aliases"].item()`).
 *   - Legacy FileManager._load_npz and load_npz_class_map, run with warnings as errors, read
 *     {0: "cell", 5: "細胞", 300: "three hundred", 40000: "big id"} back out of an NPZ and a class
 *     map this library wrote. tools/compare_npz.py repeats that for every golden case.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseNpz, renderNpz } from "../../src/format/npz.js";
import { parseNpzClassMap, renderNpzClassMap } from "../../src/format/npzClassMap.js";
import { encodeLegacyAliasNpy, readLegacyAliasNpy } from "../../src/format/legacyAliases.js";
import { encodeNpy, encodeNpyString } from "../../src/util/npy.js";
import { readZip, writeZip } from "../../src/util/zip.js";
import { CASE_IDS, GOLDENS_DIR, maskFromRects, syntheticContext } from "../helpers/fixtures.js";

/** What NumPy reads out of each golden archive; image.npz and image_CM.npz carry the same table. */
const GOLDEN_NAMES: Readonly<Record<string, readonly (readonly [number, string])[]>> = {
  "class-zero-and-background": [[0, "zero"], [3, "three"]],
  "crop-clears-last-row-and-column": [[2, "inside"]],
  "full-frame-box": [[0, "all"]],
  "non-ascii-aliases": [[1, "Zelle"], [5, "細胞"]],
  "overlap-pixel-priority-ascending": [[1, "a"], [4, "b"]],
  "overlap-pixel-priority-descending": [[1, "a"], [4, "b"]],
  "overlap-pixel-priority-off": [[1, "a"], [4, "b"]],
  "polygon-and-circle": [[0, "poly"], [1, "circle"]],
  "single-pixel-objects": [[9, "dot"]],
  "split-segment-two-islands": [[1, "cell"]],
  "tiny-box-huge-image": [[2, "speck"]],
  "two-classes-sparse-ids": [[3, "cat"], [7, "dog"]],
};

async function member(archive: Uint8Array, name: string): Promise<Uint8Array | undefined> {
  return (await readZip(archive)).find((entry) => entry.name === name)?.data;
}

function golden(id: string, file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(GOLDENS_DIR, id, file)));
}

// The empty table this library writes: the .npy header, then a pickle ending in
// SETITEMS APPEND TUPLE BUILD STOP, with the dict's entries just before those five bytes.
const EMPTY_TABLE = encodeLegacyAliasNpy(new Map());
const HEADER_END = 10 + (EMPTY_TABLE[8]! | (EMPTY_TABLE[9]! << 8));

function concat(...parts: ArrayLike<number>[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A pickle in the 0-d object array header, so a refusal is the pickle's and not the header's. */
function objectArray(pickle: ArrayLike<number>): Uint8Array {
  return concat(EMPTY_TABLE.subarray(0, HEADER_END), pickle);
}

/** Legacy's table with these raw dict entries in place of real ones. */
function tableWithEntries(entries: ArrayLike<number>): Uint8Array {
  return concat(EMPTY_TABLE.subarray(0, EMPTY_TABLE.length - 5), entries, EMPTY_TABLE.subarray(EMPTY_TABLE.length - 5));
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

/** BINUNICODE for a short ASCII string. */
function unicode(text: string): number[] {
  return [0x58, text.length, 0, 0, 0, ...ascii(text)];
}

/** `os.system("ls")` as a protocol-2 pickle: what executing a pickle would run. */
const RUNS_A_COMMAND = [0x80, 0x02, ...ascii("cos\nsystem\n"), ...unicode("ls"), 0x85, 0x52, 0x2e];

describe("reading the desktop app's class names", () => {
  it("reads every golden archive's names exactly as NumPy does", async () => {
    expect([...CASE_IDS].sort()).toEqual(Object.keys(GOLDEN_NAMES).sort());
    for (const id of CASE_IDS) {
      for (const file of ["image.npz", "image_CM.npz"]) {
        const table = await member(golden(id, file), "class_aliases.npy");
        expect(table, `${id}/${file} has a class_aliases member`).toBeDefined();
        expect(readLegacyAliasNpy(table!), `${id}/${file}`).toEqual(new Map(GOLDEN_NAMES[id]));
      }
    }
  });

  it("hands them to both NPZ readers, with nothing reported unreadable", async () => {
    const expected = new Map(GOLDEN_NAMES["non-ascii-aliases"]);

    const npz = await parseNpz(golden("non-ascii-aliases", "image.npz"));
    expect(npz.classAliases).toEqual(expected);
    expect(npz.unreadableAliases).toBe(false);

    const classMap = await parseNpzClassMap(golden("non-ascii-aliases", "image_CM.npz"));
    expect(classMap.classAliases).toEqual(expected);
    expect(classMap.unreadableAliases).toBe(false);
  });
});

describe("writing them the way the desktop app does", () => {
  it("round trips every integer width the writer uses, and any text", () => {
    const names = new Map<number, string>([
      [-(2 ** 31), "lowest"],
      [-1, "minus one"],
      [0, ""],
      [1, "cell"],
      [255, "細胞"],
      [256, "🐱 cat"],
      [65535, "quote ' \" \\ and\nnewline"],
      [65536, "long ".repeat(20_000)],
      [2 ** 31 - 1, "highest"],
    ]);
    expect(readLegacyAliasNpy(encodeLegacyAliasNpy(names))).toEqual(names);
  });

  it("refuses an id a 32-bit pickle integer cannot carry, rather than writing a wrong one", () => {
    expect(() => encodeLegacyAliasNpy(new Map([[2 ** 31, "too big"]]))).toThrow(RangeError);
  });

  it("writes the same bytes whatever order the names were added in, so a resave is identical", () => {
    const forwards = encodeLegacyAliasNpy(new Map([[1, "a"], [5, "b"]]));
    const backwards = encodeLegacyAliasNpy(new Map([[5, "b"], [1, "a"]]));
    expect(backwards).toEqual(forwards);
  });

  it("starts the table on a 64-byte boundary, as NumPy lays out an .npy", () => {
    expect(HEADER_END % 64).toBe(0);
  });

  it("puts the names where the desktop app reads them, in both NPZ formats", async () => {
    const names = new Map([[0, "cell"], [5, "細胞"], [300, "three hundred"], [40000, "big id"]]);
    const context = syntheticContext({
      imageSize: [4, 4],
      classOrder: [0, 5, 300, 40000],
      channelMasks: [[0, 0, 1, 1], [1, 0, 2, 1], [2, 0, 3, 1], [3, 0, 4, 1]].map((rect) =>
        maskFromRects(4, 4, [rect as [number, number, number, number]]),
      ),
      classAliases: names,
    });

    for (const [archive, parse] of [
      [(await renderNpz(context))!, parseNpz],
      [(await renderNpzClassMap(context))!, parseNpzClassMap],
    ] as const) {
      const entries = (await readZip(archive)).map((entry) => entry.name);
      expect(entries).toContain("class_aliases.npy");
      expect(entries).not.toContain("class_aliases_json.npy");
      expect(readLegacyAliasNpy((await member(archive, "class_aliases.npy"))!)).toEqual(names);
      expect((await parse(archive)).classAliases).toEqual(names);
    }
  });
});

describe("refusing any other table, without running it", () => {
  it("refuses a pickle that names any other global", () => {
    expect(readLegacyAliasNpy(objectArray(RUNS_A_COMMAND))).toBeNull();
    const evaluates = [0x80, 0x02, ...ascii("cbuiltins\neval\n"), ...unicode("1"), 0x85, 0x52, 0x2e];
    expect(readLegacyAliasNpy(objectArray(evaluates))).toBeNull();
  });

  it("refuses a global reached through STACK_GLOBAL as well", () => {
    const short = (text: string) => [0x8c, text.length, ...ascii(text)];
    const pickle = [0x80, 0x04, ...short("builtins"), ...short("eval"), 0x93, ...short("1"), 0x85, 0x52, 0x2e];
    expect(readLegacyAliasNpy(objectArray(pickle))).toBeNull();
  });

  it("refuses every opcode legacy's table never uses", () => {
    // INST, OBJ, PERSID, BINPERSID, NEWOBJ, EXT1, NEWOBJ_EX, POP, BINFLOAT, INT, LONG4, FROZENSET.
    for (const op of [0x69, 0x6f, 0x50, 0x51, 0x81, 0x82, 0x92, 0x30, 0x47, 0x49, 0x8b, 0x91]) {
      expect(readLegacyAliasNpy(objectArray([0x80, 0x02, op, 0x2e])), `opcode 0x${op.toString(16)}`).toBeNull();
    }
  });

  it("refuses an allowed global used as anything but NumPy's array reconstruction", () => {
    const dtypeAlone = [0x80, 0x02, ...ascii("cnumpy\ndtype\n"), ...unicode("O8"), 0x85, 0x52, 0x2e];
    expect(readLegacyAliasNpy(objectArray(dtypeAlone))).toBeNull();
  });

  it("refuses a table that is not ids to names", () => {
    expect(readLegacyAliasNpy(tableWithEntries([...unicode("a"), ...unicode("b")]))).toBeNull();
    expect(readLegacyAliasNpy(tableWithEntries([0x4b, 1, 0x4b, 2]))).toBeNull();
    // The helper itself builds a readable table when the entries are ids to names.
    expect(readLegacyAliasNpy(tableWithEntries([0x4b, 1, ...unicode("a")]))).toEqual(new Map([[1, "a"]]));
  });

  it("refuses a member that is not a 0-d object array", () => {
    expect(readLegacyAliasNpy(encodeNpy({ dtype: "uint8", shape: [1], data: new Uint8Array([1]) }))).toBeNull();
    expect(readLegacyAliasNpy(encodeNpyString("{}"))).toBeNull();
    expect(readLegacyAliasNpy(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("refuses a truncated table", () => {
    const table = encodeLegacyAliasNpy(new Map([[1, "a"]]));
    expect(readLegacyAliasNpy(table.subarray(0, table.length - 1))).toBeNull();
  });

  it("refuses an oversized table before walking it", () => {
    expect(readLegacyAliasNpy(objectArray(new Uint8Array((1 << 20) + 1)))).toBeNull();
  });

  it("stops a table that would never end", () => {
    expect(readLegacyAliasNpy(objectArray(new Uint8Array(250_000).fill(0x28)))).toBeNull(); // MARK x 250k
  });
});

describe("which table an archive's names come from", () => {
  const MASK = { name: "mask.npy", data: encodeNpy({ dtype: "uint8", shape: [2, 2, 1], data: new Uint8Array([1, 0, 0, 0]) }) };
  const ORDER = { name: "class_order.npy", data: encodeNpy({ dtype: "int64", shape: [1], data: Float64Array.from([4]) }) };
  const desktopTable = (names: ReadonlyMap<number, string>) => ({ name: "class_aliases.npy", data: encodeLegacyAliasNpy(names) });
  const jsonTable = (json: string) => ({ name: "class_aliases_json.npy", data: encodeNpyString(json) });
  const refusedTable = { name: "class_aliases.npy", data: objectArray(RUNS_A_COMMAND) };

  it("reads the desktop app's table", async () => {
    const loaded = await parseNpz(await writeZip([MASK, ORDER, desktopTable(new Map([[4, "desk"]]))]));
    expect(loaded.classAliases).toEqual(new Map([[4, "desk"]]));
    expect(loaded.unreadableAliases).toBe(false);
  });

  it("still reads the JSON table this library wrote before 2026-09-25", async () => {
    const loaded = await parseNpz(await writeZip([MASK, ORDER, jsonTable('{"4": "json"}')]));
    expect(loaded.classAliases).toEqual(new Map([[4, "json"]]));
    expect(loaded.unreadableAliases).toBe(false);
  });

  it("prefers the desktop app's table when an archive has both", async () => {
    const loaded = await parseNpz(
      await writeZip([MASK, ORDER, desktopTable(new Map([[4, "desk"]])), jsonTable('{"4": "json"}')]),
    );
    expect(loaded.classAliases).toEqual(new Map([[4, "desk"]]));
  });

  it("falls back to the JSON table when the desktop app's is refused", async () => {
    const loaded = await parseNpz(await writeZip([MASK, ORDER, refusedTable, jsonTable('{"4": "json"}')]));
    expect(loaded.classAliases).toEqual(new Map([[4, "json"]]));
    expect(loaded.unreadableAliases).toBe(false);
  });

  it("reports a refused table, and still loads the masks", async () => {
    const loaded = await parseNpz(await writeZip([MASK, ORDER, refusedTable]));
    expect(loaded.classAliases.size).toBe(0);
    expect(loaded.unreadableAliases).toBe(true);
    expect(loaded.segments.map((segment) => segment.classId)).toEqual([4]);
  });

  it("does not call a missing table unreadable", async () => {
    const loaded = await parseNpz(await writeZip([MASK, ORDER]));
    expect(loaded.classAliases.size).toBe(0);
    expect(loaded.unreadableAliases).toBe(false);
  });
});
