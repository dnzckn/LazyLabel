/**
 * Writing a propagation's results to disk — RULE-060's last clause.
 *
 * "Save All never writes a flagged frame", including the ones Keep Flagged Masks held on to. Those
 * masks are for REVIEW: writing them would put the model's unsure guesses on disk under the user's
 * name, which is the one thing a labelling tool must not do quietly. `saveableFrames` is the rule;
 * this is what acts on it, and it was the last function in this app that nothing called.
 *
 * WHAT A PROPAGATED SEGMENT IS. SAM 2 tracks an OBJECT and has no idea what that object is. The
 * class comes from the annotation that seeded it, carried here by object id — a propagated mask
 * saved without one lands on disk as an unclassified shape, which RULE-012 cannot order and no
 * exporter can name.
 *
 * A REFERENCE FRAME IS NOT REWRITTEN. It is the user's own work and it is already on disk; the
 * propagation produced a seed result for it, and writing that back would replace what someone drew
 * with the model's reconstruction of it. `saveableFrames` includes references because they count
 * as finished, and this skips them because they are already saved.
 *
 * EVERY FAILURE IS REPORTED PER FRAME. A Save All over 600 frames that stopped at the first
 * conflict would leave the user with no idea which half had been written, and one that swallowed
 * failures would be worse.
 */

import { createFinalMaskTensor, type Segment } from "@lazylabel/annotation-formats";
import {
  decodeSegment,
  encodeMask,
  type WireMask,
  type WireSaveRequest,
  type WireSegment,
} from "@lazylabel/contracts";

import type { ApiClient, WirePropagationFrame } from "../api/client.js";
import { saveableFrames } from "./confidence.js";
import type { Frame } from "./timeline.js";

export interface SaveAllRequest {
  readonly client: ApiClient;
  readonly projectId: string;
  readonly frames: readonly Frame[];
  /** Propagated results by IMAGE KEY — see the note on `PropagationProgress.masks`. */
  readonly masks: ReadonlyMap<string, readonly WirePropagationFrame[]>;
  /** Why a frame is held back, when only the commit knows -- see `plannedSave`. */
  readonly known?: ReadonlyMap<string, string>;
  /** Object id to class id, from the annotations that seeded the run. */
  readonly classes: Readonly<Record<number, number | null>>;
  /** Class id to name, as the open image named them at Propagate: see `ReferenceMasks.aliases`. */
  readonly aliases: Readonly<Record<string, string>>;
  readonly formats: readonly string[];
  /** RULE-012's two settings, as the Enter path sends them: which class keeps a shared pixel. */
  readonly pixelPriority: NonNullable<WireSaveRequest["pixelPriority"]>;
  /** Called after each frame so a long save can show progress rather than appearing to hang. */
  readonly onProgress?: (done: number, total: number) => void;
}

export interface SaveAllResult {
  readonly written: readonly string[];
  /** Frames RULE-060 will not write, and why. Not failures — decisions. */
  readonly withheld: readonly { readonly key: string; readonly reason: string }[];
  readonly failed: readonly { readonly key: string; readonly reason: string }[];
}

/** One propagated object as a segment the save API understands. */
function segmentOf(
  result: WirePropagationFrame,
  classes: Readonly<Record<number, number | null>>,
): WireSegment | null {
  const mask = result.mask as WireMask;
  // A result with no box covered no pixels. RULE-060 never commits one, and writing an empty
  // segment would put a shape with no area into a file that then reads as an annotation.
  if (mask?.box == null) return null;
  return {
    type: "AI",
    classId: classes[result.objectId] ?? null,
    mask,
  };
}

/**
 * Which frames this save will write, and which RULE-060 holds back, without writing anything.
 *
 * `known` carries the reasons only the commit knows, by image key: that Skip Labeled kept a frame's
 * own labels, or that Keep Flagged Masks was off when the frame was flagged and its masks went.
 * Without them both would read "it is skipped" or "the propagation produced nothing for it", and
 * the second is false -- it produced masks, and they were discarded on purpose.
 */
export function plannedSave(
  frames: readonly Frame[],
  masks: ReadonlyMap<string, readonly WirePropagationFrame[]>,
  known: ReadonlyMap<string, string> = new Map(),
): { writable: readonly Frame[]; withheld: readonly { key: string; reason: string }[] } {
  const saveable = new Set(saveableFrames(frames).map((frame) => frame.index));
  const writable: Frame[] = [];
  const withheld: { key: string; reason: string }[] = [];

  for (const frame of frames) {
    if (frame.isReference) {
      // Already on disk, and it is the user's own drawing. Writing the propagation's seed result
      // back would replace what someone drew with the model's reconstruction of it.
      continue;
    }
    if (!saveable.has(frame.index)) {
      withheld.push({
        key: frame.key,
        reason:
          frame.state === "flagged"
            ? "it is flagged for review, and Save All never writes a flagged frame"
            : (known.get(frame.key) ?? `it is ${frame.state}`),
      });
      continue;
    }
    if ((masks.get(frame.key) ?? []).length === 0) {
      withheld.push({
        key: frame.key,
        reason: known.get(frame.key) ?? "the propagation produced nothing for it",
      });
      continue;
    }
    writable.push(frame);
  }

  return { writable, withheld };
}

