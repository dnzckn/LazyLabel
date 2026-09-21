/**
 * Dragging the zoomed image around — legacy's hand mode, Q.
 *
 * The last of the six zoom-and-pan keys, and the counterpart to the four `pan_*` ones: they move
 * by a step, this moves by however far the hand goes.
 *
 * IT SCROLLS THE PANE, like the keys do, rather than transforming the canvas. The pane already
 * scrolls once an image is larger than it, so this moves the thing that moves — a transform would
 * be a second way to position the image, and the two would disagree the moment a user touched the
 * scrollbar.
 *
 * NOTHING IS COMMITTED AND NOTHING CAN BE LOST HERE, which is why this layer has no Escape and no
 * refusal: the worst a mistaken drag does is move the view, and the fix for that is another drag.
 */

import { useCallback, useRef, type ReactNode } from "react";

export interface PanLayerProps {
  readonly width: number;
  readonly height: number;
  /** The scrolling pane this drag moves. */
  readonly pane: React.RefObject<HTMLDivElement | null>;
  /** `pan_multiplier`, the same factor the arrow keys use. */
  readonly multiplier?: number;
}

export function PanLayer({ width, height, pane, multiplier = 1 }: PanLayerProps): ReactNode {
  const from = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    // Captured, as every drag here is: a pan that reaches the edge of the pane keeps going, and
    // without capture the release outside it never arrives.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    from.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const start = from.current;
      if (start === null) return;
      // OPPOSITE the pointer: dragging the image right moves the view left, which is what "grab
      // the picture and move it" means. Scrolling the same way as the drag would feel like
      // dragging a scrollbar, and this is not one.
      pane.current?.scrollBy({
        left: (start.x - event.clientX) * multiplier,
        top: (start.y - event.clientY) * multiplier,
        behavior: "auto",
      });
      from.current = { x: event.clientX, y: event.clientY };
    },
    [multiplier, pane],
  );

  const onPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    from.current = null;
  }, []);

  return (
    <svg
      className="polygon-layer pan-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="Pan tool"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
