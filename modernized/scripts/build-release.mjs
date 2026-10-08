#!/usr/bin/env node
/**
 * The no-install release zip, DEPLOYABILITY.md R11: a portable Node, the built app and a
 * double-click launcher, for the OS and architecture this runs on. sharp's image library is native,
 * so there is one zip per OS and architecture. `.github/workflows/release.yml` runs this on Windows,
 * macOS and Linux, and a maintainer runs the same thing locally:
 *
 *   node scripts/build-release.mjs [--out <folder>] [--work <folder>] [--node <version>]
 *
 * 1. The tracked files of modernized/ are copied to a work folder, so nobody's own node_modules is
 *    pruned, and `npm ci` runs there, which builds all five packages; then `npm prune --omit=dev`.
 * 2. The portable Node comes from nodejs.org, the version running this script unless --node names
 *    another, and is checked against nodejs.org's SHASUMS256.txt. A mismatch stops the build.
 * 3. node/, app/ and the launcher are staged and zipped: LazyLabel-web-<os>-<arch>.zip in --out
 *    (default modernized/release/), with a .sha256 beside it. app/ holds the API's build, the web
 *    app's build and the packages the API loads at run time, sharp's platform binary among them.
 *
 * `scripts/release-smoke.mjs` then unzips it and starts it the way a user does. Standard library
 * only, plus the system's tar (Windows 10 and later) or zip.
 *
 * WITH --ai <cu128|cpu>, THE AI TOOLS COME TOO (DEPLOYABILITY.md R12): LazyLabel-web-ai-<os>-<arch>,
 * which also holds CPython 3.12.11 (the portable build uv installs, the one every suite passed on)
 * with inference/uv.lock's PyTorch, SAM 1 and SAM 2 packages installed into it, the inference
 * service's code, and SAM 2.1 large and MobileNetV3 small fetched and verified by its own
 * `lazylabel-models`. Nobody installs Python. It is gigabytes, and GitHub takes no file of 2 GiB, so
 * `pack_parts.py` splits it into parts that the app's launcher joins on its first start. Needs uv,
 * which brings the Python; `--models-from <folder>` takes the checkpoints from a folder instead of
 * downloading them, checked the same way.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyNvidiaFile } from "./nvidia-files.mjs";

const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = process.platform === "win32";
const OS_NAME = { win32: "windows", darwin: "macos", linux: "linux" }[process.platform];
const CLI = ["app", "lazylabel-reimagined", "api", "dist", "src", "cli.js"];
const REPOSITORY = "https://github.com/dnzckn/LazyLabel";
/** uv's portable CPython: the version every suite passed on (PROGRESS.md, "Running the live suites"). */
const PYTHON_VERSION = "3.12.11";
/** The AI bundle's checkpoints, by manifest id: SAM 2.1 for prompts and propagation, the embedder for Find Archetypes. */
const BUNDLED_MODELS = ["sam2.1-large", "mobilenet-v3-small"];

