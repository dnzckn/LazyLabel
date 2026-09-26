/**
 * The Rescale window — legacy's `RescaleSlider` (`ui/widgets/rescale_widget.py:25-180`), one track
 * with a min and a max handle, drawn and handled the way it is.
 *
 * - DRAG a handle to move it. It follows the pointer from where it was grabbed, clamped to the
 *   range, and stops at the other handle: the two can never cross (lines 155-167).
 * - Where they overlap, a press takes the max handle (lines 143-153).
 * - The track between them is highlighted and each value is written under its handle (95-138).
 *
 * The geometry and the rules are in `rescaleSlider.ts`, held to numbers recorded from legacy's own
 * widget. This file turns pointer events into those calls and draws the result in SVG, in legacy's
 * paint order.
 *
 * A DRAG IS SHOWN LIVE AND COMMITTED ON RELEASE, as the channel threshold bar's is and for the same
 * reason (`ThresholdBar.tsx`): every change is a round trip to the server. Legacy re-renders during
 * the drag only with Operate On View off (`image_adjustment_manager.py:230-242`). A drag that moved
 * at all is committed even when it ends on the values it started from, because legacy's slider
 * reports every move and a report is what clears a histogram preset (`rescale_widget.py:305-314`).
 */

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import {
  SLIDER_HEIGHT,
  SLIDER_MIN_WIDTH,
  handleAt,
  labelsOf,
  rangeOf,
  trackOf,
  valueToX,
  withHandleMoved,
  type Handle,
  type Window,
} from "./rescaleSlider.js";

export interface RescaleSliderProps {
  /** 255 for an 8-bit image, 65535 for 16-bit. */
  readonly maximum: number;
  readonly window: Window;
  /** Legacy disables the slider until a grayscale image is open; disabled, it takes no input. */
  readonly enabled: boolean;
  /** The window when a drag that moved is let go. */
  readonly onChange: (window: Window) => void;
}

interface Drag {
  readonly handle: Handle;
  readonly offset: number;
  live: Window;
  moved: boolean;
}

export function RescaleSlider({ maximum, window, enabled, onChange }: RescaleSliderProps): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(SLIDER_MIN_WIDTH);
  // The drag lives in a ref, so the capture-lost event that follows a release sees that the release
  // already ended it; the state is what the drawing reads.
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<{ readonly window: Window; readonly handle: Handle } | null>(null);

  // The track is sized in pixels from the slider's width, as legacy's is, so the width is measured.
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return undefined;
    const measure = () => setWidth(Math.max(SLIDER_MIN_WIDTH, element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** A pointer in the slider's own pixels, and the track at the slider's width right now. */
  const local = (event: { clientX: number; clientY: number; currentTarget: Element }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      track: trackOf(Math.max(SLIDER_MIN_WIDTH, rect.width)),
    };
  };

  const finish = () => {
    const ended = drag.current;
    if (ended === null) return;
    drag.current = null;
    setLive(null);
    if (ended.moved) onChange(ended.live);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) return;
    const { x, y, track } = local(event);
    const handle = handleAt(window, x, y, maximum, track);
    if (handle === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { handle, offset: x - valueToX(window[handle], maximum, track), live: window, moved: false };
    setLive({ window, handle });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null) return;
    const { x, track } = local(event);
    current.live = withHandleMoved(current.live, current.handle, x, current.offset, maximum, track);
    current.moved = true;
    setLive({ window: current.live, handle: current.handle });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    finish();
  };

  const track = trackOf(width);
  const shown = live?.window ?? window;
  const range = rangeOf(shown, maximum, track);

  return (
    <div
      ref={box}
      className={live === null ? "rescale-slider" : "rescale-slider rescale-slider--dragging"}
      role="group"
      aria-label="Rescale range"
      aria-disabled={!enabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    >
      <svg className="rescale-slider__drawing" width="100%" height={SLIDER_HEIGHT}>
        <rect
          className="rescale-slider__track"
          x={track.left}
          y={track.top}
          width={track.width}
          height={track.height}
          rx={5}
          ry={5}
        />
        {/* QColor(100, 180, 255, 140), no pen (line 111). */}
        <rect
          className="rescale-slider__range"
          x={range.x}
          y={track.top}
          width={range.width}
          height={track.height}
          rx={5}
          ry={5}
          fill="rgb(100 180 255)"
          fillOpacity={140 / 255}
        />
        {(["min", "max"] as const).map((handle) => (
          <rect
            key={handle}
            className={
              live?.handle === handle
                ? "rescale-slider__handle rescale-slider__handle--dragging"
                : "rescale-slider__handle"
            }
            data-handle={handle}
            data-value={shown[handle]}
            x={valueToX(shown[handle], maximum, track) - 6}
            y={track.top - 3}
            width={12}
            height={track.height + 6}
            rx={3}
            ry={3}
          />
        ))}
        {labelsOf(shown, maximum, track).map((label, index) => (
          <text key={`label-${index}`} className="rescale-slider__text" x={label.x} y={label.y}>
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
