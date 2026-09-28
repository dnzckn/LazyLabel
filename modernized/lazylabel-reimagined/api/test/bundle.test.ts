/**
 * The AI bundle's parts: DEPLOYABILITY.md R12.
 *
 * `bundle.ts` decides from what is on disk, and these hold its decisions. The unpacking itself runs
 * the bundle's own Python, and `scripts/release-smoke.mjs --ai` proves it on every build the way a
 * person meets it: part 1 unzipped, the other parts left beside it, and the launcher started.
 */

import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  findParts,
  missingParts,
  missingPartsReason,
  partFolders,
  partMark,
  readBundle,
  unpackCommand,
  type Bundle,
} from "../src/bundle.js";

const NAME = "LazyLabel-web-ai-windows-x64";
const PARTS = [`${NAME}-1of3.zip`, `${NAME}-2of3.zip`, `${NAME}-3of3.zip`];
// Where Explorer's "Extract All" puts part 1 when the download went to a Downloads folder.
const DOWNLOADS = path.resolve("/users/me/Downloads");
const ROOT = path.join(DOWNLOADS, `${NAME}-1of3`, NAME);
const HOME = path.resolve("/users/me");

function readFrom(text: string | null) {
  return (file: string): string | null => (file === path.join(ROOT, "bundle.json") ? text : null);
}

function bundle(): Bundle {
  const text = JSON.stringify({ name: NAME, parts: PARTS, python: "python/python.exe", models: "models" });
  const read = readBundle(ROOT, readFrom(text));
  if (read === null) throw new Error("no bundle");
  return read;
}

describe("bundle.json", () => {
  it("is what makes a folder an AI bundle", () => {
    expect(readBundle(ROOT, readFrom(null))).toBeNull();
  });

  it("gives the parts, the bundle's Python and its model folder", () => {
    expect(bundle()).toEqual({
      root: ROOT,
      parts: PARTS,
      python: path.join(ROOT, "python", "python.exe"),
      models: path.join(ROOT, "models"),
    });
  });

  it("is refused when a name in it could reach another folder, or it is not JSON", () => {
    const damaged = [
      { parts: ["../elsewhere.zip"], python: "python/python.exe", models: "models" },
      { parts: PARTS, python: "../python.exe", models: "models" },
      { parts: PARTS, python: "/usr/bin/python3", models: "models" },
      { parts: PARTS, python: "C:/Python/python.exe", models: "models" },
      { parts: PARTS, python: "python\\python.exe", models: "models" },
      { parts: PARTS, python: "python/python.exe", models: "models/../.." },
      { parts: [], python: "python/python.exe", models: "models" },
    ];
    for (const fields of damaged) {
      expect(() => readBundle(ROOT, readFrom(JSON.stringify(fields))), JSON.stringify(fields)).toThrow(/is damaged/);
    }
    expect(() => readBundle(ROOT, readFrom("{ not json"))).toThrow(/is damaged/);
  });
});

describe("which parts are in", () => {
  it("counts a part in once the mark its last entry leaves is there", () => {
    const marks = [partMark(bundle(), 1)];
    expect(marks[0]).toBe(path.join(ROOT, ".lazylabel", "part-1-of-3"));
    expect(missingParts(bundle(), (file) => marks.includes(file))).toEqual([2, 3]);
    expect(missingParts(bundle(), () => true)).toEqual([]);
  });
});

describe("where the other parts are looked for", () => {
  it("in the bundle's folder, the three above it and Downloads, nearest first", () => {
    const up = (folder: string, steps: number): string =>
      steps === 0 ? folder : up(path.dirname(folder), steps - 1);
    expect(partFolders(bundle(), HOME)).toEqual([...new Set([ROOT, up(ROOT, 1), up(ROOT, 2), up(ROOT, 3), DOWNLOADS])]);
  });

  it("finds each part in the nearest folder that has it, and leaves out one found nowhere", () => {
    const beside = path.join(path.dirname(ROOT), PARTS[1]!);
    const present = [path.join(DOWNLOADS, PARTS[1]!), beside];
    expect(findParts(bundle(), [2, 3], HOME, (file) => present.includes(file))).toEqual(new Map([[2, beside]]));
  });
});

describe("what the app says while parts are missing", () => {
  it("names the files and the folder they go in", () => {
    expect(missingPartsReason(bundle(), [2, 3])).toBe(
      `parts 2 and 3 of 3 are not unpacked yet: put ${PARTS[1]} and ${PARTS[2]} in ${path.dirname(ROOT)} `
        + "and start LazyLabel again",
    );
    expect(missingPartsReason(bundle(), [3])).toBe(
      `part 3 of 3 is not unpacked yet: put ${PARTS[2]} in ${path.dirname(ROOT)} and start LazyLabel again`,
    );
  });
});

describe("the unpacking", () => {
  it("is the bundle's own Python, isolated from the user's settings, given the folder and the zips", () => {
    const zips = [path.join(DOWNLOADS, PARTS[1]!), path.join(DOWNLOADS, PARTS[2]!)];
    const { command, args } = unpackCommand(bundle(), zips);
    expect(command).toBe(path.join(ROOT, "python", "python.exe"));
    expect(args.slice(0, 2)).toEqual(["-I", "-c"]);
    expect(args.slice(3)).toEqual([ROOT, ...zips]);
    // The guard against an entry that climbs out of the folder, and the move into place.
    expect(args[2]).toContain("os.path.commonpath([root, target]) != root");
    expect(args[2]).toContain("os.replace(target + '.partial', target)");
  });
});
