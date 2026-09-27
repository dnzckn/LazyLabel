/**
 * One annotation, drawn once, landing in both images — C14's last piece.
 *
 * `linked.ts` holds the rules this applies: the same PIXEL rather than the same relative position,
 * a shape refused as a unit rather than clamped, and the two images agreeing on the class NAME
 * while each keeps its own id for it. This is where those meet an actual segment.
 *
 * PURE, AND SEPARATE FROM THE STORE, because the interesting part is the refusals. What happens
 * when a shape falls off the edge of the smaller image, or when the other image already uses id 3
 * for something else, is a rule and not a rendering concern — and rules that live inside a React
 * callback are rules nobody can test at the boundary where they matter.
 *
 * WHY THE ANSWER IS SOMETIMES "NO". A linked operation that quietly did something slightly
 * different in the second image would be worse than one that refuses: the user is looking at the
 * first image when they draw, and would find out at export. So every case this cannot do exactly
 * is refused with a reason naming the image it could not be done in.
 */

import type { WireSegment } from "@lazylabel/contracts";

import { mirrorShape, resolveClass, type ImageSize } from "./linked.js";

export type LinkedAdd =
  | {
      readonly kind: "linked";
      /** The segment to add to the OTHER image. */
      readonly segment: WireSegment;
      /**
       * That image's alias table with the class name written in, or the table unchanged when it
       * already knew the name -- possibly under a different id, which is the point of decision 6.
       */
      readonly aliases: Readonly<Record<string, string>>;
      /** True when the other image had to allocate an id, which is worth telling the user. */
      readonly allocated: boolean;
      /** The id the other image used, which may differ from the source's. */
      readonly classId: number;
    }
  | { readonly kind: "refused"; readonly reason: string };

export interface LinkedSource {
  readonly segment: WireSegment;
  readonly aliases: Readonly<Record<string, string>>;
  readonly size: ImageSize;
}

export interface LinkedTarget {
  readonly segments: readonly WireSegment[];
  readonly aliases: Readonly<Record<string, string>>;
  readonly size: ImageSize;
}

/**
 * What to add to the other image for one annotation drawn in this one.
 *
 * The caller applies both halves as ONE recorded action; this decides what the other half is.
 */
export function linkedAdd(source: LinkedSource, target: LinkedTarget): LinkedAdd {
  const { segment } = source;

  // An unclassified annotation has nothing to agree about, and copying it would put a second
  // unclassified object in an image the user was not looking at. Legacy has no such state -- every
  // annotation there gets the active class -- so there is no behaviour to match, only a choice,
  // and refusing is the one that cannot surprise anyone.
  if (segment.classId === null) return UNCLASSIFIED;

  const geometry = mirrorGeometry(segment, source.size, target.size);
  if (geometry.kind === "refused") return geometry;

  return linkedClass({ ...segment, ...geometry.parts }, source.aliases, target);
}

const UNCLASSIFIED: LinkedAdd = { kind: "refused", reason: "an annotation with no class cannot be linked" };

/**
 * The other image's OWN annotation, filed under the class of the same NAME there -- the class half
 * of `linkedAdd`, with no geometry to mirror.
 *
 * What a linked AI accept needs. Legacy asks each image's own model and keeps each image's own
 * answer (ai_segment_manager.py:321-379), so the only thing that crosses is the class: `segment`
 * carries it as `sourceAliases`, the image being edited, knows it, and it comes back renumbered
 * for the target by `resolveClass`.
 */
export function linkedClass(
  segment: WireSegment,
  sourceAliases: Readonly<Record<string, string>>,
  target: Pick<LinkedTarget, "segments" | "aliases">,
): LinkedAdd {
  if (segment.classId === null) return UNCLASSIFIED;

  const assignment = resolveClass(
    { alias: sourceAliases[String(segment.classId)] ?? null, sourceId: segment.classId },
    target.aliases,
    target.segments.flatMap((entry) => (entry.classId === null ? [] : [entry.classId])),
  );

  const aliases =
    assignment.alias === null
      ? target.aliases
      : { ...target.aliases, [String(assignment.classId)]: assignment.alias };

  return {
    kind: "linked",
    segment: { ...segment, classId: assignment.classId },
    aliases,
    allocated: assignment.allocated,
    classId: assignment.classId,
  };
}

/** Where an eraser drawn in one image lands in the other, or why it cannot. */
export type LinkedErase =
  | { readonly kind: "linked"; readonly eraser: WireSegment }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * An ERASER drawn in one image, carried to the other -- RULE-092's linked erase.
 *
 * Legacy mirrors erasing as it mirrors adding: Shift+Space finishes the polygon in both linked
 * viewers in erase mode, and an AI mask accepted in erase mode is applied to both. Deleting and
 * merging are not mirrored -- legacy's V and M act on each viewer's own selection, linked or not,
 * and its buttons on their own viewer -- and neither are they here (`SegmentTable.tsx`, CP-31).
 *
 * The same geometry rules as an addition, so a shape is refused rather than moved when it does not
 * fit, and a mask only crosses between images of one size. None of the class rules: an eraser
 * removes pixels whatever class they belong to, so there is no name to agree on.
 */
export function linkedErase(eraser: WireSegment, source: ImageSize, target: ImageSize): LinkedErase {
  const geometry = mirrorGeometry(eraser, source, target);
  if (geometry.kind === "refused") return geometry;
  return { kind: "linked", eraser: { ...eraser, ...geometry.parts } };
}

type Geometry =
  | { readonly kind: "geometry"; readonly parts: Partial<WireSegment> }
  | { readonly kind: "refused"; readonly reason: string };

function mirrorGeometry(
  segment: WireSegment,
  source: ImageSize,
  target: ImageSize,
): Geometry {
  if (segment.vertices !== undefined) {
    const mirrored = mirrorShape(segment.vertices, target);
    if (mirrored.kind === "refused") return { kind: "refused", reason: mirrored.reason };
    return { kind: "geometry", parts: { vertices: mirrored.vertices } };
  }

  if (segment.mask !== undefined) {
    // A MASK IS SIZED TO ITS IMAGE, so "the same pixel" only has an answer when the two images are
    // the same size. Resampling one to fit would change which pixels are covered, which is exactly
    // the silent difference the same-pixel rule exists to prevent -- and cropping it to the
    // smaller image would be the clamping that `mirrorShape` already refuses for a polygon. A
    // polygon links, or this side can be annotated on its own; the refusal said so until
    // 2026-09-26, and the sizes are on the pair's own line.
    if (source.width !== target.width || source.height !== target.height) {
      return { kind: "refused", reason: "a mask cannot be linked between images of different sizes" };
    }
    return { kind: "geometry", parts: { mask: segment.mask } };
  }

  return { kind: "refused", reason: "this annotation has neither vertices nor a mask to link" };
}
