/**
 * C14 — compare two images side by side, and annotate both together.
 *
 * Decision 8's rebuild of multi-view, from RULE-092's rules rather than from legacy's
 * half-migrated feature. The capability has two halves and both have to hold:
 *
 *   - COMPARE: two images on screen with their annotations drawn, each holding its own segments,
 *     class names, crop, processing and undo.
 *   - ANNOTATE BOTH: one annotation drawn once landing in both, at the same PIXEL, under the same
 *     class NAME with each image keeping its own id for it, as ONE undo entry.
 *
 * What is deliberately NOT here, and is recorded rather than implied: the two sides SAVE
 * separately, and a linked EDIT or DELETE is not built. Adding is.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { SplitView } from "../../src/split/SplitView.jsx";
import { processingQuery } from "../../src/workspace/processing.js";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const LEFT: WireDatasetImage = {
  key: "frames/a.png",
  name: "a.png",
  sidecars: {},
  annotated: true,
  sharesSidecarsWith: [],
};
const RIGHT: WireDatasetImage = { ...LEFT, key: "frames/b.png", name: "b.png" };
const FOLDER = [LEFT, RIGHT];

/** Both images 100x100, so the same pixel exists in both and a mask could be carried. */
const SIZE = { width: 100, height: 100 };

/** a.png calls class 0 "car"; b.png calls class 0 "tree" and has never heard of a car. */
const FILES: Record<string, { segments: number; aliases: Record<string, string> }> = {
  "frames/a.png": { segments: 1, aliases: { "0": "car" } },
  "frames/b.png": { segments: 1, aliases: { "0": "tree" } },
};

function loaded(key: string): AnnotationsResult {
  const file = FILES[key]!;
  return {
    kind: "loaded",
    annotations: {
      segments: Array.from({ length: file.segments }, () => ({ type: "Polygon", classId: 0 })),
      classAliases: file.aliases,
      failures: [],
      rejected: 0,
      sourceFile: `${key}.npz`,
      sourceFormat: "NPZ",
    },
  } as unknown as AnnotationsResult;
}

const TRIANGLE: WireSegment = {
  type: "Polygon",
  classId: 0,
  vertices: [
    [10, 10],
    [30, 10],
    [30, 30],
  ],
} as unknown as WireSegment;

/** A square over the triangle: an eraser drawn where the linked shape landed. */
const OVER_TRIANGLE: WireSegment = {
  type: "Polygon",
  classId: null,
  vertices: [
    [5, 5],
    [40, 5],
    [40, 40],
    [5, 40],
  ],
} as unknown as WireSegment;

function Tools(): React.ReactNode {
  const { openImage, addSegment, eraseWith, history, classAliases, segments } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(LEFT)}>open a</button>
      <button type="button" onClick={() => addSegment(TRIANGLE)}>draw</button>
      <button type="button" onClick={() => eraseWith(OVER_TRIANGLE)}>erase</button>
      <button type="button" onClick={() => history.undo()}>undo</button>
      <button type="button" onClick={() => history.redo()}>redo</button>
      {/* The ACTIVE side's own view of the classes, which is what the class table shows. */}
      <p data-testid="activeAliases">{JSON.stringify(classAliases)}</p>
      <p data-testid="activeClasses">{segments.map((s) => s.classId).join(",")}</p>
    </>
  );
}

