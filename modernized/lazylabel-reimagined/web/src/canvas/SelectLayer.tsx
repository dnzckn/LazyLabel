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
 *
 * NOTHING IS DRAWN HERE. The canvas underneath shows the selection as legacy does: one yellow copy
 * of each selected shape at alpha 180, with no outline (segment_display_manager.py:515-541). Until
 * 2026-09-27 this layer drew a second yellow fill and a thick yellow outline over it.
 */

import { useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

import type { WireSegment } from "@lazylabel/contracts";

import { locate, type DisplayBox } from "./coordinates.js";
import { hitTest } from "../tools/selection.js";
import { claim, PairPressContext } from "../split/pairPress.js";

export interface SelectLayerProps {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly WireSegment[];
  readonly onToggle: (index: number) => void;
  /** Called when a click landed on no annotation, so a caller can say so. */
  readonly onMiss?: () => void;
}

export function SelectLayer({
  width,
  height,
  segments,
  onToggle,
  onMiss,
}: SelectLayerProps): ReactNode {
  const surfaceRef = useRef<SVGSVGElement>(null);
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

      const index = hitTest(segments, located.point, image);
      if (index === null) onMiss?.();
      else onToggle(index);
    },
    [boxOf, image, onMiss, onToggle, segments],
  );

  // A press on this half of the Multi tab while the other was being edited selects here too, as
  // legacy's press in that viewer does, the other viewer following while linked
  // (main_window.py:5533-5535, 2355-2429; `split/pairPress.ts`).
  const handed = useContext(PairPressContext);
  useEffect(() => {
    if (handed === null || handed.tool !== "select" || !claim(handed)) return;
    const index = hitTest(segments, handed.from, image);
    if (index === null) onMiss?.();
    else onToggle(index);
    // Only when a press arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handed]);

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
    />
  );
}
