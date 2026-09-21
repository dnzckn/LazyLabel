/**
 * RULE-028's display adjustments, on the API side — the prerequisite for RULE-089.
 *
 * The arithmetic is tested where it lives, in the shared package. What is tested here is that the
 * API applies it to the right pixels at the right point, and refuses a request it cannot honour.
 *
 * Why the API needs it at all: the inference service's own header records the design — the API
 * "applies the display adjustments, and hands the model exactly the pixels the user is looking
 * at, which is what makes Operate On View implementable". Until now nothing on this side could.
 */

import { describe, expect, it } from "vitest";

import { NEUTRAL, adjustPixel } from "@lazylabel/annotation-formats";

import { adjustmentsFromQuery, applyAdjustments } from "../../src/images/processing.js";

const query = (raw: string) => adjustmentsFromQuery(new URLSearchParams(raw));

describe("asking for adjustments", () => {
  it("is neutral when nothing is asked for", () => {
    expect(query("")).toEqual(NEUTRAL);
    expect(query("rescaleMin=1&rescaleMax=9")).toEqual(NEUTRAL);
  });

  it("takes the four in the order the panel shows them", () => {
    expect(query("adjust=10,-20,1.5,0.5")).toEqual({
      brightness: 10,
      contrast: -20,
      gamma: 1.5,
      saturation: 0.5,
    });
  });

  it("REFUSES a partial set, because it has not said what the others are", () => {
    // They are applied as a set. A request carrying two of them is a client that has lost track.
    expect(() => query("adjust=10,-20")).toThrow(/four numbers/);
  });

  it("refuses values outside their ranges rather than clamping", () => {
    // A slider that stops responding is worse than an error.
    expect(() => query("adjust=500,0,1,1")).toThrow(/brightness/);
    expect(() => query("adjust=0,0,0,1")).toThrow(/gamma/);
    expect(() => query("adjust=0,0,1,-1")).toThrow(/saturation/);
    expect(() => query("adjust=a,b,c,d")).toThrow(/four numbers/);
  });
});

describe("applying them", () => {
  /** Three channels per pixel, which is what the decoders produce — not the browser's RGBA. */
  const pixels = (values: readonly number[]) => Uint8Array.from(values);

  it("leaves the image alone when neutral", () => {
    const data = pixels([10, 20, 30, 200, 210, 220]);

    applyAdjustments(data, NEUTRAL);

    expect([...data]).toEqual([10, 20, 30, 200, 210, 220]);
  });

  it("gives the same answer as the shared per-pixel function", () => {
    // The whole point: the browser and the API must produce identical pixels, or a mask comes back
    // for an image the user was not looking at. Both call the same code; this proves the API's
    // three-channel loop feeds it correctly.
    const adjustments = { brightness: 15, contrast: 25, gamma: 1.4, saturation: 0.6 };
    const source = [10, 20, 30, 200, 210, 220, 0, 128, 255];
    const data = pixels(source);

    applyAdjustments(data, adjustments);

    const expected = [0, 3, 6].flatMap((at) =>
      adjustPixel(source[at]!, source[at + 1]!, source[at + 2]!, adjustments),
    );
    expect([...data]).toEqual(expected);
  });

  it("reproduces the negative-brightness FOLD rather than darkening", () => {
    // `cv2.convertScaleAbs` takes the absolute value, so darkening makes the darkest pixels
    // bright. Legacy does it, the browser does it, and the API has to as well or the model would
    // see a different picture from the user.
    const data = pixels([10, 10, 10]);

    applyAdjustments(data, { ...NEUTRAL, brightness: -40 });

    expect(data[0]).toBe(30);
  });
});
