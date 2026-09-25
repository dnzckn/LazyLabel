/**
 * The split view on screen — C14, now backed by the workspace store.
 *
 * The left pane is the image you have open; this panel chooses the second one and opens it into
 * the store's other side. Both panes read their size, their processing and their live segments
 * from the store, so the two loading paths this view used to carry are gone — and with them the
 * ordering rule they had to repeat, that a size must land before annotations or every normalized
 * coordinate rescales.
 *
 * What it still does not do is a LINKED operation: one action on both images, as one undo entry.
 * Each side is edited on its own. The tests keep the claim where the code is.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { SplitView } from "../../src/split/SplitView.jsx";
import { processingQuery } from "../../src/workspace/processing.js";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

function image(name: string): WireDatasetImage {
  return { key: `frames/${name}`, name, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

const FOLDER = [image("left.png"), image("right.png"), image("third.png")];

/** third.png is narrower, which is what makes a pair worth describing. */
const SIZES: Record<string, { width: number; height: number }> = {
  "frames/left.png": { width: 100, height: 50 },
  "frames/right.png": { width: 100, height: 50 },
  "frames/third.png": { width: 80, height: 50 },
};

function annotations(count: number): AnnotationsResult {
  return {
    kind: "loaded",
    annotations: {
      segments: Array.from({ length: count }, () => ({ type: "Polygon", classId: 0 })),
      classAliases: {},
      failures: [],
      rejected: 0,
      sourceFile: "x.npz",
      sourceFormat: "NPZ",
    },
  } as unknown as AnnotationsResult;
}

