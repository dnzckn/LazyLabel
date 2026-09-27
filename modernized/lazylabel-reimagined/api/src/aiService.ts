/**
 * The inference service as a child of `npm start` (DEPLOYABILITY.md R8).
 *
 * AI took a second terminal, a Python command, and three environment variables that had to agree
 * with the API's, the dataset root set twice. `cli.ts` now starts the service itself once
 * `npm run ai:setup` and `npm run ai:models` have been run, on a free port and with the API's own
 * folder, and stops it when LazyLabel stops. This is the process handling, apart from `cli.ts` so a
 * test can drive it with a stand-in for Python.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface AiService {
  /** Where it listens, for the API's `inferenceUrl`. */
  readonly url: string;
  /** Settles with its exit code when it stops, however it stops. */
  readonly exited: Promise<number | null>;
  /** Stop it, and settle once it has gone. */
  stop(): Promise<void>;
}

export interface AiServiceOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly host: string;
  readonly port: number;
  /** Every line it prints, standard output and standard error alike. */
  readonly onLine: (line: string) => void;
  /** How long to wait for it to say it is listening. The first start imports numpy and OpenCV. */
  readonly readyTimeoutMs?: number;
}

/**
 * Start the service, and settle once it says it is listening: its log line
 * `{"level": "info", "message": "listening", ...}` (`server.py`). Rejects, with why, when it cannot
 * be started, stops first, or says nothing in time -- and then it is not left running.
 */
export function startAiService(options: AiServiceOptions): Promise<AiService> {
  const child = spawn(options.command, [...options.args], {
    cwd: options.cwd,
    env: {
      ...options.env,
      LAZYLABEL_INFERENCE_HOST: options.host,
      LAZYLABEL_INFERENCE_PORT: String(options.port),
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const running = (): boolean => child.exitCode === null && child.signalCode === null;
  // However this process ends, the service does not outlive it.
  const kill = (): void => {
    if (running()) child.kill();
  };
  process.once("exit", kill);
  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => {
      process.removeListener("exit", kill);
      resolve(code);
    });
  });

  const host = options.host.includes(":") ? `[${options.host}]` : options.host;
  const service: AiService = {
    url: `http://${host}:${options.port}`,
    exited,
    stop: async () => {
      if (!running()) return;
      child.kill();
      const stubborn = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(stubborn);
    },
  };

  return new Promise<AiService>((resolve, reject) => {
    let settled = false;
    const settle = (outcome: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outcome();
    };
    const timeoutMs = options.readyTimeoutMs ?? 60_000;
    const timer = setTimeout(() => {
      kill();
      settle(() => reject(new Error(`it did not say it was listening within ${Math.round(timeoutMs / 1000)} s`)));
    }, timeoutMs);

    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream, crlfDelay: Infinity }).on("line", (line) => {
        options.onLine(line);
        if (isListening(line)) settle(() => resolve(service));
      });
    }
    child.once("error", (error) => settle(() => reject(new Error(`its Python could not be started: ${error.message}`))));
    void exited.then((code) => settle(() => reject(new Error(`it stopped before it was ready (exit code ${code})`))));
  });
}

function isListening(line: string): boolean {
  try {
    return (JSON.parse(line) as { readonly message?: unknown } | null)?.message === "listening";
  } catch {
    return false;
  }
}
