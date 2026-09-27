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
 * EXCEPT WHAT LEGACY DRAWS WHILE SOMETHING IS BEING MADE OR EDITED. The owner asked for legacy's
 * Edit mode as it looks and behaves (2026-09-26), and for its drawing overlays (2026-09-27: "check
 * pyqt6 styling on this try to mimic"). So Edit mode's handles, the AI tool's points, a polygon in
 * progress and the rubber bands are drawn as legacy's scene items are, in IMAGE pixels that grow
 * with the zoom: `legacyPointRadius` is `point_radius x annotation_size_multiplier` and
 * `legacyLineThickness` is `line_thickness x annotation_size_multiplier` (main_window.py:516-538).
 * At the owner's multiplier of 4.7 those are 1.41 and 2.35 image pixels, where a screen size times
 * the ratio came to 18.8 and 4.7 screen pixels.
 */

/** Legacy's defaults, which are the denominators that make its numbers mean something here. */
export const LEGACY_POINT_RADIUS = 0.3;
export const LEGACY_LINE_THICKNESS = 0.5;

export interface Sizing {
  /** `point_radius x annotation_size_multiplier` as a ratio against legacy's default radius. */
  readonly point: number;
  /**
   * `line_thickness x annotation_size_multiplier` as a ratio against legacy's default: a multiplier
   * on a screen-pixel stroke width for outlines, and legacy's own width in the drawing overlays.
   */
  readonly line: number;
}

/** Legacy's `mw.point_radius`, in image pixels: its default times the ratio. */
export function legacyPointRadius(sizing: Sizing): number {
  return LEGACY_POINT_RADIUS * sizing.point;
}

/** Legacy's `mw.line_thickness`, in image pixels: its default times the ratio. */
export function legacyLineThickness(sizing: Sizing): number {
  return LEGACY_LINE_THICKNESS * sizing.line;
}

/**
 * Qt's `DashLine` on a pen `width` wide, as SVG attributes: dashes of 4 widths and gaps of 2
 * (qpen.cpp), and the pen's default square cap, which Qt puts on every dash, so each shows 5 widths
 * long with a gap of 1.
 */
export function qtDashLine(width: number): { readonly strokeDasharray: string; readonly strokeLinecap: "square" } {
  return { strokeDasharray: `${4 * width} ${2 * width}`, strokeLinecap: "square" };
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
