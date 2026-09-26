/**
 * One press of a pan key (W, A, S, D) on one scrolling pane.
 *
 * A tenth of the pane a press, its width across and its height down, times `pan_multiplier`, as
 * legacy's `_pan_viewer` moves each viewer by its own size (viewport_manager.py:52-79). It was 64
 * pixels whatever the view's size (`CONTROL_PARITY.md` CP-25). `scrollBy` clamps at the ends
 * itself, so pressing into an edge does nothing rather than needing a bound here that would have
 * to agree with the browser's.
 */
export function panPane(pane: HTMLElement, dx: number, dy: number, multiplier: number): void {
  const left = dx * Math.trunc(pane.clientWidth * 0.1 * multiplier);
  const top = dy * Math.trunc(pane.clientHeight * 0.1 * multiplier);
  pane.scrollBy({ left, top, behavior: "auto" });
}
