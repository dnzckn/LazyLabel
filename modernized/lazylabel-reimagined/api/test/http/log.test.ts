/**
 * The logger, and the one thing `ASSESSMENT.md` 5.4 says it must never do.
 *
 * Legacy silently DROPPED records whose file names were not encodable, so the events most worth
 * having never arrived — a file that could not be written was exactly the file whose log line went
 * missing. Both loggers in this project cite that in a comment, and neither had a test: the claim
 * was documented and undefended.
 *
 * A LONE SURROGATE is how this actually happens. A filesystem byte sequence that is not valid
 * UTF-8 decodes to one, and it cannot be encoded back — so anything that serialises naively either
 * throws or drops the record.
 */

import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/http/log.js";

/** `frames/<lone surrogate>.png`, as an undecodable filename reaches the app. */
const UNENCODABLE = "frames/\uD800.png";

function captured(): { lines: string[]; log: ReturnType<typeof createLogger> } {
  const lines: string[] = [];
  return { lines, log: createLogger((line) => lines.push(line)) };
}

describe("a record that cannot be encoded", () => {
  it("is still logged, rather than dropped", () => {
    const { lines, log } = captured();

    log.log("error", "could not write", { file: UNENCODABLE });

    expect(lines).toHaveLength(1);
  });

  it("survives being written as UTF-8 bytes", () => {
    // The line is what reaches stdout. If the surrogate were left raw it would not round-trip,
    // and a log collector reading the stream would see mojibake or drop the record itself.
    const { lines, log } = captured();

    log.log("error", "could not write", { file: UNENCODABLE });

    const bytes = Buffer.from(lines[0]!, "utf8");
    expect(bytes.toString("utf8")).toBe(lines[0]);
  });

  it("still parses as JSON, with the name escaped", () => {
    const { lines, log } = captured();

    log.log("error", "could not write", { file: UNENCODABLE });

    const parsed = JSON.parse(lines[0]!) as { file: string; message: string };
    expect(parsed.message).toBe("could not write");
    expect(parsed.file).toContain("frames/");
  });

  it("keeps the correlation id, which is what makes the line findable", () => {
    // A dropped line is bad; a line nobody can join to the request that caused it is not much
    // better, and this is the one case where someone is definitely going looking.
    const { lines, log } = captured();

    log.child({ correlationId: "abc-123" }).log("error", "could not write", {
      file: UNENCODABLE,
    });

    expect(JSON.parse(lines[0]!).correlationId).toBe("abc-123");
  });
});

describe("ordinary records", () => {
  it("carry the level, the message and the fields", () => {
    const { lines, log } = captured();

    log.log("info", "saved", { file: "frames/f01.png" });

    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: "info",
      message: "saved",
      file: "frames/f01.png",
    });
  });

  it("inherit a child's fields without losing their own", () => {
    const { lines, log } = captured();

    log.child({ service: "api" }).log("info", "saved", { file: "a.png" });

    expect(JSON.parse(lines[0]!)).toMatchObject({ service: "api", file: "a.png" });
  });
});
