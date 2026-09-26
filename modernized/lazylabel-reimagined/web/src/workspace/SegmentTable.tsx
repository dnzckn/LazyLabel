/**
 * The annotations on this image, and what can be done to a selection of them.
 *
 * Legacy's right panel holds the same list with Merge and Delete beneath it. Two things here are
 * deliberately not legacy's:
 *
 * EVERY ROW SAYS WHAT IT IS. Legacy shows a class and an index; this also shows the TYPE, because
 * whether an annotation is a polygon or a mask decides what a user can do with it — a Loaded or AI
 * segment cannot be vertex-edited, and after an erase a polygon silently becomes a mask. Without
 * the type on screen, "why can I not edit this one" has no answer.
 *
 * EVERYTHING ELSE IS LEGACY'S WORDS (right_panel.py:126-168, segment_table_manager.py:122-128,
 * 375-384): "Filter Class:" with "alias: id" items, "N/A" for an annotation with no class, and the
 * "Merge to Class" and "Delete" buttons with their tooltips. Until 2026-09-26 the buttons named
 * their effect -- "Merge into class 2", "Delete 3" -- because legacy's Merge gives no indication
 * of its target, and that target is the lowest selected class rather than the active one
 * (RULE-019). The owner asked for legacy's texts; the count selected is still on the status line.
 */

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";

import type { WireSegment } from "@lazylabel/contracts";

import { classColor } from "../canvas/classColor.js";
import { merge } from "../tools/merge.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";
import { useHotkey, useKeyHint } from "../hotkeys/HotkeyProvider.jsx";

