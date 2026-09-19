/**
 * The mask codec, which is the only part of the wire that is not plain JSON.
 *
 * Both sides of the connection use these functions, so a round-trip failure here is a mask that
 * arrives wrong in a browser and nowhere else.
 */

import { describe, expect, it } from "vitest";

import { decodeMask, encodeMask, WireFormatError } from "../src/wire.js";
import { base64ToBytes, bytesToBase64 } from "../src/base64.js";

function mask(height: number, width: number, set: readonly (readonly [number, number])[]) {
  const data = new Uint8Array(height * width);
  for (const [x, y] of set) data[y * width + x] = 1;
  return { height, width, data };
}

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("handles an array far larger than the call-stack limit for spread", () => {
    // String.fromCharCode(...bytes) throws above roughly 100k arguments, and a 2000x2000 object is
    // four million bytes. The chunking in base64.ts exists for exactly this.
    const bytes = new Uint8Array(4_000_000).fill(1);
    expect(base64ToBytes(bytesToBase64(bytes)).length).toBe(4_000_000);
  });

  it("round-trips an empty array", () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });
});

describe("the mask codec", () => {
  it("round-trips a mask through its bounding box", () => {
    const original = mask(10, 12, [[3, 4], [4, 4], [3, 5]]);
    expect(decodeMask(encodeMask(original))).toEqual(original);
  });

  it("sends only the bounded region, not the whole plane", () => {
    const wire = encodeMask(mask(1000, 1000, [[500, 500]]));
    expect(wire.box).toEqual([500, 500, 501, 501]);
    // One pixel, not a million.
    expect(base64ToBytes(wire.data).length).toBe(1);
  });

  it("represents an empty mask as a null box and keeps its size", () => {
    const wire = encodeMask(mask(8, 9, []));
    expect(wire).toEqual({ height: 8, width: 9, box: null, data: "" });
    expect(decodeMask(wire)).toEqual(mask(8, 9, []));
  });

  it("round-trips a mask that fills its image", () => {
    const full = { height: 4, width: 5, data: new Uint8Array(20).fill(1) };
    expect(encodeMask(full).box).toEqual([0, 0, 5, 4]);
    expect(decodeMask(encodeMask(full))).toEqual(full);
  });

  it("normalizes any non-zero byte to 1", () => {
    const wire = { height: 2, width: 2, box: [0, 0, 2, 2] as const, data: bytesToBase64(Uint8Array.of(0, 7, 255, 0)) };
    expect(decodeMask(wire).data).toEqual(Uint8Array.of(0, 1, 1, 0));
  });

  it("refuses a box that does not fit its image", () => {
    expect(() => decodeMask({ height: 4, width: 4, box: [0, 0, 9, 9], data: "" })).toThrow(WireFormatError);
    expect(() => decodeMask({ height: 4, width: 4, box: [3, 3, 1, 1], data: "" })).toThrow(WireFormatError);
  });

  it("refuses a box whose byte count does not match its area", () => {
    expect(() =>
      decodeMask({ height: 4, width: 4, box: [0, 0, 2, 2], data: bytesToBase64(Uint8Array.of(1)) }),
    ).toThrow(/says 4 pixels but carries 1/);
  });

  it("refuses a negative or non-integer size", () => {
    expect(() => decodeMask({ height: -1, width: 4, box: null, data: "" })).toThrow(WireFormatError);
    expect(() => decodeMask({ height: 2.5, width: 4, box: null, data: "" })).toThrow(WireFormatError);
  });
});
