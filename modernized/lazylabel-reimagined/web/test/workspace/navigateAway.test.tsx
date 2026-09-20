/**
 * Opening another image while this one has unsaved work.
 *
 * Decision 7's central subject, and the app got it wrong in the direction nobody checks. Legacy
 * AUTO-SAVES on navigation, which is how it deletes every sidecar for an image whose segments
 * happen to be empty — so this app deliberately does not save. It then discarded the work instead,
 * silently, which is the same loss by the other route.
 *
 * `onNavigateAway` and `onClose` were written for exactly this, tested on their own, and called by
 * nothing. That is the eleventh of the family in this project: a rule implemented, proven, exposed
 * and never reached.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const TRIANGLE: WireSegment = {
  type: "Polygon",
  classId: 0,
  vertices: [[1, 1], [5, 1], [5, 5]],
} as unknown as WireSegment;

function datasetImage(key: string): WireDatasetImage {
  return { key, name: key.split("/").pop()!, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

function loaded(kind: "loaded" | "unreadable" = "loaded"): AnnotationsResult {
  if (kind === "unreadable") return { kind: "unreadable", reason: "the npz is truncated" } as never;
  return {
    kind: "loaded",
    annotations: {
      segments: [{}],
      classAliases: {},
      failures: [],
      rejected: 0,
      sourceFile: "a.npz",
      sourceFormat: "NPZ",
    },
  } as unknown as AnnotationsResult;
}

function Probe(): React.ReactNode {
  const { openImage, addSegment, markSaved, open } = useWorkspace();
  return (
    <>
      {["frames/a.png", "frames/b.png"].map((key) => (
        <button key={key} type="button" onClick={() => openImage(datasetImage(key))}>
          open {key}
        </button>
      ))}
      <button type="button" onClick={() => addSegment(TRIANGLE)}>draw</button>
      <button type="button" onClick={markSaved}>saved</button>
      <p data-testid="open">{open?.image.key ?? "none"}</p>
    </>
  );
}

function mount(answer: boolean, result: AnnotationsResult = loaded()) {
  const confirmNavigation = vi.fn(() => answer);
  const client = {
    imageMetadata: async () => ({ width: 10, height: 10, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async () => result,
    pixelsUrl: () => "/pixels",
  } as unknown as ApiClient;

  render(
    <WorkspaceProvider client={client} projectId="p1" confirmNavigation={confirmNavigation}>
      <Probe />
    </WorkspaceProvider>,
  );
  return { confirmNavigation };
}

const openKey = () => screen.getByTestId("open").textContent;

async function openAndDraw(answer: boolean, result?: AnnotationsResult) {
  const handles = mount(answer, result);
  fireEvent.click(screen.getByText("open frames/a.png"));
  await waitFor(() => expect(openKey()).toBe("frames/a.png"));
  fireEvent.click(screen.getByText("draw"));
  return handles;
}

describe("with unsaved work", () => {
  it("ASKS before opening another image", async () => {
    const { confirmNavigation } = await openAndDraw(true);

    fireEvent.click(screen.getByText("open frames/b.png"));

    expect(confirmNavigation).toHaveBeenCalledTimes(1);
  });

  it("names the image and how much is at risk, not 'you have unsaved changes'", async () => {
    // That sentence is true of every such prompt ever written and tells a user nothing they can
    // weigh. The count and the names do.
    const { confirmNavigation } = await openAndDraw(true);

    fireEvent.click(screen.getByText("open frames/b.png"));

    const summary = confirmNavigation.mock.calls[0]![0] as unknown as string;
    expect(summary).toContain("frames/a.png");
    expect(summary).toMatch(/2 segments/);
    expect(summary).toContain("b.png");
  });

  it("KEEPS the work when the answer is no", async () => {
    await openAndDraw(false);

    fireEvent.click(screen.getByText("open frames/b.png"));

    await waitFor(() => expect(openKey()).toBe("frames/a.png"));
  });

  it("opens when the answer is yes", async () => {
    await openAndDraw(true);

    fireEvent.click(screen.getByText("open frames/b.png"));

    await waitFor(() => expect(openKey()).toBe("frames/b.png"));
  });

  it("warns that a FAILED load cannot simply be saved", async () => {
    // Provenance is checked before dirtiness: an image whose annotations could not be read must
    // not be written back by any route, and a user answering a prompt that never mentioned the
    // risk is one of those routes.
    const { confirmNavigation } = await openAndDraw(true, loaded("unreadable"));

    fireEvent.click(screen.getByText("open frames/b.png"));

    const summary = confirmNavigation.mock.calls[0]![0] as unknown as string;
    expect(summary).toMatch(/could not be read/);
  });
});

describe("with nothing at risk", () => {
  it("does not ask when the image is untouched", async () => {
    const { confirmNavigation } = mount(true);
    fireEvent.click(screen.getByText("open frames/a.png"));
    await waitFor(() => expect(openKey()).toBe("frames/a.png"));

    fireEvent.click(screen.getByText("open frames/b.png"));

    await waitFor(() => expect(openKey()).toBe("frames/b.png"));
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("does not ask once the work has been saved", async () => {
    const { confirmNavigation } = await openAndDraw(true);
    fireEvent.click(screen.getByText("saved"));

    fireEvent.click(screen.getByText("open frames/b.png"));

    await waitFor(() => expect(openKey()).toBe("frames/b.png"));
    expect(confirmNavigation).not.toHaveBeenCalled();
  });

  it("does not ask for the first image of a session", async () => {
    const { confirmNavigation } = mount(true);

    fireEvent.click(screen.getByText("open frames/a.png"));

    await waitFor(() => expect(openKey()).toBe("frames/a.png"));
    expect(confirmNavigation).not.toHaveBeenCalled();
  });
});
