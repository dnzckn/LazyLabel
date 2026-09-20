/**
 * Merge — RULE-019.
 *
 * Moves every selected annotation to one class. THE TARGET IS THE LOWEST SELECTED CLASS, not the
 * active one, and that was an open question the rule card recorded: legacy's docstrings say
 * "assign selected segments to active class" and the executable code never reads the active class.
 * The answer recorded on 2026-09-19 keeps the code and treats the docstrings as the defect.
 *
 * The argument is about which state the user is looking at. The selection is highlighted in front
 * of them; the active class is a mode set somewhere else, possibly not on screen. Reading it here
 * would let the same visible action give different results from invisible state — and it is the
 * more destructive option, since merging classes 2 and 3 with 7 active introduces a class that took
 * no part in the selection.
 *
 * MASKS STAY SEPARATE. "Merge" changes the class of several annotations; it does not combine them
 * into one shape. Nothing is deleted and no pixels move.
 */

import type { WireSegment } from "@lazylabel/contracts";

import { nextClassId } from "../workspace/classes.js";

export interface MergeResult {
  readonly segments: readonly WireSegment[];
  readonly classId: number;
  /** Which indices actually changed, so a caller can report "3 segments moved to class 2". */
  readonly changed: readonly number[];
}

/**
 * The class a merge would target: the lowest among the selection, or the next free id.
 *
 * Segments with no class at all are skipped rather than treated as class 0 — `null` means
 * unclassified, and letting it win would drag everything selected down to a class nothing had.
 */
export function mergeTarget(
  segments: readonly WireSegment[],
  selected: readonly number[],
): number {
  let lowest: number | null = null;
  for (const index of selected) {
    const classId = segments[index]?.classId;
    if (classId === null || classId === undefined) continue;
    if (lowest === null || classId < lowest) lowest = classId;
  }
  return lowest ?? nextClassId(segments);
}

/** Apply the merge, returning the new list and what changed. */
export function merge(
  segments: readonly WireSegment[],
  selected: readonly number[],
): MergeResult {
  const classId = mergeTarget(segments, selected);
  const wanted = new Set(selected.filter((index) => segments[index] !== undefined));

  const changed: number[] = [];
  const next = segments.map((segment, index) => {
    if (!wanted.has(index) || segment.classId === classId) return segment;
    changed.push(index);
    return { ...segment, classId };
  });

  return { segments: next, classId, changed };
}
