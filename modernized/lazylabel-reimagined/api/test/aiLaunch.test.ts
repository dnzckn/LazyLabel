/**
 * `npm start` starts the AI tools that are installed: DEPLOYABILITY.md R8.
 *
 * AI took a second terminal, a Python command and three environment variables that had to agree
 * with the API's, the dataset root among them, set twice. Now `cli.ts` decides from what is on disk
 * (`aiPlan`), starts the inference service as its child (`startAiService`) and shows its lines
 * marked as its own (`aiLogLine`). `cli.ts` is the process and holds no logic worth a test; these
 * hold the decisions, and the child's lifecycle is driven here with Node standing in for Python.
 */

import { createServer, type Server } from "node:net";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startAiService, type AiService } from "../src/aiService.js";
import { aiLogLine, aiPlan, freePort } from "../src/launcher.js";

const INFERENCE = "/work/modernized/lazylabel-reimagined/inference";
const VENV_PYTHON = `${INFERENCE}/.venv/bin/python`;
const MODELS = "/home/me/.local/share/lazylabel/models";

function plan(env: Record<string, string>, present: readonly string[], platform: NodeJS.Platform = "linux") {
  return aiPlan({ env, platform, home: "/home/me", inference: INFERENCE, exists: (file) => present.includes(file) });
}

describe("whether npm start starts the AI tools", () => {
  it("does not before npm run ai:setup, and says to run it", () => {
    // Until 2026-09-26 the banner said "off: no inference service is set", and the fix was a
    // README section of Python commands.
    expect(plan({}, [`${INFERENCE}/pyproject.toml`])).toEqual({ kind: "off", reason: "run npm run ai:setup" });
  });

  it("does not in the release zip, and names no command there is no npm to run", () => {
    // The zip carries the API and the web app, not the inference package (DEPLOYABILITY.md R11).
    expect(plan({}, [])).toEqual({ kind: "off", reason: "not in this download (README.txt says how to add them)" });
  });

  it("does not before a model is fetched, and says which command fetches one", () => {
    expect(plan({}, [VENV_PYTHON])).toEqual({
      kind: "off",
      reason: `no models in ${MODELS} yet: run npm run ai:models sam2.1-large`,
    });
  });

  it("does once both are there, with the environment's Python, from the package's source folder", () => {
    expect(plan({}, [VENV_PYTHON, `${MODELS}/manifest.json`])).toEqual({
      kind: "start",
      python: VENV_PYTHON,
      modelDir: MODELS,
      cwd: `${INFERENCE}/src`,
    });
  });

  it("finds the Windows environment where uv puts it, and the models in LOCALAPPDATA", () => {
    const inference = "C:\\LazyLabel\\modernized\\lazylabel-reimagined\\inference";
    const python = `${inference}\\.venv\\Scripts\\python.exe`;
    const models = "C:\\Users\\me\\AppData\\Local\\LazyLabel\\models";
    const decided = aiPlan({
      env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
      platform: "win32",
      home: "C:\\Users\\me",
      inference,
      exists: (file) => [python, `${models}\\manifest.json`].includes(file),
    });
    expect(decided).toEqual({ kind: "start", python, modelDir: models, cwd: `${inference}\\src` });
  });

  it("uses the Python, the model folder and the manifest the environment names", () => {
    const python = path.resolve("/opt/ai/bin/python");
    const models = path.resolve("/srv/models");
    const manifest = path.resolve("/srv/manifests/lazylabel.json");
    const env = { LAZYLABEL_PYTHON: python, LAZYLABEL_MODEL_DIR: models, LAZYLABEL_MODEL_MANIFEST: manifest };

    expect(plan(env, [python, manifest])).toEqual({ kind: "start", python, modelDir: models, cwd: `${INFERENCE}/src` });
    expect(plan({ LAZYLABEL_PYTHON: python }, [VENV_PYTHON])).toEqual({
      kind: "off",
      reason: `LAZYLABEL_PYTHON names ${python}, which is not there`,
    });
  });

  it("starts none when a running service is named, and uses that", () => {
    expect(plan({ LAZYLABEL_INFERENCE_URL: "http://gpu-box:8788" }, [VENV_PYTHON, `${MODELS}/manifest.json`])).toEqual({
      kind: "external",
      url: "http://gpu-box:8788",
    });
  });
});

