#!/usr/bin/env node
/**
 * DEPLOYABILITY.md R11's proof: unzip a release zip into a scratch folder, start LazyLabel from it
 * the way a user does, through its launcher, and check that the app, /api/health and an image
 * decoded by the zip's own sharp all answer. CI runs it on every zip before uploading it.
 *
 *   node scripts/release-smoke.mjs <zip, or the folder build-release.mjs wrote it to>
 *     [--dir <scratch folder>] [--images <folder of images>] [--port <number>]
 *
 * The launcher is started with no folder, as a double-click starts it, and asks nothing: the folder
 * of images is then opened as the app's Open Image Folder opens it, through POST /api/folder, with
 * the folder's path, which works on a runner with no desktop too. The images are COPIED into the
 * scratch folder, a generated one when --images is not given, and settings go to a file there (--db),
 * so nothing outside the scratch folder is touched. The launcher is stopped afterwards; the scratch
 * folder is left for a look.
 *
 * --ai TAKES THE AI BUNDLE (DEPLOYABILITY.md R12) the way a person gets it: part 1 unzipped, the other
 * parts left beside it, for the launcher to find and unpack on its first start. Then the AI tools
 * must answer through the app: SAM 2.1 segments a shape from one click, and Find Archetypes, which
 * runs the embedder, answers for the images. On a runner that is the processor, which is slow.
 */

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { NVIDIA_NOT_LISTED } from "./nvidia-files.mjs";

const IS_WINDOWS = process.platform === "win32";
const LAUNCHER = { win32: "Start LazyLabel.cmd", darwin: "Start LazyLabel.command" }[process.platform] ?? "start-lazylabel.sh";

const options = parseOptions(process.argv.slice(2));
const zip = findZip(path.resolve(options.zip), options.ai);
const scratch = path.resolve(options.dir ?? mkdtempSync(path.join(os.tmpdir(), "lazylabel-smoke-")));
mkdirSync(scratch, { recursive: true });
// A part's folder is the bundle's, without the part number.
const unzipped = path.join(scratch, path.basename(zip, ".zip").replace(/-\d+of\d+$/, ""));
console.log(`Unzipping ${zip} into ${scratch}`);
if (IS_WINDOWS) {
  run(path.join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", scratch]);
} else {
  run("unzip", ["-q", "-o", zip, "-d", scratch]);
}
// The other parts where a download leaves them: beside the folder part 1 made.
const others = options.ai ? otherParts(zip) : [];
for (const part of others) {
  const beside = path.join(scratch, path.basename(part));
  try {
    linkSync(part, beside);
  } catch {
    copyFileSync(part, beside);
  }
  console.log(`Left ${path.basename(part)} beside it, unopened`);
}

const images = path.join(scratch, "my images");
if (options.images !== undefined) {
  cpSync(path.resolve(options.images), images, { recursive: true });
} else {
  mkdirSync(images, { recursive: true });
  writeFileSync(path.join(images, "gradient.png"), gradientPng(64, 48));
  if (options.ai) {
    // A bright square on a dark ground, for SAM to find from a click in its middle, and the square
    // moving, so Find Archetypes has the five frames it needs and frames that differ.
    writeFileSync(path.join(images, "square.png"), squarePng(96, 72, [28, 20, 68, 52]));
    for (let frame = 1; frame <= 5; frame += 1) {
      const x = 4 + frame * 10;
      writeFileSync(path.join(images, `moving-${frame}.png`), squarePng(96, 72, [x, 12, x + 30, 42]));
    }
  }
}
const imageNames = readdirSync(images).filter((file) => /\.(png|jpe?g|tiff?|bmp)$/i.test(file));
console.log(`Images (a copy): ${images}, ${imageNames.length} of them`);

const port = Number(options.port);
const db = path.join(scratch, "settings.db");
const launcher = path.join(unzipped, LAUNCHER);
if (!existsSync(launcher)) fail(`The zip has no ${LAUNCHER}.`);
const args = ["--no-open", "--port", String(port), "--db", db];
console.log(`Starting ${launcher} ${args.join(" ")}`);

const child = IS_WINDOWS
  ? spawn(process.env["ComSpec"] ?? "cmd.exe", ["/d", "/s", "/c", `"${[launcher, ...args].map(quote).join(" ")}"`], {
      cwd: unzipped,
      env: { ...process.env, BROWSER: "none" },
      windowsVerbatimArguments: true,
    })
  : spawn(launcher, args, { cwd: unzipped, env: { ...process.env, BROWSER: "none" }, detached: true });
let log = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    log += chunk;
    process.stdout.write(chunk);
  });
}
let exited = null;
child.once("exit", (code) => {
  exited = code;
});
// Nothing is typed: the launcher asks nothing.
child.stdin.end();

