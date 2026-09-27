/**
 * `npm run ai:setup`: the AI tools' Python environment, from the lockfile, in one command.
 *
 * DEPLOYABILITY.md R6. Until this, the AI tools needed an expert: a plain `pip install ".[ai]"`
 * picked a different PyTorch on every OS and never the validated 2.10.0 (CPU-only on Windows, CUDA
 * 13 on Linux), SAM 2 came from git through a build that pulled a second PyTorch, and OpenCV was
 * undeclared. `inference/uv.lock` now records one resolution, with PyTorch's CPU and CUDA 12.8
 * builds as two extras, and this chooses between them and installs it:
 *
 *   uv sync --locked --python 3.12 --extra ai --extra server --extra <cu128|cpu>
 *
 * into `lazylabel-reimagined/inference/.venv`, which `npm start` then finds by itself. cu128 when
 * `nvidia-smi` reports a driver for CUDA 12.8 or later, cpu otherwise, macOS included; name one to
 * override it: `npm run ai:setup cpu`. The only prerequisite is uv, which brings its own Python.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  INFERENCE,
  driverCuda,
  manifestPath,
  modelDir,
  readNvidiaSmi,
  torchFlavour,
  uvInstaller,
  venvPython,
} from "./lib/ai.mjs";

const USAGE = `Usage: npm run ai:setup [cpu|cu128]

Installs the AI tools (PyTorch 2.10.0, SAM 1, SAM 2) into
${INFERENCE}/.venv, exactly as inference/uv.lock records them. Needs uv:
  ${uvInstaller()}
The PyTorch build is cu128 when nvidia-smi reports CUDA 12.8 or later, else cpu; name one to choose.`;

process.exit(main(process.argv.slice(2)));

function main(args) {
  if (args.includes("-h") || args.includes("--help")) {
    console.log(USAGE);
    return 0;
  }
  const chosen = args.find((word) => word === "cpu" || word === "cu128");
  const unknown = args.filter((word) => word !== chosen);
  if (unknown.length > 0) {
    console.error(`ai:setup takes cpu or cu128, not ${unknown.map((word) => `"${word}"`).join(", ")}.\n\n${USAGE}`);
    return 2;
  }

  const uv = spawnSync("uv", ["--version"], { encoding: "utf-8", windowsHide: true });
  if (uv.error !== undefined || uv.status !== 0) {
    console.error(
      "The AI tools are installed with uv, which is not on this computer's PATH. Install it with:\n"
        + `  ${uvInstaller()}\n`
        + "then open a new terminal and run npm run ai:setup again.",
    );
    return 1;
  }

  const cuda = driverCuda(readNvidiaSmi());
  const flavour = chosen ?? torchFlavour(cuda);
  console.log(`${uv.stdout.trim()}. ${describe(flavour, cuda, chosen !== undefined)}`);
  console.log(`Installing into ${INFERENCE}${process.platform === "win32" ? "\\" : "/"}.venv\n`);

  const sync = spawnSync(
    "uv",
    ["sync", "--project", INFERENCE, "--locked", "--python", "3.12", "--extra", "ai", "--extra", "server", "--extra", flavour],
    { stdio: "inherit", windowsHide: true, env: syncEnvironment(process.env) },
  );
  if (sync.status !== 0) {
    console.error(
      `\nuv sync failed${sync.status === null ? "" : ` (exit code ${sync.status})`}; its own message is above. `
        + "Run npm run ai:setup again once that is fixed: it carries on from where it stopped.",
    );
    return sync.status ?? 1;
  }

  const python = venvPython();
  const check = spawnSync(
    python,
    [
      "-c",
      "import torch, sam2, segment_anything, cv2; "
        + "gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else None; "
        + "print(torch.__version__, 'on ' + gpu if gpu else 'on the CPU')",
    ],
    { encoding: "utf-8", windowsHide: true },
  );
  if (check.status !== 0) {
    console.error(`\nThe environment was made, and its check failed:\n${check.stderr || check.stdout}`);
    return 1;
  }

  const manifest = manifestPath();
  console.log(
    `\nThe AI tools are installed: PyTorch ${check.stdout.trim()}.\n`
      + (existsSync(manifest)
        ? `Models: ${manifest} is there, so npm start "<folder>" starts the AI tools with the app.`
        : `Next: npm run ai:models sam2.1-large   (SAM 2.1 large, 898 MB, into ${modelDir()})\n`
          + 'Then: npm start "<folder>"              (starts the AI tools with the app)'),
  );
  return 0;
}

function describe(flavour, cuda, chosen) {
  const driver = cuda === null ? "no NVIDIA driver was found" : `the NVIDIA driver supports CUDA ${cuda.major}.${cuda.minor}`;
  if (chosen) return `PyTorch's ${flavour === "cu128" ? "CUDA 12.8" : "CPU"} build, as asked (${driver}).`;
  if (flavour === "cu128") return `PyTorch's CUDA 12.8 build, because ${driver}.`;
  return cuda === null
    ? `PyTorch's CPU build, because ${driver}.`
    : `PyTorch's CPU build: ${driver}, and its GPU build needs 12.8. Update the driver and run this again for the GPU.`;
}

/**
 * The environment `uv sync` runs in. UV_PROJECT_ENVIRONMENT would move the venv somewhere `npm
 * start` does not look (LAZYLABEL_PYTHON names such an environment instead), and SAM 2's CUDA
 * extension is never built: only a git install of SAM 2 would build it, it needs a compiler, and
 * every equivalence result was measured without it.
 */
function syncEnvironment(env) {
  const { UV_PROJECT_ENVIRONMENT: _moved, ...rest } = env;
  return { ...rest, SAM2_BUILD_CUDA: "0" };
}