export function SegmentTable(): ReactNode {
  const { segments, selected, toggleSelected, setSelection, clearSelection, applySegments, classAliases } =
    useWorkspace();
  // Legacy's "Filter Class:" (right_panel.py:126-140). A view of the list, not a selection: the
  // positions every action takes are still positions in the whole list.
  const [filter, setFilter] = useState("all");
  /** The row a Shift+click extends from: the last one clicked without Shift. */
  const [anchor, setAnchor] = useState<number | null>(null);

  const classes = [...new Set(segments.map((segment) => segment.classId ?? null))].sort(
    (a, b) => (a ?? -1) - (b ?? -1),
  );
  // A class that has gone (merged away, deleted) no longer filters anything out of sight.
  const filtering = filter !== "all" && classes.some((classId) => String(classId) === filter);
  const passes = useCallback(
    (index: number) => !filtering || String(segments[index]?.classId ?? null) === filter,
    [filter, filtering, segments],
  );
  const rows = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ index }) => passes(index));

  /*
   * THE SELECTION IS ONLY EVER ROWS THE TABLE SHOWS, as legacy's is: its selection is the table's
   * selected rows (right_panel.py:351-359), and refiltering keeps only those still shown
   * (segment_table_manager.py:154-160). Here the filter hid rows without deselecting them, so Delete
   * or Merge after choosing a filter reached annotations the user could no longer see.
   */
  useEffect(() => {
    if (!filtering) return;
    const kept = selected.filter(passes);
    if (kept.length !== selected.length) setSelection(kept);
  }, [filtering, passes, selected, setSelection]);

  /*
   * A click as a table takes it, as legacy's does (Qt's extended selection): a plain click selects
   * that row alone, Ctrl or Cmd adds or removes it, and Shift selects the run of shown rows from the
   * last row clicked. It toggled on every click, and said "as in legacy" while it did. The checkbox
   * still toggles: it is the same choice for the keyboard and for a screen reader.
   */
  const clickRow = (event: MouseEvent, index: number) => {
    if (event.shiftKey && anchor !== null) {
      const shown = rows.map((row) => row.index);
      const from = shown.indexOf(anchor);
      const to = shown.indexOf(index);
      if (from >= 0 && to >= 0) {
        setSelection(shown.slice(Math.min(from, to), Math.max(from, to) + 1));
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) toggleSelected(index);
    else setSelection([index]);
    setAnchor(index);
  };

  const onMerge = useCallback(() => {
    applySegments(merge(segments, selected).segments, "Merge");
  }, [applySegments, segments, selected]);

  const onDelete = useCallback(() => {
    const drop = new Set(selected);
    applySegments(
      segments.filter((_, index) => !drop.has(index)),
      selected.length === 1 ? "Delete annotation" : `Delete ${selected.length} annotations`,
    );
  }, [applySegments, segments, selected]);

  /*
   * THE KEYS THE TABLE'S BUTTONS ALREADY HAD LABELS FOR. Every one of these actions worked; none
   * of them had a key, while the hotkey reference listed all three with their bindings.
   *
   * Each guards itself exactly as its button does -- merge needs two, delete needs one - rather
   * than trusting the key to be pressed at a sensible moment. A hotkey that throws on an empty
   * selection is a hotkey nobody presses twice.
   */
  useHotkey("merge_segments", () => {
    if (selected.length >= 2) onMerge();
  });
  useHotkey("delete_segments", () => {
    if (selected.length > 0) onDelete();
  });
  useHotkey("delete_segments_alt", () => {
    if (selected.length > 0) onDelete();
  });
  useHotkey("select_all", () => {
    // Legacy selects every row the table SHOWS (right_panel.py:378-380), so under a filter only
    // that class's annotations -- every time: unlike Select and Edit (RULE-070), it does not toggle.
    setSelection(rows.map(({ index }) => index));
  });
  useHotkey("escape", clearSelection);
  const keyOf = useKeyHint();

  // With no annotations the table is shown empty, as legacy's is: its keys find nothing to act on,
  // which is what their own guards already say, and its buttons are disabled.
  return (
    <>
      <label className="segments__filter">
        <span>Filter Class:</span>
        <select
          value={filtering ? filter : "all"}
          title="Filter segments list by class"
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All Classes</option>
          {classes.map((classId) => (
            <option key={String(classId)} value={String(classId)}>
              {/* Legacy's "alias: id" (segment_table_manager.py:381-384), the alias being the id
                  where there is none. Legacy lists no unclassified entry; this one reads "N/A", as
                  those annotations do in the table. */}
              {classId === null ? "N/A" : `${aliasOf(classAliases, classId)}: ${classId}`}
            </option>
          ))}
        </select>
      </label>

      {/* Legacy's columns, with the row in its class's colour (segment_table_manager.py:149-152).
          The Type column is this app's: see the module comment. */}
      <table className="segments">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Selected</span>
            </th>
            <th scope="col">Segment ID</th>
            <th scope="col">Class ID</th>
            <th scope="col">Alias</th>
            <th scope="col">Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ segment, index }) => (
            <tr
              key={index}
              className="class-row"
              style={{ backgroundColor: swatch(segment) }}
              aria-selected={selected.includes(index)}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("input") === null) clickRow(event, index);
              }}
            >
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(index)}
                  onChange={() => toggleSelected(index)}
                  aria-label={`Select ${describe(segment, index)}`}
                />
              </td>
              <td>{index + 1}</td>
              {/* Legacy's "N/A" for an annotation with no class, in both columns
                  (segment_table_manager.py:125-128). */}
              <th scope="row">{segment.classId ?? "N/A"}</th>
              <td>{segment.classId === null ? "N/A" : aliasOf(classAliases, segment.classId)}</td>
              <td>{segment.type}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {segments.length > 0 && (
        <p role="status">
          {selected.length === 0
            ? `${segments.length} ${segments.length === 1 ? "annotation" : "annotations"}`
            : `${selected.length} of ${segments.length} selected`}
        </p>
      )}

      <div className="segments__actions">
        {/* Legacy's buttons and tooltips (right_panel.py:158-165). Its tooltips name the keys; these
            name the keys the user bound. */}
        <button
          type="button"
          onClick={onMerge}
          disabled={selected.length < 2}
          title={`Merge selected segments into a single class${keyOf("merge_segments")}`}
        >
          Merge to Class
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={selected.length === 0}
          title={`Delete selected segments${keyOf("delete_segments", "delete_segments_alt")}`}
        >
          Delete
        </button>

        <button
          type="button"
          onClick={clearSelection}
          disabled={selected.length === 0}
          title={`Cancel/Clear Selection${keyOf("escape")}`}
        >
          Clear selection
        </button>
      </div>
    </>
  );
}

/** Enough to tell two rows apart in a screen reader's list of checkboxes. */
function describe(segment: WireSegment, index: number): string {
  const classId = segment.classId === null ? "unclassified" : `class ${segment.classId}`;
  return `${segment.type} ${index + 1}, ${classId}`;
}

function swatch(segment: WireSegment): string {
  const { r, g, b } = classColor(segment.classId);
  return `rgb(${r}, ${g}, ${b})`;
}

/** A class's name, or its id where it has none -- which is what legacy's alias column shows. */
function aliasOf(aliases: Readonly<Record<string, string>>, classId: number): string {
  return aliases[String(classId)] ?? String(classId);
}
