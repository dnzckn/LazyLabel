/**
 * Measuring a pane so an image can be fitted to it -- the one view does it, and so does each half
 * of the Multi tab.
 */

import { useCallback, useState } from "react";

import { fitScale, type Size } from "./fit.js";

export interface FittedPane {
  /** A callback ref for the pane: it is measured when it appears and whenever it changes size. */
  readonly attach: (element: HTMLElement | null) => (() => void) | undefined;
  /** The fitted scale, or null until the pane has been measured (never, where nothing lays out). */
  readonly scale: number | null;
}

/**
 * A callback ref rather than an effect on a ref object, because a pane often appears only once
 * something has loaded; an effect keyed on anything else would measure before it existed or keep
 * observing one that had gone. `mirror`, when given, is kept pointing at the pane for code that
 * needs the element itself -- the keyboard pan scrolls it.
 */
export function useFittedPane(
  image: Size | null,
  mirror?: { current: HTMLElement | null },
): FittedPane {
  const [pane, setPane] = useState<Size | null>(null);

  const attach = useCallback(
    (element: HTMLElement | null) => {
      if (mirror !== undefined) mirror.current = element;
      if (element === null || typeof ResizeObserver === "undefined") return undefined;
      const measure = () => {
        const width = element.clientWidth;
        const height = element.clientHeight;
        setPane((was) =>
          was !== null && was.width === width && was.height === height ? was : { width, height },
        );
      };
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      measure();
      return () => {
        observer.disconnect();
        if (mirror !== undefined) mirror.current = null;
      };
    },
    [mirror],
  );

  return { attach, scale: pane === null || image === null ? null : fitScale(pane, image) };
}
