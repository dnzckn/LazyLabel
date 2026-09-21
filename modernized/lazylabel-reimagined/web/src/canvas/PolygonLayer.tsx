/**
 * Drawing a polygon: the clicks, the preview, and the keys.
 *
 * The rules live elsewhere on purpose. `tools/polygon.ts` decides whether a click adds a vertex or
 * closes the shape, `canvas/coordinates.ts` turns a client point into an image point, and
 * `workspace/classes.ts` decides which class the finished polygon takes. What is left here is the
 * part that genuinely needs a browser: where the pointer is, what the user sees while drawing, and
 * which key does what.
 *
 * AN SVG OVERLAY RATHER THAN A SECOND CANVAS. The preview changes on every click and on every
 * mouse move once the close hint is live; redrawing a canvas for that means clearing and repainting
 * the whole thing, while the browser is already good at moving a handful of SVG nodes. It also
 * makes the vertices real elements, which is what lets a test assert where they are instead of
 * reading pixels back.
 *
 * MARKERS ARE SIZED IN SCREEN PIXELS. Drawn in image units they vanish when zoomed out, and the
 * default join threshold is two IMAGE pixels — at a low zoom that is a fraction of one screen
 * pixel, which is why the first vertex is highlighted as the cursor comes into range rather than
 * left for the user to find by overshooting.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { classColor } from "./classColor.js";
import { locate, scale, type DisplayBox, type ImagePoint } from "./coordinates.js";
import {
  EMPTY_DRAFT,
  cancel,
  click as clickTool,
  finish,
  undoVertex,
  wouldClose,
  type PolygonDraft,
} from "../tools/polygon.js";
import { useSizing } from "./useSizing.js";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";

export interface PolygonLayerProps {
  readonly width: number;
  readonly height: number;
  /** In image pixels, from settings. */
  readonly joinThreshold?: number;
  /** The colour the finished polygon will take, so the preview is not a surprise. */
  readonly classId: number;
  /** Called with the vertices when the polygon closes. */
  readonly onComplete: (vertices: readonly ImagePoint[]) => void;
  /** Called when the polygon closes with shift held: erase what it overlaps. */
  readonly onErase?: (vertices: readonly ImagePoint[]) => void;
  /** Called when a finish was refused, with the reason. Legacy says nothing at all here. */
  readonly onRefused?: (reason: string) => void;
}

const VERTEX_RADIUS = 4;
const CLOSE_HINT_RADIUS = 8;

