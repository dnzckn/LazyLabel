/**
 * Structured logging in the browser.
 *
 * Same shape as the API's, on purpose: one correlation id, one JSON record, so a browser console
 * line and a server log line for the same request can be lined up. `AI_NATIVE_SPEC.md` section 4.
 *
 * At `info` and above it writes to the console; `debug` is kept unless the build asks for it, so a
 * production console is not a firehose.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const ORDER: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  readonly minimum?: LogLevel;
  readonly sink?: (level: LogLevel, record: LogFields) => void;
  readonly base?: LogFields;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minimum = options.minimum ?? (import.meta.env?.DEV ? "debug" : "info");
  const base = options.base ?? {};
  const sink =
    options.sink ??
    ((level: LogLevel, record: LogFields) => {
      const method = level === "debug" ? "log" : level;
      // eslint-disable-next-line no-console -- this IS the logger
      console[method](JSON.stringify(record));
    });

  return {
    log(level, message, fields) {
      if (ORDER[level] < ORDER[minimum]) return;
      sink(level, { level, message, ...base, ...fields });
    },
    child(extra) {
      return createLogger({ ...options, minimum, base: { ...base, ...extra } });
    },
  };
}

/** A logger that drops everything, for tests that are not about logging. */
export const silentLogger: Logger = {
  log() {},
  child() {
    return silentLogger;
  },
};