/** Opens the LEFT image the way the dataset browser does, and can draw into whichever side is active. */
function Opener(): React.ReactNode {
  const { openImage, addSegment, setProcessing, processing, history } = useWorkspace();
  return (
    <>
      {FOLDER.map((entry) => (
        <button key={entry.key} type="button" onClick={() => openImage(entry)}>
          open {entry.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => addSegment({ type: "Polygon", classId: 0, vertices: [[1, 1]] } as never)}
      >
        draw
      </button>
      <button type="button" onClick={() => history.undo()}>
        undo
      </button>
      <button
        type="button"
        onClick={() =>
          addSegment({
            type: "AI",
            classId: 0,
            mask: { width: 100, height: 50, data: "m" },
          } as never)
        }
      >
        draw mask
      </button>
      <button
        type="button"
        onClick={() => setProcessing({ ...processing, rescale: { min: 10, max: 200 } })}
      >
        adjust
      </button>
    </>
  );
}

function mount({
  images = FOLDER,
  counts = {} as Record<string, number>,
  metadata,
  confirm,
  viewer,
}: {
  images?: readonly WireDatasetImage[];
  counts?: Record<string, number>;
  metadata?: ApiClient["imageMetadata"];
  confirm?: (summary: string) => boolean;
  viewer?: React.ReactNode;
} = {}) {
  const pixelsUrl = vi.fn((key: string, processing: Parameters<typeof processingQuery>[0]) => {
    const query = processingQuery(processing);
    return query === "" ? `/pixels/${key}` : `/pixels/${key}?${query}`;
  });

  const client = {
    imageMetadata:
      metadata ??
      (async (_project: string, key: string) => ({
        ...(SIZES[key] ?? { width: 1, height: 1 }),
        sourceDepth: 8,
        sourceChannels: 3,
        sourceFormat: "png",
      })),
    loadAnnotations: async (_project: string, key: string) => annotations(counts[key] ?? 0),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  render(
    <WorkspaceProvider client={client} projectId="default" {...(confirm ? { confirmNavigation: confirm } : {})}>
      <Opener />
      <SplitView images={images} pixelsUrl={pixelsUrl} {...(viewer === undefined ? {} : { viewer })} />
    </WorkspaceProvider>,
  );

  return { pixelsUrl };
}

/** The captions, not the <option> elements — every name is in the picker too. */
const panes = () =>
  screen.getAllByRole("figure").map((pane) => pane.querySelector("figcaption")?.textContent);

const canvases = () =>
  [...screen.queryAllByRole("img")].map((c) => c.getAttribute("aria-label"));

async function openLeft(name = "left.png"): Promise<void> {
  fireEvent.click(screen.getByText(`open ${name}`));
  await waitFor(() => expect(panes().length).toBeGreaterThan(0));
}

async function pairWith(name: string): Promise<void> {
  fireEvent.change(screen.getByLabelText("Second image"), {
    target: { value: `frames/${name}` },
  });
  await waitFor(() => expect(panes().length).toBe(2));
}

describe("before there is anything to pair", () => {
  it("asks for an image to be opened first", () => {
    mount();

    expect(screen.getByText(/Open an image first/)).toBeTruthy();
  });

  it("says a split view needs two images when the folder has one", async () => {
    mount({ images: [FOLDER[0]!] });
    // Not `openLeft`: with one image there is no pane to wait for, which is the point.
    fireEvent.click(screen.getByText("open left.png"));

    await waitFor(() => expect(screen.getByText(/needs two images/)).toBeTruthy());
  });

  it("shows the open image alone until a second is chosen", async () => {
    mount();
    await openLeft();

    expect(panes()).toEqual(["left.png"]);
    expect(screen.getByText(/Pick a second image/)).toBeTruthy();
  });
});

describe("choosing the pair", () => {
  it("opens the chosen image beside the one already open", async () => {
    mount();
    await openLeft();
    await pairWith("right.png");

    expect(panes()).toEqual(["left.png — editing", "right.png"]);
  });

  it("does NOT move the editing side to the image it just opened", async () => {
    // Choosing a partner is not a decision about where the next stroke goes. Moving the user's
    // hand for them is the sort of helpfulness that draws a polygon into the wrong image.
    mount();
    await openLeft();
    await pairWith("right.png");

    expect((screen.getByLabelText("Edit the left image") as HTMLInputElement).checked).toBe(true);
  });

  it("goes back to one image, and to editing it, when the pair is cleared", async () => {
    mount();
    await openLeft();
    await pairWith("right.png");
    fireEvent.click(screen.getByLabelText("Edit the right image"));

    fireEvent.change(screen.getByLabelText("Second image"), { target: { value: "" } });

    await waitFor(() => expect(panes()).toEqual(["left.png"]));
    // The editing side comes back with it. A closed side left active would send every tool at an
    // image that is no longer on screen.
    expect(screen.queryByLabelText("Edit the right image")).toBeNull();
  });

  it("ASKS before clearing a pair whose second image has unsaved work, and keeps it on a no", async () => {
    // Opening another image into the side asked; choosing "None" did not, until 2026-09-23.
    const confirm = vi.fn((_summary: string) => false);
    mount({ confirm });
    await openLeft();
    await pairWith("right.png");
    fireEvent.click(screen.getByLabelText("Edit the right image"));
    fireEvent.click(screen.getByText("draw"));

    fireEvent.change(screen.getByLabelText("Second image"), { target: { value: "" } });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toMatch(/right\.png/);
    expect(panes()).toEqual(["left.png", "right.png — editing (unsaved)"]);
    expect((screen.getByLabelText("Second image") as HTMLSelectElement).value).toBe("frames/right.png");
  });

  it("allows the same image on both sides, and warns that the two do not share edits", async () => {
    // Legitimate -- one picture under two sets of display adjustments -- but the sides hold
    // separate segments, so this is the one arrangement where a user could lose work by saving
    // the side they did not draw on.
    mount();
    await openLeft();
    await pairWith("left.png");

    expect(screen.getByText(/Both sides are showing the same image/)).toBeTruthy();
    expect(screen.getByText(/the later save will win/)).toBeTruthy();
  });
});

describe("what each pane draws", () => {
  it("draws each image's own annotations, so two labelled images compare by eye", async () => {
    mount({ counts: { "frames/left.png": 2, "frames/right.png": 5 } });
    await openLeft();
    await pairWith("right.png");

    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "5 annotations"]));
  });

  it("shows an edit as it happens, because the segments are the store's", async () => {
    // The point of moving the panes onto the store: the left pane is the image being edited, so a
    // shape drawn in the centre view has to appear here without a reload.
    mount({ counts: { "frames/left.png": 2, "frames/right.png": 5 } });
    await openLeft();
    await pairWith("right.png");
    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "5 annotations"]));

    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(canvases()).toEqual(["3 annotations", "5 annotations"]));
    expect(panes()[0]).toContain("(unsaved)");
  });

  it("draws each side through its OWN processing", async () => {
    // A pane drawn from the plain URL would show one side adjusted and the other raw, which in a
    // comparison view is the one thing that must not happen.
    const { pixelsUrl } = mount();
    await openLeft();
    await pairWith("right.png");
    fireEvent.click(screen.getByText("adjust"));

    // The adjustment went to the ACTIVE side, which is the left one.
    const queryFor = (key: string) =>
      pixelsUrl.mock.calls.filter(([k]) => k === key).map(([, p]) => processingQuery(p));

    await waitFor(() => expect(queryFor("frames/left.png").at(-1)).not.toBe(""));
    expect(queryFor("frames/right.png").at(-1)).toBe("");
  });

  it("says it is measuring an image whose size has not arrived", async () => {
    // A canvas sized from a guess shows the image at the wrong scale, and every coordinate taken
    // from it is wrong by the same factor.
    mount({ metadata: (() => new Promise(() => {})) as never });
    fireEvent.click(screen.getByText("open left.png"));

    await waitFor(() => expect(screen.getByText(/Measuring left\.png/)).toBeTruthy());
    expect(canvases()).toEqual([]);
  });
});

