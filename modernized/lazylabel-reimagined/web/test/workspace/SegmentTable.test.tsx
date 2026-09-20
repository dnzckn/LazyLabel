/**
 * The annotation list, and the two destructive buttons under it.
 *
 * What this pins beyond "the list renders": that a destructive action says what it will do BEFORE
 * doing it, and that merge names the class it targets — which is the one legacy gets wrong, since
 * its tooltip claims the active class and its code uses the lowest selected one (RULE-019).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { SegmentTable } from "../../src/workspace/SegmentTable.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE_ROW: WireDatasetImage = {
  key: "a.png",
  name: "a.png",
  sidecars: {},
  annotated: true,
  sharesSidecarsWith: [],
};

const polygon = (classId: number | null, type: WireSegment["type"] = "Polygon"): WireSegment => ({
  type,
  classId,
  vertices: [[0, 0], [1, 0], [1, 1]],
});

/** Reports the store's list so assertions can read it after an action. */
function Probe(): React.ReactNode {
  const { segments, openImage, history } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE_ROW)}>open</button>
      <button type="button" onClick={() => history.undo()}>undo</button>
      <p data-testid="classes">{segments.map((s) => s.classId).join(",")}</p>
      <p data-testid="count">{segments.length}</p>
    </>
  );
}

async function mount(segments: readonly WireSegment[]) {
  const api = {
    imageMetadata: async () => ({ width: 10, height: 10, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> => ({
      kind: "loaded",
      annotations: {
        segments,
        classAliases: {},
        failures: [],
        rejected: 0,
        sourceFile: "a.npz",
        sourceFormat: "NPZ",
      },
    } as unknown as AnnotationsResult),
    pixelsUrl: () => "/pixels",
  } as unknown as ApiClient;

  render(
    <WorkspaceProvider client={api} projectId="p1">
      <Probe />
      <SegmentTable />
    </WorkspaceProvider>,
  );

  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.getByTestId("count").textContent).toBe(String(segments.length)));
}

const shown = (id: string) => screen.getByTestId(id).textContent;
const row = (index: number) => screen.getByRole("checkbox", { name: new RegExp(`\\b${index + 1},`) });

describe("the list", () => {
  it("says so when there is nothing on the image", async () => {
    await mount([]);
    expect(screen.getByText(/No annotations on this image yet/)).toBeTruthy();
  });

  it("shows each annotation's TYPE, not only its class", async () => {
    // Whether an annotation is a polygon or a mask decides what can be done with it: a Loaded or
    // AI segment cannot be vertex-edited, and an erase silently turns a polygon into a mask.
    // Without the type on screen, "why can I not edit this one" has no answer.
    await mount([polygon(0), polygon(1, "AI"), polygon(2, "Loaded")]);

    const table = screen.getByRole("table");
    expect(table.textContent).toContain("Polygon");
    expect(table.textContent).toContain("AI");
    expect(table.textContent).toContain("Loaded");
  });

  it("names an unclassified annotation rather than showing a blank", async () => {
    await mount([polygon(null)]);
    expect(screen.getByRole("table").textContent).toContain("unclassified");
  });

  it("counts them, and counts the selection once there is one", async () => {
    await mount([polygon(0), polygon(1)]);
    expect(screen.getByRole("status").textContent).toBe("2 annotations");

    fireEvent.click(row(0));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1 of 2 selected"));
  });
});

describe("merging", () => {
  it("is unavailable until at least two are selected", async () => {
    await mount([polygon(5), polygon(2)]);

    const button = () => screen.getByRole("button", { name: /Merge/ });
    expect((button() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(row(0));
    await waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(true));

    fireEvent.click(row(1));
    await waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(false));
  });

  it("NAMES the class it will merge into, before doing it", async () => {
    // The one legacy gets wrong: its tooltip claims the active class and its code uses the lowest
    // selected one. A button that says only "Merge" leaves the user to find out by looking at the
    // result.
    await mount([polygon(5), polygon(2)]);

    fireEvent.click(row(0));
    fireEvent.click(row(1));

    await waitFor(() => expect(screen.getByRole("button", { name: /Merge into class 2/ })).toBeTruthy());
  });

  it("moves the selected annotations to that class", async () => {
    await mount([polygon(5), polygon(2), polygon(9)]);

    fireEvent.click(row(0));
    fireEvent.click(row(1));
    fireEvent.click(screen.getByRole("button", { name: /Merge/ }));

    await waitFor(() => expect(shown("classes")).toBe("2,2,9"));
  });

  it("can be undone in one step", async () => {
    await mount([polygon(5), polygon(2)]);

    fireEvent.click(row(0));
    fireEvent.click(row(1));
    fireEvent.click(screen.getByRole("button", { name: /Merge/ }));
    await waitFor(() => expect(shown("classes")).toBe("2,2"));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("classes")).toBe("5,2"));
  });
});

describe("deleting", () => {
  it("says how many it will remove", async () => {
    await mount([polygon(0), polygon(1), polygon(2)]);

    fireEvent.click(row(0));
    fireEvent.click(row(2));

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy());
  });

  it("removes exactly those, leaving the rest", async () => {
    await mount([polygon(0), polygon(1), polygon(2)]);

    fireEvent.click(row(0));
    fireEvent.click(row(2));
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));

    await waitFor(() => expect(shown("classes")).toBe("1"));
  });

  it("can be undone", async () => {
    await mount([polygon(0), polygon(1)]);

    fireEvent.click(row(0));
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    await waitFor(() => expect(shown("classes")).toBe("1"));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("classes")).toBe("0,1"));
  });

  it("is unavailable with nothing selected", async () => {
    await mount([polygon(0)]);
    expect((screen.getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the selection after an action", () => {
  it("is cleared, so a stale position cannot reach the next one", async () => {
    // Merge keeps positions, erase does not, and delete shifts them. One rule that is always safe
    // beats three that each have to be right.
    await mount([polygon(0), polygon(1)]);

    fireEvent.click(row(0));
    fireEvent.click(row(1));
    fireEvent.click(screen.getByRole("button", { name: /Merge/ }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 annotations"));
  });
});