/**
 * A frame's propagated results as segments, one per object — what Save All writes AND, merged by
 * `mergedByClass`, what RULE-090 shows.
 *
 * One function for both, deliberately. If the review path built these differently from the save
 * path, a user could accept a mask on screen and have different pixels written to disk, and
 * nothing would say so. The merge moves no pixel from one class to another.
 */
export function segmentsFor(
  results: readonly WirePropagationFrame[],
  classes: Readonly<Record<number, number | null>>,
): readonly WireSegment[] {
  return results
    .map((result) => segmentOf(result, classes))
    .filter((segment): segment is WireSegment => segment !== null);
}

/**
 * What a VISITED propagated frame shows: one "Loaded" segment per class, the union of its objects.
 *
 * Legacy merges them when it opens the frame (`main_window.py:3597-3606`,
 * `segment_manager.py:97-172`), so the file its leaving save writes has one segment per class, and
 * two touching objects of one class export as one box. Opened unmerged, the frame showed, and Enter
 * wrote, a segment per object (`SEQUENCE_PARITY.md` SP-07). Save All merges nothing, in either app
 * (`main_window.py:4776-4807`).
 *
 * The union is `createFinalMaskTensor`'s, one class at a time -- the save's per-class OR, which
 * legacy's docstring likens its merge to. As legacy's merge does, it takes the size from the first
 * mask, leaves out a mask of another size, drops an empty union, orders the classes by id, and
 * merges nothing with no mask or no class. One difference: a segment with no class is kept, where
 * legacy drops it. Legacy never has one here, since it gives a propagated object class 0 when it
 * knows no other (`main_window.py:3711-3724`), and no format writes one.
 */
export function mergedByClass(segments: readonly WireSegment[]): readonly WireSegment[] {
  const size = segments.find((segment) => segment.mask !== undefined)?.mask;
  const classes = [
    ...new Set(segments.flatMap((segment) => (segment.classId === null ? [] : [segment.classId]))),
  ].sort((a, b) => a - b);
  if (size === undefined || classes.length === 0) return segments;
  const { height, width } = size;

  const merged: WireSegment[] = [];
  for (const classId of classes) {
    const members = segments
      .filter((segment) => segment.classId === classId)
      .flatMap((segment) => decodedAt(segment, height, width));
    const union = createFinalMaskTensor(members, [height, width], [classId]).data;
    const mask = encodeMask({ height, width, data: union });
    if (mask.box !== null) merged.push({ type: "Loaded", classId, mask });
  }
  return [...merged, ...segments.filter((segment) => segment.classId === null)];
}

/** One segment decoded for the union, or none when its mask is another size or cannot be read. */
function decodedAt(segment: WireSegment, height: number, width: number): Segment[] {
  if (segment.mask !== undefined && (segment.mask.height !== height || segment.mask.width !== width)) {
    return [];
  }
  try {
    return [decodeSegment(segment)];
  } catch {
    return []; // not drawn by the canvas either
  }
}

/**
 * The names a frame's file gives its classes: each class it writes that the run has a name for,
 * and no other.
 *
 * Legacy's Save All clears its segment manager for each frame and names only the classes it then
 * adds, each under its reference's name (`main_window.py:4776, 4787-4799`); the exporters write
 * those names into the NPZ and label COCO, VOC and CreateML with them
 * (`save_export_manager.py:400-403, 424`). Sent none, every class was written as its bare id
 * (`SEQUENCE_PARITY.md` SP-05). A class with no name stays its id, never "Class N" (RULE-082).
 */
function aliasesFor(
  segments: readonly WireSegment[],
  aliases: Readonly<Record<string, string>>,
): Record<string, string> {
  const named: Record<string, string> = {};
  for (const { classId } of segments) {
    const name = classId === null ? undefined : aliases[String(classId)];
    if (name !== undefined) named[String(classId)] = name;
  }
  return named;
}

export async function saveAll(request: SaveAllRequest): Promise<SaveAllResult> {
  const { writable, withheld } = plannedSave(request.frames, request.masks, request.known);
  const written: string[] = [];
  const failed: { key: string; reason: string }[] = [];

  for (const [done, frame] of writable.entries()) {
    const results = request.masks.get(frame.key) ?? [];
    const segments = segmentsFor(results, request.classes);

    if (segments.length === 0) {
      failed.push({ key: frame.key, reason: "every propagated mask for it was empty" });
      request.onProgress?.(done + 1, writable.length);
      continue;
    }

    const size = results[0]?.mask;
    try {
      await request.client.saveAnnotations(request.projectId, frame.key, {
        imageSize: [size?.height ?? 0, size?.width ?? 0],
        formats: request.formats,
        segments,
        classAliases: aliasesFor(segments, request.aliases),
        // Legacy's Save All is its ordinary save (`main_window.py:4813`), which gives a pixel two
        // classes share to one of them by the pixel-priority settings
        // (`save_export_manager.py:405-410`). Sent none, the API took it as off, so with it on
        // the pixel was still written to both classes (`SEQUENCE_PARITY.md` SP-06). The API
        // applies it to the mask tensor every format is built from, as for the Enter path's save.
        pixelPriority: request.pixelPriority,
      });
      written.push(frame.key);
    } catch (cause) {
      // Recorded and carried on. Stopping at the first conflict over 600 frames would leave the
      // user with no idea which half had been written.
      failed.push({ key: frame.key, reason: cause instanceof Error ? cause.message : String(cause) });
    }
    request.onProgress?.(done + 1, writable.length);
  }

  return { written, withheld, failed };
}
