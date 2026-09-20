/**
 * Two open images at once, and the ways that could quietly damage the one you are not looking at.
 *
 * RULE-092's linked multi-view needs a second image open. Everything per-image moved into a
 * `SideState` and the store now holds two, with a pointer to the active one — so the failure this
 * file is looking for is LEAKAGE: an edit, a clear or an undo reaching the side that did not ask
 * for it. That is worse than a visible bug, because the damaged side is off screen.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import {
  WorkspaceProvider,
  useWorkspace,
  type SideIndex,
} from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

function datasetImage(key: string): WireDatasetImage {
  return { key, name: key, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

const TRIANGLE: WireSegment = {
  type: "Polygon",
  classId: 1,
  vertices: [
    [1, 1],
    [5, 1],
    [5, 5],
  ],
} as unknown as WireSegment;

/** One segment per image, so a leak between sides shows up as the wrong count. */
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

function Probe(): React.ReactNode {
  const {
    sides,
    activeSide,
    setActiveSide,
    openImageOn,
    closeSide,
    addSegment,
    setClassAlias,
    setCrop,
    markSaved,
    history,
    imageStates,
    segments,
    crop,
  } = useWorkspace();

  const openOn = (side: SideIndex, key: string) => openImageOn(side, datasetImage(key));

  return (
    <>
      <button type="button" onClick={() => openOn(0, "left.png")}>open left</button>
      <button type="button" onClick={() => openOn(1, "right.png")}>open right</button>
      <button type="button" onClick={() => openOn(1, "other.png")}>reopen right</button>
      <button type="button" onClick={() => setActiveSide(0)}>activate left</button>
      <button type="button" onClick={() => setActiveSide(1)}>activate right</button>
      <button type="button" onClick={() => closeSide(1)}>close right</button>
      <button type="button" onClick={() => addSegment(TRIANGLE)}>draw</button>
      <button type="button" onClick={() => setClassAlias(1, "car")}>name</button>
      <button type="button" onClick={() => setCrop({ x1: 0, y1: 0, x2: 4, y2: 4 })}>crop</button>
      <button type="button" onClick={markSaved}>saved</button>
      <button type="button" onClick={() => history.undo()}>undo</button>

      <p data-testid="active">{activeSide}</p>
      <p data-testid="activeSegments">{segments.length}</p>
      <p data-testid="activeCrop">{crop === null ? "none" : "set"}</p>
      <p data-testid="canUndo">{history.state.canUndo ? "yes" : "no"}</p>
      <p data-testid="undoLabel">{history.state.undoLabel ?? "none"}</p>
      {[0, 1].map((i) => (
        <p key={i} data-testid={`side${i}`}>
          {`${sides[i]!.open?.image.key ?? "none"}|${sides[i]!.segments.length}|${
            sides[i]!.dirty ? "dirty" : "clean"
          }|${Object.keys(sides[i]!.classAliases).length}|${sides[i]!.crop === null ? "-" : "crop"}`}
        </p>
      ))}
      <p data-testid="states">
        {imageStates.map((s) => (s === null ? "none" : `${s.key}:${s.segmentCount}`)).join(" ")}
      </p>
    </>
  );
}