async function main() {
  if (OS_NAME === undefined) fail(`There is no release zip for ${process.platform}.`);
  const options = parseOptions(process.argv.slice(2));
  const nodeVersion = options.node.replace(/^v/, "");
  const ai = options.ai;
  if (ai !== null && ai !== "cu128" && ai !== "cpu") fail(`--ai takes cu128 or cpu, not ${ai}.`);
  const name = `LazyLabel-web-${ai === null ? "" : "ai-"}${OS_NAME}-${process.arch}`;

  mkdirSync(options.work, { recursive: true });
  const work = realpathSync(options.work);

  console.log(`Building ${name} with Node.js ${nodeVersion}${ai === null ? "" : ` and PyTorch's ${ai} build`}, in ${work}`);
  const source = buildApp(path.join(work, "source"));
  const node = await portableNode(nodeVersion, path.join(work, "cache"));
  const stage = path.join(work, "stage", name);
  rmSync(path.dirname(stage), { recursive: true, force: true });
  stageRelease(source, node, stage, ai !== null);
  if (ai !== null) {
    const python = stageAi(source, stage, ai, options["models-from"]);
    const unpacked = folderSize(stage);
    console.log(`\nStaged ${megabytes(unpacked.bytes)} MB in ${unpacked.files} files. Packing, measured compressed:`);
    const packed = run(python, ["-I", path.join(WORKSPACE, "scripts", "pack_parts.py"), "--stage", stage, "--out", path.resolve(options.out)], { capture: true });
    console.log(packed);
    notice(`${name}, ${megabytes(unpacked.bytes)} MB in ${unpacked.files} files staged:\n${packed}`);
    return;
  }
  const zip = zipRelease(stage, path.resolve(options.out));

  const digest = sha256(readFileSync(zip));
  writeFileSync(`${zip}.sha256`, `${digest}  ${path.basename(zip)}\n`);
  const unpacked = folderSize(stage);
  console.log(
    `\n${zip}\n`
      + `  ${megabytes(statSync(zip).size)} MB zipped, ${megabytes(unpacked.bytes)} MB in ${unpacked.files} files unzipped\n`
      + `  SHA-256 ${digest}`,
  );
}

function parseOptions(args) {
  const parsed = {
    out: path.join(WORKSPACE, "release"),
    work: path.join(os.tmpdir(), "lazylabel-release"),
    node: process.versions.node,
    ai: null,
    "models-from": null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index].replace(/^--/, "");
    const value = args[index + 1];
    if (!(option in parsed) || value === undefined) {
      fail(
        "Usage: node scripts/build-release.mjs [--out <folder>] [--work <folder>] [--node <version>]\n"
          + "         [--ai cu128|cpu [--models-from <folder>]]",
      );
    }
    parsed[option] = value;
    index += 1;
  }
  return parsed;
}

/** A clean copy of modernized/'s tracked files, installed, built and pruned to what runs. */
function buildApp(folder) {
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const tracked = run("git", ["ls-files", "-z"], { cwd: WORKSPACE, capture: true }).split("\0").filter(Boolean);
  for (const file of tracked) {
    const from = path.join(WORKSPACE, file);
    if (!existsSync(from)) continue; // deleted in the working tree and not yet committed
    mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    cpSync(from, path.join(folder, file));
  }
  const copy = realpathSync(folder);
  run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: copy });
  run("npm", ["prune", "--omit=dev", "--no-audit", "--no-fund"], { cwd: copy });
  return copy;
}

/** The folder holding nodejs.org's build of Node `version` for this OS and architecture, verified. */
async function portableNode(version, cache) {
  const platform = { win32: "win", darwin: "darwin", linux: "linux" }[process.platform];
  const base = `node-v${version}-${platform}-${process.arch}`;
  const archive = `${base}${IS_WINDOWS ? ".zip" : ".tar.gz"}`;
  const dist = `https://nodejs.org/dist/v${version}/`;
  mkdirSync(cache, { recursive: true });

  const sums = (await download(`${dist}SHASUMS256.txt`)).toString("utf8");
  const listed = sums.split("\n").map((line) => line.trim().split(/\s+/)).find((fields) => fields[1] === archive);
  if (listed === undefined) fail(`nodejs.org's SHASUMS256.txt for v${version} lists no ${archive}.`);
  const expected = listed[0].toLowerCase();

  const file = path.join(cache, archive);
  if (!existsSync(file) || sha256(readFileSync(file)) !== expected) {
    console.log(`Downloading ${dist}${archive}`);
    writeFileSync(file, await download(`${dist}${archive}`));
  }
  const actual = sha256(readFileSync(file));
  if (actual !== expected) {
    rmSync(file, { force: true });
    fail(`${archive} does not match nodejs.org's SHASUMS256.txt (expected ${expected}, got ${actual}). Nothing was built.`);
  }
  console.log(`${archive}: SHA-256 ${actual}, as nodejs.org's SHASUMS256.txt lists it.`);

  const folder = path.join(cache, base);
  rmSync(folder, { recursive: true, force: true });
  run(tar(), ["-xf", file, "-C", cache]);
  return folder;
}

