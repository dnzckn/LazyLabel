/**
 * What the browser asks the server to do to an image.
 *
 * The arithmetic is in the API, because RULE-032 puts it before the 16-bit to 8-bit conversion and
 * the browser only ever receives what comes after. What is tested here is the ASKING: that an
 * empty request produces no query at all, and that the channels offered follow the source. The
 * bar's own rules, marker spacing among them, are held to legacy's widget in `ThresholdBar.test.tsx`.

 *
 * Names RULE-067 so the rule is traceable to the test that proves it: a rule named in
 * NO test cannot be audited, because "covered by a test that does not say so" and "not
 * covered" look identical to a reviewer. Crop persistence across image navigation.
 */

import { describe, expect, it } from "vitest";

import {
  CHANNEL_NAMES,
  FREQUENCY_SLIDER_MAX,
  NO_PROCESSING,
  channelsFor,
  processingQuery,
  rescaleApplies,
} from "../../src/workspace/processing.js";

describe("the query string", () => {
  it("is EMPTY when nothing is asked for", () => {
    // Not "?rescaleMin=&markers_gray=". The URL of an unprocessed image has to be the string it
    // has always been, or the browser's own cache stops serving the common case.
    expect(processingQuery(NO_PROCESSING)).toBe("");
  });

  it("carries a rescale window", () => {
    expect(processingQuery({ ...NO_PROCESSING, rescale: { min: 50, max: 200 } })).toBe(
      "?rescaleMin=50&rescaleMax=200",
    );
  });

  it("leaves out a window whose handles have crossed", () => {
    // The server would ignore it, so sending it would change the URL -- and the cached image with
    // it -- for no change in the pixels.
    expect(processingQuery({ ...NO_PROCESSING, rescale: { min: 200, max: 50 } })).toBe("");
  });

  it("sorts markers, so the same set is always the same URL", () => {
    const out = processingQuery({ ...NO_PROCESSING, markers: { gray: [150, 50] } });

    expect(out).toBe("?markers_gray=50%2C150");
  });

  it("leaves out a channel with no markers", () => {
    expect(processingQuery({ ...NO_PROCESSING, markers: { r: [], g: [128] } })).toBe(
      "?markers_g=128",
    );
  });

  it("never carries which boxes are ticked, which change no pixels on their own", () => {
    // A ticked channel with no markers is legacy's inactive state (has_active_thresholding,
    // channel_threshold_widget.py:570-575): the image is shown as it is, and its URL must not move.
    expect(processingQuery({ ...NO_PROCESSING, enabled: { r: true, b: true } })).toBe("");
  });

  it("sends the crop only when there is processing for it to restrict", () => {
    const crop = { x1: 1, y1: 2, x2: 3, y2: 4 };

    // On its own the crop changes nothing about the VIEW -- its real effect is on the save -- so
    // sending it would make the URL differ for identical pixels.
    expect(processingQuery({ ...NO_PROCESSING, crop })).toBe("");
    expect(processingQuery({ ...NO_PROCESSING, markers: { gray: [128] }, crop })).toContain(
      "crop=1%2C2%2C3%2C4",
    );
  });
});

describe("what the source allows", () => {
  it("offers one Gray channel for a grayscale image and three for colour", () => {
    // RULE-029. Offering three on a grayscale image would let a user set a red threshold that the
    // server has nowhere to apply.
    expect(channelsFor(1)).toEqual(["gray"]);
    expect(channelsFor(3)).toEqual(["r", "g", "b"]);
  });

  it("allows rescale only on a grayscale image", () => {
    // RULE-032 disables the control for colour, because applying it would shift the channels
    // independently and change the hue of every pixel.
    expect(rescaleApplies(1)).toBe(true);
    expect(rescaleApplies(3)).toBe(false);
  });
});

describe("the channels' names", () => {
  it("are legacy's bar names", () => {
    // channel_threshold_widget.py:438-445.
    expect(CHANNEL_NAMES).toEqual({ gray: "Gray", r: "Red", g: "Green", b: "Blue" });
  });
});

describe("the frequency filter's parameters", () => {
  it("carries a cutoff", () => {
    expect(processingQuery({ ...NO_PROCESSING, frequencies: [1000] })).toBe("?frequencies=1000");
  });

  it("sorts several, so the same set is always the same URL", () => {
    expect(processingQuery({ ...NO_PROCESSING, frequencies: [4000, 1000] })).toBe(
      "?frequencies=1000%2C4000",
    );
  });

  it("carries intensity thresholds on their own", () => {
    // RULE-030: with no cutoffs this is a plain contrast stretch followed by posterization, which
    // is a real thing to ask for rather than a no-op.
    expect(processingQuery({ ...NO_PROCESSING, intensities: [100] })).toBe("?intensities=100");
  });

  it("reads the slider's own range", () => {
    // 0.01% steps of the half-diagonal, which is what makes 1000 a ten-percent cutoff.
    expect(FREQUENCY_SLIDER_MAX).toBe(10_000);
  });

  it("sends the crop once there is frequency filtering for it to restrict", () => {
    const crop = { x1: 1, y1: 2, x2: 3, y2: 4 };

    expect(processingQuery({ ...NO_PROCESSING, frequencies: [1000], crop })).toContain("crop=");
  });
});
