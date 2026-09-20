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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      measure={async (key) => SIZES[key] ?? { width: 1, height: 1 }}
      annotationsFor={async () => []}
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
  it("explains what linking will do, without refusing the pair", async () => {
    // A user comparing a full frame with a crop of it has a real reason to pair them. The smaller
    // image refuses what falls outside, per operation.
    show();

    fireEvent.change(screen.getByLabelText("Right image"), { target: { value: "2" } });

    // By TEXT rather than by role: the pane may also be announcing that it is measuring, and two
    // status regions make `getByRole` ambiguous rather than wrong.
    const note = await screen.findByText(/different sizes/);
    expect(note.textContent).toMatch(/same pixel/);
  });

  it("says nothing when they match", () => {
    show();

    expect(screen.queryByText(/different sizes/)).toBeNull();
  });
});

describe("the annotations on each side", () => {
  it("asks for each image's own, and only once the size is known", async () => {
    // Ordered rather than raced: the text formats store NORMALIZED coordinates, so reading them
    // before the size has landed rescales every polygon silently.
    const asked: { key: string; size: { width: number; height: number } }[] = [];
    render(
      <SplitView
        images={FOLDER}
        measure={async (key) => SIZES[key] ?? { width: 1, height: 1 }}
        annotationsFor={async (key, size) => {
          asked.push({ key, size });
          return [];
        }}
        pixelsUrl={(key) => `/pixels/${key}`}
      />,
    );

    await waitFor(() => expect(asked).toHaveLength(2));
    expect(asked.map((a) => a.key).sort()).toEqual(["frames/left.png", "frames/right.png"]);
    // The size it was given is that image's own, not the other's.
    expect(asked.find((a) => a.key === "frames/left.png")?.size).toEqual(SIZES["frames/left.png"]);
  });

  it("draws them, so two labelled images can be compared by eye", async () => {
    // The whole point of a split view. Two pictures with no labels on either is the least useful
    // half of it.
    render(
      <SplitView
        images={FOLDER}
        measure={async (key) => SIZES[key] ?? { width: 1, height: 1 }}
        annotationsFor={async () => [
          { type: "Polygon", classId: 0, vertices: [[1, 1], [5, 1], [5, 5]] },
        ] as never}
        pixelsUrl={(key) => `/pixels/${key}`}
      />,
    );

    await waitFor(() =>
      expect(
        [...screen.getAllByRole("img")].map((c) => c.getAttribute("aria-label")),
      ).toEqual(["1 annotations", "1 annotations"]),
    );
  });

  it("shows the picture with nothing over it when they cannot be read", async () => {
    // The single-image view reports a damaged file properly; repeating that here would be a second
    // place to keep right about the same thing.
    render(
      <SplitView
        images={FOLDER}
        measure={async (key) => SIZES[key] ?? { width: 1, height: 1 }}
        annotationsFor={async () => {
          throw new Error("the npz is truncated");
        }}
        pixelsUrl={(key) => `/pixels/${key}`}
      />,
    );

    await waitFor(() =>
      expect([...screen.getAllByRole("img")].map((c) => c.getAttribute("aria-label"))).toEqual([
        "0 annotations",
        "0 annotations",
      ]),
    );
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
    // A measurement that never resolves: the pane says what it is doing rather than drawing from
    // a guess. A canvas sized wrongly shows the image at the wrong scale, and every coordinate
    // taken from it is wrong by the same factor.
    render(
      <SplitView
        images={FOLDER}
        measure={() => new Promise(() => undefined)}
        annotationsFor={async () => []}
        pixelsUrl={(key) => `/pixels/${key}`}
      />,
    );

    expect(screen.getAllByText(/Measuring/)).toHaveLength(2);
  });
});
