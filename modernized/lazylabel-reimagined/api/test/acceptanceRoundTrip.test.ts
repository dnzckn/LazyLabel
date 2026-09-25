/**
 * The acceptance round-trip harness — Phase 6's fourth exit criterion as a command.
 *
 * The harness itself needs a corpus of real datasets and cannot run in CI. Its comparison rule and
 * its reporting can, and those are where a mistake would be worst: a comparison that is too
 * forgiving reports a clean round trip over a real difference, which is the one thing a tool
 * whose whole job is byte equality must never do.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  comparedCount,
  normalizeEol,
  roundTripFolder,
  sameArchive,
  sameBytes,
  sameFile,
  sidecarPathFor,
  summarize,
} from "../tools/acceptanceRoundTrip.js";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("comparing bytes", () => {
  it("normalises line endings for a TEXT format (decision 10)", () => {
    // The same file written on Windows and on Linux differs by bytes that mean nothing, and
    // Phase 1's goldens apply the same normalisation.
    expect(sameBytes("YOLO_DETECTION", bytes("0 0.5 0.5\r\n"), bytes("0 0.5 0.5\n"))).toBe(true);
  });

  it("does NOT normalise a binary format", () => {
    // An NPZ that happens to contain 0x0D 0x0A is a different archive from one that does not, and
    // treating those two bytes as interchangeable inside a zip would hide real corruption.
    expect(sameBytes("NPZ", Uint8Array.from([13, 10]), Uint8Array.from([10]))).toBe(false);
  });

  it("catches a difference that is not a line ending", () => {
    expect(sameBytes("YOLO_DETECTION", bytes("0 0.5 0.5\n"), bytes("0 0.6 0.5\n"))).toBe(false);
  });

  it("catches a length difference", () => {
    expect(sameBytes("NPZ", Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 3]))).toBe(false);
  });

  it("leaves a lone newline alone", () => {
    expect([...normalizeEol(bytes("a\nb"))]).toEqual([...bytes("a\nb")]);
  });
});

/*
 * The archives are compared array by array: the port stores class names as JSON where legacy
 * pickles them, so equal bytes were never the claim. These use archives legacy wrote for the
 * acceptance corpus (converted, as a real dataset would be).
 */
describe("comparing archives", () => {
  const corpus = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures",
    "acceptance-corpus",
    "priority-off",
  );
  const archive = async (name: string) => new Uint8Array(await readFile(path.join(corpus, name)));

  it("finds an archive the same as itself, for both NPZ formats", async () => {
    const npz = await archive("image_00.npz");
    const classMap = await archive("image_00_CM.npz");

    expect(await sameArchive(npz, npz)).toBe(true);
    // The class map is uint16, which the library's own decoder does not take: compared all the same.
    expect(await sameFile("NPZ_CLASS_MAP", classMap, classMap)).toBe(true);
  });

  it("finds two different images' archives different", async () => {
    expect(await sameArchive(await archive("image_00.npz"), await archive("image_01.npz"))).toBe(false);
    expect(
      await sameFile("NPZ_CLASS_MAP", await archive("image_00_CM.npz"), await archive("image_01_CM.npz")),
    ).toBe(false);
  });

  it("never finds an unreadable archive the same as anything", async () => {
    const npz = await archive("image_00.npz");

    expect(await sameArchive(bytes("not a zip"), npz)).toBe(false);
    expect(await sameArchive(npz, npz.subarray(0, npz.length - 10))).toBe(false);
  });

  it("compares the text formats as bytes after line endings, as before", async () => {
    expect(await sameFile("YOLO_DETECTION", bytes("0 0.5 0.5\r\n"), bytes("0 0.5 0.5\n"))).toBe(true);
  });
});

describe("naming the sidecar", () => {
  it("knows every format's suffix", () => {
    expect(sidecarPathFor("frames/a.png", "NPZ")).toBe("frames/a.npz");
    expect(sidecarPathFor("frames/a.png", "YOLO_SEGMENTATION")).toBe("frames/a_seg.txt");
    expect(sidecarPathFor("frames/a.png", "PASCAL_VOC")).toBe("frames/a.xml");
  });

  it("strips only the LAST extension", () => {
    // `frame.2024.png` keeps the version-looking part of its name; taking the first dot would
    // write `frame.npz` for it and collide with a different image.
    expect(sidecarPathFor("frame.2024.png", "NPZ")).toBe("frame.2024.npz");
  });

  it("copes with a name that has no extension", () => {
    expect(sidecarPathFor("frames/a", "NPZ")).toBe("frames/a.npz");
  });

  it("answers null for a format it does not know", () => {
    expect(sidecarPathFor("a.png", "INVENTED")).toBeNull();
  });
});

