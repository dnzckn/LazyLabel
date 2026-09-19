/**
 * RULE-034: the colour a class is drawn in.
 *
 * Hue is `int(class_id * 222.4922359) mod 360`, with saturation and value both 220 on Qt's 0..255
 * scale; a segment with no class is grey, HSV(0, 0, 128).
 *
 * The step is roughly the golden angle, which is why consecutive class ids look so different: 0,
 * 222, 84, 307. Reproducing it matters more than it sounds — a user who has been labelling a
 * dataset for a month knows their classes by colour, and a new palette makes every image they open
 * look wrong.
 *
 * THE TRUNCATION IS BEFORE THE MODULO, and that is not interchangeable. `int(2 * 222.4922359)` is
 * `int(444.9844718)` = 444, then `444 % 360` = 84. Taking the modulo first would give
 * `444.9844718 % 360` = 84.98, truncating to 84 here but to a different hue for other ids.
 *
 * Nominally Phase 5 work, implemented now because Phase 4 draws the annotations it loads and would
 * otherwise need a temporary palette that Phase 5 would have to take back out.
 */

/** Qt's hue step, roughly the golden angle. */
const HUE_STEP = 222.4922359;
const SATURATION = 220;
const VALUE = 220;

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Grey, for a segment that has no class yet. HSV(0, 0, 128). */
export const UNCLASSED: Rgb = { r: 128, g: 128, b: 128 };

export function classColor(classId: number | null): Rgb {
  if (classId === null) return UNCLASSED;

  // Truncate toward zero first, exactly as Python's int() does, then wrap.
  const hue = Math.trunc(classId * HUE_STEP) % 360;
  return hsvToRgb(hue < 0 ? hue + 360 : hue, SATURATION, VALUE);
}

export function cssColor(classId: number | null, alpha = 1): string {
  const { r, g, b } = classColor(classId);
  return alpha === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

/**
 * HSV to RGB, on Qt's scales: hue in 0..359, saturation and value in 0..255.
 *
 * Written out rather than taken from a library because the scales are the unusual part: most
 * implementations take saturation and value as 0..1, and quietly treating 220 as 220.0 would
 * produce white.
 */
export function hsvToRgb(hue: number, saturation: number, value: number): Rgb {
  const s = saturation / 255;
  const v = value / 255;

  const sector = (hue / 60) % 6;
  const chroma = v * s;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = v - chroma;

  let rgb: [number, number, number];
  if (sector < 1) rgb = [chroma, second, 0];
  else if (sector < 2) rgb = [second, chroma, 0];
  else if (sector < 3) rgb = [0, chroma, second];
  else if (sector < 4) rgb = [0, second, chroma];
  else if (sector < 5) rgb = [second, 0, chroma];
  else rgb = [chroma, 0, second];

  return {
    r: Math.round((rgb[0] + base) * 255),
    g: Math.round((rgb[1] + base) * 255),
    b: Math.round((rgb[2] + base) * 255),
  };
}
