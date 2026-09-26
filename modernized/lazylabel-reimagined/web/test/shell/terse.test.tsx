/**
 * No paragraph of explanation in the panels, whatever state they are in.
 *
 * The owner asked on 2026-09-26 for legacy's panels: short labels, legacy's button texts, and
 * explanation in tooltips ("have you ever seen a gui with a paragraph there written to it"). This
 * drives the real shell into every state that used to add a paragraph -- every section open in both
 * of the left column's tabs, a crop in force, a negative brightness, Auto-Convert on, no models --
 * and reads every run of text in the two side columns, the strip under the image and the status
 * bar. Each of them failed it before the sweep: the Image Adjustments, Border Crop, fragment filter
 * and AI → Polygon sections, the Mode Controls card and the model picker all printed one.
 *
 * The Sequence tab is read the same way, through each state that printed one there: the range
 * picker, a timeline with nothing to carry from, suggestions, a finished run with a frame flagged
 * and a frame with no mask, the histogram, trim bounds and Save All (SEQUENCE_PARITY.md SP-50,
 * SP-57). What legacy says in its status bar is said as a notice, in legacy's words, and is not
 * read here.
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
import { openImage } from "../acceptance/harness.jsx";
import { LIMIT, longTexts } from "../terse.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FRAMES = ["f01.png", "f02.png", "f03.png", "f04.png", "f05.png"];
/** A 3x3 region of a 16x16 frame, as the wire carries a propagated mask. */
const MASK = { height: 16, width: 16, box: [2, 2, 4, 4], data: btoa("\u0001".repeat(9)) };
const NO_MASK = { height: 16, width: 16, box: null, data: "" };

function job(state: string, results: readonly unknown[]) {
  return { id: "job-1", state, completed: results.length, total: 4, cursor: results.length, cancelling: false, error: null, results };
}

