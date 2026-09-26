/**
 * Editing shapes in Edit mode — RULE-046, RULE-069 and `CONTROL_PARITY.md` CP-16.
 *
 * Only two of the four segment types can be edited at all, and the reason is what they hold. A
 * Polygon and a Circle are stored as VERTICES, so a handle is a thing the user can move. An AI or
 * Loaded segment is stored as a MASK — there is nothing to drag, and the pixels came from a model
 * or a file rather than from a set of points.
 *
 * That makes "Loaded" the trap. A polygon read back from a YOLO-seg or COCO file looks exactly like
 * a polygon the user drew: same outline on screen, same class, same colour. It is type "Loaded" and
 * is NOT editable, because the reader rasterized it on the way in and the vertices it displays are
 * derived from that mask rather than authoritative. Offering handles would let a user drag points
 * that are then discarded on save.
 *
 * EVERY SELECTED SHAPE IS EDITABLE AT ONCE, as in legacy: `display_edit_handles` gives handles to
 * each selected Polygon and Circle (edit_mode_manager.py:94-135), and a press on the image that
 * misses every handle drags the whole selection (single_view_mouse_handler.py:81-97, 183-197).
 * This app used to offer handles only when exactly one shape was selected, under a comment saying
 * legacy refuses several. It does not.
 *
 * THE 200-VERTEX LIMIT IS ABOUT THE HANDLES, NOT THE MODE. Legacy opens edit mode for a
 * 350-vertex polygon and shows no handles on it, with a warning saying why. It does not refuse to
 * enter the mode, which matters when several shapes are selected: the other, smaller ones keep
 * their handles, and the big one still moves with the rest when the selection is dragged.
 */

import type { WireSegment } from "@lazylabel/contracts";

import type { Point } from "./polygon.js";

/** `edit_mode_manager.py`'s `max_editable_vertices`. */
export const MAX_EDITABLE_VERTICES = 200;

/** The two types stored as vertices. An AI or Loaded segment is a mask and has nothing to drag. */
export function isEditableType(segment: WireSegment): boolean {
  return segment.type === "Polygon" || segment.type === "Circle";
}

export type EditModeOutcome =
  | { readonly kind: "enter"; readonly editable: readonly number[] }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Whether edit mode can open for this selection, and which of the selected shapes it applies to.
 *
 * Refused with legacy's own words when nothing selected is editable (mode_manager.py:88-109),
 * because that message is the only thing distinguishing "the hotkey is not bound" from "this shape
 * cannot be edited" — and a user whose selection is an AI mask will otherwise press R repeatedly.
 */
export function enterEditMode(
  segments: readonly WireSegment[],
  selected: readonly number[],
): EditModeOutcome {
  const editable = selected.filter((index) => {
    const segment = segments[index];
    return segment !== undefined && isEditableType(segment);
  });

  if (editable.length === 0) {
    return { kind: "refused", reason: "No editable shapes selected!" };
  }

  return { kind: "enter", editable };
}

export type HandlesOutcome =
  | { readonly kind: "handles"; readonly vertices: readonly Point[] }
  /** A polygon over the limit: legacy's warning is carried through verbatim. */
  | { readonly kind: "too-many"; readonly reason: string }
  /** A mask, or a shape with no vertices. Legacy passes over these without a word. */
  | { readonly kind: "none" };

/**
 * The draggable handles for one shape.
 *
 * A circle always gets both of its handles regardless of the limit — it has exactly two, and the
 * limit exists to stop a few hundred overlapping hit targets appearing on one outline.
 */
export function handlesFor(segment: WireSegment): HandlesOutcome {
  const vertices = segment.vertices ?? [];
  if (!isEditableType(segment) || vertices.length === 0) return { kind: "none" };

  if (segment.type === "Polygon" && vertices.length > MAX_EDITABLE_VERTICES) {
    return {
      kind: "too-many",
      // edit_mode_manager.py:112-117, word for word.
      reason:
        `Polygon has ${vertices.length} vertices (max ${MAX_EDITABLE_VERTICES} for editing). `
        + "Use lower resolution setting when creating polygons.",
    };
  }

  return { kind: "handles", vertices: vertices.map(([x, y]) => ({ x, y })) };
}

/** One selected shape's handles, and where the shape sits in the list. */
export interface ShapeHandles {
  readonly index: number;
  readonly vertices: readonly Point[];
}

