/**
 * Display adjustments — RULE-028.
 *
 * Three steps in a fixed order: saturation, then brightness and contrast, then gamma. The order is
 * not interchangeable — gamma after a clip is a different picture from gamma before one — and it
 * is legacy's, because Phase 5's exit criterion requires these to match on golden images.
 *
 * THE NEGATIVE-BRIGHTNESS FOLD IS REPRODUCED ON PURPOSE. `cv2.convertScaleAbs` takes the ABSOLUTE
 * value before saturating, so a brightness of -100 turns [0, 30, 100, 200, 255] into
 * [100, 70, 0, 100, 155]: darkening an image makes its darkest pixels BRIGHT, and a gradient
 * folds back on itself. It is the strangest thing in this file and it is not a mistake in the
 * port. Two reasons it stays:
 *
 *   - Phase 5's exit criterion 4 says display adjustments must match legacy on golden images.
 *     "Match except where legacy is wrong" is not a criterion anyone can test against.
 *   - With Operate On View enabled (RULE-089) these adjusted pixels are what SAM segments, so the
 *     fold changes MASKS, not just appearance. A port that quietly clipped instead would produce
 *     different annotations from the desktop app on the same image and settings.
 *
 * `folds` reports when it happens, so the app can tell a user their image is about to look wrong
 * rather than leaving them to conclude the slider is broken.
 */

/*
 * THE PIXEL MATHS MOVED to `@lazylabel/annotation-formats`, re-exported here so every caller in
 * this app keeps importing it from the same place.
 *
 * It went because the API needs the identical pixels to hand a model under RULE-089's Operate On
 * View, and two implementations of `cv2.convertScaleAbs` would be two things to prove. What stays
 * is the part that reads SETTINGS, which is a question about a settings map rather than about
 * pixels, and which the shared package has no business knowing.
 */
import { NEUTRAL, type Adjustments } from "@lazylabel/annotation-formats";

export {
  NEUTRAL,
  adjustImage,
  adjustPixel,
  isNeutral,
  type Adjustments,
} from "@lazylabel/annotation-formats";

/**
 * Read the adjustments out of a settings bag.
 *
 * ONE reader, used by both the panel that writes these and the canvas that renders them. Two
 * readers is two chances to disagree about what a settings file means, and the way that shows up
 * is a slider whose position does not match the picture.
 *
 * A settings file can hold anything — it is imported from the desktop app and can be hand-edited.
 * A non-number falls back to neutral rather than reaching the arithmetic: a NaN gamma blanks every
 * pixel of the image, which looks like a decode failure rather than a bad setting.
 */
export function adjustmentsFrom(values: Readonly<Record<string, unknown>>): Adjustments {
  return {
    brightness: numberOr(values["brightness"], NEUTRAL.brightness),
    contrast: numberOr(values["contrast"], NEUTRAL.contrast),
    gamma: numberOr(values["gamma"], NEUTRAL.gamma),
    saturation: numberOr(values["saturation"], NEUTRAL.saturation),
  };
}

/**
 * True when this brightness will fold rather than darken.
 *
 * Any negative brightness folds SOME pixel: the ones whose adjusted value goes below zero come
 * back up as positive. Reporting it is what separates "this looks wrong" from "the slider is
 * broken".
 */
export function folds(adjustments: Adjustments): boolean {
  return adjustments.brightness < 0;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