function mount() {
  const client = {
    imageMetadata: async () => ({ ...SIZE, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
    loadAnnotations: async (_project: string, key: string) => loaded(key),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  render(
    <WorkspaceProvider client={client} projectId="default">
      <Tools />
      <SplitView
        images={FOLDER}
        pixelsUrl={(key, processing) => `/pixels/${key}?${processingQuery(processing)}`}
      />
    </WorkspaceProvider>,
  );
}

const canvases = () =>
  screen.queryAllByRole("img").map((c) => c.getAttribute("aria-label"));
const shown = (id: string) => screen.getByTestId(id).textContent;

/** Both images open and drawn, ready to be linked. */
async function pair(): Promise<void> {
  mount();
  fireEvent.click(screen.getByText("open a"));
  await waitFor(() => expect(screen.getByLabelText("Second image")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Second image"), { target: { value: "frames/b.png" } });
  await waitFor(() => expect(canvases()).toEqual(["1 annotation", "1 annotation"]));
}

describe("C14: two images, compared", () => {
  it("shows both with their own annotations drawn", async () => {
    await pair();

    const captions = screen
      .getAllByRole("figure")
      .map((pane) => pane.querySelector("figcaption")?.textContent);
    expect(captions).toEqual(["a.png — editing", "b.png"]);
  });

  it("gives each side its own class names, per decision 6", async () => {
    // The same id means different things in the two files, which is exactly what per-image class
    // ids are for -- and why a linked operation may not simply copy the number across.
    await pair();
    expect(shown("activeAliases")).toBe('{"0":"car"}');

    fireEvent.click(screen.getByLabelText("Edit the right image"));

    await waitFor(() => expect(shown("activeAliases")).toBe('{"0":"tree"}'));
  });
});

describe("C14: annotating both together", () => {
  it("puts one drawn annotation into both images", async () => {
    await pair();
    fireEvent.click(screen.getByLabelText("Link the two images"));

    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "2 annotations"]));
  });

  it("agrees on the NAME, with each image keeping its own id", async () => {
    // b.png already uses id 0 for "tree", so the car it receives cannot be id 0. Copying the
    // number across would produce two files that both say "class 0" and mean different things --
    // worse than a visible mismatch, because every export would then look consistent.
    await pair();
    fireEvent.click(screen.getByLabelText("Link the two images"));

    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(screen.getByText(/Added to both images/)).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Edit the right image"));
    await waitFor(() => expect(shown("activeAliases")).toBe('{"0":"tree","1":"car"}'));
    // The received annotation carries the id THIS image uses for a car, not the one a.png uses.
    expect(shown("activeClasses")).toBe("0,1");
  });

  it("takes both back with one undo, and puts both back with one redo", async () => {
    // One action, one entry. Two entries would mean a user pressing undo once was left with the
    // pair half-changed, which is the state the whole arrangement exists to prevent.
    await pair();
    fireEvent.click(screen.getByLabelText("Link the two images"));
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "2 annotations"]));

    fireEvent.click(screen.getByText("undo"));
    await waitFor(() => expect(canvases()).toEqual(["1 annotation", "1 annotation"]));

    fireEvent.click(screen.getByText("redo"));
    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "2 annotations"]));
  });

  it("restores the other image's class table on undo, not just its segments", async () => {
    // Undo has to take back the NAME the link wrote too. Leaving "car" in b.png's table after the
    // annotation that brought it has gone would put a class in the file that nothing uses, and it
    // would be written on the next save.
    await pair();
    fireEvent.click(screen.getByLabelText("Link the two images"));
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "2 annotations"]));

    fireEvent.click(screen.getByText("undo"));

    fireEvent.click(screen.getByLabelText("Edit the right image"));
    await waitFor(() => expect(shown("activeAliases")).toBe('{"0":"tree"}'));
  });

  it("marks BOTH images unsaved, so neither can be left behind", async () => {
    await pair();
    fireEvent.click(screen.getByLabelText("Link the two images"));

    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => {
      const captions = screen
        .getAllByRole("figure")
        .map((pane) => pane.querySelector("figcaption")?.textContent);
      expect(captions).toEqual(["a.png — editing (unsaved)", "b.png (unsaved)"]);
    });
  });
});

describe("C14: erasing both together (RULE-092)", () => {
  /*
   * Legacy mirrors erasing as it mirrors adding: Shift+Space finishes the polygon in both linked
   * viewers in erase mode, and an AI mask accepted in erase mode is applied to both. Deleting and
   * merging it does not link -- each viewer has its own buttons -- and neither does this app.
   */
  async function drawnInBoth(): Promise<void> {
    await pair();
    fireEvent.click(screen.getByLabelText("Link the two images"));
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "2 annotations"]));
  }

  it("erases at the same pixels in both images while linked, and says so", async () => {
    await drawnInBoth();

    fireEvent.click(screen.getByText("erase"));

    await waitFor(() => expect(canvases()).toEqual(["1 annotation", "1 annotation"]));
    // Legacy's words for the mirrored erase (main_window.py:5803-5805), naming the image.
    expect(screen.getByText("Erased 1 segment(s) from b.png")).toBeTruthy();
  });

  it("takes both back with one undo", async () => {
    // One gesture, one entry: an undo that restored one image and not the other would leave the
    // pair half-changed.
    await drawnInBoth();
    fireEvent.click(screen.getByText("erase"));
    await waitFor(() => expect(canvases()).toEqual(["1 annotation", "1 annotation"]));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "2 annotations"]));
  });

  it("erases only the image being edited while unlinked", async () => {
    await drawnInBoth();
    fireEvent.click(screen.getByLabelText("Link the two images"));

    fireEvent.click(screen.getByText("erase"));

    await waitFor(() => expect(canvases()).toEqual(["1 annotation", "2 annotations"]));
  });
});
