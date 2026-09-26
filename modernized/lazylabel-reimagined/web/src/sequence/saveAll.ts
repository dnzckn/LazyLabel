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

import type { WireMask, WireSegment } from "@lazylabel/contracts";

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
 * A frame's propagated results as segments — what a save writes AND what RULE-090 shows.
 *
 * One function for both, deliberately. If the review path built these differently from the save
 * path, a user could accept a mask on screen and have a different one written to disk, and nothing
 * would say so.
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
