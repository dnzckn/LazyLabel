/**
 * The Rescale section — RULE-032's window and RULE-031's presets, asked of the server.
 *
 * What is tested is what it OFFERS and what it asks for. The widget is laid out as legacy's
 * `RescaleWidget` is (`rescale_widget.py:204-250`): a bold title with Hist and Reset, ONE slider
 * with two handles, and one status line. A grayscale image enables it; before one, or on a colour
 * image, it is there and disabled, and the status line says why in legacy's words. Reset clears the
 * window and any preset, as legacy's does (lines 320-328). No paragraphs.
 *
 * Hist opens legacy's histogram dialog on the image or its crop (`main_window.py:2786-2807`), and
 * what its Apply sends lands where legacy's lands (lines 2805-2825): lines on the slider, clearing
 * any preset, or Equalize or CLAHE as the preset the status line names. The dialog itself is held
 * to legacy's in `RescaleHistogramDialog.test.tsx`.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage, WireHistogram } from "@lazylabel/contracts";

import golden from "../fixtures/legacy-rescale-histogram.json" with { type: "json" };
import type { ApiClient } from "../../src/api/client.js";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
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
  const { openImage, processing, setCrop } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE)}>open</button>
      <button type="button" onClick={() => setCrop({ x1: 2, y1: 1, x2: 30, y2: 15 })}>crop</button>
      <p data-testid="query">{processingQuery(processing)}</p>
    </>
  );
}

/** The golden 8-bit image's level counts, as `/histogram` answers for it. */
const gray8 = golden.images.gray8;
const HISTOGRAM: WireHistogram = {
  depth: 8,
  width: 24,
  height: 20,
  pixels: gray8.pixels,
  min: gray8.min,
  max: gray8.max,
  levels: gray8.levels as unknown as WireHistogram["levels"],
};

