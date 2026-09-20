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

import { TimelinePanel } from "../../src/sequence/TimelinePanel.jsx";

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
  render(<TimelinePanel images={images} onOpen={onOpen} />);
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
