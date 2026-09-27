/**
 * Settings that last -- the owner's "the settings of the app should save between sessions with a
 * reset to defaults button somewhere" (2026-09-26), tested the way the app is used.
 *
 * Each test mounts the whole shell, wired as `main.tsx` wires it, against one settings store that
 * outlives the mount, as the API's database does: GET answers what the last PUT stored, and a PUT
 * takes a moment, as a request does. A change is made the way a user makes it; then the shell is
 * unmounted and mounted again -- a reload -- and the controls are read.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider, useSettings } from "../../src/settings/SettingsProvider.jsx";
import { App } from "../../src/shell/App.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // The document outlives cleanup(), so a theme left behind would leak into the next test.
  delete document.documentElement.dataset["theme"];
});

/** A settings store that outlives any one mount of the app. */
function settingsApi(initial: StoredSettings = defaultSettings()) {
  let stored: StoredSettings = structuredClone(initial);
  const puts: StoredSettings[] = [];
  let failingGets = 0;
  let refusal: string | null = null;

  const client = {
    getSettings: async () => {
      if (failingGets > 0) {
        failingGets -= 1;
        throw new Error("the API is restarting");
      }
      return structuredClone(stored);
    },
    putSettings: async (next: StoredSettings) => {
      // A request takes a moment, so two saves made together are both on their way at once.
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (refusal !== null) throw new Error(refusal);
      puts.push(structuredClone(next));
      stored = structuredClone(next);
      return structuredClone(stored);
    },
  };

  return {
    client,
    puts,
    stored: () => stored,
    failGets: (times: number) => {
      failingGets = times;
    },
    refusePuts: (reason: string) => {
      refusal = reason;
    },
  };
}

type Api = ReturnType<typeof settingsApi>;

/** Hotkeys from the stored settings, as `main.tsx` has them, and the load's state for waiting on. */
function Bound({ client }: { readonly client: ApiClient }): ReactNode {
  const { state, settings } = useSettings();
  return (
    <HotkeyProvider bindings={settings.hotkeys}>
      <span data-testid="settings-status" hidden>
        {state.status}
      </span>
      <WorkspaceProvider client={client} projectId="default">
        <App client={client} />
      </WorkspaceProvider>
    </HotkeyProvider>
  );
}

function mountApp(api: Api, health: Record<string, unknown> = {}) {
  const client = {
    ...api.client,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: false, reason: "none", videoCapable: false, accelerator: "unknown" },
      ...health,
    }),
    listImages: async () => ({
      folder: "",
      folders: [],
      images: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [],
    }),
    imageMetadata: async () => ({ width: 1, height: 1, sourceDepth: 8, sourceFormat: "png" }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
  } as unknown as ApiClient;

  return render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <Bound client={client} />
      </SettingsProvider>
    </NotificationProvider>,
  );
}

async function loaded(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId("settings-status").textContent).toBe("ready"));
}

/** Unmount and mount again against the same store: a reload of the page. */
async function reload(api: Api, view: ReturnType<typeof render>): Promise<void> {
  view.unmount();
  mountApp(api);
  await loaded();
}

const autoSave = () => screen.getByLabelText("Auto-Save on Navigate") as HTMLInputElement;
/** Application Settings' Reset to Default, by its tooltip: AI → Polygon has one of its own (CP-50). */
const resetAll = () => screen.getByTitle("Reset all settings to their default values");
/** An export format's box in Application Settings, by legacy's name for the format. */
const format = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("a change survives a reload", () => {
  it("keeps Auto-Save on Navigate off once it is turned off", async () => {
    const api = settingsApi();
    const view = mountApp(api);
    await loaded();

    fireEvent.click(autoSave());
    await waitFor(() => expect(api.stored().values["auto_save"]).toBe(false));
    await reload(api, view);

    expect(autoSave().checked).toBe(false);
  });

  it("keeps BOTH of two changes made before the first save answered", async () => {
    // Each control saves the whole document it was rendered with. Sent as built, the second save
    // carried Auto-Save back to on, which the first had just turned off, and the last write won.
    const api = settingsApi();
    const view = mountApp(api);
    await loaded();

    fireEvent.click(autoSave());
    fireEvent.click(format(/^Pascal VOC$/));
    await waitFor(() => expect(api.puts).toHaveLength(2));
    await reload(api, view);

    expect(autoSave().checked).toBe(false);
    expect(format(/^Pascal VOC$/).checked).toBe(true);
  });
});

