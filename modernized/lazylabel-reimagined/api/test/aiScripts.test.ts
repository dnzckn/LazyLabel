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
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defaultModelDir, nodeVersionProblem } from "../src/launcher.js";

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

type Finding = { readonly ok: boolean | null; readonly what: string; readonly fix?: string };

interface Doctor {
  checkNode(version: string): Finding;
  checkSqlite(): Promise<Finding>;
  checkBuilds(modernized: string): Finding;
  checkPort(port: number, host?: string, platform?: NodeJS.Platform): Promise<Finding>;
  checkFolder(folder: string | undefined): Finding;
  checkSettings(env: Record<string, string>, home: string): Finding;
  render(findings: readonly Finding[]): string;
}

describe("npm run doctor", () => {
  let doctor: Doctor;
  let scratch: string;
  const servers: (Server | HttpServer)[] = [];

  beforeAll(async () => {
    doctor = (await import(pathToFileURL(path.join(MODERNIZED, "scripts", "lib", "doctor.mjs")).href)) as Doctor;
    scratch = await mkdtemp(path.join(tmpdir(), "lazylabel-doctor-"));
  });
  afterAll(async () => {
    for (const server of servers) if ("closeAllConnections" in server) server.closeAllConnections();
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    await rm(scratch, { recursive: true, force: true });
  });

  async function listen(server: Server | HttpServer): Promise<number> {
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  }

  it("is a script of the workspace, and the file it runs is there", () => {
    expect(scripts["doctor"]).toBe("node scripts/doctor.mjs");
    expect(existsSync(path.join(MODERNIZED, "scripts", "doctor.mjs"))).toBe(true);
  });

  it.each(["22.13.0", "22.17.0", "23.4.0", "24.1.0", "22.12.0", "20.18.1", "23.3.0"])(
    "judges Node %s as npm start does",
    (version) => {
      expect(doctor.checkNode(version).ok).toBe(nodeVersionProblem(version) === null);
    },
  );

  it("says where to get a Node that is new enough", () => {
    expect(doctor.checkNode("20.18.1")).toEqual({
      ok: false,
      what: "Node.js 20.18.1 is too old: LazyLabel needs 22.13 or later",
      fix: "install the current LTS from https://nodejs.org/",
    });
  });

  it("finds node:sqlite, where settings are kept, on this Node", async () => {
    expect((await doctor.checkSqlite()).ok).toBe(true);
  });

  it("says npm install when nothing is built, and npm run build when only the builds are missing", async () => {
    const empty = path.join(scratch, "fresh-clone");
    await mkdir(empty);
    const fresh = doctor.checkBuilds(empty);
    expect(fresh.ok).toBe(false);
    expect(fresh.what).toContain("the annotation format library");
    expect(fresh.fix).toBe(`npm install, in ${empty} (it builds everything)`);

    await mkdir(path.join(empty, "node_modules"));
    expect(doctor.checkBuilds(empty).fix).toBe(`npm run build, in ${empty}`);
  });

  it("finds a free port free, and names another for a port another program holds", async () => {
    // Another program: it takes the connection and says nothing a browser would understand.
    const taken = await listen(createServer((socket) => socket.destroy()));
    const busy = await doctor.checkPort(taken, "127.0.0.1", "linux");
    expect(busy.ok).toBe(false);
    expect(busy.what).toBe(`port ${taken} is in use by another program`);
    expect(busy.fix).toMatch(/^start LazyLabel on another port, from the modernized folder: \.\/lazylabel\.sh "<folder>" --port \d+$/);

    const free = Number(/--port (\d+)$/.exec(busy.fix!)![1]);
    expect(await doctor.checkPort(free)).toEqual({ ok: true, what: `port ${free} is free` });
  });

  it("is content when the port is LazyLabel's own, already running", async () => {
    const port = await listen(
      createHttpServer((_request, response) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ status: "ok", dataset: "ok", datasetRoot: "/images" }));
      }),
    );
    expect(await doctor.checkPort(port)).toEqual({
      ok: true,
      what: `LazyLabel is already running at http://127.0.0.1:${port}/, for /images`,
    });
  });

  it("checks the folder of images when one is named", async () => {
    const file = path.join(scratch, "a-file.png");
    await writeFile(file, "");
    expect(doctor.checkFolder(undefined).ok).toBeNull();
    expect(doctor.checkFolder(path.join(scratch, "nowhere")).ok).toBe(false);
    expect(doctor.checkFolder(file)).toEqual({ ok: false, what: `${file} is a file`, fix: "name the folder that holds your images" });
    expect(doctor.checkFolder(scratch).ok).toBe(true);
  });

  it("checks settings can be written where npm start keeps them, leaving nothing behind", async () => {
    const home = path.join(scratch, "home");
    await mkdir(home);
    expect(doctor.checkSettings({}, home)).toEqual({
      ok: true,
      what: `settings can be written to ${path.join(home, ".config", "lazylabel", "lazylabel-web.db")}`,
    });
    expect(await readdir(home)).toEqual([]);
    expect(doctor.checkSettings({ LAZYLABEL_DB: ":memory:" }, home).ok).toBe(true);

    const file = path.join(scratch, "not-a-folder");
    await writeFile(file, "");
    const blocked = doctor.checkSettings({ LAZYLABEL_DB: path.join(file, "settings", "lazylabel.db") }, home);
    expect(blocked.ok).toBe(false);
    expect(blocked.fix).toBe("set LAZYLABEL_DB, or --db, to a file this user can write");
  });

  it("marks each line, and puts the fix under a failure", () => {
    expect(
      doctor.render([
        { ok: true, what: "port 8787 is free" },
        { ok: false, what: "not built: the API", fix: "npm run build" },
        { ok: null, what: "the AI tools are not installed" },
      ]),
    ).toBe(
      ["  OK    port 8787 is free", "  FAIL  not built: the API", "        fix: npm run build", "  --    the AI tools are not installed"].join(
        "\n",
      ),
    );
  });
});
