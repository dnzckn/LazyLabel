/**
 * C8 — adjust the displayed image, threshold channels, rescale and crop.
 *
 * Four rules in one capability, and they do not live in the same place, which is the thing worth
 * proving at this level:
 *
 *   - RULE-028's display adjustments run in the BROWSER, on the rendered canvas. They are the last
 *     step of RULE-032's order and nothing downstream reads them.
 *   - RULE-032's rescale and RULE-029's channel thresholds run on the SERVER, because they belong
 *     before the 16-bit to 8-bit conversion and the browser only ever receives what comes after.
 *     The browser's whole part is the query on the pixels URL.
 *   - RULE-030's frequency filter runs there too, for the same reason.
 *   - RULE-018's crop is neither: it is carried to the SAVE, where it blanks what falls outside.
 *
 * So what is checked here is the JOIN in each case — that the panel's control reaches the thing
 * that acts on it. The arithmetic is proven against OpenCV and legacy elsewhere; a control wired
 * to nothing is what this catches, and this session found three of those.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import type { ApiClient } from "../../src/api/client.js";

afterEach(cleanup);

const IMAGE = { key: "frames/a.png", name: "a.png" };

function mount(sourceChannels = 1) {
  const pixelsUrl = vi.fn((_project: string, _key: string, query = "") => `/pixels${query}`);
  const saveAnnotations = vi.fn(
    async (_project: string, _key: string, _body: Record<string, unknown>) =>
      ({ written: { NPZ: "r1" }, stale: [], skippedEmpty: [] }),
  );
  const putSettings = vi.fn(async (settings: unknown) => settings);

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: false, reason: "none", videoCapable: false, accelerator: "unknown" },
    }),
    listImages: async () => ({
      folder: "frames",
      folders: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [{ format: "NPZ", suffix: ".npz" }],
      images: [{ ...IMAGE, sidecars: { NPZ: false }, annotated: false, sharesSidecarsWith: [] }],
    }),
    loadAnnotations: async () => ({ kind: "none" }),
    imageMetadata: async () => ({
      width: 1000,
      height: 800,
      sourceDepth: 8,
      sourceChannels,
      sourceFormat: "png",
    }),
    models: async () => [],
    pixelsUrl,
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
    saveAnnotations,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default">
            <App client={client} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { pixelsUrl, saveAnnotations, putSettings };
}

async function openImage(sourceChannels = 1) {
  const handles = mount(sourceChannels);
  await waitFor(() => expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "a.png" }));
  await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/a\.png/));
  return handles;
}

/** The Image tab of the left column, which holds these sections as legacy's does. */
function openImageTab(): void {
  fireEvent.click(screen.getByRole("tab", { name: "Image" }));
}

/** A section's header, by its exact title (the arrow beside it is hidden from the name). */
const section = (title: string) => screen.getByRole("button", { name: title });

/** Opens a section if it is closed. A load opens some by itself, and a click would close those. */
async function openPanel(title: string) {
  openImageTab();
  if (section(title).getAttribute("aria-expanded") === "false") fireEvent.click(section(title));
  await waitFor(() => expect(section(title).getAttribute("aria-expanded")).toBe("true"));
}

/** The query the pixels URL was last built with, which is the browser's entire ask of the server. */
const lastQuery = (pixelsUrl: ReturnType<typeof vi.fn>): string => {
  const calls = pixelsUrl.mock.calls;
  return (calls.at(-1)?.[2] as string | undefined) ?? "";
};

describe("C8: the display adjustments, which run in the browser", () => {
  it("writes a brightness change to the settings the canvas reads", async () => {
    // The sliders once wrote to settings that nothing read back, which made the whole panel a dead
    // control. What the canvas does with them is pinned in `applyAdjustments.test.ts`.
    const { putSettings } = await openImage();

    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "60" } });

    await waitFor(() => expect(putSettings).toHaveBeenCalled());
    const saved = putSettings.mock.calls.at(-1)?.[0] as { values: Record<string, unknown> };
    expect(saved.values["brightness"]).toBe(60);
  });

  it("warns that a negative brightness FOLDS rather than darkening", async () => {
    // cv2.convertScaleAbs takes the absolute value, so the darkest pixels come back bright.
    // Legacy never says so, and a user who sees it concludes the slider is broken.
    await openImage();

    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "-40" } });

    expect(await screen.findByText(/folds instead of darkening/)).toBeTruthy();
  });
});

