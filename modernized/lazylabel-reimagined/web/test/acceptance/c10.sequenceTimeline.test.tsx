/**
 * C10 — build a timeline from an image sequence and mark reference frames.
 *
 * Through the SHELL, not through `TimelinePanel` directly, because what this capability claims is
 * that a person can reach it: open the app, find the sequence panel, choose a range, and get a
 * timeline whose already-annotated frames are references. `TimelinePanel.test.tsx` drives the
 * component; this drives the app.
 *
 * The distinction earned its place three times in one session — vertex editing, the adjustment
 * sliders and undo/redo were each implemented, tested and unreachable, and every component test
 * passed throughout.
 *
 * NO PROPAGATION, which is Phase 6's next slice and is gated on a golden capture. The timeline is
 * the pilot: a file range and which frames are already ground truth.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import type { ApiClient } from "../../src/api/client.js";

afterEach(cleanup);

const FRAMES = [
  { name: "f01.png", annotated: false },
  { name: "f02.png", annotated: true },
  { name: "f03.png", annotated: false },
  { name: "f04.png", annotated: false },
];

function mount() {
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: false, reason: "no inference service", videoCapable: false, accelerator: "unknown" },
    }),
    listImages: async () => ({
      folder: "frames",
      folders: [],
      annotatedCount: 1,
      unrecognized: 0,
      columns: [{ format: "NPZ", suffix: ".npz" }],
      images: FRAMES.map(({ name, annotated }) => ({
        key: `frames/${name}`,
        name,
        sidecars: { NPZ: annotated },
        annotated,
        sharesSidecarsWith: [],
      })),
    }),
    loadAnnotations: async () => ({ kind: "none" }),
    imageMetadata: async () => ({
      width: 64,
      height: 64,
      sourceDepth: 8,
      sourceChannels: 1,
      sourceFormat: "png",
    }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    thumbnailUrl: () => "/thumbnail",
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
}

/** Open the Sequence panel, which starts collapsed because it is not the common task. */
async function openSequence() {
  mount();
  await waitFor(() => expect(screen.getByRole("button", { name: /Sequence/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Sequence/ }));
  await waitFor(() => expect(screen.getByText("Build timeline")).toBeTruthy());
}

const cells = () => screen.getByLabelText("Timeline").querySelectorAll("button");

describe("C10: build a timeline and mark reference frames", () => {
  it("is reachable from the shell", async () => {
    await openSequence();

    expect(screen.getByLabelText("First frame")).toBeTruthy();
    expect(screen.getByLabelText("Last frame")).toBeTruthy();
  });

  it("offers the folder's frames by name", async () => {
    await openSequence();

    const options = [...(screen.getByLabelText("First frame") as HTMLSelectElement).options];
    expect(options.map((option) => option.textContent)).toEqual(FRAMES.map((f) => f.name));
  });

  it("builds a timeline over the chosen range", async () => {
    await openSequence();

    fireEvent.change(screen.getByLabelText("First frame"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Last frame"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Build timeline"));

    await waitFor(() => expect(cells()).toHaveLength(3));
  });

  it("marks the frames that already have annotations as references", async () => {
    // The capability's second half, and it needs no new endpoint: the folder listing already says
    // which images are annotated.
    await openSequence();
    fireEvent.click(screen.getByText("Build timeline"));

    await waitFor(() => expect(cells()).toHaveLength(4));
    const labels = [...cells()].map((cell) => cell.getAttribute("aria-label"));
    expect(labels[1]).toContain("reference");
    expect(labels[0]).toContain("pending");
  });

  it("counts the references above the timeline", async () => {
    await openSequence();
    fireEvent.click(screen.getByText("Build timeline"));

    expect(await screen.findByText(/4 frames, 1 reference/)).toBeTruthy();
  });

  it("opens a frame in the workspace when its cell is clicked", async () => {
    // The join that makes the timeline a navigation control rather than a picture.
    await openSequence();
    fireEvent.click(screen.getByText("Build timeline"));
    await waitFor(() => expect(cells()).toHaveLength(4));

    fireEvent.click(cells()[2]!);

    await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/f03\.png/));
  });

  it("says propagation is not built, rather than offering a button with nothing behind it", async () => {
    await openSequence();
    fireEvent.click(screen.getByText("Build timeline"));

    await waitFor(() => expect(cells()).toHaveLength(4));
    expect(screen.queryByRole("button", { name: /^Propagate/ })).toBeNull();
    expect(screen.getByText(/waits on a recorded sequence/)).toBeTruthy();
  });
});
