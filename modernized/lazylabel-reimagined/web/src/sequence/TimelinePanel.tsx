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
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { WireDatasetImage } from "@lazylabel/contracts";

import type { WireSegment } from "@lazylabel/contracts";

import type { ApiClient } from "../api/client.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkey, useKeyHint } from "../hotkeys/HotkeyProvider.jsx";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { PropagationControl } from "./PropagationControl.jsx";
import type { OpenAnnotations } from "./references.js";
import { mergedByClass } from "./saveAll.js";
import { FIND_ARCHETYPES_ELSEWHERE, useSequenceActive } from "./sequenceActive.js";

import {
  buildTimeline,
  clearSuggested,
  folderOf,
  framesBefore,
  clearFlags,
  clearReferences,
  colourOf,
  markReference,
  markReferences,
  markSaved,
  markSkipped,
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
  niceTicks,
  thresholdPosition,
} from "./confidence.js";
import { Dialog } from "../shell/Dialog.jsx";

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
  /**
   * What `/health` says about AI (SP-31). Absent means unknown, and everything is offered, as
   * before; known and missing, the propagation, reference and review controls are hidden and
   * their keys say why, as legacy's are without its AI packages (`sequence_widget.py:274-278,
   * 307-311, 825-835`; `main_window.py:4020-4022, 4710-4712, 5041-5043`).
   */
  readonly ai?: { readonly available: boolean; readonly videoCapable: boolean; readonly reason: string | null };
  /**
   * The rows as the file list shows them, sorted and searched. Build takes the files between Start
   * and End in this order, as legacy's takes the list's rows (`fast_file_manager.py:1971-1999`,
   * SEQUENCE_PARITY.md SP-20). Absent, the listing as the browser gave it.
   */
  readonly rows?: readonly WireDatasetImage[];
  /**
   * The range for the file list to colour: Start, End and the rows between them when both are
   * set, as legacy's list does until Clear or New Timeline (`fast_file_manager.py:303-309,
   * 501-513, 1900-1965`). Null while the Sequence tab is not in use, where legacy has no range.
   */
  readonly onRange?: (range: SequenceRange | null) => void;
}

/** The Start and End a timeline is built between, and the rows between them when both are set. */
export interface SequenceRange {
  readonly start: string | null;
  readonly end: string | null;
  /** The files from Start to End, as the list showed them when the second was set. */
  readonly between: readonly string[];
}

/** Legacy's steps, in its Timeline Setup group (`sequence_widget.py:142-152`). */
const SETUP_STEPS = [
  "Navigate to start frame in file list",
  "Click 'Set Start'",
  "Navigate to end frame",
  "Click 'Set End'",
  "Click 'Build Timeline'",
] as const;

/** Legacy's zoom and pan steps (`timeline_widget.py:511-514, 673`). */
const ZOOM_STEP = 1.5;
const MAX_ZOOM = 30;
const PAN_STEP = 0.25;
const WHEEL_STEP = 0.1;

/** What legacy says when there is no such frame to move to (main_window.py:4673-4706, 5158-5168). */
const NOTHING_TO_STEP_TO: Readonly<Record<Target, string>> = {
  flagged: "No more flagged frames",
  reference: "No reference frames",
  suggested: "No suggested frames",
};

/** What the keys and the disabled controls say when AI is missing: legacy's hint, for a server. */
function aiHintFor(ai: TimelinePanelProps["ai"]): string {
  const why = ai?.reason ?? (ai !== undefined && ai.available && !ai.videoCapable
    ? "no model that can propagate is installed"
    : null);
  return `AI features require the inference service${why === null ? "" : ` (${why})`}.`;
}

/** Ctrl+P while propagation is unavailable: says why, as legacy's does (`main_window.py:4710-4712`). */
function PropagateHint({ active, hint }: { readonly active: boolean; readonly hint: string }): ReactNode {
  const { notify } = useNotifications();
  useHotkey("propagate", () => {
    if (active) notify({ severity: "info", message: hint });
  });
  return null;
}

/**
 * Legacy's references line (`sequence_widget.py:688-708`): the frame numbers, 1-based and in order,
 * all of them up to five, else the first three and the total, with a star; "None" without any.
 */
function referenceList(frames: readonly Frame[]): string {
  const numbers = frames.filter((frame) => frame.isReference).map((frame) => frame.index + 1).sort((a, b) => a - b);
  if (numbers.length === 0) return "None";
  if (numbers.length <= 5) return `Frames: ${numbers.join(", ")} ★`;
  return `Frames: ${numbers.slice(0, 3).join(", ")}... (${numbers.length} total) ★`;
}

