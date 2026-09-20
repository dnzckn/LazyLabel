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
 * NO PROPAGATION BUTTON. There is nothing behind it yet, and a control that does nothing is the
 * thing this codebase refuses to ship. What is here is the timeline, its counts, its sort and its
 * navigation.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { WireDatasetImage } from "@lazylabel/contracts";

import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";

import {
  buildTimeline,
  clearFlags,
  colourOf,
  markReferences,
  sortedOrder,
  step,
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
  readonly onOpen?: (key: string) => void;
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
}

export function TimelinePanel({ images, onOpen, scores = {} }: TimelinePanelProps): ReactNode {
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [overrides, setOverrides] = useState<readonly Frame[] | null>(null);
  const [sorted, setSorted] = useState(false);
  const [current, setCurrent] = useState(0);
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
    // Sizes are not known here, so RULE-048's check defers: `markReferences` takes a frame at its
    // word when it cannot measure it. The mismatch is caught when the frames are actually staged,
    // which is the propagation slice's problem and not the pilot's.
    return markReferences(buildTimeline(keys, range.from, range.to), annotated);
  }, [annotated, keys, overrides, range]);

  const build = useCallback(
    (from: number, to: number) => {
      setOverrides(null);
      setCurrent(0);
      setRange({ from, to });
    },
    [],
  );

  const navigate = useCallback(
    (target: Target, direction: 1 | -1) => {
      const next = step(frames, current, target, direction);
      if (next === null) return;
      setCurrent(next);
      const frame = frames[next];
      if (frame !== undefined) onOpen?.(frame.key);
    },
    [current, frames, onOpen],
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
  useHotkey("next_flagged_frame", () => navigate("flagged", 1));
  useHotkey("prev_flagged_frame", () => navigate("flagged", -1));
  useHotkey("next_reference_frame", () => navigate("reference", 1));
  useHotkey("prev_reference_frame", () => navigate("reference", -1));
  useHotkey("next_suggested_frame", () => navigate("suggested", 1));
  useHotkey("prev_suggested_frame", () => navigate("suggested", -1));

  if (images.length === 0) {
    return <p className="panel__missing">A sequence is built from a folder of images.</p>;
  }

  if (frames.length === 0) {
    return (
      <RangePicker images={images} onBuild={build} />
    );
  }

  const counts = summarize(frames);
  const order = sorted ? sortedOrder(frames) : frames.map((frame) => frame.index);

  return (
    <div className="timeline">
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
      </p>

      <ol className="timeline__frames" aria-label="Timeline">
        {order.map((index) => {
          const frame = frames[index];
          if (frame === undefined) return null;
          const [r, g, b] = colourOf(frame);
          const role = frame.isReference ? "reference" : frame.state;

          return (
            <li key={frame.key}>
              <button
                type="button"
                className={`timeline__frame${index === current ? " timeline__frame--current" : ""}`}
                style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
                // Named, not coloured only. The colour is how a user reads the timeline at a
                // glance and it is the only thing legacy offers; a screen reader gets nothing
                // from it, and neither does anyone who cannot separate the red from the brown.
                aria-label={`Frame ${index + 1}, ${frame.key}, ${role}`}
                title={`${frame.key} — ${role}`}
                onClick={() => {
                  setCurrent(index);
                  onOpen?.(frame.key);
                }}
              />
            </li>
          );
        })}
      </ol>

      <div className="timeline__controls">
        <button type="button" onClick={() => setSorted((on) => !on)}>
          {sorted ? "Unsort" : "Sort"}
        </button>
        <button type="button" onClick={() => navigate("flagged", 1)}>
          Next flagged
        </button>
        <button type="button" onClick={() => navigate("reference", 1)}>
          Next reference
        </button>
        <button type="button" onClick={() => setOverrides(clearFlags(frames))}>
          Clear flags
        </button>
        <button type="button" onClick={() => { setRange(null); setOverrides(null); }}>
          New timeline
        </button>
      </div>

      <ConfidencePanel
        scores={scores}
        threshold={threshold}
        onThreshold={(value) => {
          const next = clampThreshold(value);
          void save({ ...settings, values: { ...settings.values, propagation_confidence_threshold: next } });
          // The TIMELINE moves with the number, not only the set a save would use. Legacy
          // recomputes one and not the other, so the colours point at one set of frames to review
          // while Save All skips another -- and nothing says the two disagree.
          setOverrides(applyThreshold(frames, scores, next));
        }}
      />

      <p className="panel__missing">
        Propagation is the next slice and is not built. It waits on a recorded sequence with
        legacy's outputs captured as golden data, which is what proves the port agrees frame for
        frame — see `capture_propagation_goldens.py`.
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
      <button type="button" onClick={() => onBuild(from, to)}>
        Build timeline
      </button>
      <p className="panel__missing">
        Frames that already have annotations become references — propagation runs from them rather
        than over them.
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