function mount(client: Partial<ApiClient> = {}) {
  const full = {
    imageMetadata: async () => ({ width: 10, height: 20, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async () => loaded(2),
    pixelsUrl: () => "/pixels",
    ...client,
  } as unknown as ApiClient;

  render(
    <WorkspaceProvider client={full} projectId="p1">
      <Probe />
    </WorkspaceProvider>,
  );
}

const shown = (id: string) => screen.getByTestId(id).textContent;

/** Both sides open and settled, left active. */
async function bothOpen(): Promise<void> {
  mount();
  fireEvent.click(screen.getByText("open left"));
  fireEvent.click(screen.getByText("open right"));
  await waitFor(() => {
    expect(shown("side0")).toContain("left.png");
    expect(shown("side1")).toContain("right.png");
  });
}

describe("two open images", () => {
  it("opens into a named side without disturbing the other", async () => {
    await bothOpen();

    expect(shown("side0")).toBe("left.png|2|clean|0|-");
    expect(shown("side1")).toBe("right.png|2|clean|0|-");
  });

  it("does NOT change which side is active", async () => {
    // Opening into the other pane is not a decision about where the next stroke goes. Legacy has
    // no equivalent, so there is nothing to port -- and moving the user's hand for them is the
    // sort of helpfulness that draws a polygon into the wrong image.
    await bothOpen();

    expect(shown("active")).toBe("0");
  });

  it("routes an edit to the active side only", async () => {
    await bothOpen();
    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(shown("side0")).toBe("left.png|3|dirty|0|-"));
    expect(shown("side1")).toBe("right.png|2|clean|0|-");
  });

  it("routes a class name, a crop and a save to the active side only", async () => {
    await bothOpen();
    fireEvent.click(screen.getByText("activate right"));
    fireEvent.click(screen.getByText("name"));
    fireEvent.click(screen.getByText("crop"));

    await waitFor(() => expect(shown("side1")).toBe("right.png|2|dirty|1|crop"));
    expect(shown("side0")).toBe("left.png|2|clean|0|-");

    fireEvent.click(screen.getByText("saved"));
    await waitFor(() => expect(shown("side1")).toContain("clean"));
  });

  it("shows the active side's values flat, as the single-image components read them", async () => {
    await bothOpen();
    fireEvent.click(screen.getByText("activate right"));
    fireEvent.click(screen.getByText("crop"));
    await waitFor(() => expect(shown("activeCrop")).toBe("set"));

    fireEvent.click(screen.getByText("activate left"));

    await waitFor(() => expect(shown("activeCrop")).toBe("none"));
    expect(shown("activeSegments")).toBe("2");
  });

  it("reports both sides' save state, so nothing unsaved can hide off screen", async () => {
    await bothOpen();
    fireEvent.click(screen.getByText("activate right"));
    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(shown("states")).toBe("left.png:2 right.png:3"));
  });
});

describe("undo across two sides", () => {
  it("undoes an edit on the side it was made on, not the side now active", async () => {
    // The whole reason the side is captured when the entry is recorded. Reading it back at undo
    // time would move the user's shape from one image to the other, and the image it landed in
    // would be the one they were not looking at.
    // Drawn on the RIGHT, undone while the LEFT is active — so a side read at undo time rather
    // than captured at record time shows up as the shape coming off the wrong image.
    await bothOpen();
    fireEvent.click(screen.getByText("activate right"));
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(shown("side1")).toContain("|3|"));

    fireEvent.click(screen.getByText("activate left"));
    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("side1")).toBe("right.png|2|dirty|0|-"));
    expect(shown("side0")).toBe("left.png|2|clean|0|-");
  });

  it("keeps one side's history when the OTHER side opens a new image", async () => {
    // RULE-052 clears history when an image loads. With two open images an unscoped clear says far
    // too much: it would throw away everything drawn in the pane nobody touched.
    await bothOpen();
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(shown("canUndo")).toBe("yes"));

    fireEvent.click(screen.getByText("reopen right"));
    await waitFor(() => expect(shown("side1")).toContain("other.png"));

    expect(shown("canUndo")).toBe("yes");
    expect(shown("undoLabel")).toBe("Add annotation");
  });

  it("forgets a side's edits when THAT side opens a new image", async () => {
    await bothOpen();
    fireEvent.click(screen.getByText("activate right"));
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(shown("canUndo")).toBe("yes"));

    fireEvent.click(screen.getByText("reopen right"));

    await waitFor(() => expect(shown("canUndo")).toBe("no"));
  });
});

describe("closing a side", () => {
  it("empties it and forgets its edits, leaving the other side alone", async () => {
    await bothOpen();
    fireEvent.click(screen.getByText("activate right"));
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(shown("side1")).toContain("|3|"));

    fireEvent.click(screen.getByText("close right"));

    await waitFor(() => expect(shown("side1")).toBe("none|0|clean|0|-"));
    expect(shown("side0")).toBe("left.png|2|clean|0|-");
    expect(shown("canUndo")).toBe("no");
  });

  it("stops reporting a save state for it", async () => {
    // A side still claiming unsaved work that nothing displays is decision 7's silent loss by
    // another route: a prompt about an image the user cannot see and cannot save.
    await bothOpen();
    fireEvent.click(screen.getByText("close right"));

    await waitFor(() => expect(shown("states")).toBe("left.png:2 none"));
  });
});
