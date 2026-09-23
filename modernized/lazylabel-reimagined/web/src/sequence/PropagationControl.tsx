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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WireSegment } from "@lazylabel/contracts";

import type { ApiClient, WirePropagationFrame } from "../api/client.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";

import { commitFrame, type CommitPolicy, type Committed } from "./commit.js";
import { clampThreshold, DEFAULT_THRESHOLD } from "./confidence.js";
import { usePropagation } from "./usePropagation.js";
import { referenceMasks } from "./references.js";
import { plannedSave, saveAll, segmentsFor } from "./saveAll.js";
import type { Frame } from "./timeline.js";

/** The folder a dataset key sits in, as the listing API names it: "" for the dataset's root. */
function folderOf(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash < 0 ? "" : key.slice(0, slash);
}

const NO_POLICY: CommitPolicy = { keepFlagged: false, skip: new Set(), references: new Set() };

export interface PropagationControlProps {
  readonly client: ApiClient;
  readonly projectId?: string;
  /** The timeline, in its own order. Frame positions in the request are indices into this. */
  readonly frames: readonly Frame[];
  /** Confidences as they arrive, so the timeline can colour itself while the job runs. */
  readonly onScores?: (scores: Readonly<Record<number, number>>) => void;
  /**
   * How many propagated frames are not on disk yet.
   *
   * Reported UP because the control does not own the buttons that would throw them away. RULE-056
   * and RULE-058 are legacy losing exactly this work -- New Timeline, leaving the tab, or a
   * propagation finishing all discard unsaved masks without a word -- and decision 7 is the
   * standing answer: nothing is lost without the user being asked.
   */
  readonly onUnsaved?: (count: number) => void;
  /**
   * The same count, written where a CLICK HANDLER can read it without waiting for a render.
   *
   * `onUnsaved` travels up through the parent's state, which is one render behind: a user who
   * propagates and immediately clicks New timeline could slip past the confirmation and lose the
   * work it exists to protect. A ref is read at the moment the button is pressed, so there is no
   * window at all. The callback stays for anything that wants to RENDER the number.
   */
  readonly unsavedRef?: { current: number };
  /**
   * A new run is about to begin — RULE-075/076.
   *
   * Each Propagate resets what earlier runs put on the timeline, so a frame the new run does not
   * cover cannot keep a status it no longer has results for. Announced rather than done here
   * because the statuses belong to the panel.
   */
  readonly onRunStart?: () => void;
  /**
   * The propagated segments, by frame position — RULE-090.
   *
   * Handed up because opening a frame belongs to the shell, not to this control. Built here
   * because this is where the masks and the object classes both are.
   */
  readonly onSegments?: (byKey: ReadonlyMap<string, readonly WireSegment[]>) => void;
  /** Asks before a new run discards unsaved frames. Injected so a test can answer it. */
  readonly confirmDiscard?: (message: string) => boolean;
  /**
   * The frames Skip Labeled kept this run and the model produced a mask for -- legacy's brown
   * cells (RULE-081). Handed up because the timeline's colours belong to the panel.
   */
  readonly onSkipped?: (keys: ReadonlySet<string>) => void;
  /** The frames a Save All wrote, so the timeline can show them saved. */
  readonly onSaved?: (keys: readonly string[]) => void;
}

