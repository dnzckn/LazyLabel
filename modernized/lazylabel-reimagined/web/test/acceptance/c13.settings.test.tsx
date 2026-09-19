/**
 * C13 — Keep settings and hotkeys across sessions: the web app's share.
 *
 * The schema and its rules live in `@lazylabel/settings-schema`; persistence lives in the API. What
 * the browser owes this capability is loading them, acting on them, and — the part with teeth —
 * behaving correctly when they cannot be loaded at all.
 *
 * The failure-mode table gives the database its own row: when it is unavailable, "nothing persists
 * across a reload, but annotations still load and save, because they are files", and the user sees
 * a banner rather than a blocked app. That is only true if the web app treats a settings failure as
 * degraded rather than fatal, which is what most of this file is about.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { defaultSettings, checkAssignment } from "@lazylabel/settings-schema";

import { SettingsProvider, useSettings } from "../../src/settings/SettingsProvider.jsx";
import type { ApiClient } from "../../src/api/client.js";

afterEach(cleanup);

function fakeClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings) => settings,
    ...overrides,
  } as ApiClient;
}

function Probe(): ReactNode {
  const { state, settings } = useSettings();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="width">{String(settings.values["window_width"])}</span>
      <span data-testid="undo">{settings.hotkeys["undo"]?.primary}</span>
    </div>
  );
}

describe("C13: settings in the browser", () => {
  it("loads settings from the API and makes them available", async () => {
    const stored = defaultSettings();
    const client = fakeClient({
      getSettings: async () => ({ ...stored, values: { ...stored.values, window_width: 1234 } }),
    });

    render(
      <SettingsProvider client={client}>
        <Probe />
      </SettingsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
    expect(screen.getByTestId("width").textContent).toBe("1234");
    expect(screen.getByTestId("undo").textContent).toBe("Ctrl+Z");
  });

  it("degrades rather than failing when settings cannot be read", async () => {
    const client = fakeClient({
      getSettings: async () => {
        throw new Error("the settings database is locked");
      },
    });

    render(
      <SettingsProvider client={client}>
        <Probe />
      </SettingsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unavailable"));

    // The point of the state: working defaults are in place, so every annotation feature still
    // runs. Blocking the app because a preferences file is locked would give back exactly what
    // decision 5 bought by keeping annotations in the user's own folder.
    expect(screen.getByTestId("width").textContent).toBe("1600");
    expect(screen.getByTestId("undo").textContent).toBe("Ctrl+Z");
  });

  it("gives callers usable settings even while the load is still in flight", async () => {
    let release: (settings: ReturnType<typeof defaultSettings>) => void = () => {};
    const client = fakeClient({
      getSettings: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });

    render(
      <SettingsProvider client={client}>
        <Probe />
      </SettingsProvider>,
    );

    // No branch on "loading" should be needed to read a setting; `settings` is never undefined.
    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(screen.getByTestId("width").textContent).toBe("1600");

    release(defaultSettings());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  });

  it("reports the corrections the API made rather than showing something else than was sent", async () => {
    const stored = defaultSettings();
    const putSettings = vi.fn(async () => ({
      ...stored,
      values: { ...stored.values, export_formats: ["NPZ", "YOLO_DETECTION"] },
      corrections: ["no usable export formats remained; the defaults were used"],
    }));

    let save: ReturnType<typeof useSettings>["save"] | null = null;
    function Saver(): ReactNode {
      save = useSettings().save;
      return null;
    }

    render(
      <SettingsProvider client={fakeClient({ putSettings })}>
        <Saver />
      </SettingsProvider>,
    );

    await waitFor(() => expect(save).not.toBeNull());
    const result = await save!({ ...stored, values: { ...stored.values, export_formats: [] } });

    // RULE-088 corrects an unusable list instead of storing it. Saying so is what keeps the UI from
    // claiming the user's choice was kept.
    expect(result.corrections).toHaveLength(1);
  });

  it("uses the same conflict rule the API enforces", () => {
    const stored = defaultSettings();

    // Not a second implementation: the same function from the shared package, which is the whole
    // reason it is in a shared package. The dialog has to answer this while the user is typing.
    expect(checkAssignment(stored.hotkeys, "delete_segments", "primary", "M")).toMatchObject({
      heldBy: "merge_segments",
    });
    expect(checkAssignment(stored.hotkeys, "delete_segments", "primary", "F19")).toBeNull();
  });
});
