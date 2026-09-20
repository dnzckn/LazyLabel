/**
 * Dragging a shape's vertices.
 *
 * The rules are in `tools/edit.ts`: which shapes have handles, how many, and what moving one means
 * for a circle as against a polygon. What is here is the drag, and one decision that is not
 * obvious.
 *
 * THE MOVE IS RECORDED ONCE, AT RELEASE — not on every pointermove. A drag delivers dozens of
 * events, and recording each would fill the undo stack with a frame-by-frame replay of one
 * gesture: a user pressing undo would watch the vertex crawl back rather than jump to where it
 * was. The shape still follows the cursor while dragging, because the preview is the point; it is
 * the HISTORY entry that is one per gesture.
 *
 * Handles are sized in screen pixels for the same reason the polygon's are: in image units they
 * vanish when zoomed out, and a handle too small to hit is a handle that does not exist.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { WireSegment } from "@lazylabel/contracts";

import { classColor } from "./classColor.js";
import { locate, scale, type DisplayBox, type ImagePoint } from "./coordinates.js";
import { handlesFor, moveVertex } from "../tools/edit.js";
import { useSizing } from "./useSizing.js";

export interface EditLayerProps {
  readonly width: number;
  readonly height: number;
  /** The segment being edited, and where it sits in the list. */
  readonly index: number;
  readonly segment: WireSegment;
  /** Called once per completed drag, with the segment as it now stands. */
  readonly onChange: (index: number, segment: WireSegment) => void;
  /** Called when the shape has no handles to show, with legacy's reason. */
  readonly onNoHandles?: (reason: string) => void;
}

const HANDLE_RADIUS = 5;

export function EditLayer({
  width,
  height,
  index,
  segment,
  onChange,
  onNoHandles,
}: EditLayerProps): ReactNode {
  const sizing = useSizing();
  const surfaceRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  /** The shape as it looks mid-drag. Null when no drag is in progress. */
  const [preview, setPreview] = useState<WireSegment | null>(null);

  const image = { width, height };
  const shown = preview ?? segment;
  const outcome = handlesFor(shown);

  // Reported through a callback rather than rendered here, so the message appears wherever the
  // app puts its notifications instead of as text floating over the image.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (outcome.kind === "none" && reported.current !== outcome.reason) {
      reported.current = outcome.reason;
      onNoHandles?.(outcome.reason);
    }
    if (outcome.kind === "handles") reported.current = null;
  }, [onNoHandles, outcome]);

  const boxOf = useCallback((): DisplayBox | null => {
    const element = surfaceRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGEllipseElement>, handle: number) => {
      if (event.button !== 0) return;
      event.stopPropagation(); // the canvas underneath must not also act on this
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(handle);
      setPreview(segment);
    },
    [segment],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (dragging === null) return;
      const box = boxOf();
      if (box === null) return;

      // Moved from the ORIGINAL segment each time, not from the preview. Applying each move to the
      // previous preview would compound a circle's centre translation -- every event would shift
      // it again by the full offset from its start.
      setPreview(moveVertex(segment, dragging, locate(event, box, image).point));
    },
    [boxOf, dragging, image, segment],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (dragging === null) return;
      const box = boxOf();
      const settled =
        box === null ? preview : moveVertex(segment, dragging, locate(event, box, image).point);

      setDragging(null);
      setPreview(null);

      // One history entry for the whole gesture. The store ignores a no-op, so a click on a handle
      // that does not move it records nothing.
      if (settled !== null) onChange(index, settled);
    },
    [boxOf, dragging, image, index, onChange, preview, segment],
  );

  // Escape abandons the drag and puts the shape back where it was.
  useEffect(() => {
    if (dragging === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDragging(null);
      setPreview(null);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dragging]);

  const box = boxOf();
  const colour = classColor(segment.classId);
  const stroke = `rgb(${colour.r}, ${colour.g}, ${colour.b})`;
  const perPixel = box === null ? { x: 1, y: 1 } : scale(box, image);

  return (
    <svg
      ref={surfaceRef}
      className="polygon-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="Edit tool"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {outcome.kind === "handles" &&
        outcome.vertices.map((vertex: ImagePoint, handle: number) => (
          <ellipse
            key={handle}
            data-testid={`handle-${handle}`}
            cx={vertex.x}
            cy={vertex.y}
            rx={HANDLE_RADIUS * perPixel.x * sizing.point}
            ry={HANDLE_RADIUS * perPixel.y * sizing.point}
            fill={dragging === handle ? stroke : "none"}
            stroke={stroke}
            strokeWidth={Math.max(perPixel.x, perPixel.y) * sizing.line}
            onPointerDown={(event) => onPointerDown(event, handle)}
            style={{ cursor: "grab" }}
          />
        ))}
    </svg>
  );
}
