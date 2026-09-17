/**
 * A damaged archive must be reported with a usable message, and must not take the process down.
 *
 * Both halves were real defects: the write side of the decompression stream had no rejection
 * handler, so Node crashed after the caller had already caught the error, and the stream's own
 * error carries an empty message, which would reach a user as a banner ending in a bare colon.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseNpz } from "../../src/format/npz.js";
import { AnnotationLoadError, loadAnnotations } from "../../src/load/chain.js";
import { GOLDENS_DIR } from "../helpers/fixtures.js";

function goldenNpz(): Uint8Array {
  return new Uint8Array(readFileSync(join(GOLDENS_DIR, "two-classes-sparse-ids", "image.npz")));
}

describe("a corrupt NPZ", () => {
  it("reports a non-empty message rather than a bare failure", async () => {
    const bytes = goldenNpz();
    // Flip bytes inside the first member's compressed body, past the local header.
    for (let i = 60; i < Math.min(120, bytes.length); i += 1) bytes[i] = bytes[i]! ^ 0xff;

    await expect(parseNpz(bytes)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message.trim()).not.toBe("");
      expect((error as Error).message).toMatch(/could not be read|zip|npy/i);
      return true;
    });
  });

  it("surfaces through the load chain with the format named", async () => {
    const bytes = goldenNpz();
    for (let i = 60; i < Math.min(120, bytes.length); i += 1) bytes[i] = bytes[i]! ^ 0xff;

    const failure = await loadAnnotations({ NPZ: bytes }, [20, 30]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AnnotationLoadError);
    expect((failure as AnnotationLoadError).format).toBe("NPZ");
    // The message is what decision 15d's banner shows, so it must never end in a bare colon.
    expect((failure as Error).message).not.toMatch(/:\s*$/);
  });

  it("rejects bytes that are not a zip at all", async () => {
    await expect(parseNpz(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow(/zip/i);
  });
});
