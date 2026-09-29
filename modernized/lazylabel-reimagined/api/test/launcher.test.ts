/**
 * The launcher's decisions: DEPLOYABILITY.md R4, for F4, F8 and F9.
 *
 * `cli.ts` is the process and has no logic of its own worth a test; everything it decides is in
 * `launcher.ts`, and these tests hold it to what was measured on 2026-09-26: what npm and
 * PowerShell actually deliver to a script, the Node releases that have `node:sqlite`, and what a
 * directory junction does to an entry guard.
 */

import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  appUrl,
  browserCommand,
  busyPortAdvice,
  describeStartFailure,
  folderProblem,
  freePortNear,
  isEntryPoint,
  nodeVersionProblem,
  parseArguments,
  sameFolder,
  whatHoldsPort,
} from "../src/launcher.js";

const HERE = path.resolve("/work/modernized");

function parse(args: string[], env: Record<string, string> = {}, platform: NodeJS.Platform = "linux") {
  return parseArguments(args, { cwd: HERE, env, platform });
}

function launched(args: string[], env: Record<string, string> = {}, platform: NodeJS.Platform = "linux") {
  const parsed = parse(args, env, platform);
  if (parsed.kind !== "launch") throw new Error(`expected a launch, got ${JSON.stringify(parsed)}`);
  return parsed.options;
}

function refused(args: string[], env: Record<string, string> = {}, platform: NodeJS.Platform = "linux"): string {
  const parsed = parse(args, env, platform);
  if (parsed.kind !== "error") throw new Error(`expected an error, got ${JSON.stringify(parsed)}`);
  return parsed.message;
}

describe("the Node version", () => {
  it.each(["22.13.0", "v22.13.1", "22.17.0", "23.4.0", "24.0.0", "26.1.0"])("accepts %s", (version) => {
    expect(nodeVersionProblem(version)).toBeNull();
  });

  it.each(["22.12.0", "22.0.0", "23.3.0", "20.18.1", "18.20.4"])(
    "refuses %s, which has no node:sqlite without a flag, and says what to install",
    (version) => {
      // What these users got before: `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module:
      // node:sqlite`, reproduced with --no-experimental-sqlite (walkthrough step 23).
      const problem = nodeVersionProblem(version);

      expect(problem).toContain("22.13");
      expect(problem).toContain(version);
      expect(problem).toContain("https://nodejs.org/");
    },
  );
});

