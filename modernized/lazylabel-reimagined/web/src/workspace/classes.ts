/**
 * Which class a newly drawn annotation gets.
 *
 * Two lines of legacy (`segment_manager.py:34-39, 816-826`) with a consequence worth stating: the
 * next id is `max(existing) + 1`, so ids are never reused and gaps are never filled. Delete class 5
 * from {0, 1, 5} and the next annotation is class 6, not class 2. That is not an accident to tidy
 * up — under decision 6 the id space is per image and the alias table travels with the file, so
 * reusing 2 would silently hand a new object the name the deleted one had.
 */

import type { WireSegment } from "@lazylabel/contracts";

/**
 * The id a new annotation would take if no class is active.
 *
 * Zero when nothing is classified yet, which is legacy's starting point and why LazyLabel datasets
 * are zero-based while many other tools are not.
 */
export function nextClassId(segments: readonly WireSegment[]): number {
  let highest: number | null = null;
  for (const segment of segments) {
    if (segment.classId === null || segment.classId === undefined) continue;
    if (highest === null || segment.classId > highest) highest = segment.classId;
  }
  return highest === null ? 0 : highest + 1;
}

/**
 * The class a new annotation takes: the active one, or the next free id.
 *
 * `activeClassId` of 0 is a real class and must not be treated as absent — the trap in any language
 * where 0 is falsy, and the one that would send every annotation drawn under class 0 to a brand new
 * id instead.
 */
export function classForNewSegment(
  segments: readonly WireSegment[],
  activeClassId: number | null,
): number {
  return activeClassId === null ? nextClassId(segments) : activeClassId;
}
