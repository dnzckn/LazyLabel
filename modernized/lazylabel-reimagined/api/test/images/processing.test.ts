/**
 * The image-processing chain — RULE-032's order and the constraints that come with it.
 *
 * `imageProcessing.test.ts` pins the arithmetic of one value. This pins the chain: that the steps
 * run in the order the rule fixes, that rescale is refused on a colour source, that a crop
 * restricts where the chain runs, and that a malformed query is an error rather than a request
 * silently ignored.
 *
 * The reason any of this is on the server rather than in the browser is in `processing.ts`: the
 * chain belongs BEFORE the 16-bit to 8-bit conversion, and the browser only ever receives what
 * comes after it.
 */

import { describe, expect, it } from "vitest";

import { applyProcessing, isEmpty, processingFromQuery } from "../../src/images/processing.js";

/** Interleaved RGB from one value per pixel, which is how a grayscale source arrives. */
function gray(values: readonly number[], wide = false): Uint8Array | Uint16Array {
  const out = wide ? new Uint16Array(values.length * 3) : new Uint8Array(values.length * 3);
  values.forEach((value, i) => {
    out[i * 3] = value;
    out[i * 3 + 1] = value;
    out[i * 3 + 2] = value;
  });
  return out;
}

/** The first channel of each pixel, which is the whole value for a grayscale image. */
const firsts = (samples: Uint8Array | Uint16Array): number[] =>
  [...samples].filter((_, i) => i % 3 === 0);

const GRAYSCALE = { width: 5, height: 1, sourceChannels: 1 };
const COLOUR = { width: 5, height: 1, sourceChannels: 3 };

describe("rescale", () => {
  it("works RULE-032's own example", () => {
    // min 50, max 200: [30, 50, 125, 200, 250] becomes [0, 0, 127, 255, 255].
    const samples = gray([30, 50, 125, 200, 250]);

    applyProcessing(samples, GRAYSCALE, { rescale: { min: 50, max: 200 } });

    expect(firsts(samples)).toEqual([0, 0, 127, 255, 255]);
  });

  it("is REFUSED on a colour source", () => {
    // RULE-032 disables the control for RGB. Applying it anyway shifts the channels independently
    // and changes the hue of every pixel -- and a rescale stored from a grayscale image would
    // otherwise follow the user onto the next, colour one.
    const samples = gray([30, 50, 125, 200, 250]);

    applyProcessing(samples, COLOUR, { rescale: { min: 50, max: 200 } });

    expect(firsts(samples)).toEqual([30, 50, 125, 200, 250]);
  });

  it("leaves the image alone when the handles have crossed", () => {
    // Rather than dividing by zero or blanking it. A user dragging the handles past each other
    // should see nothing happen, not lose their image.
    const samples = gray([30, 50, 125, 200, 250]);

    applyProcessing(samples, GRAYSCALE, { rescale: { min: 200, max: 50 } });

    expect(firsts(samples)).toEqual([30, 50, 125, 200, 250]);
  });

  it("uses the SIXTEEN-BIT maximum on wide samples", () => {
    // The reason the chain is here at all. A 16-bit scan whose data sits between 3,000 and 5,000
    // stretches across 65,536 levels; narrowing to 8 bits first leaves it 8 levels wide.
    const samples = gray([3000, 4000, 5000], true);

    applyProcessing(samples, { ...GRAYSCALE, width: 3 }, { rescale: { min: 3000, max: 5000 } });

    expect(firsts(samples)).toEqual([0, 32767, 65535]);
  });
});

describe("channel thresholds", () => {
  it("works RULE-029's own example", () => {
    // Markers [50, 150] on 8-bit: [10, 49, 50, 100, 149, 150, 255] -> [0, 0, 127, 127, 127, 255, 255].
    const samples = gray([10, 49, 50, 100, 149, 150, 255]);

    applyProcessing(samples, { ...GRAYSCALE, width: 7 }, { channels: { gray: [50, 150] } });

    expect(firsts(samples)).toEqual([0, 0, 127, 127, 127, 255, 255]);
  });

  it("drives all three channels from Gray on a grayscale source", () => {
    const samples = gray([10, 200]);

    applyProcessing(samples, { ...GRAYSCALE, width: 2 }, { channels: { gray: [50, 150] } });

    expect([...samples]).toEqual([0, 0, 0, 255, 255, 255]);
  });

  it("thresholds only the channels that were given, on a colour source", () => {
    // RULE-029: RGB images threshold only ENABLED channels. Red here, green and blue untouched.
    const samples = Uint8Array.from([10, 10, 10, 200, 200, 200]);

    applyProcessing(samples, { ...COLOUR, width: 2 }, { channels: { r: [50, 150] } });

    expect([...samples]).toEqual([0, 10, 10, 255, 200, 200]);
  });
});