describe("the command line", () => {
  it("takes the folder as its one argument, which reaches it intact from every shell", () => {
    // `npm start "C:\my images"` delivered ["C:\\my images"] through npm in bash, PowerShell and cmd.
    const options = launched(["my images"]);

    expect(options.env["LAZYLABEL_DATASET_ROOT"]).toBe(path.resolve(HERE, "my images"));
    expect(options.open).toBe(true);
  });

  it("resolves a relative folder against where the command was typed, not where npm runs it", () => {
    expect(launched(["../pictures"]).env["LAZYLABEL_DATASET_ROOT"]).toBe(path.resolve(HERE, "..", "pictures"));
  });

  it("falls back to LAZYLABEL_DATASET_ROOT, leaving it to the configuration", () => {
    expect(launched([], { LAZYLABEL_DATASET_ROOT: "/data" }).env["LAZYLABEL_DATASET_ROOT"]).toBeUndefined();
  });

  it("launches with no folder when none is named, for the app's Open Image Folder to choose", () => {
    // It asked, with the system's dialog or in the terminal, before anything started, until the
    // owner's words of 2026-09-29: "why is that a part of the launch? in the gui the user should be
    // able to select a folder to load". Legacy starts with no folder open (right_panel.py:112-114).
    const options = launched([]);

    expect(options.env["LAZYLABEL_DATASET_ROOT"]).toBeUndefined();
    expect(options.open).toBe(true);
    expect(launched(["--no-open", "--port", "8790"]).env).toEqual({ LAZYLABEL_PORT: "8790" });
  });

  it("has no --choose-folder any more, which asked before the launch", () => {
    expect(refused(["--choose-folder"])).toMatch(/There is no option --choose-folder/);
  });

  it("turns each option into the variable the API reads, in both spellings", () => {
    const options = launched(["pics", "--port", "8790", "--host=0.0.0.0", "--inference", "http://127.0.0.1:8788"]);

    expect(options.env).toMatchObject({
      LAZYLABEL_PORT: "8790",
      LAZYLABEL_HOST: "0.0.0.0",
      LAZYLABEL_INFERENCE_URL: "http://127.0.0.1:8788",
    });
  });

  it("resolves a settings file against where the command was typed, and keeps :memory: as it is", () => {
    expect(launched(["pics", "--db", "settings.db"]).env["LAZYLABEL_DB"]).toBe(path.resolve(HERE, "settings.db"));
    expect(launched(["pics", "--db", ":memory:"]).env["LAZYLABEL_DB"]).toBe(":memory:");
  });

  it("can leave the browser closed and log every request", () => {
    const options = launched(["pics", "--no-open", "--verbose"]);

    expect(options.open).toBe(false);
    expect(options.verbose).toBe(true);
  });

  it("asks for help", () => {
    expect(parse(["--help"]).kind).toBe("help");
    expect(parse(["pics", "-h"]).kind).toBe("help");
  });

  it("takes everything after -- as the folder, even a name that starts with a dash", () => {
    expect(launched(["--", "-scans"]).env["LAZYLABEL_DATASET_ROOT"]).toBe(path.resolve(HERE, "-scans"));
  });

  it("names an option it does not know", () => {
    expect(refused(["pics", "--prot", "8790"])).toMatch(/no option --prot/);
  });

  it("says what an option is missing", () => {
    expect(refused(["pics", "--port"])).toMatch(/--port needs a value/);
    expect(refused(["pics", "--db", "--no-open"])).toMatch(/--db needs a value/);
  });

  it("refuses a port that is not one, in the option's own words", () => {
    expect(refused(["pics", "--port", "eight"])).toMatch(/--port needs a port number.*"eight"/);
    expect(refused(["pics", "--port=70000"])).toMatch(/--port needs a port number/);
  });

  it("refuses two folders, and says to quote a path with a space in it", () => {
    // `npm start C:\my images` delivers ["C:\\my", "images"].
    expect(refused(["C:\\my", "images"])).toMatch(/one folder.*quotes/);
  });

  it("opens a folder dropped on the release zip's launcher, which arrives as its argument", () => {
    const dropped = launched(["C:\\my images"], {}, "win32");

    expect(dropped.env["LAZYLABEL_DATASET_ROOT"]).toBe(path.resolve(HERE, "C:\\my images"));
  });

  it("explains the option PowerShell's npm swallowed, from the number it left behind", () => {
    // `npm start -- "C:\my images" --port 9000` in PowerShell delivered ["C:\\my images", "9000"]:
    // npm.ps1 drops the `--`, and npm keeps `--port` for itself.
    const message = refused(["C:\\my images", "9000"], {}, "win32");

    expect(message).toContain("PowerShell");
    expect(message).toContain(".\\lazylabel.cmd");
  });

  describe("on Windows, a folder that ends in a backslash", () => {
    // PowerShell 5.1 passes "C:\my images\" on as written, and the program reads \" as a quote.
    it("arrives with a stray quote, which is dropped", () => {
      // Measured through npm start: ["C:\\my images\""].
      const options = launched(['C:\\my images"'], {}, "win32");

      expect(options.env["LAZYLABEL_DATASET_ROOT"]).toBe(path.resolve(HERE, "C:\\my images"));
    });

    it("swallows the options after it, which are recovered", () => {
      // Measured through lazylabel.cmd: ["C:\\my images\" --port 9000"].
      const options = launched(['C:\\my images" --port 9000 --no-open'], {}, "win32");

      expect(options.env["LAZYLABEL_DATASET_ROOT"]).toBe(path.resolve(HERE, "C:\\my images"));
      expect(options.env["LAZYLABEL_PORT"]).toBe("9000");
      expect(options.open).toBe(false);
    });

    it("is left alone elsewhere, where a quote can be part of a name", () => {
      expect(launched(['odd"name'], {}, "linux").env["LAZYLABEL_DATASET_ROOT"]).toBe(path.resolve(HERE, 'odd"name'));
    });
  });
});

