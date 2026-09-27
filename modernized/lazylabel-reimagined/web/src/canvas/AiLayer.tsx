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
 * THE RIGHT BUTTON IS A NEGATIVE POINT, so the context menu is suppressed here — otherwise the
 * browser's menu opens over the preview the user is trying to correct. In legacy's single view (and
 * its Sequence tab) the point goes down on the PRESS, and a right drag is nothing more; in its Multi
 * tab a right press waits for its release like a left one, and a right drag is a box
 * (`tools/ai.ts`). Which of the two this is, the split view says (`viewKind.ts`). On a Mac a
 * Control-click is the right button, because Qt makes it one there (`platform.ts`).
 */

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { classColor } from "./classColor.js";
import { locate, scale, type DisplayBox, type ImagePoint } from "./coordinates.js";
import {
  DRAG_THRESHOLD,
  EMPTY_PROMPT,
  NOTHING_TO_ACCEPT,
  clear,
  pending,
  press,
  release,
  undoLast,
  type AiButton,
  type AiPrompt,
  type Release,
} from "../tools/ai.js";
import { useSizing } from "./useSizing.js";
import type { Sizing } from "./sizing.js";
import { ViewKindContext } from "./viewKind.js";
import { PairAiContext } from "../split/pairAi.js";
import { claim, type HandedPress } from "../split/pairPress.js";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";
import { isInModal } from "../hotkeys/keyEvent.js";
import { isApplePlatform } from "../platform.js";

export interface AiLayerProps {
  readonly width: number;
  readonly height: number;
  readonly classId: number;
  /** The prompt changed and is worth predicting. The parent calls the service. */
  readonly onPrompt: (prompt: AiPrompt) => void;
  /** Space: take the pending prediction. `erase` is true when shift was held. */
  readonly onAccept: (erase: boolean) => void;
  /**
   * A gesture produced nothing to predict, with the reason: nothing at all, or a negative point
   * with no positive one to segment from. Legacy is silent for most of these.
   */
  readonly onRefused?: (reason: string) => void;
  /**
   * Escape or the clear key took the prompt away: the parent drops the preview with it, as legacy's
   * Escape removes the preview mask with the points (keyboard_event_manager.py:306-313, 315-319).
   */
  readonly onClear?: () => void;
  /** Drawn under the prompt marks, when the parent has a prediction to show. */
  readonly preview?: ReactNode;
  /**
   * A press made on this half of the Multi tab while the other was being edited, settled here as
   * if made here once it is given (`split/pairPress.ts`). The parent gives it when it can be asked.
   */
  readonly handed?: HandedPress;
}

const POINT_RADIUS = 4;