export function PolygonLayer({
  width,
  height,
  joinThreshold,
  classId,
  onComplete,
  onErase,
  onRefused,
}: PolygonLayerProps): ReactNode {
  const sizing = useSizing();
  const surfaceRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<PolygonDraft>(EMPTY_DRAFT);
  const [pointer, setPointer] = useState<ImagePoint | null>(null);

  const image = { width, height };

  const boxOf = useCallback((): DisplayBox | null => {
    const element = surfaceRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  const complete = useCallback(
    (vertices: readonly ImagePoint[], erase: boolean) => {
      setDraft(cancel());
      setPointer(null);
      if (erase) onErase?.(vertices);
      else onComplete(vertices);
    },
    [onComplete, onErase],
  );

  /*
   * FINISHING THE SHAPE, through the dispatcher rather than a raw Space listener.
   *
   * It worked before as a raw handler -- but the hotkey reference reads the dispatcher's own
   * registrations to say which keys do anything, so an action handled outside it read as "not yet"
   * while working. That is the same dishonesty as promising a key that does nothing, reached from
   * the other side, and it made the one guard that cannot drift drift.
   *
   * The BINDING decides which of the two this is, not `event.shiftKey`: `save_segment` is Space
   * and `erase_segment` is Shift+Space, and a user who remaps either gets what they asked for.
   * Reading the modifier here would quietly ignore half of any remapping.
   */
  const finishWith = useCallback(
    (erase: boolean) => {
      // Guarded on there being a draft, because these keys are registered whenever this layer is
      // mounted and the layer outlives any one shape.
      setDraft((current) => {
        if (current.vertices.length === 0) return current;
        const outcome = finish(current, { shift: erase });
        if (outcome.kind === "close") complete(outcome.vertices, false);
        else if (outcome.kind === "erase") complete(outcome.vertices, true);
        else if (outcome.kind === "ignored") onRefused?.(outcome.reason);
        return current;
      });
    },
    [complete, onRefused],
  );

  useHotkey("save_segment", () => finishWith(false));
  useHotkey("erase_segment", () => finishWith(true));


  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      // Only the primary button draws. A right-click is a context menu and a middle-click is a
      // paste on some platforms; treating either as a vertex puts points where nobody clicked.
      if (event.button !== 0) return;

      const box = boxOf();
      if (box === null) return;

      const located = locate(event, box, image);
      // Outside the image is ignored rather than clamped onto an edge the user did not click.
      if (located.kind === "outside") return;

      const outcome = clickTool(draft, located.point, {
        ...(joinThreshold === undefined ? {} : { joinThreshold }),
        shift: event.shiftKey,
      });

      if (outcome.kind === "vertex") setDraft(outcome.draft);
      else if (outcome.kind === "close") complete(outcome.vertices, false);
      else if (outcome.kind === "erase") complete(outcome.vertices, true);
    },
    [boxOf, complete, draft, image, joinThreshold],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (draft.vertices.length === 0) return; // nothing to hint about
      const box = boxOf();
      if (box === null) return;
      setPointer(locate(event, box, image).point);
    },
    [boxOf, draft.vertices.length, image],
  );

  // Keys are bound on the document rather than the SVG: the surface would have to be focused to
  // receive them, and nothing about clicking on an image says "now press Space here".
  useEffect(() => {
    if (draft.vertices.length === 0) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return; // a Space in a class-name field is a space

      if (event.key === "Escape") {
        event.preventDefault();
        setDraft(cancel());
        setPointer(null);
        return;
      }

      /*
       * ENTER STAYS HERE, where Space has moved to the dispatcher.
       *
       * Legacy's Enter "finishes the polygon and then saves", and the save half is
       * `save_output`, registered by the opened image. Registering Enter here as well would put
       * two handlers on one action with no guaranteed order between them -- and if the write ran
       * first it would save without the shape the same keystroke was finishing. Left raw, the
       * finish happens here and the write happens on its own, exactly as before.
       */
      if (event.key === "Enter") {
        event.preventDefault();
        const outcome = finish(draft, { shift: event.shiftKey });
        if (outcome.kind === "close") complete(outcome.vertices, false);
        else if (outcome.kind === "erase") complete(outcome.vertices, true);
        else if (outcome.kind === "ignored") onRefused?.(outcome.reason);
        return;
      }

      // Undo during drawing steps back one vertex rather than reaching the annotation history,
      // which has nothing about this polygon in it until the polygon exists.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setDraft((current) => undoVertex(current));
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [complete, draft, onRefused]);

  const box = boxOf();
  const colour = classColor(classId);
  const stroke = `rgb(${colour.r}, ${colour.g}, ${colour.b})`;

  // In image units, because the SVG's viewBox is the image: one screen pixel is this many of them.
  // Read during render from a ref, so the first paint uses 1:1 and corrects on the next render --
  // which the first vertex causes. Markers being a little off before anything is drawn is not
  // worth a resize observer; clicks do not use this, they take a fresh rect at event time.
  const perPixel = box === null ? { x: 1, y: 1 } : scale(box, image);
  const closing =
    pointer !== null && wouldClose(draft, pointer, joinThreshold);

  return (
    <svg
      ref={surfaceRef}
      className="polygon-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="Polygon tool"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      {draft.vertices.length > 1 && (
        <polyline
          points={draft.vertices.map((v) => `${v.x},${v.y}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={Math.max(perPixel.x, perPixel.y) * sizing.line}
        />
      )}

      {/* The segment that would close the shape, shown only when it actually would. */}
      {closing && draft.vertices.length > 2 && (
        <line
          x1={draft.vertices.at(-1)!.x}
          y1={draft.vertices.at(-1)!.y}
          x2={draft.vertices[0]!.x}
          y2={draft.vertices[0]!.y}
          stroke={stroke}
          strokeWidth={Math.max(perPixel.x, perPixel.y) * sizing.line}
          strokeDasharray={`${perPixel.x * 4} ${perPixel.x * 4}`}
        />
      )}

      {draft.vertices.map((vertex, index) => (
        <ellipse
          key={index}
          data-testid={`vertex-${index}`}
          cx={vertex.x}
          cy={vertex.y}
          rx={(index === 0 && closing ? CLOSE_HINT_RADIUS : VERTEX_RADIUS) * perPixel.x * sizing.point}
          ry={(index === 0 && closing ? CLOSE_HINT_RADIUS : VERTEX_RADIUS) * perPixel.y * sizing.point}
          fill={index === 0 && closing ? stroke : "none"}
          stroke={stroke}
          strokeWidth={Math.max(perPixel.x, perPixel.y) * sizing.line}
        />
      ))}
    </svg>
  );
}

/**
 * Whether a key event came from somewhere the user is typing.
 *
 * The same rule the hotkey dispatcher applies: a Space in a class-name field is a space, not a
 * command to finish a polygon. Duplicated here rather than imported because the hotkey provider's
 * copy is about bound actions, and this layer listens directly.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** The draft's vertices as the wire format stores them: pairs, not objects. */
export function toWireVertices(
  vertices: readonly ImagePoint[],
): readonly (readonly [number, number])[] {
  return vertices.map((v) => [v.x, v.y] as const);
}

