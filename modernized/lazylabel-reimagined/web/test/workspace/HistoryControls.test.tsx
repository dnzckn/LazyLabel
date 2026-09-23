/**
 * Undo and redo, reachable.
 *
 * `history.test.ts` proves the stack. This proves a person can get to it — which until now they
 * could not: the History had existed since Phase 4, with RULE-052's and RULE-053's defects
 * designed out and a full suite over it, and nothing in the app called `undo()`. A user could
 * draw, erase and merge and had no way to take any of it back.
 *
 * Third time this session that shape has appeared, after the vertex editor and the adjustment
 * sliders. A component test proves the component and nothing else.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { HistoryControls } from "../../src/workspace/HistoryControls.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE: WireDatasetImage = {
  key: "a.png",
  name: "a.png",
  sidecars: {},
  annotated: false,
  sharesSidecarsWith: [],
};

function Probe(): React.ReactNode {
  const { openImage, addSegment, segments } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE)}>open</button>
      <button
        type="button"
        onClick={() =>
          addSegment(
            { type: "Polygon", classId: 0, vertices: [[1, 1], [5, 1], [5, 5]] },
            "Add polygon",
          )
        }
      >
        draw
      </button>
      <p data-testid="count">{segments.length}</p>
    </>
  );
}

function show() {
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (s: unknown) => s,
    imageMetadata: async () => ({ width: 10, height: 10, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
    loadAnnotations: async () => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  render(
    <SettingsProvider client={client}>
      {/* The real default bindings, so the hotkey tests assert what a user actually gets rather
          than a pair invented here. */}
      <HotkeyProvider bindings={defaultSettings().hotkeys}>
        <WorkspaceProvider client={client} projectId="p">
          <Probe />
          <HistoryControls />
        </WorkspaceProvider>
      </HotkeyProvider>
    </SettingsProvider>,
  );
}

const count = () => screen.getByTestId("count").textContent;
const undoButton = () => screen.getByRole("button", { name: /^Undo/ }) as HTMLButtonElement;
const redoButton = () => screen.getByRole("button", { name: /^Redo/ }) as HTMLButtonElement;

async function ready() {
  show();
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(undoButton()).toBeTruthy());
}

describe("with nothing done yet", () => {
  it("offers undo and redo, both disabled", async () => {
    // Present rather than hidden: a control that appears once it becomes usable is one a user has
    // to discover twice.
    await ready();

    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(true);
  });

  it("says there is nothing to undo, rather than nothing at all", async () => {
    await ready();

    expect(undoButton().getAttribute("title")).toBe("Nothing to undo");
  });
});

describe("after an edit", () => {
  it("undoes it", async () => {
    await ready();
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(count()).toBe("1"));

    fireEvent.click(undoButton());

    await waitFor(() => expect(count()).toBe("0"));
  });

  it("NAMES what would be undone, which no keystroke can", async () => {
    // "Undo: Add polygon", not "Undo". After a run of edits that is the difference between
    // confidence and a guess.
    await ready();
    fireEvent.click(screen.getByText("draw"));

    await waitFor(() => expect(undoButton().textContent).toBe("Undo: Add polygon"));
  });

  it("redoes it again", async () => {
    await ready();
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(count()).toBe("1"));
    fireEvent.click(undoButton());
    await waitFor(() => expect(count()).toBe("0"));

    fireEvent.click(redoButton());

    await waitFor(() => expect(count()).toBe("1"));
  });

  it("keeps the buttons in step with the stack after an undo", async () => {
    // The History is a plain object that notifies nobody; this component re-renders because the
    // STORE changes, and every recorded action moves the store. If that ever stopped being true
    // the buttons would go stale, which is what this pins.
    await ready();
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(undoButton().disabled).toBe(false));

    fireEvent.click(undoButton());

    await waitFor(() => expect(undoButton().disabled).toBe(true));
    expect(redoButton().disabled).toBe(false);
  });
});

describe("the hotkey", () => {
  it("undoes on the user's own binding", async () => {
    // Ctrl+Z by default, from the settings schema -- so a rebound key follows without this
    // component knowing anything about it.
    await ready();
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(count()).toBe("1"));

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    await waitFor(() => expect(count()).toBe("0"));
  });

  it("redoes on Ctrl+Y", async () => {
    await ready();
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(count()).toBe("1"));
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    await waitFor(() => expect(count()).toBe("0"));

    fireEvent.keyDown(document, { key: "y", ctrlKey: true });

    await waitFor(() => expect(count()).toBe("1"));
  });
});
