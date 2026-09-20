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

export interface TimelinePanelProps {
  /** The folder as the browser listed it, in its order. */
  readonly images: readonly WireDatasetImage[];
  /** Opening a frame is the workspace's job, not the timeline's. */
  readonly onOpen?: (key: string) => void;
}

export function TimelinePanel({ images, onOpen }: TimelinePanelProps): ReactNode {
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [overrides, setOverrides] = useState<readonly Frame[] | null>(null);
  const [sorted, setSorted] = useState(false);
  const [current, setCurrent] = useState(0);

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
