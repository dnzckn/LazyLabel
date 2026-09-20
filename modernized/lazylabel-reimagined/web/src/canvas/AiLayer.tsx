/**
 * The AI tool's surface: points, a box, and the preview waiting to be accepted.
 *
 * The decisions are in `tools/ai.ts` — what a press-and-release means, which preview Space takes,
 * what undo removes. The network is the parent's. What is here is the pointer, the keys, and
 * showing the user what they have asked for.
 *
 * THE PREVIEW IS SHOWN WITHOUT BEING COMMITTED. That is the whole shape of the interaction: SAM
 * answers in a fraction of a second, the user looks, adds a correcting point, and only then
 * presses Space. A tool that committed on every click would fill the image with rejected masks.
 *
 * A RIGHT CLICK IS A NEGATIVE POINT, so the context menu is suppressed here — otherwise the
 * browser's menu opens over the preview the user is trying to correct.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { classColor } from "./classColor.js";
import { locate, scale, type DisplayBox, type ImagePoint } from "./coordinates.js";
import {
  EMPTY_PROMPT,
  NOTHING_TO_ACCEPT,
  clear,
  pending,
  release,
  undoLast,
  type AiPrompt,
} from "../tools/ai.js";
import { useSizing } from "./useSizing.js";

export interface AiLayerProps {
  readonly width: number;
  readonly height: number;
  readonly classId: number;
  /** The prompt changed and is worth predicting. The parent calls the service. */
  readonly onPrompt: (prompt: AiPrompt) => void;
  /** Space: take the pending prediction. `erase` is true when shift was held. */
  readonly onAccept: (erase: boolean) => void;
  /** A gesture produced nothing, with the reason. Legacy is silent for most of these. */
  readonly onRefused?: (reason: string) => void;
  /** Drawn under the prompt marks, when the parent has a prediction to show. */
  readonly preview?: ReactNode;
}

const POINT_RADIUS = 4;

export function AiLayer({
  width,
  height,
  classId,
  onPrompt,
  onAccept,
  onRefused,
  preview,
}: AiLayerProps): ReactNode {
  const sizing = useSizing();
  const surfaceRef = useRef<SVGSVGElement>(null);
  const [prompt, setPrompt] = useState<AiPrompt>(EMPTY_PROMPT);
  const [from, setFrom] = useState<ImagePoint | null>(null);
  const [to, setTo] = useState<ImagePoint | null>(null);

  const image = { width, height };

  const boxOf = useCallback((): DisplayBox | null => {
    const element = surfaceRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      // Left for positive, right for negative. Anything else is not a prompt.
      if (event.button !== 0 && event.button !== 2) return;
      const box = boxOf();
      if (box === null) return;

      const located = locate(event, box, image);
      if (located.kind === "outside") return;

      event.currentTarget.setPointerCapture?.(event.pointerId);
      setFrom(located.point);
      setTo(located.point);
    },
    [boxOf, image],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (from === null) return;
      const box = boxOf();
      if (box === null) return;
      setTo(locate(event, box, image).point);
    },
    [boxOf, from, image],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (from === null) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      const box = boxOf();
      const end = box === null ? (to ?? from) : locate(event, box, image).point;
      setFrom(null);
      setTo(null);

      const outcome = release(prompt, from, end, { negative: event.button === 2 });

      if (outcome.kind === "ignored") {
        onRefused?.(outcome.reason);
        return;
      }

      setPrompt(outcome.prompt);
      onPrompt(outcome.prompt);
    },
    [boxOf, from, image, onPrompt, onRefused, prompt, to],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setPrompt(clear());
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        if (pending(prompt) === "nothing") {
          onRefused?.(NOTHING_TO_ACCEPT);
          return;
        }
        onAccept(event.shiftKey);
        setPrompt(clear());
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        // Takes back the last thing PLACED, which is the box when there is one -- the same
        // precedence Space uses, so undo removes what Space would have accepted.
        event.preventDefault();
        const back = undoLast(prompt);
        setPrompt(back);
        if (pending(back) !== "nothing") onPrompt(back);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onAccept, onPrompt, onRefused, prompt]);

  const box = boxOf();
  const perPixel = box === null ? { x: 1, y: 1 } : scale(box, image);
  const { r, g, b } = classColor(classId);
  const dragging = from !== null && to !== null;

  return (
    <svg
      ref={surfaceRef}
      className="polygon-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="AI tool"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // A right click is a negative point, so the browser's menu must not open over the preview
      // the user is correcting.
      onContextMenu={(event) => event.preventDefault()}
    >
      {preview}

      {prompt.box !== null && (
        <rect
          data-testid="ai-box"
          x={Math.min(prompt.box[0].x, prompt.box[1].x)}
          y={Math.min(prompt.box[0].y, prompt.box[1].y)}
          width={Math.abs(prompt.box[1].x - prompt.box[0].x)}
          height={Math.abs(prompt.box[1].y - prompt.box[0].y)}
          fill="none"
          stroke={`rgb(${r}, ${g}, ${b})`}
          strokeWidth={Math.max(perPixel.x, perPixel.y) * sizing.line}
        />
      )}

      {dragging && (
        <rect
          data-testid="ai-drag"
          x={Math.min(from.x, to.x)}
          y={Math.min(from.y, to.y)}
          width={Math.abs(to.x - from.x)}
          height={Math.abs(to.y - from.y)}
          fill="none"
          stroke={`rgb(${r}, ${g}, ${b})`}
          strokeDasharray={`${perPixel.x * 3} ${perPixel.x * 3}`}
          strokeWidth={Math.max(perPixel.x, perPixel.y) * sizing.line}
        />
      )}

      {prompt.points.map((point, index) => (
        <ellipse
          key={index}
          data-testid={point.positive ? `ai-positive-${index}` : `ai-negative-${index}`}
          cx={point.x}
          cy={point.y}
          rx={POINT_RADIUS * perPixel.x * sizing.point}
          ry={POINT_RADIUS * perPixel.y * sizing.point}
          // Green for include, red for exclude: the two mean opposite things, and a shape or size
          // difference alone is a distinction nobody reads at a glance.
          fill={point.positive ? "rgb(60, 200, 90)" : "rgb(230, 70, 70)"}
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={Math.max(perPixel.x, perPixel.y) * sizing.line}
        />
      ))}
    </svg>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
