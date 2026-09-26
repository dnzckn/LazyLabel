/**
 * The annotation list, and the two destructive buttons under it.
 *
 * What this pins beyond "the list renders": that merge moves the selection to the class RULE-019
 * names -- the lowest selected one -- and that the panel reads as legacy's does: its filter items,
 * its "N/A", and its "Merge to Class" and "Delete" with their tooltips (right_panel.py:126-168).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { SegmentTable } from "../../src/workspace/SegmentTable.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";
import { defaultSettings } from "@lazylabel/settings-schema";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";

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
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  // `useHotkey` throws without a provider by design -- a hook that quietly works without one
  // hides a missing wire, which is this project's longest-running defect family. The table's
  // selection keys live in the component under test, so this supplies it, and the notices its keys
  // give in the Multi tab need theirs.
  render(
    <NotificationProvider>
      <HotkeyProvider bindings={defaultSettings().hotkeys}>
        <WorkspaceProvider client={api} projectId="p1">
          <Probe />
          <SegmentTable />
        </WorkspaceProvider>
      </HotkeyProvider>
    </NotificationProvider>,
  );

  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.getByTestId("count").textContent).toBe(String(segments.length)));
}

const shown = (id: string) => screen.getByTestId(id).textContent;
const row = (index: number) => screen.getByRole("checkbox", { name: new RegExp(`\\b${index + 1},`) });

describe("the list", () => {
  it("shows the table empty when there is nothing on the image, as legacy's is", async () => {
    await mount([]);
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Merge to Class" }) as HTMLButtonElement).disabled).toBe(true);
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

  it("names an unclassified annotation N/A in both columns, as legacy does", async () => {
    // segment_table_manager.py:125-128.
    await mount([polygon(null)]);
    const cells = [...screen.getByRole("table").querySelectorAll("tbody tr th, tbody tr td")].map(
      (cell) => cell.textContent,
    );
    expect(cells.slice(2, 4)).toEqual(["N/A", "N/A"]);
  });

  it("lists the filter's classes as legacy's \"alias: id\"", async () => {
    // segment_table_manager.py:377-384, where a class with no alias is its own id.
    await mount([polygon(2), polygon(null)]);
    const options = [...(screen.getByLabelText("Filter Class:") as HTMLSelectElement).options].map(
      (option) => option.textContent,
    );
    expect(options).toEqual(["All Classes", "N/A", "2: 2"]);
    expect(screen.getByLabelText("Filter Class:").title).toBe("Filter segments list by class");
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

  it("is legacy's Merge to Class, with legacy's tooltip and the key the user bound", async () => {
    // right_panel.py:158-161. It named its target, "Merge into class 2", until 2026-09-26.
    await mount([polygon(5), polygon(2)]);

    fireEvent.click(row(0));
    fireEvent.click(row(1));

    const button = await screen.findByRole("button", { name: "Merge to Class" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(button.title).toBe("Merge selected segments into a single class (M)");
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
  it("is legacy's Delete, its tooltip naming both keys, and the count is on the status line", async () => {
    // right_panel.py:162-165. It read "Delete 2" until 2026-09-26.
    await mount([polygon(0), polygon(1), polygon(2)]);

    fireEvent.click(row(0));
    fireEvent.click(row(2));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 of 3 selected"));
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.title).toBe("Delete selected segments (V/Backspace)");
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

/* Legacy's table: Segment ID, Class ID and Alias, each row in its class's colour, a class filter
   above it, and a click on a row selecting it. */