function mount(metadata: { sourceChannels: number; sourceDepth: 8 | 16 }) {
  const imageHistogram = vi.fn(
    async (_project: string, _key: string, options: { clahe?: { clipLimit: number; tiles: number } | null } = {}) => {
      const clahe = options.clahe ?? null;
      if (clahe === null) return HISTOGRAM;
      const key = `${Number.isInteger(clahe.clipLimit) ? `${clahe.clipLimit}.0` : clahe.clipLimit}:${clahe.tiles}`;
      return { ...HISTOGRAM, levels: (gray8.clahe as Record<string, unknown>)[key] } as WireHistogram;
    },
  );
  const client = {
    imageMetadata: async () => ({ width: 40, height: 20, sourceFormat: "png", ...metadata }),
    loadAnnotations: async () => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    imageHistogram,
  } as unknown as ApiClient;

  const view = render(
    <NotificationProvider>
      <WorkspaceProvider client={client} projectId="p">
        <Probe />
        <RescalePanel client={client} projectId="p" />
      </WorkspaceProvider>
    </NotificationProvider>,
  );
  return { ...view, imageHistogram };
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
const hist = () => screen.getByRole("button", { name: "Hist" }) as HTMLButtonElement;

/** Press a handle at `from`, move to `to`, let go: the way a user drags it. */
function drag(from: number, to: number) {
  fireEvent.pointerDown(slider(), { clientX: from, clientY: 23, button: 0, pointerId: 1 });
  fireEvent.pointerMove(slider(), { clientX: to, clientY: 23, buttons: 1, pointerId: 1 });
  fireEvent.pointerUp(slider(), { clientX: to, clientY: 23, button: 0, pointerId: 1 });
}

/** Hist, and wait for legacy's dialog. */
async function openDialog() {
  fireEvent.click(hist());
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Rescale Histogram" })).toBeTruthy());
}

const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("what it shows, in legacy's words", () => {
  it("is there before an image is open, disabled, asking for a grayscale image", () => {
    const { container } = mount(GRAY8);

    expect(screen.getByText("Rescale (Min/Max)")).toBeTruthy();
    expect(info(container)).toBe("Load a grayscale image to enable");
    expect(slider().getAttribute("aria-disabled")).toBe("true");
    expect(hist().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("names a colour image as legacy does, with the slider, Hist and Reset disabled", async () => {
    // RULE-032 disables rescale for colour; legacy's info line says so (rescale_widget.py:278-283).
    const { container } = await open(COLOUR8);

    expect(info(container)).toBe("RGB image — rescale disabled");
    expect(slider().getAttribute("aria-disabled")).toBe("true");
    expect(hist().disabled).toBe(true);
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
    // One slider, not two range inputs that could be set past each other, and no preset radios:
    // legacy's presets are in its histogram dialog.
    expect(rescale.querySelectorAll('input[type="range"], input[type="radio"]')).toHaveLength(0);
    expect(hist().disabled).toBe(false);
    expect(hist().title).toBe("Open histogram for visual min/max selection");
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

  it("resets the window AND a preset, with legacy's tooltip", async () => {
    await open(GRAY8);
    drag(20, 60);
    await openDialog();
    press("Equalize");
    press("Apply");
    await waitFor(() => expect(query()).toContain("preset=equalize"));

    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset.getAttribute("title")).toBe("Reset rescale to full range");
    fireEvent.click(reset);

    await waitFor(() => expect(query()).toBe(""));
    expect(values()).toEqual([0, 255]);
  });
});

describe("Hist: legacy's histogram dialog", () => {
  it("opens on the image's level counts, or its crop's", async () => {
    const { imageHistogram } = await open(GRAY8);

    await openDialog();
    expect(imageHistogram).toHaveBeenLastCalledWith("p", "a.png", { crop: null });
    // The dialog's lines start where the slider's handles are (main_window.py:2801-2802).
    expect(document.querySelector(".histogram-dialog__max")?.textContent).toBe("Max: 255");
    press("Cancel");

    fireEvent.click(screen.getByText("crop"));
    await openDialog();
    expect(imageHistogram).toHaveBeenLastCalledWith("p", "a.png", { crop: { x1: 2, y1: 1, x2: 30, y2: 15 } });
  });

  it("puts Contrast Stretch's lines on the slider, as a window", async () => {
    const { container } = await open(GRAY8);
    await openDialog();

    fireEvent.change(screen.getByRole("slider", { name: "Contrast Stretch" }), { target: { value: "10" } });
    press("Apply");

    // Legacy's own lines for 1.0% on this image (legacy-rescale-histogram.json): 11 and 69.
    await waitFor(() => expect(query()).toBe("?rescaleMin=11&rescaleMax=69"));
    expect(values()).toEqual([11, 69]);
    expect(info(container)).toBe("Range: 0–255  |  Drag handles to rescale");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applies Equalize as the preset, its table from the image, and names it", async () => {
    const { container } = await open(GRAY8);
    drag(20, 60);
    await waitFor(() => expect(query()).toBe("?rescaleMin=39&rescaleMax=255"));
    await openDialog();

    press("Equalize");
    press("Apply");

    await waitFor(() => expect(query()).toBe("?preset=equalize%3A0%2C0%2C40%2C20"));
    expect(info(container)).toBe("Preset: Histogram Equalization");
    // The slider keeps its handles under the preset, as legacy's does.
    expect(values()).toEqual([39, 255]);
  });

  it("builds Equalize's table from the crop the dialog was opened on", async () => {
    await open(GRAY8);
    fireEvent.click(screen.getByText("crop"));
    await openDialog();

    press("Equalize");
    press("Apply");

    await waitFor(() => expect(query()).toBe("?preset=equalize%3A2%2C1%2C30%2C15&crop=2%2C1%2C30%2C15"));
  });

  it("applies CLAHE as the preset with its Clip and Tile, and names it", async () => {
    const { container, imageHistogram } = await open(GRAY8);
    await openDialog();

    fireEvent.change(document.querySelector(".histogram-dialog__clip")!, { target: { value: "3.5" } });
    fireEvent.change(document.querySelector(".histogram-dialog__tile")!, { target: { value: "4" } });
    press("CLAHE");
    // Its preview is asked of the server, which computes CLAHE as the pixels will be.
    expect(imageHistogram).toHaveBeenLastCalledWith("p", "a.png", { crop: null, clahe: { clipLimit: 3.5, tiles: 4 } });
    press("Apply");

    await waitFor(() => expect(query()).toBe("?preset=clahe%3A3.5%3A4%3A4"));
    expect(info(container)).toBe("Preset: CLAHE (clip=3.5, tile=4)");
  });

  it("drops a preset when a handle moves, and applies the window from there", async () => {
    await open(GRAY8);
    await openDialog();
    press("Equalize");
    press("Apply");
    await waitFor(() => expect(query()).toContain("preset=equalize"));

    drag(20, 60);

    await waitFor(() => expect(query()).toBe("?rescaleMin=39&rescaleMax=255"));
  });

  it("drops a preset when the dialog's Apply sends lines, even the lines it opened with", async () => {
    // set_values_from_histogram clears the table whatever the lines are (rescale_widget.py:432-441).
    const { container } = await open(GRAY8);
    await openDialog();
    press("Equalize");
    press("Apply");
    await waitFor(() => expect(query()).toContain("preset=equalize"));

    await openDialog();
    press("Apply");

    await waitFor(() => expect(query()).toBe(""));
    expect(info(container)).toBe("Range: 0–255  |  Drag handles to rescale");
  });

  it("sends nothing on Cancel", async () => {
    await open(GRAY8);
    await openDialog();
    fireEvent.change(screen.getByRole("slider", { name: "Contrast Stretch" }), { target: { value: "10" } });

    press("Cancel");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(query()).toBe("");
  });
});

describe("a crop drawn after a preset", () => {
  it("drops CLAHE, whose picture came from the region before it", async () => {
    // main_window.py:2837-2845: the CLAHE result is sized to its region, so a crop clears it.
    const { container } = await open(GRAY8);
    await openDialog();
    press("CLAHE");
    press("Apply");
    await waitFor(() => expect(query()).toBe("?preset=clahe%3A2%3A8%3A8"));

    fireEvent.click(screen.getByText("crop"));

    await waitFor(() => expect(query()).toBe(""));
    expect(info(container)).toBe("Range: 0–255  |  Drag handles to rescale");
  });

  it("keeps Equalize, table and all, and applies it inside the crop", async () => {
    await open(GRAY8);
    await openDialog();
    press("Equalize");
    press("Apply");
    await waitFor(() => expect(query()).toBe("?preset=equalize%3A0%2C0%2C40%2C20"));

    fireEvent.click(screen.getByText("crop"));

    await waitFor(() => expect(query()).toBe("?preset=equalize%3A0%2C0%2C40%2C20&crop=2%2C1%2C30%2C15"));
  });
});