/** node/, app/, the launcher and a README, in `stage`. */
function stageRelease(source, node, stage, withAi) {
  const nodeBinary = IS_WINDOWS ? ["node.exe"] : ["bin", "node"];
  copyFile(path.join(node, ...nodeBinary), path.join(stage, "node", ...nodeBinary));
  copyFile(path.join(node, "LICENSE"), path.join(stage, "node", "LICENSE"));

  const app = path.join(stage, "app");
  const api = path.join("lazylabel-reimagined", "api");
  copyFile(path.join(source, api, "package.json"), path.join(app, api, "package.json"));
  copyTree(path.join(source, api, "dist", "src"), path.join(app, api, "dist", "src"), isRuntimeFile);
  const web = path.join("lazylabel-reimagined", "web", "dist");
  copyTree(path.join(source, web), path.join(app, web), isRuntimeFile);
  copyRuntimePackages(source, app);

  const licence = path.join(WORKSPACE, "..", "LICENSE");
  if (existsSync(licence)) copyFile(licence, path.join(stage, "LICENSE.txt"));
  writeFileSync(path.join(stage, "README.txt"), (withAi ? AI_README : README).replace(/\n/g, IS_WINDOWS ? "\r\n" : "\n"));
  if (IS_WINDOWS) {
    writeFileSync(path.join(stage, "Start LazyLabel.cmd"), WINDOWS_LAUNCHER.replace(/\n/g, "\r\n"));
  } else {
    const launcher = path.join(stage, process.platform === "darwin" ? "Start LazyLabel.command" : "start-lazylabel.sh");
    writeFileSync(launcher, posixLauncher(process.platform === "darwin"), { mode: 0o755 });
  }
}

/**
 * The AI tools, into a staged release: the inference service's code where `aiPlan` runs it from,
 * a portable Python with uv.lock's packages, the two checkpoints and the licences that come with
 * them. Returns the staged Python, which then packs the parts.
 */
function stageAi(source, stage, flavour, modelsFrom) {
  const inference = path.join(source, "lazylabel-reimagined", "inference");
  const code = path.join(stage, "app", "lazylabel-reimagined", "inference");
  const notCompiled = (file) => !file.split(/[\\/]/).includes("__pycache__");
  copyTree(path.join(inference, "src", "lazylabel_inference"), path.join(code, "src", "lazylabel_inference"), notCompiled);
  const catalog = path.join(inference, "models", "manifest.verified.json");
  copyFile(catalog, path.join(code, "models", "manifest.verified.json"));

  const python = stagePython(stage);
  // Straight into the portable Python, which uv takes as the project environment: exactly the
  // packages `npm run ai:setup` puts in its .venv, from the same lockfile, and nothing for tests.
  run(
    "uv",
    [
      "sync", "--project", inference, "--locked", "--no-dev", "--no-install-project", "--python", python,
      "--extra", "ai", "--extra", "server", "--extra", flavour,
    ],
    { env: { UV_PROJECT_ENVIRONMENT: path.join(stage, "python") } },
  );
  settleNvidiaFiles(stage);

  // From the bundle's own site-packages, and from nowhere else.
  const imported = run(
    python,
    ["-I", "-c", `${SAME_PREFIX}; import cv2, sam2, segment_anything, sklearn, torch, torchvision; `
      + "inside = os.path.commonpath([os.path.realpath(torch.__file__), os.path.realpath(sys.argv[1])]) == os.path.realpath(sys.argv[1]); "
      + "assert inside, f'PyTorch imported from {torch.__file__}, outside {sys.argv[1]}'; "
      + "print(f'PyTorch {torch.__version__}, CUDA {torch.version.cuda}, SAM 2 and segment-anything import, "
      + "from {torch.__file__}')", path.join(stage, "python")],
    { cwd: stage, capture: true },
  );
  console.log(imported);
  notice(imported);

  // Fetched and verified by the service's own tool, which writes the manifest.json the service reads.
  // A copy already in --models-from is checked instead of downloaded again.
  const models = path.join(stage, "models");
  mkdirSync(models, { recursive: true });
  const listed = JSON.parse(readFileSync(catalog, "utf8")).models;
  for (const id of BUNDLED_MODELS) {
    const checkpoint = listed.find((entry) => entry.id === id);
    if (checkpoint === undefined) fail(`${path.basename(catalog)} lists no ${id}.`);
    const local = modelsFrom === null ? null : path.join(path.resolve(modelsFrom), checkpoint.filename);
    if (local !== null && existsSync(local)) copyFile(local, path.join(models, checkpoint.filename));
    run(python, ["-E", "-s", "-m", "lazylabel_inference.fetch", "fetch", id, "--dir", models, "--yes"], { cwd: path.join(code, "src") });
  }

  copyFile(path.join(inference, "vendor", "sam2.LICENSE"), path.join(stage, "licenses", "SAM-2.txt"));
  copyFile(path.join(inference, "vendor", "sam2.LICENSE_cctorch"), path.join(stage, "licenses", "SAM-2-cc_torch.txt"));
  writeFileSync(path.join(stage, "THIRD-PARTY-NOTICES.txt"), NOTICES.replace(/\n/g, IS_WINDOWS ? "\r\n" : "\n"));
  return python;
}

