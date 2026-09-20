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
 * DESTRUCTIVE ACTIONS SAY WHAT THEY WILL DO BEFORE THEY DO IT. Delete names the count; merge names
 * the class it will move things to. Legacy's Merge gives no indication of its target at all, and
 * its target is not the active class the tooltip claims (RULE-019).
 */

import { useCallback, type ReactNode } from "react";

import type { WireSegment } from "@lazylabel/contracts";

import { classColor } from "../canvas/classColor.js";
import { merge, mergeTarget } from "../tools/merge.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";

export function SegmentTable(): ReactNode {
  const { segments, selected, toggleSelected, setSelection, clearSelection, applySegments } =
    useWorkspace();

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
    // Legacy selects every annotation on the image. Toggling would make one key mean two things
    // depending on state, which is the shape RULE-070 is a defect card about.
    setSelection(segments.map((_, index) => index));
  });
  useHotkey("escape", clearSelection);

  // AFTER the hooks, never before: an early return above a `useHotkey` changes how many hooks this
  // component runs between renders, and React refuses -- "Rendered more hooks than during the
  // previous render". The keys are also right to keep alive here: with no annotations they simply
  // find nothing to act on, which is what their own guards already say.
  if (segments.length === 0) {
    return <p className="panel__missing">No annotations on this image yet.</p>;
  }


  const target = selected.length > 0 ? mergeTarget(segments, selected) : null;

  return (
    <>
      <table className="segments">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Selected</span>
            </th>
            <th scope="col">Class</th>
            <th scope="col">Type</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment, index) => (
            <tr key={index} aria-selected={selected.includes(index)}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(index)}
                  onChange={() => toggleSelected(index)}
                  aria-label={`Select ${describe(segment, index)}`}
                />
              </td>
              <th scope="row">
                <span className="swatch" style={{ background: swatch(segment) }} aria-hidden="true" />{" "}
                {segment.classId ?? "unclassified"}
              </th>
              <td>{segment.type}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p role="status">
        {selected.length === 0
          ? `${segments.length} ${segments.length === 1 ? "annotation" : "annotations"}`
          : `${selected.length} of ${segments.length} selected`}
      </p>

      <div className="segments__actions">
        {/* Both name their effect. A button that says only "Merge" leaves a user to find out what
            it did by looking at the result, which for a destructive action is too late. */}
        <button type="button" onClick={onMerge} disabled={selected.length < 2}>
          {target === null ? "Merge" : `Merge into class ${target}`}
        </button>

        <button type="button" onClick={onDelete} disabled={selected.length === 0}>
          {selected.length <= 1 ? "Delete" : `Delete ${selected.length}`}
        </button>

        <button type="button" onClick={clearSelection} disabled={selected.length === 0}>
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
