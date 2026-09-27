/**
 * Drawing a polygon: the clicks, the preview, and the keys.
 *
 * The rules live elsewhere on purpose. `tools/polygon.ts` decides whether a click adds a vertex or
 * closes the shape, `canvas/coordinates.ts` turns a client point into an image point, and
 * `workspace/classes.ts` decides which class the finished polygon takes. What is left here is the
 * part that genuinely needs a browser: where the pointer is, what the user sees while drawing, and
 * which key does what.
 *
 * AN SVG OVERLAY RATHER THAN A SECOND CANVAS. The preview changes on every click; redrawing a
 * canvas for that means clearing and repainting the whole thing, while the browser is already good
 * at moving a handful of SVG nodes. It also
 * makes the vertices real elements, which is what lets a test assert where they are instead of
 * reading pixels back.
 *
 * THE MARKS ARE LEGACY'S (`DraftMarks`): in image pixels that grow with the zoom, as legacy's scene
 * items do, and with no hint when the pointer is in range to close the shape, as legacy gives none.
 */

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { PairDraftContext } from "../split/pairDraft.js";
import { claim, PairPressContext } from "../split/pairPress.js";
import { locate, type DisplayBox, type ImagePoint } from "./coordinates.js";
import {
  EMPTY_DRAFT,
  cancel,
  click as clickTool,
  finish,
  undoVertex,
  type PolygonDraft,
} from "../tools/polygon.js";
import { useSizing } from "./useSizing.js";
import { legacyLineThickness, legacyPointRadius, type Sizing } from "./sizing.js";
import { ViewKindContext, type ViewKind } from "./viewKind.js";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";
import { isInModal } from "../hotkeys/keyEvent.js";
import type { SideIndex } from "../workspace/WorkspaceProvider.jsx";

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
  /**
   * Unlinked in the Multi tab, Space and Enter finish every image's polygon of three vertices or
   * more, each into its own image (keyboard_event_manager.py:118-123, 224-228): both, by side, when
   * the image not being edited has one to finish. Either may be null.
   */
  readonly onCompleteEach?: (bySide: BySideVertices) => void;
  /** Shift+Space's, each image erased with its own polygon (keyboard_event_manager.py:157-163). */
  readonly onEraseEach?: (bySide: BySideVertices) => void;
}

/** A polygon's vertices for each image of the Multi tab's pair, by side, or null for none. */
export type BySideVertices = readonly [readonly ImagePoint[] | null, readonly ImagePoint[] | null];

