/**
 * The npm workspace at `modernized/`: one install that builds every package.
 *
 * DEPLOYABILITY.md's F2. A new user had to find five separate installs and a build order that no
 * README gave, while `npm test` passed and hid it: the API README's own steps failed at
 * `typecheck`, `npm start` died with ERR_MODULE_NOT_FOUND, and the documented build loop said
 * `'tsc' is not recognized`. `modernized/package.json` is one workspace now, and its `prepare`
 * builds everything on `npm install`. Each property below is what makes that true, and each is easy
 * to lose in an edit that looks like tidying.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const MODERNIZED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

interface Manifest {
  readonly name: string;
  readonly engines?: { readonly node?: string };
  readonly workspaces?: readonly string[];
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

async function manifest(folder: string): Promise<Manifest> {
  return JSON.parse(await readFile(path.join(MODERNIZED, folder, "package.json"), "utf-8")) as Manifest;
}

let root: Manifest;
let members: { readonly folder: string; readonly manifest: Manifest }[];

beforeAll(async () => {
  root = await manifest(".");
  members = [];
  for (const folder of root.workspaces ?? []) members.push({ folder, manifest: await manifest(folder) });
});

describe("the workspace", () => {
  it("holds all five JavaScript packages", () => {
    expect(members.map((member) => member.manifest.name).sort()).toEqual([
      "@lazylabel/annotation-formats",
      "@lazylabel/api",
      "@lazylabel/contracts",
      "@lazylabel/settings-schema",
      "@lazylabel/web",
    ]);
  });

  it("lists every package after the packages it depends on, which is the order npm builds them in", () => {
    // `npm run build --workspaces` runs in this order. The API and the web app resolve the
    // libraries to their `dist` at run time, so a library built after its user is a user that
    // starts against a stale or missing build.
    const seen = new Set<string>();
    for (const { manifest: member } of members) {
      const needs = Object.keys({ ...member.dependencies, ...member.devDependencies }).filter((name) =>
        name.startsWith("@lazylabel/"),
      );
      for (const need of needs) expect(seen, `${member.name} is listed before ${need}`).toContain(need);
      seen.add(member.name);
    }
  });

  it("builds every package when it is installed", () => {
    // npm runs the root's `prepare` after a plain `npm install` and after `npm ci`, so installing is
    // building, and a user never meets an unbuilt library.
    expect(root.scripts?.["prepare"]).toBe("npm run build --workspaces --if-present");
    expect(root.scripts?.["build"]).toBe("npm run build --workspaces --if-present");
  });

  it("nests no npm inside a build, because every nested `npm run` lengthens PATH on Windows", () => {
    // Each `npm run` prepends a `node_modules\.bin` entry for EVERY folder above the package, so
    // every nested one adds the whole list again. On 2026-09-26 an install in a deep folder went
    // four levels down -- `prepare`, `npm run build`, `--workspaces`, then the web app's
    // `npm run typecheck` -- and PATH passed the 8,191 characters cmd.exe reads, so the web app's
    // `tsc` was "not recognized" halfway through an install whose other four `tsc`s had just run.
    // `prepare` runs the workspaces' builds itself (the test above pins it), and no build calls npm
    // again: two levels.
    for (const { manifest: member } of members) {
      expect(member.scripts?.["build"], `${member.name}'s build`).not.toMatch(/\bnpm\b|\bnpx\b/);
    }
  });

  it("starts the launcher with npm start, and both shims start the same file", async () => {
    // The quick start's second command, and the two ways to give it options. A rename of the
    // launcher that missed one of them would leave a user a "Cannot find module" instead of an app.
    const launcher = "lazylabel-reimagined/api/dist/src/cli.js";
    const cmd = await readFile(path.join(MODERNIZED, "lazylabel.cmd"), "utf-8");
    const sh = await readFile(path.join(MODERNIZED, "lazylabel.sh"), "utf-8");

    expect(root.scripts?.["start"]).toBe(`node ${launcher}`);
    expect(cmd).toContain(`node "%~dp0${launcher.replaceAll("/", "\\")}" %*`);
    expect(sh).toContain(`exec node "$(dirname "$0")/${launcher}" "$@"`);
  });

  it("states one Node floor, the one node:sqlite needs", () => {
    // node:sqlite needs a flag before 22.13, and without it the API dies at its first import.
    expect(root.engines?.node).toBe(">=22.13");
    for (const { manifest: member } of members) expect(member.engines?.node, member.name).toBe(">=22.13");
  });
});
