/**
 * The sequence timeline, on screen — Phase 6's pilot slice.
 *
 * `timeline.ts` holds the rules. This is the part that makes them reachable, and it exists in the
 * same commit as them ON PURPOSE: earlier in this project the vertex editor was built, unit-tested
 * and never rendered by anything, so every test passed while the feature did not exist. A pilot
 * that cannot be looked at has not piloted anything.
 *
 * IT BUILDS FROM THE FOLDER LISTING THE BROWSER ALREADY HAS. No new endpoint: the listing carries
 * each image's key and whether it is annotated, which is exactly the two things the pilot needs —
 * a file range and which frames are already ground truth. Sequence endpoints belong to the
 * propagation slices, which are gated on the golden capture.
 *
 * THE PROPAGATION BUTTON IS HERE NOW, and it was not before: "a control that does nothing is the
 * thing this codebase refuses to ship" is why it waited for the job API underneath it. It appears
 * only when the sequence has a reference to carry FROM, because propagating from nothing is what
 * legacy does — it runs the whole sequence and writes an empty mask over every frame.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { WireDatasetImage } from "@lazylabel/contracts";

import type { WireSegment } from "@lazylabel/contracts";

import type { ApiClient } from "../api/client.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { PropagationControl } from "./PropagationControl.jsx";
import type { OpenAnnotations } from "./references.js";
import { mergedByClass } from "./saveAll.js";
import { FIND_ARCHETYPES_ELSEWHERE, useSequenceActive } from "./sequenceActive.js";

import {
  buildTimeline,
  clearSuggested,
  folderOf,
  clearFlags,
  clearReferences,
  colourOf,
  markAllBefore,
  markReference,
  markReferences,
  markSaved,
  markSuggested,
  trim,
  resetForPropagation,
  showKeptLabels,
  sortedOrder,
  step,
  stepAmong,
  summarize,
  type Frame,
  type Target,
} from "./timeline.js";
import {
  DEFAULT_THRESHOLD,
  THRESHOLD_STEP,
  applyThreshold,
  clampThreshold,
  histogram,
  thresholdPosition,
} from "./confidence.js";

export interface TimelinePanelProps {
  /** The folder as the browser listed it, in its order. */
  readonly images: readonly WireDatasetImage[];
  /** Opening a frame is the workspace's job, not the timeline's. */
  /**
   * Opening a frame is the workspace's job, not the timeline's.
   *
   * `segments` are RULE-090's propagated masks for that frame, when there are any: a frame the
   * propagation produced a mask for shows that mask, not whatever its sidecar held.
   */
  readonly onOpen?: (key: string, segments?: readonly WireSegment[]) => void;
  /**
   * What propagation scored each frame, by timeline index — RULE-060's per-frame confidence.
   *
   * A prop rather than state, because propagation produces it and propagation is not built. The
   * panel below it works on whatever it is given and says so when it is given nothing, which is
   * the honest shape for a control whose data source is still a slice away: the alternative is a
   * histogram nobody can reach until the day the model lands, and then a histogram nobody has
   * ever run.
   */
  readonly scores?: Readonly<Record<number, number>>;
  /**
   * How to reach the inference service. Absent means the Propagate control is not offered at all.
   *
   * Offered-and-broken is the worse of the two: a button that answers 503 teaches a user that the
   * feature is unreliable, where no button says plainly that this deployment has no model.
   */
  readonly client?: ApiClient;
  /**
   * What Find Archetypes suggested, handed up so RULE-091's prefetch can prioritise those frames.
   *
   * Up rather than held here: the prefetch runs beside the OPEN IMAGE, which is a different part
   * of the tree, and the shell is the only place both can see.
   */
  readonly onArchetypes?: (keys: readonly string[]) => void;
  /**
   * How a discard is confirmed. Injected so a test can answer it without a real dialog.
   *
   * Defaults to `window.confirm`, which is the same choice the workspace made for navigating away
   * from unsaved annotations -- one mechanism for "you are about to lose work", not two.
   */
  readonly confirmDiscard?: (message: string) => boolean;
  /**
   * Legacy's header over the sequence view, "name (3/23) -- Conf: 0.9876" (main_window.py:3274,
   * 3544-3548), handed up because the shell draws it above the view, which the shell owns.
   */
  readonly onStatus?: (status: string) => void;
  /**
   * The image the view shows. When it is one of the timeline's frames, that frame becomes the
   * current one -- legacy moves its timeline to a file opened from the list when the file is in the
   * sequence (main_window.py:1447-1455) -- so the header, the marker and the picture agree.
   */
  readonly openKey?: string;
  /** Saves made by the ordinary save, by image key: see PropagationControl (SP-02). */
  readonly savedElsewhere?: ReadonlyMap<string, number>;
  /** The open image's annotations as they stand, saved or not: see PropagationControl (SP-04). */
  readonly openAnnotations?: OpenAnnotations;
  /**
   * Hands the shell a lookup: the run's masks a timeline frame opens with, whichever way it is
   * opened -- the file list and Left/Right as well as a click here (SP-22). Undefined for anything
   * else, and for everything while the Sequence tab is not the one in use.
   */
  readonly onReviewLookup?: (lookup: (key: string) => readonly WireSegment[] | undefined) => void;
}

