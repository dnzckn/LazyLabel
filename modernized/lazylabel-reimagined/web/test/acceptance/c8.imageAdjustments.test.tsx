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

async function openPanel(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => expect(screen.getByRole("button", { name })).toBeTruthy());
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

  it("puts a channel marker on the pixels URL", async () => {
    const { pixelsUrl } = await openImage();
    await openPanel(/Rescale and thresholds/);

    fireEvent.change(screen.getByLabelText("Marker value"), { target: { value: "128" } });
    fireEvent.click(screen.getByText("Add marker"));

    await waitFor(() => expect(lastQuery(pixelsUrl)).toBe("?markers_gray=128"));
  });

  it("puts a rescale window on it", async () => {
    const { pixelsUrl } = await openImage();
    await openPanel(/Rescale and thresholds/);

    fireEvent.change(screen.getByLabelText("Rescale low"), { target: { value: "50" } });

    await waitFor(() => expect(lastQuery(pixelsUrl)).toContain("rescaleMin=50"));
  });

  it("does NOT offer rescale on a colour image, and says why (RULE-032)", async () => {
    await openImage(3);
    await openPanel(/Rescale and thresholds/);

    expect(screen.queryByLabelText("Rescale low")).toBeNull();
    expect(screen.getByText(/grayscale images only/)).toBeTruthy();
  });

  it("puts a frequency cutoff on it (RULE-030)", async () => {
    const { pixelsUrl } = await openImage();
    await openPanel(/Rescale and thresholds/);

    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "1000" } });

    await waitFor(() => expect(lastQuery(pixelsUrl)).toBe("?frequencies=1000"));
  });
});

describe("C8: the crop, which is carried to the save", () => {
  it("sends the crop with the save request (RULE-018)", async () => {
    // The crop does not narrow the view; it blanks what falls outside on WRITE. A crop the save
    // request leaves out is a crop the panel showed and the file never saw.
    const { saveAnnotations } = await openImage();
    await openPanel(/Crop$/);

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
    await openPanel(/Crop$/);

    fireEvent.change(screen.getByLabelText("X range"), { target: { value: "0:500" } });
    fireEvent.change(screen.getByLabelText("Y range"), { target: { value: "0:400" } });
    fireEvent.click(screen.getByText("Apply crop"));

    expect(await screen.findByText(/keep the full image size/)).toBeTruthy();
  });
});