/**
 * NVIDIA's files in the staged Python, settled against NVIDIA's own agreements (read 2026-10-08).
 *
 * The CUDA Toolkit agreement lets an application redistribute only the files its Attachment A
 * lists, names with version numbers embedded included. cuDNN, cuSPARSELt and NVSHMEM have agreements
 * of their own that cover their runtime files, and NCCL is open source. PyTorch's CUDA packages
 * carry a few files none of those name: CUPTI's profiling helpers (nvperf_host, nvperf_target,
 * libcheckpoint, libpcsamplingutil) and cuSOLVER's multi-GPU library (cusolverMg). LazyLabel uses
 * none of them, so they are taken out: cuBLAS, cuDNN, cuSOLVER, cuFFT, cuRAND, cuSPARSE, NVRTC and
 * half-precision attention were run on a GPU without them on 2026-10-08.
 *
 * Then EVERY NVIDIA file left must belong to a family those agreements cover, or the build stops.
 * A newer PyTorch that brings a new library is read before it ships, not after.
 */
function settleNvidiaFiles(stage) {
  const python = path.join(stage, "python");
  const site = IS_WINDOWS
    ? path.join(python, "Lib", "site-packages")
    : path.join(python, "lib", `python${PYTHON_VERSION.split(".").slice(0, 2).join(".")}`, "site-packages");
  const folders = [path.join(site, "torch", "lib")];
  const nvidia = path.join(site, "nvidia");
  if (existsSync(nvidia)) {
    for (const entry of readdirSync(nvidia, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const inner of ["lib", "bin"]) folders.push(path.join(nvidia, entry.name, inner));
    }
  }

  const removed = [];
  const unknown = [];
  let kept = 0;
  for (const folder of folders.filter((candidate) => existsSync(candidate))) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      // Whatever the name starts with: libcheckpoint and libpcsamplingutil do not look like NVIDIA's,
      // and are (nvidia-files.mjs).
      const what = classifyNvidiaFile(entry.name);
      if (what === "remove") {
        rmSync(path.join(folder, entry.name));
        removed.push(entry.name);
      } else if (what === "keep") {
        kept += 1;
      } else if (what === "unknown") {
        unknown.push(path.relative(site, path.join(folder, entry.name)));
      }
    }
  }
  // NVIDIA's header files, in each package's include folder: the CUDA agreement names some headers
  // as distributable and not these, and nothing at run time reads any of them. The runtime
  // libraries are what the bundle needs, and all it carries.
  let headerFolders = 0;
  for (const folder of existsSync(nvidia) ? readdirSync(nvidia, { withFileTypes: true }) : []) {
    const headers = path.join(nvidia, folder.name, "include");
    if (folder.isDirectory() && existsSync(headers)) {
      rmSync(headers, { recursive: true, force: true });
      headerFolders += 1;
    }
  }

  // Triton, which Linux's PyTorch asks for, carries NVIDIA's developer tools inside it (ptxas,
  // cuobjdump, nvdisasm, CUPTI's static libraries): a developer tool is for internal use unless the
  // CUDA agreement names it distributable, and none of these is named. Only torch.compile uses it,
  // and LazyLabel does not call that, so it is left out of the bundle, and PyTorch runs without it as
  // it does on Windows, where it is never installed.
  const triton = [path.join(site, "triton"), ...(existsSync(site) ? readdirSync(site).filter((name) => /^triton-.*\.dist-info$/.test(name)).map((name) => path.join(site, name)) : [])];
  const leftOutTriton = triton.filter((candidate) => existsSync(candidate));
  for (const candidate of leftOutTriton) rmSync(candidate, { recursive: true, force: true });

  if (unknown.length > 0) {
    fail(
      `NVIDIA files that no agreement read on 2026-10-08 covers: ${unknown.join(", ")}.\n`
        + "Read NVIDIA's terms for them, then name their family in settleNvidiaFiles.",
    );
  }
  const said = `NVIDIA: ${kept} libraries kept, all covered by an NVIDIA agreement; ${removed.length} left out because `
    + `NVIDIA's CUDA agreement does not list them${removed.length > 0 ? `: ${removed.sort().join(", ")}` : ""}`
    + `${leftOutTriton.length > 0 ? "; Triton left out, with the NVIDIA developer tools inside it" : ""}`
    + `${headerFolders > 0 ? `; ${headerFolders} folders of NVIDIA's header files left out` : ""}.`;
  console.log(said);
  notice(said);
}

