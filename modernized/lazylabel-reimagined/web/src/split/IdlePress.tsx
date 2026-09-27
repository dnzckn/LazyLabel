/**
 * The half not being edited, taking a press the way legacy's non-active viewer does: the press is
 * the tool's, and it makes that image the one edited (main_window.py:5498-5537).
 *
 * The polygon's press is handed over at once, as legacy places the vertex on the press. The AI
 * tool, the box and the circle are drags, so this half follows the drag, with legacy's rubber band,
 * and hands it over at the release, where legacy settles each (main_window.py:5539-5583). The view
 * then drawn in this half finishes it (`pairPress.ts`).
 */

import { useCallback, useRef, useState, type ReactNode } from "react";

import { buttonOf } from "../canvas/AiLayer.jsx";
import { classColor } from "../canvas/classColor.js";
import { locate, scale, type DisplayBox, type ImagePoint } from "../canvas/coordinates.js";
import { useSizing } from "../canvas/useSizing.js";
import { DRAG_THRESHOLD } from "../tools/ai.js";
import { radiusOf } from "../tools/shapes.js";
import type { HandedPress, PressTool } from "./pairPress.js";

interface Drag {
  readonly from: ImagePoint;
  readonly to: ImagePoint;
  readonly negative: boolean;
}

export function IdlePress({
  tool,
  name,
  width,
  height,
  classId,
  onPress,
}: {
  readonly tool: PressTool;
  /** The image's name, for the surface's label. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** The class a new annotation takes, whose colour the rubber band is drawn in. */
  readonly classId: number;
  readonly onPress: (press: HandedPress) => void;
}): ReactNode {
  const sizing = useSizing();
  const surface = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const image = { width, height };

  const boxOf = useCallback((): DisplayBox | null => {
    const rect = surface.current?.getBoundingClientRect();
    return rect === undefined ? null : { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    // The AI tool's right button is a negative point, as in the view; the others draw with the left.
    const button = tool === "ai" ? buttonOf(event) : event.button === 0 ? "left" : null;
    const box = boxOf();
    if (button === null || box === null) return;
    const located = locate(event, box, image);
    // Legacy's press off the picture does nothing, not even choosing the viewer (main_window.py:5505-5509).
    if (located.kind === "outside") return;

    if (tool === "polygon") {
      onPress({ tool, from: located.point, to: located.point, negative: false, shift: event.shiftKey });
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ from: located.point, to: located.point, negative: button === "right" });
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = boxOf();
    if (drag === null || box === null) return;
    setDrag({ ...drag, to: locate(event, box, image).point });
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const box = boxOf();
    // The release's own position, as the view's layers read it.
    const to = box === null ? drag.to : locate(event, box, image).point;
    setDrag(null);
    onPress({ tool, from: drag.from, to, negative: drag.negative, shift: event.shiftKey });
  };

  const box = boxOf();
  const perPixel = box === null ? { x: 1, y: 1 } : scale(box, image);
  const { r, g, b } = classColor(classId);
  const stroke = `rgb(${r}, ${g}, ${b})`;
  const strokeWidth = Math.max(perPixel.x, perPixel.y) * sizing.line;
  const moved = drag === null ? 0 : Math.hypot(drag.to.x - drag.from.x, drag.to.y - drag.from.y);

  return (
    <svg
      ref={surface}
      className="polygon-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label={`Draw on ${name}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // A right press is a negative point, so the browser's menu must not open over the picture.
      onContextMenu={(event) => event.preventDefault()}
    >
      {drag !== null && tool === "circle" && (
        <circle
          cx={drag.from.x}
          cy={drag.from.y}
          r={radiusOf([drag.from, drag.to])}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {/* The AI tool's band only once the pointer is past the drag threshold, as the view's. */}
      {drag !== null && (tool === "box" || (tool === "ai" && moved > DRAG_THRESHOLD)) && (
        <rect
          data-testid="press-band"
          x={Math.min(drag.from.x, drag.to.x)}
          y={Math.min(drag.from.y, drag.to.y)}
          width={Math.abs(drag.to.x - drag.from.x)}
          height={Math.abs(drag.to.y - drag.from.y)}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={`${perPixel.x * 3} ${perPixel.x * 3}`}
        />
      )}
    </svg>
  );
}