/** The shell with AI that can propagate, a folder whose first frame is labelled, and a run behind it. */
function mountSequence(): void {
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: true, reason: null, videoCapable: true, accelerator: "test" },
    }),
    listImages: async () => ({
      folder: "frames",
      folders: [],
      annotatedCount: 1,
      unrecognized: 0,
      columns: [{ format: "NPZ", suffix: ".npz" }],
      images: FRAMES.map((name) => ({
        key: `frames/${name}`,
        name,
        sidecars: { NPZ: name === "f01.png" },
        annotated: name === "f01.png",
        sharesSidecarsWith: [],
      })),
    }),
    imageMetadata: async () => ({ width: 16, height: 16, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
    loadAnnotations: async (_project: string, key: string) => ({
      kind: "loaded",
      annotations: {
        sourceFormat: "NPZ",
        sourceFile: key,
        revision: "r1",
        segments: key.endsWith("f01.png")
          ? [{ type: "Polygon", classId: 0, vertices: [[2, 2], [8, 2], [8, 8], [2, 8]] }]
          : [],
        classAliases: {},
        failures: [],
      },
    }),
    startPropagation: async () => job("running", []),
    propagationState: async () =>
      job("completed", [
        { source: "frames/f02.png", objectId: 1, mask: MASK, confidence: 0.995 },
        { source: "frames/f03.png", objectId: 1, mask: MASK, confidence: 0.4 },
        { source: "frames/f04.png", objectId: 1, mask: NO_MASK, confidence: 0 },
        { source: "frames/f05.png", objectId: 1, mask: MASK, confidence: 0.999 },
      ]),
    findArchetypes: async () => ({
      suggested: ["frames/f03.png", "frames/f05.png"],
      budget: 2,
      clusters: 2,
      noise: 0,
      fellShort: false,
      unreadable: [],
    }),
    saveAnnotations: async () => ({ written: [], stale: [], skippedEmpty: [] }),
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

/** Open every collapsed section on screen, so what a closed one would say is read too. */
function openEverySection(): void {
  for (const toggle of document.querySelectorAll<HTMLButtonElement>(".panel__toggle[aria-expanded='false']")) {
    fireEvent.click(toggle);
  }
}

/** Where a user reads the app's words: both side columns, the strip under the image, the status bar. */
function everywhereRead(): Element[] {
  return [
    screen.getByRole("complementary", { name: "Tools" }),
    screen.getByRole("complementary", { name: "Dataset" }),
    document.querySelector(".open-image__info")!,
    screen.getByLabelText("Status"),
  ];
}

describe("the panels, as legacy's are", () => {
  it(`hold no run of text over ${LIMIT} characters, in any section or state`, async () => {
    await openImage();

    // Every section of both tabs, as they open.
    fireEvent.click(screen.getByRole("tab", { name: "Global" }));
    openEverySection();
    fireEvent.click(screen.getByRole("tab", { name: "Image" }));
    openEverySection();
    await screen.findByLabelText("Brightness");
    for (const region of everywhereRead()) expect(longTexts(region)).toEqual([]);

    // Then the states that added a paragraph: Auto-Convert on in the Global tab; a crop in force
    // and a negative brightness in the Image tab, each of which added warnings until 2026-09-26.
    fireEvent.click(screen.getByRole("tab", { name: "Global" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Auto-Convert: / }));
    await screen.findByText("Polygon Resolution:");
    fireEvent.click(screen.getByRole("tab", { name: "Image" }));
    fireEvent.change(screen.getByLabelText("X range"), { target: { value: "0:100" } });
    fireEvent.change(screen.getByLabelText("Y range"), { target: { value: "0:50" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Crop: 0:100, 0:50");
    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "-40" } });
    await waitFor(() => expect((screen.getByLabelText("Brightness") as HTMLInputElement).value).toBe("-40"));

    for (const region of everywhereRead()) expect(longTexts(region)).toEqual([]);
  });

  it(`hold no run of text over ${LIMIT} characters on the Sequence tab, in any state`, async () => {
    mountSequence();
    const cells = () => screen.getByLabelText("Timeline").querySelectorAll("button");
    /** The tab's header line, the panel under the view, and a dialog it opened. */
    const read = () =>
      [".centre__header", ".centre__sequence", "[role='dialog']"]
        .flatMap((selector) => [...document.querySelectorAll(selector)])
        .flatMap((region) => longTexts(region));

    // Timeline Setup, with nothing set, and then a range.
    fireEvent.click(await screen.findByRole("tab", { name: "Sequence" }));
    await screen.findByRole("button", { name: "Set Start" });
    expect(read()).toEqual([]);
    fireEvent.doubleClick(await screen.findByRole("button", { name: "f01.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Set Start" }));
    fireEvent.doubleClick(screen.getByRole("button", { name: "f05.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Set End" }));
    expect(read()).toEqual([]);

    // A timeline with nothing to carry from, then its references and suggestions.
    fireEvent.click(screen.getByRole("button", { name: "Build Timeline" }));
    await waitFor(() => expect(cells()).toHaveLength(FRAMES.length));
    expect(read()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));
    fireEvent.click(screen.getByRole("button", { name: "Find Archetypes" }));
    await waitFor(() => expect(screen.getByText(/Suggested refs:/).textContent).toBe("Suggested refs: 2"));
    expect(read()).toEqual([]);

    // A finished run: one frame flagged, its masks discarded, and one with no mask at all.
    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    await screen.findByText(/^Propagation complete/, undefined, { timeout: 3000 });
    await waitFor(() => expect(screen.getByText(/Flagged frames:/).textContent).toBe("Flagged frames: 1"));
    expect(read()).toEqual([]);

    // Its histogram.
    fireEvent.click(screen.getByRole("button", { name: "Hist" }));
    await screen.findByRole("dialog");
    expect(read()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Trim bounds, and Save All.
    fireEvent.click(cells()[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Set Left" }));
    fireEvent.click(cells()[3]!);
    fireEvent.click(screen.getByRole("button", { name: "Set Right" }));
    fireEvent.click(screen.getByRole("button", { name: "Save All" }));
    await screen.findByText(/^Saved \d+ frames to NPZ$/);
    expect(read()).toEqual([]);
  });

  it("still reads a long run as one, so the check itself cannot pass by splitting it", () => {
    // A paragraph built from several JSX expressions is several text nodes, and read one by one
    // each could be short. The check reads a <p> whole.
    const root = document.createElement("div");
    const paragraph = document.createElement("p");
    for (const piece of ["These change what is DISPLAYED, ", "and never the file. ", "Whether they reach the AI is a setting."]) {
      paragraph.append(document.createTextNode(piece));
    }
    root.append(paragraph);

    expect(longTexts(root)).toHaveLength(1);
  });
});