export function AiLayer({
  width,
  height,
  classId,
  onPrompt,
  onAccept,
  onRefused,
  onClear,
  preview,
  handed,
}: AiLayerProps): ReactNode {
  const sizing = useSizing();
  const view = useContext(ViewKindContext);
  const surfaceRef = useRef<SVGSVGElement>(null);
  /*
   * A LINKED PAIR'S PROMPT IS THE PAIR'S. In the Multi tab, linked, every point and box placed here
   * is placed in the other image too, at the same pixel (main_window.py:6645-6720), so the prompt
   * is held by the split view: the other half draws it, and it outlives this layer when the other
   * half is made the one edited (`split/pairAi.ts`). Anywhere else it is this layer's own.
   */
  const pair = useContext(PairAiContext);
  const [own, setOwn] = useState<AiPrompt>(EMPTY_PROMPT);
  const prompt = pair === null ? own : pair.prompt;
  const setPrompt = pair === null ? setOwn : pair.setPrompt;
  const [from, setFrom] = useState<ImagePoint | null>(null);
  const [to, setTo] = useState<ImagePoint | null>(null);
  /** The button that started the gesture waiting for its release. */
  const [held, setHeld] = useState<AiButton | null>(null);
  /**
   * The prompts Ctrl+Z stepped back from, newest last, for redo to return to. Emptied by anything
   * that makes them stale: a new point or box, a clear, an accept.
   */
  const undone = useRef<AiPrompt[]>([]);

  const image = { width, height };

  const boxOf = useCallback((): DisplayBox | null => {
    const element = surfaceRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, []);

  /** What a gesture came to: a prompt worth predicting, a point with nothing to predict, or nothing. */
  const settle = useCallback(
    (outcome: Release) => {
      if (outcome.kind === "ignored") {
        onRefused?.(outcome.reason);
        return;
      }

      undone.current = [];
      setPrompt(outcome.prompt);
      if (outcome.kind === "placed") onRefused?.(outcome.reason);
      else onPrompt(outcome.prompt);
    },
    [onPrompt, onRefused],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      // Left for positive, right for negative. Anything else is not a prompt.
      const button = buttonOf(event);
      if (button === null) return;
      const box = boxOf();
      if (box === null) return;

      const located = locate(event, box, image);
      if (located.kind === "outside") return;

      // Legacy's single view settles a right press where it is made: a negative point, at once.
      const now = press(prompt, located.point, button, view);
      if (now !== null) {
        settle(now);
        return;
      }

      event.currentTarget.setPointerCapture?.(event.pointerId);
      setFrom(located.point);
      setTo(located.point);
      setHeld(button);
    },
    [boxOf, image, prompt, settle, view],
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
      setHeld(null);

      settle(release(prompt, from, end, { negative: held === "right", view }));
    },
    [boxOf, from, held, image, prompt, settle, to, view],
  );

  // The press handed over from the other half: settled once, as this layer's own release would be.
  useEffect(() => {
    if (handed === undefined || !claim(handed)) return;
    settle(release(prompt, handed.from, handed.to, { negative: handed.negative, view }));
    // Only when a press arrives: the prompt and the rest are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handed]);

  /*
   * The REMAPPABLE clear, through the dispatcher so the hotkey reference reports it -- it listed
   * `clear_points` with its key and nothing was listening.
   *
   * Escape still clears too, below and unremappable, because it is what every drawing surface in
   * this app answers to and a user pressing it expects the draft to go. Two ways into one action
   * is not a conflict; a key in the reference that does nothing is.
   */
  useHotkey("clear_points", () => {
    undone.current = [];
    setPrompt(clear());
    onClear?.();
  });

  /*
   * ACCEPTING THE PREVIEW, through the dispatcher rather than a raw Space listener -- the same
   * move the polygon layer made, and for the same reason: the hotkey reference reads the
   * dispatcher's registrations, so an action handled outside it read as "not yet" while working.
   *
   * The BINDING decides accept from erase, not `event.shiftKey`: `save_segment` is Space and
   * `erase_segment` is Shift+Space. Reading the modifier here would ignore half of any remapping.
   */
  const accept = useCallback(
    (erase: boolean) => {
      if (pending(prompt) === "nothing") {
        onRefused?.(NOTHING_TO_ACCEPT);
        return;
      }
      onAccept(erase);
      undone.current = [];
      setPrompt(clear());
    },
    [onAccept, onRefused, prompt],
  );

  useHotkey("save_segment", () => accept(false));
  useHotkey("erase_segment", () => accept(true));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (isInModal(event.target)) return; // a key in a dialog is the dialog's, not the prompt's

      if (event.key === "Escape") {
        event.preventDefault();
        undone.current = [];
        setPrompt(clear());
        onClear?.();
        return;
      }

      /*
       * ENTER: ACCEPT, THEN LET THE SAVE HAPPEN -- legacy's "First accept any AI segments (same as
       * spacebar), then save" (keyboard_event_manager.py:231-234). The save alone forgot the mask
       * on screen (`CONTROL_PARITY.md` CP-22). In the capture phase, so this runs before the
       * dispatcher's save, and under flushSync, so the accepted mask is in the store before the save
       * reads it -- the order the polygon layer keeps for its shape. Nothing placed: the save alone.
       */
      if (event.key === "Enter" && !event.shiftKey) {
        if (pending(prompt) !== "nothing") flushSync(() => accept(false));
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // REDO puts back what undo took, as legacy's redo re-adds a point (undo_redo_manager.py:
      // 108-109). Ctrl+Shift+Z took a point away instead while the undo check below ignored Shift
      // (`CONTROL_PARITY.md` CP-21). With nothing of this prompt's to put back, it is the app's.
      if (modifier && ((key === "z" && event.shiftKey) || key === "y")) {
        const back = undone.current[undone.current.length - 1];
        if (back === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        undone.current = undone.current.slice(0, -1);
        setPrompt(back);
        onPrompt(back);
        return;
      }

      if (modifier && key === "z") {
        // With nothing placed there is nothing here to take back, and Ctrl+Z is the app's Undo:
        // left alone, it reaches the history.
        if (pending(prompt) === "nothing") return;
        // Takes back the last thing PLACED, which is the box when there is one -- the same
        // precedence Space uses, so undo removes what Space would have accepted. STOPPED here,
        // because the dispatcher's Undo also hears Ctrl+Z and used to take back the previous
        // annotation as well (found 2026-09-23, the same race as the polygon layer's).
        event.preventDefault();
        event.stopPropagation();
        undone.current = [...undone.current, prompt];
        const back = undoLast(prompt);
        setPrompt(back);
        if (pending(back) !== "nothing") onPrompt(back);
      }
    };

    // CAPTURE, so this runs before the dispatcher's listener, which bubbles.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [accept, onAccept, onClear, onPrompt, onRefused, prompt, setPrompt]);

  const box = boxOf();
  const perPixel = box === null ? { x: 1, y: 1 } : scale(box, image);
  const { r, g, b } = classColor(classId);
  // Legacy draws its rubber band only once the pointer is past the threshold that makes a drag
  // (`single_view_mouse_handler.py:237`, `main_window.py:5444`), not as a speck under every click.
  const dragging =
    from !== null && to !== null && Math.hypot(to.x - from.x, to.y - from.y) > DRAG_THRESHOLD;

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

      <AiMarks prompt={prompt} classId={classId} perPixel={perPixel} sizing={sizing} />

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
    </svg>
  );
}

/**
 * The prompt as placed: the box, and a dot for each point.
 *
 * Its own component because a linked pair's prompt is drawn in BOTH halves of the Multi tab, as
 * legacy draws each point in every target viewer (main_window.py:6666-6672, 6741-6776); the half
 * not being edited draws it through this too, so the two cannot disagree about what was placed.
 * `perPixel` is image pixels per screen pixel, which keeps a dot one size on screen at any zoom.
 */
export function AiMarks({
  prompt,
  classId,
  perPixel,
  sizing,
}: {
  readonly prompt: AiPrompt;
  readonly classId: number;
  readonly perPixel: { readonly x: number; readonly y: number };
  readonly sizing: Sizing;
}): ReactNode {
  const { r, g, b } = classColor(classId);
  return (
    <>
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

      {prompt.points.map((point, index) => (
        <ellipse
          key={index}
          data-testid={point.positive ? `ai-positive-${index}` : `ai-negative-${index}`}
          cx={point.x}
          cy={point.y}
          rx={POINT_RADIUS * perPixel.x * sizing.point}
          ry={POINT_RADIUS * perPixel.y * sizing.point}
          // Green for include, red for exclude: the two mean opposite things, and a shape or size
          // difference alone is a distinction nobody reads at a glance. Legacy's pure green and red
          // at alpha 150 (ai_segment_manager.py:452).
          fill={point.positive ? "rgba(0, 255, 0, 0.59)" : "rgba(255, 0, 0, 0.59)"}
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={Math.max(perPixel.x, perPixel.y) * sizing.line}
        />
      ))}
    </>
  );
}

/**
 * Which button a press is, as legacy's Qt reads it, or null for one that is not a prompt.
 *
 * On a Mac a click with Control held is the RIGHT button: Qt's `mouseDown:` sends it as one
 * (`qnsview_mouse.mm`), so there it is a negative point. A browser reports it as the left button
 * with Control down. Elsewhere Ctrl changes nothing, as legacy reads no modifier in AI mode.
 */
export function buttonOf(event: { readonly button: number; readonly ctrlKey: boolean }): AiButton | null {
  if (event.button === 2) return "right";
  if (event.button !== 0) return null;
  return event.ctrlKey && isApplePlatform() ? "right" : "left";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
