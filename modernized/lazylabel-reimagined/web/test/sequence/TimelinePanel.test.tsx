/**
 * The sequence timeline on screen.
 *
 * `timeline.test.ts` proves the rules. This proves a person can reach them — which is the gap that
 * hid the vertex editor in this project for weeks: built, unit-tested, and never rendered by
 * anything, so every test passed while the feature did not exist.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { TimelinePanel } from "../../src/sequence/TimelinePanel.jsx";

/**
 * Min Conf is a PERSISTED setting, so the panel needs the settings context above it.
 *
 * `saved` records what was written, which is how the tests below can tell "the control moved" from
 * "the number was remembered" -- two different claims that a local `useState` would have made
 * look identical.
 */
function withSettings(node: React.ReactNode, saved: Record<string, unknown> = {}) {
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: { values: Record<string, unknown> }) => {
      Object.assign(saved, next.values);
      return next;
    },
  } as unknown as ApiClient;
  return <SettingsProvider client={client}>{node}</SettingsProvider>;
}

afterEach(cleanup);

function image(name: string, annotated = false): WireDatasetImage {
  return { key: `frames/${name}`, name, sidecars: {}, annotated, sharesSidecarsWith: [] };
}

const FOLDER = [
  image("f01.png"),
  image("f02.png", true),
  image("f03.png"),
  image("f04.png"),
  image("f05.png", true),
];

function show(images: readonly WireDatasetImage[] = FOLDER) {
  const onOpen = vi.fn();
  render(withSettings(<TimelinePanel images={images} onOpen={onOpen} />));
  return { onOpen };
}

function build(from?: string, to?: string) {
  if (from !== undefined) {
    fireEvent.change(screen.getByLabelText("First frame"), { target: { value: from } });
  }
  if (to !== undefined) {
    fireEvent.change(screen.getByLabelText("Last frame"), { target: { value: to } });
  }
  fireEvent.click(screen.getByText("Build timeline"));
}

const cells = () => screen.getByLabelText("Timeline").querySelectorAll("button");

describe("before a timeline exists", () => {
  it("says a sequence needs a folder", () => {
    show([]);
    expect(screen.getByText(/built from a folder of images/)).toBeTruthy();
  });

  it("offers the frames by NAME, not by number", () => {
    // A user picks "from this one to that one" by looking at them. Indices would be faster to
    // implement and would make the user count.
    show();
    expect(screen.getByLabelText("First frame")).toBeTruthy();
    expect(screen.getAllByText("f03.png").length).toBeGreaterThan(0);
  });
});

describe("building one", () => {
  it("makes a cell per frame in the range", async () => {
    show();

    build("1", "3");

    await waitFor(() => expect(cells()).toHaveLength(3));
  });

  it("marks the already-annotated frames as references", async () => {
    // The pilot's second half. The listing already says which images are annotated, so no new
    // endpoint is needed for it.
    show();

    build("0", "4");

    await waitFor(() => expect(cells()).toHaveLength(5));
    const named = [...cells()].map((c) => c.getAttribute("aria-label"));
    expect(named[1]).toContain("reference");
    expect(named[4]).toContain("reference");
    expect(named[0]).toContain("pending");
  });

  it("names every cell as well as colouring it", async () => {
    // Colour is how the timeline is read at a glance and it is the only thing legacy offers. A
    // screen reader gets nothing from it, and neither does anyone who cannot separate the red
    // from the brown.
    show();
    build("0", "1");

    await waitFor(() => expect(cells()).toHaveLength(2));
    expect(cells()[0]!.getAttribute("aria-label")).toBe("Frame 1, frames/f01.png, pending");
  });

  it("counts the frames and the references", async () => {
    show();

    build("0", "4");

    expect(await screen.findByText(/5 frames, 2 references/)).toBeTruthy();
  });
});

describe("using it", () => {
  it("opens the frame that was clicked", async () => {
    const { onOpen } = show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(cells()[2]!);

    expect(onOpen).toHaveBeenCalledWith("frames/f03.png");
  });

  it("jumps to the next reference, and opens it", async () => {
    const { onOpen } = show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(screen.getByText("Next reference"));

    expect(onOpen).toHaveBeenCalledWith("frames/f02.png");
  });

  it("does nothing when there is no frame of that kind, rather than jumping somewhere", async () => {
    // Nothing is flagged without propagation, so Next flagged has nowhere to go. Silence is the
    // honest answer; moving to frame 0 would look like it had found something.
    const { onOpen } = show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(screen.getByText("Next flagged"));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("sorts references first, and unsorts again", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(screen.getByText("Sort"));

    await waitFor(() =>
      expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f02.png"),
    );

    fireEvent.click(screen.getByText("Unsort"));

    await waitFor(() =>
      expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f01.png"),
    );
  });

  it("goes back to the range picker on New timeline", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(screen.getByText("New timeline"));

    expect(await screen.findByText("Build timeline")).toBeTruthy();
  });
});

