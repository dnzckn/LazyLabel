/**
 * The right-hand column as legacy's vertical QSplitter (right_panel.py:67-85): the file list, the
 * segments and the classes, top to bottom, each with its share of the column's height and a divider
 * between each two that is dragged to trade height between them.
 *
 * THE COLUMN NEVER SCROLLS AS A WHOLE. It was one long page until 2026-09-29, so a folder of 86
 * photos pushed Segments and Classes far down it; the owner: "the right side controls should be
 * fixed normalized to the height, so not an infinte hight scrol bar look to the pyqt6
 * implementation for how it was done there". Each section scrolls its own list inside itself, with
 * its buttons in view, as legacy's tables do inside their splitter panes.
 *
 * The shares begin at legacy's: its sections take 294, 242 and 234 of 770 pixels at its default
 * 1600x900 (sizes measured from legacy's window), about 38, 31 and 31 percent. A section closed to
 * its header gives its share to the others. Where the dividers were left is remembered in this
 * browser, for this viewer only.
 *
 * The divider is focusable and moves with Up and Down, and to its ends with Home and End, as the
 * WAI-ARIA window splitter does; legacy's takes no keys.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { KEY_STEP, dividerValue, growFactors, moveDivider, pairAt, readShares, type Pair } from "./splitter.js";

export interface SplitterSection {
  readonly id: string;
  /** What the section holds, for the name of the dividers that resize it. */
  readonly label: string;
  /** Its part of the height before the viewer moves a divider. */
  readonly share: number;
  /** The fewest pixels a divider leaves it. */
  readonly min: number;
  /** Closed to its header, as a collapsed `Panel` is: it keeps that height and gives up its share. */
  readonly collapsed?: boolean;
  readonly content: ReactNode;
}

export interface SplitterProps {
  readonly sections: readonly SplitterSection[];
  /** Where this browser remembers the viewer's dividers; nowhere when omitted. */
  readonly storageKey?: string;
}

export function Splitter({ sections, storageKey }: SplitterProps): ReactNode {
  const [shares, setShares] = useState(() =>
    readShares(load(storageKey), sections.map((section) => section.share)),
  );
  const boxes = useRef<(HTMLDivElement | null)[]>([]);
  /** The divider being dragged, drawn in the accent as legacy's is under the pointer. */
  const [dragging, setDragging] = useState<number | null>(null);
  /** Ends a drag whose release never arrived, as when this unmounts mid-drag. */
  const gesture = useRef<(() => void) | null>(null);
  useEffect(() => () => gesture.current?.(), []);
  const idPrefix = useId();

  const collapsed = sections.map((section) => section.collapsed === true);
  const heightOf = (index: number): number => boxes.current[index]?.getBoundingClientRect().height ?? 0;
  const minsOf = (pair: Pair) => ({ above: sections[pair.above]!.min, below: sections[pair.below]!.min });

  const remember = useCallback(
    (next: readonly number[]) => {
      if (storageKey === undefined) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage refused (private mode, a full quota): the dividers stay where they are, unremembered.
      }
    },
    [storageKey],
  );

  /*
   * A DRAG, from where it began: the pair's heights then, and the shares then, so a move is always
   * measured from the press and never compounds. The listeners go on the window, in the capture
   * phase, so the release is heard wherever it happens, as the class table's row drag does.
   */
  const press = (event: ReactPointerEvent<HTMLDivElement>, index: number): void => {
    if (event.button !== 0 || !event.isPrimary) return;
    const pair = pairAt(collapsed, index);
    if (pair === null) return;
    gesture.current?.();

    const { pointerId, clientY: startY } = event;
    const heights = { above: heightOf(pair.above), below: heightOf(pair.below) };
    const mins = minsOf(pair);
    const from = shares;
    let moved = from;
    setDragging(index);
    // Captured, so the divider's resize cursor stays over whatever the pointer crosses.
    try {
      event.currentTarget.setPointerCapture(pointerId);
    } catch {
      // A pointer the browser no longer tracks: the window's listeners still hear the drag.
    }

    const release = (): void => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      if (gesture.current === release) gesture.current = null;
      setDragging(null);
    };
    function onMove(move: PointerEvent): void {
      if (move.pointerId !== pointerId) return;
      moved = moveDivider(from, pair!, heights, move.clientY - startY, mins);
      setShares(moved);
    }
    function onUp(up: PointerEvent): void {
      if (up.pointerId !== pointerId) return;
      release();
      if (moved !== from) remember(moved);
    }
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    gesture.current = release;
  };

  // The keys are the divider's: none reaches the application's shortcuts behind it.
  const key = (event: ReactKeyboardEvent<HTMLDivElement>, index: number): void => {
    const by =
      event.key === "ArrowUp" ? -KEY_STEP
      : event.key === "ArrowDown" ? KEY_STEP
      : event.key === "Home" ? -Infinity
      : event.key === "End" ? Infinity
      : null;
    const pair = pairAt(collapsed, index);
    if (by === null || pair === null) return;
    event.preventDefault();
    event.stopPropagation();
    const next = moveDivider(shares, pair, { above: heightOf(pair.above), below: heightOf(pair.below) }, by, minsOf(pair));
    setShares(next);
    remember(next);
  };

  const grow = growFactors(shares, collapsed);

  return (
    <div className="splitter">
      {sections.map((section, index) => {
        const pair = index === 0 ? null : pairAt(collapsed, index - 1);
        return (
          <Fragment key={section.id}>
            {index > 0 && (
              <div
                role="separator"
                aria-orientation="horizontal"
                className={`splitter__handle${dragging === index - 1 ? " splitter__handle--dragging" : ""}`}
                {...(pair === null
                  ? { "aria-disabled": true }
                  : {
                      tabIndex: 0,
                      "aria-label": `Resize ${sections[pair.above]!.label} and ${sections[pair.below]!.label}`,
                      "aria-controls": `${idPrefix}-${sections[pair.above]!.id}`,
                      "aria-valuemin": 0,
                      "aria-valuemax": 100,
                      "aria-valuenow": dividerValue(shares, pair),
                      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => press(event, index - 1),
                      onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => key(event, index - 1),
                    })}
              />
            )}
            <div
              ref={(element) => {
                boxes.current[index] = element;
              }}
              id={`${idPrefix}-${section.id}`}
              className={`splitter__section${section.collapsed === true ? " splitter__section--collapsed" : ""}`}
              style={{ "--share": grow[index], "--min": `${section.min}px` } as CSSProperties}
            >
              {section.content}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** What this browser holds under `key`, or null: storage can be missing or refuse to be read. */
function load(key: string | undefined): string | null {
  if (key === undefined) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