describe("the order, which is the rule", () => {
  it("rescales BEFORE thresholding", () => {
    // The two orders agree on most values, which is what makes this worth a test rather than a
    // reading. The separator is a value the rescale moves ACROSS a marker.
    //
    // Raw 180 with a window of [50, 200] and one marker at 200:
    //   rescale first  -> (180-50)/150 x 255 = 221, which is at or above 200, so 255.
    //   threshold first -> 180 is below 200, so 0; rescaling 0 clips to 0.
    //
    // Black or white from one swapped line, on an ordinary value in the middle of the range.
    const samples = gray([180]);

    applyProcessing(samples, { ...GRAYSCALE, width: 1 }, {
      rescale: { min: 50, max: 200 },
      channels: { gray: [200] },
    });

    expect(firsts(samples)).toEqual([255]);
  });
});

describe("the crop restriction", () => {
  it("leaves pixels outside the crop untouched", () => {
    // RULE-029 and RULE-032 both say the processing applies only inside an active crop.
    const samples = gray([10, 10, 10, 10, 10]);

    applyProcessing(samples, GRAYSCALE, {
      channels: { gray: [5] },
      crop: [1, 0, 3, 1],
    });

    // Columns 1 and 2 only: the kept region is x1..x2-1, exclusive of the far edge, which is the
    // same off-by-one RULE-018 applies when a crop blanks a mask.
    expect(firsts(samples)).toEqual([10, 255, 255, 10, 10]);
  });

  it("clamps a crop that reaches outside the image rather than walking past the buffer", () => {
    const samples = gray([10, 10, 10]);

    applyProcessing(samples, { ...GRAYSCALE, width: 3 }, {
      channels: { gray: [5] },
      crop: [-10, -10, 999, 999],
    });

    expect(firsts(samples)).toEqual([255, 255, 255]);
  });
});

describe("doing nothing, cheaply", () => {
  it("recognises a request that would change nothing", () => {
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ rescale: null, channels: {} })).toBe(true);
    expect(isEmpty({ channels: { gray: [] } })).toBe(true);
    // A crossed window changes nothing either, and saying so lets the decoder skip the pass.
    expect(isEmpty({ rescale: { min: 200, max: 50 } })).toBe(true);
  });

  it("recognises one that would", () => {
    expect(isEmpty({ rescale: { min: 50, max: 200 } })).toBe(false);
    expect(isEmpty({ channels: { b: [128] } })).toBe(false);
  });
});

describe("reading the query string", () => {
  it("reads a whole request", () => {
    const processing = processingFromQuery(
      new URLSearchParams("rescaleMin=50&rescaleMax=200&markers_gray=50,150&crop=1,2,3,4"),
    );

    expect(processing.rescale).toEqual({ min: 50, max: 200 });
    expect(processing.channels?.gray).toEqual([50, 150]);
    expect(processing.crop).toEqual([1, 2, 3, 4]);
  });

  it("returns nothing for an empty query", () => {
    expect(isEmpty(processingFromQuery(new URLSearchParams()))).toBe(true);
  });

  it("refuses half a rescale window", () => {
    // One handle without the other has no meaning, and guessing the missing one would silently
    // change the image.
    expect(() => processingFromQuery(new URLSearchParams("rescaleMin=50"))).toThrow(/together/);
  });

  it("refuses a marker list that is not numbers", () => {
    expect(() => processingFromQuery(new URLSearchParams("markers_r=50,x"))).toThrow(/whole numbers/);
  });

  it("refuses a crop that is not four numbers", () => {
    expect(() => processingFromQuery(new URLSearchParams("crop=1,2,3"))).toThrow(/four whole numbers/);
  });
});
