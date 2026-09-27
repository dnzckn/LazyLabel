/**
 * Dragging a crop on the image — RULE-018, the half of it that was never reachable.
 *
 * `cropFromDrag` was written, tested and called by nothing: the crop panel takes two typed ranges
 * and that was the only way in. Typing `120:880` is a fine way to repeat a crop you already know
 * and a poor way to FIND one, which is what a user is doing the first time — and legacy lets you
 * drag it.
 *
 * WHAT A CROP IS MATTERS HERE, because it is not an annotation. RULE-018 blanks every mask pixel
 * outside it on SAVE, so this rectangle decides what reaches the file. That is why the preview is
 * drawn as a dimmed surround rather than an outlined box: an outline says "here is a thing I
 * added", and a dimmed surround says "everything out here is going away", which is what actually
 * happens.
 *
 * Nothing is committed until release, and a drag too small is refused with its size rather than
 * silently ignored — legacy discards it without a word, and a user who has just dragged something
 * is owed an answer.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { locate, type DisplayBox, type ImagePoint } from "./coordinates.js";
import { cropFromDrag, type Crop } from "../tools/crop.js";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";

export interface CropLayerProps {
  readonly width: number;
  readonly height: number;
  /** The crop in force, drawn so a user can see what they are about to replace. */
  readonly crop: Crop | null;
  readonly onCrop: (crop: Crop) => void;
  /** A drag too small to be a crop. */
  readonly onRefused?: (reason: string) => void;
  /**
   * False in the Multi tab: legacy's Multi press has no crop mode (main_window.py:5515-5537), so
   * no drag starts there. The crop in force is still drawn.
   */
  readonly drags?: boolean;
}

interface Drag {
  readonly from: ImagePoint;
  readonly to: ImagePoint;
}

export function CropLayer({ width, height, crop, onCrop, onRefused, drags = true }: CropLayerProps): ReactNode {
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
      if (!drags || event.button !== 0) return;
      const box = boxOf();
      if (box === null) return;

      const located = locate(event, box, image);
      if (located.kind === "outside") return;

      // Captured, as the shape tools do: cropping to the edge of an image means dragging past it,
      // and without capture that release is never delivered.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDrag({ from: located.point, to: located.point });
    },
    [boxOf, drags, image],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (drag === null) return;
      const box = boxOf();
      if (box === null) return;
      setDrag({ from: drag.from, to: locate(event, box, image).point });
    },
    [boxOf, drag, image],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (drag === null) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      setDrag(null);

      // The RELEASE position rather than the last move's: a fast drag can deliver no move at all
      // between press and release, and measuring `drag.to` there would refuse a drag plainly made.
      const box = boxOf();
      const to = box === null ? drag.to : locate(event, box, image).point;

      const outcome = cropFromDrag(drag.from, to, image);
      if (outcome.kind === "ignored") onRefused?.(outcome.reason);
      else onCrop(outcome.crop);
    },
    [boxOf, drag, image, onCrop, onRefused],
  );

  // Legacy's C clears a crop drag in progress too (keyboard_event_manager.py:280-289).
  useHotkey("clear_points", () => setDrag(null));

  // Escape abandons a drag in progress, on the document because the pointer is captured.
  useEffect(() => {
    if (drag === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDrag(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drag]);

  // What the surround is drawn around: the drag while there is one, else the crop in force.
  const region =
    drag !== null
      ? {
          x1: Math.min(drag.from.x, drag.to.x),
          y1: Math.min(drag.from.y, drag.to.y),
          x2: Math.max(drag.from.x, drag.to.x),
          y2: Math.max(drag.from.y, drag.to.y),
        }
      : crop;

  return (
    <svg
      ref={surfaceRef}
      // Over the annotations, at the depth of legacy's dimmed crop at Z 25 (crop_manager.py:196-222;
      // `styles.css`, "THE STACK'S DEPTHS").
      className="polygon-layer crop-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="Crop tool"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {region !== null && (
        // The SURROUND, as four rectangles, rather than an outline around the kept part. A crop
        // removes what is outside it, and showing the removal is showing what the save will do.
        <g data-testid="crop-surround" className="crop-layer__surround">
          <rect x={0} y={0} width={width} height={region.y1} />
          <rect x={0} y={region.y2} width={width} height={Math.max(0, height - region.y2)} />
          <rect x={0} y={region.y1} width={region.x1} height={Math.max(0, region.y2 - region.y1)} />
          <rect
            x={region.x2}
            y={region.y1}
            width={Math.max(0, width - region.x2)}
            height={Math.max(0, region.y2 - region.y1)}
          />
        </g>
      )}
    </svg>
  );
}
