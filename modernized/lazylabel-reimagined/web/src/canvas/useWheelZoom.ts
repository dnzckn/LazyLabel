/**
 * THE WHEEL ZOOMS, as legacy's does: 1.25x a notch in, 0.8x a notch out, about the point under the
 * pointer (photo_viewer.py:180-185, with AnchorUnderMouse at :28). It scrolled the pane instead, so
 * the gesture every desktop viewer zooms with scrolled the picture away (`CONTROL_PARITY.md`
 * CP-17).
 *
 * By the notch, not the event: a mouse sends 100 pixels a notch, a trackpad a stream of small
 * deltas, and zooming on each of those would fly past any size a user wanted. Listened to natively,
 * because React's wheel handler is passive and cannot stop the scroll.
 *
 * A hook of its own because the Multi tab's other half zooms under the wheel too, on its own: each
 * of legacy's viewers scales itself, and the signal that would sync them is connected to nothing
 * (photo_viewer.py:185, 187-190).
 */

import { useCallback, useLayoutEffect, useRef } from "react";

import { clampZoom } from "./fit.js";

/**
 * The callback ref that makes `pane` zoom under the wheel, keeping the pointed-at point put.
 *
 * `zoom` is the zoom set, or null while fitted; `fitted` is the scale fitting draws at, or null
 * before the pane is measured. `pane` is the element that scrolls, which is the one to attach to.
 */
export function useWheelZoom(
  zoom: number | null,
  fitted: number | null,
  setZoom: (zoom: number) => void,
  pane: { readonly current: HTMLElement | null },
): (element: HTMLElement | null) => (() => void) | undefined {
  const zoomNow = useRef(1);
  zoomNow.current = zoom ?? fitted ?? 1;
  const wheelTravel = useRef(0);
  /** Where the pane should scroll once the new zoom is drawn, to keep the pointed-at point put. */
  const pendingScroll = useRef<{ readonly left: number; readonly top: number } | null>(null);

  const attach = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) return undefined;
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        wheelTravel.current += event.deltaY * (event.deltaMode === 1 ? 100 / 3 : event.deltaMode === 2 ? 100 : 1);
        const notches = Math.trunc(wheelTravel.current / 100);
        if (notches === 0) return;
        wheelTravel.current -= notches * 100;

        const from = zoomNow.current;
        // Up, away from the user, is a negative delta and zooms in.
        const to = clampZoom(from * (notches < 0 ? 1.25 : 0.8) ** Math.abs(notches));
        if (to === from) return;

        const box = element.getBoundingClientRect();
        const x = event.clientX - box.left;
        const y = event.clientY - box.top;
        pendingScroll.current = {
          left: (element.scrollLeft + x) * (to / from) - x,
          top: (element.scrollTop + y) * (to / from) - y,
        };
        zoomNow.current = to;
        setZoom(to);
      };
      element.addEventListener("wheel", onWheel, { passive: false });
      return () => element.removeEventListener("wheel", onWheel);
    },
    [setZoom],
  );

  useLayoutEffect(() => {
    const target = pendingScroll.current;
    const element = pane.current;
    if (target === null || element === null) return;
    pendingScroll.current = null;
    element.scrollLeft = Math.max(0, target.left);
    element.scrollTop = Math.max(0, target.top);
  }, [pane, zoom]);

  return attach;
}
