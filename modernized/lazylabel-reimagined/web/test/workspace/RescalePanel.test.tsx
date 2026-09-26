/**
 * The Rescale section — RULE-032's window and RULE-031's presets, asked of the server.
 *
 * What is tested is what it OFFERS and what it asks for. The widget is laid out as legacy's
 * `RescaleWidget` is (`rescale_widget.py:204-250`): a bold title with its buttons, ONE slider with
 * two handles, and one status line. A grayscale image enables it; before one, or on a colour image,
 * it is there and disabled, and the status line says why in legacy's words. Reset clears the window
 * and any preset, as legacy's does (lines 320-328). No paragraphs.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import type { ApiClient } from "../../src/api/client.js";
import { RescalePanel } from "../../src/workspace/RescalePanel.jsx";
import { processingQuery } from "../../src/workspace/processing.js";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

beforeEach(() => {
  // jsdom lays nothing out: the slider is 296 px wide, a 256 px track from x=20.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({ x: 0, y: 0, left: 0, top: 0, width: 296, height: 50, right: 296, bottom: 50, toJSON: () => ({}) }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const IMAGE: WireDatasetImage = {
  key: "a.png",
  name: "a.png",
  sidecars: {},
  annotated: false,
  sharesSidecarsWith: [],
};

function Probe(): React.ReactNode {
  const { openImage, processing } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE)}>open</button>
      <p data-testid="query">{processingQuery(processing)}</p>
    </>
  );
}

function mount(metadata: { sourceChannels: number; sourceDepth: 8 | 16 }) {
  const client = {
    imageMetadata: async () => ({ width: 40, height: 20, sourceFormat: "png", ...metadata }),
    loadAnnotations: async () => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  return render(
    <WorkspaceProvider client={client} projectId="p">
      <Probe />
      <RescalePanel />
    </WorkspaceProvider>,
  );
}

async function open(metadata: { sourceChannels: number; sourceDepth: 8 | 16 }) {
  const view = mount(metadata);
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.queryByText("Load a grayscale image to enable")).toBeNull());
  return view;
}

const GRAY8 = { sourceChannels: 1, sourceDepth: 8 } as const;
const COLOUR8 = { sourceChannels: 3, sourceDepth: 8 } as const;
const GRAY16 = { sourceChannels: 1, sourceDepth: 16 } as const;

const query = () => screen.getByTestId("query").textContent;
const slider = () => screen.getByRole("group", { name: "Rescale range" });
const info = (container: HTMLElement) => container.querySelector(".rescale .processing__info")?.textContent;
const values = () =>
  [...slider().querySelectorAll<SVGRectElement>("[data-handle]")].map((h) => Number(h.dataset["value"]));

/** Press a handle at `from`, move to `to`, let go: the way a user drags it. */
function drag(from: number, to: number) {
  fireEvent.pointerDown(slider(), { clientX: from, clientY: 23, button: 0, pointerId: 1 });
  fireEvent.pointerMove(slider(), { clientX: to, clientY: 23, buttons: 1, pointerId: 1 });
  fireEvent.pointerUp(slider(), { clientX: to, clientY: 23, button: 0, pointerId: 1 });
}

describe("what it shows, in legacy's words", () => {
  it("is there before an image is open, disabled, asking for a grayscale image", () => {
    const { container } = mount(GRAY8);

    expect(screen.getByText("Rescale (Min/Max)")).toBeTruthy();
    expect(info(container)).toBe("Load a grayscale image to enable");
    expect(slider().getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByRole("button", { name: "Reset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("names a colour image as legacy does, with the slider and Reset disabled", async () => {
    // RULE-032 disables rescale for colour; legacy's info line says so (rescale_widget.py:278-283).
    const { container } = await open(COLOUR8);

    expect(info(container)).toBe("RGB image — rescale disabled");
    expect(slider().getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByRole("button", { name: "Reset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("gives a grayscale image one two-handled slider and legacy's range line, and no paragraphs", async () => {
    const { container } = await open(GRAY8);
    const rescale = container.querySelector(".rescale")!;

    expect(slider().getAttribute("aria-disabled")).toBe("false");
    expect(values()).toEqual([0, 255]);
    // Exactly legacy's string, double spaces and all (rescale_widget.py:297-299).
    expect(info(container)).toBe("Range: 0–255  |  Drag handles to rescale");
    expect(rescale.querySelectorAll("p, [role=alert], [role=status]")).toHaveLength(0);
    // One slider, not two range inputs that could be set past each other.
    expect(rescale.querySelectorAll('input[type="range"]')).toHaveLength(0);
  });

  it("runs the slider to 65535 on a 16-bit image", async () => {
    const { container } = await open(GRAY16);

    expect(values()).toEqual([0, 65535]);
    expect(info(container)).toBe("Range: 0–65535  |  Drag handles to rescale");
  });
});

describe("what it asks the server for", () => {
  it("puts the window on the query when a handle is let go", async () => {
    await open(GRAY8);

    // The min handle sits at x=20; 148 is level 127 (legacy's truncation, rescale_widget.py:80-84).
    drag(20, 148);

    await waitFor(() => expect(query()).toBe("?rescaleMin=127&rescaleMax=255"));
  });

  it("cannot cross the handles: the max handle stops at the min one", async () => {
    await open(GRAY8);
    drag(20, 148);
    await waitFor(() => expect(query()).toBe("?rescaleMin=127&rescaleMax=255"));

    // Drag the max handle (x=276) all the way left, past the min handle.
    drag(276, 0);

    // It stops ON the min handle rather than passing it, so the window is empty and nothing is
    // asked for: legacy leaves the image alone when max <= min (rescale_widget.py:377-378).
    await waitFor(() => expect(values()).toEqual([127, 127]));
    expect(query()).toBe("");
  });

  it("asks for nothing when both handles are back at the ends", async () => {
    await open(GRAY8);
    drag(20, 148);
    await waitFor(() => expect(query()).toBe("?rescaleMin=127&rescaleMax=255"));

    drag(147, -100);

    await waitFor(() => expect(values()).toEqual([0, 255]));
    expect(query()).toBe("");
  });

  it("puts a preset on the query, and dragging the window clears it (RULE-031)", async () => {
    await open(GRAY8);

    fireEvent.click(screen.getByLabelText("Equalize"));
    await waitFor(() => expect(query()).toBe("?preset=equalize"));

    drag(20, 50);
    await waitFor(() => expect(query()).toBe("?rescaleMin=29&rescaleMax=255"));
  });

  it("resets the window AND a preset, with legacy's tooltip", async () => {
    await open(GRAY8);
    drag(20, 60);
    fireEvent.click(screen.getByLabelText("CLAHE"));
    await waitFor(() => expect(query()).toContain("preset=clahe"));

    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset.getAttribute("title")).toBe("Reset rescale to full range");
    fireEvent.click(reset);

    await waitFor(() => expect(query()).toBe(""));
    expect(values()).toEqual([0, 255]);
  });
});