describe("the address to open", () => {
  it("is the configured one", () => {
    expect(appUrl("127.0.0.1", 8787)).toBe("http://127.0.0.1:8787/");
    expect(appUrl("localhost", 8790)).toBe("http://localhost:8790/");
  });

  it("is loopback for a server on every interface, which a browser cannot open as such", () => {
    expect(appUrl("0.0.0.0", 8787)).toBe("http://127.0.0.1:8787/");
    expect(appUrl("::", 8787)).toBe("http://[::1]:8787/");
  });

  it("brackets an IPv6 address", () => {
    expect(appUrl("::1", 8787)).toBe("http://[::1]:8787/");
  });
});

describe("opening the browser", () => {
  const url = "http://127.0.0.1:8787/";

  it("uses start on Windows, whose first quoted argument is a window title", () => {
    expect(browserCommand("win32", url)).toEqual({ command: "cmd.exe", args: ["/d", "/c", "start", '""', url] });
  });

  it("uses open on macOS and xdg-open elsewhere", () => {
    expect(browserCommand("darwin", url)).toEqual({ command: "open", args: [url] });
    expect(browserCommand("linux", url)).toEqual({ command: "xdg-open", args: [url] });
  });
});

describe("whether a module is the process's entry point", () => {
  let scratch: string;
  let real: string;
  let throughJunction: string;

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(path.join(tmpdir(), "lazylabel-entry-")));
    await mkdir(path.join(scratch, "real"));
    real = path.join(scratch, "real", "main.js");
    await writeFile(real, "");
    // A junction, as walkthrough step 22 used; on Linux and macOS this makes a symbolic link.
    await symlink(path.join(scratch, "real"), path.join(scratch, "linked"), "junction");
    throughJunction = path.join(scratch, "linked", "main.js");
  });
  afterAll(() => rm(scratch, { recursive: true, force: true }));

  it("is true when started through a directory junction, where the old guard was false and the API exited 0 silently", () => {
    // Node gives a module its REAL path; argv[1] is the path as typed.
    const moduleUrl = pathToFileURL(real).href;

    expect(moduleUrl === pathToFileURL(throughJunction).href).toBe(false);
    expect(isEntryPoint(moduleUrl, throughJunction)).toBe(true);
  });

  it("is true for the module itself", () => {
    expect(isEntryPoint(pathToFileURL(real).href, real)).toBe(true);
  });

  it("is false for another module, and when the process has no script", () => {
    expect(isEntryPoint(pathToFileURL(real).href, path.join(scratch, "other.js"))).toBe(false);
    expect(isEntryPoint(pathToFileURL(real).href, undefined)).toBe(false);
  });
});