describe("what is not built", () => {
  it("offers no propagation button, and says why", async () => {
    // A control with nothing behind it is the thing this codebase refuses to ship. Naming what is
    // missing, and what it waits on, is the alternative.
    show();
    build("0", "4");

    await waitFor(() => expect(cells()).toHaveLength(5));
    expect(screen.queryByText(/^Propagate/)).toBeNull();
    expect(screen.getByText(/waits on a recorded sequence/)).toBeTruthy();
  });
});

describe("the confidence histogram", () => {
  /** Frames 0..4 of the folder, with propagation scores on three of them. */
  function withScores(scores: Record<number, number>) {
    const saved: Record<string, unknown> = {};
    render(withSettings(<TimelinePanel images={FOLDER} scores={scores} />, saved));
    fireEvent.click(screen.getByText("Build timeline"));
    return saved;
  }

  const threshold = () => screen.getByLabelText("Minimum confidence") as HTMLInputElement;
  const setThreshold = (value: number) =>
    fireEvent.change(threshold(), { target: { value: String(value) } });

  it("offers Min Conf at 0.99 as soon as there is a timeline, before any score exists", () => {
    // REACHABLE before the data is, which is the point of building it now. A histogram nobody can
    // open until the model lands is a histogram nobody has ever run. It sits with the timeline
    // rather than above it because there is nothing to threshold without frames.
    withScores({});

    expect(threshold().value).toBe("0.99");
    expect(screen.getByText(/No confidence scores yet/)).toBeTruthy();
  });

  it("says what the threshold will do, rather than drawing an empty chart", () => {
    withScores({});

    expect(screen.getByText(/flagged for review and left out of Save All/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("draws the scores and counts which side of the threshold they fall", () => {
    withScores({ 0: 0.95, 1: 0.97, 2: 0.995 });

    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "3 frames scored, 2 below 0.99",
    );
    expect(screen.getByText(/2 below \(67%\), 1 above/)).toBeTruthy();
  });

  it("starts the axis below the lowest score, not at zero", () => {
    // RULE-035. Propagation scores cluster just under 1 and a 0-to-1 axis is one spike.
    withScores({ 0: 0.95, 1: 0.97, 2: 0.995 });

    expect(screen.getByText("0.93")).toBeTruthy();
    expect(screen.getByText("1.00")).toBeTruthy();
  });

  it("MOVES THE TIMELINE when the threshold changes, not just the counts", () => {
    // The legacy defect: Min Conf recomputes the set Save All uses and leaves the colours alone,
    // so the user reviews one set of frames and ships another.
    withScores({ 0: 0.95, 1: 0.97, 2: 0.995 });
    const flaggedCount = () =>
      [...cells()].filter((cell) => (cell.getAttribute("title") ?? "").includes("flagged")).length;

    // Two of the three scored frames move. The third is f02.png, which already had annotations
    // and is therefore a REFERENCE -- ground truth the user drew, which a number changing must
    // not turn into something the app says needs review.
    setThreshold(1);
    expect(flaggedCount()).toBe(2);

    setThreshold(0.9);
    expect(flaggedCount()).toBe(0);
  });

  it("never flags a reference frame, however low its score", () => {
    withScores({ 1: 0.1 });
    const referenceCell = [...cells()].find((cell) =>
      (cell.getAttribute("title") ?? "").includes("reference"),
    );

    setThreshold(1);

    expect(referenceCell?.getAttribute("title")).not.toContain("flagged");
  });

  it("clamps a threshold outside [0, 1]", async () => {
    withScores({ 0: 0.95 });

    setThreshold(5);

    // Awaited, because the value comes back through the SETTINGS rather than from panel state --
    // which is the point: Min Conf decides which frames get saved, so it has to survive a reload.
    await waitFor(() => expect(threshold().value).toBe("1"));
  });

  it("REMEMBERS the threshold, because it decides what gets saved", async () => {
    // A stored setting nothing reads is a control that lies about having remembered anything.
    // `propagation_confidence_threshold` had no reader at all until this panel gained one.
    const saved = withScores({ 0: 0.95 });

    setThreshold(0.8);

    await waitFor(() => expect(saved["propagation_confidence_threshold"]).toBe(0.8));
  });

  it("starts at RULE-060's 0.99, which is legacy's default", async () => {
    // It was 0.5 in the schema, which nothing chose on purpose. 0.5 is not a milder setting:
    // propagation scores cluster just under 1, so almost nothing is ever flagged and the user
    // reviews nothing.
    withScores({});

    await waitFor(() => expect(threshold().value).toBe("0.99"));
  });
});