/**
 * CPython from uv's own store, copied into python/: python-build-standalone's build, which runs
 * from any folder. uv marks the store's copy externally managed, so pip leaves it alone; this copy
 * is the bundle's own, and the mark comes off so uv can install into it.
 */
function stagePython(stage) {
  run("uv", ["python", "install", PYTHON_VERSION]);
  const found = run("uv", ["python", "find", "--python-preference", "only-managed", PYTHON_VERSION], { capture: true }).trim();
  const root = IS_WINDOWS ? path.dirname(found) : path.dirname(path.dirname(found));
  const target = path.join(stage, "python");
  if (IS_WINDOWS) {
    cpSync(root, target, { recursive: true });
  } else {
    // Every link becomes the file it names, and NOT by cpSync: it keeps a link inside the tree as a
    // link to the ORIGINAL file, so bin/python3 stayed uv's own Python, and uv installed PyTorch into
    // uv's store while the bundle got none (2026-09-28, macOS and Linux). A zip unpacked by the
    // Finder cannot hold a link anyway.
    mkdirSync(target, { recursive: true });
    run("cp", ["-RL", `${root}/.`, target]);
  }
  const library = IS_WINDOWS ? path.join(target, "Lib") : path.join(target, "lib", `python${PYTHON_VERSION.split(".").slice(0, 2).join(".")}`);
  rmSync(path.join(library, "EXTERNALLY-MANAGED"), { force: true });
  const python = IS_WINDOWS ? path.join(target, "python.exe") : path.join(target, "bin", "python3");
  if (!existsSync(python)) fail(`uv's CPython ${PYTHON_VERSION} has no ${path.relative(target, python)} in ${root}.`);
  // The copy must be a Python of its own before anything is installed into it.
  run(python, ["-I", "-c", `${SAME_PREFIX}; print(f"The bundle's Python is its own, at {sys.prefix}")`, target]);
  return python;
}

/** Python that stops unless the running interpreter's prefix is the folder named first on its command line. */
const SAME_PREFIX = "import os, sys; "
  + "assert os.path.samefile(sys.prefix, sys.argv[1]), f'this Python is {sys.prefix}, not the copy in {sys.argv[1]}'";