describe("images of different sizes", () => {
  it("explains what linking will do, without refusing the pair", async () => {
    mount();
    await openLeft();
    await pairWith("third.png");

    await waitFor(() => expect(screen.getByText(/100x50 and 80x50/)).toBeTruthy());
    // Still both drawn: a mismatch is a thing to say, not a reason to show nothing.
    expect(canvases().length).toBe(2);
  });

  it("says nothing when they match", async () => {
    mount();
    await openLeft();
    await pairWith("right.png");

    await waitFor(() => expect(canvases().length).toBe(2));
    expect(screen.queryByText(/different sizes/)).toBeNull();
  });
});

describe("which side the tools act on", () => {
  it("moves the editing side, and the edit lands there", async () => {
    mount({ counts: { "frames/left.png": 2, "frames/right.png": 5 } });
    await openLeft();
    await pairWith("right.png");
    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "5 annotations"]));

    fireEvent.click(screen.getByLabelText("Edit the right image"));
    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "6 annotations"]));
    expect(panes()).toEqual(["left.png", "right.png — editing (unsaved)"]);
  });
});

describe("saying which of the two you are getting", () => {
  it("says the sides are independent while unlinked", async () => {
    mount();
    await openLeft();
    await pairWith("right.png");

    expect(screen.getByText(/^Unlinked:/)).toBeTruthy();
    expect(screen.getByText(/Tick Linked to draw into both at once/)).toBeTruthy();
  });

  it("says what linking does, and what it still does not, once linked", async () => {
    // The claim stays where the code is. Adding and erasing are linked, as legacy links them;
    // deleting and merging are not, in legacy or here, and saving is not -- a view that implied
    // otherwise would be found out at export.
    mount();
    await openLeft();
    await pairWith("right.png");
    fireEvent.click(screen.getByLabelText("Link the two images"));

    const note = screen.getByText(/^Linked:/);
    expect(note.textContent).toContain("Erasing links the same way");
    expect(note.textContent).toContain("Deleting and merging act on the side chosen above");
    expect(note.textContent).toContain("each side still SAVES separately");
  });
});

