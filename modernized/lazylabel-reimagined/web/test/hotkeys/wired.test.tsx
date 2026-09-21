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

  it("edit_mode SAYS WHY when there is nothing to edit", async () => {
    // The vertex editor opens for one selected editable shape. With nothing selected, clearing the
    // tool is all that visibly happens -- and legacy's own words are the only thing separating
    // "the key is not bound" from "this shape has no vertices to drag".
    mount();
    await waitFor(() => expect(screen.getByText("Tool")).toBeTruthy());

    fireEvent.keyDown(document, { key: keyFor("edit_mode") });

    await waitFor(() => expect(screen.getByText(/No editable shapes selected/)).toBeTruthy());
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

/**
 * The row for one action, matched on its header cell exactly.
 *
 * By cell rather than by accessible name, which folds in the key and the state -- and `save_output`
 * is a prefix of `save_output_alt`, so a substring match finds two rows.
 */
function rowFor(table: HTMLElement, action: string): HTMLElement {
  const row = within(table)
    .getAllByRole("row")
    .find((candidate) => candidate.querySelector("th")?.textContent === action);
  expect(row, `no row for ${action}`).toBeTruthy();
  return row!;
}

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

  it("marks the shell's new keys as working", async () => {
    // Next and previous image are registered by the shell, so they are live from the first render.
    const table = await openReference();

    for (const action of ["load_next_image", "load_previous_image"]) {
      const row = within(table).getByRole("row", { name: new RegExp(action) });
      expect(row.textContent, action).toContain("yes");
    }
  });

  it("reports a key as inactive while the component that owns it is not mounted", async () => {
    // The save keys are registered by the OPENED IMAGE, and this fixture has none. Reporting them
    // as working would be the same lie in miniature: a key listed as live that nothing is
    // listening for. The table answers "will this do something if I press it now", which is the
    // question a user is actually asking.
    const table = await openReference();

    for (const action of ["save_output", "save_output_alt"]) {
      expect(rowFor(table, action).textContent, action).toContain("not yet");
    }
  });

  it("reports the segment table's keys as working, because that panel is always mounted", async () => {
    // Their handlers register above the table's early return, so they are listening even with
    // nothing on the image -- where each does nothing, exactly as its button sits disabled. "Live"
    // here means a handler exists, not that every press will have an effect; the alternative is
    // duplicating each action's enablement into the reference, where it would drift.
    const table = await openReference();

    for (const action of ["merge_segments", "delete_segments", "select_all", "escape"]) {
      expect(rowFor(table, action).textContent, action).toContain("yes");
    }
  });

  it("reports propagate as inactive while its control is not mounted", async () => {
    // Propagation IS built now, and this still says "not yet" -- correctly. The key is registered
    // by the propagation control, which appears only once a timeline exists and this deployment
    // has an inference client; this fixture has neither. The table answers "will this do something
    // if I press it now", which is the question a user is actually asking, and the alternative is
    // a key listed as live that nothing is listening for.
    const table = await openReference();

    const row = within(table).getByRole("row", { name: /propagate/ });

    expect(row.textContent).toContain("not yet");
  });

  it("marks zoom and fit as working, now that they are", async () => {
    // All three were listed with a key and answered by nothing. `fit_view` was worse than the
    // other two: it was WIRED, to toggling this very table, which is scaffolding that became a lie
    // the moment the table started reporting it live.
    const table = await openReference();

    for (const action of ["zoom_in", "zoom_out", "fit_view"]) {
      expect(rowFor(table, action).textContent, action).toContain("yes");
    }
  });

  it("still reports the MOUSE bindings as not yet, because they are not keys", async () => {
    // Three of the schema's actions are mouse bindings. No keyboard dispatcher will ever answer
    // them, and reporting them as live would be the same lie in a different direction.
    const table = await openReference();

    for (const action of ["left_click", "right_click", "mouse_drag"]) {
      expect(rowFor(table, action).textContent, action).toContain("not yet");
    }
  });

  it("counts them in the summary, so the scale is visible without reading every row", async () => {
    await openReference();

    expect(screen.getByText(/\d+ of \d+ do something today/)).toBeTruthy();
  });
});