/**
 * The packages the API loads at run time, found the way Node finds them: from each package's real
 * folder up through every node_modules above it. A package another platform needs is an optional
 * dependency that is not installed here, and is left out. The workspace's own libraries are links
 * in node_modules, which a zip unpacked by Windows Explorer or the macOS Finder cannot hold, so they
 * become real folders with only their package.json and build.
 */
function copyRuntimePackages(source, app) {
  const queue = [path.join(source, "lazylabel-reimagined", "api")];
  const copied = new Set();
  while (queue.length > 0) {
    const from = queue.shift();
    const manifest = JSON.parse(readFileSync(path.join(from, "package.json"), "utf8"));
    const optional = new Set(Object.keys(manifest.optionalDependencies ?? {}));
    for (const dependency of [...Object.keys(manifest.dependencies ?? {}), ...optional]) {
      const found = resolvePackage(from, dependency);
      if (found === null) {
        if (optional.has(dependency)) continue;
        fail(`${dependency}, which ${manifest.name} needs at run time, is not installed in ${source}.`);
      }
      if (copied.has(found)) continue;
      copied.add(found);
      const relative = path.relative(source, found);
      if (relative.split(path.sep)[0] !== "node_modules") {
        fail(`${dependency} resolves to ${found}, outside ${path.join(source, "node_modules")}; ship it by hand.`);
      }
      const to = path.join(app, relative);
      if (lstatSync(found).isSymbolicLink()) {
        const real = realpathSync(found);
        copyFile(path.join(real, "package.json"), path.join(to, "package.json"));
        copyTree(path.join(real, "dist"), path.join(to, "dist"), isRuntimeFile);
        queue.push(real);
      } else {
        copyTree(found, to, () => true);
        queue.push(found);
      }
    }
  }
}

/** The folder `name` resolves to from a package in `from`, as Node resolves it, or null. */
function resolvePackage(from, name) {
  for (let folder = from; ; folder = path.dirname(folder)) {
    if (path.basename(folder) !== "node_modules") {
      const candidate = path.join(folder, "node_modules", name);
      if (existsSync(path.join(candidate, "package.json"))) return candidate;
    }
    if (path.dirname(folder) === folder) return null;
  }
}

/** Build output that runs: no declarations, no source maps, no compiled tests. */
function isRuntimeFile(file) {
  return !/\.d\.ts(\.map)?$|\.map$/.test(file) && !file.split(/[\\/]/).includes("test");
}

function zipRelease(stage, out) {
  mkdirSync(out, { recursive: true });
  const zip = path.join(out, `${path.basename(stage)}.zip`);
  rmSync(zip, { force: true });
  if (IS_WINDOWS) {
    // Windows' own tar is libarchive's, which writes a zip when the name ends in .zip.
    run(tar(), ["-a", "-c", "-f", zip, "-C", path.dirname(stage), path.basename(stage)]);
  } else {
    run("zip", ["-r", "-q", "-X", "-y", zip, path.basename(stage)], { cwd: path.dirname(stage) });
  }
  return zip;
}

/*
 * The launchers ask nothing: LazyLabel starts with no folder open, and the app's Open Image Folder
 * chooses one (the owner, 2026-09-29: "when starting the launch.cmd it asked me for a folder for
 * images, why is that a part of the launch?"). A folder dropped on the launcher or named after it
 * still opens at start.
 */
const WINDOWS_LAUNCHER = `@echo off
rem LazyLabel, with nothing to install. Double-click this file: LazyLabel opens in your browser,
rem where Open Image Folder chooses your folder of images, and runs until this window is closed.
rem A folder dropped onto this file opens at start. Options go after it, as in:
rem   "Start LazyLabel.cmd" "C:\\path\\to\\images" --port 8790
title LazyLabel
"%~dp0node\\node.exe" "%~dp0${CLI.join("\\")}" %*
if errorlevel 1 pause
`;