/** A key's file name, as legacy names a path (`Path(path).name`). */
function fileName(key: string): string {
  return key.split("/").pop() ?? key;
}

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
  ai,
  rows,
  onRange,
}: TimelinePanelProps): ReactNode {
  const aiReady = ai === undefined || ai.available;
  // Propagation needs a video-capable model as well as a reachable service.
  const videoReady = aiReady && (ai === undefined || ai.videoCapable);
  const aiHint = aiHintFor(ai);
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
    readonly range: { readonly keys: readonly string[] };
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
  /** Flagged with Keep Flagged Masks off, so without masks: flagged at any Min Conf (SP-33). */
  const [discarded, setDiscarded] = useState<ReadonlySet<string>>(new Set());
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
  /*
   * LEGACY'S ZOOM, PAN AND SCRUB (`timeline_widget.py:132-148, 453-469, 565-595, 638-695`,
   * SEQUENCE_PARITY.md SP-43). At 1x every frame is on the bar; zoom goes to 30x in steps of 1.5,
   * showing that fraction of the frames from `offset` on. ◀ and ▶ pan by a quarter of what is shown,
   * the wheel by a tenth while zoomed, and a drag across the bar opens each frame it passes. The web
   * had one cell per frame and a click, so on a long sequence most frames could not be hit. The zoom
   * outlives a New Timeline, as legacy's does.
   */
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  const [zoomable, setZoomable] = useState<HTMLDivElement | null>(null);
  /** What the wheel and a drag act on, as of the last render: they arrive outside React. */
  const barView = useRef<{
    zoomed: boolean;
    first: number;
    maxOffset: number;
    visible: readonly number[];
    choose: (frame: Frame) => void;
    frameAt: (index: number) => Frame | undefined;
  }>({ zoomed: false, first: 0, maxOffset: 0, visible: [], choose: () => undefined, frameAt: () => undefined });
  useEffect(() => {
    if (zoomable === null) return;
    // Not passive, so a wheel that pans does not also scroll the page; unzoomed it passes, as
    // legacy's `wheelEvent` hands it on.
    const onWheel = (event: WheelEvent): void => {
      const { zoomed, first, maxOffset, visible } = barView.current;
      if (!zoomed || event.deltaY === 0) return;
      event.preventDefault();
      const by = Math.max(1, Math.floor(visible.length * WHEEL_STEP));
      setOffset(Math.max(0, Math.min(maxOffset, first + (event.deltaY < 0 ? -by : by))));
    };
    zoomable.addEventListener("wheel", onWheel, { passive: false });
    return () => zoomable.removeEventListener("wheel", onWheel);
  }, [zoomable]);
  /** A drag in progress: how to end it. */
  const scrubbing = useRef<(() => void) | null>(null);
  useEffect(() => () => scrubbing.current?.(), []);
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
  /*
   * LEGACY'S TIMELINE SETUP (`sequence_widget.py:135-208, 837-872`; `main_window.py:4897-4996`,
   * SEQUENCE_PARITY.md SP-41): Set Start and Set End take the image on screen, Clear forgets both,
   * and Build takes the list's rows from one to the other, inclusive, in the order the list shows
   * them. The web had two pickers defaulting to the first and last image, so one click built the
   * whole folder, and nothing showed the range in the list. Kept after Build, as legacy's is, until
   * New Timeline.
   */
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [between, setBetween] = useState<readonly string[]>([]);
  const listRows = rows ?? images;
  /** The rows from `from` to `to` in the list's order, inclusive, or none when either is not in it. */
  const rowsBetween = (from: string, to: string): readonly string[] => {
    const order = listRows.map((image) => image.key);
    const [a, b] = [order.indexOf(from), order.indexOf(to)];
    return a < 0 || b < 0 ? [] : order.slice(Math.min(a, b), Math.max(a, b) + 1);
  };

  const build = useCallback(
    (files: readonly string[]) => {
      const built = buildTimeline(files, 0, files.length - 1);
      setTimeline({ range: { keys: built.map((frame) => frame.key) }, overrides: null });
      setCurrent(0);
      if (built.length === 0) return;
      onOpen?.(built[0]!.key);
      notify({ severity: "info", message: `Timeline built: ${built.length} frames` });
    },
    [notify, onOpen],
  );
  // Whether the Sequence tab is showing: its keys act only there, as legacy's act only in sequence
  // mode, although the panel stays mounted on the other tabs.
  const active = useSequenceActive();

  // The range for the file list, while the Sequence tab is in use. Through a ref: the shell hands
  // down a new callback on every render.
  const onRangeNow = useRef(onRange);
  onRangeNow.current = onRange;
  const rangeKey = active ? `${start ?? ""}|${end ?? ""}|${between.join("|")}` : null;
  useEffect(() => {
    onRangeNow.current?.(rangeKey === null ? null : { start, end, between });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

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
   * THE CURSOR MOVES WHEN THE FRAME OPENS, not when it is asked for (SEQUENCE_PARITY.md SP-19).
   * The workspace saves the image being left first, or asks, and a Cancel at its question (Auto-Save
   * on Navigate off) refuses the open: the cursor stayed on a frame that was not on screen, and the
   * header, G and the trim bounds acted on it. Legacy's navigation always completes, so its frame on
   * screen is always the current one (`main_window.py:3414-3434`). With an image open the cursor
   * waits for `openKey`, which changes only once the open happens; with none open nothing can be
   * refused, and with no `onOpen` nothing opens at all, so it moves at once.
   */
  const choose = (frame: Frame): void => {
    if (onOpen === undefined || openKey === undefined) setCurrent(frame.index);
    onOpen?.(frame.key, propagatedFor(frame));
  };

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
      const frame = frames[next];
      if (frame !== undefined) choose(frame);
    },
    // `onOpen`, `openKey` and `propagated` stand for `choose`, which reads them: without
    // `propagated`, H and N handed a frame the masks of an earlier render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archetypes, current, frames, notify, onOpen, openKey, propagated],
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
  /*
   * RULE-048 AT MARK TIME, as legacy checks it (`main_window.py:3887-3908, 3934-3980`;
   * `sequence_view_mode.py:232-237`; SEQUENCE_PARITY.md SP-24, CONTROL_PARITY.md CP-27): the first
   * reference fixes the size, G refuses another, and + All Before and + All Labeled leave such
   * frames out and say how many. Nothing was checked, so a reference of another size silently
   * seeded nothing when the run began. Sizes come from the image's metadata, asked once per frame;
   * a size that cannot be read is taken at its word, as `markReferences` takes an unknown one.
   */
  const sizes = useRef(new Map<string, Promise<{ width: number; height: number } | null>>());
  const sizeOf = useCallback(
    (key: string): Promise<{ width: number; height: number } | null> => {
      const known = sizes.current.get(key);
      if (known !== undefined) return known;
      const asked =
        client === undefined
          ? Promise.resolve(null)
          : Promise.resolve()
              .then(() => client.imageMetadata("default", key))
              .then(
                (metadata) => ({ width: metadata.width, height: metadata.height }),
                () => null,
              );
      sizes.current.set(key, asked);
      return asked;
    },
    [client],
  );

  /** Which of `keys` may become references at the size the first reference fixed, in order, and how many may not. */
  const bySize = useCallback(
    async (keys: readonly string[]): Promise<{ accepted: string[]; skipped: number }> => {
      const first = frames.find((frame) => frame.isReference);
      let required = first === undefined ? null : await sizeOf(first.key);
      const measured = await Promise.all(keys.map((key) => sizeOf(key)));
      const accepted: string[] = [];
      let skipped = 0;
      keys.forEach((key, i) => {
        const size = measured[i] ?? null;
        if (size === null) accepted.push(key);
        else if (required === null) {
          required = size;
          accepted.push(key);
        } else if (size.width === required.width && size.height === required.height) accepted.push(key);
        else skipped += 1;
      });
      return { accepted, skipped };
    },
    [frames, sizeOf],
  );

  const markCurrent = useCallback(async () => {
    const frame = frames[current];
    if (frame === undefined) return;
    const first = frames.find((each) => each.isReference && each.key !== frame.key);
    // No client, no sizes to ask for: marked at once, as before.
    if (first !== undefined && client !== undefined) {
      const [size, required] = await Promise.all([sizeOf(frame.key), sizeOf(first.key)]);
      if (size !== null && required !== null && (size.width !== required.width || size.height !== required.height)) {
        notify({
          severity: "warning",
          message: `Cannot add reference: image is ${size.width}x${size.height} but reference requires ${required.width}x${required.height}`,
        });
        return;
      }
    }
    setOverrides((previous) => markReference(previous ?? frames, frame.index));
    notify({ severity: "info", message: `Added frame ${frame.index + 1} as reference` });
  }, [client, current, frames, notify, setOverrides, sizeOf]);
  useHotkey("add_reference_frame", () => {
    if (active) void markCurrent();
  });

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
  const discardedKey = [...discarded].sort().join("|");
  useEffect(() => {
    if (Object.keys(ownScores).length === 0) return;
    setOverrides((previous) => applyThreshold(previous ?? frames, ownScores, threshold, discarded));
    // `frames` is derived from `overrides`, so depending on it here would re-enter this effect on
    // its own result. The scores and the threshold are what should trigger a re-flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreKey, threshold, discardedKey]);

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
    else if (!aiReady) notify({ severity: "info", message: aiHint });
    else if (frames.length === 0) notify({ severity: "info", message: "Build a timeline first" });
    else void find();
  });
  useHotkey("next_suggested_frame", () => active && navigate("suggested", 1));
  useHotkey("prev_suggested_frame", () => active && navigate("suggested", -1));
  // Legacy's tooltips name the keys, " (N)"; from the user's own bindings here.
  const keyOf = useKeyHint();

  useEffect(() => {
    if (openKey === undefined) return;
    const at = shown.findIndex((frame) => frame.key === openKey);
    if (at >= 0) setCurrent(at);
  }, [openKey, shown]);

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

  if (frames.length === 0) {
    /** Set Start or Set End from the image on screen, in legacy's words (`main_window.py:4897-4923`). */
    const setBound = (which: "start" | "end"): void => {
      if (openKey === undefined) {
        notify({ severity: "info", message: "Please load an image first" });
        return;
      }
      const [nextStart, nextEnd] = which === "start" ? [openKey, end] : [start, openKey];
      setStart(nextStart);
      setEnd(nextEnd);
      // The list is coloured once both are set, over its rows between them then (1900-1965).
      setBetween(nextStart !== null && nextEnd !== null ? rowsBetween(nextStart, nextEnd) : []);
      notify({
        severity: "info",
        message: `${which === "start" ? "Start" : "End"} frame set: ${fileName(openKey)}`,
      });
    };
    return (
      <>
        {!videoReady && <PropagateHint active={active} hint={aiHint} />}
        <fieldset className="timeline__group">
          <legend>Timeline Setup</legend>
          <ol className="timeline__steps">
            {SETUP_STEPS.map((stepText) => (
              <li key={stepText}>{stepText}</li>
            ))}
          </ol>
          <p className="timeline__count">
            Start: <strong className="timeline__count--start">{start === null ? "Not set" : fileName(start)}</strong>
          </p>
          <p className="timeline__count">
            End: <strong className="timeline__count--end">{end === null ? "Not set" : fileName(end)}</strong>
          </p>
          <div className="timeline__controls">
            <button
              type="button"
              className="seq-button seq-button--green"
              title="Mark current file as sequence start"
              onClick={() => setBound("start")}
            >
              Set Start
            </button>
            <button
              type="button"
              className="seq-button seq-button--end"
              title="Mark current file as sequence end"
              onClick={() => setBound("end")}
            >
              Set End
            </button>
          </div>
          <div className="timeline__controls">
            <button
              type="button"
              title="Clear start/end selection"
              disabled={start === null && end === null}
              onClick={() => {
                setStart(null);
                setEnd(null);
                setBetween([]);
                notify({ severity: "info", message: "Sequence range cleared" });
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="seq-button seq-button--blue"
              title="Build timeline from selected range"
              disabled={start === null || end === null}
              onClick={() => {
                const files = start === null || end === null ? [] : rowsBetween(start, end);
                if (files.length === 0) notify({ severity: "info", message: "No files in selected range" });
                else build(files);
              }}
            >
              Build Timeline
            </button>
          </div>
        </fieldset>
      </>
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
    setDiscarded(new Set());
    // And the range, with its colours in the list, as legacy's exit clears both (main_window.py:5017-5025).
    setStart(null);
    setEnd(null);
    setBetween([]);
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
    const labelledKeys = frames.filter((frame) => labelled.has(frame.key)).map((frame) => frame.key);
    const { accepted, skipped } =
      client === undefined ? { accepted: labelledKeys, skipped: 0 } : await bySize(labelledKeys);
    setOverrides((previous) => markReferences(previous ?? frames, new Set(accepted)));
    notify({
      severity: "info",
      message: `Added ${accepted.length} labeled frames as references`
        + (skipped > 0 ? ` (${skipped} skipped: dimension mismatch)` : ""),
    });
  };

  /** + All Before, over the frames left of the current one ON SCREEN, at the reference size. */
  const markAllBeforeChecked = async () => {
    const before = framesBefore(frames, current, order);
    if (before.length === 0) {
      notify({ severity: "info", message: "No frames before current position" });
      return;
    }
    const beforeKeys = before.map((frame) => frame.key);
    const { accepted, skipped } =
      client === undefined ? { accepted: beforeKeys, skipped: 0 } : await bySize(beforeKeys);
    setOverrides((previous) => markReferences(previous ?? frames, new Set(accepted)));
    notify({
      severity: "info",
      message: `Added ${accepted.length} frames as references`
        + (skipped > 0 ? ` (${skipped} skipped: dimension mismatch)` : ""),
    });
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
    // Over the order on screen when sorted (SP-27).
    const outcome = trim(
      frames,
      bounds[0],
      bounds[1],
      mode,
      current,
      sortKeys === null ? undefined : keptOrder(sortKeys, shown),
    );
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
    setDiscarded(new Set());
    setOverrides((previous) => resetForPropagation(previous ?? frames));
  };

  const counts = summarize(frames);
  const order = sortKeys === null ? shown.map((frame) => frame.index) : keptOrder(sortKeys, shown);
  const allScores = { ...scores, ...ownScores };
  // What N and Shift+N move between: flagged frames that are not references.
  const flaggedCount = frames.filter((frame) => !frame.isReference && frame.state === "flagged").length;

  // The frames on the bar at this zoom: `visibleCount` of them from `first`, as legacy's
  // `_calculate_geometry` counts them (`timeline_widget.py:228-247`).
  const total = order.length;
  const countAt = (level: number): number => Math.max(1, Math.floor(total / level));
  const visibleCount = countAt(zoom);
  const maxOffset = Math.max(0, total - visibleCount);
  const first = Math.min(offset, maxOffset);
  const visible = order.slice(first, first + visibleCount);
  const zoomed = zoom > 1;
  barView.current = {
    zoomed,
    first,
    maxOffset,
    visible,
    choose,
    frameAt: (index) => shown[index],
  };

  /*
   * Centred on the current frame as legacy centres it: over the count shown BEFORE the zoom, which
   * its widget has not recomputed yet when `center_on_frame` runs (`timeline_widget.py:132-148`;
   * `ZoomableTimeline._zoom_in`, 640-644), clamped to what that count allows.
   */
  const centreOn = (): void => {
    const at = Math.max(0, order.indexOf(current));
    setOffset(Math.max(0, Math.min(total - visibleCount, at - Math.floor(visibleCount / 2))));
  };
  const zoomIn = (): void => {
    setZoom(Math.min(MAX_ZOOM, zoom * ZOOM_STEP));
    centreOn();
  };
  const zoomOut = (): void => {
    let next = Math.max(1, zoom / ZOOM_STEP);
    if (Math.abs(next - 1) < 0.05) next = 1;
    setZoom(next);
    if (next <= 1) setOffset(0);
    else centreOn();
  };
  const pan = (direction: 1 | -1): void => {
    const by = Math.max(1, Math.floor(visibleCount * PAN_STEP));
    setOffset(Math.max(0, Math.min(maxOffset, first + direction * by)));
  };

  /*
   * A press on the bar opens the frame under the pointer, and dragging opens each frame it passes,
   * once, as legacy's `mousePressEvent` and `mouseMoveEvent` do (`timeline_widget.py:453-469`). The
   * position is read across the bar, so a drag past either end holds the end frame, as legacy's
   * `_x_to_frame` clamps it. The click that follows is then ignored: a click from the keyboard,
   * which has no press, still opens its frame.
   */
  const startScrub = (event: ReactMouseEvent<HTMLOListElement>): void => {
    if (event.button !== 0) return;
    const bar = event.currentTarget;
    let last: number | null = null;
    const go = (clientX: number): void => {
      const { visible: onBar, frameAt, choose: open } = barView.current;
      const rect = bar.getBoundingClientRect();
      if (rect.width <= 0 || onBar.length === 0) return;
      const slot = Math.floor(((clientX - rect.left) / rect.width) * onBar.length);
      const frame = frameAt(onBar[Math.min(onBar.length - 1, Math.max(0, slot))]!);
      if (frame === undefined || frame.index === last) return;
      last = frame.index;
      open(frame);
    };
    const move = (moved: MouseEvent): void => {
      if ((moved.buttons & 1) === 0) stop();
      else go(moved.clientX);
    };
    const stop = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      scrubbing.current = null;
    };
    scrubbing.current?.();
    scrubbing.current = stop;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    go(event.clientX);
  };

  // Min Conf and Hist, in the Propagation row as legacy's are; hidden without AI, as it is.
  const confidence = videoReady ? (
    <ConfidencePanel
      scores={allScores}
      threshold={threshold}
      onThreshold={(value) => {
        const next = clampThreshold(value);
        void save({ ...settings, values: { ...settings.values, propagation_confidence_threshold: next } });
        // The TIMELINE moves with the number, not only the set a save would use. Legacy
        // recomputes one and not the other, so the colours point at one set of frames to review
        // while Save All skips another -- and nothing says the two disagree.
        setOverrides(applyThreshold(frames, allScores, next, discarded));
      }}
    />
  ) : null;

  /** A trim bound as legacy's labels show it: the frame's file name, or "Not set". */
  const boundName = (at: number | null): string => {
    const frame = at === null ? undefined : frames[at];
    return frame === undefined ? "Not set" : (frame.key.split("/").pop() ?? frame.key);
  };

  /**
   * Clear Suggested: the purple frames back to pending and the list emptied, as legacy's
   * `clear_suggested_frames` does (`sequence_view_mode.py:502-509`, `main_window.py:5170-5181`).
   */
  const clearSuggestions = () => {
    setOverrides((previous) => clearSuggested(previous ?? frames));
    setArchetypes([]);
    onArchetypes?.([]);
  };

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
          while a frame is at least 4px wide -- about 230 frames across the centre pane. With its
          zoom and pan row under it (565-611), and the wheel over both. */}
      <div className="timeline__zoomable" ref={setZoomable}>
      <div className="timeline__bar-row">
      <ol
        className={`timeline__frames${visible.length > 230 ? " timeline__frames--dense" : ""}`}
        aria-label="Timeline"
        onMouseDown={startScrub}
      >
        {visible.map((index) => {
          const frame = shown[index];
          if (frame === undefined) return null;
          const [r, g, b] = colourOf(frame);
          const role = frame.isReference ? "reference" : frame.state;

          return (
            <li key={frame.key}>
              <button
                type="button"
                // Legacy's red trim triangles above the bar, ◄ on the left bound and ► on the right
                // (timeline_widget.py:380-420), under the blue current-frame marker.
                className={
                  "timeline__frame"
                  + (index === current ? " timeline__frame--current" : "")
                  + (index === bounds[0] ? " timeline__frame--trim-left" : "")
                  + (index === bounds[1] ? " timeline__frame--trim-right" : "")
                }
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
                // A mouse press has opened it already (a click's `detail` counts presses); from the
                // keyboard there is none, and the click opens it.
                onClick={(event) => {
                  if (event.detail === 0) choose(frame);
                }}
              />
            </li>
          );
        })}
      </ol>
        {/* Legacy's Save All sits here, right of the bar (main_window.py:3296-3305). */}
        <div className="timeline__save" ref={setSaveSlot} />
      </div>
      <div className="timeline__controls timeline__bar-controls">
        <button
          type="button"
          aria-label="Pan left"
          title="Pan left"
          disabled={!zoomed || first <= 0}
          onClick={() => pan(-1)}
        >
          ◀
        </button>
        <button type="button" aria-label="Zoom out timeline" title="Zoom out timeline" disabled={!zoomed} onClick={zoomOut}>
          −
        </button>
        <button
          type="button"
          aria-label="Zoom in timeline"
          title="Zoom in timeline"
          disabled={zoom >= MAX_ZOOM}
          onClick={zoomIn}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Pan right"
          title="Pan right"
          disabled={!zoomed || first >= maxOffset}
          onClick={() => pan(1)}
        >
          ▶
        </button>
        <span className="timeline__spacer" />
        {videoReady && (
          <button type="button" onClick={() => setOverrides(clearFlags(frames))}>
            Clear flags
          </button>
        )}
        <button
          type="button"
          onClick={() => setSortKeys((keys) => (keys === null ? sortedKeys(shown) : null))}
        >
          {sorted ? "Unsort" : "Sort"}
        </button>
      </div>
      </div>

      {/* Legacy's Reference Frames group (sequence_widget.py:210-289): which frames are references,
          the four buttons, and Find Archetypes with Clear Suggested. The reference half goes with
          propagation, Find Archetypes with the service (SP-31). */}
      {(videoReady || (client !== undefined && aiReady)) && (
        <fieldset className="timeline__group">
          <legend>Reference Frames</legend>
          {videoReady && (
            <>
              <p className="timeline__count">
                References: <strong className="timeline__count--reference">{referenceList(frames)}</strong>
              </p>
              <div className="timeline__controls">
                <button
                  type="button"
                  title={`Add current frame as reference for propagation${keyOf("add_reference_frame")}`}
                  onClick={() => void markCurrent()}
                >
                  + Add Current
                </button>
                {/* "Before" is to the left ON SCREEN, so a sorted timeline adds what is to the left. */}
                <button
                  type="button"
                  title="Add all frames before current position as references"
                  onClick={() => void markAllBeforeChecked()}
                >
                  + All Before
                </button>
              </div>
              <div className="timeline__controls">
                <button
                  type="button"
                  title="Add all frames with existing labels (NPZ files) as references"
                  onClick={() => void markAllLabeled()}
                >
                  + All Labeled
                </button>
                <button
                  type="button"
                  title="Clear all reference frames"
                  disabled={counts.references === 0}
                  onClick={() => {
                    setOverrides(clearReferences(frames));
                    notify({ severity: "info", message: "Cleared all reference frames" });
                  }}
                >
                  Clear All
                </button>
              </div>
            </>
          )}
          {client !== undefined && aiReady && (
            <div className="timeline__controls">
              <button
                type="button"
                // Legacy's Abort while it runs (sequence_widget.py:579-590), red as Propagate's is.
                className={`seq-button ${finding ? "seq-button--red" : "seq-button--purple"}`}
                onClick={() => void find()}
              >
                {finding ? "Abort" : "Find archetypes"}
              </button>
              {/* Enabled only with suggestions (sequence_widget.py:281-285, 601-608). */}
              <button
                type="button"
                title="Clear AI-suggested reference highlights"
                disabled={archetypes.length === 0}
                onClick={clearSuggestions}
              >
                Clear Suggested
              </button>
            </div>
          )}
        </fieldset>
      )}

      {!videoReady && <PropagateHint active={active} hint={aiHint} />}
      {client !== undefined && videoReady && (
        <PropagationControl
          client={client}
          frames={shown}
          saveSlot={saveSlot}
          onScores={setOwnScores}
          unsavedRef={unsavedRef}
          confirmDiscard={confirmDiscard}
          onSegments={setPropagated}
          onSkipped={setKeptLabels}
          onDiscarded={setDiscarded}
          onLeftOut={(keys) => setOverrides((previous) => markSkipped(previous ?? frames, keys))}
          onSaved={(keys) => setOverrides((previous) => markSaved(previous ?? frames, keys))}
          {...(savedElsewhere === undefined ? {} : { savedElsewhere })}
          {...(openAnnotations === undefined ? {} : { openAnnotations })}
          onRunStart={dropRun}
          onCleared={dropRun}
          options={confidence}
        />
      )}

      {/* Legacy's Review group (sequence_widget.py:410-466): the counts, and Prev and Next for
          each, enabled only when there is one to go to. Hidden without AI, as legacy's is. */}
      {aiReady && (
        <fieldset className="timeline__group">
          <legend>Review</legend>
          <p className="timeline__count">
            Suggested refs: <strong className="timeline__count--suggested">{archetypes.length}</strong>
          </p>
          <div className="timeline__controls">
            <button
              type="button"
              title="Go to previous suggested reference frame"
              disabled={archetypes.length === 0}
              onClick={() => navigate("suggested", -1)}
            >
              ← Prev Suggested
            </button>
            <button
              type="button"
              title="Go to next suggested reference frame"
              disabled={archetypes.length === 0}
              onClick={() => navigate("suggested", 1)}
            >
              Next Suggested →
            </button>
          </div>
          <p className="timeline__count">
            Flagged frames: <strong className="timeline__count--flagged">{flaggedCount}</strong>
          </p>
          <div className="timeline__controls">
            <button
              type="button"
              title={`Go to previous flagged frame${keyOf("prev_flagged_frame")}`}
              disabled={flaggedCount === 0}
              onClick={() => navigate("flagged", -1)}
            >
              ← Prev Flagged
            </button>
            <button
              type="button"
              title={`Go to next flagged frame${keyOf("next_flagged_frame")}`}
              disabled={flaggedCount === 0}
              onClick={() => navigate("flagged", 1)}
            >
              Next Flagged →
            </button>
          </div>
        </fieldset>
      )}

      {/* Legacy's Trim group (sequence_widget.py:468-539, 934-940): the bounds by file name, set
          from the current frame, Clear Trim with either set, Cut and Keep only with both. Shown
          without AI too, as legacy's is. */}
      <fieldset className="timeline__group">
        <legend>Trim</legend>
        <p className="timeline__count">
          Left: <strong className="timeline__count--trim">{boundName(bounds[0])}</strong>
        </p>
        <p className="timeline__count">
          Right: <strong className="timeline__count--trim">{boundName(bounds[1])}</strong>
        </p>
        <div className="timeline__controls">
          <button
            type="button"
            title="Mark current frame as trim left bound"
            onClick={() => setBounds([current, bounds[1]])}
          >
            Set Left
          </button>
          <button
            type="button"
            title="Mark current frame as trim right bound"
            onClick={() => setBounds([bounds[0], current])}
          >
            Set Right
          </button>
        </div>
        <div className="timeline__controls">
          <button
            type="button"
            title="Reset trim selection"
            disabled={bounds[0] === null && bounds[1] === null}
            onClick={() => setBounds([null, null])}
          >
            Clear Trim
          </button>
          <button
            type="button"
            className="seq-button seq-button--brown"
            title="Remove all frames within the selected range (inclusive)"
            disabled={bounds[0] === null || bounds[1] === null}
            onClick={() => applyTrim("cut")}
          >
            Cut
          </button>
          <button
            type="button"
            className="seq-button seq-button--dark-green"
            title={"Keep only the frames within the selected range,\nremove everything outside it"}
            disabled={bounds[0] === null || bounds[1] === null}
            onClick={() => applyTrim("keep")}
          >
            Keep
          </button>
        </div>
      </fieldset>

      {/* Last, as legacy's is (sequence_widget.py:541-553). */}
      <div className="timeline__controls">
        <button type="button" className="seq-button seq-button--brown" onClick={startOver}>
          New timeline
        </button>
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

      {/* Without a propagation control to sit in, Min Conf stands alone. */}
      {client === undefined && confidence}

      <p className="panel__missing">
        Propagation agrees with legacy frame for frame on a recorded test clip: the masks, the
        flags, Keep flagged masks, Skip labeled and Save All. What has not been shown is the same
        for a sequence longer than the streaming window, which no recording covers yet.
      </p>
    </div>
  );
}

/**
 * Min Conf, and the "Hist" button beside it -- legacy's (`sequence_widget.py:383-404`,
 * `main_window.py:4725-4739`, SEQUENCE_PARITY.md SP-47). The number is the persisted setting that
 * decides what is flagged and what Save All writes (RULE-060). Hist opens the histogram, whose line
 * is dragged and applied; with no scores it says so, as legacy's does.
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
  const { notify } = useNotifications();
  // The scores as they were when it opened: legacy's dialog is handed a list, not a live view.
  const [shownScores, setShownScores] = useState<readonly number[] | null>(null);

  return (
    <span className="confidence">
      <label>
        Min Conf:{" "}
        <input
          type="number"
          min={0}
          max={1}
          step={THRESHOLD_STEP}
          value={threshold}
          aria-label="Minimum confidence"
          title={
            "Minimum confidence threshold (0-1).\nFrames scoring below this are flagged red\n"
            + "for manual review. Default 0.99 is strict."
          }
          onChange={(event) => onThreshold(Number(event.target.value))}
        />
      </label>
      <button
        type="button"
        title="Show confidence score histogram"
        onClick={() => {
          const values = Object.values(scores);
          if (values.length === 0) notify({ severity: "info", message: "No confidence scores available yet" });
          else setShownScores(values);
        }}
      >
        Hist
      </button>
      {shownScores !== null && (
        <HistogramDialog
          scores={shownScores}
          threshold={threshold}
          onApply={(value) => {
            setShownScores(null);
            onThreshold(value);
          }}
          onClose={() => setShownScores(null)}
        />
      )}
    </span>
  );
}

/** The histogram's drawing area, in legacy's pixels (`confidence_histogram_dialog.py:26-31`). */
const PLOT = { width: 580, height: 300, left: 50, top: 20, right: 20, bottom: 30 } as const;
const PLOT_W = PLOT.width - PLOT.left - PLOT.right;
const PLOT_H = PLOT.height - PLOT.top - PLOT.bottom;
/** Legacy's colours: a dark plot in either theme, green and red bars, a gold threshold. */
const HIST = { ground: "rgb(43 43 43)", above: "rgb(76 175 80)", below: "rgb(244 67 54)", gold: "rgb(255 193 7)", text: "rgb(200 200 200)", grid: "rgb(70 70 70)" } as const;

/** Python's `f"{x:.0f}"`, which rounds an exact half to even. */
function wholePercent(value: number): string {
  const floor = Math.floor(value);
  return String(value - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value));
}

