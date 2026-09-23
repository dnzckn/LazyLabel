/**
 * Driving a propagation from the browser — the last link in C11's chain.
 *
 * The algorithm, the window arithmetic, the job API and the API proxy were all built and tested
 * before this existed, and every one of them was reachable by nothing. That is the defect this
 * project has found fourteen times: a function that works, a test that proves it works, and no
 * caller. So this hook ships in the same commit as the control that uses it.
 *
 * THE POLL IS A CURSOR, not a refetch. The job hands back only the results produced since the
 * cursor it was given, so a long propagation is not re-sent on every tick and a client that
 * reconnects does not lose what it already has. When a client falls further behind than the
 * service's buffer it gets a 410 saying which cursor is the earliest still held — that is
 * reported, never papered over, because silently resuming from a later frame would leave a gap in
 * the results that nothing downstream could see.
 *
 * CONFIDENCE IS COMBINED PER FRAME, not per object. RULE-016 scores each propagated object;
 * RULE-060 flags a FRAME, on the minimum over the objects that produced a non-empty mask. An
 * object that came out empty is dropped from that minimum rather than counted as zero, and a frame
 * where every object came out empty has no confidence at all — which is not the same as zero and
 * must not be flattened into it.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ApiClient,
  WirePropagationFrame,
  WirePropagationJob,
  WirePropagationStart,
} from "../api/client.js";

import { scoreOf } from "./commit.js";
import { frameConfidence, type ObjectScore } from "./confidence.js";

/** How often to ask while a job is running. */
export const POLL_MS = 400;

export interface PropagationProgress {
  readonly job: WirePropagationJob | null;
  /**
   * The masks themselves, BY IMAGE KEY — what Save All writes and what a frame shows.
   *
   * By key rather than by position, which is RULE-017's principle applied to this store: a
   * position is a name for wherever a frame currently sits, and RULE-077's Trim moves every
   * position after the cut. Keyed by position, a trim would silently re-attribute every mask to
   * the wrong picture -- the exact failure RULE-017 records of legacy's staging. The results
   * already carry their source key, so there is nothing to look up.
   *
   * Kept rather than discarded once the confidence is read, because a propagation whose results
   * cannot be saved is half a feature: the timeline colours itself and the work evaporates on
   * reload. They are held in the bounded form they arrived in, which is what the memory NFR asks
   * for — a full-image plane per object would be gigabytes on a long sequence.
   */
  readonly masks: ReadonlyMap<string, readonly WirePropagationFrame[]>;
  /** Per-frame confidence by the frame's position in the sequence, for the timeline. */
  readonly scores: Readonly<Record<number, number>>;
  /** Frames where every object came out empty — RULE-060 never commits these. */
  readonly empty: readonly number[];
  /** Why it stopped, when it stopped badly. Null while running or after a clean finish. */
  readonly error: string | null;
  readonly running: boolean;
}

const IDLE: PropagationProgress = {
  job: null,
  masks: new Map(),
  scores: {},
  empty: [],
  error: null,
  running: false,
};

/**
 * Fold the results seen so far into a confidence per frame.
 *
 * Kept as raw objects per frame rather than a running minimum, because a later result for a frame
 * already scored has to be able to LOWER it, and a running minimum that has already dropped the
 * empties cannot tell an empty object from an absent one.
 */
function combine(
  byFrame: Map<number, ObjectScore[]>,
): { scores: Record<number, number>; empty: number[] } {
  const scores: Record<number, number> = {};
  const empty: number[] = [];

  for (const [index, objects] of byFrame) {
    const confidence = frameConfidence(objects);
    if (confidence === null) empty.push(index);
    else scores[index] = confidence;
  }
  return { scores, empty: empty.sort((a, b) => a - b) };
}

export interface UsePropagation {
  readonly progress: PropagationProgress;
  readonly start: (request: WirePropagationStart) => Promise<void>;
  readonly cancel: () => Promise<void>;
  /** Forget a finished job, so the panel returns to its idle state. */
  readonly reset: () => void;
}

