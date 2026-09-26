/**
 * Legacy's Mode Controls card: radios drawn as its mode buttons, each labelled with its key.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";
import type { WireSegment } from "@lazylabel/contracts";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { ModeControls } from "../../src/shell/ModeControls.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

function Tool(): React.ReactNode {
  const { activeTool } = useWorkspace();
  return <p data-testid="tool">{activeTool}</p>;
}

/** Put an annotation on the image and select everything, as the segment table would. */
function Seed(): React.ReactNode {
  const { addSegment, segments, setSelection } = useWorkspace();
  const polygon: WireSegment = { type: "Polygon", classId: 0, vertices: [[1, 1], [9, 1], [9, 9]] };
  const mask: WireSegment = { type: "AI", classId: 1 };
  return (
    <>
      <button type="button" onClick={() => addSegment(polygon)}>add polygon</button>
      <button type="button" onClick={() => addSegment(mask)}>add mask</button>
      <button type="button" onClick={() => setSelection(segments.map((_, index) => index))}>select all</button>
    </>
  );
}

function mount(bindings = defaultSettings().hotkeys) {
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
  } as unknown as ApiClient;
  render(
    <NotificationProvider>
      <NotificationHost />
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={bindings}>
          <WorkspaceProvider client={{} as ApiClient} projectId="default">
            <ModeControls onHotkeys={() => undefined} />
            <Tool />
            <Seed />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

describe("the Mode Controls card", () => {
  it("offers legacy's six modes in legacy's order, with their keys", () => {
    mount();

    const labels = screen
      .getAllByRole("radio")
      .map((radio) => radio.closest("label")?.textContent);
    expect(labels).toEqual([
      "AI (1)",
      "Poly (2)",
      "Box (3)",
      "Circle (4)",
      "Select (E)",
      "Edit (R)",
      "Pan (Q)",
    ]);
  });

  it("shows the key the user bound, not legacy's default", () => {
    const bindings = defaultSettings().hotkeys;
    mount({ ...bindings, polygon_mode: { ...bindings["polygon_mode"]!, primary: "P" } });

    expect(screen.getByRole("radio", { name: "Poly (P)" })).toBeTruthy();
  });

  it("starts on Edit, which is no drawing tool, so a first click never draws", () => {
    mount();

    expect((screen.getByRole("radio", { name: "Edit (R)" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("tool").textContent).toBe("none");
  });

  it("chooses a mode when its button is clicked, and marks it on", () => {
    mount();

    fireEvent.click(screen.getByRole("radio", { name: "Box (3)" }));

    expect(screen.getByTestId("tool").textContent).toBe("box");
    expect(screen.getByRole("radio", { name: "Box (3)" }).closest("label")?.className).toContain(
      "mode-button--on",
    );
  });

  it("goes to Edit, which is no drawing tool, with a polygon selected", () => {
    mount();
    fireEvent.click(screen.getByText("add polygon"));
    fireEvent.click(screen.getByText("select all"));
    fireEvent.click(screen.getByRole("radio", { name: "Poly (2)" }));

    fireEvent.click(screen.getByRole("radio", { name: "Edit (R)" }));

    expect(screen.getByTestId("tool").textContent).toBe("none");
  });
});

describe("Edit with nothing it can edit (CP-16, RULE-046)", () => {
  it("refuses in legacy's words and STAYS on the tool it had, as legacy stays in its mode", async () => {
    // mode_manager.py:84-109 returns before any mode change. This app cleared the tool anyway, so
    // R on a mask took the user out of the mode they were working in.
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Poly (2)" }));

    fireEvent.click(screen.getByRole("radio", { name: "Edit (R)" }));

    expect(await screen.findByText("No editable shapes selected!")).toBeTruthy();
    expect(screen.getByTestId("tool").textContent).toBe("polygon");
    expect((screen.getByRole("radio", { name: "Poly (2)" }) as HTMLInputElement).checked).toBe(true);
  });

  it("refuses the same way from the R key, with only a mask selected", async () => {
    mount();
    fireEvent.click(screen.getByText("add mask"));
    fireEvent.click(screen.getByText("select all"));
    fireEvent.click(screen.getByRole("radio", { name: "Box (3)" }));

    fireEvent.keyDown(document, { key: "R" });

    expect(await screen.findByText("No editable shapes selected!")).toBeTruthy();
    expect(screen.getByTestId("tool").textContent).toBe("box");
  });
});

describe("X, legacy's toggle recent class (RULE-086)", () => {
  it("says there is nothing to toggle on an image with no classes, in legacy's words", async () => {
    mount();

    fireEvent.keyDown(document, { key: "x", code: "KeyX" });

    expect(await screen.findByText("No classes available to toggle")).toBeTruthy();
  });
});
