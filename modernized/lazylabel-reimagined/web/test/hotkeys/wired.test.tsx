/**
 * Does pressing this key do anything?
 *
 * The settings guard's question, asked of the hotkeys — and the answer was worse. FORTY of the
 * forty-three actions in the schema had no handler anywhere in the app, while the reference table
 * listed every one of them with its key as though it worked. A setting that changes nothing is
 * invisible; a hotkey that does nothing is a promise made in writing and broken on the first
 * press.
 *
 * Three things are checked here. The tool keys work, which is the slice that was wired first. The
 * dispatcher's own registrations say which actions are listened for in which state of the app. And
 * every action the hotkey editor lists has a handler somewhere: the editor shows legacy's columns
 * now, with no "Works" column, so listing an action nothing handles would be the old lie again.
 */

import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_HOTKEYS, defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider, useHotkeyContext } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

/** The dispatcher's answer to "is anything listening for this action right now". */
let listening: (action: string) => boolean = () => false;

function Listening(): ReactNode {
  listening = useHotkeyContext().isLive;
  return null;
}

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
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <Listening />
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
    .getAllByRole("radio", { name: /^(AI|Poly|Box|Circle|Select|Edit|Pan) \(.\)$/ })
    .find((radio) => (radio as HTMLInputElement).checked)
    ?.closest("label")
    ?.textContent?.trim();

/** The key the schema binds to an action, so a remapped binding would be tested, not a guess. */
const keyFor = (action: string) => defaultSettings().hotkeys[action]!.primary;

describe("the tool keys", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["polygon_mode", "Poly (2)"],
    ["bbox_mode", "Box (3)"],
    ["circle_mode", "Circle (4)"],
    ["sam_mode", "AI (1)"],
    ["selection_mode", "Select (E)"],
  ];

  for (const [action, label] of cases) {
    it(`${action} picks ${label}`, async () => {
      mount();
      await waitFor(() => expect(screen.getByText("Mode Controls")).toBeTruthy());

      fireEvent.keyDown(document, { key: keyFor(action) });

      await waitFor(() => expect(chosen()).toBe(label));
    });
  }

  it("edit_mode clears the tool, which is what shows the vertex handles", async () => {
    // "Edit" is not a tool here. The vertex editor appears when exactly one annotation is selected
    // and no drawing tool is active, so R means "no tool".
    mount();
    await waitFor(() => expect(screen.getByText("Mode Controls")).toBeTruthy());
    fireEvent.keyDown(document, { key: keyFor("polygon_mode") });
    await waitFor(() => expect(chosen()).toBe("Poly (2)"));

    fireEvent.keyDown(document, { key: keyFor("edit_mode") });

    await waitFor(() => expect(chosen()).toBe("Edit (R)"));
  });

  it("edit_mode SAYS WHY when there is nothing to edit", async () => {
    // The vertex editor opens for one selected editable shape. With nothing selected, clearing the
    // tool is all that visibly happens -- and legacy's own words are the only thing separating
    // "the key is not bound" from "this shape has no vertices to drag".
    mount();
    await waitFor(() => expect(screen.getByText("Mode Controls")).toBeTruthy());

    fireEvent.keyDown(document, { key: keyFor("edit_mode") });

    await waitFor(() => expect(screen.getByText(/No editable shapes selected/)).toBeTruthy());
  });

  it("SETS the tool rather than toggling back, which is RULE-070's defect", async () => {
    // Legacy means Selection and Edit to toggle back to the previous mode, and records the mode
    // just left every time -- so E R R E leaves you in selection, unable to reach AI without
    // pressing 1. The card calls it a defect. A tool key that sometimes does something else is
    // worse than one that always does the same thing.
    mount();
    await waitFor(() => expect(screen.getByText("Mode Controls")).toBeTruthy());

    fireEvent.keyDown(document, { key: keyFor("sam_mode") });
    await waitFor(() => expect(chosen()).toBe("AI (1)"));
    fireEvent.keyDown(document, { key: keyFor("selection_mode") });
    await waitFor(() => expect(chosen()).toBe("Select (E)"));
    fireEvent.keyDown(document, { key: keyFor("edit_mode") });
    await waitFor(() => expect(chosen()).toBe("Edit (R)"));

    // The fourth press in legacy's sequence. Selection, every time, not "back to AI".
    fireEvent.keyDown(document, { key: keyFor("selection_mode") });

    await waitFor(() => expect(chosen()).toBe("Select (E)"));
  });
});

describe("which actions the dispatcher is listening for", () => {
  /** Mounted and settled: the Mode Controls card is up and its keys are registered. */
  async function settled(): Promise<void> {
    mount();
    await waitFor(() => expect(screen.getByText("Mode Controls")).toBeTruthy());
    await waitFor(() => expect(listening("polygon_mode")).toBe(true));
  }

  it("hears the shell's keys from the first render", async () => {
    // Next and previous image are registered by the shell, and so are zoom and fit. All three of
    // the last were once listed with a key and answered by nothing, and `fit_view` was worse: it
    // was WIRED, to toggling the hotkey table.
    await settled();

    for (const action of ["load_next_image", "load_previous_image", "zoom_in", "zoom_out", "fit_view"]) {
      expect(listening(action), action).toBe(true);
    }
  });

  it("hears the segment table's keys, because that panel is always mounted", async () => {
    // Their handlers register above the table's early return, so they are listening even with
    // nothing on the image -- where each does nothing, exactly as its button sits disabled.
    await settled();

    for (const action of ["merge_segments", "delete_segments", "select_all", "escape"]) {
      expect(listening(action), action).toBe(true);
    }
  });

  it("does not hear a key while the component that owns it is not mounted", async () => {
    // The save keys are registered by the OPENED IMAGE, and this fixture has none. Propagate is
    // registered by the propagation control, which appears only once a timeline exists and the
    // deployment has an inference client; this fixture has neither.
    await settled();

    for (const action of ["save_output", "save_output_alt", "propagate"]) {
      expect(listening(action), action).toBe(false);
    }
  });

  it("never hears the MOUSE bindings, because they are not keys", async () => {
    await settled();

    for (const action of ["left_click", "right_click", "mouse_drag"]) {
      expect(listening(action), action).toBe(false);
    }
  });
});

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

async function sourceText(dir: string): Promise<string> {
  let text = "";
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) text += await sourceText(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) text += await readFile(full, "utf-8");
  }
  return text;
}

describe("every action the hotkey editor lists", () => {
  it("has a handler somewhere in the app", async () => {
    // The editor lists every action with its key, as legacy's dialog does, and no longer marks the
    // ones nothing handles. So nothing it lists may be unhandled. A fallback does not count: it
    // says why nothing happened. Comments are stripped, so a commented-out call is not a handler;
    // string literals are matched first and kept, as the reach guard does, so a comment marker
    // inside a string cannot swallow the code after it.
    const code = (await sourceText(SRC)).replace(
      /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      (_whole, literal: string | undefined) => literal ?? " ",
    );
    const keyboard = Object.entries(DEFAULT_HOTKEYS)
      .filter(([, action]) => !action.mouseRelated)
      .map(([id]) => id);

    expect(keyboard.length).toBeGreaterThan(0);
    expect(keyboard.filter((id) => !new RegExp(`\\buseHotkey\\(\\s*"${id}"`).test(code))).toEqual([]);
  });
});
