/**
 * Edit mode on the canvas: handles on every selected shape, and dragging them.
 *
 * Legacy's Edit mode, which this follows gesture for gesture (`CONTROL_PARITY.md` CP-16). The rules
 * -- which shapes have handles, the 200-vertex limit, what moving a circle's handles means -- are
 * in `tools/edit.ts`. What is here is the look and the drag.
 *
 * TWO DRAGS, told apart by where the press lands:
 *   - ON A HANDLE, that vertex follows the pointer (editable_vertex.py:30-66). A circle's centre
 *     carries the whole circle, its radius point resizes it.
 *   - ANYWHERE ELSE ON THE IMAGE, every selected polygon and circle moves together, including a
 *     polygon too big to have handles (single_view_mouse_handler.py:81-97, 183-197).
 *
 * THE SHAPE MOVES AS IT IS DRAGGED, and the drag is recorded ONCE, at release. Legacy writes each
 * pointer position straight into the segment and redraws it (`update_vertex_pos(...,
 * record_undo=False)`), then records one undo entry on release, and only if the handle moved. Here
 * the live positions go to the store unrecorded (`onPreview`), so the shape and its highlight
 * follow the pointer on the real canvas, and `onCommit` records the gesture once with the shapes as
 * they were before it -- one undo puts back the whole drag, not the last pointer event. Undoing a
 * dragged circle centre restores the whole circle, where legacy restores only the centre and
 * changes the radius (RULE-061).
 *
 * THE MOVE KEEPS THE GRAB OFFSET, as a Qt movable item does: the vertex travels by the pointer's
 * offset from the press, rather than jumping to put its centre under the pointer.
 *
 * THE HANDLES ARE LEGACY'S: cyan at alpha 180 with no outline (editable_vertex.py:16-20), sized in
 * IMAGE pixels -- `point_radius x annotation_size_multiplier`, `mw.point_radius` at
 * main_window.py:516-523 -- so they grow as the image is zoomed, as items in a Qt scene do. They
 * have no hover state; legacy's have none. The handle pressed last carries Qt's selection mark, a
 * dashed square, because legacy's handles are selectable items and Qt draws one on the item it
 * selects (editable_vertex.py:25).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type { WireSegment } from "@lazylabel/contracts";

import { locate, scale, type DisplayBox, type ImagePoint } from "./coordinates.js";
import { LEGACY_POINT_RADIUS } from "./sizing.js";
import { editSelection, moveVertex, translateSegment } from "../tools/edit.js";
import { useSizing } from "./useSizing.js";

export interface EditLayerProps {
  readonly width: number;
  readonly height: number;
  /** Every annotation on the image, by position. */
  readonly segments: readonly WireSegment[];
  /** The selected positions. Each selected Polygon and Circle is editable. */
  readonly selected: readonly number[];
  /** While a drag is under way: the shapes it has moved, as they now stand. Not recorded. */
  readonly onPreview: (moved: ReadonlyMap<number, WireSegment>) => void;
  /**
   * Once per drag that moved something. `before` is the shapes as they were at the press, which is
   * what undo has to put back; `label` is legacy's name for the action.
   */
  readonly onCommit: (
    before: ReadonlyMap<number, WireSegment>,
    after: ReadonlyMap<number, WireSegment>,
    label: string,
  ) => void;
  /** Legacy's warning for a selected polygon with more vertices than the handle limit. */
  readonly onNotice?: (message: string) => void;
}

/** Legacy's handle fill: `QColor(Qt.GlobalColor.cyan)` with alpha 180 (editable_vertex.py:16-18). */
export const HANDLE_FILL = `rgba(0, 255, 255, ${180 / 255})`;

/** Legacy's names for the two recorded actions: "Undid: Move Vertex", "Undid: Move Polygon". */
export const MOVE_VERTEX = "Move vertex";
export const MOVE_SHAPES = "Move polygon";

interface Drag {
  readonly pointerId: number;
  /** Where the press landed, in image pixels. Every move is measured from here. */
  readonly from: ImagePoint;
  /** Where the pointer was last seen, for a release that cannot be located. */
  to: ImagePoint;
  /** The shapes as they were at the press: what each move is applied to, and what undo restores. */
  readonly before: ReadonlyMap<number, WireSegment>;
  /** Every shape this drag has handed to the store, to tell its own changes from anyone else's. */
  readonly produced: WeakSet<WireSegment>;
  /** The vertex being dragged, or null when the whole selection is. */
  readonly vertex: { readonly index: number; readonly vertex: number } | null;
  /** Whether anything has been previewed yet, and so whether abandoning has anything to undo. */
  moved: boolean;
}

/** The handle pressed last, and the versions of its shape it is still the handle of. */
interface Pressed {
  readonly index: number;
  readonly vertex: number;
  readonly owned: WeakSet<WireSegment>;
}

