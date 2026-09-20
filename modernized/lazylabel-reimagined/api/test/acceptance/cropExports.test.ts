/**
 * A crop changes the exported files — Phase 5 exit criterion 4, the crop half.
 *
 * RULE-018 is P0, and the mask arithmetic under it is already proven against legacy oracles in the
 * format library (`tensorRules.test.ts`: the kept region is `x1..x2-1` by `y1..y2-1`, a degenerate
 * crop empties the image, and even the widest crop loses the far edge). What is NOT proven there
 * is the JOIN — that a save request carrying `cropCoords` actually reaches that arithmetic and
 * lands in the files on disk.
 *
 * That join is worth its own test because the failure is silent in the worst direction. A crop
 * dropped on the way through writes MORE than the user asked for, and nothing on screen or in the
 * file says a crop was involved; a crop applied when none was set deletes annotations. The only
 * evidence either way is the bytes, so that is what this reads.
 *
 * It goes through the real HTTP handler against a real folder, for the same reason C9 does: the
 * properties here are about files.
 */

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { DirectoryBlobStore } from "../../src/adapters/directoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { put } from "../helpers/request.js";

const IMAGE = "frames/frame_007.png";
const SIZE: [number, number] = [40, 40];

/** A filled square as the wire encodes it: a bounding box plus its bytes. */
function square(x: number, y: number, side: number) {
  return {
    height: SIZE[0],
    width: SIZE[1],
    box: [x, y, x + side, y + side] as [number, number, number, number],
    data: Buffer.from(new Uint8Array(side * side).fill(1)).toString("base64"),
  };
}

describe("a crop is applied to what is written", () => {
  let root: string;
  let app: App;
  let metadata: SqliteMetadataStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lazylabel-crop-"));
    await mkdir(path.join(root, "frames"), { recursive: true });
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: new DirectoryBlobStore(root), metadataStore: metadata });
  });

  afterEach(async () => {
    await metadata.close();
    await rm(root, { recursive: true, force: true });
  });

  function save(body: Record<string, unknown>) {
    return app.handle(
      put(`/projects/p1/images/${IMAGE}/annotations`, {
        imageSize: SIZE,
        formats: ["YOLO_SEGMENTATION"],
        segments: [{ type: "Loaded", classId: 0, mask: square(10, 10, 12) }],
        classAliases: { "0": "thing" },
        ...body,
      }),
    );
  }

  /**
   * What YOLO segmentation wrote, or "" when it wrote nothing.
   *
   * A missing file is a real outcome here, not a test failure: decision 7 says a format that would
   * render to nothing is skipped rather than written empty, and a crop that removes every object
   * is exactly that case. Reading it as "" lets the assertions below be about CONTENT.
   */
  const written = async () => {
    try {
      return await readFile(path.join(root, "frames", "frame_007_seg.txt"), "utf8");
    } catch {
      return "";
    }
  };

  it("writes the whole object when there is no crop", async () => {
    const response = await save({ cropCoords: null });

    expect(response.status).toBe(200);
    // One polygon for the one object, and it spans the square that was sent.
    expect((await written()).trim().split("\n")).toHaveLength(1);
  });

  it("writes NOTHING for an object that falls entirely outside the crop", async () => {
    // The square is at 10..22; this crop keeps 25..34. The annotation is not shrunk, it is gone --
    // which is the consequence RULE-018 carries and the reason the panel counts the pixels a save
    // will blank before anyone presses it.
    const response = await save({ cropCoords: [25, 25, 35, 35] });

    expect(response.status).toBe(200);
    expect((await written()).trim()).toBe("");
  });

  it("keeps the part of an object that is inside and drops the part that is not", async () => {
    // A crop cutting the square in half. The polygon that comes out must be smaller than the one
    // written with no crop -- if the crop were dropped on the way through, the two would match.
    const whole = await save({ cropCoords: null }).then(written);
    await save({ cropCoords: [10, 10, 16, 22] });
    const cropped = await written();

    expect(cropped.trim()).not.toBe("");
    expect(cropped).not.toBe(whole);
  });

  it("loses the far edge even when the crop covers the whole image", async () => {
    // (0, 0, 39, 39) on a 40x40 image is the widest crop clamping allows, and the kept region is
    // exclusive of the far edge -- so column 39 and row 39 are blanked. Legacy does this, the rule
    // card's title says so, and reproducing it is deliberate: correcting it would silently ADD a
    // row of annotations to every export a user had already made.
    const square39 = {
      height: SIZE[0],
      width: SIZE[1],
      box: [38, 38, 40, 40] as [number, number, number, number],
      data: Buffer.from(new Uint8Array(4).fill(1)).toString("base64"),
    };

    await save({
      cropCoords: null,
      segments: [{ type: "Loaded", classId: 0, mask: square39 }],
    });
    // Uncropped, the object spans columns 38 and 39: 38/40 and 39/40 normalized.
    expect(await written()).toContain("0.975");

    await save({
      cropCoords: [0, 0, 39, 39],
      segments: [{ type: "Loaded", classId: 0, mask: square39 }],
    });

    // Cropped to the widest rectangle the image allows, column 39 and row 39 are blanked, so only
    // 0.95 remains. That missing 0.975 IS the off-by-one, measured.
    const cropped = await written();
    expect(cropped).toContain("0.95");
    expect(cropped).not.toContain("0.975");
  });

  it("refuses a crop that is not four integers, rather than guessing", async () => {
    // Guessing goes in the direction that deletes annotations, so this is a 422 and not a
    // best-effort parse.
    const response = await save({ cropCoords: [1, 2, 3] });

    expect(response.status).toBe(422);
  });

  it("treats a missing cropCoords as no crop", async () => {
    // Backwards compatibility with any client that predates the field. It must mean "no crop" and
    // never "crop to nothing".
    const response = await save({});

    expect(response.status).toBe(200);
    expect((await written()).trim().split("\n")).toHaveLength(1);
  });
});