let failure = null;
try {
  const url = `http://127.0.0.1:${port}/`;
  // With --ai the first start unpacks gigabytes and starts the inference service before the app.
  await until(() => log.includes(`LazyLabel is running at ${url}`) || exited !== null, options.ai ? 1_200_000 : 90_000);
  if (!log.includes(`LazyLabel is running at ${url}`)) throw new Error(`the launcher did not start LazyLabel (exit code ${exited})`);

  const page = await get(url);
  if (!page.text.includes('<div id="root">')) throw new Error(`${url} did not serve the web app`);
  console.log(`GET /             ${page.status}, the web app (${page.bytes} bytes)`);

  // Started with no folder open, as a double-click starts it.
  const none = await get(`${url}api/health`);
  if (!none.text.includes('"dataset":"none"')) throw new Error(`/api/health before a folder was opened said ${none.text}`);
  console.log(`GET /api/health   ${none.status}, no folder open yet: ${none.text}`);

  // The app's Open Image Folder, with the folder's path: JSON, from the app's own page.
  const opened = await post(`${url}api/folder`, { path: images }, { origin: new URL(url).origin });
  if (opened.cancelled !== false || typeof opened.datasetRoot !== "string") {
    throw new Error(`POST /api/folder answered ${JSON.stringify(opened)}`);
  }
  console.log(`POST /api/folder  opened ${opened.datasetRoot}`);

  const health = await get(`${url}api/health`);
  if (!health.text.includes('"dataset":"ok"')) throw new Error(`/api/health said ${health.text}`);
  console.log(`GET /api/health   ${health.status} ${health.text}`);

  const listing = await get(`${url}api/projects/default/images`);
  const listed = imageNames.filter((file) => listing.text.includes(JSON.stringify(file)));
  if (listed.length !== imageNames.length) throw new Error(`the image list missed some of ${imageNames.join(", ")}: ${listing.text}`);
  console.log(`GET /api/projects/default/images   ${listing.status}, ${listed.length} images`);

  const [first] = imageNames;
  if (first !== undefined) {
    const thumbnail = await get(`${url}api/projects/default/images/${encodeURIComponent(first)}/thumbnail`);
    console.log(`GET .../${first}/thumbnail   ${thumbnail.status}, ${thumbnail.type}, ${thumbnail.bytes} bytes (sharp works)`);
  }
  if (options.ai) await checkAi(url);
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  stop(child);
  await until(() => exited !== null, 15_000);
}

if (failure !== null) fail(`FAILED: ${failure}`);
const what = options.ai ? "served the app and its AI tools" : "served the app";
console.log(`\nPASSED: ${LAUNCHER} from ${path.basename(zip)} (${(statSync(zip).size / 1024 / 1024).toFixed(1)} MB) ${what}, and stopped.`);