function posixLauncher(macos) {
  return `#!/bin/sh
# LazyLabel, with nothing to install. ${macos ? "Double-click this file in the Finder" : "Run ./start-lazylabel.sh in a terminal"}:
# LazyLabel opens in your browser, where Open Image Folder chooses your folder of images, and runs
# until this window is closed or Ctrl+C is pressed. A folder named after the command opens at start.
# Options go after it, as in: ${macos ? "./Start\\ LazyLabel.command" : "./start-lazylabel.sh"} "/path/to/images" --port 8790
here=$(cd "$(dirname "$0")" && pwd)
${
  macos
    ? `# macOS quarantines everything unzipped from a download, and would refuse the image library
# LazyLabel loads, which Apple has not notarised. Running this file is the consent to trust the
# folder it came in, so the mark comes off the whole folder at once.
xattr -dr com.apple.quarantine "$here" 2>/dev/null
`
    : ""
}"$here/node/bin/node" "$here/${CLI.join("/")}" "$@"
status=$?
if [ "$status" -ne 0 ] && [ -t 0 ]; then
  printf '\\nPress Enter to close this window.'
  read -r _
fi
exit "$status"
`;
}

const README = `LazyLabel web: nothing to install.

Start it
  Windows  Double-click "Start LazyLabel.cmd". If Windows asks whether to run it, choose Run
           (More info, then Run anyway).
  macOS    Double-click "Start LazyLabel.command". The first time, macOS says it cannot check
           it: open System Settings, Privacy & Security, and choose Open Anyway, then open it
           again. (Or right-click it and choose Open.)
  Linux    Run ./start-lazylabel.sh in a terminal.

LazyLabel opens in your browser at http://127.0.0.1:8787/. Click Open Image Folder, at the top of
the file list, and choose your folder of images. LazyLabel runs until you close its window (or
press Ctrl+C in it). A folder dropped onto the launcher, or named after the command, opens at start.

Your annotations are saved beside your images, in the files the desktop app reads and writes.
Settings and hotkeys are kept per user. LazyLabel listens on this computer only.

Options go after the folder, if one is named: --port <number>, --no-open, --help.

The AI tools (SAM) are not in this download. The LazyLabel-web-ai download beside it has them,
still with nothing to install; or install LazyLabel from the source:
${REPOSITORY}/tree/main-web#adding-the-ai-tools-sam
`;

const AI_README = `LazyLabel web with the AI tools: nothing to install.

If the download came in parts (-1of3.zip, -2of3.zip and so on), put them all in one folder and unzip
part 1 only. The first time LazyLabel starts, it finds the other parts beside it and unpacks them
itself, which takes a minute or two. Keep the parts until it has.

Start it
  Windows  Double-click "Start LazyLabel.cmd". If Windows asks whether to run it, choose Run
           (More info, then Run anyway).
  macOS    Double-click "Start LazyLabel.command". The first time, macOS says it cannot check
           it: open System Settings, Privacy & Security, and choose Open Anyway, then open it
           again. (Or right-click it and choose Open.)
  Linux    Run ./start-lazylabel.sh in a terminal.

LazyLabel opens in your browser at http://127.0.0.1:8787/. Click Open Image Folder, at the top of
the file list, and choose your folder of images. LazyLabel runs until you close its window (or
press Ctrl+C in it). A folder dropped onto the launcher, or named after the command, opens at start.

The AI tools are in this download: SAM 2.1 (large) for clicks, boxes and Sequence propagation,
and MobileNetV3 for Find Archetypes, with their own Python. They run on an NVIDIA graphics card
when there is one with a current driver, and on the processor otherwise, more slowly. Nothing is
downloaded when LazyLabel runs.

Your annotations are saved beside your images, in the files the desktop app reads and writes.
Settings and hotkeys are kept per user. LazyLabel listens on this computer only.

Options go after the folder, if one is named: --port <number>, --no-open, --help.

What is included, and under which licences: THIRD-PARTY-NOTICES.txt.
`;

