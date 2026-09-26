/**
 * Fitting the open image to its pane, as legacy's viewer does on every load.
 *
 * Legacy calls `fitInView(..., KeepAspectRatio)` (photo_viewer.py:42-54), which scales UP as well
 * as down: a 400x300 frame in an 892x755 pane is drawn at 892x669, not left at 400x300 in a corner.
 * CSS `max-width` and `max-height` only ever shrink, so the scale is worked out here and handed to
 * the canvas as an ordinary zoom.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** How far zooming goes either way, for the buttons, the keys and the wheel alike. */
export const ZOOM_MIN = 0.125;
export const ZOOM_MAX = 8;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * CSS pixels per image pixel that show the whole image as large as the pane allows, or null when
 * either size is not known yet (a pane not laid out measures 0).
 */
export function fitScale(pane: Size, image: Size): number | null {
  if (!(pane.width > 0 && pane.height > 0 && image.width > 0 && image.height > 0)) return null;
  return Math.min(pane.width / image.width, pane.height / image.height);
}
