/**
 * The Channel Threshold section — legacy's `ChannelThresholdWidget`, wired to the workspace.
 *
 * What it offers is legacy's: one Gray bar for a grayscale image, Red, Green and Blue for colour,
 * each behind a checkbox that starts unticked. What it produces is the query the pixels URL, the
 * Operate On View request and the tiles all carry, so that is what is checked, through the real
 * workspace store.
 *
 * The checkbox scenario is replayed from `legacy-channel-slider.json`, recorded from legacy's own
 * `ChannelSliderWidget`: a double-click on an unticked bar does nothing, ticking enables it, and
 * unticking clears its markers.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import golden from "../fixtures/legacy-channel-slider.json" with { type: "json" };
import type { ApiClient } from "../../src/api/client.js";
import { CHANNEL_THRESHOLD_HINT, ChannelThresholdPanel } from "../../src/workspace/ChannelThresholdPanel.jsx";
import { processingQuery } from "../../src/workspace/processing.js";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

const image = (key: string): WireDatasetImage => ({
  key,
  name: key,
  sidecars: {},
  annotated: false,
  sharesSidecarsWith: [],
});

beforeEach(() => {
  // jsdom lays nothing out: every bar is 296 px wide, a 256 px track, one level per pixel.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({ x: 0, y: 0, left: 0, top: 0, width: 296, height: 60, right: 296, bottom: 60, toJSON: () => ({}) }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Opens images, and shows the query the pixels URL would carry: the panel's whole output. */
function Probe(): React.ReactNode {
  const { openImage, processing } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(image("a.png"))}>open a</button>
      <button type="button" onClick={() => openImage(image("b.png"))}>open b</button>
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
      <ChannelThresholdPanel />
    </WorkspaceProvider>,
  );
}

async function open(metadata: { sourceChannels: number; sourceDepth: 8 | 16 }, which = "open a") {
  const view = mount(metadata);
  fireEvent.click(screen.getByText(which));
  await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
  return view;
}

const GRAY8 = { sourceChannels: 1, sourceDepth: 8 } as const;
const COLOUR8 = { sourceChannels: 3, sourceDepth: 8 } as const;
const GRAY16 = { sourceChannels: 1, sourceDepth: 16 } as const;

const query = () => screen.getByTestId("query").textContent;
const bar = (name: string) => screen.getByRole("group", { name: `${name} threshold` });
const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const handles = (name: string) =>
  [...bar(name).querySelectorAll<SVGRectElement>("[data-marker]")].map((h) => Number(h.dataset["marker"]));

function doubleClick(name: string, x: number, y = 30) {
  const target = bar(name);
  for (let i = 0; i < 2; i += 1) {
    fireEvent.pointerDown(target, { clientX: x, clientY: y, button: 0, pointerId: 1 });
    fireEvent.pointerUp(target, { clientX: x, clientY: y, button: 0, pointerId: 1 });
  }
  fireEvent.doubleClick(target, { clientX: x, clientY: y, button: 0 });
}

