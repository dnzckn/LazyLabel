/**
 * A press on the half not being edited, handed to the view once it is drawn there.
 *
 * Legacy's press in either Multi viewer makes that viewer the active one AND does what the tool
 * does there: the AI tool starts a point or a box, which the release settles; the polygon tool
 * places a vertex; the box and circle tools start their drag (main_window.py:5498-5537, 5539-5583).
 * Here the view is drawn in the half being edited only. So the other half takes the gesture itself
 * (`IdlePress.tsx`), makes its image the one edited, and hands the gesture over; the view drawn
 * there next finishes it as if it had been made on it. Until 2026-09-27 a click there only made it
 * the one edited.
 *
 * HANDED AS DATA, IN THAT IMAGE'S PIXELS. The view is laid out differently from the picture it
 * replaces, so a pointer position would land somewhere else on it.
 */

import { createContext } from "react";

import type { ImagePoint } from "../canvas/coordinates.js";

/** The tools whose press legacy acts on in either viewer, bar selection. */
export type PressTool = "ai" | "polygon" | "box" | "circle";

export interface HandedPress {
  readonly tool: PressTool;
  /** Where the pointer went down, and where it came up; the same point for a polygon's press. */
  readonly from: ImagePoint;
  readonly to: ImagePoint;
  /** The AI tool's right button: a negative point, as the view's own layer reads it. */
  readonly negative: boolean;
  /** Shift held: a box or a circle erases, as the view's own layer does. */
  readonly shift: boolean;
}

/**
 * The press handed to the view just drawn in the half it was made on, or null. It is there for the
 * render that draws the view; a layer that wants it keeps it (`claim`).
 */
export const PairPressContext = createContext<HandedPress | null>(null);

const claimed = new WeakSet<HandedPress>();

/**
 * True the first time a press is claimed, false after. A press is acted on once, however often the
 * effect that takes it runs -- React's development mode runs every effect twice.
 */
export function claim(press: HandedPress): boolean {
  if (claimed.has(press)) return false;
  claimed.add(press);
  return true;
}