export function PolygonLayer({
  width,
  height,
  joinThreshold,
  onComplete,
  onErase,
  onRefused,
  onCompleteEach,
  onEraseEach,
}: PolygonLayerProps): ReactNode {
  const sizing = useSizing();
  const view = useContext(ViewKindContext);
  const surfaceRef = useRef<SVGSVGElement>(null);
  /*
   * A PAIR'S POLYGONS ARE HELD BY THE SPLIT VIEW: in the Multi tab each image's is drawn in its half
   * and outlives this layer when the other half is made the one edited -- linked, the pair's one
   * polygon, in both (`split/pairDraft.ts`).
   */
  const pairDraft = useContext(PairDraftContext);
  const [ownDraft, setOwnDraft] = useState<PolygonDraft>(EMPTY_DRAFT);
  const draft = pairDraft === null ? ownDraft : pairDraft.draft;
  const setDraft = pairDraft === null ? setOwnDraft : pairDraft.setDraft;
  /** Unlinked in the Multi tab, the other image's own polygon, which Space finishes too. */
  const otherDraft =
    pairDraft === null || pairDraft.linked ? EMPTY_DRAFT : pairDraft.drafts[pairDraft.active === 0 ? 1 : 0];
  const anyDrawing = draft.vertices.length > 0 || otherDraft.vertices.length > 0;
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
      if (erase) onErase?.(vertices);
      else onComplete(vertices);
    },
    [onComplete, onErase, setDraft],
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
   *
   * The draft is READ here, never finished inside `setDraft`'s updater, as it was until 2026-09-27:
   * React runs an updater during render, and twice under StrictMode, which the app renders in
   * (main.tsx), so every Space-finished polygon was added twice, each with a new class. `useHotkey`
   * calls the handler of the latest render, so the draft read is the current one.
   */
  const finishWith = useCallback(
    (erase: boolean) => {
      // Guarded on there being a draft, because these keys are registered whenever this layer is
      // mounted and the layer outlives any one shape.
      if (!anyDrawing) return;
      const outcome = finish(draft, { shift: erase });

      /*
       * UNLINKED, THE OTHER IMAGE'S POLYGON IS FINISHED TOO, into that image, as legacy's Space and
       * Shift+Space finish every viewer's polygon of three vertices or more
       * (keyboard_event_manager.py:118-123, 157-163). One of fewer is left as it is, as legacy's is.
       */
      const theirs = finish(otherDraft, { shift: erase });
      const there = theirs.kind === "close" || theirs.kind === "erase" ? theirs.vertices : null;
      const each = erase ? onEraseEach : onCompleteEach;
      if (there !== null && pairDraft !== null && each !== undefined) {
        const here = outcome.kind === "close" || outcome.kind === "erase" ? outcome.vertices : null;
        const other: SideIndex = pairDraft.active === 0 ? 1 : 0;
        if (here !== null) undone.current = [];
        pairDraft.clear(here === null ? [other] : [pairDraft.active, other]);
        each(pairDraft.active === 0 ? [here, there] : [there, here]);
        if (outcome.kind === "ignored" && draft.vertices.length > 0) onRefused?.(outcome.reason);
        return;
      }

      if (draft.vertices.length === 0) return;
      if (outcome.kind === "close") complete(outcome.vertices, false);
      else if (outcome.kind === "erase") complete(outcome.vertices, true);
      else if (outcome.kind === "ignored") onRefused?.(outcome.reason);
    },
    [anyDrawing, complete, draft, onCompleteEach, onEraseEach, onRefused, otherDraft, pairDraft],
  );

  /** Escape and C: the polygon in progress, and in the Multi tab every image's, as legacy's do. */
  const clearAll = useCallback(() => {
    undone.current = [];
    if (pairDraft === null) setOwnDraft(cancel());
    else pairDraft.clear();
  }, [pairDraft]);

  useHotkey("save_segment", () => finishWith(false));
  useHotkey("erase_segment", () => finishWith(true));
  // Legacy's C clears the polygon's points too, not only the AI tool's, every viewer's in its Multi
  // view (keyboard_event_manager.py:241-246, 300-304, 321-334; `CONTROL_PARITY.md` CP-20).
  useHotkey("clear_points", clearAll);


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
    [boxOf, complete, draft, image, joinThreshold, setDraft],
  );

  // A press on this half of the Multi tab while the other was being edited places the vertex here,
  // as legacy's press in that viewer does (main_window.py:5524-5526, 5654-5657; `split/pairPress.ts`).
  // Linked, it joins the pair's polygon, or closes it on the first vertex; unlinked, this image's
  // own, kept while the other was edited.
  const handed = useContext(PairPressContext);
  useEffect(() => {
    if (handed === null || handed.tool !== "polygon" || !claim(handed)) return;
    const outcome = clickTool(draft, handed.from, {
      ...(joinThreshold === undefined ? {} : { joinThreshold }),
      shift: handed.shift,
    });
    if (outcome.kind === "vertex") {
      undone.current = [];
      setDraft(outcome.draft);
    } else if (outcome.kind === "close") complete(outcome.vertices, false);
    else if (outcome.kind === "erase") complete(outcome.vertices, true);
    // Only when a press arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handed]);

  // Keys are bound on the document rather than the SVG: the surface would have to be focused to
  // receive them, and nothing about clicking on an image says "now press Space here".
  useEffect(() => {
    // Listening while a vertex can still be put back, too: undoing the last one empties the draft.
    // In the Multi tab, while the other image has a polygon of its own, for Escape and Enter.
    if (!anyDrawing && undone.current.length === 0) return;
    const drawing = draft.vertices.length > 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return; // a Space in a class-name field is a space
      if (isInModal(event.target)) return; // a key in a dialog is the dialog's, not the drawing's

      if (event.key === "Escape" && anyDrawing) {
        event.preventDefault();
        clearAll();
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
      // Unlinked in the Multi tab, every image's polygon, as legacy's Enter finishes each viewer's
      // before saving (keyboard_event_manager.py:206-230).
      if (event.key === "Enter" && anyDrawing) {
        event.preventDefault();
        flushSync(() => finishWith(event.shiftKey));
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
  }, [anyDrawing, clearAll, draft, finishWith, setDraft]);

  return (
    <svg
      ref={surfaceRef}
      className="polygon-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="Polygon tool"
      onPointerDown={onPointerDown}
    >
      <DraftMarks vertices={draft.vertices} view={view} sizing={sizing} />
    </svg>
  );
}

/** Legacy's polygon colours, `Qt.GlobalColor.cyan` and `Qt.GlobalColor.blue`, as RGB. */
const CYAN = "0, 255, 255";
const BLUE = "0, 0, 255";

/**
 * A polygon in progress, as legacy draws it, which differs by view.
 *
 * IN THE SINGLE VIEW, which the Sequence tab shares (polygon_drawing_manager.py:95-159): a blue dot
 * at alpha 150 with no outline at each vertex; from the third vertex a cyan fill at alpha 100 of the
 * shape it would close into; and each edge its own cyan line at alpha 150, `line_thickness` image
 * pixels wide with Qt's square cap, so two edges overlap, darker, at the vertex they share. Legacy
 * lays the fill and the lines again over the dots at every click, so both are over them.
 *
 * IN THE MULTI TAB, linked or not, in both halves (main_window.py:5659-5706): an opaque cyan dot with
 * a black pen one image pixel wide at each vertex, over opaque cyan edges two image pixels wide, and
 * no fill.
 *
 * A dot's radius is legacy's `mw.point_radius` in both, `point_radius x annotation_size_multiplier`
 * image pixels. Nothing marks the vertex that would close the shape, as nothing does in legacy.
 * Until 2026-09-27 the edges and dots were opaque, the dots 4 screen pixels times the size ratio,
 * the fill came only with the pointer in range to close, and then the first dot grew and a dashed
 * closing edge appeared.
 */
export function DraftMarks({
  vertices,
  view,
  sizing,
  testIdPrefix = "",
}: {
  readonly vertices: readonly ImagePoint[];
  /** Which of legacy's views this is drawn in. */
  readonly view: ViewKind;
  readonly sizing: Sizing;
  /** Put before each mark's test id, so the two halves of the Multi tab can be told apart. */
  readonly testIdPrefix?: string;
}): ReactNode {
  const radius = legacyPointRadius(sizing);
  const multi = view === "multi";
  const dots = vertices.map((vertex, index) => (
    <ellipse
      key={`dot-${index}`}
      data-testid={`${testIdPrefix}vertex-${index}`}
      cx={vertex.x}
      cy={vertex.y}
      rx={radius}
      ry={radius}
      {...(multi
        ? { fill: `rgb(${CYAN})`, stroke: "rgb(0, 0, 0)", strokeWidth: 1 }
        : { fill: `rgba(${BLUE}, ${150 / 255})`, stroke: "none" })}
    />
  ));
  const edges = vertices.slice(1).map((to, index) => {
    const from = vertices[index]!;
    return (
      <line
        key={`edge-${index}`}
        data-testid={`${testIdPrefix}edge-${index}`}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={multi ? `rgb(${CYAN})` : `rgba(${CYAN}, ${150 / 255})`}
        strokeWidth={multi ? 2 : legacyLineThickness(sizing)}
        strokeLinecap="square"
      />
    );
  });

  if (multi) {
    // The dots at Z 1000 over the edges at 999 (main_window.py:5666, 5676).
    return (
      <>
        {edges}
        {dots}
      </>
    );
  }
  return (
    <>
      {dots}
      {vertices.length > 2 && (
        <polygon
          data-testid={`${testIdPrefix}draft-fill`}
          points={vertices.map((v) => `${v.x},${v.y}`).join(" ")}
          fill={`rgba(${CYAN}, ${100 / 255})`}
          stroke="none"
        />
      )}
      {edges}
    </>
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