/** The AI tools, through the app as the web app calls them: a click segmented, archetypes found. */
async function checkAi(url) {
  if (!log.includes("AI tools: on")) throw new Error("the launcher did not start the AI tools");
  // The finished bundle, every part unpacked: none of NVIDIA's files its CUDA agreement does not list,
  // and no Triton, which carries NVIDIA's developer tools (build-release.mjs, settleNvidiaFiles).
  const stray = [];
  for (const entry of readdirSync(path.join(unzipped, "python"), { recursive: true, withFileTypes: true })) {
    if ((entry.isFile() && NVIDIA_NOT_LISTED.test(entry.name)) || (entry.isDirectory() && entry.name === "triton")) {
      stray.push(path.join(entry.parentPath, entry.name));
    }
  }
  if (stray.length > 0) throw new Error(`the bundle holds files NVIDIA's agreement does not list: ${stray.join(", ")}`);
  console.log("Bundle: none of NVIDIA's unlisted files, and no Triton");
  const health = JSON.parse((await get(`${url}api/health`)).text);
  if (health.ai?.available !== true) throw new Error(`/api/health says the AI tools are not available: ${JSON.stringify(health.ai)}`);
  console.log(`GET /api/health   ai: ${JSON.stringify(health.ai)}`);

  const models = JSON.parse((await get(`${url}api/inference/models`)).text);
  const list = Array.isArray(models) ? models : models.models ?? [];
  const segmenter = list.find((model) => model.segmenter && model.present && model.verified);
  const embedder = list.find((model) => !model.segmenter && model.present && model.verified);
  if (segmenter === undefined || embedder === undefined) throw new Error(`the bundle's models are not both there: ${JSON.stringify(list)}`);
  console.log(`GET /api/inference/models   ${segmenter.name} and ${embedder.name}, present and verified`);

  const started = Date.now();
  const embedded = await post(`${url}api/inference/embeddings`, { image: "square.png", model: segmenter.name });
  const segmented = await post(`${url}api/inference/segment`, { handle: embedded.handle, points: [{ x: 48, y: 36, positive: true }] });
  const box = segmented.mask?.box;
  if (!Array.isArray(box)) throw new Error(`SAM found nothing at the square's middle: ${JSON.stringify(segmented).slice(0, 300)}`);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`POST /api/inference/segment   one click on square.png: box ${JSON.stringify(box)}, score ${segmented.score.toFixed(3)}, in ${seconds} s`);

  // The embedder runs on every frame; with seven small generated ones the answer may be none.
  const archetypes = await post(`${url}api/inference/archetypes`, { sequence: imageNames });
  if (!Array.isArray(archetypes.suggested) || typeof archetypes.clusters !== "number") {
    throw new Error(`Find Archetypes answered ${JSON.stringify(archetypes).slice(0, 300)}`);
  }
  console.log(
    `POST /api/inference/archetypes   ${imageNames.length} images embedded: ${archetypes.clusters} clusters, `
      + `${archetypes.noise} noise, suggested ${JSON.stringify(archetypes.suggested)}`,
  );
}

async function post(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(900_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function parseOptions(argv) {
  const parsed = { port: "18800", ai: false };
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];
    if (word === "--ai") parsed.ai = true;
    else if (["--dir", "--images", "--port"].includes(word) && argv[index + 1] !== undefined) {
      parsed[word.slice(2)] = argv[index + 1];
      index += 1;
    } else if (!word.startsWith("--") && parsed.zip === undefined) parsed.zip = word;
    else fail(`Usage: node scripts/release-smoke.mjs <zip or folder> [--dir <folder>] [--images <folder>] [--port <n>] [--ai]`);
  }
  if (parsed.zip === undefined) fail("Name the release zip, or the folder build-release.mjs wrote it to.");
  return parsed;
}

/** The zip to unzip: the release zip, or with --ai the AI bundle's part 1. */
function findZip(given, ai) {
  if (!statSync(given).isDirectory()) return given;
  const zips = readdirSync(given).filter((file) =>
    ai
      ? /^LazyLabel-web-ai-.*\.zip$/.test(file) && !/-\d+of\d+\.zip$/.test(file.replace(/-1of\d+\.zip$/, ".zip"))
      : /^LazyLabel-web-(?!ai-).*\.zip$/.test(file),
  );
  if (zips.length !== 1) fail(`${given} holds ${zips.length} ${ai ? "AI bundles" : "release zips"}; name one.`);
  return path.join(given, zips[0]);
}

