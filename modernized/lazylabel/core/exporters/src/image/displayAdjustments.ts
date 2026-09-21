/**
 * RULE-028's display adjustments — brightness, contrast, gamma and saturation.
 *
 * HERE RATHER THAN IN THE WEB APP, and for the reason the geometry beside it gives: these are
 * ports of OpenCV's own arithmetic (`cv2.convertScaleAbs` and a gamma lookup table), and a second
 * implementation would be a second thing to prove. The browser applies them to what it draws; the
 * API needs the same pixels to hand a model under RULE-089's Operate On View, and the two must
 * agree exactly or the mask comes back for an image the user was not looking at.
 *
 * Reading them OUT OF SETTINGS stays in the web app: that is a question about a settings map, not
 * about pixels, and this package does not know what a setting is.
 */

export interface Adjustments {
  /** -100..100. Negative values FOLD rather than darken; see the note above. */
  readonly brightness: number;
  /** -100..100. */
  readonly contrast: number;
  /** 0.01..2.00. 1 is no change. */
  readonly gamma: number;
  /** 0..2. 1 is no change, 0 is greyscale. */
  readonly saturation: number;
}

export const NEUTRAL: Adjustments = { brightness: 0, contrast: 0, gamma: 1, saturation: 1 };

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** BT.601 luma, which is what legacy's greyscale blend uses. */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** Whether these adjustments would change anything at all. */
export function isNeutral(adjustments: Adjustments): boolean {
  return (
    adjustments.brightness === 0
    && adjustments.contrast === 0
    && adjustments.gamma === 1
    && adjustments.saturation === 1
  );
}

/**
 * Apply the adjustments to one RGB pixel, returning 8-bit values.
 *
 * Kept per-pixel and exported so a test can work the rule card's examples exactly. Applying it to
 * a whole image is a loop over this, and a loop is easier to get right than a formula duplicated
 * into one.
 */
export function adjustPixel(
  r: number,
  g: number,
  b: number,
  adjustments: Adjustments,
): readonly [number, number, number] {
  let red = r;
  let green = g;
  let blue = b;

  // 1. Saturation: blend toward BT.601 grey. s of 1 leaves the pixel alone, 0 makes it grey, and
  // above 1 pushes past the original colour.
  if (adjustments.saturation !== 1) {
    const grey = LUMA_R * red + LUMA_G * green + LUMA_B * blue;
    red = grey + adjustments.saturation * (red - grey);
    green = grey + adjustments.saturation * (green - grey);
    blue = grey + adjustments.saturation * (blue - grey);
  }

  // 2. Brightness and contrast: |p x (1 + contrast/100) + brightness|, saturated to 0..255. The
  // absolute value is `cv2.convertScaleAbs`, and it is the fold.
  if (adjustments.contrast !== 0 || adjustments.brightness !== 0) {
    const scale = 1 + adjustments.contrast / 100;
    red = scaleAbs(red, scale, adjustments.brightness);
    green = scaleAbs(green, scale, adjustments.brightness);
    blue = scaleAbs(blue, scale, adjustments.brightness);
  }

  // 3. Gamma, as a lookup legacy builds once per change: 255 x (p/255)^(1/gamma), truncated.
  if (adjustments.gamma !== 1) {
    red = gammaOf(red, adjustments.gamma);
    green = gammaOf(green, adjustments.gamma);
    blue = gammaOf(blue, adjustments.gamma);
  }

  return [clamp8(red), clamp8(green), clamp8(blue)];
}

/**
 * Apply to a whole RGBA buffer in place, leaving alpha untouched.
 *
 * Alpha is preserved rather than adjusted: it is not a colour, and running it through a gamma
 * curve would make a half-transparent overlay change opacity when the user moved a brightness
 * slider.
 */
export function adjustImage(pixels: Uint8ClampedArray, adjustments: Adjustments): void {
  if (isNeutral(adjustments)) return;

  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = adjustPixel(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, adjustments);
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
}

/** `cv2.convertScaleAbs`: round, take the absolute value, then saturate. */
function scaleAbs(value: number, scale: number, shift: number): number {
  return Math.min(255, Math.abs(Math.round(value * scale + shift)));
}

function gammaOf(value: number, gamma: number): number {
  return Math.trunc(255 * (clamp8(value) / 255) ** (1 / gamma));
}

function clamp8(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}
