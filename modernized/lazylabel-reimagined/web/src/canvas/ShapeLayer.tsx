/**
 * Drawing a box or a circle: one drag, previewed, with the shape decided at release.
 *
 * The rules are in `tools/shapes.ts`; what is here is the drag. Two things about a drag make it
 * more than a pair of clicks, and both are why this is separate from `PolygonLayer`:
 *
 * POINTER CAPTURE. A user dragging a box around an object near the edge WILL leave the canvas.
 * Without capture the element stops receiving events the moment the pointer crosses its boundary,
 * the release never arrives, and the shape is silently lost — after the user has done the work.
 * With it, the element keeps the pointer until release wherever it happens.
 *
 * THE SHAPE IS DECIDED AT RELEASE, NOT DURING. RULE-043's minimums are checked once, against the
 * final drag. Checking during would make the preview disappear and reappear as the user crosses
 * one pixel, which reads as the tool being broken rather than as a size limit.
 */

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { claim, PairPressContext } from "../split/pairPress.js";
import { locate, type DisplayBox, type ImagePoint } from "./coordinates.js";
import { boxFrom, circleFrom, radiusOf } from "../tools/shapes.js";
import { legacyLineThickness, qtDashLine } from "./sizing.js";
import { useSizing } from "./useSizing.js";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";

export type ShapeKind = "box" | "circle";

export interface ShapeLayerProps {
  readonly kind: ShapeKind;
  readonly width: number;
  readonly height: number;
  /** The finished shape's vertices, in the order the wire format stores them. */
  readonly onComplete: (vertices: readonly ImagePoint[]) => void;
  /** Released with shift held: erase what the shape overlaps instead of adding it. */
  readonly onErase?: (vertices: readonly ImagePoint[]) => void;
  /** A drag too small to be a shape. Legacy discards these without a word. */
  readonly onRefused?: (reason: string) => void;
}

/** Legacy's rubber band colour for both shapes, `Qt.GlobalColor.red`. */
const RUBBER_BAND = "rgb(255, 0, 0)";

interface Drag {
  readonly from: ImagePoint;
  readonly to: ImagePoint;
}

export function ShapeLayer({
  kind,
  width,
  height,
  onComplete,
  onErase,
  onRefused,
}: ShapeLayerProps): ReactNode {
  const sizing = useSizing();
  const surfaceRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const image = { width, height };

  const boxOf = useCallback((): DisplayBox | null => {
    const element = surfaceRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      const box = boxOf();
      if (box === null) return;

      const located = locate(event, box, image);
      if (located.kind === "outside") return;

      // Capture before anything else: without it, a drag that leaves the canvas -- which drawing a
      // box around an object near the edge always does -- never delivers its release.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDrag({ from: located.point, to: located.point });
    },
    [boxOf, image],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (drag === null) return;
      const box = boxOf();
      if (box === null) return;

      // Deliberately NOT refused when it leaves the image: the preview follows the pointer out and
      // the shape is clamped by the mask when it rasterizes, which is what a user dragging past
      // the edge to enclose something at the edge expects.
      setDrag({ from: drag.from, to: locate(event, box, image).point });
    },
    [boxOf, drag, image],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (drag === null) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      setDrag(null);

      // The RELEASE position, not the last move's. A fast drag can deliver no move at all between
      // press and release -- the browser is free to coalesce them -- and using `drag.to` there
      // would measure a zero-sized shape and refuse a drag the user plainly made. Legacy reads the
      // release position too (`single_view_mouse_handler.py:470`).
      const box = boxOf();
      const to = box === null ? drag.to : locate(event, box, image).point;

      const outcome = kind === "box" ? boxFrom(drag.from, to) : circleFrom(drag.from, to);

      if (outcome.kind === "ignored") {
        onRefused?.(outcome.reason);
        return;
      }

      if (event.shiftKey) onErase?.(outcome.vertices);
      else onComplete(outcome.vertices);
    },
    [boxOf, drag, image, kind, onComplete, onErase, onRefused],
  );

  // A drag made on this half of the Multi tab while the other was being edited, finished here as
  // legacy's release in that viewer finishes it (main_window.py:5731-5916; `split/pairPress.ts`).
  const handed = useContext(PairPressContext);
  useEffect(() => {
    if (handed === null || handed.tool !== kind || !claim(handed)) return;
    const outcome = kind === "box" ? boxFrom(handed.from, handed.to) : circleFrom(handed.from, handed.to);
    if (outcome.kind === "ignored") onRefused?.(outcome.reason);
    else if (handed.shift) onErase?.(outcome.vertices);
    else onComplete(outcome.vertices);
    // Only when a press arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handed]);

  // Legacy's C clears whatever is being drawn in any tool, a box or circle drag included
  // (keyboard_event_manager.py:241-313); here it was the AI tool's alone (`CONTROL_PARITY.md` CP-20).
  useHotkey("clear_points", () => setDrag(null));

  // Escape abandons a drag in progress. Bound on the document because the pointer is captured and
  // the keyboard focus is wherever it was.
  useEffect(() => {
    if (drag === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrag(null);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drag]);

  // Legacy's rubber band, for a box and a circle alike and whatever the class: red, Qt's DashLine on
  // a pen `line_thickness` image pixels wide, and no fill (single_view_mouse_handler.py:143-166; in
  // the Multi tab main_window.py:5724-5726, 5832-5834). It was the class colour, solid, filled at 0.25.
  const line = legacyLineThickness(sizing);
  const band = { fill: "none", stroke: RUBBER_BAND, strokeWidth: line, ...qtDashLine(line) } as const;

  return (
    <svg
      ref={surfaceRef}
      className="polygon-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label={kind === "box" ? "Box tool" : "Circle tool"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {drag !== null && kind === "box" && (
        <rect
          data-testid="shape-preview"
          x={Math.min(drag.from.x, drag.to.x)}
          y={Math.min(drag.from.y, drag.to.y)}
          width={Math.abs(drag.to.x - drag.from.x)}
          height={Math.abs(drag.to.y - drag.from.y)}
          {...band}
        />
      )}

      {drag !== null && kind === "circle" && (
        <circle
          data-testid="shape-preview"
          cx={drag.from.x}
          cy={drag.from.y}
          r={radiusOf([drag.from, drag.to])}
          {...band}
        />
      )}
    </svg>
  );
}
