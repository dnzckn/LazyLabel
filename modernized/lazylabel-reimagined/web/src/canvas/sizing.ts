/**
 * How big the drawing aids are: vertex handles, outlines, AI point markers.
 *
 * Three settings drive it — `point_radius`, `line_thickness` and `annotation_size_multiplier` —
 * and legacy computes them as `setting * multiplier`, in SCENE units. That is the one thing that
 * cannot be ported literally, because the units are not the same thing.
 *
 * LEGACY SIZES IN IMAGE PIXELS, THIS APP SIZES ON SCREEN. A Qt graphics scene draws a 0.3-unit
 * handle that grows as you zoom in; every layer here multiplies a screen-pixel size by `perPixel`
 * so a handle stays the same size on screen however far you zoom. That is a better answer and it
 * is already made: a handle you have to zoom in to grab is a handle you cannot grab when you are
 * looking at the whole image, which is exactly when you are choosing what to fix.
 *
 * So the settings arrive as RATIOS AGAINST THEIR OWN DEFAULTS rather than as lengths. A user who
 * doubles `point_radius` gets handles twice the size either way; a user who leaves it alone gets
 * what this app already drew. Reading them as lengths would make the default 0.3 mean a 0.3-pixel
 * handle, which is not a smaller handle — it is an invisible one, and every drawing aid in the app
 * would vanish for everyone who never opened the panel.
 *
 * EXCEPT EDIT MODE'S VERTEX HANDLES, since 2026-09-26. The owner asked for legacy's Edit mode as it
 * looks and behaves, so `EditLayer` draws them as legacy's scene items are: `LEGACY_POINT_RADIUS x
 * point` IMAGE pixels, which is `point_radius x annotation_size_multiplier`, growing with the zoom.
 * The other drawing aids here still keep a constant screen size.
 */

/** Legacy's defaults, which are the denominators that make its numbers mean something here. */
export const LEGACY_POINT_RADIUS = 0.3;
export const LEGACY_LINE_THICKNESS = 0.5;

export interface Sizing {
  /**
   * Multiplier on a screen-pixel radius: drawn polygon vertices, AI point markers, the close hint.
   * Edit mode's handles take it on legacy's image-pixel radius instead (see above).
   */
  readonly point: number;
  /** Multiplier on a screen-pixel stroke width: outlines, previews, selection highlights. */
  readonly line: number;
}

export const DEFAULT_SIZING: Sizing = { point: 1, line: 1 };

/**
 * Anything outside this is refused rather than clamped into the nearest end.
 *
 * A zero or negative size is a drawing aid nobody can see; an enormous one covers the image with
 * the handles meant to help edit it. Both are reachable by hand-editing the settings file, which a
 * user doing so has every right to do -- and getting back an app that appears to have no polygon
 * tool is not a fair consequence of one bad number.
 */
const MIN = 0.1;
const MAX = 10;

function ratio(value: unknown, legacyDefault: number, multiplier: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return multiplier;
  return Math.min(MAX, Math.max(MIN, (raw / legacyDefault) * multiplier));
}

/** The sizing a settings map asks for. Defaults give exactly what the app drew before. */
export function sizingFrom(values: Readonly<Record<string, unknown>>): Sizing {
  const rawMultiplier = Number(values["annotation_size_multiplier"]);
  const multiplier =
    Number.isFinite(rawMultiplier) && rawMultiplier > 0
      ? Math.min(MAX, Math.max(MIN, rawMultiplier))
      : 1;

  return {
    point: ratio(values["point_radius"], LEGACY_POINT_RADIUS, multiplier),
    line: ratio(values["line_thickness"], LEGACY_LINE_THICKNESS, multiplier),
  };
}
