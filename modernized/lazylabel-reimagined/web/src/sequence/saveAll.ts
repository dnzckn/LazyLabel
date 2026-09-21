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
  /** Object id to class id, from the annotations that seeded the run. */
  readonly classes: Readonly<Record<number, number | null>>;
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

/** Which frames this save will write, and which RULE-060 holds back, without writing anything. */
export function plannedSave(
  frames: readonly Frame[],
  masks: ReadonlyMap<string, readonly WirePropagationFrame[]>,
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
            : `it is ${frame.state}`,
      });
      continue;
    }
    if ((masks.get(frame.key) ?? []).length === 0) {
      withheld.push({ key: frame.key, reason: "the propagation produced nothing for it" });
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

export async function saveAll(request: SaveAllRequest): Promise<SaveAllResult> {
  const { writable, withheld } = plannedSave(request.frames, request.masks);
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
