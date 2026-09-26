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
import { createPortal } from "react-dom";
import type { WireSegment } from "@lazylabel/contracts";

import type { ApiClient, WirePropagationFrame } from "../api/client.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkey, useKeyHint } from "../hotkeys/HotkeyProvider.jsx";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { useSequenceActive } from "./sequenceActive.js";

import { commitFrame, engineCounts, type CommitPolicy, type Committed } from "./commit.js";
import { clampThreshold, DEFAULT_THRESHOLD, isFlagged } from "./confidence.js";
import { usePropagation } from "./usePropagation.js";
import { referenceMasks, type OpenAnnotations } from "./references.js";
import { plannedSave, saveAll, segmentsFor } from "./saveAll.js";
import { folderOf, type Frame, type FrameState } from "./timeline.js";

const NO_POLICY: CommitPolicy = { keepFlagged: false, skip: new Set(), references: new Set() };

/** Legacy's tooltips (`sequence_widget.py:359-365, 375-380`). */
const STREAMING_TIP =
  "Process video in chunks (set size with Window)\nusing a rolling context window. Bounds memory\n"
  + "regardless of sequence length.\n\nDisable for full-context mode (loads all frames\n"
  + "at once — better quality but high memory usage).";
const WINDOW_TIP =
  "Number of frames per streaming chunk.\nLower values use less memory but may\n"
  + "reduce temporal consistency.\n\nDefault: 250 (~3 GB per chunk)";

/** Legacy's "High Memory Usage" question, at 12.6 MB a frame (`sequence_widget.py:610-627`). */
function highMemory(frames: number): string {
  return (
    `Full-context mode will load all ${frames} frames into memory at once `
    + `(~${Math.round((frames * 12.6) / 1024)} GB).\n\n`
    + "This will likely cause an out-of-memory crash for large sequences.\n\n"
    + "Disable streaming anyway?"
  );
}

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
   * The finished run was cleared: the panel drops what it holds from it, as it does when a run
   * starts. Legacy clears a run the same way before each new one (`sequence_view_mode.py:143-159`).
   */
  readonly onCleared?: () => void;
  /**
   * The propagated segments, by frame position — RULE-090.
   *
   * Handed up because opening a frame belongs to the shell, not to this control. Built here
   * because this is where the masks and the object classes both are.
   */
  readonly onSegments?: (byKey: ReadonlyMap<string, readonly WireSegment[]>) => void;
  /**
   * Asks before a new run discards unsaved frames, and before Streaming goes off over more frames
   * than the window holds. Injected so a test can answer it.
   */
  readonly confirmDiscard?: (message: string) => boolean;
  /**
   * The frames Skip Labeled kept this run and the model produced a mask for -- legacy's brown
   * cells (RULE-081). Handed up because the timeline's colours belong to the panel.
   */
  readonly onSkipped?: (keys: ReadonlySet<string>) => void;
  /**
   * The frames the run leaves out -- another size than the reference's, or unreadable -- for the
   * timeline to mark Skipped, as legacy marks them (`main_window.py:4149-4162`, SP-25).
   */
  readonly onLeftOut?: (keys: readonly string[]) => void;
  /**
   * The frames whose masks were discarded when they were flagged, with Keep Flagged Masks off: the
   * timeline keeps them flagged whatever Min Conf becomes, since nothing can be written for them
   * (SP-33).
   */
  readonly onDiscarded?: (keys: ReadonlySet<string>) => void;
  /** The frames a Save All wrote, so the timeline can show them saved. */
  readonly onSaved?: (keys: readonly string[]) => void;
  /**
   * How many times each image has been saved by the ordinary save (Enter, the Write button), by key.
   *
   * A propagated frame saved that way since the run began is the user's CORRECTION: Save All must
   * not write the run's masks over it, and reopening it must show the file. Legacy drops a saved
   * frame's stored masks (`sequence_view_mode.py:365-373`), so its Save All skips it; here the
   * run kept the masks and Save All wrote them over the correction (`SEQUENCE_PARITY.md` SP-02).
   */
  readonly savedElsewhere?: ReadonlyMap<string, number>;
  /**
   * The open image's annotations as the user has them now, unsaved edits included.
   *
   * A reference frame that is the open image seeds from these, when there are any, not from its
   * file, as legacy's does (`main_window.py:3649-3656`, `SEQUENCE_PARITY.md` SP-04). Its class
   * names, as they stand at Propagate, are the names Save All writes (`main_window.py:4277-4280`,
   * SP-05). Handed down from the store by the shell, as `savedElsewhere` is.
   */
  readonly openAnnotations?: OpenAnnotations;
  /**
   * Where the Save button is drawn: beside the timeline bar, as legacy's Save All is
   * (main_window.py:3296-3305). A portal, so the button is still this control's -- its saving
   * state, its guard and its keys stay here -- while it sits where a user looks for it.
   */
  readonly saveSlot?: HTMLElement | null;
  /**
   * What the timeline puts in this row after the checkboxes: Min Conf and Hist, where legacy's
   * Propagation group has them (`sequence_widget.py:383-404`).
   */
  readonly options?: ReactNode;
}

