/**
 * Clicking the image to select an annotation.
 *
 * The rule is in `tools/selection.ts`: hit-testing goes through the rasterizer so the shape you can
 * click is the shape that gets saved, and the topmost one wins where several overlap.
 *
 * A CLICK ON EMPTY SPACE DOES NOT CLEAR THE SELECTION. That is legacy's behaviour and the right
 * one here: selection toggles, so building a multi-shape selection means several clicks, and a
 * near-miss between two of them would otherwise throw the work away. Clearing is an explicit
 * button, which is also the only thing that can be undone by pressing it again.
 */

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type { WireSegment } from "@lazylabel/contracts";

import { classColor } from "./classColor.js";
import { locate, scale, type DisplayBox } from "./coordinates.js";
import { hitTest } from "../tools/selection.js";
import { useSizing } from "./useSizing.js";

export interface SelectLayerProps {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly WireSegment[];
  readonly selected: readonly number[];
  readonly onToggle: (index: number) => void;
  /** Called when a click landed on no annotation, so a caller can say so. */
  readonly onMiss?: () => void;
}

export function SelectLayer({
  width,
  height,
  segments,
  selected,
  onToggle,
  onMiss,
}: SelectLayerProps): ReactNode {
  const sizing = useSizing();
  const surfaceRef = useRef<SVGSVGElement>(null);
  const image = { width, height };

  const boxOf = useCallback((): DisplayBox | null => {
    const element = surfaceRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  // Measured after mount and on resize, as the edit layer's handles are: measuring only during
  // render read nothing on the first one, so a selection already made when this tool was chosen
  // was outlined at image-unit width until the next click (see `EditLayer.tsx`).
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

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      const box = boxOf();
      if (box === null) return;

      const located = locate(event, box, image);
      if (located.kind === "outside") return;

      const index = hitTest(segments, located.point, image);
      if (index === null) onMiss?.();
      else onToggle(index);
    },
    [boxOf, image, onMiss, onToggle, segments],
  );

  const box = measured ?? boxOf();
  const perPixel = box === null ? { x: 1, y: 1 } : scale(box, image);

  return (
    <svg
      ref={surfaceRef}
      className="polygon-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="Selection tool"
      onPointerDown={onPointerDown}
      style={{ cursor: "pointer" }}
    >
      {/* Only the SELECTED shapes are outlined. Outlining everything would repeat what the canvas
          underneath already draws, and hide the one thing this layer exists to show. */}
      {selected.map((index) => {
        const segment = segments[index];
        if (segment?.vertices === undefined || segment.vertices.length === 0) return null;
        const { r, g, b } = classColor(segment.classId);

        return (
          <polygon
            key={index}
            data-testid={`outline-${index}`}
            points={segment.vertices.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={`rgb(${r}, ${g}, ${b})`}
            strokeWidth={Math.max(perPixel.x, perPixel.y) * 2 * sizing.line}
            strokeDasharray={`${perPixel.x * 5} ${perPixel.x * 3}`}
          />
        );
      })}
    </svg>
  );
}