/** What legacy says when there is no such frame to move to (main_window.py:4673-4706, 5158-5168). */
const NOTHING_TO_STEP_TO: Readonly<Record<Target, string>> = {
  flagged: "No more flagged frames",
  reference: "No reference frames",
  suggested: "No suggested frames",
};

/** The frames' keys in Sort's order, as it stands now. */
function sortedKeys(frames: readonly Frame[]): readonly string[] {
  return sortedOrder(frames).map((index) => frames[index]!.key);
}

/** A kept sort order as positions today: frames it names, in its order, then any it does not. */
function keptOrder(keys: readonly string[], frames: readonly Frame[]): readonly number[] {
  const position = new Map(frames.map((frame) => [frame.key, frame.index]));
  const named = keys.flatMap((key) => {
    const at = position.get(key);
    return at === undefined ? [] : [at];
  });
  const seen = new Set(named);
  return [...named, ...frames.map((frame) => frame.index).filter((index) => !seen.has(index))];
}

export function TimelinePanel({
  images,
  onOpen,
  scores = {},
  client,
  onArchetypes,
  confirmDiscard = (message) => window.confirm(message),
  onStatus,
  openKey,
  savedElsewhere,
  openAnnotations,
  onReviewLookup,
}: TimelinePanelProps): ReactNode {
  /*
   * The timeline -- its range and what has been painted over it -- as ONE state, so that a repaint
   * can tell which timeline it was made for.
   *
   * Some repaints land after a later click: the threshold applied when scores arrive, Save All
   * marking frames saved, a run resetting statuses. Each computes `previous ?? frames` with the
   * `frames` of the render that scheduled it. While the range and the overrides were two states,
   * one of those flushed just after New timeline found no overrides, fell back to the discarded
   * frames and set them again, and `frames` preferred them to the missing range: the range picker
   * never came back, and nothing threw (found with SEQUENCE_PARITY.md SP-03's fix, whose Save
   * button appears before the scores reach this panel). A repaint for a timeline that has been
   * discarded or rebuilt since is now dropped.
   */
  const [timeline, setTimeline] = useState<{
    /**
     * The files it was built from, FROZEN at Build: a built timeline is a fixed list of paths, as
     * legacy's is (`sequence_view_mode.py:123-126`), whatever folder the browser shows later.
     */
    readonly range: { readonly from: number; readonly to: number; readonly keys: readonly string[] };
    readonly overrides: readonly Frame[] | null;
  } | null>(null);
  const range = timeline?.range ?? null;
  const overrides = timeline?.overrides ?? null;
  const setOverrides = useCallback(
    (next: SetStateAction<readonly Frame[] | null>) =>
      setTimeline((live) =>
        live === null || live.range !== range
          ? live
          : { range: live.range, overrides: typeof next === "function" ? next(live.overrides) : next },
      ),
    [range],
  );
  /*
   * The sorted order, TAKEN ONCE when Sort is pressed and kept, as legacy's is
   * (`timeline_widget.py:109-120`), then taken again after a trim (`main_window.py:5286-5288`).
   * It was recomputed on every render, so frames jumped under the pointer while a run or a Save All
   * changed their statuses (SEQUENCE_PARITY.md SP-28). Keys, so a trim cannot misplace them.
   */
  const [sortKeys, setSortKeys] = useState<readonly string[] | null>(null);
  const sorted = sortKeys !== null;
  const [current, setCurrent] = useState(0);
  // Where the propagation's Save button is drawn: beside the bar, as legacy's Save All is.
  const [saveSlot, setSaveSlot] = useState<HTMLDivElement | null>(null);
  /*
   * Scores a propagation produced HERE, merged over whatever the caller passed.
   *
   * Both, not one: the prop is how a caller supplies scores from somewhere else, and losing it the
   * moment this panel could produce its own would be a regression for anyone using it.
   */
  const [ownScores, setOwnScores] = useState<Readonly<Record<number, number>>>({});
  /** What Find Archetypes suggested, kept so RULE-091's prefetch can prioritise those frames. */
  const [archetypes, setArchetypes] = useState<readonly string[]>([]);
  /** RULE-090: the propagated segments by IMAGE KEY, for whichever frame is opened next. */
  const [propagated, setPropagated] = useState<ReadonlyMap<string, readonly WireSegment[]>>(
    new Map(),
  );
  /** RULE-081: the frames Skip Labeled kept this run, by image key -- shown brown, never stored. */
  const [keptLabels, setKeptLabels] = useState<ReadonlySet<string>>(new Set());
  /** RULE-077's two trim bounds, as positions in the timeline. Order between them does not matter. */
  const [bounds, setBounds] = useState<readonly [number | null, number | null]>([null, null]);
  const [trimNote, setTrimNote] = useState<string | null>(null);
  /**
   * Propagated frames not yet written — what a New timeline would destroy.
   *
   * A REF, not state, because a click handler reads it. State arrives a render later, and the one
   * user this protects is the one who propagates and immediately clicks New timeline.
   */
  const unsavedRef = useRef(0);
  /*
   * And before the TAB closes. `CloseGuard` asks about open images only, so a propagation's
   * unsaved frames went with a closed tab without a question until 2026-09-23. Registered here
   * because this panel is what knows the count; the browser shows its own wording either way.
   */
  useEffect(() => {
    const ask = (event: BeforeUnloadEvent): void => {
      if (unsavedRef.current === 0) return;
      event.preventDefault();
      event.returnValue = ""; // older engines arm the dialog on this, as CloseGuard notes
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, []);
  const [finding, setFinding] = useState(false);
  /** Which Find is current: an aborted one's answer is dropped when it arrives (SP-29). */
  const findRun = useRef(0);
  const [foundNote, setFoundNote] = useState<string | null>(null);
  /*
   * MIN CONF IS A PERSISTED SETTING, not panel state -- `propagation_confidence_threshold`, which
   * decision 9 keeps with the rest. It was local state for one commit and that was wrong twice
   * over: the number decides which frames get SAVED, so it has to survive a reload, and a stored
   * setting nothing reads is a control that lies to the user about having remembered anything.
   */
  const { settings, save } = useSettings();
  const threshold = clampThreshold(
    Number(settings.values["propagation_confidence_threshold"] ?? DEFAULT_THRESHOLD),
  );

  const keys = useMemo(() => images.map((image) => image.key), [images]);
  const annotated = useMemo(
    () => new Set(images.filter((image) => image.annotated).map((image) => image.key)),
    [images],
  );

  const frames = useMemo(() => {
    if (overrides !== null) return overrides;
    if (range === null) return [];
    // NO REFERENCES UNTIL THE USER MARKS THEM, as in legacy (the owner's call, 2026-09-23). This
    // marked every annotated frame when the timeline was built, which is not what legacy does: its
    // references come from "+ Add Current", "+ All Before" and "+ All Labeled". Marking them
    // automatically made every frame an earlier Save All wrote a seed on a rebuilt timeline -- each
    // of its annotations tracked as an object of its own -- and left Skip Labeled nothing to protect.
    // From the files frozen at Build. It was rebuilt from whichever folder the browser listed, at
    // the old positions, so browsing elsewhere silently changed the timeline (SEQUENCE_PARITY.md SP-21).
    return buildTimeline(range.keys, 0, range.keys.length - 1);
  }, [overrides, range]);

  /*
   * What the timeline SHOWS: the stored frames with this run's kept labels painted over them.
   * Memoized, and not for speed: the propagation control is handed these frames, and a new array on
   * every render made it rebuild its view, hand up new review segments, and re-render this panel --
   * a loop that ran until the test runner ran out of memory.
   */
  const shown = useMemo(() => showKeptLabels(frames, keptLabels), [frames, keptLabels]);

  const { notify } = useNotifications();

  /*
   * Build opens the first frame and says so, as legacy's does (`main_window.py:4992-4996`). It
   * moved the cursor and opened nothing until 2026-09-26, so the view could show an image outside
   * the new timeline while the header named frame 1 (`SEQUENCE_PARITY.md` SP-18). The open goes
   * through the workspace, which saves or asks about unsaved work as any other open does.
   */
  const build = useCallback(
    (from: number, to: number) => {
      const built = buildTimeline(keys, from, to);
      setTimeline({ range: { from, to, keys: built.map((frame) => frame.key) }, overrides: null });
      setCurrent(0);
      if (built.length === 0) return;
      onOpen?.(built[0]!.key);
      notify({ severity: "info", message: `Timeline built: ${built.length} frames` });
    },
    [keys, notify, onOpen],
  );
  // Whether the Sequence tab is showing: its keys act only there, as legacy's act only in sequence
  // mode, although the panel stays mounted on the other tabs.
  const active = useSequenceActive();

  const navigate = useCallback(
    (target: Target, direction: 1 | -1) => {
      const next =
        target === "suggested"
          ? stepAmong(frames, current, new Set(archetypes), direction)
          : step(frames, current, target, direction);
      if (next === null) {
        // Legacy says so rather than doing nothing (main_window.py:4673-4706, 5158-5168).
        notify({ severity: "info", message: NOTHING_TO_STEP_TO[target] });
        return;
      }
      setCurrent(next);
      const frame = frames[next];
      if (frame !== undefined) onOpen?.(frame.key, propagatedFor(frame));
    },
    // `propagated` stands for propagatedFor, which reads it: without it, H and N handed a frame the
    // masks of an earlier render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archetypes, current, frames, notify, onOpen, propagated],
  );

  /*
   * THE FRAME KEYS, which the reference has listed since Phase 2 with nothing behind them. They
   * are the ones that make a reviewed sequence quick: jump to the next frame the model was unsure
   * about, look, jump again.
   *
   * Registered by this panel, so they are live only while it is open -- and the reference reports
   * that honestly rather than promising them always. That is the right scope: they move a cursor
   * along a timeline, and with no timeline built there is nothing for them to move.
   *
   * ABOVE the early returns below, because a hook after a conditional return changes how many
   * hooks the component runs between renders and React refuses. `navigate` already does nothing
   * when `step` finds no frame, so an empty timeline needs no guard of its own.
   */
  // Marking the frame you are on, which is what a user does after drawing on it: `markReferences`
  // derives the whole set when the timeline is built and nothing re-derives it while they work.
  const markCurrent = useCallback(
    () => setOverrides(markReference(frames, current)),
    [current, frames, setOverrides],
  );
  useHotkey("add_reference_frame", () => active && markCurrent());

  useHotkey("next_flagged_frame", () => active && navigate("flagged", 1));
  useHotkey("prev_flagged_frame", () => active && navigate("flagged", -1));
  useHotkey("next_reference_frame", () => active && navigate("reference", 1));
  useHotkey("prev_reference_frame", () => active && navigate("reference", -1));
  /*
   * APPLY THE THRESHOLD WHEN SCORES ARRIVE, not only when the slider moves.
   *
   * Without this a propagation finished and the timeline did not change: the histogram filled in,
   * the frames stayed grey, and nothing said which of them needed review until the user happened
   * to nudge Min Conf. RULE-060's flag is the whole review half of the capability, and a flag that
   * appears only if you touch an unrelated control is a flag nobody sees.
   *
   * Keyed on the scores themselves, so re-running a propagation re-flags rather than leaving the
   * previous run's colours in place.
   */
  const scoreKey = JSON.stringify(ownScores);
  useEffect(() => {
    if (Object.keys(ownScores).length === 0) return;
    setOverrides((previous) => applyThreshold(previous ?? frames, ownScores, threshold));
    // `frames` is derived from `overrides`, so depending on it here would re-enter this effect on
    // its own result. The scores and the threshold are what should trigger a re-flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreKey, threshold]);

  /**
   * C10: ask which frames are worth annotating by hand, and mark them.
   *
   * The answer is kept as well as drawn, because RULE-091's prefetch encodes the first uncached
   * archetype ahead of the neighbours -- a suggestion is where a user JUMPS to, and a jump is the
   * navigation neighbour-prefetching never helps with.
   *
   * ABOVE the early returns, with the hooks. Its key handler called it from there while it was
   * declared below them, so on a panel with no timeline built -- which returns early -- Ctrl+H
   * threw a ReferenceError instead of saying anything.
   */
  const find = useCallback(async () => {
    if (client === undefined) return;
    /*
     * A second press, or Ctrl+H, aborts, as legacy's does (`main_window.py:5044-5055`,
     * SEQUENCE_PARITY.md SP-29). The request itself cannot be withdrawn, so its answer is
     * dropped when it comes; the service finishes the work in the background.
     */
    if (finding) {
      findRun.current += 1;
      setFinding(false);
      notify({ severity: "info", message: "Reference analysis cancelled" });
      return;
    }
    const run = (findRun.current += 1);
    setFinding(true);
    setFoundNote(null);
    try {
      const answer = await client.findArchetypes(frames.map((frame) => frame.key));
      if (run !== findRun.current) return; // aborted meanwhile
      setArchetypes(answer.suggested);
      onArchetypes?.(answer.suggested);
      // Earlier suggestions go first, as legacy's do (`main_window.py:5066-5067`, SP-30).
      setOverrides(markSuggested(clearSuggested(frames), answer.suggested));
      setFoundNote(
        answer.suggested.length === 0
          ? "No distinct scenes were found — this sequence is too uniform to suggest frames."
          : answer.fellShort
            ? `${answer.suggested.length} of ${answer.budget} suggested; this sequence has only `
              + `${answer.clusters} distinct scenes.`
            : `${answer.suggested.length} frames suggested from ${answer.clusters} scenes.`,
      );
    } catch (cause) {
      if (run === findRun.current) setFoundNote(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (run === findRun.current) setFinding(false);
    }
  }, [client, finding, frames, notify, onArchetypes, setOverrides]);

  useHotkey("find_archetypes", () => {
    // Off its tab the key says where it works, as the shell's fallback does before this panel is
    // first mounted; on it, legacy's answer with no timeline (main_window.py:5057-5059).
    if (!active) notify({ severity: "info", message: FIND_ARCHETYPES_ELSEWHERE });
    else if (frames.length === 0) notify({ severity: "info", message: "Build a timeline first" });
    else void find();
  });
  useHotkey("next_suggested_frame", () => active && navigate("suggested", 1));
  useHotkey("prev_suggested_frame", () => active && navigate("suggested", -1));

  useEffect(() => {
    if (openKey === undefined) return;
    const at = shown.findIndex((frame) => frame.key === openKey);
    if (at >= 0) setCurrent(at);
  }, [openKey, shown]);

  /**
   * RULE-090's masks for a frame, merged one per class as legacy merges them when it opens the frame
   * (`main_window.py:3597-3606`, `SEQUENCE_PARITY.md` SP-07). Here, on the visit, and not where
   * Save All builds them: legacy's Save All does not merge.
   *
   * A REFERENCE opens as its file: the user's own drawing, loaded with its real vertices and
   * provenance. Handing it a propagated reconstruction in its place is the one substitution
   * propagation must not make -- it is the same reason Save All refuses to rewrite a reference.
   */
  const propagatedFor = (frame: Frame): readonly WireSegment[] | undefined => {
    const segments = frame.isReference ? undefined : propagated.get(frame.key);
    return segments === undefined ? undefined : mergedByClass(segments);
  };

  /*
   * SP-22: a timeline frame opened from the file list or with Left/Right shows the run's masks, as
   * one clicked here does. Legacy sends both through frame selection in sequence mode
   * (right_panel.py:208, 329-335; main_window.py:1447-1455, 3591-3606); in its other modes there is
   * no timeline, and the list opens the file. The lookup only assigns the shell's ref, so running
   * on every render costs nothing and cannot loop.
   */
  useEffect(() => {
    onReviewLookup?.((key) => {
      if (!active) return undefined;
      const frame = shown.find((each) => each.key === key);
      return frame === undefined ? undefined : propagatedFor(frame);
    });
  });

  const currentFrame = shown[current];
  const currentScore = currentFrame === undefined ? undefined : { ...scores, ...ownScores }[current];
  // An image opened from outside the timeline, which legacy bounces back from and this app opens
  // (decision 8): the header names it, rather than naming a frame that is not on screen (SP-19).
  const outside =
    openKey !== undefined && shown.length > 0 && !shown.some((frame) => frame.key === openKey);
  const status =
    currentFrame === undefined
      ? "No sequence loaded"
      : outside
        ? `${openKey.split("/").pop()} -- not in the timeline`
        : `${currentFrame.key.split("/").pop()} (${current + 1}/${shown.length})`
          + (currentScore === undefined ? "" : ` -- Conf: ${currentScore.toFixed(4)}`);
  useEffect(() => onStatus?.(status), [onStatus, status]);

  if (images.length === 0) {
    return <p className="panel__missing">A sequence is built from a folder of images.</p>;
  }

  if (frames.length === 0) {
    return (
      <RangePicker images={images} onBuild={build} />
    );
  }

  /**
   * Start again — and ASK FIRST when that would throw propagated work away.
   *
   * RULE-056 is legacy doing exactly this without a word: New Timeline wipes references, statuses
   * and unsaved propagated masks, and the current frame is not saved either. Decision 7 is the
   * standing answer to that whole family, and a propagation is the most expensive work in this
   * app to lose -- minutes of GPU time, and nothing on disk to show for it.
   *
   * No dialog when there is nothing to lose. A confirmation that always appears is one people
   * learn to dismiss without reading, which would make it useless on the day it mattered.
   */
  const startOver = () => {
    const unsaved = unsavedRef.current;
    if (
      unsaved > 0
      && !confirmDiscard(
        `${unsaved} propagated frame${unsaved === 1 ? " has" : "s have"} not been saved. `
          + "Starting a new timeline discards them. Continue?",
      )
    ) {
      return;
    }
    setTimeline(null);
    setKeptLabels(new Set());
    unsavedRef.current = 0;
    // Everything else the old timeline held, as legacy's reset clears it (`sequence_widget.py:770-794`,
    // SEQUENCE_PARITY.md SP-35): the sort, the trim bounds, the suggestions, and the run's scores and
    // masks, which would otherwise land on the same positions in the next timeline.
    setSortKeys(null);
    setBounds([null, null]);
    setTrimNote(null);
    setArchetypes([]);
    onArchetypes?.([]);
    setFoundNote(null);
    setOwnScores({});
    setPropagated(new Map());
    setCurrent(0);
  };


  /*
   * + All labeled asks the dataset NOW which frames have labels, as legacy probes the disk at the
   * click (`main_window.py:3966`, SEQUENCE_PARITY.md SP-26). It used the listing fetched when the
   * folder opened, which no save refreshes, so frames labelled this session were missed. The
   * listing the panel was given is the fallback when the dataset cannot be asked.
   */
  const markAllLabeled = async () => {
    let labelled: ReadonlySet<string> = annotated;
    const first = frames[0];
    if (client !== undefined && first !== undefined) {
      try {
        const listing = await client.listImages("default", folderOf(first.key));
        labelled = new Set(listing.images.filter((image) => image.annotated).map((image) => image.key));
      } catch {
        // Keep the listing the panel was given.
      }
    }
    setOverrides((previous) => markReferences(previous ?? frames, labelled));
  };

  /**
   * Cut or Keep — RULE-077.
   *
   * The masks are NOT cleared, which is a deliberate divergence. Legacy resets its propagation
   * engine here and its own card records the cost: "Save All then reports nothing to save even
   * though green frames with unsaved propagated masks remain". They are keyed by image key, so a
   * trim cannot lose or misplace them.
   */
  const applyTrim = (mode: "cut" | "keep") => {
    const outcome = trim(frames, bounds[0], bounds[1], mode, current);
    if (outcome.kind === "refused") {
      setTrimNote(outcome.reason);
      return;
    }
    setOverrides(outcome.frames);
    setCurrent(outcome.current);
    setBounds([null, null]);
    // A sorted timeline is sorted again, over what the trim kept, as legacy's is.
    if (sortKeys !== null) setSortKeys(sortedKeys(outcome.frames));
    setTrimNote(`Removed ${outcome.removed} frame${outcome.removed === 1 ? "" : "s"} from the timeline. No files were touched.`);
    // The open frame cut away: the nearest kept one opens, as legacy's does (`main_window.py:5290-5291`,
    // SEQUENCE_PARITY.md SP-19). One that survived stays open with its edits, where legacy reloads it
    // and loses them (SP-14).
    const nearest = outcome.frames[outcome.current];
    if (nearest !== undefined && !outcome.frames.some((frame) => frame.key === openKey)) {
      onOpen?.(nearest.key, propagatedFor(nearest));
    }
  };

  /**
   * What a run left on the timeline, dropped when the next one starts and when one is cleared, as
   * legacy's `clear_propagation_results` drops it (`sequence_view_mode.py:143-159`, RULE-076).
   */
  const dropRun = () => {
    setOwnScores({});
    setKeptLabels(new Set());
    setOverrides((previous) => resetForPropagation(previous ?? frames));
  };

  const counts = summarize(frames);
  const order = sortKeys === null ? shown.map((frame) => frame.index) : keptOrder(sortKeys, shown);
  const allScores = { ...scores, ...ownScores };

  return (
    <div className="timeline">
      {/* The bar first, directly under the view, as legacy's sequence tab has it
          (main_window.py:3283-3307); the controls follow. */}
      <p className="timeline__counts">
        {counts.total} frames, {counts.references} reference
        {counts.references === 1 ? "" : "s"}
        {counts.byState.skipped > 0 && (
          // Said out loud, because a skipped frame is one that will not take part in the run and
          // legacy gives it nothing but a brown cell.
          <>
            {" — "}
            <span role="status">
              {counts.byState.skipped} skipped for a size mismatch
            </span>
          </>
        )}
        {keptLabels.size > 0 && (
          // Brown too, as in legacy, so the colour alone cannot say which kind of skip it is.
          <>
            {" — "}
            <span role="status">
              {keptLabels.size} kept {keptLabels.size === 1 ? "its" : "their"} existing labels
              (Skip labeled)
            </span>
          </>
        )}
      </p>

      {/* Legacy's bar (timeline_widget.py:233-339): one strip, a frame per slice, separators only
          while a frame is at least 4px wide -- about 230 frames across the centre pane. */}
      <div className="timeline__bar-row">
      <ol
        className={`timeline__frames${order.length > 230 ? " timeline__frames--dense" : ""}`}
        aria-label="Timeline"
      >
        {order.map((index) => {
          const frame = shown[index];
          if (frame === undefined) return null;
          const [r, g, b] = colourOf(frame);
          const role = frame.isReference ? "reference" : frame.state;

          return (
            <li key={frame.key}>
              <button
                type="button"
                className={`timeline__frame${index === current ? " timeline__frame--current" : ""}`}
                // Pending is legacy's grey for the theme in force (timeline_widget.py:316), so it
                // comes from the stylesheet; every other state has one colour in both.
                style={{
                  backgroundColor:
                    role === "pending" ? "var(--frame-pending)" : `rgb(${r}, ${g}, ${b})`,
                }}
                // Named, not coloured only. The colour is how a user reads the timeline at a
                // glance and it is the only thing legacy offers; a screen reader gets nothing
                // from it, and neither does anyone who cannot separate the red from the brown.
                aria-label={`Frame ${index + 1}, ${frame.key}, ${role}`}
                // The score, as legacy's tooltip gives it (`timeline_widget.py:486-487`): four
                // decimals, because at Min Conf 0.99 the difference between 0.9899 and 0.99 is the
                // difference between a frame that is reviewed and one that is saved.
                title={
                  `${frame.key} — ${role}`
                  + (allScores[index] === undefined
                    ? ""
                    : ` — confidence ${allScores[index]!.toFixed(4)}`)
                }
                onClick={() => {
                  setCurrent(index);
                  onOpen?.(frame.key, propagatedFor(frame));
                }}
              />
            </li>
          );
        })}
      </ol>
        {/* Legacy's Save All sits here, right of the bar (main_window.py:3296-3305). */}
        <div className="timeline__save" ref={setSaveSlot} />
      </div>

      {client !== undefined && (
        <PropagationControl
          client={client}
          frames={shown}
          saveSlot={saveSlot}
          onScores={setOwnScores}
          unsavedRef={unsavedRef}
          confirmDiscard={confirmDiscard}
          onSegments={setPropagated}
          onSkipped={setKeptLabels}
          onSaved={(keys) => setOverrides((previous) => markSaved(previous ?? frames, keys))}
          {...(savedElsewhere === undefined ? {} : { savedElsewhere })}
          {...(openAnnotations === undefined ? {} : { openAnnotations })}
          onRunStart={dropRun}
          onCleared={dropRun}
        />
      )}


      <div className="timeline__controls">
        <button
          type="button"
          onClick={() => setSortKeys((keys) => (keys === null ? sortedKeys(shown) : null))}
        >
          {sorted ? "Unsort" : "Sort"}
        </button>
        <button type="button" onClick={() => navigate("flagged", 1)}>
          Next flagged
        </button>
        <button type="button" onClick={() => navigate("reference", 1)}>
          Next reference
        </button>
        <button type="button" onClick={markCurrent}>
          Mark as reference
        </button>
        {/* Legacy's other three reference buttons (`sequence_widget.py:228-253`). "Before" means
            to the left ON SCREEN, so a sorted timeline adds what the user sees to the left. */}
        <button type="button" onClick={() => setOverrides(markAllBefore(frames, current, order))}>
          + All before
        </button>
        <button type="button" onClick={() => void markAllLabeled()}>
          + All labeled
        </button>
        <button type="button" onClick={() => setOverrides(clearReferences(frames))}>
          Clear references
        </button>
        {client !== undefined && (
          <button
            type="button"
            // Legacy's Abort while it runs (sequence_widget.py:579-590), red as Propagate's is.
            className={`seq-button ${finding ? "seq-button--red" : "seq-button--purple"}`}
            onClick={() => void find()}
          >
            {finding ? "Abort" : "Find archetypes"}
          </button>
        )}
        <button type="button" onClick={() => setOverrides(clearFlags(frames))}>
          Clear flags
        </button>
        <button type="button" className="seq-button seq-button--brown" onClick={startOver}>
          New timeline
        </button>
      </div>

      {/* RULE-077. The bounds are set from the current frame, which is where a user's attention
          already is -- asking them to type two numbers would be asking them to count. */}
      <div className="timeline__controls">
        <button type="button" onClick={() => setBounds([current, bounds[1]])}>
          Trim from here
        </button>
        <button type="button" onClick={() => setBounds([bounds[0], current])}>
          Trim to here
        </button>
        <button type="button" className="seq-button seq-button--brown" onClick={() => applyTrim("cut")}>
          Cut
        </button>
        <button type="button" className="seq-button seq-button--dark-green" onClick={() => applyTrim("keep")}>
          Keep
        </button>
        <span className="field__value">
          {bounds[0] === null && bounds[1] === null
            ? "no trim bounds set"
            : `bounds ${bounds[0] === null ? "—" : bounds[0] + 1} to `
              + `${bounds[1] === null ? "—" : bounds[1] + 1}`}
        </span>
      </div>

      {trimNote !== null && (
        <p className="timeline__counts" role="status">
          {trimNote}
        </p>
      )}

      {foundNote !== null && (
        <p className="timeline__counts" role="status">
          {foundNote}
        </p>
      )}

      <ConfidencePanel
        scores={allScores}
        threshold={threshold}
        onThreshold={(value) => {
          const next = clampThreshold(value);
          void save({ ...settings, values: { ...settings.values, propagation_confidence_threshold: next } });
          // The TIMELINE moves with the number, not only the set a save would use. Legacy
          // recomputes one and not the other, so the colours point at one set of frames to review
          // while Save All skips another -- and nothing says the two disagree.
          setOverrides(applyThreshold(frames, allScores, next));
        }}
      />

      <p className="panel__missing">
        Propagation agrees with legacy frame for frame on a recorded test clip: the masks, the
        flags, Keep flagged masks, Skip labeled and Save All. What has not been shown is the same
        for a sequence longer than the streaming window, which no recording covers yet.
      </p>
    </div>
  );
}

/**
 * Choosing the first and last frame, which is how legacy builds a timeline.
 *
 * Two selects over the folder rather than a typed range: the frames have names, and a user picks
 * "from this one to that one" by looking at them. A pair of indices would be faster to implement
 * and would make the user count.
 */
function RangePicker({
  images,
  onBuild,
}: {
  readonly images: readonly WireDatasetImage[];
  readonly onBuild: (from: number, to: number) => void;
}): ReactNode {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(images.length - 1);

  return (
    <div className="timeline__range">
      <label className="crop__field">
        <span>First frame</span>
        <select
          value={from}
          aria-label="First frame"
          onChange={(event) => setFrom(Number(event.target.value))}
        >
          {images.map((image, index) => (
            <option key={image.key} value={index}>
              {image.name}
            </option>
          ))}
        </select>
      </label>
      <label className="crop__field">
        <span>Last frame</span>
        <select
          value={to}
          aria-label="Last frame"
          onChange={(event) => setTo(Number(event.target.value))}
        >
          {images.map((image, index) => (
            <option key={image.key} value={index}>
              {image.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="seq-button seq-button--blue" onClick={() => onBuild(from, to)}>
        Build timeline
      </button>
      {/* Said here because it changed on 2026-09-23, to legacy's behaviour: building used to mark
          every annotated frame as a reference. */}
      <p className="panel__missing">
        Building marks no references. Mark the frames propagation runs from afterwards: click a
        frame and Mark as reference, or + All labeled for every annotated one.
      </p>
    </div>
  );
}

/**
 * The confidence histogram, and the one number that decides what you review — RULE-035, RULE-060.
 *
 * Step 5 of the "carry labels through a sequence" flow. Propagation scores cluster just under 1,
 * which is why the chart does not start at 0: a 0-to-1 axis draws every score in the last bin and
 * shows the user one spike.
 *
 * DRAWN AS AN SVG, not a canvas. It is fifty rectangles and a line; a canvas would need a ref, a
 * device-pixel-ratio dance and a redraw effect to say the same thing, and none of it would be
 * readable by a screen reader or a test.
 */
function ConfidencePanel({
  scores,
  threshold,
  onThreshold,
}: {
  readonly scores: Readonly<Record<number, number>>;
  readonly threshold: number;
  readonly onThreshold: (value: number) => void;
}): ReactNode {
  const values = Object.values(scores);
  const view = histogram(values, threshold);
  const tallest = Math.max(1, ...view.bins);
  const marker = thresholdPosition(view, threshold);

  return (
    <div className="confidence">
      <label className="crop__field">
        <span>Min Conf</span>
        <input
          type="number"
          min={0}
          max={1}
          step={THRESHOLD_STEP}
          value={threshold}
          aria-label="Minimum confidence"
          onChange={(event) => onThreshold(Number(event.target.value))}
        />
      </label>

      {values.length === 0 ? (
        <p className="panel__missing">
          No confidence scores yet — propagation has not run. The threshold above is still the one
          it will use, and a frame scoring below it will be flagged for review and left out of Save
          All.
        </p>
      ) : (
        <>
          <svg
            className="confidence__chart"
            viewBox="0 0 100 30"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${values.length} frames scored, ${view.below} below ${threshold}`}
          >
            {view.bins.map((count, bin) => (
              <rect
                key={bin}
                x={(bin / view.bins.length) * 100}
                y={30 - (count / tallest) * 30}
                width={100 / view.bins.length}
                height={(count / tallest) * 30}
                /* Coloured by which side of the threshold the BIN is, so the split the number
                   makes is visible without reading the counts underneath. */
                className={
                  view.from + ((bin + 1) / view.bins.length) * (view.to - view.from) <= threshold
                    ? "confidence__bar confidence__bar--below"
                    : "confidence__bar"
                }
              />
            ))}
            <line
              x1={marker * 100}
              x2={marker * 100}
              y1={0}
              y2={30}
              className="confidence__threshold"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <p className="confidence__counts">
            <span>{view.from.toFixed(2)}</span>
            <span>
              {view.below} below ({Math.round(view.belowFraction * 100)}%), {view.above} above
            </span>
            <span>1.00</span>
          </p>
        </>
      )}
    </div>
  );
}