describe("drawing into both at once", () => {
  /** Turn linking on for a settled pair, then draw. */
  async function linkedPair(second = "right.png"): Promise<void> {
    await openLeft();
    await pairWith(second);
    await waitFor(() => expect(canvases().length).toBe(2));
    fireEvent.click(screen.getByLabelText("Link the two images"));
  }

  it("is OFF until asked for, so a stroke cannot reach an image by surprise", async () => {
    mount({ counts: { "frames/left.png": 1, "frames/right.png": 1 } });
    await openLeft();
    await pairWith("right.png");
    await waitFor(() => expect(canvases()).toEqual(["1 annotation", "1 annotation"]));

    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "1 annotation"]));
    expect((screen.getByLabelText("Link the two images") as HTMLInputElement).checked).toBe(false);
  });

  it("puts one drawn annotation into BOTH images", async () => {
    mount({ counts: { "frames/left.png": 1, "frames/right.png": 1 } });
    await linkedPair();

    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "2 annotations"]));
    expect(panes()).toEqual([
      "left.png — editing (unsaved)",
      "right.png (unsaved)",
    ]);
  });

  it("takes both back with ONE undo, because the user performed one action", async () => {
    mount({ counts: { "frames/left.png": 1, "frames/right.png": 1 } });
    await linkedPair();
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(canvases()).toEqual(["2 annotations", "2 annotations"]));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(canvases()).toEqual(["1 annotation", "1 annotation"]));
  });

  it("says which class the other image used", async () => {
    mount({ counts: { "frames/left.png": 1, "frames/right.png": 1 } });
    await linkedPair();

    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(screen.getByText(/Added to both images/)).toBeTruthy());
  });

  it("refuses the other image rather than moving the shape, and says so", async () => {
    // third.png is narrower. The drawn triangle sits at x=1 so it FITS; the point of this test is
    // the mask case, which cannot be mirrored between images of different sizes at all.
    mount();
    await openLeft();
    await pairWith("third.png");
    await waitFor(() => expect(canvases().length).toBe(2));
    fireEvent.click(screen.getByLabelText("Link the two images"));

    fireEvent.click(screen.getByText("draw mask"));

    await waitFor(() => expect(screen.getByText(/Added to this image only/)).toBeTruthy());
    // The active side still got it: a refusal is about the OTHER image, not about the stroke.
    await waitFor(() => expect(canvases()).toEqual(["1 annotation", "0 annotations"]));
  });

  it("does nothing different when there is no second image", async () => {
    mount();
    await openLeft();

    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(canvases()).toEqual(["1 annotation"]));
    expect(screen.queryByText(/Added to both images/)).toBeNull();
  });
});

/*
 * In the Multi tab the interactive view is drawn in the ACTIVE half, as legacy's two viewers are
 * both live: either image is drawn on where it is shown. The other half is its picture.
 */
describe("the view in the active half", () => {
  it("draws the view where the active image is, and the other image as a picture", async () => {
    mount({ viewer: <p>the view</p> });
    await openLeft();
    await pairWith("right.png");

    const [left, right] = screen.getAllByRole("figure");
    expect(left!.textContent).toContain("the view");
    expect(right!.textContent).not.toContain("the view");
    expect(right!.querySelector("canvas")).not.toBeNull();
  });

  it("moves the view, and the tools, to the half that is clicked", async () => {
    mount({ viewer: <p>the view</p> });
    await openLeft();
    await pairWith("right.png");

    fireEvent.click(screen.getAllByRole("figure")[1]!);

    await waitFor(() => expect(panes()).toEqual(["left.png", "right.png — editing"]));
    const [left, right] = screen.getAllByRole("figure");
    expect(right!.textContent).toContain("the view");
    expect(left!.textContent).not.toContain("the view");
  });

  it("shows legacy's empty second viewer until a second image is chosen", async () => {
    mount({ viewer: <p>the view</p> });
    await openLeft();

    expect(document.querySelector(".split__pane--empty")?.textContent).toBe("No image");
  });
});
