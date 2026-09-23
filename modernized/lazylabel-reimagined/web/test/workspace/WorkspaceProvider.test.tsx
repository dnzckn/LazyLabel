/**
 * The workspace store: what is open, and the races that make "what is open" a hard question.
 *
 * Opening an image is two fetches with an order that matters, and a user can start another one
 * before either finishes. Every test here is a way that goes wrong quietly — which is the failure
 * mode that costs annotations, because the screen looks fine.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

function datasetImage(key: string): WireDatasetImage {
  return { key, name: key, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

function loaded(segments: number): AnnotationsResult {
  return {
    kind: "loaded",
    annotations: {
      segments: Array.from({ length: segments }, () => ({})),
      classAliases: {},
      failures: [],
      rejected: 0,
      sourceFile: "a.npz",
      sourceFormat: "NPZ",
    },
  } as unknown as AnnotationsResult;
}

/** Shows the store's answers as text, so the tests read what a component would see. */
function Probe(): React.ReactNode {
  const { open, openImage, imageState, segments, addSegment, history, markSaved } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => addSegment({ type: "Polygon", classId: 1, vertices: [[1, 1], [5, 1], [5, 5]] })}>
        draw
      </button>
      <button type="button" onClick={() => history.undo()}>undo</button>
      <button type="button" onClick={() => history.redo()}>redo</button>
      <button type="button" onClick={markSaved}>saved</button>
      <p data-testid="segments">{segments.length}</p>
      <p data-testid="dirty">{imageState?.dirty === true ? "dirty" : "clean"}</p>
      <p data-testid="canUndo">{history.state.canUndo ? "yes" : "no"}</p>
      <button type="button" onClick={() => openImage(datasetImage("a.png"))}>
        open a
      </button>
      <button type="button" onClick={() => openImage(datasetImage("b.png"))}>
        open b
      </button>
      <p data-testid="open">{open === null ? "none" : open.image.key}</p>
      <p data-testid="state">
        {imageState === null ? "none" : `${imageState.key}:${imageState.provenance}:${imageState.segmentCount}`}
      </p>
      <p data-testid="error">{open?.error ?? "none"}</p>
    </>
  );
}

function mount(client: Partial<ApiClient>) {
  const full = {
    imageMetadata: async () => ({ width: 10, height: 20, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async () => loaded(3),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    ...client,
  } as unknown as ApiClient;

  render(
    <WorkspaceProvider client={full} projectId="p1" confirmNavigation={() => true}>
      <Probe />
    </WorkspaceProvider>,
  );
}

const shown = (id: string) => screen.getByTestId(id).textContent;

describe("opening an image", () => {
  it("reports it as open straight away, before its annotations arrive", async () => {
    mount({});
    fireEvent.click(screen.getByText("open a"));

    expect(shown("open")).toBe("a.png");
  });

  it("reports NO image state until the annotations are actually in", async () => {
    // The distinction that matters: "still loading" must not look like "loaded and empty". An
    // image reported as empty while it is still opening is an image a save would write nothing
    // over -- which is the shape of legacy's most expensive bug.
    mount({ loadAnnotations: () => new Promise(() => {}) as never });
    fireEvent.click(screen.getByText("open a"));

    expect(shown("state")).toBe("none");
  });

  it("fetches the pixel size before the annotations", async () => {
    // Load-bearing order: the text formats store NORMALIZED coordinates, so the reader needs the
    // dimensions. Fetching them in parallel and taking whichever wins rescales every polygon.
    const calls: string[] = [];
    mount({
      imageMetadata: async () => {
        calls.push("metadata");
        return { width: 10, height: 20, sourceDepth: 8, sourceFormat: "png" } as never;
      },
      loadAnnotations: async () => {
        calls.push("annotations");
        return loaded(1);
      },
    });

    fireEvent.click(screen.getByText("open a"));

    await waitFor(() => expect(calls).toEqual(["metadata", "annotations"]));
  });

  it("passes the size it just fetched to the annotation load", async () => {
    const seen: unknown[] = [];
    mount({
      loadAnnotations: async (_p: string, _k: string, size: readonly [number, number]) => {
        seen.push(size);
        return loaded(1);
      },
    });

    fireEvent.click(screen.getByText("open a"));

    // Height then width, as the reader expects. Swapped, every normalized coordinate is wrong on
    // any image that is not square -- and right on the ones a test fixture usually uses.
    await waitFor(() => expect(seen).toEqual([[20, 10]]));
  });

  it("derives the segment count once the annotations land", async () => {
    mount({});
    fireEvent.click(screen.getByText("open a"));

    await waitFor(() => expect(shown("state")).toBe("a.png:loaded:3"));
  });

  it("keeps an image with no annotation file apart from one that could not be read", async () => {
    // Both have zero segments; only one is safe to write over.
    mount({ loadAnnotations: async () => ({ kind: "none" }) as AnnotationsResult });
    fireEvent.click(screen.getByText("open a"));

    await waitFor(() => expect(shown("state")).toBe("a.png:absent:0"));
  });

  it("marks an image that failed to open as unsafe rather than empty", async () => {
    mount({ imageMetadata: async () => { throw new Error("not an image"); } });
    fireEvent.click(screen.getByText("open a"));

    await waitFor(() => expect(shown("state")).toBe("a.png:failed:0"));
  });
});

describe("opening another image before the first finishes", () => {
  it("does not apply the slow one's annotations to the new image", async () => {
    // The race that loses work silently. A user clicks a.png, it is slow, they click b.png, and
    // a.png's annotations arrive -- against b.png's name, with b.png's file on screen. Legacy has
    // exactly this shape: the current path is committed before the load resolves.
    let releaseA: (value: AnnotationsResult) => void = () => {};
    const loadAnnotations = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<AnnotationsResult>((resolve) => { releaseA = resolve; }),
      )
      .mockImplementationOnce(async () => loaded(7));

    mount({ loadAnnotations: loadAnnotations as never });

    fireEvent.click(screen.getByText("open a"));
    fireEvent.click(screen.getByText("open b"));
    await waitFor(() => expect(shown("state")).toBe("b.png:loaded:7"));

    releaseA(loaded(99));

    // b.png's answer stands; a.png's is discarded rather than applied to whatever is now open.
    await waitFor(() => expect(shown("state")).toBe("b.png:loaded:7"));
    expect(shown("open")).toBe("b.png");
  });

  it("does not apply the slow one's FAILURE to the new image either", async () => {
    // The same race with the other outcome, and the worse one: a stale failure would mark a
    // perfectly good image unsafe to save.
    let rejectA: (cause: Error) => void = () => {};
    const imageMetadata = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectA = reject; }))
      .mockImplementationOnce(async () => ({ width: 10, height: 20, sourceDepth: 8, sourceFormat: "png" }));

    mount({ imageMetadata: imageMetadata as never });

    fireEvent.click(screen.getByText("open a"));
    fireEvent.click(screen.getByText("open b"));
    await waitFor(() => expect(shown("state")).toBe("b.png:loaded:3"));

    rejectA(new Error("a.png is not an image"));

    await waitFor(() => expect(shown("error")).toBe("none"));
    expect(shown("state")).toBe("b.png:loaded:3");
  });

  it("clears the previous image immediately, so it cannot be shown under the new name", async () => {
    mount({ loadAnnotations: vi.fn()
      .mockImplementationOnce(async () => loaded(5))
      .mockImplementationOnce(() => new Promise(() => {})) as never });

    fireEvent.click(screen.getByText("open a"));
    await waitFor(() => expect(shown("state")).toBe("a.png:loaded:5"));

    fireEvent.click(screen.getByText("open b"));

    // Not "b.png:loaded:5", and not a.png's state lingering under b.png's name.
    expect(shown("state")).toBe("none");
    expect(shown("open")).toBe("b.png");
  });
});

