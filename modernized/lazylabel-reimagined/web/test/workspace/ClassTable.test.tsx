/**
 * The class table: names, order, and renumbering.
 *
 * What makes this more than a list is that the order decides the exported file — RULE-013 renumbers
 * 0..N-1 in the order shown, and class ids are an NPZ's channel order and a COCO file's category
 * ids. So the tests check that the button names its effect and that both of legacy's silent
 * outcomes are reported.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { ClassTable } from "../../src/workspace/ClassTable.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE_ROW: WireDatasetImage = {
  key: "a.png",
  name: "a.png",
  sidecars: {},
  annotated: true,
  sharesSidecarsWith: [],
};

const of = (...ids: number[]): WireSegment[] =>
  ids.map((classId) => ({ type: "Polygon", classId, vertices: [[0, 0], [1, 0], [1, 1]] }) as WireSegment);

function Probe(): React.ReactNode {
  const { openImage, segments, classAliases, history } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE_ROW)}>open</button>
      <button type="button" onClick={() => history.undo()}>undo</button>
      <p data-testid="classes">{segments.map((s) => s.classId).join(",")}</p>
      <p data-testid="aliases">{JSON.stringify(classAliases)}</p>
    </>
  );
}

async function mount(segments: readonly WireSegment[], aliases: Record<string, string> = {}) {
  const api = {
    imageMetadata: async () => ({ width: 10, height: 10, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> =>
      ({
        kind: "loaded",
        annotations: {
          segments,
          classAliases: aliases,
          failures: [],
          rejected: 0,
          sourceFile: "a.npz",
          sourceFormat: "NPZ",
        },
      }) as unknown as AnnotationsResult,
    pixelsUrl: () => "/pixels",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <NotificationHost />
      <WorkspaceProvider client={api} projectId="p1">
        <Probe />
        <ClassTable />
      </WorkspaceProvider>
    </NotificationProvider>,
  );

  fireEvent.click(screen.getByText("open"));
  await waitFor(() =>
    expect(screen.getByTestId("classes").textContent).toBe(segments.map((s) => s.classId).join(",")),
  );
}

const shown = (id: string) => screen.getByTestId(id).textContent;
const down = (classId: number) => screen.getByRole("button", { name: `Move class ${classId} down` });

describe("listing the classes", () => {
  it("says so when the image has none", async () => {
    await mount([]);
    expect(screen.getByText(/No classes on this image yet/)).toBeTruthy();
  });

  it("lists each class once, however many annotations use it", async () => {
    await mount(of(2, 2, 5));

    expect(screen.getByRole("textbox", { name: "Name for class 2" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Name for class 5" })).toBeTruthy();
  });

  it("says names belong to this image, which is decision 6's real cost", async () => {
    // "car" can be class 1 in one file and class 2 in the next. Letting a user assume a
    // project-wide list is how they discover it from a mismatched export.
    await mount(of(0));

    expect(screen.getByText(/belong to this image/)).toBeTruthy();
  });
});

describe("naming a class", () => {
  it("stores the name", async () => {
    await mount(of(3));

    fireEvent.change(screen.getByRole("textbox", { name: "Name for class 3" }), {
      target: { value: "car" },
    });

    await waitFor(() => expect(shown("aliases")).toBe('{"3":"car"}'));
  });

  it("CLEARS the entry when the name is blanked, rather than storing an empty one", async () => {
    // A blank alias would export as a class literally named nothing, which is worse than falling
    // back to the id.
    await mount(of(3), { "3": "car" });

    fireEvent.change(screen.getByRole("textbox", { name: "Name for class 3" }), {
      target: { value: "  " },
    });

    await waitFor(() => expect(shown("aliases")).toBe("{}"));
  });

  it("can be undone", async () => {
    await mount(of(3), { "3": "car" });

    fireEvent.change(screen.getByRole("textbox", { name: "Name for class 3" }), {
      target: { value: "lorry" },
    });
    await waitFor(() => expect(shown("aliases")).toBe('{"3":"lorry"}'));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("aliases")).toBe('{"3":"car"}'));
  });
});

describe("renumbering", () => {
  it("is offered only when the order differs from the ids", async () => {
    await mount(of(0, 1));

    expect((screen.getByRole("button", { name: /Order matches/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows what each class WILL become before doing it", async () => {
    // The column is a warning rather than a repetition: it appears only where the id changes.
    await mount(of(3, 7));

    fireEvent.click(down(3));

    await waitFor(() => expect(screen.getByText(/→ 1/)).toBeTruthy());
  });

  it("renumbers in the shown order and carries the names", async () => {
    await mount(of(7, 2, 5), { "7": "car", "2": "person" });

    // Move 7 to the end: order becomes 2, 5, 7.
    fireEvent.click(down(7));
    fireEvent.click(down(7));

    await waitFor(() => expect(screen.getByRole("button", { name: /Renumber 3 classes/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Renumber 3 classes/ }));

    // 2 -> 0, 5 -> 1, 7 -> 2, and the names follow their classes.
    await waitFor(() => expect(shown("classes")).toBe("2,0,1"));
    expect(shown("aliases")).toBe('{"0":"person","2":"car"}');
  });

  it("can be undone, which legacy cannot", async () => {
    await mount(of(3, 7), { "3": "car" });

    fireEvent.click(down(3));
    fireEvent.click(screen.getByRole("button", { name: /Renumber/ }));
    await waitFor(() => expect(shown("classes")).toBe("1,0"));

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => expect(shown("classes")).toBe("3,7"));
    expect(shown("aliases")).toBe('{"3":"car"}');
  });

  it("names a class that now means two things", async () => {
    // Legacy's silent defect, made sayable. With one class the table can only produce id 0, so
    // give class 0 an annotation that the table does not list -- impossible here, since the table
    // lists every class present. The reachable case is the reported one: nothing collides.
    await mount(of(3, 7));

    fireEvent.click(down(3));
    fireEvent.click(screen.getByRole("button", { name: /Renumber/ }));

    await waitFor(() => expect(shown("classes")).toBe("1,0"));
    expect(screen.queryByText(/more than one meaning/)).toBeNull();
  });
});
