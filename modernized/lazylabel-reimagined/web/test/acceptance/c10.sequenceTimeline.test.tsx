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
 * PROPAGATION IS REACHABLE HERE NOW. It was not, and the test below that proves it used to prove
 * the opposite -- that no button was offered, because nothing was behind one. What is still NOT
 * claimed is that the results agree with legacy: that needs a golden capture, and the panel says so
 * on screen rather than leaving the silence to be read as confidence.
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
      // A deployment WITH AI: without it the propagation controls are hidden, as legacy's are (SP-31),
      // which `test/sequence/TimelinePanel.test.tsx` covers.
      ai: { available: true, reason: null, videoCapable: true, accelerator: "unknown" },
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
    tileUrl: () => "/tile",
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

/** Open the Sequence tab over the image, as in legacy. */
async function openSequence() {
  mount();
  fireEvent.click(await screen.findByRole("tab", { name: "Sequence" }));
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

  it("marks no reference by itself, as legacy does not (the owner's call, 2026-09-23)", async () => {
    await openSequence();
    fireEvent.click(screen.getByText("Build timeline"));

    await waitFor(() => expect(cells()).toHaveLength(4));
    const labels = [...cells()].map((cell) => cell.getAttribute("aria-label"));
    expect(labels.filter((label) => label?.includes("reference"))).toHaveLength(0);
  });

  it("marks the frames that already have annotations when asked for all labeled ones", async () => {
    // The capability's second half, and it needs no new endpoint: the folder listing already says
    // which images are annotated.
    await openSequence();
    fireEvent.click(screen.getByText("Build timeline"));
    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));

    await waitFor(() => expect(cells()).toHaveLength(4));
    const labels = [...cells()].map((cell) => cell.getAttribute("aria-label"));
    expect(labels[1]).toContain("reference");
    expect(labels[0]).toContain("pending");
  });

  it("counts the references above the timeline", async () => {
    await openSequence();
    fireEvent.click(screen.getByText("Build timeline"));
    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));

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

  it("offers Propagate now that there is a job API behind it", async () => {
    // This test used to assert the OPPOSITE -- that no button was offered, because nothing was
    // behind one. That was the right assertion while it was true, and changing it is what closing
    // the slice looks like. The panel says how far agreement with legacy has been shown -- on the
    // synthetic-shapes golden since 2026-09-23 -- and where it stops.
    await openSequence();
    fireEvent.click(screen.getByText("Build timeline"));

    await waitFor(() => expect(cells()).toHaveLength(4));
    expect(screen.getByRole("button", { name: /^Propagate/ })).toBeTruthy();
    expect(screen.getByText(/longer than the streaming window/)).toBeTruthy();
  });

  it("will not propagate with nothing to carry from", async () => {
    // Legacy will: with no reference it runs the whole sequence and writes an empty mask over
    // every frame, which is worse than doing nothing because it looks like work.
    // A range over f03 and f04 only, neither of which is annotated -- so the timeline has no
    // reference in it. The default range does have one, which is why this picks its own.
    await openSequence();
    fireEvent.change(screen.getByLabelText("First frame"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Last frame"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Build timeline"));

    await waitFor(() => expect(cells()).toHaveLength(2));
    expect(screen.getByRole("button", { name: /^Propagate/ })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Nothing to carry from yet/)).toBeTruthy();
  });
});
