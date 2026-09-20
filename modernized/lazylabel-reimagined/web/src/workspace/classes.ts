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

/**
 * Renumber classes 0..N-1 in a given order, carrying their names — RULE-013, a P0 rule.
 *
 * `order` is the class ids as the user has arranged them. The first becomes 0, the second 1, and
 * so on, which is what makes the class table's order mean something in the exported files: the
 * channel order of an NPZ and the category ids of a COCO file follow the class ids.
 *
 * THREE THINGS LEGACY DOES SILENTLY, ALL REPORTED HERE.
 *
 *   1. A SEGMENT WHOSE CLASS IS NOT IN THE ORDER KEEPS ITS OLD ID — and that id may now belong to
 *      a different class. Two unrelated objects end up sharing a class, in the file, with no
 *      indication. It is reproduced because changing it would change which id a segment exports
 *      with; it is `collisions` that makes it sayable.
 *   2. ALIASES FOR CLASSES WITH NO SEGMENTS ARE DISCARDED. A name the user typed disappears
 *      because nothing currently carries that class.
 *   3. IT IS NOT UNDOABLE in legacy. Here it goes through the same recorded list change as every
 *      other bulk edit, so it is.
 */
export interface Reassignment {
  readonly segments: readonly WireSegment[];
  readonly aliases: Readonly<Record<string, string>>;
  /** Old ids kept by segments the order did not mention, which now collide with a new id. */
  readonly collisions: readonly number[];
  /** Names dropped because no segment carried that class. */
  readonly droppedAliases: readonly string[];
}

export function reassignClassIds(
  segments: readonly WireSegment[],
  aliases: Readonly<Record<string, string>>,
  order: readonly number[],
): Reassignment {
  // Deduped BEFORE positions are handed out. Using the raw index would let a repeated id consume
  // a position and leave a gap, so the result would not be 0..N-1 -- which is the one thing the
  // rule promises. A class table cannot contain duplicates, but a caller is not a class table.
  const renumbered = new Map<number, number>();
  for (const classId of order) {
    if (!renumbered.has(classId)) renumbered.set(classId, renumbered.size);
  }

  const nextSegments = segments.map((segment) => {
    if (segment.classId === null || segment.classId === undefined) return segment;
    const to = renumbered.get(segment.classId);
    // Not in the order: the id is kept, exactly as legacy keeps it.
    return to === undefined ? segment : { ...segment, classId: to };
  });

  const taken = new Set(renumbered.values());
  const collisions = [
    ...new Set(
      segments
        .map((segment) => segment.classId)
        .filter(
          (classId): classId is number =>
            classId !== null && classId !== undefined && !renumbered.has(classId) && taken.has(classId),
        ),
    ),
  ].sort((a, b) => a - b);

  const nextAliases: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [key, name] of Object.entries(aliases)) {
    const to = renumbered.get(Number(key));
    if (to === undefined) dropped.push(name);
    else nextAliases[String(to)] = name;
  }

  return { segments: nextSegments, aliases: nextAliases, collisions, droppedAliases: dropped };
}
