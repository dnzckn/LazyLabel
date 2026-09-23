/**
 * No source file may contain a raw control character.
 *
 * Three have, each by the same accident: an escape meant as text -- a NUL written as backslash,
 * x, 0, 0 -- passed through a shell heredoc or a generating script and arrived in the file as the
 * byte itself. JavaScript and Python both accept a raw NUL inside a string literal, so nothing
 * failed, and every tool that decides "binary" by looking for a NUL stopped treating the file as
 * text:
 *
 * - git diffed `labels.ts`, a parser for files users hand us, as "Binary files differ" from the
 *   day it was written. No change to it could be reviewed in a pull request -- in the function
 *   whose whole job is to refuse binary input.
 * - git's line-ending conversion skipped `AiTool.tsx`, so it was committed with CRLF endings and
 *   its RULE-091 commit shows all 385 lines replaced by 464, when 79 were added and none changed.
 * - grep answered "Binary file matches" instead of the lines, so a search for a function's
 *   callers came back without that file's -- which is how the second one was noticed.
 *
 * The first, in the inference service, was caught by hand. This asks every text file in both
 * trees, so a fourth is caught by the suite instead of by luck.
 */

import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [
  path.join(HERE, "..", "..", ".."),
  path.join(HERE, "..", "..", "..", "..", "lazylabel"),
];

const TEXT = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".json", ".md", ".css", ".html", ".yml", ".yaml",
  ".toml", ".txt", ".cfg", ".ini", ".xml", ".csv", ".sh", ".ps1", ".mmd", ".svg",
]);
const SKIP = new Set(["node_modules", "dist", "build", "coverage", "venv", "__pycache__"]);

async function textFiles(dir: string, into: string[]): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await textFiles(full, into);
    else if (TEXT.has(path.extname(entry.name).toLowerCase()) || entry.name === "Dockerfile") {
      into.push(full);
    }
  }
  return into;
}

/** Tab, line feed and carriage return are text. Every other byte below space, and DEL, is not. */
function isControl(byte: number): boolean {
  return (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte === 127;
}

it("finds no raw control character in any text file", async () => {
  const files: string[] = [];
  for (const root of ROOTS) await textFiles(root, files);

  // An empty walk would pass vacuously. Both trees hold several hundred text files.
  expect(files.length, "the walk found almost nothing; its roots are wrong").toBeGreaterThan(300);

  const found: string[] = [];
  for (const file of files) {
    const bytes = await readFile(file);
    if (!bytes.some(isControl)) continue;
    let line = 1;
    for (const byte of bytes) {
      if (byte === 10) line += 1;
      else if (isControl(byte)) {
        found.push(`${path.relative(path.join(HERE, "..", "..", "..", ".."), file)}:${line} (byte ${byte})`);
        break;
      }
    }
  }

  expect(
    found,
    "write the escape instead -- \\u0000 in TypeScript, \\x00 in Python -- which is the same string "
      + "at runtime and text to git, grep and every reviewer",
  ).toEqual([]);
});
