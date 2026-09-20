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
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { ApiClient } from "../../src/api/client.js";

afterEach(cleanup);

const AI_READY = {
  available: true,
  reason: null,
  videoCapable: true,
  accelerator: "NVIDIA RTX 4090",
};

const HEALTHY = {
  status: "ok",
  dataset: "ok",
  database: "ok",
  degraded: [] as string[],
  ai: AI_READY,
};

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
    models: async () => [],
    pixelsUrl: () => "/api/pixels",
    thumbnailUrl: () => "/api/thumbnail",
    ...client,
  } as ApiClient;

  // Same nesting main.tsx uses: notifications outermost, because a failure to LOAD settings is
  // itself something to report.
  return render(
    <NotificationProvider>
      <SettingsProvider client={full}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={full} projectId="default">
            <App client={full} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

describe("the application shell", () => {
  it("renders and reports what it is", async () => {
    mount({});
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("LazyLabel");

    // The health facts moved into the status bar, which reports only what is WRONG -- a line that
    // always reads "dataset: ok" trains the eye to skip where "unreadable" would appear. So what
    // this waits for is the bar having reached the server at all.
    await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/AI ready/));
  });

  it("blocks with an alert when the dataset folder cannot be read", async () => {
    mount({
      health: async () => ({
        status: "unavailable",
        dataset: "unreadable",
        database: "ok",
        degraded: [],
        ai: AI_READY,
      }),
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
    await waitFor(() => expect(screen.getByRole("button", { name: /What is built/ })).toBeTruthy());

    // The table now lives in a panel that starts closed, so the reference is out of the way
    // without being gone.
    screen.getByRole("button", { name: /What is built/ }).click();

    // C4 is Phase 5. If the shell ever renders it as available, this catches it.
    await waitFor(() =>
      expect(screen.getByText(/Draw and edit polygons/).closest("tr")?.textContent).toMatch(/P5/),
    );
  });

  it("names the tools that are not built rather than showing dead controls", async () => {
    // A row of disabled buttons that look like the real thing invites a user to press one.
    mount({});
    await waitFor(() => expect(screen.getByLabelText("Tools")).toBeTruthy());

    const tools = screen.getByLabelText("Tools");
    expect(tools.textContent).toMatch(/Drawing tools/);
    expect(tools.textContent).toMatch(/AI tools/);
    expect(tools.textContent).toMatch(/Phase 5/);
  });

  it("puts the image in the main landmark and the dataset beside it", async () => {
    mount({});
    await waitFor(() => expect(screen.getByLabelText("Dataset")).toBeTruthy());

    expect(screen.getByLabelText("Image")).toBeTruthy();
    expect(screen.getByLabelText("Dataset").textContent).toMatch(/Segments/);
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

describe("the theme", () => {
  // The document outlives cleanup(), so a theme left behind would leak into the next test.
  afterEach(() => {
    delete document.documentElement.dataset["theme"];
  });

  it("applies the stored preference to the document", async () => {
    mount({});

    // Waited for rather than asserted straight away: the attribute is absent BEFORE settings load
    // too, so a bare assertion here would pass on the state this test exists to distinguish from.
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("dark"));
  });

  it("falls back to the system when settings could not be read", async () => {
    // The case the design turns on: honouring the default here would hand someone a dark app on a
    // light desktop with no way out, because the toggle writes to the store that is down.
    mount({ getSettings: async () => { throw new Error("the database is locked"); } });

    // Wait for the app to KNOW settings failed, so "no attribute" means the fallback rather than
    // "settings have not loaded yet" -- which looks identical.
    await waitFor(() => expect(screen.getByText(/Settings are unavailable/)).toBeTruthy());
    expect(document.documentElement.dataset["theme"]).toBeUndefined();
  });

  it("writes the new preference when toggled, rather than only changing the screen", async () => {
    // A theme that resets on reload is a theme the user has to set every session.
    const saved: unknown[] = [];
    mount({ putSettings: async (settings: unknown) => { saved.push(settings); return settings as never; } });
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("dark"));

    screen.getByRole("button", { name: /Switch to light theme/ }).click();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect((saved[0] as { values: Record<string, unknown> }).values["dark_mode"]).toBe(false);
  });
});
