/**
 * Turning the user's own annotations into propagation seeds.
 *
 * A reference frame is a frame the user has already annotated, and what SAM 2 needs from it is a
 * MASK — legacy seeds with `add_new_mask`, not with clicks. Re-deriving a prompt from someone's
 * polygon and clicking it again would give a mask close to theirs and not theirs.
 *
 * RASTERIZED THE WAY EXPORT RASTERIZES. `rasterizeSegment` is the same function the eraser and the
 * exporters use, which matters more than it sounds: if the seed were rasterized differently from
 * the saved file, the propagation would start from a shape the user has never seen and cannot
 * produce again.
 *
 * OBJECT IDS ARE A RUNNING COUNTER, one per annotation across every reference frame, which is
 * exactly what legacy does (`propagation_manager.py:410-412`: `max(existing_ids, default=0) + 1`).
 * The consequence is worth stating because it looks like a bug and is the behaviour: two
 * annotations of what a person would call the same object, on two different reference frames, are
 * TWO tracked objects rather than one object refined twice. Legacy makes no attempt to match them
 * and neither does this — Phase 6 compares the results.
 */

import { encodeMask, type WireMask, type WireSegment } from "@lazylabel/contracts";
import { rasterizeSegment, type BinaryMask } from "@lazylabel/annotation-formats";

import type { ApiClient } from "../api/client.js";

export interface PropagationReference {
  readonly frame: number;
  readonly objectId: number;
  readonly mask: WireMask;
}

export interface ReferenceMasks {
  readonly objects: readonly PropagationReference[];
  /** Frames and annotations that could not become a seed, with why. Never silently dropped. */
  readonly skipped: readonly { readonly key: string; readonly reason: string }[];
  /**
   * Which class each tracked object belongs to, by object id.
   *
   * KEPT HERE because the service never learns it and must not: SAM 2 tracks an object, and what
   * that object IS is the user's decision, carried from the annotation that seeded it. A
   * propagated mask saved without it would land on disk as an unclassified shape -- which
   * RULE-012 then cannot order and no exporter can name.
   */
  readonly classes: Readonly<Record<number, number | null>>;
}

/** One annotation's pixels, rasterized the way the exporters rasterize it. */
function maskOf(
  segment: WireSegment,
  size: { readonly width: number; readonly height: number },
): BinaryMask | null {
  if (segment.type === "Polygon" || segment.type === "Circle") {
    if (segment.vertices === undefined) return null;
    return rasterizeSegment(
      { type: segment.type, classId: segment.classId, vertices: segment.vertices },
      size.height,
      size.width,
    );
  }
  if (segment.mask?.box == null) return null;

  // Already a mask: expanded to full-image so every seed is the same shape, which is what
  // `encodeMask` then bounds again. Going straight through would be faster and would make the
  // two paths differ in how an empty region is treated.
  const [x0, y0, x1, y1] = segment.mask.box;
  const regionWidth = x1 - x0;
  const data = new Uint8Array(size.width * size.height);
  let region: Uint8Array;
  try {
    region = Uint8Array.from(atob(segment.mask.data), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (region.length !== regionWidth * (y1 - y0)) return null;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (region[(y - y0) * regionWidth + (x - x0)] !== 0) data[y * size.width + x] = 1;
    }
  }
  return { height: size.height, width: size.width, data };
}

/**
 * Load every reference frame's annotations and encode them as seeds.
 *
 * A frame that cannot be read, has no annotations, or whose annotations cannot be rasterized is
 * REPORTED rather than dropped. A propagation that quietly seeded from three of five references
 * would produce a plausible result that is not the one the user asked for, and nothing on screen
 * would say so.
 */
export async function referenceMasks(
  client: ApiClient,
  projectId: string,
  frames: readonly { readonly position: number; readonly key: string }[],
): Promise<ReferenceMasks> {
  const objects: PropagationReference[] = [];
  const skipped: { key: string; reason: string }[] = [];
  const classes: Record<number, number | null> = {};
  // Legacy's `max(existing_ids, default=0) + 1`, which for a list built in order is a counter.
  let nextObjectId = 1;

  for (const frame of frames) {
    let size: { width: number; height: number };
    try {
      const metadata = await client.imageMetadata(projectId, frame.key);
      size = { width: metadata.width, height: metadata.height };
    } catch (cause) {
      skipped.push({ key: frame.key, reason: reasonOf(cause) });
      continue;
    }

    let segments: readonly WireSegment[];
    try {
      const loaded = await client.loadAnnotations(projectId, frame.key, [size.height, size.width]);
      segments = loaded.kind === "loaded" ? loaded.annotations.segments : [];
    } catch (cause) {
      skipped.push({ key: frame.key, reason: reasonOf(cause) });
      continue;
    }

    if (segments.length === 0) {
      // A reference with nothing on it cannot seed anything, and SAM 2 does not say so: it carries
      // nothing through the sequence, which looks exactly like a model that lost the object.
      skipped.push({ key: frame.key, reason: "it has no annotations to carry" });
      continue;
    }

    for (const segment of segments) {
      const mask = maskOf(segment, size);
      if (mask === null || !mask.data.some((value) => value !== 0)) {
        skipped.push({ key: frame.key, reason: `a ${segment.type} produced no pixels` });
        continue;
      }
      objects.push({
        frame: frame.position,
        objectId: nextObjectId,
        mask: encodeMask(mask),
      });
      classes[nextObjectId] = segment.classId;
      nextObjectId += 1;
    }
  }

  return { objects, skipped, classes };
}

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
