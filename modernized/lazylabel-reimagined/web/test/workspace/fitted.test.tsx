/**
 * The open image fills its pane, as legacy's single view does, and zooming starts from there.
 *
 * jsdom lays nothing out, so the pane's size is given: `clientWidth` and `clientHeight` report a
 * size for the pane the view measures, and `ResizeObserver` exists but never fires. The view
 * measures once when the pane appears, which is what is under test. The canvas gets a 2D context
 * that does nothing, so it stays on screen instead of falling back to a plain image.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { ApiClient } from "../../src/api/client.js";

const PANE = { width: 928, height: 834 };

class QuietResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const originalObserver = globalThis.ResizeObserver;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

// jsdom has no 2D context, and without one the view falls back to a plain <img>. This one does
// nothing; no pixels are read here, only the size the canvas is shown at.
const quietContext = new Proxy({}, { get: () => () => undefined });

function paneSized(dimension: "width" | "height") {
  return function size(this: HTMLElement): number {
    return this.classList.contains("canvas-scroll") ? PANE[dimension] : 0;
  };
}

beforeEach(() => {
  globalThis.ResizeObserver = QuietResizeObserver as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => quietContext) as never;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: paneSized("width"),
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: paneSized("height"),
  });
});

afterEach(() => {
  cleanup();
  // Deleting the shadowing properties restores jsdom's own, which live on Element.prototype.
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  globalThis.ResizeObserver = originalObserver;
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

function mount(size: { width: number; height: number }) {
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [] as string[],
      ai: { available: true, reason: null, videoCapable: true, accelerator: "cpu" },
    }),
    listImages: async () => ({
      folder: "",
      folders: [],
      columns: [{ format: "NPZ", suffix: ".npz" }],
      annotatedCount: 0,
      unrecognized: 0,
      images: [
        { key: "a.png", name: "a.png", sidecars: { NPZ: false }, annotated: false, sharesSidecarsWith: [] },
      ],
    }),
    imageMetadata: async () => ({ ...size, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async () => ({ kind: "none" }),
    models: async () => [],
    pixelsUrl: () => "/api/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/api/thumbnail",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default" confirmNavigation={() => true}>
            <App client={client} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

/** The canvas the open image is drawn on, once it is there. */
async function openedCanvas(): Promise<HTMLCanvasElement> {
  fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
  return (await screen.findByRole("img", { name: /annotations?$/ })) as HTMLCanvasElement;
}

function shown(canvas: HTMLCanvasElement): readonly [number, number] {
  return [parseFloat(canvas.style.width), parseFloat(canvas.style.height)];
}

describe("the open image fills its pane", () => {
  it("draws a small image as large as the pane allows, as legacy does", async () => {
    // Legacy's default window shows a 400x300 frame at more than twice its size, not in a corner.
    mount({ width: 400, height: 300 });
    const canvas = await openedCanvas();

    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(928));
    expect(shown(canvas)[1]).toBeCloseTo(696);
  });

  it("fits a tall image by its height", async () => {
    mount({ width: 300, height: 600 });
    const canvas = await openedCanvas();

    await waitFor(() => expect(shown(canvas)[1]).toBeCloseTo(834));
    expect(shown(canvas)[0]).toBeCloseTo(417);
  });

  it("zooms 1.25x a wheel notch in and 0.8x a notch out, as legacy's wheel does", async () => {
    // The wheel scrolled the pane instead (CONTROL_PARITY.md CP-17).
    mount({ width: 400, height: 300 });
    const canvas = await openedCanvas();
    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(928));
    const pane = document.querySelector(".canvas-scroll") as HTMLElement;

    const up = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    pane.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(1160));

    pane.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(928));
  });

  it("zooms a trackpad's small deltas only once they add up to a notch", async () => {
    mount({ width: 400, height: 300 });
    const canvas = await openedCanvas();
    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(928));
    const pane = document.querySelector(".canvas-scroll") as HTMLElement;

    for (let i = 0; i < 3; i += 1) pane.dispatchEvent(new WheelEvent("wheel", { deltaY: -25, cancelable: true }));
    expect(shown(canvas)[0]).toBeCloseTo(928);

    pane.dispatchEvent(new WheelEvent("wheel", { deltaY: -25, cancelable: true }));
    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(1160));
  });

  it("zooms in from the size fitting shows, and Fit goes back to it", async () => {
    // Doubling from 1:1 would have made "zoom in" SHRINK this image from 232% to 200%.
    mount({ width: 400, height: 300 });
    const canvas = await openedCanvas();
    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(928));

    // The zoom buttons are in Image Adjustments, on the left column's Image tab.
    fireEvent.click(screen.getByRole("tab", { name: "Image" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(1856));
    expect(screen.getByText("464%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fit" }));

    await waitFor(() => expect(shown(canvas)[0]).toBeCloseTo(928));
  });

  it("names the picture and gives its size under it, not in a heading over it", async () => {
    mount({ width: 400, height: 300 });
    await openedCanvas();

    // A heading over the image only took space from it; legacy's viewer has none.
    expect(screen.queryByRole("heading", { name: "a.png" })).toBeNull();
    const strip = document.querySelector(".open-image__info")!;
    expect(strip.textContent).toContain("a.png");
    expect(strip.textContent).toContain("400 x 300, png");
  });
});