describe("using the store outside its provider", () => {
  it("fails loudly rather than pretending nothing is open", () => {
    // A store that quietly answers "nothing is open" would make a missing provider look like an
    // empty workspace, which is a bug that survives every test that does not open an image.
    function Orphan() {
      useWorkspace();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/WorkspaceProvider/);
  });
});

describe("drawing into the open image", () => {
  async function opened() {
    mount({});
    fireEvent.click(screen.getByText("open a"));
    await waitFor(() => expect(shown("state")).toBe("a.png:loaded:3"));
  }

  it("starts from what the file held", async () => {
    await opened();
    expect(shown("segments")).toBe("3");
    expect(shown("dirty")).toBe("clean");
  });

  it("adds an annotation and marks the image unsaved", async () => {
    await opened();
    fireEvent.click(screen.getByText("draw"));

    expect(shown("segments")).toBe("4");
    expect(shown("dirty")).toBe("dirty");
    // The count the save prompt shows comes from the live segments, not from the file.
    expect(shown("state")).toBe("a.png:loaded:4");
  });

  it("records exactly one undo entry per annotation", async () => {
    // Recording inside a state updater would push two for one polygon -- React may invoke an
    // updater more than once, and StrictMode does it deliberately -- so the first undo would
    // appear to do nothing.
    await opened();
    fireEvent.click(screen.getByText("draw"));
    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("segments")).toBe("3"));
    expect(shown("canUndo")).toBe("no");
  });

  it("redoes what it undid", async () => {
    await opened();
    fireEvent.click(screen.getByText("draw"));
    fireEvent.click(screen.getByText("undo"));
    await waitFor(() => expect(shown("segments")).toBe("3"));

    fireEvent.click(screen.getByText("redo"));
    await waitFor(() => expect(shown("segments")).toBe("4"));
  });

  it("clears the history when another image opens", async () => {
    // RULE-052 scopes undo to the open image. An undo reaching into the previous image's edits
    // would apply them to annotations that are not on screen.
    await opened();
    fireEvent.click(screen.getByText("draw"));
    expect(shown("canUndo")).toBe("yes");

    fireEvent.click(screen.getByText("open b"));

    await waitFor(() => expect(shown("canUndo")).toBe("no"));
    expect(shown("dirty")).toBe("clean");
  });

  it("becomes clean again once saved, and dirty again after the next edit", async () => {
    await opened();
    fireEvent.click(screen.getByText("draw"));
    fireEvent.click(screen.getByText("saved"));
    expect(shown("dirty")).toBe("clean");

    fireEvent.click(screen.getByText("draw"));
    expect(shown("dirty")).toBe("dirty");
  });

  it("counts an undo as a change, because it also differs from the file", async () => {
    // Undoing back to the file's contents still leaves the image dirty. That is deliberate: the
    // alternative is tracking equality against the loaded annotations, and a save of identical
    // content costs nothing while a MISSED save costs the user their work.
    await opened();
    fireEvent.click(screen.getByText("draw"));
    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("segments")).toBe("3"));
    expect(shown("dirty")).toBe("dirty");
  });
});