describe("the report", () => {
  const outcome = (over: Partial<Parameters<typeof summarize>[0][0]["images"][0]> = {}) => ({
    key: "a.png",
    status: "identical" as const,
    detail: "round-tripped",
    formats: ["NPZ"],
    differing: [] as string[],
    ...over,
  });

  it("counts a clean dataset and fails nothing", () => {
    const { lines, failed } = summarize([{ folder: "frames", images: [outcome(), outcome()] }]);

    expect(failed).toBe(0);
    expect(lines[0]).toContain("2 identical");
  });

  it("FAILS on a difference, and names the formats", () => {
    const { lines, failed } = summarize([
      {
        folder: "frames",
        images: [outcome({ status: "differs", differing: ["NPZ", "COCO_JSON"] })],
      },
    ]);

    expect(failed).toBe(1);
    expect(lines.join("\n")).toContain("NPZ, COCO_JSON differ");
  });

  it("FAILS on an unreadable file, and gives the reason", () => {
    // Unreadable is a failure, not a skip. A corpus run that quietly passed over the files it
    // could not open would report success for the datasets most likely to be broken.
    const { lines, failed } = summarize([
      {
        folder: "frames",
        images: [outcome({ status: "unreadable", detail: "the npz is truncated" })],
      },
    ]);

    expect(failed).toBe(1);
    expect(lines.join("\n")).toContain("the npz is truncated");
  });

  it("FAILS on a file whose class names are pickled, and says which command fixes it", () => {
    // The criterion says "pickled NPZ files included, via the converter". Such a file's masks load
    // perfectly and its NAMES do not, so the bytes differ -- and reporting only that sends someone
    // hunting a rounding bug in the exporters when the answer is one command. A corpus that passed
    // only because its pickled datasets were counted as something else has not been checked.
    const { lines, failed } = summarize([
      {
        folder: "frames",
        images: [
          outcome({
            status: "needs-converter",
            detail: "its class names are stored in the old pickled format. Run the converter.",
          }),
        ],
      },
    ]);

    expect(failed).toBe(1);
    expect(lines[0]).toContain("1 need the converter");
    expect(lines.join(" ")).toContain("Run the converter");
  });

  it("does not fail on an image with no annotations at all", () => {
    // Most images in a real dataset have none. They are counted and not listed.
    const { lines, failed } = summarize([
      { folder: "frames", images: [outcome({ status: "skipped" })] },
    ]);

    expect(failed).toBe(0);
    expect(lines[0]).toContain("1 without annotations");
  });

  it("lists only the failures, not every filename", () => {
    // A corpus of two hundred datasets printing every name is a report nobody reads.
    const { lines } = summarize([
      {
        folder: "frames",
        images: [outcome(), outcome(), outcome({ key: "bad.png", status: "differs", differing: ["NPZ"] })],
      },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("bad.png");
  });
});

describe("round-tripping a folder on disk", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-acceptance-test-"));
    await mkdir(path.join(root, "frames"), { recursive: true });
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("skips an image with no annotation file", async () => {
    // A 1x1 PNG, so the decoder has something real to measure.
    await writeFile(
      path.join(root, "frames", "a.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );

    const outcome = await roundTripFolder(root, "frames");

    expect(outcome.images).toHaveLength(1);
    expect(outcome.images[0]!.status).toBe("skipped");
  });

  it("reports an unreadable annotation file rather than throwing", async () => {
    // The whole run must survive one bad file: a corpus is exactly where they live.
    await writeFile(
      path.join(root, "frames", "a.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    await writeFile(path.join(root, "frames", "a.npz"), "not an npz at all");

    const outcome = await roundTripFolder(root, "frames");

    expect(outcome.images[0]!.status).toBe("unreadable");
    expect(outcome.images[0]!.detail.length).toBeGreaterThan(0);
  });

  it("writes NOTHING into the folder it was given", async () => {
    // The point of the scratch copy. This tool is meant to be pointed at the annotations somebody
    // cares most about.
    await writeFile(
      path.join(root, "frames", "a.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const { readdir } = await import("node:fs/promises");
    const before = (await readdir(path.join(root, "frames"))).sort();

    await roundTripFolder(root, "frames");

    expect((await readdir(path.join(root, "frames"))).sort()).toEqual(before);
  });
});


describe("what counts as having been compared", () => {
  /**
   * The exit code depends on this, and the exit code is what Phase 6's criterion is checked by.
   *
   * The harness reported "Every annotation file round-tripped identically" with an exit code of
   * zero over a corpus of bare images -- no annotation file read at all. That is the exact failure
   * this tool exists to catch, turned on the tool itself, and it means the criterion could be met
   * by pointing at the wrong directory.
   */
  const image = (status: string) => ({
    key: "a.png",
    status: status as never,
    detail: "",
    formats: [] as string[],
    differing: [] as string[],
  });

  it("counts a file that round-tripped", () => {
    expect(comparedCount([{ folder: "f", images: [image("identical")] }])).toBe(1);
  });

  it("counts one that DIFFERED, because a difference is evidence too", () => {
    expect(comparedCount([{ folder: "f", images: [image("differs")] }])).toBe(1);
  });

  it("counts an unreadable one, which is a finding rather than an absence", () => {
    expect(comparedCount([{ folder: "f", images: [image("unreadable")] }])).toBe(1);
  });

  it("does NOT count an image with no annotations beside it", () => {
    // An ordinary thing for an image to be, and evidence of nothing.
    expect(comparedCount([{ folder: "f", images: [image("skipped")] }])).toBe(0);
  });

  it("is zero for a corpus of bare images, however many there are", () => {
    const bare = Array.from({ length: 200 }, () => image("skipped"));

    expect(comparedCount([{ folder: "f", images: bare }])).toBe(0);
  });

  it("adds up across datasets", () => {
    expect(
      comparedCount([
        { folder: "a", images: [image("identical"), image("skipped")] },
        { folder: "b", images: [image("differs")] },
      ]),
    ).toBe(2);
  });
});