describe("which bars an image gets", () => {
  it("shows nothing before an image is open, as legacy shows no bars", () => {
    const { container } = mount(GRAY8);
    expect(container.querySelector(".threshold")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("gives a grayscale image one Gray bar, its box unticked", async () => {
    await open(GRAY8);

    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual(["Gray"]);
    expect(box("Gray").checked).toBe(false);
    expect(bar("Gray").textContent).toContain("Gray");
  });

  it("gives a colour image Red, Green and Blue, in that order", async () => {
    await open(COLOUR8);

    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Red",
      "Green",
      "Blue",
    ]);
  });

  it("has no channel picker, number box or Add button: the bar is the control", async () => {
    await open(COLOUR8);

    expect(screen.queryByLabelText("Channel")).toBeNull();
    expect(screen.queryByLabelText("Marker value")).toBeNull();
    expect(screen.queryByText("Add marker")).toBeNull();
  });
});

describe("no paragraphs", () => {
  it("shows only the bars and their boxes, with legacy's instructions as the tooltip", async () => {
    // The owner, 2026-09-26: no paragraphs of explanation in the image settings. Legacy's three
    // lines of instructions (channel_threshold_widget.py:413-418) are the tooltip instead.
    const { container } = await open(COLOUR8);
    const section = container.querySelector(".threshold")!;

    expect(section.getAttribute("title")).toBe(CHANNEL_THRESHOLD_HINT);
    expect(CHANNEL_THRESHOLD_HINT).toBe("✓ Check to enable\n• Double-click to add threshold\n• Right-click to remove");
    expect(section.querySelectorAll("p, [role=alert], [role=status]")).toHaveLength(0);
    expect(section.textContent).toBe("RedGreenBlue");
  });
});

describe("legacy's checkbox, replayed", () => {
  const scenario = golden.scenarios.find((s) => s.name === "enable")!;

  it("ignores an unticked bar, enables on ticking, and clears on unticking", async () => {
    await open(COLOUR8);

    for (const [index, step] of scenario.steps.entries()) {
      const where = `step ${index + 1}, ${step.event}`;
      if (step.event === "check" || step.event === "uncheck") fireEvent.click(box("Red"));
      else doubleClick("Red", step.x!, step.y!);

      const applied = (step as { applied: number[] }).applied;
      await waitFor(() =>
        expect({ where, markers: handles("Red"), ticked: box("Red").checked, query: query() }).toEqual({
          where,
          markers: step.markers,
          ticked: (step as { enabled: boolean }).enabled,
          query: applied.length === 0 ? "" : `?markers_r=${applied.join("%2C")}`,
        }),
      );
    }
  });
});

describe("what reaches the pixels URL", () => {
  it("adds a marker where the bar is double-clicked", async () => {
    await open(GRAY8);
    fireEvent.click(box("Gray"));

    doubleClick("Gray", 148);

    await waitFor(() => expect(query()).toBe("?markers_gray=128"));
  });

  it("ignores a double-click within ten levels of a marker, saying nothing", async () => {
    // Legacy returns without adding (channel_threshold_widget.py:249-253). It neither snaps the
    // marker nor explains; the web used to refuse with a message.
    await open(GRAY8);
    fireEvent.click(box("Gray"));
    doubleClick("Gray", 148);
    await waitFor(() => expect(query()).toBe("?markers_gray=128"));

    doubleClick("Gray", 139);

    expect(query()).toBe("?markers_gray=128");
    expect(screen.queryByRole("alert")).toBeNull();
    doubleClick("Gray", 138);
    await waitFor(() => expect(query()).toBe("?markers_gray=118%2C128"));
  });

  it("moves a marker by dragging, asking for the new image when it is let go", async () => {
    await open(GRAY8);
    fireEvent.click(box("Gray"));
    doubleClick("Gray", 148);
    await waitFor(() => expect(query()).toBe("?markers_gray=128"));

    fireEvent.pointerDown(bar("Gray"), { clientX: 150, clientY: 30, button: 0, pointerId: 1 });
    fireEvent.pointerMove(bar("Gray"), { clientX: 102, clientY: 30, buttons: 1, pointerId: 1 });

    expect(handles("Gray")).toEqual([80]);
    expect(query()).toBe("?markers_gray=128");

    fireEvent.pointerUp(bar("Gray"), { clientX: 102, clientY: 30, button: 0, pointerId: 1 });

    await waitFor(() => expect(query()).toBe("?markers_gray=80"));
  });

  it("removes a marker on a right-click on its handle", async () => {
    await open(GRAY8);
    fireEvent.click(box("Gray"));
    doubleClick("Gray", 148);
    doubleClick("Gray", 60);
    await waitFor(() => expect(query()).toBe("?markers_gray=40%2C128"));

    fireEvent.contextMenu(bar("Gray"), { clientX: 146, clientY: 30, button: 2 });

    await waitFor(() => expect(query()).toBe("?markers_gray=40"));
  });

  it("keeps each channel's markers to itself", async () => {
    await open(COLOUR8);
    fireEvent.click(box("Red"));
    fireEvent.click(box("Blue"));

    doubleClick("Red", 148);
    doubleClick("Blue", 60);
    doubleClick("Green", 100);

    await waitFor(() => expect(query()).toBe("?markers_r=128&markers_b=40"));
    expect(handles("Green")).toEqual([]);
  });

  it("runs a 16-bit image's bar to 65536", async () => {
    // Legacy's slider range for uint16 (channel_threshold_widget.py:429-432).
    await open(GRAY16);
    fireEvent.click(box("Gray"));

    doubleClick("Gray", 148);
    doubleClick("Gray", 275);

    await waitFor(() => expect(query()).toBe("?markers_gray=32768%2C65280"));
  });
});

describe("a new image", () => {
  it("starts with every box unticked and no markers, as legacy rebuilds its bars", async () => {
    await open(COLOUR8);
    fireEvent.click(box("Red"));
    doubleClick("Red", 148);
    await waitFor(() => expect(query()).toBe("?markers_r=128"));

    fireEvent.click(screen.getByText("open b"));

    await waitFor(() => expect(query()).toBe(""));
    await waitFor(() => expect(box("Red").checked).toBe(false));
    expect(handles("Red")).toEqual([]);
  });
});