describe("a port that is taken", () => {
  const servers: Server[] = [];

  async function serve(answer: (url: string) => { status: number; body: string }): Promise<number> {
    const server = createHttpServer((incoming, outgoing) => {
      const { status, body } = answer(incoming.url ?? "/");
      outgoing.writeHead(status, { "content-type": "application/json" });
      outgoing.end(body);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  }

  afterAll(async () => {
    for (const server of servers) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("is recognised as LazyLabel, with the folder it serves, from its /health", async () => {
    const port = await serve((url) =>
      url === "/health"
        ? { status: 200, body: JSON.stringify({ status: "ok", dataset: "ok", datasetRoot: "/data/scans" }) }
        : { status: 404, body: "{}" },
    );

    expect(await whatHoldsPort(appUrl("127.0.0.1", port))).toEqual({ kind: "lazylabel", datasetRoot: "/data/scans" });
  });

  it("is recognised as LazyLabel with no folder open yet, which its /health says as null", async () => {
    const port = await serve((url) =>
      url === "/health"
        ? { status: 200, body: JSON.stringify({ status: "ok", dataset: "none", datasetRoot: null }) }
        : { status: 404, body: "{}" },
    );

    expect(await whatHoldsPort(appUrl("127.0.0.1", port))).toEqual({ kind: "lazylabel", datasetRoot: null });
  });

  it("is another program when /health says anything else", async () => {
    const port = await serve(() => ({ status: 200, body: JSON.stringify({ ok: true }) }));

    expect(await whatHoldsPort(appUrl("127.0.0.1", port))).toEqual({ kind: "other" });
  });

  it("is another program when nothing there speaks HTTP", async () => {
    const free = await freePortNear(40000, "127.0.0.1", []);

    expect(await whatHoldsPort(appUrl("127.0.0.1", free!))).toEqual({ kind: "other" });
  });

  it("has a free port near it, never one it was told to leave alone", async () => {
    const taken = await serve(() => ({ status: 200, body: "{}" }));
    const next = await freePortNear(taken, "127.0.0.1", [taken + 1]);

    expect(next).not.toBeNull();
    expect(next).not.toBe(taken);
    expect(next).not.toBe(taken + 1);
    expect(next! > taken).toBe(true);
  });

  it("is explained with the command that starts LazyLabel elsewhere, per platform", () => {
    const windows = busyPortAdvice({
      port: 8787,
      folder: "C:\\scans",
      holder: { kind: "other" },
      freePort: 8789,
      platform: "win32",
    });
    const posix = busyPortAdvice({
      port: 8787,
      folder: "/scans",
      holder: { kind: "lazylabel", datasetRoot: "/elsewhere" },
      freePort: 8789,
      platform: "linux",
    });

    expect(windows).toContain("another program");
    expect(windows).toContain('.\\lazylabel.cmd "C:\\scans" --port 8789');
    expect(posix).toContain("another LazyLabel, for /elsewhere");
    expect(posix).toContain('./lazylabel.sh "/scans" --port 8789');
  });

  it("is explained without a folder when neither this start nor the LazyLabel holding it has one", () => {
    const advice = busyPortAdvice({
      port: 8787,
      folder: null,
      holder: { kind: "lazylabel", datasetRoot: null },
      freePort: 8789,
      platform: "linux",
    });

    expect(advice).toContain("Port 8787 is in use by another LazyLabel. Stop that one");
    expect(advice).toContain("./lazylabel.sh --port 8789");
  });

  it("is explained as reserved when the system refuses it, which Windows does for whole ranges", () => {
    const advice = busyPortAdvice({
      port: 8787,
      folder: "C:\\scans",
      holder: { kind: "reserved" },
      freePort: null,
      platform: "win32",
    });

    expect(advice).toContain("excludedportrange");
    expect(advice).toContain("--port <another port>");
  });

  it("is one sentence where the API reported a stack trace before (walkthrough step 21)", () => {
    const busy = Object.assign(new Error("listen EADDRINUSE: address already in use 127.0.0.1:8787"), {
      code: "EADDRINUSE",
      syscall: "listen",
      address: "127.0.0.1",
      port: 8787,
    });

    expect(describeStartFailure(busy)).toBe(
      "port 8787 on 127.0.0.1 is already in use: is LazyLabel already running? Choose another port with LAZYLABEL_PORT.",
    );
    expect(describeStartFailure(new Error("the dataset root /x is not a readable directory"))).toBe(
      "the dataset root /x is not a readable directory",
    );
  });
});

describe("the folder of images", () => {
  let scratch: string;

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "lazylabel-folder-"));
    await writeFile(path.join(scratch, "image.png"), "");
  });
  afterAll(() => rm(scratch, { recursive: true, force: true }));

  it("is fine when it is a folder", () => {
    expect(folderProblem(scratch)).toBeNull();
  });

  it("is named when it is not there, with the likeliest reason", () => {
    const missing = path.join(scratch, "my images");

    expect(folderProblem(missing)).toBe(
      `There is no folder at ${missing}. Check the path, and put it in quotes if it has a space in it.`,
    );
  });

  it("is named when it is a file", () => {
    expect(folderProblem(path.join(scratch, "image.png"))).toMatch(/is a file/);
  });
});

describe("the same folder", () => {
  it("ignores case where the file system does", () => {
    expect(sameFolder("C:\\Data\\Scans", "c:\\data\\scans", "win32")).toBe(true);
    expect(sameFolder("/data/Scans", "/data/scans", "linux")).toBe(false);
  });
});
