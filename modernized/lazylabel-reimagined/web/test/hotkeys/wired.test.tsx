/**
 * Does pressing this key do anything?
 *
 * The settings guard's question, asked of the hotkeys — and the answer was worse. FORTY of the
 * forty-three actions in the schema had no handler anywhere in the app, while the reference table
 * listed every one of them with its key as though it worked. A setting that changes nothing is
 * invisible; a hotkey that does nothing is a promise made in writing and broken on the first
 * press.
 *
 * Two things are checked here. The tool keys work, which is the slice that was wired. And the
 * REFERENCE tells the truth about the rest — from the dispatcher's own registrations rather than
 * a list someone maintains, so it cannot drift.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

function mount() {
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: false, reason: "none", videoCapable: false, accelerator: "unknown" },
    }),
    listImages: async () => ({
      folder: "",
      folders: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [],
      images: [],
    }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    thumbnailUrl: () => "/thumbnail",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default">
            <App client={client} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

const chosen = () =>
  screen
    .getAllByRole("radio", { name: /^(None|Select|Polygon|Box|Circle|AI)$/ })
    .find((radio) => (radio as HTMLInputElement).checked)
    ?.closest("label")
    ?.textContent?.trim();

/** The key the schema binds to an action, so a remapped binding would be tested, not a guess. */
const keyFor = (action: string) => defaultSettings().hotkeys[action]!.primary;

describe("the tool keys", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["polygon_mode", "Polygon"],
    ["bbox_mode", "Box"],
    ["circle_mode", "Circle"],
    ["sam_mode", "AI"],
    ["selection_mode", "Select"],
  ];

  for (const [action, label] of cases) {
    it(`${action} picks ${label}`, async () => {
      mount();
      await waitFor(() => expect(screen.getByText("Tool")).toBeTruthy());

      fireEvent.keyDown(document, { key: keyFor(action) });

      await waitFor(() => expect(chosen()).toBe(label));
    });
  }

  it("edit_mode clears the tool, which is what shows the vertex handles", async () => {
    // "Edit" is not a tool here. The vertex editor appears when exactly one annotation is selected
    // and no drawing tool is active, so R means "no tool".
    mount();
    await waitFor(() => expect(screen.getByText("Tool")).toBeTruthy());
    fireEvent.keyDown(document, { key: keyFor("polygon_mode") });
    await waitFor(() => expect(chosen()).toBe("Polygon"));

    fireEvent.keyDown(document, { key: keyFor("edit_mode") });

    await waitFor(() => expect(chosen()).toBe("None"));
  });

  it("SETS the tool rather than toggling back, which is RULE-070's defect", async () => {
    // Legacy means Selection and Edit to toggle back to the previous mode, and records the mode
    // just left every time -- so E R R E leaves you in selection, unable to reach AI without
    // pressing 1. The card calls it a defect. A tool key that sometimes does something else is
    // worse than one that always does the same thing.
    mount();
    await waitFor(() => expect(screen.getByText("Tool")).toBeTruthy());

    fireEvent.keyDown(document, { key: keyFor("sam_mode") });
    await waitFor(() => expect(chosen()).toBe("AI"));
    fireEvent.keyDown(document, { key: keyFor("selection_mode") });
    await waitFor(() => expect(chosen()).toBe("Select"));
    fireEvent.keyDown(document, { key: keyFor("edit_mode") });
    await waitFor(() => expect(chosen()).toBe("None"));

    // The fourth press in legacy's sequence. Selection, every time, not "back to AI".
    fireEvent.keyDown(document, { key: keyFor("selection_mode") });

    await waitFor(() => expect(chosen()).toBe("Select"));
  });
});

describe("the hotkey reference", () => {
  async function openReference(): Promise<HTMLElement> {
    mount();
    await waitFor(() => expect(screen.getByText(/Show hotkeys/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Show hotkeys/));
    return await screen.findByRole("table");
  }

  it("says which keys do something and which do not", async () => {
    const table = await openReference();

    const rows = within(table).getAllByRole("row").slice(1);
    const works = rows.filter((row) => row.textContent?.includes("yes"));
    const pending = rows.filter((row) => row.textContent?.includes("not yet"));

    expect(works.length).toBeGreaterThan(0);
    expect(pending.length).toBeGreaterThan(0);
    expect(works.length + pending.length).toBe(rows.length);
  });

  it("marks a tool key as working, now that it is", async () => {
    const table = await openReference();

    const row = within(table).getByRole("row", { name: /polygon_mode/ });

    expect(row.textContent).toContain("yes");
  });

  it("marks an unbuilt action as not yet", async () => {
    // Propagation needs the inference service and a recorded sequence. Its key is in the schema
    // and honoured on import; what must not happen is the table implying it runs.
    const table = await openReference();

    const row = within(table).getByRole("row", { name: /propagate/ });

    expect(row.textContent).toContain("not yet");
  });

  it("counts them in the summary, so the scale is visible without reading every row", async () => {
    await openReference();

    expect(screen.getByText(/\d+ of \d+ do something today/)).toBeTruthy();
  });
});
