/**
 * One channel's threshold bar — legacy's `MultiIndicatorSlider`
 * (`ui/widgets/channel_threshold_widget.py:22-313`), drawn and handled the way it is.
 *
 * - DOUBLE-CLICK the track to add a marker. Within ten levels of one already there, nothing
 *   happens (lines 241-258).
 * - DRAG a handle to move it. It follows the pointer from where it was grabbed, clamped to the bar,
 *   and may pass other markers (260-272).
 * - RIGHT-CLICK a handle to remove it; where handles overlap, the first in the list goes (282-297).
 * - The bands between markers are shaded from faint to strong, darkest band first, the way the
 *   thresholding will map them (106-152). Values are written under the handles (154-219).
 *
 * The geometry and the rules are in `thresholdBar.ts`, held to numbers recorded from legacy's own
 * widget. This file turns pointer events into those calls and draws the result in SVG, in legacy's
 * paint order.
 *
 * A DRAG IS SHOWN LIVE AND COMMITTED ON RELEASE. The handle and the bands follow the pointer at
 * once; the image is asked for once, when the handle is let go. Legacy re-renders the image during
 * the drag when Operate On View is off (`image_adjustment_manager.py:178-193`), from pixels already
 * in memory. Here every change is a round trip to the server, and the canvas restarts its tiles on
 * each one, so a live image would flicker rather than follow. Legacy's own behaviour with Operate
 * On View on — the image once, on release — is what this does always.
 */

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import {
  BAR_HEIGHT,
  BAR_MIN_WIDTH,
  CHANNEL_COLOURS,
  bandsOf,
  handleAt,
  labelsOf,
  sameMarkers,
  trackOf,
  valueToX,
  withMarkerAt,
  withMarkerMoved,
  type BarChannel,
} from "./thresholdBar.js";

export interface ThresholdBarProps {
  /** Legacy's name for the channel, drawn at the bar's top left and choosing its colour. */
  readonly channel: BarChannel;
  /** 256 for an 8-bit image, 65536 for 16-bit. */
  readonly maximum: number;
  /** The markers in LIST order, which a drag can leave unsorted, as legacy's list can be. */
  readonly markers: readonly number[];
  /** The checkbox beside the bar. Unticked, the bar takes no input: legacy disables it. */
  readonly enabled: boolean;
  /** A new list, after a double-click, a right-click, or when a dragged handle is let go. */
  readonly onChange: (markers: number[]) => void;
}

interface Drag {
  readonly index: number;
  readonly offset: number;
  live: number[];
}

export function ThresholdBar({ channel, maximum, markers, enabled, onChange }: ThresholdBarProps): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(BAR_MIN_WIDTH);
  // The drag itself lives in a ref, so the capture-lost event that follows a release sees that the
  // release already ended it; the state is what the drawing reads.
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<{ readonly markers: readonly number[]; readonly index: number } | null>(null);

  // The track is sized in pixels from the bar's width, as legacy's is, so the width is measured.
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return undefined;
    const measure = () => setWidth(Math.max(BAR_MIN_WIDTH, element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** A pointer in the bar's own pixels, and the track at the bar's width right now. */
  const local = (event: { clientX: number; clientY: number; currentTarget: Element }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      track: trackOf(Math.max(BAR_MIN_WIDTH, rect.width)),
    };
  };

  const finish = () => {
    const ended = drag.current;
    if (ended === null) return;
    drag.current = null;
    setLive(null);
    if (!sameMarkers(ended.live, markers)) onChange(ended.live);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) return;
    const { x, y, track } = local(event);
    const index = handleAt(markers, x, y, maximum, track);
    if (index < 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, offset: x - valueToX(markers[index]!, maximum, track), live: [...markers] };
    setLive({ markers: drag.current.live, index });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null) return;
    const { x, track } = local(event);
    current.live = withMarkerMoved(current.live, current.index, x, current.offset, maximum, track);
    setLive({ markers: current.live, index: current.index });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    finish();
  };

  const track = trackOf(width);
  const shown = live?.markers ?? markers;
  const [red, green, blue] = CHANNEL_COLOURS[channel];

  return (
    <div
      ref={box}
      className={live === null ? "threshold-bar" : "threshold-bar threshold-bar--dragging"}
      role="group"
      aria-label={`${channel} threshold`}
      aria-disabled={!enabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={(event) => {
        if (!enabled || event.button !== 0) return;
        const { x, y, track: at } = local(event);
        const next = withMarkerAt(markers, x, y, maximum, at);
        if (next !== null) onChange(next);
      }}
      onContextMenu={(event) => {
        // No browser menu over the bar, whatever is under the pointer: legacy shows none.
        event.preventDefault();
        if (!enabled || drag.current !== null) return;
        const { x, y, track: at } = local(event);
        const index = handleAt(markers, x, y, maximum, at);
        if (index >= 0) onChange(markers.filter((_, position) => position !== index));
      }}
    >
      <svg className="threshold-bar__drawing" width="100%" height={BAR_HEIGHT}>
        <text className="threshold-bar__text" x={5} y={15}>
          {channel}
        </text>
        <rect
          className="threshold-bar__track"
          x={track.left}
          y={track.top}
          width={track.width}
          height={track.height}
          rx={5}
          ry={5}
        />
        {bandsOf(shown, maximum, track).map((band, index) => (
          <rect
            key={`band-${index}`}
            className="threshold-bar__band"
            x={band.x}
            y={track.top}
            width={band.width}
            height={track.height}
            rx={5}
            ry={5}
            fill={`rgb(${red} ${green} ${blue})`}
            fillOpacity={band.alpha / 255}
          />
        ))}
        {shown.map((value, index) => (
          <rect
            key={`handle-${index}`}
            className={
              live?.index === index
                ? "threshold-bar__handle threshold-bar__handle--dragging"
                : "threshold-bar__handle"
            }
            data-marker={value}
            x={valueToX(value, maximum, track) - 6}
            y={track.top - 3}
            width={12}
            height={track.height + 6}
            rx={3}
            ry={3}
          />
        ))}
        {labelsOf(shown, maximum, track).map((label, index) => (
          <text key={`label-${index}`} className="threshold-bar__text" x={label.x} y={label.y}>
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
