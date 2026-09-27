#!/usr/bin/env node
/**
 * DEPLOYABILITY.md R11's proof: unzip a release zip into a scratch folder, start LazyLabel from it
 * the way a user does, through its launcher, and check that the app, /api/health and an image
 * decoded by the zip's own sharp all answer. CI runs it on every zip before uploading it.
 *
 *   node scripts/release-smoke.mjs <zip, or the folder build-release.mjs wrote it to>
 *     [--dir <scratch folder>] [--images <folder of images>] [--port <number>] [--typed]
 *
 * The images are COPIED into the scratch folder, a generated one when --images is not given, and
 * settings go to a file there (--db), so nothing outside the scratch folder is touched. --typed
 * gives the folder on the launcher's standard input instead of its command line: the question the
 * launcher asks where there is no folder dialog, as on a Linux runner with no desktop. The launcher
 * is stopped afterwards; the scratch folder is left for a look.
 */

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { crc32, deflateSync } from "node:zlib";

const IS_WINDOWS = process.platform === "win32";
const LAUNCHER = { win32: "Start LazyLabel.cmd", darwin: "Start LazyLabel.command" }[process.platform] ?? "start-lazylabel.sh";

const options = parseOptions(process.argv.slice(2));
const zip = findZip(path.resolve(options.zip));
const scratch = path.resolve(options.dir ?? mkdtempSync(path.join(os.tmpdir(), "lazylabel-smoke-")));
mkdirSync(scratch, { recursive: true });
const unzipped = path.join(scratch, path.basename(zip, ".zip"));
console.log(`Unzipping ${zip} into ${scratch}`);
if (IS_WINDOWS) {
  run(path.join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", scratch]);
} else {
  run("unzip", ["-q", "-o", zip, "-d", scratch]);
}

const images = path.join(scratch, "my images");
if (options.images !== undefined) {
  cpSync(path.resolve(options.images), images, { recursive: true });
} else {
  mkdirSync(images, { recursive: true });
  writeFileSync(path.join(images, "gradient.png"), gradientPng(64, 48));
}
const imageNames = readdirSync(images).filter((file) => /\.(png|jpe?g|tiff?|bmp)$/i.test(file));
console.log(`Images (a copy): ${images}, ${imageNames.length} of them`);

const port = Number(options.port);
const db = path.join(scratch, "settings.db");
const launcher = path.join(unzipped, LAUNCHER);
if (!existsSync(launcher)) fail(`The zip has no ${LAUNCHER}.`);
const args = [...(options.typed ? [] : [images]), "--no-open", "--port", String(port), "--db", db];
console.log(`Starting ${launcher} ${options.typed ? "(folder typed at its question) " : ""}${args.join(" ")}`);

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
if (options.typed) child.stdin.write(`${images}\n`);
child.stdin.end();

let failure = null;
try {
  const url = `http://127.0.0.1:${port}/`;
  await until(() => log.includes(`LazyLabel is running at ${url}`) || exited !== null, 90_000);
  if (!log.includes(`LazyLabel is running at ${url}`)) throw new Error(`the launcher did not start LazyLabel (exit code ${exited})`);

  const page = await get(url);
  if (!page.text.includes('<div id="root">')) throw new Error(`${url} did not serve the web app`);
  console.log(`GET /             ${page.status}, the web app (${page.bytes} bytes)`);

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
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  stop(child);
  await until(() => exited !== null, 15_000);
}

if (failure !== null) fail(`FAILED: ${failure}`);
console.log(`\nPASSED: ${LAUNCHER} from ${path.basename(zip)} (${(statSync(zip).size / 1024 / 1024).toFixed(1)} MB) served the app, and stopped.`);

function parseOptions(argv) {
  const parsed = { port: "18800", typed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];
    if (word === "--typed") parsed.typed = true;
    else if (["--dir", "--images", "--port"].includes(word) && argv[index + 1] !== undefined) {
      parsed[word.slice(2)] = argv[index + 1];
      index += 1;
    } else if (!word.startsWith("--") && parsed.zip === undefined) parsed.zip = word;
    else fail(`Usage: node scripts/release-smoke.mjs <zip or folder> [--dir <folder>] [--images <folder>] [--port <n>] [--typed]`);
  }
  if (parsed.zip === undefined) fail("Name the release zip, or the folder build-release.mjs wrote it to.");
  return parsed;
}

function findZip(given) {
  if (!statSync(given).isDirectory()) return given;
  const zips = readdirSync(given).filter((file) => /^LazyLabel-web-.*\.zip$/.test(file));
  if (zips.length !== 1) fail(`${given} holds ${zips.length} release zips; name one.`);
  return path.join(given, zips[0]);
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
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) row.set([(x * 255) / width, (y * 255) / height, 128], 1 + x * 3);
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