export interface EditSelection {
  /**
   * Every selected shape that gets handles, lowest position first.
   *
   * Legacy's order: it walks the selected ROWS of the segment table, which list the segments in
   * order (right_panel.py:351-359). It is also paint order, and so which of two overlapping handles
   * is on top and takes the press: the one added last.
   */
  readonly handles: readonly ShapeHandles[];
  /** Legacy's warning for each selected polygon over the limit, in the same order. */
  readonly warnings: readonly string[];
  /**
   * Every selected shape a drag on the image moves: each Polygon and Circle, over the handle limit
   * or not (single_view_mouse_handler.py:86-95 filters by type alone).
   */
  readonly movable: readonly number[];
}

/** What Edit mode offers for a selection: handles, warnings, and what a drag of the image moves. */
export function editSelection(
  segments: readonly WireSegment[],
  selected: readonly number[],
): EditSelection {
  const handles: ShapeHandles[] = [];
  const warnings: string[] = [];
  const movable: number[] = [];

  // Sorted and de-duplicated, because a selection is a set of rows: the order a user clicked them
  // in is not the order legacy lays their handles down in.
  for (const index of [...new Set(selected)].sort((a, b) => a - b)) {
    const segment = segments[index];
    if (segment === undefined) continue;

    const outcome = handlesFor(segment);
    if (outcome.kind === "handles") handles.push({ index, vertices: outcome.vertices });
    if (outcome.kind === "too-many") warnings.push(outcome.reason);
    if (outcome.kind !== "none") movable.push(index);
  }

  return { handles, warnings, movable };
}

/**
 * Move one vertex, returning the changed segment.
 *
 * A CIRCLE IS NOT A POLYGON HERE, and the difference is the whole function. Its two vertices are a
 * centre and a point at its radius, so dragging them means different things: the centre TRANSLATES
 * the circle, carrying the radius point with it by the same offset, and the radius point RESIZES
 * it, leaving the centre alone (`edit_mode_manager.py:188-239`). Treating them as two independent
 * points — which is what a shared polygon path would do — makes dragging a circle's centre turn it
 * into a different, larger or smaller circle as a side effect.
 *
 * One asymmetry worth naming, because it looks like a bug and is not: a freshly DRAWN circle stores
 * its radius point at 3 o'clock, while an EDITED one stores it wherever the handle was dragged to.
 * Legacy does this, and it changes nothing that matters — the radius is the distance between the
 * two points either way, so the circle rasterizes identically. Re-normalizing to 3 o'clock on edit
 * would make the handle jump out from under the cursor mid-drag.
 */
export function moveVertex(segment: WireSegment, index: number, to: Point): WireSegment {
  const vertices = segment.vertices ?? [];
  if (index < 0 || index >= vertices.length) return segment;

  if (segment.type === "Circle") {
    if (vertices.length < 2) return segment;
    const [centre, edge] = vertices as [readonly [number, number], readonly [number, number]];

    if (index === 0) {
      const dx = to.x - centre[0];
      const dy = to.y - centre[1];
      return { ...segment, vertices: [[to.x, to.y], [edge[0] + dx, edge[1] + dy]] };
    }

    if (index === 1) return { ...segment, vertices: [centre, [to.x, to.y]] };

    // Any other index on a circle is a malformed segment, and legacy returns without touching it
    // (`edit_mode_manager.py:214-215`). Falling through to the radius branch instead -- which is
    // what an `if (0) ... else ...` would do -- turns a stray third vertex into a resize.
    return segment;
  }

  const moved = vertices.map((vertex, at) =>
    at === index ? ([to.x, to.y] as const) : vertex,
  );
  return { ...segment, vertices: moved };
}

/**
 * Move a whole shape by an offset: every vertex, so a circle keeps its radius.
 *
 * What a drag on the image does to each selected shape (single_view_mouse_handler.py:183-193). The
 * offset is always taken from where the drag STARTED, applied to the shape as it was then --
 * applying each pointer event's offset to the previous result would carry the shape off by the
 * sum of every intermediate position.
 */
export function translateSegment(segment: WireSegment, dx: number, dy: number): WireSegment {
  const vertices = segment.vertices;
  if (vertices === undefined || (dx === 0 && dy === 0)) return segment;
  return { ...segment, vertices: vertices.map(([x, y]) => [x + dx, y + dy] as const) };
}
