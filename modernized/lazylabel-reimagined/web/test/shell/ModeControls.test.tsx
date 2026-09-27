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
  const { addSegment, segments, setSelection, clearSelection } = useWorkspace();
  const polygon: WireSegment = { type: "Polygon", classId: 0, vertices: [[1, 1], [9, 1], [9, 9]] };
  const mask: WireSegment = { type: "AI", classId: 1 };
  return (
    <>
      <button type="button" onClick={() => addSegment(polygon)}>add polygon</button>
      <button type="button" onClick={() => addSegment(mask)}>add mask</button>
      <button type="button" onClick={() => setSelection(segments.map((_, index) => index))}>select all</button>
      <button type="button" onClick={clearSelection}>select none</button>
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
    expect(screen.getByRole("radio", { name: "Poly (P)" }).closest("label")?.title).toBe(
      "Switch to Polygon Drawing Mode (P)",
    );
  });

  it("carries legacy's tooltips, key included, and prints no hint under the card", () => {
    // control_panel.py:254-317, 327-331; the owner, 2026-09-26, on explanations under controls.
    mount();

    const tooltips = screen.getAllByRole("radio").map((radio) => radio.closest("label")?.title);
    expect(tooltips).toEqual([
      "Switch to AI Mode for AI segmentation (1)",
      "Switch to Polygon Drawing Mode (2)",
      "Switch to Bounding Box Drawing Mode (3)",
      "Switch to Circle Drawing Mode (4)",
      "Toggle segment selection (E)",
      "Edit segments and polygons (R)",
      "Pan Mode (Q)",
    ]);
    expect(screen.getByRole("button", { name: "Show hotkeys" }).title).toBe("Configure keyboard shortcuts");
    expect(document.querySelector(".mode-card p")).toBeNull();
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

    // Legacy's error notice, prefixed, red and 8 s (mode_manager.py:85, 96, 108 call
    // `_show_error_notification`; status_bar.py:173-184). It was an ordinary 3 s message until
    // 2026-09-27, found in a real browser.
    const said = await screen.findByText("Error: No editable shapes selected!");
    expect(said.getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("tool").textContent).toBe("polygon");
    expect((screen.getByRole("radio", { name: "Poly (2)" }) as HTMLInputElement).checked).toBe(true);
  });

  it("refuses the same way from the R key, with only a mask selected", async () => {
    mount();
    fireEvent.click(screen.getByText("add mask"));
    fireEvent.click(screen.getByText("select all"));
    fireEvent.click(screen.getByRole("radio", { name: "Box (3)" }));

    fireEvent.keyDown(document, { key: "R" });

    expect(await screen.findByText("Error: No editable shapes selected!")).toBeTruthy();
    expect(screen.getByTestId("tool").textContent).toBe("box");
  });
});

describe("Select, Edit and Pan pressed again go back, as legacy's toggles do (RULE-070)", () => {
  /*
   * The owner's decision of 2026-09-26, "E/R toggle back", reversing the recorded one that set the
   * mode every time. Legacy's E, Q and R are toggles and 1-4 are not (main_window.py:995-1001;
   * mode_manager.py:43-53, 171-184), and so are its Select and Edit buttons (main_window.py:862-863).
   */
  const tool = () => screen.getByTestId("tool").textContent;
  const press = (key: string) => fireEvent.keyDown(document, { key });

  /** A polygon on the image, selected, so Edit (R) is allowed. */
  function polygonSelected(): void {
    fireEvent.click(screen.getByText("add polygon"));
    fireEvent.click(screen.getByText("select all"));
  }

  it("goes E R R E as the card says: Selection, Edit, Selection, then Edit without asking", async () => {
    // RULE-070's example. Legacy's previous mode is whatever was just left: the view model's setter
    // records it on every change, over ModeManager's wish to skip Selection and Edit
    // (single_view_viewmodel.py:127-142; mode_manager.py:123-124, 182-183). So the second R goes
    // back to Selection, not AI, and the last E goes back to Edit -- with nothing selected, because
    // only R asks for an editable shape. 1 is the way back to AI.
    mount();
    polygonSelected();
    press("1");
    expect(tool()).toBe("ai");

    press("E");
    expect(tool()).toBe("select");
    press("R");
    expect(tool()).toBe("none");
    press("R");
    expect(tool()).toBe("select");
    fireEvent.click(screen.getByText("select none"));
    press("E");

    expect(tool()).toBe("none");
    expect(screen.queryByText(/No editable shapes selected/)).toBeNull();
    press("1");
    expect(tool()).toBe("ai");
  });

  it("goes back from Edit to the drawing mode on R, with a polygon selected", () => {
    mount();
    polygonSelected();
    press("2");

    press("R");
    expect(tool()).toBe("none");
    press("R");

    expect(tool()).toBe("polygon");
  });

  it("asks before going back from Edit too: with nothing editable selected, R stays in Edit", async () => {
    // handle_edit_mode_request checks the selection before toggle_edit_mode (mode_manager.py:55-112).
    mount();
    polygonSelected();
    press("3");
    press("R");
    expect(tool()).toBe("none");
    fireEvent.click(screen.getByText("select none"));

    press("R");

    expect(await screen.findByText("Error: No editable shapes selected!")).toBeTruthy();
    expect(tool()).toBe("none");
  });

  it("goes back when the Select button is clicked while it is on, as legacy's button does", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Box (3)" }));
    fireEvent.click(screen.getByRole("radio", { name: "Select (E)" }));
    expect(tool()).toBe("select");

    fireEvent.click(screen.getByRole("radio", { name: "Select (E)" }));

    expect(tool()).toBe("box");
    expect((screen.getByRole("radio", { name: "Box (3)" }) as HTMLInputElement).checked).toBe(true);
  });

  it("goes back when the Edit button is clicked while it is on, with a polygon selected", () => {
    mount();
    polygonSelected();
    fireEvent.click(screen.getByRole("radio", { name: "Circle (4)" }));
    fireEvent.click(screen.getByRole("radio", { name: "Edit (R)" }));
    expect(tool()).toBe("none");

    fireEvent.click(screen.getByRole("radio", { name: "Edit (R)" }));

    expect(tool()).toBe("circle");
  });

  it("goes back from Pan when its button is clicked again, as Q does", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "AI (1)" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pan (Q)" }));
    expect(tool()).toBe("pan");

    fireEvent.click(screen.getByRole("radio", { name: "Pan (Q)" }));

    expect(tool()).toBe("ai");
  });

  it("keeps 1 to 4 as settings: pressed again, a drawing mode stays", () => {
    mount();
    press("2");
    press("2");

    expect(tool()).toBe("polygon");
  });
});

describe("X, legacy's toggle recent class (RULE-086)", () => {
  it("says there is nothing to toggle on an image with no classes, in legacy's words", async () => {
    mount();

    fireEvent.keyDown(document, { key: "x", code: "KeyX" });

    expect(await screen.findByText("No classes available to toggle")).toBeTruthy();
  });
});
