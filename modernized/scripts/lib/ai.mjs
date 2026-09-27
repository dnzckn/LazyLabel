/**
 * What `npm run ai:setup`, `npm run ai:models` and `npm run doctor` share: where the AI tools'
 * Python environment is, which PyTorch build suits this machine, and where checkpoints go.
 *
 * DEPLOYABILITY.md R6, R7 and R9. Standard library only, because `npm run doctor` has to work on a
 * checkout whose `npm install` failed. `api/src/launcher.ts` makes the same decisions for
 * `npm start` in TypeScript, and `lazylabel_inference/fetch.py` picks the same model folder in
 * Python; `api/test/aiScripts.test.ts` holds the three to one answer.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** `modernized/`, two folders above this file. */
export const MODERNIZED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The inference service's package, where `uv sync` puts its `.venv`. */
export const INFERENCE = path.join(MODERNIZED, "lazylabel-reimagined", "inference");

/** The Python inside `<inference>/.venv`, where `uv sync` creates it. */
export function venvPython(inference = INFERENCE, platform = process.platform) {
  return platform === "win32"
    ? path.win32.join(inference, ".venv", "Scripts", "python.exe")
    : path.posix.join(inference, ".venv", "bin", "python");
}

/**
 * The Python that runs the AI tools: LAZYLABEL_PYTHON when it is set, such as an environment made
 * by hand, else the one `npm run ai:setup` made. Null when neither exists.
 */
export function aiPython(env = process.env, inference = INFERENCE, platform = process.platform) {
  const named = (env["LAZYLABEL_PYTHON"] ?? "").trim();
  const python = named !== "" ? path.resolve(named) : venvPython(inference, platform);
  return existsSync(python) ? python : null;
}

/**
 * The highest CUDA version the NVIDIA driver supports, read from `nvidia-smi`'s banner
 * ("CUDA Version: 13.1", top right), or null when there is no banner to read.
 */
export function driverCuda(nvidiaSmiOutput) {
  const match = /CUDA Version:\s*(\d+)\.(\d+)/.exec(nvidiaSmiOutput ?? "");
  return match === null ? null : { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * `cu128` when the driver supports CUDA 12.8 or later, else `cpu`: the two PyTorch builds
 * `inference/pyproject.toml` offers. The cu128 wheels carry their own CUDA runtime, so the driver
 * is all they need from the machine.
 */
export function torchFlavour(cuda) {
  if (cuda === null) return "cpu";
  return cuda.major > 12 || (cuda.major === 12 && cuda.minor >= 8) ? "cu128" : "cpu";
}

/** What `nvidia-smi` says, or null when there is no NVIDIA driver (or no nvidia-smi) here. */
export function readNvidiaSmi() {
  const result = spawnSync("nvidia-smi", [], { encoding: "utf-8", windowsHide: true, timeout: 20_000 });
  return result.status === 0 ? result.stdout : null;
}

/** uv's own one-line installer (docs.astral.sh/uv), for a machine without uv. */
export function uvInstaller(platform = process.platform) {
  return platform === "win32"
    ? 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
    : "curl -LsSf https://astral.sh/uv/install.sh | sh";
}

/**
 * Where checkpoints go when nobody says: per user, outside the repository and every dataset.
 * `%LOCALAPPDATA%\LazyLabel\models` on Windows, `~/Library/Application Support/LazyLabel/models`
 * on macOS, and `${XDG_DATA_HOME:-~/.local/share}/lazylabel/models` elsewhere.
 */
export function defaultModelDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (platform === "win32") {
    const local = (env["LOCALAPPDATA"] ?? "").trim();
    return path.win32.join(local !== "" ? local : path.win32.join(home, "AppData", "Local"), "LazyLabel", "models");
  }
  if (platform === "darwin") return path.posix.join(home, "Library", "Application Support", "LazyLabel", "models");
  // The XDG spec says a relative XDG_DATA_HOME is invalid and is to be ignored.
  const data = (env["XDG_DATA_HOME"] ?? "").trim();
  return path.posix.join(data.startsWith("/") ? data : path.posix.join(home, ".local", "share"), "lazylabel", "models");
}

/** LAZYLABEL_MODEL_DIR when it is set, else the per-user default. */
export function modelDir(env = process.env, platform = process.platform, home = os.homedir()) {
  const named = (env["LAZYLABEL_MODEL_DIR"] ?? "").trim();
  return named !== "" ? path.resolve(named) : defaultModelDir(env, platform, home);
}

/** The manifest the inference service reads: LAZYLABEL_MODEL_MANIFEST, else `<model dir>/manifest.json`. */
export function manifestPath(env = process.env, platform = process.platform, home = os.homedir()) {
  const named = (env["LAZYLABEL_MODEL_MANIFEST"] ?? "").trim();
  return named !== "" ? path.resolve(named) : path.join(modelDir(env, platform, home), "manifest.json");
}