/**
 * Legacy's "Confidence Score Distribution" (`confidence_histogram_dialog.py:21-303`): fifty bins
 * from just under the lowest score to 1, a bar green from the bin holding the threshold up and red
 * below it, the gold line with a triangle at each end, the counts either side, and the threshold
 * dragged by its line -- the view rescaling as it moves, as legacy's does. Apply sets Min Conf;
 * Close and Escape leave it.
 *
 * AN SVG, not a canvas: fifty rectangles and a line, which a test and a screen reader can read.
 */
function HistogramDialog({
  scores,
  threshold,
  onApply,
  onClose,
}: {
  readonly scores: readonly number[];
  readonly threshold: number;
  readonly onApply: (value: number) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [value, setValue] = useState(Math.max(0, Math.min(1, threshold)));
  const view = histogram(scores, value);
  const span = view.to - view.from;
  const tallest = Math.max(1, ...view.bins);
  const binWidth = PLOT_W / view.bins.length;
  const cut = span > 0 ? Math.trunc(((value - view.from) / span) * view.bins.length) : 0;
  const lineX = PLOT.left + thresholdPosition(view, value) * PLOT_W;
  const below = scores.filter((score) => score < value).length;
  const above = scores.length - below;
  const total = scores.length || 1;

  const yTicks = [...new Set(niceTicks(0, tallest, 5).map((tick) => Math.max(0, Math.round(tick))))].sort((a, b) => a - b);
  if (yTicks.at(-1) !== tallest) yTicks.push(tallest);
  if (!yTicks.includes(0)) yTicks.unshift(0);
  const xTicks = niceTicks(view.from, view.to, 6);
  const labelX = lineX + 4 + 50 > PLOT.left + PLOT_W ? lineX - 54 : lineX + 4;

  // What a drag reads: the view at the last render, as legacy maps x through its current range.
  const live = useRef({ from: view.from, span });
  live.current = { from: view.from, span };
  const svg = useRef<SVGSVGElement>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const startDrag = (event: ReactMouseEvent<SVGSVGElement>): void => {
    const rect = svg.current?.getBoundingClientRect();
    if (event.button !== 0 || rect === undefined || rect.width <= 0) return;
    const scale = rect.width / PLOT.width;
    // Within 8 pixels of the line, as legacy's press is (`confidence_histogram_dialog.py:234-238`).
    if (Math.abs(event.clientX - (rect.left + lineX * scale)) >= 8) return;
    event.preventDefault();
    const move = (moved: MouseEvent): void => {
      const box = svg.current?.getBoundingClientRect();
      if (box === undefined || box.width <= 0) return;
      const x = ((moved.clientX - box.left) / box.width) * PLOT.width;
      const { from, span: range } = live.current;
      setValue(Math.max(0, Math.min(1, from + ((x - PLOT.left) / PLOT_W) * range)));
    };
    const stop = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      stopDrag.current = null;
    };
    stopDrag.current?.();
    stopDrag.current = stop;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };

  return (
    <Dialog title="Confidence Score Distribution" onClose={onClose} closeButton={false}>
      <p>{scores.length} frames with confidence scores</p>
      <svg
        ref={svg}
        className="confidence__chart"
        viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
        role="img"
        aria-label="Confidence score histogram"
        onMouseDown={startDrag}
      >
        <rect width={PLOT.width} height={PLOT.height} fill={HIST.ground} />
        {view.bins.map((count, bin) => {
          if (count === 0) return null;
          const height = Math.trunc((count / tallest) * PLOT_H);
          return (
            <rect
              key={bin}
              className={bin >= cut ? "confidence__bar--above" : "confidence__bar--below"}
              x={Math.trunc(PLOT.left + bin * binWidth)}
              y={Math.trunc(PLOT.top + PLOT_H - height)}
              width={Math.max(Math.trunc(binWidth), 1)}
              height={height}
              fill={bin >= cut ? HIST.above : HIST.below}
            />
          );
        })}
        {yTicks.map((tick) => {
          const y = PLOT.top + PLOT_H - Math.trunc((tick / tallest) * PLOT_H);
          return (
            <g key={`y${tick}`}>
              <text x={PLOT.left - 4} y={y + 4} textAnchor="end" fill={HIST.text} fontSize={11}>
                {tick}
              </text>
              {tick > 0 && tick < tallest && (
                <line x1={PLOT.left} x2={PLOT.left + PLOT_W} y1={y} y2={y} stroke={HIST.grid} strokeDasharray="1 2" />
              )}
            </g>
          );
        })}
        {xTicks.map((tick) => {
          const x = span > 0 ? PLOT.left + Math.trunc(((tick - view.from) / span) * PLOT_W) : PLOT.left;
          return (
            <g key={`x${tick}`}>
              <line x1={x} x2={x} y1={PLOT.top + PLOT_H} y2={PLOT.top + PLOT_H + 4} stroke={HIST.text} />
              <text x={x} y={PLOT.top + PLOT_H + 17} textAnchor="middle" fill={HIST.text} fontSize={11}>
                {tick.toFixed(span >= 0.5 ? 1 : 2)}
              </text>
            </g>
          );
        })}
        <line
          className="confidence__threshold"
          x1={lineX}
          x2={lineX}
          y1={PLOT.top}
          y2={PLOT.top + PLOT_H}
          stroke={HIST.gold}
          strokeWidth={2}
        />
        <polygon
          points={`${lineX},${PLOT.top} ${lineX - 6},${PLOT.top - 6} ${lineX + 6},${PLOT.top - 6}`}
          fill={HIST.gold}
        />
        <polygon
          points={`${lineX},${PLOT.top + PLOT_H} ${lineX - 6},${PLOT.top + PLOT_H + 6} ${lineX + 6},${PLOT.top + PLOT_H + 6}`}
          fill={HIST.gold}
        />
        {/* The hand cursor's band: 8 pixels either side of the line, as legacy's hit test is. */}
        <rect className="confidence__grip" x={lineX - 8} y={PLOT.top} width={16} height={PLOT_H} fill="transparent" />
        <text x={PLOT.left + 4} y={PLOT.top + 14} fill={HIST.below} fontSize={12}>
          Below: {below} ({wholePercent((below / total) * 100)}%)
        </text>
        <text x={PLOT.left + PLOT_W - 140} y={PLOT.top + 14} fill={HIST.above} fontSize={12}>
          Above: {above} ({wholePercent((above / total) * 100)}%)
        </text>
        <text x={labelX} y={PLOT.top + PLOT_H - 4} fill={HIST.gold} fontSize={12}>
          {value.toFixed(4)}
        </text>
      </svg>
      <p>Threshold: {value.toFixed(4)}</p>
      <div className="dialog__actions">
        <button type="button" onClick={() => onApply(value)}>
          Apply
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