describe("C8: rescale and channel thresholds, which run on the server", () => {
  it("asks for nothing until something is set", async () => {
    // An unprocessed image keeps the URL the browser has cached.
    const { pixelsUrl } = await openImage();

    expect(lastQuery(pixelsUrl)).toBe("");
  });

  it("puts a channel marker on the pixels URL, from a double-click on the bar", async () => {
    // jsdom lays nothing out: the bar is given legacy's 296 px, one level per pixel.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({ x: 0, y: 0, left: 0, top: 0, width: 296, height: 60, right: 296, bottom: 60, toJSON: () => ({}) }) as DOMRect,
    );
    try {
      const { pixelsUrl } = await openImage();
      await openPanel("Channel Threshold");

      fireEvent.click(screen.getByRole("checkbox", { name: "Gray" }));
      fireEvent.doubleClick(screen.getByRole("group", { name: "Gray threshold" }), {
        clientX: 148,
        clientY: 30,
        button: 0,
      });

      await waitFor(() => expect(lastQuery(pixelsUrl)).toBe("?markers_gray=128"));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("puts a rescale window on it", async () => {
    const { pixelsUrl } = await openImage();
    await openPanel("Rescale");

    fireEvent.change(screen.getByLabelText("Rescale low"), { target: { value: "50" } });

    await waitFor(() => expect(lastQuery(pixelsUrl)).toContain("rescaleMin=50"));
  });

  it("does NOT offer rescale on a colour image, and says so in legacy's words (RULE-032)", async () => {
    await openImage(3);
    await openPanel("Rescale");

    expect(screen.queryByLabelText("Rescale low")).toBeNull();
    expect(screen.getByText("RGB image — rescale disabled")).toBeTruthy();
  });

  it("puts a frequency cutoff on it (RULE-030)", async () => {
    const { pixelsUrl } = await openImage();
    await openPanel("FFT Threshold");

    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "1000" } });

    await waitFor(() => expect(lastQuery(pixelsUrl)).toBe("?frequencies=1000"));
  });
});

describe("C8: the Image tab's sections, as legacy lays them out", () => {
  const TITLES = ["Border Crop", "Rescale", "Channel Threshold", "FFT Threshold", "Image Adjustments"];
  const open = (title: string) => section(title).getAttribute("aria-expanded") === "true";

  it("has legacy's sections in legacy's order, Channel Threshold open and the other two closed", async () => {
    // control_panel.py:499-531: Rescale and FFT Threshold start collapsed, Channel Threshold open.
    mount();
    await waitFor(() => expect(screen.getByRole("tab", { name: "Image" })).toBeTruthy());
    openImageTab();

    const headers = screen
      .getAllByRole("button")
      .map((button) => (button.textContent ?? "").replace(/^[▶▼]/, ""))
      .filter((text) => TITLES.includes(text));
    expect(headers).toEqual(TITLES);
    expect([open("Rescale"), open("Channel Threshold"), open("FFT Threshold")]).toEqual([false, true, false]);
  });

  it("opens all three for a grayscale image, and opens Channel Threshold again after it was closed", async () => {
    // Legacy re-opens Channel Threshold on every load, and opens Rescale and FFT for grayscale
    // (control_panel.py:823-850, 858-885).
    mount(1);
    openImageTab();
    fireEvent.click(section("Channel Threshold"));
    expect(open("Channel Threshold")).toBe(false);

    await waitFor(() => expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "a.png" }));

    await waitFor(() =>
      expect([open("Rescale"), open("Channel Threshold"), open("FFT Threshold")]).toEqual([true, true, true]),
    );
  });

  it("keeps Rescale and FFT Threshold closed for a colour image", async () => {
    await openImage(3);
    openImageTab();

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Red" })).toBeTruthy());
    expect([open("Rescale"), open("Channel Threshold"), open("FFT Threshold")]).toEqual([false, true, false]);
  });
});

describe("C8: the crop, which is carried to the save", () => {
  it("sends the crop with the save request (RULE-018)", async () => {
    // The crop does not narrow the view; it blanks what falls outside on WRITE. A crop the save
    // request leaves out is a crop the panel showed and the file never saw.
    const { saveAnnotations } = await openImage();
    openImageTab();

    fireEvent.change(screen.getByLabelText("X range"), { target: { value: "0:500" } });
    fireEvent.change(screen.getByLabelText("Y range"), { target: { value: "0:400" } });
    fireEvent.click(screen.getByText("Apply crop"));

    await waitFor(() => expect(screen.getByText(/600,000 pixels/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Write \d+ format/ }));

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    const body = saveAnnotations.mock.calls.at(-1)?.[2];
    expect(body?.["cropCoords"]).toEqual([0, 0, 500, 400]);
  });

  it("counts the pixels a save would blank before anyone presses it", async () => {
    // Legacy blanks them with no warning and nothing in the exported file records that a crop was
    // involved.
    await openImage();
    openImageTab();

    fireEvent.change(screen.getByLabelText("X range"), { target: { value: "0:500" } });
    fireEvent.change(screen.getByLabelText("Y range"), { target: { value: "0:400" } });
    fireEvent.click(screen.getByText("Apply crop"));

    expect(await screen.findByText(/keep the full image size/)).toBeTruthy();
  });
});
