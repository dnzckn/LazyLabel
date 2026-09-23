/**
 * Every environment variable a service reads is named in that service's README.
 *
 * An operator configures a service from its README, not from its source. On 2026-09-23 the API read
 * `LAZYLABEL_INFERENCE_URL` -- the one variable that decides whether the AI tools exist at all --
 * and its README's table did not list it; the web app read `LAZYLABEL_API` and `VITE_LAZYLABEL_API`
 * and no README named either. Found by asking one question of the whole list, which is how this
 * project has found most of what it found; kept true by asking it here on every run.
 *
 * READS, not mentions. A comment or an error message naming another service's variable is not a
 * variable this service reads, and demanding it be documented here would teach people to ignore
 * the failure.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const SERVICES = [
  { name: "api", sources: ["api/src"], readme: "api/README.md", atLeast: 5 },
  { name: "inference", sources: ["inference/src"], readme: "inference/README.md", atLeast: 5 },
  { name: "web", sources: ["web/src", "web/vite.config.ts"], readme: "web/README.md", atLeast: 2 },
];

/** `env["X"]`, `env.get("X")`, `environ.get("X")` and `import.meta.env["X"]`: the ways these read. */
const READ = /\b(?:environ|env)(?:\.get\(|\[)\s*["']((?:VITE_)?LAZYLABEL_[A-Z0-9_]+)["']/g;

async function sourceFiles(entry: string, into: string[]): Promise<string[]> {
  const full = path.join(ROOT, entry);
  if ((await stat(full)).isFile()) {
    into.push(full);
    return into;
  }
  for (const child of await readdir(full, { withFileTypes: true })) {
    if (child.name === "__pycache__" || child.name === "node_modules") continue;
    const next = path.join(entry, child.name);
    if (child.isDirectory()) await sourceFiles(next, into);
    else if (/\.(ts|tsx|py)$/.test(child.name)) into.push(path.join(ROOT, next));
  }
  return into;
}

describe.each(SERVICES)("$name", ({ sources, readme, atLeast }) => {
  it("names in its README every variable it reads", async () => {
    const files: string[] = [];
    for (const source of sources) await sourceFiles(source, files);

    const read = new Set<string>();
    for (const file of files) {
      for (const match of (await readFile(file, "utf-8")).matchAll(READ)) read.add(match[1]!);
    }
    // A sweep that found nothing would pass whatever the README said.
    expect(read.size, "the sweep found almost nothing; the pattern or the paths are wrong").toBeGreaterThanOrEqual(atLeast);

    const documented = await readFile(path.join(ROOT, readme), "utf-8");
    const missing = [...read].filter((name) => !documented.includes(`\`${name}\``)).sort();

    expect(missing, `${readme} does not name these, and an operator reads that, not the source`).toEqual([]);
  });
});