describe("the AI tools' lines, as npm start shows them", () => {
  const handled = '{"level": "info", "message": "request handled", "status": 200, "correlationId": "c1"}';

  it("are marked as the service's", () => {
    const listening = '{"level": "info", "message": "listening", "host": "127.0.0.1", "port": 8788}';
    expect(aiLogLine(listening, false)).toBe(`[ai] ${listening}`);
    expect(aiLogLine("Traceback (most recent call last):", false)).toBe("[ai] Traceback (most recent call last):");
  });

  it("leave out a line per request, as the API's do, unless --verbose", () => {
    expect(aiLogLine(handled, false)).toBeNull();
    expect(aiLogLine(handled, true)).toBe(`[ai] ${handled}`);
    const failed = '{"level": "warn", "message": "request failed", "status": 503, "code": "model_unavailable"}';
    expect(aiLogLine(failed, false)).toBe(`[ai] ${failed}`);
    expect(aiLogLine("   ", true)).toBeNull();
  });
});

describe("the inference service's port", () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  });

  async function listening(port = 0): Promise<number> {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
    return (server.address() as { port: number }).port;
  }

  it("is its default when that is free, and one near it when not, never one it must leave alone", async () => {
    const taken = await listening();
    const near = await freePort(taken, "127.0.0.1", []);
    expect(near).not.toBeNull();
    expect(near).not.toBe(taken);
    expect(near!).toBeGreaterThan(taken);

    const free = near!;
    expect(await freePort(free, "127.0.0.1", [])).toBe(free);
    expect(await freePort(free, "127.0.0.1", [free])).not.toBe(free);
  });
});

describe("the inference service as npm start's child", () => {
  const started: AiService[] = [];
  afterEach(async () => {
    await Promise.all(started.splice(0).map((service) => service.stop()));
  });

  /** Node, standing in for `python -m lazylabel_inference.server`, running `script`. */
  function standIn(script: string, lines: string[], readyTimeoutMs?: number) {
    return startAiService({
      command: process.execPath,
      args: ["-e", script],
      cwd: process.cwd(),
      env: { ...process.env, LAZYLABEL_DATASET_ROOT: "/data" },
      host: "127.0.0.1",
      port: 18999,
      onLine: (line) => lines.push(line),
      ...(readyTimeoutMs === undefined ? {} : { readyTimeoutMs }),
    });
  }

  const LISTENS = `
    console.log(JSON.stringify({ level: "info", message: "listening", host: process.env.LAZYLABEL_INFERENCE_HOST,
      port: Number(process.env.LAZYLABEL_INFERENCE_PORT), root: process.env.LAZYLABEL_DATASET_ROOT }));
    console.error("a warning on stderr");
    setInterval(() => {}, 1000);`;

  it("is ready once it says it is listening, on the port and folder it was given", async () => {
    const lines: string[] = [];
    const service = await standIn(LISTENS, lines);
    started.push(service);

    expect(service.url).toBe("http://127.0.0.1:18999");
    expect(JSON.parse(lines[0]!)).toEqual({ level: "info", message: "listening", host: "127.0.0.1", port: 18999, root: "/data" });
    await expect.poll(() => lines).toContain("a warning on stderr");
  });

  it("stops when it is told to", async () => {
    const service = await standIn(LISTENS, []);
    await service.stop();
    await expect(Promise.race([service.exited.then(() => "exited"), sleep(5000).then(() => "running")])).resolves.toBe(
      "exited",
    );
  });

  it("is not ready when it stops first, and says so, its own reason already shown", async () => {
    const lines: string[] = [];
    await expect(
      standIn('console.error("LAZYLABEL_MODEL_DIR must name the directory"); process.exit(1);', lines),
    ).rejects.toThrow("it stopped before it was ready (exit code 1)");
    expect(lines).toContain("LAZYLABEL_MODEL_DIR must name the directory");
  });

  it("is not left running when it never says it is listening", async () => {
    const lines: string[] = [];
    await expect(standIn("console.log(`pid ${process.pid}`); setInterval(() => {}, 1000);", lines, 1500)).rejects.toThrow(
      "it did not say it was listening within 2 s",
    );
    const pid = Number(lines[0]!.split(" ")[1]);
    await expect.poll(() => alive(pid), { timeout: 5000 }).toBe(false);
  });

  it("says so when its Python is not there", async () => {
    await expect(
      startAiService({
        command: path.resolve("no", "such", "python"),
        args: ["-m", "lazylabel_inference.server"],
        cwd: process.cwd(),
        env: process.env,
        host: "127.0.0.1",
        port: 18999,
        onLine: () => undefined,
      }),
    ).rejects.toThrow(/its Python could not be started/);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
