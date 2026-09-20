/**
 * The split view on screen — C14's shape, ahead of the slice that makes it drawable.
 *
 * What it claims is narrow and the tests keep it there: two images can be chosen, compared, and
 * linked, and what a linked operation WOULD do is described. Drawing into a pair needs the
 * workspace store to hold two open images, which is a change to the store rather than to this
 * component — so the view says that rather than showing drawing layers with nothing behind them.
 *
 * The capability stays PENDING in the table until it can be drawn into. A comparison view is not
 * "annotate both together".
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { SplitView } from "../../src/split/SplitView.jsx";

afterEach(cleanup);

function image(name: string): WireDatasetImage {
  return { key: `frames/${name}`, name, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

const FOLDER = [image("left.png"), image("right.png"), image("third.png")];

const SIZES: Record<string, { width: number; height: number }> = {
  "frames/left.png": { width: 100, height: 50 },
  "frames/right.png": { width: 100, height: 50 },
  "frames/third.png": { width: 80, height: 50 },
};

function show(images: readonly WireDatasetImage[] = FOLDER) {
  render(
    <SplitView
      images={images}
      sizeOf={(key) => SIZES[key] ?? null}
      pixelsUrl={(key) => `/pixels/${key}`}
    />,
  );
}

describe("with fewer than two images", () => {
  it("says a split view needs two", () => {
    show([FOLDER[0]!]);

    expect(screen.getByText(/needs two images/)).toBeTruthy();
  });
});

describe("choosing the pair", () => {
  // The captions, not the <option> elements -- every name appears in both pickers as well, so a
  // plain text query matches three times and proves nothing about what is SHOWN.
  const shown = () => screen.getAllByRole("figure").map((pane) => pane.querySelector("figcaption")?.textContent);

  it("shows the first two by default", () => {
    show();

    expect(shown()).toEqual(["left.png", "right.png"]);
  });

  it("lets either side be changed", () => {
    show();

    fireEvent.change(screen.getByLabelText("Right image"), { target: { value: "2" } });

    expect(shown()).toEqual(["left.png", "third.png"]);
  });

  it("allows the same image on both sides, and says so", () => {
    // A legitimate way to look at one picture under two sets of display adjustments. A user who
    // chose it by accident would otherwise wonder why both sides move together.
    show();

    fireEvent.change(screen.getByLabelText("Right image"), { target: { value: "0" } });

    expect(screen.getByText(/Both sides are showing the same image/)).toBeTruthy();
  });
});

describe("images of different sizes", () => {
  it("explains what linking will do, without refusing the pair", () => {
    // A user comparing a full frame with a crop of it has a real reason to pair them. The smaller
    // image refuses what falls outside, per operation.
    show();

    fireEvent.change(screen.getByLabelText("Right image"), { target: { value: "2" } });

    const note = screen.getByRole("status").textContent ?? "";
    expect(note).toMatch(/different sizes/);
    expect(note).toMatch(/same pixel/);
  });

  it("says nothing when they match", () => {
    show();

    expect(screen.queryByText(/different sizes/)).toBeNull();
  });
});

describe("linking", () => {
  it("starts linked, which is legacy's default", () => {
    show();

    expect((screen.getByLabelText("Link the viewers") as HTMLInputElement).checked).toBe(true);
  });

  it("describes what a linked operation would do to the classes", () => {
    // The rule that is easy to get wrong and invisible when you do: both images name the object
    // the same thing, each keeping its own id for it.
    show();

    expect(screen.getByText(/name the object the same class/)).toBeTruthy();
  });

  it("describes the unlinked case differently", () => {
    show();

    fireEvent.click(screen.getByLabelText("Link the viewers"));

    expect(screen.getByText(/active viewer only/)).toBeTruthy();
  });
});

describe("what is not built", () => {
  it("says drawing into a pair is not built, and what it waits on", () => {
    // Rather than showing drawing layers with nothing behind them, which is the defect this
    // session found three times.
    show();

    expect(screen.getByText(/Drawing into a pair is not built/)).toBeTruthy();
  });
});

describe("measuring before drawing", () => {
  it("says it is measuring an image whose size is not known yet", () => {
    // A canvas sized from a guess shows the image at the wrong scale, and every coordinate taken
    // from it is wrong by the same factor.
    render(
      <SplitView images={FOLDER} sizeOf={() => null} pixelsUrl={(key) => `/pixels/${key}`} />,
    );

    expect(screen.getAllByText(/Measuring/)).toHaveLength(2);
  });
});
