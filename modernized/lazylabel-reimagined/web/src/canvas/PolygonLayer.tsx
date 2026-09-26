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
import { flushSync } from "react-dom";

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
import { isInModal } from "../hotkeys/keyEvent.js";

export interface PolygonLayerProps {
  readonly width: number;
  readonly height: number;
  /** In image pixels, from settings. */
  readonly joinThreshold?: number;
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
  onComplete,
  onErase,
  onRefused,
}: PolygonLayerProps): ReactNode {
  const sizing = useSizing();
  const surfaceRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<PolygonDraft>(EMPTY_DRAFT);
  const [pointer, setPointer] = useState<ImagePoint | null>(null);
  /**
   * Vertices Ctrl+Z took back, newest last, for Ctrl+Y or Ctrl+Shift+Z to put back, as legacy's
   * redo re-adds a polygon point (undo_redo_manager.py:110-111). Emptied by anything that makes
   * them stale: a new vertex, or the draft ending.
   */
  const undone = useRef<ImagePoint[]>([]);

  const image = { width, height };

  const boxOf = useCallback((): DisplayBox | null => {
    const element = surfaceRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  const complete = useCallback(
    (vertices: readonly ImagePoint[], erase: boolean) => {
      undone.current = [];
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
  // Legacy's C clears the polygon's points too, not only the AI tool's
  // (keyboard_event_manager.py:300-304; `CONTROL_PARITY.md` CP-20).
  useHotkey("clear_points", () => {
    undone.current = [];
    setDraft(cancel());
    setPointer(null);
  });


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

      if (outcome.kind === "vertex") {
        undone.current = [];
        setDraft(outcome.draft);
      }
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
    // Listening while a vertex can still be put back, too: undoing the last one empties the draft.
    if (draft.vertices.length === 0 && undone.current.length === 0) return;
    const drawing = draft.vertices.length > 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return; // a Space in a class-name field is a space
      if (isInModal(event.target)) return; // a key in a dialog is the dialog's, not the drawing's

      if (event.key === "Escape" && drawing) {
        event.preventDefault();
        undone.current = [];
        setDraft(cancel());
        setPointer(null);
        return;
      }

      /*
       * ENTER: FINISH, THEN LET THE SAVE HAPPEN -- legacy's "finishes the polygon and then saves".
       *
       * The save half is `save_output`, the dispatcher's. This comment used to say that leaving
       * Enter raw here made the finish happen first. It did not: the dispatcher's listener was
       * registered first and ran first, so the save wrote the annotations WITHOUT the shape, and
       * its return then cleared the shape's "unsaved" -- an empty file on disk under the word
       * "saved". Found in a real browser on 2026-09-23. Two things make the order true now: this
       * listens in the CAPTURE phase, so it runs before the dispatcher's bubbling one, and
       * `flushSync` commits the shape to the store before the save reads it.
       */
      if (event.key === "Enter" && drawing) {
        event.preventDefault();
        const outcome = finish(draft, { shift: event.shiftKey });
        if (outcome.kind === "close") flushSync(() => complete(outcome.vertices, false));
        else if (outcome.kind === "erase") flushSync(() => complete(outcome.vertices, true));
        else if (outcome.kind === "ignored") onRefused?.(outcome.reason);
        return;
      }

      // Undo during drawing steps back one vertex rather than reaching the annotation history,
      // which has nothing about this polygon in it until the polygon exists. STOPPED here: the
      // dispatcher's Undo also hears Ctrl+Z, and without this it took back the previous
      // annotation as well as the vertex.
      //
      // Not with Shift: Ctrl+Shift+Z is REDO, and it removed a vertex too while the check ignored
      // the modifier (`CONTROL_PARITY.md` CP-21). Redo puts back what undo took, and with nothing
      // of this draft's to put back it is left to the app's redo.
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z" && !event.shiftKey && drawing) {
        event.preventDefault();
        event.stopPropagation();
        undone.current = [...undone.current, draft.vertices[draft.vertices.length - 1]!];
        setDraft(undoVertex(draft));
      } else if (modifier && ((key === "z" && event.shiftKey) || key === "y") && undone.current.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const back = undone.current[undone.current.length - 1]!;
        undone.current = undone.current.slice(0, -1);
        setDraft({ vertices: [...draft.vertices, back] });
      }
    };

    // CAPTURE, so these run before the dispatcher's listener, which bubbles (see Enter above).
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [complete, draft, onRefused]);

  const box = boxOf();
  // Legacy draws a polygon in progress in cyan, with blue points and a faint cyan fill of the
  // shape it would close into (polygon_drawing_manager.py:97-157) -- the same for every class, so
  // the shape being drawn never looks like one already made.
  const stroke = "rgb(0, 255, 255)";
  const point = "rgb(0, 0, 255)";

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
      {closing && draft.vertices.length > 2 && (
        <polygon
          points={draft.vertices.map((v) => `${v.x},${v.y}`).join(" ")}
          fill="rgba(0, 255, 255, 0.39)"
          stroke="none"
        />
      )}

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
          fill={index === 0 && closing ? stroke : point}
          stroke="none"
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

