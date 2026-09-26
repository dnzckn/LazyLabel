/**
 * Legacy's Mode Controls card: radios drawn as its mode buttons, each labelled with its key.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

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

  it("goes back to no tool on Edit", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Poly (2)" }));

    fireEvent.click(screen.getByRole("radio", { name: "Edit (R)" }));

    expect(screen.getByTestId("tool").textContent).toBe("none");
  });
});

describe("X, legacy's toggle recent class (RULE-086)", () => {
  it("says there is nothing to toggle on an image with no classes, in legacy's words", async () => {
    mount();

    fireEvent.keyDown(document, { key: "x", code: "KeyX" });

    expect(await screen.findByText("No classes available to toggle")).toBeTruthy();
  });
});