export function PropagationControl({
  client,
  frames,
  onScores,
  onUnsaved,
  unsavedRef,
  onRunStart,
  onSegments,
  confirmDiscard = (message) => window.confirm(message),
  onSkipped,
  onSaved,
  projectId = "default",
}: PropagationControlProps): ReactNode {
  const { settings } = useSettings();
  const { progress, start, cancel, reset } = usePropagation(client);
  /** What could not become a seed, and why. Reported rather than dropped. */
  const [unusable, setUnusable] = useState<readonly { key: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(false);
  // RULE-026: on by default. Off loads the whole sequence at once, which the estimate below prices.
  const [streaming, setStreaming] = useState(true);
  /*
   * RULE-060 and RULE-081, at legacy's defaults (`sequence_widget.py:333-354`): a flagged frame's
   * masks are discarded, and a frame that already has labels is left alone. Neither is persisted,
   * as legacy persists neither. Until 2026-09-23 this app had neither control: it kept every
   * flagged frame's masks, and it re-propagated and re-saved over frames written since the
   * timeline was built.
   */
  const [keepFlagged, setKeepFlagged] = useState(false);
  const [skipLabeled, setSkipLabeled] = useState(true);
  /** This run's policy, fixed when it starts, as legacy fixes its labelled set. */
  const [policy, setPolicy] = useState<CommitPolicy>(NO_POLICY);
  /** Why a run was refused before it started, when it was. */
  const [refused, setRefused] = useState<string | null>(null);
  /**
   * Each frame's commit, by image key, frozen once all its objects are in.
   *
   * Frozen because RULE-060 says so: masks Keep Flagged discarded are gone, and lowering Min Conf
   * later "cannot recover them". A ref rather than state, because it is a cache of a pure function
   * of what has arrived -- filled during render, never read before it is filled.
   */
  const committed = useRef(new Map<string, Committed>());
  /** Object id to class id, from the annotations that seeded the run. */
  const [classes, setClasses] = useState<Readonly<Record<number, number | null>>>({});
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** Frames already written. What remains is what a discard would destroy. */
  const [written, setWritten] = useState<ReadonlySet<string>>(new Set());

  const references = frames
    .map((frame, index) => (frame.isReference ? index : -1))
    .filter((index) => index >= 0);
  /** The unsaved count as of the last render, read by a click handler at the moment it runs. */
  const unsavedNow = useRef(0);

  /*
   * A new run replaces the last one's masks, and Clear drops them, so unsaved frames go either
   * way. New timeline asks before doing that (RULE-056); these two did not, until 2026-09-23 --
   * the same loss by other buttons, and decision 7 is that nothing is lost without being asked.
   * No question when nothing is unsaved: one that always appears is one people stop reading.
   */
  const mayDiscard = useCallback(
    (doing: string): boolean => {
      const count = unsavedNow.current;
      return (
        count === 0
        || confirmDiscard(
          `${count} propagated frame${count === 1 ? " has" : "s have"} not been saved. `
            + `${doing} discards them. Continue?`,
        )
      );
    },
    [confirmDiscard],
  );

  const begin = useCallback(async () => {
    if (references.length === 0 || progress.running || loading) return;
    if (!mayDiscard("Propagating again")) return;

    /*
     * The reference MASKS are loaded before anything starts. They are the user's own annotations,
     * and the service seeds SAM 2 with them rather than with prompts re-derived from them --
     * re-clicking an object someone already drew gives a mask close to theirs and not theirs.
     */
    setLoading(true);
    setRefused(null);
    let seeds;
    let labelled: ReadonlySet<string> = new Set();
    try {
      seeds = await referenceMasks(
        client,
        projectId,
        references.map((index) => ({ position: index, key: frames[index]!.key })),
      );
      if (skipLabeled) {
        /*
         * RULE-081's snapshot, taken NOW rather than when the timeline was built. The frames it
         * matters most for are the ones written since -- by an earlier Save All, or a flagged frame
         * fixed by hand -- and the listing the timeline was built from has never heard of them.
         * Legacy probes the disk at the same moment (`main_window.py:4219-4231`).
         */
        try {
          const listing = await client.listImages(projectId, folderOf(frames[0]!.key));
          labelled = new Set(
            listing.images.filter((image) => image.annotated).map((image) => image.key),
          );
        } catch (cause) {
          // Refused, not run unprotected: a run that could not see which frames have labels could
          // overwrite every one of them at the next Save All.
          setRefused(
            "Nothing was propagated: Skip Labeled could not read which frames already have labels "
              + `(${cause instanceof Error ? cause.message : String(cause)}).`,
          );
          return;
        }
      }
    } finally {
      setLoading(false);
    }

    setUnusable(seeds.skipped);
    // Before any result arrives: a frame the new run does not reach must not keep a green status
    // whose mask has just been thrown away with the previous run's.
    onRunStart?.();
    setClasses(seeds.classes);
    setSaved(null);
    // A new run's masks are new work, whatever an earlier Save All wrote. Until 2026-09-23 this set
    // was never cleared, so a frame saved once counted as saved for every later run: no Save button
    // for its new mask, and no question before anything threw that mask away.
    setWritten(new Set());
    committed.current = new Map();
    const referenceKeys = new Set(references.map((index) => frames[index]!.key));
    setPolicy({
      keepFlagged,
      // Legacy never counts a reference as labelled (`main_window.py:4222-4224`).
      skip: new Set([...labelled].filter((key) => !referenceKeys.has(key))),
      references: referenceKeys,
    });
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
      streaming,
    });
  }, [
    client,
    frames,
    keepFlagged,
    loading,
    mayDiscard,
    onRunStart,
    progress.running,
    projectId,
    references,
    settings.values,
    skipLabeled,
    start,
  ]);

  useHotkey("propagate", () => void begin());

  /*
   * Push scores up as they arrive rather than at the end: a 600-frame propagation runs for minutes
   * and a timeline that stayed grey until it finished would waste every one of them.
   *
   * In an EFFECT, not during render. Calling a parent's setter while rendering is a state update
   * inside another component's render, which React warns about and which can loop.
   */
  const threshold = clampThreshold(
    Number(settings.values["propagation_confidence_threshold"] ?? DEFAULT_THRESHOLD),
  );

  /*
   * COMMIT each frame whose objects are all in: every frame but the newest while the job runs --
   * SAM 2 finishes one frame's objects before starting the next, and the job keeps frames whole --
   * and all of them once it stops. Legacy commits at the same two moments, when the next frame
   * arrives and at finish (`main_window.py:4483-4487, 4596-4602`).
   */
  const arrived = [...progress.masks.keys()];
  for (const key of progress.running ? arrived.slice(0, -1) : arrived) {
    if (!committed.current.has(key)) {
      committed.current.set(key, commitFrame(key, progress.masks.get(key) ?? [], policy, threshold));
    }
  }

  /*
   * What the commits add up to, by the frames' CURRENT positions -- a trim moves them.
   *
   * Keyed on the frames' KEYS, not on the array: the panel hands down new frames whenever a status
   * changes, and a view rebuilt for each would hand up new review segments, which re-render the
   * panel, which hands down new frames. Only a trim or a new timeline changes the positions.
   */
  const framesKey = frames.map((frame) => frame.key).join("|");
  const view = useMemo(() => {
    const position = new Map(frames.map((frame) => [frame.key, frame.index]));
    const scores: Record<number, number> = {};
    const empty: number[] = [];
    const painted = new Set<string>();
    const kept = new Map<string, readonly WirePropagationFrame[]>();
    const known = new Map<string, string>();

    for (const [key, result] of committed.current) {
      const at = position.get(key);
      if (at === undefined) continue; // trimmed off the timeline
      if (result.kind === "scored") {
        scores[at] = result.score;
        if (result.kept.length > 0) kept.set(key, result.kept);
        else known.set(key, "its masks were discarded when it was flagged, with Keep Flagged Masks off");
      } else if (result.kind === "skipped") {
        if (result.painted) painted.add(key);
        known.set(key, "it already has labels, and Skip Labeled leaves them alone");
      } else if (result.kind === "empty") {
        empty.push(at);
      }
      // A reference contributes nothing: it is the user's own drawing, never shown or saved from
      // the run. Legacy's engine does not even report it (`propagation_manager.py:744-749`).
    }
    return { scores, empty: empty.sort((a, b) => a - b), painted, kept, known };
    // `committed` is a ref, filled just above from these same inputs, and `frames` is read only
    // for its keys and positions, which `framesKey` stands for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesKey, policy, progress.masks, progress.running, threshold]);

  // Keyed by CONTENT: `view` is rebuilt whenever the frames change, and a parent handed a new
  // object each time would re-render, hand down new frames and ask again, without end.
  const scoresKey = JSON.stringify(view.scores);
  useEffect(() => {
    onScores?.(view.scores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScores, scoresKey]);

  const paintedKey = [...view.painted].sort().join("|");
  useEffect(() => {
    onSkipped?.(view.painted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSkipped, paintedKey]);

  const job = progress.job;
  const done = job !== null && !progress.running;

  const { writable, withheld } = plannedSave(frames, view.kept, view.known);
  const unsaved = writable.filter((frame) => !written.has(frame.key));

  // Written during render, read by a click handler. The same "latest value" pattern the AI tool
  // uses for its prediction, and for the same reason: an effect would be one render too late.
  if (unsavedRef !== undefined) unsavedRef.current = unsaved.length;
  unsavedNow.current = unsaved.length;

  // The callback goes through an effect, because calling a parent's setter during render is a
  // state update inside another component's render, which React warns about and which can loop.
  useEffect(() => {
    onUnsaved?.(unsaved.length);
  }, [onUnsaved, unsaved.length]);

  // RULE-090's masks, in the shape an open needs them. Built with the same function the save uses,
  // so what a user REVIEWS on the frame is exactly what a save would write -- two derivations of
  // that would be two chances to disagree.
  const segmentsByFrame = useMemo(() => {
    const built = new Map<string, readonly WireSegment[]>();
    for (const [key, results] of view.kept) {
      const segments = segmentsFor(results, classes);
      if (segments.length > 0) built.set(key, segments);
    }
    return built;
  }, [classes, view.kept]);

  useEffect(() => {
    onSegments?.(segmentsByFrame);
  }, [onSegments, segmentsByFrame]);

  const write = useCallback(async () => {
    setSaved(null);
    setSaving({ done: 0, total: writable.length });
    try {
      const outcome = await saveAll({
        client,
        projectId,
        frames,
        masks: view.kept,
        known: view.known,
        classes,
        // Decision 7: an explicit act writes, and it writes the formats the user chose. A default
        // invented here would put files on disk in a format nobody asked for.
        formats: (settings.values["export_formats"] as string[] | undefined) ?? ["NPZ"],
        onProgress: (doneCount, total) => setSaving({ done: doneCount, total }),
      });
      setWritten((previous) => new Set([...previous, ...outcome.written]));
      onSaved?.(outcome.written);
      setSaved(
        `Saved ${outcome.written.length} frame${outcome.written.length === 1 ? "" : "s"}`
          + (outcome.failed.length > 0
            ? ` — ${outcome.failed.length} could not be written: ${outcome.failed[0]!.reason}`
            : ""),
      );
    } finally {
      setSaving(null);
    }
  }, [classes, client, frames, onSaved, projectId, settings.values, view.kept, view.known, writable.length]);

  return (
    <div className="timeline__propagation">
      <div className="timeline__propagation-actions">
        <label>
          <input
            type="checkbox"
            checked={streaming}
            onChange={(event) => setStreaming(event.currentTarget.checked)}
          />{" "}
          Streaming
        </label>
        <label title="Off (legacy's default): a frame where any object scores below Min Conf keeps no masks at all. On: its masks are kept so you can review them. Save All writes a flagged frame either way — never.">
          <input
            type="checkbox"
            checked={keepFlagged}
            onChange={(event) => setKeepFlagged(event.currentTarget.checked)}
          />{" "}
          Keep flagged masks
        </label>
        <label title="On (legacy's default): a frame that already has annotation files when you press Propagate keeps them, and Save All does not overwrite it.">
          <input
            type="checkbox"
            checked={skipLabeled}
            onChange={(event) => setSkipLabeled(event.currentTarget.checked)}
          />{" "}
          Skip labeled
        </label>
        {!streaming && frames.length > Number(settings.values["stream_window_size"] ?? 250) && (
          // RULE-026's warning: 12.6 MB a frame, all held at once without streaming. Said before
          // the run rather than discovered as an out-of-memory partway through it.
          <p role="status" className="banner banner--warning">
            Without streaming, all {frames.length} frames load at once: about{" "}
            {Math.round(frames.length * 12.6).toLocaleString()} MB.
          </p>
        )}
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

        {done && unsaved.length > 0 && (
          <button type="button" onClick={() => void write()} disabled={saving !== null}>
            {saving === null
              ? `Save ${unsaved.length} frame${unsaved.length === 1 ? "" : "s"}`
              : `Saving ${saving.done} of ${saving.total}…`}
          </button>
        )}

        {done && (
          <button
            type="button"
            onClick={() => {
              if (!mayDiscard("Clearing")) return;
              reset();
              setWritten(new Set());
            }}
            disabled={saving !== null}
          >
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

      {refused !== null && (
        <p className="timeline__propagation-error" role="alert">
          {refused}
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

      {saved !== null && (
        <p className="timeline__propagation-state" role="status">
          {saved}
        </p>
      )}

      {done && withheld.length > 0 && (
        // RULE-060's last clause, said out loud. A Save All that silently wrote fewer frames than
        // the timeline shows as finished would be indistinguishable from one that failed.
        <p className="timeline__propagation-empty">
          {withheld.length} frame{withheld.length === 1 ? "" : "s"} will not be written:{" "}
          {withheld[0]!.reason}
          {withheld.length > 1 ? ", and others" : ""}.
        </p>
      )}

      {view.empty.length > 0 && (
        // RULE-060: a frame where every object came out empty is never committed and keeps its
        // previous status. Saying so is the difference between "the model lost the object here"
        // and "this frame scored badly", which look identical on a grey timeline.
        <p className="timeline__propagation-empty">
          {view.empty.length} frame{view.empty.length === 1 ? "" : "s"} produced no mask at
          all and were not committed.
        </p>
      )}
    </div>
  );
}

function summaryOf(state: string, completed: number): string {
  const frames = `${completed} frame${completed === 1 ? "" : "s"}`;
  if (state === "cancelled") return `Stopped after ${frames}`;
  if (state === "failed") return `Failed after ${frames}`;
  return `Propagated ${frames}`;
}