export function usePropagation(client: ApiClient): UsePropagation {
  const [progress, setProgress] = useState<PropagationProgress>(IDLE);

  /*
   * Refs, not state, for everything the POLL LOOP reads. The loop is an effect keyed on the job
   * id: if it also depended on the cursor it would tear down and rebuild its timer on every tick,
   * and a poll that restarts its own schedule drifts.
   */
  const cursor = useRef(0);
  const byFrame = useRef(new Map<number, ObjectScore[]>());
  const maskFrames = useRef(new Map<string, WirePropagationFrame[]>());
  const position = useRef(new Map<string, number>());
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const absorb = useCallback((job: WirePropagationJob) => {
    for (const result of job.results) {
      const index = position.current.get(result.source);
      if (index === undefined) continue; // a frame not in the sequence we asked about
      const objects = byFrame.current.get(index) ?? [];
      objects.push(scoreOf(result));
      byFrame.current.set(index, objects);

      const held = maskFrames.current.get(result.source) ?? [];
      held.push(result);
      maskFrames.current.set(result.source, held);
    }
    cursor.current = job.cursor;

    const { scores, empty } = combine(byFrame.current);
    setProgress({
      job,
      scores,
      empty,
      // A new Map each time, so React sees the change. Mutating the ref in place and passing the
      // same reference would leave a Save All button that never notices it has work to do.
      masks: new Map(maskFrames.current),
      // A cancelled job's `error` is the sentence saying what it KEPT, which is not a failure.
      error: job.state === "failed" ? (job.error ?? "the propagation failed") : null,
      running: job.state === "running",
    });
  }, []);

  const start = useCallback(
    async (request: WirePropagationStart) => {
      cursor.current = 0;
      byFrame.current = new Map();
      maskFrames.current = new Map();
      position.current = new Map(request.sequence.map((key, index) => [key, index]));

      try {
        absorb(await client.startPropagation(request));
      } catch (cause) {
        setProgress({ ...IDLE, error: messageOf(cause) });
      }
    },
    [absorb, client],
  );

  const cancel = useCallback(async () => {
    const id = progress.job?.id;
    if (id === undefined) return;
    try {
      /*
       * The cancel answer is a SNAPSHOT: the job's state, no results, and the job's LATEST cursor.
       * Absorbing it moved this cursor past frames the browser had never been sent -- a real run on
       * 2026-09-23 kept 42 frames and the timeline showed 39 -- which is exactly the hole the poll
       * below refuses to leave. So only the state is taken from it. While the job is stopping, the
       * poll carries on from the cursor this browser actually holds; if it has already stopped,
       * one last poll from there collects what was committed since.
       */
      const snapshot = await client.cancelPropagation(id);
      setProgress((previous) => ({
        ...previous,
        job: { ...snapshot, cursor: cursor.current, results: [] },
        error: snapshot.state === "failed" ? (snapshot.error ?? "the propagation failed") : null,
        running: snapshot.state === "running",
      }));
      if (snapshot.state !== "running") absorb(await client.propagationState(id, cursor.current));
    } catch (cause) {
      setProgress((previous) => ({ ...previous, error: messageOf(cause) }));
    }
  }, [absorb, client, progress.job?.id]);

  const reset = useCallback(() => {
    byFrame.current = new Map();
    maskFrames.current = new Map();
    cursor.current = 0;
    setProgress(IDLE);
  }, []);

  const jobId = progress.job?.id ?? null;
  const running = progress.running;

  useEffect(() => {
    if (jobId === null || !running) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (): Promise<void> => {
      try {
        const job = await client.propagationState(jobId, cursor.current);
        if (!live.current) return;
        absorb(job);
        if (job.state === "running") timer = setTimeout(() => void tick(), POLL_MS);
      } catch (cause) {
        if (!live.current) return;
        // Includes the 410 for results that fell out of the buffer. Reported rather than skipped:
        // resuming from a later cursor would leave a hole nothing downstream could detect.
        setProgress((previous) => ({ ...previous, error: messageOf(cause), running: false }));
      }
    };

    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [absorb, client, jobId, running]);

  return { progress, start, cancel, reset };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
