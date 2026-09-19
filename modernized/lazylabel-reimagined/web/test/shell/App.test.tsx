/**
 * The shell: what it shows, and which failures it treats as blocking.
 *
 * The distinction under test is the failure-mode table's: an unreadable dataset folder stops
 * everything, an unavailable settings database stops nothing. Getting that backwards would either
 * block a user who could be working or let one label into a void.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { ApiClient } from "../../src/api/client.js";

afterEach(cleanup);

const HEALTHY = { status: "ok", dataset: "ok", database: "ok", degraded: [] as string[] };

function mount(client: Partial<ApiClient>) {
  const full = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    health: async () => HEALTHY,
    listImages: async () => ({
      folder: "",
      images: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [],
    }),
    imageMetadata: async () => ({ width: 1, height: 1, sourceDepth: 8, sourceFormat: "png" }),
    pixelsUrl: () => "/api/pixels",
    thumbnailUrl: () => "/api/thumbnail",
    ...client,
  } as ApiClient;

  return render(
    <SettingsProvider client={full}>
      <HotkeyProvider bindings={defaultSettings().hotkeys}>
        <App client={full} />
      </HotkeyProvider>
    </SettingsProvider>,
  );
}

describe("the application shell", () => {
  it("renders and reports what it is", async () => {
    mount({});
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("LazyLabel");
    await waitFor(() => expect(screen.getByText(/Dataset folder/)).toBeTruthy());
  });

  it("blocks with an alert when the dataset folder cannot be read", async () => {
    mount({
      health: async () => ({ status: "unavailable", dataset: "unreadable", database: "ok", degraded: [] }),
    });

    // The folder is the source of truth, so this is fatal and says so, rather than showing an empty
    // file list that reads as "you have no images".
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/dataset folder cannot be read/i));
  });

  it("warns without blocking when settings are unavailable", async () => {
    mount({
      getSettings: async () => {
        throw new Error("the settings database is locked");
      },
    });

    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(/preferences will not be remembered/i);
    // And it says why that is survivable, which is the fact the user needs.
    expect(banner.textContent).toMatch(/annotations are files/i);

    // Not an alert: nothing is blocked.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the API is unreachable rather than showing an empty page", async () => {
    mount({
      health: async () => {
        throw new Error("connection refused");
      },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/API could not be reached/i),
    );
  });

  it("lists every capability with its status, so nothing reads as built that is not", async () => {
    mount({});
    await waitFor(() => expect(screen.getByText(/What is built/)).toBeTruthy());

    // C4 is Phase 5. If the shell ever renders it as available, this catches it.
    expect(screen.getByText(/Draw and edit polygons/).closest("tr")?.textContent).toMatch(/P5/);
  });

  it("shows the hotkey reference when its own hotkey is pressed", async () => {
    mount({});
    await waitFor(() => expect(screen.getByText(/Show hotkeys/)).toBeTruthy());

    // "." is bound to fit_view, which the shell registers. This is the hotkey path end to end:
    // event, translation, binding lookup, handler.
    document.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Period", key: ".", bubbles: true, cancelable: true }),
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Hotkeys" })).toBeTruthy());
    expect(screen.getByText("merge_segments")).toBeTruthy();
  });
});