describe("as legacy's table", () => {
  const rowsShown = () =>
    [...screen.getByRole("table").querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td, th")].slice(1, 3).map((cell) => cell.textContent).join(":"),
    );

  it("numbers the segments from 1 and gives each its class", async () => {
    await mount([polygon(2), polygon(5)]);

    expect(rowsShown()).toEqual(["1:2", "2:5"]);
  });

  it("shows only the class the filter names, and every class again on All Classes", async () => {
    await mount([polygon(2), polygon(5), polygon(2)]);

    fireEvent.change(screen.getByLabelText("Filter Class:"), { target: { value: "2" } });
    // The ids stay the ones in the whole list: actions take positions in it.
    expect(rowsShown()).toEqual(["1:2", "3:2"]);

    fireEvent.change(screen.getByLabelText("Filter Class:"), { target: { value: "all" } });
    expect(rowsShown()).toEqual(["1:2", "2:5", "3:2"]);
  });

  const clickRow = (position: number, init: MouseEventInit = {}) =>
    fireEvent.click(
      screen.getByRole("table").querySelectorAll("tbody tr")[position]!.querySelector("td:nth-child(2)")!,
      init,
    );
  const checked = () =>
    [...screen.getByRole("table").querySelectorAll<HTMLInputElement>("tbody input")].map((box) => box.checked);

  it("selects a row when it is clicked, as legacy's does", async () => {
    await mount([polygon(2), polygon(5)]);

    clickRow(1);

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1 of 2 selected"));
    expect((row(1) as HTMLInputElement).checked).toBe(true);
  });

  it("REPLACES the selection on a plain click, as a table does, rather than adding to it", async () => {
    // It toggled on every click while saying "as in legacy"; legacy's is Qt's extended selection.
    await mount([polygon(2), polygon(5), polygon(7)]);

    clickRow(0);
    clickRow(2);
    await waitFor(() => expect(checked()).toEqual([false, false, true]));

    clickRow(2);
    expect(checked()).toEqual([false, false, true]);
  });

  it("adds and removes a row with Ctrl or Cmd held", async () => {
    await mount([polygon(2), polygon(5), polygon(7)]);

    clickRow(0);
    clickRow(2, { ctrlKey: true });
    await waitFor(() => expect(checked()).toEqual([true, false, true]));

    clickRow(0, { metaKey: true });
    await waitFor(() => expect(checked()).toEqual([false, false, true]));
  });

  it("selects the run of shown rows with Shift held", async () => {
    await mount([polygon(2), polygon(5), polygon(7), polygon(9)]);

    clickRow(1);
    clickRow(3, { shiftKey: true });

    await waitFor(() => expect(checked()).toEqual([false, true, true, true]));
  });

  it("paints each row in its class's colour", async () => {
    await mount([polygon(0)]);

    const painted = (screen.getByRole("table").querySelector("tbody tr") as HTMLElement).style
      .backgroundColor;
    // Class 0 is legacy's HSV(0, 220, 220).
    expect(painted).toBe("rgb(220, 30, 30)");
  });
});

describe("the filter and the selection", () => {
  const filterTo = (value: string) => fireEvent.change(screen.getByLabelText("Filter Class:"), { target: { value } });
  const press = (code: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(document, { code, key: code.replace(/^Key/, "").toLowerCase(), ...init });

  it("selects only the rows the filter shows on Select All, as legacy's selectAll does", async () => {
    await mount([polygon(2), polygon(5), polygon(2)]);
    filterTo("2");

    press("KeyA", { ctrlKey: true });

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 of 3 selected"));
  });

  it("never deletes a class the filter hides: Ctrl+A then V leaves it alone", async () => {
    // Ctrl+A selected every annotation whatever the filter showed, so the delete that followed
    // removed classes the user could not see.
    await mount([polygon(2), polygon(5), polygon(2)]);
    filterTo("2");

    press("KeyA", { ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 of 3 selected"));
    press("KeyV");

    await waitFor(() => expect(shown("classes")).toBe("5"));
  });

  it("drops the rows a new filter hides from the selection, as legacy's refilter does", async () => {
    await mount([polygon(2), polygon(5), polygon(2)]);
    fireEvent.click(row(1)); // class 5, selected by its checkbox
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1 of 3 selected"));

    filterTo("2");

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("3 annotations"));
  });
});