/** The AI bundle's parts after the first, beside part 1: none when it is one zip. */
function otherParts(first) {
  const numbered = /^(.*)-1of(\d+)\.zip$/.exec(path.basename(first));
  if (numbered === null) return [];
  const [, stem, count] = numbered;
  return Array.from({ length: Number(count) - 1 }, (_, index) => {
    const part = path.join(path.dirname(first), `${stem}-${index + 2}of${count}.zip`);
    if (!existsSync(part)) fail(`${path.basename(first)} says there are ${count} parts, and ${path.basename(part)} is not beside it.`);
    return part;
  });
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${body.toString("utf8").slice(0, 300)}`);
  return { status: response.status, type: response.headers.get("content-type"), bytes: body.length, text: body.toString("utf8") };
}

/** The launcher and the Node it started: its whole process tree on Windows, its group elsewhere. */
function stop(process_) {
  if (exited !== null) return;
  if (IS_WINDOWS) spawnSync("taskkill", ["/pid", String(process_.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-process_.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

async function until(done, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
}

function quote(word) {
  return /[\s&()^|<>"]/.test(word) ? `"${word}"` : word;
}

/** A small RGB gradient as a PNG, so a runner needs no image of its own. */
function gradientPng(width, height) {
  return png(width, height, (x, y) => [(x * 255) / width, (y * 255) / height, 128]);
}

/** A dark PNG with one bright filled rectangle, [x1, y1, x2, y2] end-exclusive. */
function squarePng(width, height, [x1, y1, x2, y2]) {
  return png(width, height, (x, y) => (x >= x1 && x < x2 && y >= y1 && y < y2 ? [235, 225, 210] : [20, 30, 40]));
}

/** An 8-bit RGB PNG whose pixel at (x, y) is `colour(x, y)`. */
function png(width, height, colour) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) row.set(colour(x, y), 1 + x * 3);
    rows.push(row);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) fail(`${command} ${args.join(" ")} failed.`);
}

/** What an unzipped AI bundle holds and where its Python looks: for a failure's annotation. */
function diagnoseBundle(folder) {
  const lines = [`bundle.json: ${existsSync(path.join(folder, "bundle.json")) ? readFileSync(path.join(folder, "bundle.json"), "utf8").replace(/\s+/g, " ") : "none"}`];
  const python = path.join(folder, "python");
  lines.push(`python/: ${readdirSync(python).join(" ")}`);
  const executable = IS_WINDOWS ? path.join(python, "python.exe") : path.join(python, "bin", "python3");
  const probe = spawnSync(
    executable,
    ["-I", "-c", "import sys, sysconfig; print(sys.prefix, sys.base_prefix); print(sysconfig.get_paths()['purelib']); print(sys.path)"],
    { encoding: "utf8" },
  );
  lines.push(`python says: ${(probe.stdout ?? "").trim()} ${(probe.stderr ?? "").trim().slice(-400)}`);
  const purelib = (probe.stdout ?? "").split(/\r?\n/)[1]?.trim();
  if (purelib && existsSync(purelib)) {
    const packages = readdirSync(purelib);
    lines.push(`${purelib}: ${packages.length} entries; torch ${packages.includes("torch") ? "there" : "MISSING"}`);
  }
  return lines.join("\n");
}

function fail(message) {
  console.error(message);
  // On a GitHub runner, also as an annotation, with the launcher's last lines: a job's log needs a
  // signed-in account to read, and its annotations do not.
  if (process.env["GITHUB_ACTIONS"] === "true") {
    let tail = "";
    try {
      tail = log
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "" && !/"level": ?"info"/.test(line))
        .slice(-30)
        .join("\n");
    } catch {
      // Failed before the launcher started.
    }
    try {
      if (options.ai) tail += `\n${diagnoseBundle(unzipped)}`;
    } catch {
      // Nothing unzipped to look at.
    }
    const text = `${message}\n${tail}`.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    console.log(`::error title=release smoke::${text}`);
  }
  process.exit(1);
}