export function PropagationControl({
  client,
  frames,
  onScores,
  onUnsaved,
  unsavedRef,
  onRunStart,
  onCleared,
  onSegments,
  confirmDiscard = (message) => window.confirm(message),
  onSkipped,
  onLeftOut,
  onDiscarded,
  onSaved,
  savedElsewhere,
  openAnnotations,
  saveSlot,
  options,
  projectId = "default",
}: PropagationControlProps): ReactNode {
  const { settings, save } = useSettings();
  /** The Window as it stands, and what is being typed into it until it is committed. */
  const windowSize = Number(settings.values["stream_window_size"] ?? 250);
  const [windowDraft, setWindowDraft] = useState<string | null>(null);
  const commitWindow = (): void => {
    if (windowDraft === null) return;
    setWindowDraft(null);
    const typed = Math.round(Number(windowDraft.trim()));
    // A spinbox holds its value within its range; what is not a number keeps the value in force.
    if (windowDraft.trim() === "" || !Number.isFinite(typed)) return;
    const next = Math.min(1000, Math.max(50, typed));
    if (next !== windowSize) void save({ ...settings, values: { ...settings.values, stream_window_size: next } });
  };
  const { progress, start, cancel, reset } = usePropagation(client);
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
  /*
   * Legacy's Range spinboxes, 1-based, set back to the whole timeline whenever its frame count
   * changes -- a Build or a Trim (`sequence_widget.py:318-331, 667-679`). Sent as positions, and
   * not at all at the defaults, as legacy passes no limit for the whole timeline
   * (`main_window.py:4369-4378`). The web sent no range, so every run covered every frame (SP-46).
   */
  const frameCount = frames.length;
  const [range, setRange] = useState<readonly [number, number]>([1, Math.max(1, frameCount)]);
  useEffect(() => setRange([1, Math.max(1, frameCount)]), [frameCount]);
  const rangeValue = (raw: string, fallback: number): number => {
    const value = Math.round(Number(raw));
    return raw.trim() === "" || !Number.isFinite(value)
      ? fallback
      : Math.min(Math.max(1, frameCount), Math.max(1, value));
  };
  /** This run's policy, fixed when it starts, as legacy fixes its labelled set. */
  const [policy, setPolicy] = useState<CommitPolicy>(NO_POLICY);
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
  /**
   * What those classes are called, fixed when the run began: legacy stores each seed's class name
   * at Propagate (`main_window.py:4277-4280`), so opening another frame to review it, which puts
   * that frame's names in the store, does not rename what Save All writes (SP-05).
   */
  const [aliases, setAliases] = useState<Readonly<Record<string, string>>>({});
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  /** Frames already written. What remains is what a discard would destroy. */
  const [written, setWritten] = useState<ReadonlySet<string>>(new Set());
  /** `savedElsewhere` as it stood when this run began: a save after it is a correction. */
  const savesAtRun = useRef<ReadonlyMap<string, number>>(new Map());

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

  const { notify } = useNotifications();
  /** Which start is current: one aborted while it read the references stops at its next step (SP-40). */
  const startRun = useRef(0);

  const begin = useCallback(async () => {
    /*
     * A press while it starts is legacy's Abort: its button is Abort from the first click, through
     * loading and reference registration (`sequence_widget.py:629-640`, `main_window.py:4417-4445`,
     * SEQUENCE_PARITY.md SP-40). Here the button was disabled while it read the references, and
     * Ctrl+P did nothing.
     */
    if (loading) {
      startRun.current += 1;
      setLoading(false);
      notify({ severity: "info", message: "Propagation cancelled" });
      return;
    }
    if (references.length === 0 || progress.running) return;
    if (!mayDiscard("Propagating again")) return;
    const run = (startRun.current += 1);
    const aborted = (): boolean => run !== startRun.current;
    setLoading(true);

    /*
     * THE PICKER'S MODEL, as legacy propagates with the model it has loaded (`main_window.py:
     * 4052-4060`, `SEQUENCE_PARITY.md` SP-32). Sent so the service does not guess: with two SAM 2
     * checkpoints listed it refused to choose, and with one it propagated even while SAM 1 was
     * picked. A SAM 1 pick is refused in legacy's words. With nothing picked nothing is sent, and the
     * service uses its only SAM 2 model if it has one.
     */
    const model = String(settings.values["ai_model"] ?? "");
    if (model !== "") {
      let picked: { readonly videoCapable: boolean } | undefined;
      try {
        picked = (await client.models()).find((each) => each.name === model);
      } catch {
        picked = undefined; // unknown here: the service answers for it
      }
      if (aborted()) return;
      if (picked !== undefined && !picked.videoCapable) {
        notify({ severity: "error", message: "SAM 2 video predictor not available" });
        setLoading(false);
        return;
      }
    }

    /*
     * The reference MASKS are loaded before anything starts. They are the user's own annotations,
     * and the service seeds SAM 2 with them rather than with prompts re-derived from them --
     * re-clicking an object someone already drew gives a mask close to theirs and not theirs.
     */
    let seeds;
    let labelled: ReadonlySet<string> = new Set();
    try {
      seeds = await referenceMasks(
        client,
        projectId,
        references.map((index) => ({ position: index, key: frames[index]!.key })),
        // The open reference as it is on screen, as legacy seeds it (SP-04).
        openAnnotations,
      );
      if (aborted()) return;
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
          if (aborted()) return;
          // Refused, not run unprotected: a run that could not see which frames have labels could
          // overwrite every one of them at the next Save All.
          notify({
            severity: "error",
            message: "Skip Labeled could not read which frames have labels",
            detail: cause instanceof Error ? cause.message : String(cause),
          });
          return;
        }
      }
    } finally {
      if (!aborted()) setLoading(false);
    }
    if (aborted()) return;

    // What could not seed is said, never dropped: with none left, in legacy's words
    // (`main_window.py:4294-4298`); with some, how many, the frames and why in the detail.
    const unusable = seeds.skipped.map((each) => `${each.key.split("/").pop()}: ${each.reason}`).join("; ");
    if (seeds.objects.length === 0) {
      notify({ severity: "error", message: "No valid segments in reference frames", detail: unusable });
    } else if (seeds.skipped.length > 0) {
      notify({ severity: "warning", message: `${seeds.skipped.length} reference frames could not seed`, detail: unusable });
    }
    // Before any result arrives: a frame the new run does not reach must not keep a green status
    // whose mask has just been thrown away with the previous run's.
    onRunStart?.();
    setClasses(seeds.classes);
    setAliases(seeds.aliases);
    // A new run's masks are new work, whatever an earlier Save All wrote. Until 2026-09-23 this set
    // was never cleared, so a frame saved once counted as saved for every later run: no Save button
    // for its new mask, and no question before anything threw that mask away.
    setWritten(new Set());
    committed.current = new Map();
    /*
     * The last run's masks go with its commits. Kept until the new job answered, the render in
     * between committed them again under the new policy, so identical scores never changed what
     * was handed up, and the timeline this run had cleared was never painted (found in a real run,
     * 2026-09-26).
     */
    reset();
    savesAtRun.current = new Map(savedElsewhere ?? []);
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
    const [from, to] = [range[0] - 1, range[1] - 1];

    await start({
      sequence: frames.map((frame) => frame.key),
      references,
      objects: seeds.objects,
      ...(from === 0 ? {} : { start: from }),
      ...(to === frames.length - 1 ? {} : { end: to }),
      ...(Number.isFinite(window) && window > 0 ? { window } : {}),
      ...(model === "" ? {} : { model }),
      streaming,
    });
  }, [
    client,
    frames,
    keepFlagged,
    loading,
    mayDiscard,
    notify,
    onRunStart,
    openAnnotations,
    progress.running,
    projectId,
    range,
    references,
    reset,
    savedElsewhere,
    settings.values,
    skipLabeled,
    start,
  ]);

  /*
   * Ctrl+P presses legacy's Propagate button, which is its Abort while a run goes
   * (main_window.py:4708-4716; sequence_widget.py:629-634), and acts only on the Sequence tab.
   */
  const active = useSequenceActive();
  // Legacy's tooltips name the key, " (Ctrl+P)"; from the user's own bindings here.
  const keyOf = useKeyHint();
  useHotkey("propagate", () => {
    if (!active) return;
    if (progress.running) {
      abort();
      return;
    }
    if (references.length === 0) {
      notify({ severity: "info", message: "Mark at least one frame as a reference first" });
      return;
    }
    void begin();
  });

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
    /** The state each commit gives its frame at today's Min Conf, whatever the timeline shows. */
    const verdicts = new Map<string, FrameState>();
    /** Flagged with Keep Flagged Masks off: no masks, so flagged at any Min Conf (SP-33). */
    const discarded = new Set<string>();

    for (const [key, result] of committed.current) {
      const at = position.get(key);
      if (at === undefined) continue; // trimmed off the timeline
      if (result.kind === "scored") {
        scores[at] = result.score;
        if (result.kept.length > 0) {
          kept.set(key, result.kept);
          verdicts.set(key, isFlagged(result.score, threshold) ? "flagged" : "propagated");
        } else {
          discarded.add(key);
          verdicts.set(key, "flagged");
          known.set(key, "its masks were discarded when it was flagged, with Keep Flagged Masks off");
        }
      } else if (result.kind === "skipped") {
        verdicts.set(key, "skipped");
        if (result.painted) painted.add(key);
        known.set(key, "it already has labels, and Skip Labeled leaves them alone");
      } else if (result.kind === "empty") {
        empty.push(at);
      }
      // A reference contributes nothing: it is the user's own drawing, never shown or saved from
      // the run. Legacy's engine does not even report it (`propagation_manager.py:744-749`).
    }
    // A frame the user saved themselves since the run began is theirs now: not the run's to show
    // on a revisit, nor Save All's to write over (SP-02).
    const corrected: string[] = [];
    for (const key of [...kept.keys()]) {
      if ((savedElsewhere?.get(key) ?? 0) > (savesAtRun.current.get(key) ?? 0)) {
        kept.delete(key);
        corrected.push(key);
      }
    }
    return { scores, empty: empty.sort((a, b) => a - b), painted, kept, known, corrected, verdicts, discarded };
    // `committed` is a ref, filled just above from these same inputs, and `frames` is read only
    // for its keys and positions, which `framesKey` stands for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesKey, policy, progress.masks, progress.running, threshold, savedElsewhere]);

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

  // Through a ref, keyed on the frames alone: the panel hands down a new callback every render.
  const onDiscardedNow = useRef(onDiscarded);
  onDiscardedNow.current = onDiscarded;
  const discardedKey = [...view.discarded].sort().join("|");
  useEffect(() => {
    onDiscardedNow.current?.(view.discarded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discardedKey]);

  // A frame the user saved themselves is saved: shown so on the timeline, as Save All's are. Keyed
  // on the frames alone, with the callback through a ref: the panel hands down a new `onSaved` on
  // every render, and depending on it looped -- mark saved, re-render, mark saved again.
  const onSavedNow = useRef(onSaved);
  onSavedNow.current = onSaved;
  const correctedKey = view.corrected.join("|");
  useEffect(() => {
    if (view.corrected.length > 0) onSavedNow.current?.(view.corrected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctedKey]);

  const job = progress.job;
  const done = job !== null && !progress.running;

  /*
   * THE FRAMES THE RUN LEAVES OUT, marked Skipped and said, as legacy marks and says them when it
   * measures a timeline's frames before its first run (`main_window.py:4149-4162`,
   * SEQUENCE_PARITY.md SP-25). Each run's are marked, since Clear Flags returns them to pending in
   * between; the notice is given once per timeline, as legacy's measuring happens once until a
   * Build or a Trim. Left out silently until 2026-09-26, and left pending.
   */
  const onLeftOutNow = useRef(onLeftOut);
  onLeftOutNow.current = onLeftOut;
  const announcedFor = useRef<string | null>(null);
  const leftOut = job?.skipped ?? [];
  const leftOutKey = job === null ? "" : `${job.id}:${leftOut.map((each) => each.source).join("|")}`;
  useEffect(() => {
    if (job === null || leftOut.length === 0) return;
    onLeftOutNow.current?.(leftOut.map((each) => each.source));
    if (announcedFor.current === framesKey) return;
    announcedFor.current = framesKey;
    const size = job.referenceSize ?? null;
    notify({
      severity: "info",
      message: `${leftOut.length} frames have different dimensions`
        + (size === null ? "" : ` (reference is ${size.width}x${size.height})`)
        + " and will be skipped during propagation",
    });
    // Keyed on the run and what it left out, so a poll that changes neither does not act again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftOutKey]);

  /*
   * CLEAR THROWS THE RUN AWAY. Legacy has no Clear (`SEQUENCE_PARITY.md` SP-57); what it does
   * before every new run is the nearest thing, and this is that without the run that follows:
   * the masks and scores go, and the timeline goes back to pending except for references and
   * skipped frames (`sequence_view_mode.py:143-159`, `propagation_manager.py:484-493`).
   *
   * The COMMITS go with the masks. The counts, the review segments and the timeline's paint are all
   * built from them, and until 2026-09-26 only the hook's masks went: Clear asked, and on a yes
   * discarded nothing. The tab still asked on close, and New timeline and Propagate asked about
   * frames just discarded. Every frame kept its paint, its score, and the mask a revisit showed.
   */
  const clear = () => {
    if (!mayDiscard("Clearing")) return;
    reset();
    committed.current = new Map();
    setWritten(new Set());
    setPolicy(NO_POLICY);
    onCleared?.();
  };

  /** Legacy's engine counts, over the frames on the timeline now (see `engineCounts`). */
  const engine = (): ReturnType<typeof engineCounts> =>
    engineCounts(
      progress.masks,
      new Set(frames.map((frame) => frame.key)),
      policy.references,
      threshold,
      policy.keepFlagged,
    );

  /*
   * THE RUN'S NOTICES, in legacy's words (`main_window.py:4621-4636, 4445, 4654`, SEQUENCE_PARITY.md
   * SP-50): when it completes, how many frames and how many flagged, from its engine's counts; when
   * it fails, why. A cancel says so at the press, as legacy's does. They replace the lines that said
   * it here, "Propagated N frames" and the like.
   */
  const announced = useRef<string | null>(null);
  const finished = job !== null && job.state === "completed" ? job.id : null;
  useEffect(() => {
    if (finished === null || announced.current === finished) return;
    announced.current = finished;
    const { propagated, flagged } = engine();
    notify({
      severity: "info",
      message:
        propagated.size === 0 && flagged.size > 0
          ? `Propagation complete but all ${flagged.size} frames were flagged (below confidence threshold). `
            + "Try lowering Min Conf or improving reference annotations."
          : `Propagation complete: ${propagated.size} frames, ${flagged.size} flagged. `
            + "Scrub timeline or click 'Save All' to save.",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);
  const failure = progress.error;
  useEffect(() => {
    if (failure !== null) notify({ severity: "error", message: `Propagation error: ${failure}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failure]);
  const abort = (): void => {
    if (job?.cancelling === true) return;
    void cancel();
    notify({ severity: "info", message: "Propagation cancelled" });
  };

  /*
   * WHAT SAVE ALL WRITES, AND WHAT THE LOSS GUARDS COUNT, IS WHAT THE COMMIT DECIDED, never the
   * timeline's paint. Clear Flags repaints every frame pending, and legacy's does nothing more: its
   * Save All still writes every propagated, unflagged frame (`main_window.py:3457-3478`). Planned
   * from the paint, Save All wrote nothing after one, and New timeline, Clear, Propagate and a
   * closing tab stopped asking (`SEQUENCE_PARITY.md` SP-03). A frame already saved this run, by
   * Save All or by the user (SP-02), is not planned at all.
   */
  const corrected = new Set(view.corrected);
  const planned = frames
    .filter((frame) => !written.has(frame.key) && !corrected.has(frame.key))
    .map((frame) => {
      const verdict = frame.isReference ? undefined : view.verdicts.get(frame.key);
      return verdict === undefined ? frame : { ...frame, state: verdict };
    });
  const { writable: unsaved } = plannedSave(planned, view.kept, view.known);

  // Written during render, read by a click handler. The same "latest value" pattern the AI tool
  // uses for its prediction, and for the same reason: an effect would be one render too late.
  if (unsavedRef !== undefined) unsavedRef.current = unsaved.length;
  unsavedNow.current = unsaved.length;

  // The callback goes through an effect, because calling a parent's setter during render is a
  // state update inside another component's render, which React warns about and which can loop.
  useEffect(() => {
    onUnsaved?.(unsaved.length);
  }, [onUnsaved, unsaved.length]);

  // RULE-090's masks, one segment per object. Built with the same function the save uses, so the
  // pixels a user REVIEWS on the frame are the ones a save would write -- two derivations of that
  // would be two chances to disagree. The panel merges them per class when it opens the frame, as
  // legacy does (SP-07).
  const segmentsByFrame = useMemo(() => {
    const built = new Map<string, readonly WireSegment[]>();
    for (const [key, results] of view.kept) {
      // A frame Save All wrote is on disk now, so a revisit opens its file, as legacy's does once
      // `mark_frame_saved` has dropped its stored masks (`sequence_view_mode.py:365-373`). Its
      // score stays, as legacy's does. Until 2026-09-26 it reopened with the run's masks, marked
      // unsaved (`SEQUENCE_PARITY.md` SP-23).
      if (written.has(key)) continue;
      const segments = segmentsFor(results, classes);
      if (segments.length > 0) built.set(key, segments);
    }
    return built;
  }, [classes, view.kept, written]);

  useEffect(() => {
    onSegments?.(segmentsByFrame);
  }, [onSegments, segmentsByFrame]);

  const write = useCallback(async () => {
    // Legacy's count is its engine's: propagated and not flagged, saved or not
    // (`main_window.py:4750-4761`); the frames written are counted after (4846).
    const { propagated, flagged } = engine();
    const toSave = [...propagated].filter((key) => !flagged.has(key)).length;
    if (toSave === 0) {
      notify({ severity: "info", message: "No propagated frames to save" });
      return;
    }
    notify({ severity: "info", message: `Saving ${toSave} frames...` });
    setSaving({ done: 0, total: unsaved.length });
    try {
      const outcome = await saveAll({
        client,
        projectId,
        frames: planned,
        masks: view.kept,
        known: view.known,
        classes,
        aliases,
        // Decision 7: an explicit act writes, and it writes the formats the user chose. A default
        // invented here would put files on disk in a format nobody asked for.
        formats: (settings.values["export_formats"] as string[] | undefined) ?? ["NPZ"],
        // RULE-012, read as the Enter path reads it (`OpenImageView.tsx`) and when the save is made,
        // as legacy's Save All reads it (`save_export_manager.py:112, 405-410`,
        // `SEQUENCE_PARITY.md` SP-06).
        pixelPriority: {
          enabled: settings.values["pixel_priority_enabled"] === true,
          ascending: settings.values["pixel_priority_ascending"] !== false,
        },
        onProgress: (doneCount, total) => setSaving({ done: doneCount, total }),
      });
      setWritten((previous) => new Set([...previous, ...outcome.written]));
      onSaved?.(outcome.written);
      // Legacy's words, which name NPZ whatever formats are written (`main_window.py:4846`).
      notify({ severity: "info", message: `Saved ${outcome.written.length} frames to NPZ` });
      // Legacy logs a failed write and says nothing; here it is said, and the frame stays unsaved (SP-38).
      if (outcome.failed.length > 0) {
        notify({
          severity: "error",
          message: `${outcome.failed.length} frames could not be saved`,
          detail: outcome.failed.map((each) => `${each.key.split("/").pop()}: ${each.reason}`).join("; "),
        });
      }
    } finally {
      setSaving(null);
    }
    // `engine` reads the masks, the frames, the policy and Min Conf, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aliases, classes, client, frames, notify, onSaved, planned, policy, progress.masks, projectId, settings.values, threshold, unsaved.length, view.kept, view.known]);

  return (
    <div className="timeline__propagation">
      <div className="timeline__propagation-actions">
        <span className="timeline__range">
          Range:{" "}
          <input
            type="number"
            min={1}
            max={Math.max(1, frameCount)}
            value={range[0]}
            aria-label="Start frame"
            title="Start frame (1-indexed)"
            onChange={(event) => {
              const value = rangeValue(event.currentTarget.value, range[0]);
              setRange((previous) => [value, previous[1]]);
            }}
          />
          {" - "}
          <input
            type="number"
            min={1}
            max={Math.max(1, frameCount)}
            value={range[1]}
            aria-label="End frame"
            title="End frame (1-indexed)"
            onChange={(event) => {
              const value = rangeValue(event.currentTarget.value, range[1]);
              setRange((previous) => [previous[0], value]);
            }}
          />
        </span>
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
        <label title={STREAMING_TIP}>
          <input
            type="checkbox"
            checked={streaming}
            onChange={(event) => {
              const on = event.currentTarget.checked;
              // Legacy's "High Memory Usage" question, whose No keeps Streaming on
              // (`sequence_widget.py:610-627`, SP-48).
              if (!on && frames.length > windowSize && !confirmDiscard(highMemory(frames.length))) return;
              setStreaming(on);
            }}
          />{" "}
          Streaming
        </label>
        {/* Legacy's Window spinbox, in this row (`sequence_widget.py:369-381`), 50 to 1000 frames,
            kept as the `stream_window_size` setting, as legacy keeps it (`main_window.py:2096-2100`). */}
        <label title={WINDOW_TIP}>
          Window:{" "}
          <input
            type="number"
            min={50}
            max={1000}
            step={50}
            aria-label="Window"
            value={windowDraft ?? String(windowSize)}
            onChange={(event) => setWindowDraft(event.currentTarget.value)}
            onBlur={commitWindow}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitWindow();
            }}
          />
        </label>
        {options}
        {/* LEGACY'S ONE BUTTON (sequence_widget.py:298-312, 629-647, 741-768; main_window.py:
            4452-4457, SEQUENCE_PARITY.md SP-53): green Propagate, amber "Starting..." from the
            press, then a red "Abort · <phase>" that stops the run. Here the phases are the job's:
            "Loading images..." until its first frame, then "Frame N/T". A press while it starts
            aborts too (SP-40). While a stopped run finishes its frame in flight, legacy's button is
            back to Propagate; here it is too, and disabled until the job has stopped. */}
        {progress.running && job?.cancelling !== true ? (
          <button type="button" className="seq-button seq-button--red" onClick={abort}>
            {job === null || job.completed === 0
              ? "Abort · Loading images..."
              : `Abort · Frame ${job.completed}${job.total === null ? "" : `/${job.total}`}`}
          </button>
        ) : (
          <button
            type="button"
            className={`seq-button ${loading ? "seq-button--amber" : "seq-button--green"}`}
            onClick={() => void begin()}
            disabled={references.length === 0 || progress.running}
            title={`Propagate masks from all reference frames to fill the sequence${keyOf("propagate")}`}
          >
            {loading ? "Starting..." : "Propagate"}
          </button>
        )}

        {/* Offered DURING a run too, for the frames already committed, as legacy's Save All is
            (main_window.py:3297-3305, SEQUENCE_PARITY.md SP-38): a long run could be saved only once it
            had finished. */}
        {job !== null && unsaved.length > 0 && (() => {
          // Legacy's green Save All (theme.py positiveButton), beside the bar when there is a slot.
          const save = (
            <button
              type="button"
              className="button--positive"
              onClick={() => void write()}
              disabled={saving !== null}
            >
              {saving === null
                ? `Save ${unsaved.length} frame${unsaved.length === 1 ? "" : "s"}`
                : `Saving ${saving.done} of ${saving.total}…`}
            </button>
          );
          return saveSlot === undefined || saveSlot === null ? save : createPortal(save, saveSlot);
        })()}

        {done && (
          <button
            type="button"
            onClick={clear}
            disabled={saving !== null}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

