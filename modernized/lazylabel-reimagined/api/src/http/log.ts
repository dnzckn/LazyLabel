/**
 * Structured JSON logging with a correlation id.
 *
 * `AI_NATIVE_SPEC.md` section 4 requires that every request carry a correlation id through to the
 * inference service and that logs be structured JSON. It also names the failure to avoid: the
 * legacy logger silently DROPPED records whose file names were not encodable
 * (`ASSESSMENT.md` 5.4), so the events most worth having — the ones about unusual file names —
 * were the ones that never arrived.
 *
 * `JSON.stringify` cannot hit that failure the same way, since it escapes rather than refuses. What
 * it can do is throw on a circular value or a BigInt, so the serializer handles both and a log line
 * that cannot be rendered degrades to a line saying so, never to silence.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export interface LogSink {
  (line: string): void;
}

export function createLogger(sink: LogSink = (line) => process.stdout.write(`${line}\n`), base: LogFields = {}): Logger {
  return {
    log(level, message, fields) {
      sink(render({ level, message, ...base, ...fields }));
    },
    child(extra) {
      return createLogger(sink, { ...base, ...extra });
    },
  };
}

/** A logger that drops everything. For tests that are not about logging. */
export const silentLogger: Logger = {
  log() {},
  child() {
    return silentLogger;
  },
};

function render(record: LogFields): string {
  try {
    // The seen-set is built per record, not shared. A shared one would report the second log of the
    // same object as circular, which is how a logger starts lying about ordinary repeated fields.
    return JSON.stringify(record, replacer(new WeakSet<object>()));
  } catch (cause) {
    // Never silence. A record that will not serialize still says that it happened, and why not.
    return JSON.stringify({
      level: "error",
      message: "a log record could not be serialized",
      reason: cause instanceof Error ? cause.message : String(cause),
      original: String(record["message"] ?? ""),
    });
  }
}

function replacer(seen: WeakSet<object>) {
  return function (this: unknown, _key: string, value: unknown): unknown {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Error) return { name: value.name, message: value.message };
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    }
    return value;
  };
}
