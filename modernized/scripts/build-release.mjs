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

const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = process.platform === "win32";
const OS_NAME = { win32: "windows", darwin: "macos", linux: "linux" }[process.platform];
const CLI = ["app", "lazylabel-reimagined", "api", "dist", "src", "cli.js"];
const REPOSITORY = "https://github.com/dnzckn/LazyLabel";

async function main() {
  if (OS_NAME === undefined) fail(`There is no release zip for ${process.platform}.`);
  const options = parseOptions(process.argv.slice(2));
  const nodeVersion = options.node.replace(/^v/, "");
  const name = `LazyLabel-web-${OS_NAME}-${process.arch}`;

  mkdirSync(options.work, { recursive: true });
  const work = realpathSync(options.work);

  console.log(`Building ${name}.zip with Node.js ${nodeVersion}, in ${work}`);
  const source = buildApp(path.join(work, "source"));
  const node = await portableNode(nodeVersion, path.join(work, "cache"));
  const stage = path.join(work, "stage", name);
  rmSync(path.dirname(stage), { recursive: true, force: true });
  stageRelease(source, node, stage);
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
  const parsed = { out: path.join(WORKSPACE, "release"), work: path.join(os.tmpdir(), "lazylabel-release"), node: process.versions.node };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index].replace(/^--/, "");
    const value = args[index + 1];
    if (!(option in parsed) || value === undefined) {
      fail("Usage: node scripts/build-release.mjs [--out <folder>] [--work <folder>] [--node <version>]");
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
function stageRelease(source, node, stage) {
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
  writeFileSync(path.join(stage, "README.txt"), README.replace(/\n/g, IS_WINDOWS ? "\r\n" : "\n"));
  if (IS_WINDOWS) {
    writeFileSync(path.join(stage, "Start LazyLabel.cmd"), WINDOWS_LAUNCHER.replace(/\n/g, "\r\n"));
  } else {
    const launcher = path.join(stage, process.platform === "darwin" ? "Start LazyLabel.command" : "start-lazylabel.sh");
    writeFileSync(launcher, posixLauncher(process.platform === "darwin"), { mode: 0o755 });
  }
}

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

const WINDOWS_LAUNCHER = `@echo off
rem LazyLabel, with nothing to install. Double-click this file and choose your folder of images,
rem or drop the folder onto this file. LazyLabel opens in your browser and runs until this window
rem is closed. Options go after the folder, as in:
rem   "Start LazyLabel.cmd" "C:\\path\\to\\images" --port 8790
title LazyLabel
"%~dp0node\\node.exe" "%~dp0${CLI.join("\\")}" --choose-folder %*
if errorlevel 1 pause
`;

function posixLauncher(macos) {
  return `#!/bin/sh
# LazyLabel, with nothing to install. ${macos ? "Double-click this file in the Finder" : "Run ./start-lazylabel.sh in a terminal"}
# and choose your folder of images, or name the folder after the command. LazyLabel opens in your
# browser and runs until this window is closed or Ctrl+C is pressed. Options go after the folder,
# as in: ${macos ? "./Start\\ LazyLabel.command" : "./start-lazylabel.sh"} "/path/to/images" --port 8790
here=$(cd "$(dirname "$0")" && pwd)
${
  macos
    ? `# macOS quarantines everything unzipped from a download, and would refuse the image library
# LazyLabel loads, which Apple has not notarised. Running this file is the consent to trust the
# folder it came in, so the mark comes off the whole folder at once.
xattr -dr com.apple.quarantine "$here" 2>/dev/null
`
    : ""
}"$here/node/bin/node" "$here/${CLI.join("/")}" --choose-folder "$@"
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

Choose your folder of images when LazyLabel asks. It opens in your browser at
http://127.0.0.1:8787/ and runs until you close its window (or press Ctrl+C in it). You can
also drop a folder onto the launcher, or name it after the command.

Your annotations are saved beside your images, in the files the desktop app reads and writes.
Settings and hotkeys are kept per user. LazyLabel listens on this computer only.

Options go after the folder: --port <number>, --no-open, --help.

The AI tools (SAM) are not in this download. To add them, install LazyLabel from the source:
${REPOSITORY}/tree/main-web#adding-the-ai-tools-sam
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

function run(command, args, { cwd = WORKSPACE, capture = false } = {}) {
  // npm is npm.cmd on Windows, which Node starts only through a shell; these arguments need no quoting.
  const npm = command === "npm" && IS_WINDOWS;
  const result = spawnSync(npm ? "npm.cmd" : command, args, {
    cwd,
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

function fail(message) {
  console.error(message);
  process.exit(1);
}

await main();