export function EditLayer({
  width,
  height,
  segments,
  selected,
  onPreview,
  onCommit,
  onNotice,
}: EditLayerProps): ReactNode {
  const sizing = useSizing();
  const surfaceRef = useRef<SVGSVGElement>(null);
  const image = { width, height };
  const { handles, warnings, movable } = editSelection(segments, selected);

  // Read through refs by the handlers and effects below: the callbacks are new on every render of
  // the view, and an effect that depended on them would run on every one.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  const drag = useRef<Drag | null>(null);
  const [pressed, setPressed] = useState<Pressed | null>(null);

  /*
   * LEGACY'S WARNING, ONCE PER POLYGON THAT BRINGS IT. Legacy shows it whenever it lays the handles
   * down: entering the mode, and every time the list is redrawn. Said once here when a polygon over
   * the limit joins the selection, not again on every pointer event of a drag that moves it.
   */
  const reported = useRef<ReadonlySet<string>>(new Set());
  const warningsKey = warnings.join("\n");
  useEffect(() => {
    const now = new Set(warningsKey === "" ? [] : warningsKey.split("\n"));
    for (const warning of now) {
      if (!reported.current.has(warning)) onNoticeRef.current?.(warning);
    }
    reported.current = now;
  }, [warningsKey]);

  const boxOf = useCallback((): DisplayBox | null => {
    const element = surfaceRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  /*
   * MEASURED AFTER MOUNT, and again whenever the surface changes size -- which zoom does. The
   * handles themselves are in image pixels and need no measuring; the selection mark's hairline
   * does, because Qt draws it one SCREEN pixel wide at any zoom.
   */
  const [measured, setMeasured] = useState<DisplayBox | null>(null);
  useLayoutEffect(() => {
    const update = () => setMeasured(boxOf());
    update();
    const surface = surfaceRef.current;
    if (surface === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [boxOf]);

  /** The image point under the pointer, or null before the surface can be measured. */
  const pointOf = (event: { readonly clientX: number; readonly clientY: number }) => {
    const box = boxOf();
    if (box === null) return null;
    const located = locate(event, box, image);
    return Number.isNaN(located.point.x) || Number.isNaN(located.point.y) ? null : located;
  };

  /** Whether the dragged shapes are still the ones this drag put there, not someone else's. */
  const unchangedSince = (current: Drag): boolean => {
    for (const [index, segment] of current.before) {
      const now = segmentsRef.current[index];
      if (now === undefined || (now !== segment && !current.produced.has(now))) return false;
    }
    return true;
  };

  /** The dragged shapes with the pointer at `to`. */
  const movedTo = (current: Drag, to: ImagePoint): Map<number, WireSegment> => {
    // No clamping: legacy lets a vertex, or the whole selection, leave the image, and saving
    // rasterizes only what falls inside it.
    const dx = to.x - current.from.x;
    const dy = to.y - current.from.y;
    const after = new Map<number, WireSegment>();
    for (const [index, segment] of current.before) {
      if (current.vertex === null) {
        after.set(index, translateSegment(segment, dx, dy));
        continue;
      }
      const vertex = segment.vertices?.[current.vertex.vertex];
      if (vertex === undefined) continue;
      after.set(index, moveVertex(segment, current.vertex.vertex, { x: vertex[0] + dx, y: vertex[1] + dy }));
    }
    return after;
  };

  /** Put the shapes back as they were at the press, and forget the drag. */
  const abandon = () => {
    const current = drag.current;
    drag.current = null;
    if (current === null || !current.moved || !unchangedSince(current)) return;
    onPreviewRef.current(current.before);
  };
  const abandonRef = useRef(abandon);
  abandonRef.current = abandon;

  const begin = (
    event: React.PointerEvent,
    from: ImagePoint,
    before: ReadonlyMap<number, WireSegment>,
    vertex: Drag["vertex"],
    produced: WeakSet<WireSegment>,
  ) => {
    // On the surface rather than the handle, so the moves and the release keep arriving here
    // when the pointer leaves the handle, or the image. Refused for a pointer the browser never
    // saw, which is not a reason to refuse the drag.
    try {
      surfaceRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      // the drag still works while the pointer stays over the surface
    }
    drag.current = { pointerId: event.pointerId, from, to: from, before, produced, vertex, moved: false };
  };

  /** A press on a handle: that vertex is dragged. */
  const pressHandle = (event: React.PointerEvent<SVGEllipseElement>, index: number, vertex: number) => {
    if (event.button !== 0) return;
    event.stopPropagation(); // not also a drag of the whole selection
    const segment = segmentsRef.current[index];
    const at = pointOf(event);
    if (segment === undefined || at === null) return;

    const produced = new WeakSet<WireSegment>([segment]);
    begin(event, at.point, new Map([[index, segment]]), { index, vertex }, produced);
    // Qt selects the item it is pressed on, and draws its selection mark until another is pressed.
    setPressed({ index, vertex, owned: produced });
  };

  /** A press anywhere else on the image: the whole selection is dragged. */
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const at = pointOf(event);
    // Legacy starts this drag only on the picture (single_view_mouse_handler.py:83).
    if (at === null || at.kind !== "inside") return;

    const before = new Map<number, WireSegment>();
    for (const index of movable) {
      const segment = segmentsRef.current[index];
      if (segment !== undefined) before.set(index, segment);
    }
    // Nothing selected to move. Legacy records an empty move here; there is nothing to undo.
    if (before.size === 0) return;

    begin(event, at.point, before, null, new WeakSet(before.values()));
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    // Something else changed these shapes mid-drag -- an undo, a delete. Theirs stands; this drag
    // is over, rather than writing a stale shape back over it, or over whatever now has its index.
    if (!unchangedSince(current)) {
      drag.current = null;
      return;
    }

    const at = pointOf(event);
    if (at === null) return;
    current.to = at.point;
    if (!current.moved && at.point.x === current.from.x && at.point.y === current.from.y) return;

    const after = movedTo(current, at.point);
    for (const segment of after.values()) current.produced.add(segment);
    current.moved = true;
    // Legacy lays every handle down again as the selection moves, which drops Qt's selection mark.
    if (current.vertex === null) setPressed(null);
    onPreviewRef.current(after);
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    drag.current = null;
    try {
      surfaceRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // already released
    }
    if (!unchangedSince(current)) return;

    const to = pointOf(event)?.point ?? current.to;
    if (to.x === current.from.x && to.y === current.from.y) {
      // Released where it was pressed: nothing to record. Legacy records a handle only if it moved
      // (editable_vertex.py:52); a drag that came back to its start is put back exactly.
      if (current.moved) onPreviewRef.current(current.before);
      return;
    }

    const after = movedTo(current, to);
    if (current.vertex !== null) {
      const shape = after.get(current.vertex.index);
      // Still the selected handle, of this version of the shape and no other: an undo takes the
      // mark away, as legacy's undo does by laying the handles down again.
      if (shape !== undefined) {
        setPressed({ index: current.vertex.index, vertex: current.vertex.vertex, owned: new WeakSet([shape]) });
      }
    } else {
      setPressed(null);
    }
    onCommitRef.current(current.before, after, current.vertex === null ? MOVE_SHAPES : MOVE_VERTEX);
  };

  // Escape abandons a drag and puts the shapes back, and so does the layer going away mid-drag --
  // another tool, another image -- rather than leaving a half-dragged shape nobody can undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || drag.current === null) return;
      event.preventDefault();
      abandonRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      abandonRef.current();
    };
  }, []);

  // The mark goes with the version of the shape it was put on: an undo, a class change, anything
  // else that replaces the shape takes it away, as legacy's mark goes when its handles are laid
  // down again.
  const pressedShape = pressed === null ? undefined : segments[pressed.index];
  const pressedHolds = pressed !== null && pressedShape !== undefined && pressed.owned.has(pressedShape);

  const box = measured ?? boxOf();
  const perPixel = box === null ? { x: 1, y: 1 } : scale(box, image);
  const hairline = Math.max(perPixel.x, perPixel.y);
  // `mw.point_radius`: the setting times the size multiplier, in image pixels (`sizing.ts` carries
  // them as a ratio against legacy's default, so this is that default times the ratio).
  const radius = LEGACY_POINT_RADIUS * sizing.point;

  return (
    <svg
      ref={surfaceRef}
      // At legacy's Z 200: over the annotations and the AI preview, under the selection's highlight
      // (editable_vertex.py:14, 82; `styles.css`, "THE STACK'S DEPTHS").
      className="polygon-layer edit-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="Edit tool"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => abandonRef.current()}
      // Legacy's Edit cursor, over the handles too (mode_manager.py:138).
      style={{ cursor: "move" }}
    >
      {handles.map(({ index, vertices }) =>
        vertices.map((vertex, at) => (
          <g key={`${index}-${at}`}>
            <ellipse
              data-testid={`handle-${index}-${at}`}
              cx={vertex.x}
              cy={vertex.y}
              rx={radius}
              ry={radius}
              fill={HANDLE_FILL}
              stroke="none"
              onPointerDown={(event) => pressHandle(event, index, at)}
              // The whole disc takes the press, as the item's shape does in Qt.
              pointerEvents="all"
            />
            {pressedHolds && pressed.index === index && pressed.vertex === at && (
              // Qt's mark for a selected item: a hairline square in the window's text colour,
              // dashed over a solid one in its contrast, on the item's bounding box.
              <g data-testid="handle-selected" fill="none" pointerEvents="none">
                <rect
                  x={vertex.x - radius}
                  y={vertex.y - radius}
                  width={2 * radius}
                  height={2 * radius}
                  strokeWidth={hairline}
                  style={{ stroke: "var(--ground)" }}
                />
                <rect
                  x={vertex.x - radius}
                  y={vertex.y - radius}
                  width={2 * radius}
                  height={2 * radius}
                  strokeWidth={hairline}
                  strokeDasharray={`${4 * hairline} ${2 * hairline}`}
                  style={{ stroke: "var(--ink)" }}
                />
              </g>
            )}
          </g>
        )),
      )}
    </svg>
  );
}
