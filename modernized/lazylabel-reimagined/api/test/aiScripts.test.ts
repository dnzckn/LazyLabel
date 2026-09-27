/**
 * The scripts beside the workspace that install and check the AI tools: `npm run ai:setup`,
 * `npm run ai:models` and `npm run doctor` (DEPLOYABILITY.md R6, R7 and R9).
 *
 * They are plain JavaScript in `modernized/scripts/`, outside every package, because `doctor` has
 * to run on a checkout whose install failed. Their decisions are in `scripts/lib/ai.mjs`, and this
 * holds them to what was measured: `nvidia-smi`'s banner, the two PyTorch builds the lockfile
 * offers, and where each OS keeps a user's application data.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { defaultModelDir } from "../src/launcher.js";

const MODERNIZED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

type Cuda = { readonly major: number; readonly minor: number } | null;

interface AiScripts {
  driverCuda(output: string | null): Cuda;
  torchFlavour(cuda: Cuda): "cpu" | "cu128";
  uvInstaller(platform: NodeJS.Platform): string;
  venvPython(inference: string, platform: NodeJS.Platform): string;
  defaultModelDir(env: Record<string, string>, platform: NodeJS.Platform, home: string): string;
}

/**
 * Where checkpoints go by default, per platform: the table `inference/tests/test_fetch.py` holds
 * `lazylabel-models` to, so a model fetched there is where `npm start` looks.
 */
const MODEL_FOLDERS: readonly (readonly [Record<string, string>, NodeJS.Platform, string, string])[] = [
  [
    { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
    "win32",
    "C:\\Users\\me",
    "C:\\Users\\me\\AppData\\Local\\LazyLabel\\models",
  ],
  [{}, "win32", "C:\\Users\\me", "C:\\Users\\me\\AppData\\Local\\LazyLabel\\models"],
  [{}, "darwin", "/Users/me", "/Users/me/Library/Application Support/LazyLabel/models"],
  [{ XDG_DATA_HOME: "/data/me" }, "linux", "/home/me", "/data/me/lazylabel/models"],
  [{ XDG_DATA_HOME: "relative/is/ignored" }, "linux", "/home/me", "/home/me/.local/share/lazylabel/models"],
  [{}, "linux", "/home/me", "/home/me/.local/share/lazylabel/models"],
];

let ai: AiScripts;
let scripts: Readonly<Record<string, string>>;

beforeAll(async () => {
  ai = (await import(pathToFileURL(path.join(MODERNIZED, "scripts", "lib", "ai.mjs")).href)) as AiScripts;
  const manifest = JSON.parse(await readFile(path.join(MODERNIZED, "package.json"), "utf-8")) as {
    scripts: Record<string, string>;
  };
  scripts = manifest.scripts;
});

/** The banner as `nvidia-smi` printed it on the development machine, 2026-09-26. */
const BANNER = [
  "+-----------------------------------------------------------------------------------------+",
  "| NVIDIA-SMI 591.86                 Driver Version: 591.86         CUDA Version: 13.1     |",
  "|-----------------------------------------+------------------------+----------------------+",
].join("\n");

describe("npm run ai:setup", () => {
  it("is a script of the workspace, and the file it runs is there", () => {
    expect(scripts["ai:setup"]).toBe("node scripts/ai-setup.mjs");
    expect(existsSync(path.join(MODERNIZED, "scripts", "ai-setup.mjs"))).toBe(true);
  });

  it("reads the driver's CUDA version from nvidia-smi's banner", () => {
    expect(ai.driverCuda(BANNER)).toEqual({ major: 13, minor: 1 });
    expect(ai.driverCuda("| NVIDIA-SMI 550.54   Driver Version: 550.54   CUDA Version: 12.4 |")).toEqual({
      major: 12,
      minor: 4,
    });
  });

  it("finds no CUDA where there is no driver, or no banner", () => {
    expect(ai.driverCuda(null)).toBeNull();
    expect(ai.driverCuda("NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver.")).toBeNull();
  });

  it("installs PyTorch's CUDA 12.8 build for a driver that runs it, and the CPU build otherwise", () => {
    // The cu128 wheels carry their own CUDA runtime; the driver's version is all they ask of the
    // machine, and 12.8 is the least they accept.
    expect(ai.torchFlavour({ major: 13, minor: 1 })).toBe("cu128");
    expect(ai.torchFlavour({ major: 12, minor: 8 })).toBe("cu128");
    expect(ai.torchFlavour({ major: 12, minor: 4 })).toBe("cpu");
    expect(ai.torchFlavour({ major: 11, minor: 8 })).toBe("cpu");
    expect(ai.torchFlavour(null)).toBe("cpu");
  });

  it("names uv's own installer for the platform when uv is missing", () => {
    expect(ai.uvInstaller("win32")).toBe('powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"');
    expect(ai.uvInstaller("darwin")).toBe("curl -LsSf https://astral.sh/uv/install.sh | sh");
    expect(ai.uvInstaller("linux")).toBe("curl -LsSf https://astral.sh/uv/install.sh | sh");
  });

  it("finds the environment's Python where uv sync puts it", () => {
    expect(ai.venvPython("C:\\LazyLabel\\inference", "win32")).toBe("C:\\LazyLabel\\inference\\.venv\\Scripts\\python.exe");
    expect(ai.venvPython("/src/LazyLabel/inference", "linux")).toBe("/src/LazyLabel/inference/.venv/bin/python");
    expect(ai.venvPython("/src/LazyLabel/inference", "darwin")).toBe("/src/LazyLabel/inference/.venv/bin/python");
  });
});

describe("npm run ai:models", () => {
  it("is a script of the workspace, and the file it runs is there", () => {
    expect(scripts["ai:models"]).toBe("node scripts/ai-models.mjs");
    expect(existsSync(path.join(MODERNIZED, "scripts", "ai-models.mjs"))).toBe(true);
  });

  it.each(MODEL_FOLDERS)("puts models, by default, per user: %j on %s", (env, platform, home, expected) => {
    expect(ai.defaultModelDir(env, platform, home)).toBe(expected);
  });

  it.each(MODEL_FOLDERS)("puts them where npm start looks: %j on %s", (env, platform, home, expected) => {
    expect(defaultModelDir(env, platform, home)).toBe(expected);
  });
});