const NOTICES = `LazyLabel web with the AI tools includes other people's work, each under its own licence.

  Node.js                     node/LICENSE
  CPython 3.12                python/ (LICENSE.txt, or lib/python3.12/LICENSE.txt), the PSF licence;
                              python-build-standalone's build
  PyTorch and torchvision     BSD-3-Clause; in python's site-packages, torch-*.dist-info and
                              torchvision-*.dist-info
  NVIDIA CUDA libraries       in the Windows and Linux downloads. NVIDIA's own software, not covered
                              by LazyLabel's licence: used under NVIDIA's agreements, which let an
                              application ship these files unmodified. cuBLAS, cuFFT, cuRAND, cuSOLVER,
                              cuSPARSE, the CUDA runtime, NVRTC, nvJitLink, CUPTI, NVTX and cuFile:
                              CUDA Toolkit EULA, https://docs.nvidia.com/cuda/eula/index.html
                              cuDNN: https://docs.nvidia.com/deeplearning/cudnn/backend/latest/reference/eula.html
                              cuSPARSELt (Linux): https://docs.nvidia.com/cuda/cusparselt/license.html
                              NVSHMEM (Linux): https://docs.nvidia.com/nvshmem/api/latest/sla.html
                              NCCL (Linux) is BSD-licensed open source.
                              On Windows they are inside PyTorch's own folder, python/Lib/site-packages/
                              torch/lib. On Linux they are the nvidia-* packages under python/lib/
                              python3.12/site-packages/nvidia, each with its licence text in its
                              dist-info folder. NVIDIA's files that its CUDA agreement does not list
                              are left out: CUPTI's profiling helpers, cuSOLVER's multi-GPU library,
                              Triton, which carries NVIDIA developer tools, and NVIDIA's header files.
                              Only NVIDIA's runtime libraries are included.
  SAM 2                       Apache-2.0, licenses/SAM-2.txt; its cc_torch code BSD-3-Clause,
                              licenses/SAM-2-cc_torch.txt
  Segment Anything            Apache-2.0, segment_anything-*.dist-info
  SAM 2.1 large checkpoint    models/sam2.1_hiera_large.pt, Meta, Apache-2.0 (as SAM 2)
  MobileNetV3 small weights   models/mobilenet_v3_small-047dcff4.pth, torchvision's, BSD-3-Clause
  Every other Python package  its own *.dist-info folder in python's site-packages
  Every Node package          its own folder under app/node_modules

LazyLabel itself: LICENSE.txt.
`;

function copyFile(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
}

/** `keep` sees each path relative to `from`, so the work folder's own name cannot filter anything. */
function copyTree(from, to, keep) {
  if (!existsSync(from)) fail(`${from} is missing: the build did not make it.`);
  // dereference: a link inside a package becomes the file it names, since a zip unpacked on
  // Windows cannot hold a link, and cpSync would otherwise point it back into the work folder.
  cpSync(from, to, { recursive: true, dereference: true, filter: (file) => keep(path.relative(from, file)) });
}

function run(command, args, { cwd = WORKSPACE, capture = false, env = {} } = {}) {
  // npm is npm.cmd on Windows, which Node starts only through a shell; these arguments need no quoting.
  const npm = command === "npm" && IS_WINDOWS;
  const result = spawnSync(npm ? "npm.cmd" : command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: npm,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) fail(`${command} did not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  return capture ? result.stdout : "";
}

/** Windows' own tar by its full path: Git's GNU tar, often earlier on the PATH, cannot read a zip. */
function tar() {
  return IS_WINDOWS ? path.join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "tar.exe") : "tar";
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`${url} answered ${response.status} ${response.statusText}.`);
  return Buffer.from(await response.arrayBuffer());
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function folderSize(folder) {
  let bytes = 0;
  let files = 0;
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    bytes += statSync(path.join(entry.parentPath, entry.name)).size;
    files += 1;
  }
  return { bytes, files };
}

function megabytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

/** On a GitHub runner, a line of the build as an annotation, which anyone can read; a job's log needs signing in. */
function notice(text) {
  if (process.env["GITHUB_ACTIONS"] !== "true") return;
  console.log(`::notice title=release build::${text.trim().replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`);
}

function fail(message) {
  console.error(message);
  if (process.env["GITHUB_ACTIONS"] === "true") {
    console.log(`::error title=release build::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`);
  }
  process.exit(1);
}

await main();