describe("a change made while the settings could not be read", () => {
  it("is added to what is stored, not written over it with the defaults", async () => {
    // The page loaded while the API was restarting. It is back by the time the user changes
    // something; that change must not replace every other stored preference with a default.
    const initial = defaultSettings();
    const api = settingsApi({
      ...initial,
      values: { ...initial.values, brightness: 25, dark_mode: false },
    });
    api.failGets(1);
    mountApp(api);
    await waitFor(() => expect(screen.getByText(/Settings are unavailable/)).toBeTruthy());

    fireEvent.click(autoSave());
    await waitFor(() => expect(api.puts).toHaveLength(1));

    expect(api.stored().values).toMatchObject({ auto_save: false, brightness: 25, dark_mode: false });
    // And the app now knows it has them.
    await loaded();
  });
});

describe("a save the API refuses", () => {
  it("is taken back, and said", async () => {
    const api = settingsApi();
    api.refusePuts("the settings database is read-only");
    mountApp(api);
    await loaded();

    fireEvent.click(autoSave());
    // Shown at once, as a legacy checkbox is...
    expect(autoSave().checked).toBe(false);

    // ...and put back, with the reason, when the server says no. It used to change nothing and say
    // nothing, since this switch, like most, does not wait for its save.
    await waitFor(() =>
      expect(screen.getByText("Error: Settings could not be saved: the settings database is read-only")).toBeTruthy(),
    );
    expect(autoSave().checked).toBe(true);
    expect(api.stored().values["auto_save"]).toBe(true);
  });
});

describe("Reset to Default", () => {
  function customised(): StoredSettings {
    const base = defaultSettings();
    return {
      ...base,
      values: {
        ...base.values,
        auto_save: false,
        dark_mode: false,
        brightness: 30,
        export_formats: ["COCO_JSON"],
        propagation_confidence_threshold: 0.5,
        from_a_newer_version: "kept",
      },
      hotkeys: { ...base.hotkeys, merge_segments: { primary: "F19", secondary: null } },
    };
  }

  it("asks first, saying what it resets, and a No changes nothing", async () => {
    const api = settingsApi(customised());
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    mountApp(api);
    await loaded();

    fireEvent.click(resetAll());

    expect(confirm).toHaveBeenCalledWith("Reset all settings, except hotkeys, to their defaults?");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.puts).toHaveLength(0);
    expect(autoSave().checked).toBe(false);
  });

  it("puts every setting back, keeps the hotkeys, and the defaults are there after a reload", async () => {
    const api = settingsApi(customised());
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const view = mountApp(api);
    await loaded();
    expect(autoSave().checked).toBe(false);

    fireEvent.click(resetAll());
    await waitFor(() => expect(api.puts).toHaveLength(1));

    const stored = api.stored();
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      expect(stored.values[key], key).toEqual(value);
    }
    // A newer build's key is not this build's to reset (RULE-088), and hotkeys have their own.
    expect(stored.values["from_a_newer_version"]).toBe("kept");
    expect(stored.hotkeys["merge_segments"]).toEqual({ primary: "F19", secondary: null });

    await reload(api, view);
    expect(autoSave().checked).toBe(true);
    expect(format(/^NPZ$/).checked && format(/^YOLO Detection$/).checked).toBe(true);
    expect(format(/^COCO JSON$/).checked).toBe(false);
    // The theme is applied by an effect after the render that says "ready", so it is waited for.
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("dark"));
  });
});

describe("an API that keeps settings only in memory", () => {
  it("says they will be lost when it restarts", async () => {
    // LAZYLABEL_DB=:memory: answers every save and keeps none past a restart, which is what the
    // owner's API was running with when settings "did not save".
    mountApp(settingsApi(), { databaseInMemory: true });

    expect(
      await screen.findByText("Settings are kept in memory and will be lost when the API restarts."),
    ).toBeTruthy();
  });

  it("says nothing when they are kept on disk", async () => {
    mountApp(settingsApi(), { databaseInMemory: false });
    await loaded();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByText(/kept in memory/)).toBeNull();
  });
});
