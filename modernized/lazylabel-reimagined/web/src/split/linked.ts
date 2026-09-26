/**
 * Linked operations across a split view — RULE-092, and decision 8's rebuild.
 *
 * Multi-view is not ported. Legacy's path is half-migrated with fourteen undefined members, and
 * decision 8 settled that it is REBUILT from the linked-operation rules instead. This is those
 * rules as logic; the viewer is separate, and the propagation slices are separate again.
 *
 * THE CLASS INVARIANT IS THE NAME, NOT THE NUMBER, and that is the whole subtlety of this file.
 * RULE-092's recorded answer works it out in full, and the short version is: decision 6 keeps class
 * ids PER IMAGE, so id 3 in one file and id 3 in another are not the same class — each file carries
 * its own alias table, and "car" can be 1 in one and 2 in the next. Copying the numeric id across a
 * linked pair therefore guarantees nothing: it produces matching numbers that mean different
 * things, which is WORSE than a visible mismatch because every export then looks consistent.
 *
 * So a linked operation resolves the active class to its ALIAS, and in each image independently
 * uses the id that alias already has there, or allocates that image's next free id and records the
 * alias against it. Both images name the object the same thing — which is what a user means by
 * "the same class" — and each file stays internally consistent with decision 6.
 *
 * Where the active class has NO alias, the id is the name: legacy writes `str(class_id)`, so the
 * two images must share the number in that case, and allocating a different one would be the same
 * bug wearing different clothes.
 *
 * WHAT LEGACY DID, AND WHY IT IS NOT REPRODUCED. Polygons shared one class id while boxes, circles
 * and accepted AI masks each took their own viewer's active or next id — three behaviours for one
 * question, depending on which tool drew the shape, with no rationale anywhere in the code. A rule
 * that behaves three ways is exactly what "rebuild from the rules" is for.
 */

/** A class as a user means it: a name, or a bare id when it has never been named. */
export interface ClassIdentity {
  /** The alias, or null when this class has no name in the source image. */
  readonly alias: string | null;
  /** The id it has in the image the operation started from. */
  readonly sourceId: number;
}

export interface Assignment {
  readonly classId: number;
  /** The alias to record against it, or null when nothing needs writing. */
  readonly alias: string | null;
  /** True when this image had to allocate a new id for the class. */
  readonly allocated: boolean;
}

/**
 * The id a linked operation should use in one image, given what that image already knows.
 *
 * `aliases` is that image's own table, id to name. `usedIds` is every id already present in it,
 * which is what "next free" is measured against — not the alias table, because a class can have
 * annotations and no name.
 */
export function resolveClass(
  identity: ClassIdentity,
  aliases: Readonly<Record<string, string>>,
  usedIds: Iterable<number>,
): Assignment {
  const present = new Set(usedIds);

  // No alias means the id IS the name, so the two images must share the number. Recorded as not
  // allocated even when the id is new here: nothing was chosen, it was carried.
  if (identity.alias === null || identity.alias === "") {
    return { classId: identity.sourceId, alias: null, allocated: false };
  }

  for (const [id, name] of Object.entries(aliases)) {
    if (name === identity.alias) {
      // Already known here under this name. Nothing to write, and the id may well differ from the
      // source image's — which is correct and is the point.
      return { classId: Number(id), alias: null, allocated: false };
    }
  }

  return { classId: nextFreeId(present, aliases), alias: identity.alias, allocated: true };
}

/**
 * The next id this image can use — RULE-011's rule, applied per image.
 *
 * Highest present plus one, counting BOTH annotated ids and named-but-unannotated ones. Taking
 * only the annotated ones would hand out an id that already has a name attached, and the new
 * object would silently inherit it.
 */
export function nextFreeId(
  usedIds: ReadonlySet<number>,
  aliases: Readonly<Record<string, string>> = {},
): number {
  let highest = -1;
  for (const id of usedIds) if (id > highest) highest = id;
  for (const key of Object.keys(aliases)) {
    const id = Number(key);
    if (Number.isInteger(id) && id > highest) highest = id;
  }
  return highest + 1;
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export type Mirrored =
  | { readonly kind: "point"; readonly x: number; readonly y: number }
  | { readonly kind: "outside"; readonly reason: string };

/**
 * Where a linked click lands in the other image — the first of decision 8's four gaps.
 *
 * THE SAME PIXEL, NOT THE SAME RELATIVE POSITION, and this is a decision rather than a lookup:
 * RULE-092 says linked operations apply "at the same coordinates" and is silent on size, because
 * in legacy each viewer kept its own point list and the question never had to be answered.
 *
 * Same pixel, because of what a split view is FOR: two images of one subject — a stereo pair, two
 * channels of one acquisition, a before and an after. A relative mapping would stretch a drawn
 * shape whenever the sizes differed, which is precisely when a user is least likely to notice.
 *
 * A point outside the other image is REPORTED rather than clamped. Clamping puts a vertex on an
 * edge the user did not click and makes a mirrored polygon quietly the wrong shape; the caller
 * can then refuse the operation, or perform it in one viewer and say so.
 */
export function mirror(
  point: { readonly x: number; readonly y: number },
  target: ImageSize,
): Mirrored {
  if (point.x < 0 || point.y < 0 || point.x >= target.width || point.y >= target.height) {
    return {
      kind: "outside",
      reason:
        `(${Math.round(point.x)}, ${Math.round(point.y)}) is outside the other image `
        + `(${target.width}x${target.height})`,
    };
  }
  return { kind: "point", x: point.x, y: point.y };
}

export type MirroredShape =
  | { readonly kind: "shape"; readonly vertices: readonly (readonly [number, number])[] }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * A whole shape mirrored, refused as a unit if any vertex falls outside.
 *
 * All or nothing, because a polygon missing one vertex is a DIFFERENT polygon rather than a
 * partial one — and a linked operation that silently produced a different shape in the second
 * image is the failure this whole file exists to avoid.
 */
export function mirrorShape(
  vertices: readonly (readonly [number, number])[],
  target: ImageSize,
): MirroredShape {
  const out: (readonly [number, number])[] = [];

  for (const [x, y] of vertices) {
    const at = mirror({ x, y }, target);
    // The first vertex outside says the shape does not fit; it is not said twice.
    if (at.kind === "outside") return { kind: "refused", reason: at.reason };
    out.push([at.x, at.y]);
  }

  return { kind: "shape", vertices: out };
}

/**
 * Whether two images can be linked at all.
 *
 * Different sizes do NOT prevent it — the smaller image simply refuses the operations that fall
 * outside it, which the user sees per operation rather than as a blanket "these cannot be paired".
 * A user comparing a full frame with a crop of it has a real reason to pair them.
 *
 * One line, the sizes. It went on to explain that linked operations use the same pixel in both, so
 * anything drawn outside the smaller image is refused for that viewer rather than moved, until the
 * owner asked for no paragraphs (2026-09-26); each refusal still says so when it happens.
 */
export function describePair(left: ImageSize, right: ImageSize): string | null {
  if (left.width === right.width && left.height === right.height) return null;
  return `Different sizes: ${left.width}x${left.height} and ${right.width}x${right.height}`;
}
