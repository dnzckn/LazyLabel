/**
 * Propagate, watch, stop — C11's control, and the first thing in the browser to reach the job API.
 *
 * Its own component rather than a block inside `TimelinePanel` for a reason that is not tidiness:
 * the panel renders whether or not this deployment has an inference service, and a hook cannot be
 * called conditionally. Keeping the hook here means "no client" is answered by not rendering the
 * control at all — which is also the honest answer. A button that replies 503 teaches a user the
 * feature is unreliable; no button says plainly that this deployment has no model.
 *
 * WHAT IT REFUSES TO DO is start without a reference. Legacy will: with nothing to carry from it
 * runs the whole sequence and writes an empty mask over every frame, which is worse than doing
 * nothing because it looks like work.
 *
 * CANCEL IS NOT A COSMETIC STOP. RULE-063: the frames already finished are kept, and the service
 * says so in the sentence this shows. The button reports "Stopping…" while the frame in flight
 * finishes, because that is what is happening and a control that jumped straight to "stopped"
 * would be lying for the half second it takes.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { ApiClient } from "../api/client.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";

import { usePropagation } from "./usePropagation.js";
import { referenceMasks } from "./references.js";
import type { Frame } from "./timeline.js";

export interface PropagationControlProps {
  readonly client: ApiClient;
  readonly projectId?: string;
  /** The timeline, in its own order. Frame positions in the request are indices into this. */
  readonly frames: readonly Frame[];
  /** Confidences as they arrive, so the timeline can colour itself while the job runs. */
  readonly onScores?: (scores: Readonly<Record<number, number>>) => void;
}

export function PropagationControl({
  client,
  frames,
  onScores,
  projectId = "default",
}: PropagationControlProps): ReactNode {
  const { settings } = useSettings();
  const { progress, start, cancel, reset } = usePropagation(client);
  /** What could not become a seed, and why. Reported rather than dropped. */
  const [unusable, setUnusable] = useState<readonly { key: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const references = frames
    .map((frame, index) => (frame.isReference ? index : -1))
    .filter((index) => index >= 0);

  const begin = useCallback(async () => {
    if (references.length === 0 || progress.running || loading) return;

    /*
     * The reference MASKS are loaded before anything starts. They are the user's own annotations,
     * and the service seeds SAM 2 with them rather than with prompts re-derived from them --
     * re-clicking an object someone already drew gives a mask close to theirs and not theirs.
     */
    setLoading(true);
    let seeds;
    try {
      seeds = await referenceMasks(
        client,
        projectId,
        references.map((index) => ({ position: index, key: frames[index]!.key })),
      );
    } finally {
      setLoading(false);
    }

    setUnusable(seeds.skipped);
    if (seeds.objects.length === 0) {
      // Every reference failed. Starting anyway is what legacy does, and it writes an empty mask
      // over every frame in the sequence -- work that looks like work and undoes the user's.
      return;
    }

    /*
     * `stream_window_size` — RULE-026, and until this call the one setting in the schema that
     * nothing read. Sent rather than defaulted here: the service decides whether streaming even
     * applies, since only it knows the sequence length it ends up with.
     */
    const window = Number(settings.values["stream_window_size"] ?? 250);

    await start({
      sequence: frames.map((frame) => frame.key),
      references,
      objects: seeds.objects,
      ...(Number.isFinite(window) && window > 0 ? { window } : {}),
    });
  }, [client, frames, loading, progress.running, projectId, references, settings.values, start]);

  useHotkey("propagate", () => void begin());

  /*
   * Push scores up as they arrive rather than at the end: a 600-frame propagation runs for minutes
   * and a timeline that stayed grey until it finished would waste every one of them.
   *
   * In an EFFECT, not during render. Calling a parent's setter while rendering is a state update
   * inside another component's render, which React warns about and which can loop.
   */
  const scores = progress.scores;
  useEffect(() => {
    onScores?.(scores);
  }, [onScores, scores]);

  const job = progress.job;
  const done = job !== null && !progress.running;

  return (
    <div className="timeline__propagation">
      <div className="timeline__propagation-actions">
        <button
          type="button"
          onClick={() => void begin()}
          disabled={references.length === 0 || progress.running || loading}
          title={
            references.length === 0
              ? "Mark at least one frame as a reference first"
              : "Carry the reference masks through the sequence"
          }
        >
          {loading ? "Reading references…" : "Propagate"}
        </button>

        {progress.running && (
          <button type="button" onClick={() => void cancel()} disabled={job?.cancelling === true}>
            {job?.cancelling === true ? "Stopping…" : "Cancel"}
          </button>
        )}

        {done && (
          <button type="button" onClick={reset}>
            Clear
          </button>
        )}
      </div>

      {references.length === 0 && (
        <p className="timeline__propagation-hint">
          Nothing to carry from yet — mark a frame as a reference.
        </p>
      )}

      {job !== null && (
        <p className="timeline__propagation-state" role="status">
          {progress.running
            ? `Propagating — ${job.completed}${job.total === null ? "" : ` of ${job.total}`} frames`
            : summaryOf(job.state, job.completed)}
          {/* The service's own sentence, which for a cancel is the promise that work was kept. */}
          {job.error !== null && job.state !== "failed" && ` — ${job.error}`}
        </p>
      )}

      {progress.error !== null && (
        <p className="timeline__propagation-error" role="alert">
          {progress.error}
        </p>
      )}

      {unusable.length > 0 && (
        // Never silently dropped: a propagation that seeded from three of five references would
        // produce a plausible result that is not the one the user asked for, and nothing on screen
        // would say so.
        <ul className="timeline__propagation-skipped">
          {unusable.map((each) => (
            <li key={`${each.key}:${each.reason}`}>
              {each.key} could not seed: {each.reason}
            </li>
          ))}
        </ul>
      )}

      {progress.empty.length > 0 && (
        // RULE-060: a frame where every object came out empty is never committed and keeps its
        // previous status. Saying so is the difference between "the model lost the object here"
        // and "this frame scored badly", which look identical on a grey timeline.
        <p className="timeline__propagation-empty">
          {progress.empty.length} frame{progress.empty.length === 1 ? "" : "s"} produced no mask at
          all and were not committed.
        </p>
      )}
    </div>
  );
}

function summaryOf(state: string, completed: number): string {
  if (state === "cancelled") return `Stopped after ${completed} frames`;
  if (state === "failed") return `Failed after ${completed} frames`;
  return `Propagated ${completed} frames`;
}
