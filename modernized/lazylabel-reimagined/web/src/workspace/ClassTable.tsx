/**
 * The classes on this image: their names, their order, and renumbering them.
 *
 * Legacy's class table, worked the way its users work it (right_panel.py:172-201,
 * reorderable_class_table.py): a click on a row makes that class the one new annotations get, a
 * double-click on a name edits it in place, and a row is dragged to reorder. The table shows only
 * what legacy's shows -- the label, the two columns and Reassign Class IDs -- and explains itself in
 * legacy's tooltips.
 *
 * ORDER IS NOT DECORATION HERE, BUT A DRAG ALONE WRITES NOTHING. A drag changes the order on screen
 * and nothing else, as legacy's does: saving still numbers channels by ascending id
 * (save_export_manager.py:400). Reassign Class IDs is what renumbers classes 0..N-1 in the order shown
 * (RULE-013, segment_table_manager.py:96-100), and class ids are what the exported files carry -- an
 * NPZ's channel order and a COCO file's category ids.
 *
 * NAMES ARE PER IMAGE, under decision 6. "car" can be class 1 in one file and class 2 in the next,
 * and the alias table travels with the file.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { classColor } from "../canvas/classColor.js";
import { reassignClassIds } from "./classes.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { useWorkspace } from "./WorkspaceProvider.jsx";

/** Legacy's tooltip on the table (right_panel.py:181-183). What it says is how the table is worked. */
const TABLE_TOOLTIP =
  "Double-click to set class aliases and drag to reorder channels for saving.\n"
  + "Click once to toggle as active class for new segments.";

/** Legacy's tooltip on Reassign Class IDs (right_panel.py:195-198). */
const REASSIGN_TOOLTIP = "Re-index class channels based on the current order in this table";

/**
 * How far a press travels before it is a drag rather than a click, measured as Qt measures its
 * start-drag distance: along x plus along y.
 */
const DRAG_DISTANCE = 5;

/** Legacy scrolls its table while a drag is within 40px of the edge (reorderable_class_table.py:13-22). */
const SCROLL_MARGIN = 40;
const SCROLL_STEP = 10;

/**
 * One class's name, edited in place, as legacy's table edits a cell after a double-click
 * (right_panel.py:192, 228-240): it opens with the name selected, Enter or leaving it commits, and
 * Escape puts the name back.
 *
 * It commits ONCE, when editing ends. Committing each keystroke could not work: the store trims a
 * name, so the space typed between "stop" and "sign" was trimmed away as it was typed, and every
 * keystroke was an undo step.
 *
 * It starts from what the cell shows -- an unnamed class's id -- as Qt's editor does, and a text
 * that comes back unchanged stores nothing, because Qt reports an edit only when the text changed.
 * Otherwise Enter on an unnamed class would name it "3".
 */
