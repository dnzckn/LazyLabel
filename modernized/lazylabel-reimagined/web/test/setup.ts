/**
 * Test environment gaps, filled so they do not dictate the production code.
 *
 * jsdom does not implement `PointerEvent`. Without it, `fireEvent.pointerDown` falls back to a
 * plain `Event`, React still dispatches it, and `button` and `clientX` arrive as null — so a
 * drawing tool looks broken in tests and works in a browser.
 *
 * The tempting fix is to use mouse events in the component instead. That would be letting the test
 * runner choose the API: pointer events are what a drawing tool wants, because the box and circle
 * tools will need `setPointerCapture` to keep receiving a drag that leaves the element, and mixing
 * two event models across tools in the same canvas is worse than a shim.
 *
 * This is deliberately the minimum: enough of the interface that the properties a tool reads are
 * real. It is not a PointerEvent implementation, and anything relying on pressure, tilt or
 * coalesced events should be tested in a real browser.
 */

if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.pressure = init.pressure ?? 0.5;
    }
  }

  globalThis.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}

// Capture is a no-op here: nothing in jsdom routes events by pointer id, and a tool that calls it
// must still work when it is unavailable — which older browsers and some test setups is exactly.
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
  Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
    return false;
  };
}
