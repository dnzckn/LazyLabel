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
  await waitFor(() => expect(screen.getByRole("button", { name: "Set Start" })).toBeTruthy());
}

/** Legacy's range: the first frame opened from the list and Set Start, the last and Set End (SP-41). */
async function setRange(first: string, last: string) {
  fireEvent.click(await screen.findByRole("button", { name: first }));
  fireEvent.click(screen.getByRole("button", { name: "Set Start" }));
  fireEvent.click(screen.getByRole("button", { name: last }));
  fireEvent.click(screen.getByRole("button", { name: "Set End" }));
}

/** A timeline over `first` to `last`, the whole folder by default. */
async function buildRange(first = "f01.png", last = "f04.png") {
  await setRange(first, last);
  fireEvent.click(screen.getByRole("button", { name: "Build Timeline" }));
}

const cells = () => screen.getByLabelText("Timeline").querySelectorAll("button");
/** How the file list colours each row, by name: start, end, range, or nothing. */
const rowColours = () =>
  Object.fromEntries(
    [...document.querySelectorAll(".dataset tbody tr")].map((row) => [
      row.querySelector("th")!.textContent,
      /dataset__row--(\w+)/.exec(row.className)?.[1] ?? "",
    ]),
  );

describe("C10: build a timeline and mark reference frames", () => {
  it("is reachable from the shell", async () => {
    await openSequence();

    expect(screen.getByRole("button", { name: "Set End" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build Timeline" })).toBeTruthy();
  });

  it("colours the range in the file list as legacy's does, and forgets it when the tab is left (SP-41)", async () => {
    // Start light green, End red, the rows between dark green, once both are set, until New
    // Timeline or leaving the tab (fast_file_manager.py:303-309, 501-513, 1900-1965;
    // main_window.py:3043-3047, 4938-4947, 5017-5025).
    await openSequence();
    await setRange("f02.png", "f04.png");

    expect(rowColours()).toEqual({ "f01.png": "", "f02.png": "start", "f03.png": "range", "f04.png": "end" });

    fireEvent.click(screen.getByRole("tab", { name: "Single" }));
    await waitFor(() => expect(Object.values(rowColours()).every((colour) => colour === "")).toBe(true));
    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));
    // Legacy's exit forgot Start and End (SP-15): they are set again.
    await waitFor(() => expect(screen.getByText(/^Start:/).textContent).toBe("Start: Not set"));
    expect(Object.values(rowColours()).every((colour) => colour === "")).toBe(true);
    await setRange("f02.png", "f04.png");
    await waitFor(() => expect(rowColours()["f02.png"]).toBe("start"));

    fireEvent.click(screen.getByRole("button", { name: "Build Timeline" }));
    await waitFor(() => expect(cells()).toHaveLength(3));
    expect(rowColours()["f03.png"]).toBe("range");

    fireEvent.click(screen.getByText("New Timeline"));
    await waitFor(() => expect(Object.values(rowColours()).every((colour) => colour === "")).toBe(true));
  });

  it("puts the range's rows in the list in the sorted timeline's order, which Left and Right follow (SP-42)", async () => {
    // Legacy's Sort reorders the range's rows to the timeline's display order, the sort reads
    // "Timeline", and Unsort, or another sort chosen, puts the list back (main_window.py:3436-3455;
    // fast_file_manager.py:360-373, 1239-1244, 1331-1358).
    await openSequence();
    await buildRange();
    fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));
    await waitFor(() => expect(cells()[1]!.getAttribute("aria-label")).toMatch(/reference$/));
    const listed = () => [...document.querySelectorAll(".dataset tbody th")].map((cell) => cell.textContent);
    const sortOrder = () => screen.getByLabelText("Sort order") as HTMLSelectElement;

    fireEvent.click(screen.getByText("Sort"));

    await waitFor(() => expect(listed()).toEqual(["f02.png", "f01.png", "f03.png", "f04.png"]));
    expect(sortOrder().value).toBe("timeline");
    fireEvent.click(screen.getByRole("button", { name: "f02.png" }));
    await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/f02\.png/));
    fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });
    await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/f01\.png/));

    fireEvent.click(screen.getByText("Sorted"));
    await waitFor(() => expect(listed()).toEqual(["f01.png", "f02.png", "f03.png", "f04.png"]));
    expect(sortOrder().value).toBe("0");

    fireEvent.click(screen.getByText("Sort"));
    await waitFor(() => expect(sortOrder().value).toBe("timeline"));
    fireEvent.change(sortOrder(), { target: { value: "1" } });
    await waitFor(() => expect(listed()).toEqual(["f04.png", "f03.png", "f02.png", "f01.png"]));
  });

  it("builds a timeline over the chosen range", async () => {
    await openSequence();

    await buildRange("f02.png", "f04.png");

    await waitFor(() => expect(cells()).toHaveLength(3));
  });

  it("marks no reference by itself, as legacy does not (the owner's call, 2026-09-23)", async () => {
    await openSequence();
    await buildRange();

    await waitFor(() => expect(cells()).toHaveLength(4));
    const labels = [...cells()].map((cell) => cell.getAttribute("aria-label"));
    expect(labels.filter((label) => label?.includes("reference"))).toHaveLength(0);
  });

  it("marks the frames that already have annotations when asked for all labeled ones", async () => {
    // The capability's second half, and it needs no new endpoint: the folder listing already says
    // which images are annotated.
    await openSequence();
    await buildRange();
    fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));

    await waitFor(() => expect(cells()).toHaveLength(4));
    const labels = [...cells()].map((cell) => cell.getAttribute("aria-label"));
    expect(labels[1]).toContain("reference");
    expect(labels[0]).toContain("pending");
  });

  it("lists the references in their group, as legacy's does", async () => {
    await openSequence();
    await buildRange();
    fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));

    await waitFor(() => expect(screen.getByText(/^References:/).textContent).toBe("References: Frames: 2 ★"));
  });

  it("opens a frame in the workspace when its cell is clicked", async () => {
    // The join that makes the timeline a navigation control rather than a picture.
    await openSequence();
    await buildRange();
    await waitFor(() => expect(cells()).toHaveLength(4));

    fireEvent.click(cells()[2]!);

    await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/f03\.png/));
  });

  it("offers Propagate now that there is a job API behind it", async () => {
    // This test used to assert the OPPOSITE -- that no button was offered, because nothing was
    // behind one. That was the right assertion while it was true, and changing it is what closing
    // the slice looks like.
    await openSequence();
    await buildRange();

    await waitFor(() => expect(cells()).toHaveLength(4));
    expect(screen.getByRole("button", { name: /^Propagate/ })).toBeTruthy();
  });

  it("will not propagate with nothing to carry from", async () => {
    // Legacy will: with no reference it runs the whole sequence and writes an empty mask over
    // every frame, which is worse than doing nothing because it looks like work.
    // A range over f03 and f04 only, neither of which is annotated -- so the timeline has no
    // reference in it. The default range does have one, which is why this picks its own.
    await openSequence();
    await buildRange("f03.png", "f04.png");

    await waitFor(() => expect(cells()).toHaveLength(2));
    expect(screen.getByRole("button", { name: /^Propagate/ })).toHaveProperty("disabled", true);
  });
});