function AliasEditor({
  classId,
  shown,
  onClose,
}: {
  readonly classId: number;
  /** What the cell shows: the name, or the id where there is none. */
  readonly shown: string;
  /** The name to store, or null to store nothing; and whether focus goes back to the class's row. */
  readonly onClose: (name: string | null, backToRow: boolean) => void;
}): ReactNode {
  const [draft, setDraft] = useState(shown);
  const field = useRef<HTMLInputElement>(null);
  // Enter and Escape close the editor, which unmounts the field, and some browsers then report a
  // blur. It must not commit a second time -- after an Escape, a first time.
  const closed = useRef(false);

  // Qt opens a line-edit editor focused with its text selected, so typing replaces the name.
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const close = (value: string | null, backToRow: boolean) => {
    if (closed.current) return;
    closed.current = true;
    onClose(value === shown ? null : value, backToRow);
  };

  return (
    <input
      ref={field}
      type="text"
      value={draft}
      placeholder={String(classId)}
      aria-label={`Name for class ${classId}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => close(draft, false)}
      onKeyDown={(event) => {
        // An input method confirms its candidate with Enter; that is not the end of the name.
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          close(draft, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          close(null, true);
        }
      }}
    />
  );
}

export function ClassTable(): ReactNode {
  const {
    segments,
    classAliases,
    setClassAlias,
    applyClasses,
    activeClassId,
    toggleActiveClass,
    open,
    activeSide,
  } = useWorkspace();
  const { notify } = useNotifications();

  /*
   * What the order and the editor belong to. Legacy rebuilds its table in id order for every image
   * it opens (segment_table_manager.py:338-368), so an arrangement made on one image never reaches
   * another -- where Reassign would renumber that image's classes in an order nobody chose for it.
   */
  const image = `${activeSide}:${open?.image.key ?? ""}`;

  /** The user's arrangement of this image's classes, or null while they have not moved anything. */
  const [arranged, setArranged] = useState<{ readonly image: string; readonly order: readonly number[] } | null>(
    null,
  );
  const [editing, setEditing] = useState<{ readonly image: string; readonly classId: number } | null>(null);
  /**
   * The row being dragged and the gap it would land in: 0 above the first row, N below the last, or
   * null while the pointer is outside the table.
   */
  const [drag, setDrag] = useState<Drag | null>(null);

  const present = [
    ...new Set(
      segments
        .map((segment) => segment.classId)
        .filter((classId): classId is number => classId !== null && classId !== undefined),
    ),
  ].sort((a, b) => a - b);

  // A stored order can go stale when a class disappears, so it is filtered against what is
  // actually here and topped up with anything new.
  const order = arranged !== null && arranged.image === image ? arranged.order : null;
  const shown = order === null
    ? present
    : [...order.filter((id) => present.includes(id)), ...present.filter((id) => !order.includes(id))];
  const editingId = editing !== null && editing.image === image ? editing.classId : null;

  const body = useRef<HTMLTableSectionElement>(null);
  /*
   * Read by the listeners a drag puts on the window. They are made once, when the press begins, and
   * must still see the rows as they are when it ends.
   */
  const latest = useRef({ shown, image });
  useLayoutEffect(() => {
    latest.current = { shown, image };
  });

  /** A class whose row should have the keyboard focus after this render: it moved, or its editor closed. */
  const refocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    const classId = refocus.current;
    if (classId === null) return;
    refocus.current = null;
    body.current?.querySelector<HTMLButtonElement>(`button[data-class-id="${classId}"]`)?.focus();
  });

  /** Ends the drag or press in progress: takes its listeners off the window. */
  const gesture = useRef<(() => void) | null>(null);
  useEffect(() => () => gesture.current?.(), []);
  /** Set by a drag's release, so the click the browser may send after it is not taken as a click on the row. */
  const swallowClick = useRef(false);

  /**
   * Put a class at `to` in the order shown: the order Reassign Class IDs numbers from. Returns
   * whether anything moved.
   */
  const moveTo = (classId: number, to: number): boolean => {
    const current = latest.current.shown;
    const from = current.indexOf(classId);
    if (from < 0 || to < 0 || to >= current.length || to === from) return false;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, classId);
    setArranged({ image: latest.current.image, order: next });
    return true;
  };

  /** Legacy's class toggle, with its words (main_window.py:2697-2710). */
  const toggle = (classId: number) =>
    notify({
      severity: "info",
      message: toggleActiveClass(classId)
        ? `Class ${classId} activated for new segments`
        : "No active class - new segments will create new classes",
    });

  /*
   * A click anywhere on a row toggles its class, as legacy's cellClicked does on either column
   * (right_panel.py:213, 242-251).
   *
   * A double-click toggles it ONCE and opens the editor, which is what legacy does: its first release
   * is a click, and the release that ends a double-click is not (Qt's releaseFromDoubleClick). Here
   * the browser sends a click for each release, so the second, with `detail` 2, is skipped. A click
   * from the keyboard has `detail` 0 and toggles.
   */
  const clickRow = (event: ReactMouseEvent, classId: number) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (event.detail > 1) return;
    // A click in the name editor places the caret.
    if ((event.target as Element).closest("input") !== null) return;
    toggle(classId);
  };

  /**
   * The gap a row released here lands in: the one nearest the pointer. Null outside the table, where
   * a drop is refused and the row stays put, as Qt refuses a drop that misses the table.
   */
  const slotAt = (clientX: number, clientY: number): number | null => {
    const rows = body.current?.rows;
    const table = body.current?.parentElement;
    if (rows === undefined || table === null || table === undefined) return null;
    const { left, right, top, bottom } = table.getBoundingClientRect();
    if (clientX < left || clientX > right || clientY < top || clientY > bottom) return null;
    let slot = 0;
    for (const row of rows) {
      const box = row.getBoundingClientRect();
      if (clientY > box.top + box.height / 2) slot += 1;
    }
    return slot;
  };

  /*
   * A press on a row becomes a drag once it travels, as a QTableWidget's does. Pointer events rather
   * than HTML drag and drop: Firefox will not start a native drag from a button, and the class id is
   * one. The listeners go on the window, in the capture phase, so the release is heard wherever it
   * happens -- over the canvas, which handles pointer events of its own, too.
   */
  const pressRow = (event: ReactPointerEvent<HTMLTableRowElement>, classId: number) => {
    if (event.button !== 0 || !event.isPrimary) return;
    // Pressing in the name editor selects text; it does not pick the row up.
    if ((event.target as Element).closest("input") !== null) return;
    // A press still open is one whose release never arrived; it ends here, line and all.
    if (gesture.current !== null) {
      gesture.current();
      setDrag(null);
    }

    const { pointerId, clientX: startX, clientY: startY } = event;
    const row = event.currentTarget;
    let dragging = false;
    let cancelled = false;
    let pane: HTMLElement | null = null;

    const release = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("keydown", onKey, true);
      if (gesture.current === release) gesture.current = null;
    };

    function onMove(move: PointerEvent): void {
      if (move.pointerId !== pointerId) return;
      // The button came up somewhere this never heard about.
      if ((move.buttons & 1) === 0) {
        release();
        setDrag(null);
        return;
      }
      if (cancelled) return;
      if (!dragging) {
        if (Math.abs(move.clientX - startX) + Math.abs(move.clientY - startY) < DRAG_DISTANCE) return;
        dragging = true;
        pane = scrollingAncestor(row);
      }
      if (pane !== null) scrollNearEdge(pane, move.clientY);
      const slot = slotAt(move.clientX, move.clientY);
      setDrag((now) => (now !== null && now.classId === classId && now.slot === slot ? now : { classId, slot }));
    }

    function onUp(up: PointerEvent): void {
      if (up.pointerId !== pointerId) return;
      release();
      if (!dragging) return;
      // A drag that ends on the row it began on is followed by a click on that row; one that ends
      // elsewhere is not, so the flag lasts only until this release has been handled.
      swallowClick.current = true;
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 0);
      setDrag(null);
      const slot = slotAt(up.clientX, up.clientY);
      if (cancelled || slot === null) return;
      const from = latest.current.shown.indexOf(classId);
      moveTo(classId, slot > from ? slot - 1 : slot);
    }

    function onCancel(cancel: PointerEvent): void {
      if (cancel.pointerId !== pointerId) return;
      release();
      setDrag(null);
    }

    // Escape puts the row back, as it cancels a drag in Qt. The button is still down, so the
    // release is still waited for: it must not arrive as a click.
    function onKey(key: KeyboardEvent): void {
      if (!dragging || cancelled || key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      cancelled = true;
      setDrag(null);
    }

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onKey, true);
    gesture.current = release;
  };

  /*
   * The keyboard's way to do what the mouse does, on the row's focusable id: Alt+Up and Alt+Down
   * move the row, F2 edits its name. Legacy's table offers neither -- Qt's F2 trigger is off
   * (right_panel.py:192) -- but a table only a mouse can reorder is one some users cannot use.
   */
  const keyOnRow = (event: ReactKeyboardEvent, classId: number) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      event.stopPropagation();
      // React may move the focused row's node to reorder the rows, and a moved node loses focus.
      // Only after a move: a request left pending would take the focus at some later render.
      if (moveTo(classId, latest.current.shown.indexOf(classId) + (event.key === "ArrowUp" ? -1 : 1))) {
        refocus.current = classId;
      }
    } else if (!event.altKey && event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      setEditing({ image, classId });
    }
  };

  const closeEditor = (classId: number, name: string | null, backToRow: boolean) => {
    setEditing(null);
    // RULE-042's validation is the store's: the name is trimmed, and a blank one clears the entry.
    if (name !== null) setClassAlias(classId, name);
    if (backToRow) refocus.current = classId;
  };

  const reassign = () => {
    const result = reassignClassIds(segments, classAliases, shown);
    applyClasses(result.segments, result.aliases, "Reassign class ids");
    setArranged(null);

    // Legacy's silent outcomes (classes.ts), each reported in one line, as legacy's notices are.
    if (result.collisions.length > 0) {
      notify({
        severity: "warning",
        message: `Class ${result.collisions.join(", ")} now has more than one meaning`,
      });
    }
    if (result.droppedAliases.length > 0) {
      notify({
        severity: "warning",
        message: `Dropped unused class name${result.droppedAliases.length === 1 ? "" : "s"}: ${result.droppedAliases.join(", ")}`,
      });
    }
  };

  const changed = shown.some((classId, position) => classId !== position);

  return (
    <>
      <p className="classes__label">Class Order:</p>
      {/* Legacy's class table (right_panel.py:172-201): the name, then the id, each row in its
          class's colour, and the ACTIVE class -- the one new annotations get -- in bold with a
          marker (295-314). The rows scroll inside the section, under the header, with Reassign
          Class IDs below in view; a drag near the edge scrolls them. */}
      <div className="classes__scroll">
        <table className={`classes${drag === null ? "" : " classes--dragging"}`} title={TABLE_TOOLTIP}>
          <thead>
            <tr>
              <th scope="col">Alias</th>
              <th scope="col">Class ID</th>
            </tr>
          </thead>
          <tbody ref={body}>
            {shown.map((classId, position) => (
              <tr
                key={classId}
                className={rowClass(classId, position, shown.length, activeClassId, drag)}
                style={{ backgroundColor: swatch(classId) }}
                onPointerDown={(event) => pressRow(event, classId)}
                onClick={(event) => clickRow(event, classId)}
              >
                <td
                  className="classes__alias"
                  // The name is the editable cell; the id is not (segment_table_manager.py:352).
                  onDoubleClick={() => {
                    if (editingId !== classId) setEditing({ image, classId });
                  }}
                >
                  {editingId === classId ? (
                    <AliasEditor
                      classId={classId}
                      shown={aliasOf(classAliases, classId)}
                      onClose={(name, backToRow) => closeEditor(classId, name, backToRow)}
                    />
                  ) : (
                    aliasOf(classAliases, classId)
                  )}
                </td>
                <th scope="row">
                  <button
                    type="button"
                    className="classes__use"
                    data-class-id={classId}
                    aria-pressed={activeClassId === classId}
                    aria-label={`Draw new annotations as class ${classId}`}
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown F2"
                    onKeyDown={(event) => keyOnRow(event, classId)}
                  >
                    {classId}
                  </button>
                </th>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={reassign} disabled={!changed} title={REASSIGN_TOOLTIP}>
        Reassign Class IDs
      </button>
    </>
  );
}

interface Drag {
  readonly classId: number;
  readonly slot: number | null;
}

function rowClass(classId: number, position: number, rows: number, activeClassId: number | null, drag: Drag | null): string {
  const names = ["class-row"];
  if (activeClassId === classId) names.push("classes__row--active");
  if (drag !== null) {
    if (drag.classId === classId) names.push("classes__row--dragged");
    // Where the dragged row would land: a line over the row it would go above, or under the last.
    if (drag.slot === position) names.push("classes__row--drop-before");
    if (drag.slot === rows && position === rows - 1) names.push("classes__row--drop-after");
  }
  return names.join(" ");
}

/** The nearest ancestor that scrolls vertically, or null when nothing does. */
function scrollingAncestor(from: Element): HTMLElement | null {
  for (let node = from.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

function scrollNearEdge(pane: HTMLElement, clientY: number): void {
  const { top, bottom } = pane.getBoundingClientRect();
  if (clientY < top + SCROLL_MARGIN) pane.scrollTop -= SCROLL_STEP;
  else if (clientY > bottom - SCROLL_MARGIN) pane.scrollTop += SCROLL_STEP;
}

/** A class's name, or its id where it has none -- which is what legacy's alias column shows. */
function aliasOf(aliases: Readonly<Record<string, string>>, classId: number): string {
  return aliases[String(classId)] ?? String(classId);
}

function swatch(classId: number): string {
  const { r, g, b } = classColor(classId);
  return `rgb(${r}, ${g}, ${b})`;
}
