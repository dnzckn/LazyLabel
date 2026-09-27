/**
 * The fragment filter's control and its toggle key — RULE-027.
 *
 * Both halves existed and neither was reachable: `fragment_threshold` was READ by the AI tool and
 * settable only by editing the settings file, and `toggleThreshold` — the rule's own "what Z
 * toggles to" — was written, tested and called by nothing.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { FragmentPanel } from "../../src/workspace/FragmentPanel.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";

afterEach(cleanup);

function mount(threshold = 0) {
  const saved: Record<string, unknown> = {};
  const base = defaultSettings();
  const client = {
    getSettings: async () => ({ ...base, values: { ...base.values, fragment_threshold: threshold } }),
    putSettings: async (next: { values: Record<string, unknown> }) => {
      Object.assign(saved, next.values);
      return next;
    },
  } as unknown as ApiClient;

  render(
    <SettingsProvider client={client}>
      <HotkeyProvider bindings={base.hotkeys}>
        <FragmentPanel />
      </HotkeyProvider>
    </SettingsProvider>,
  );
  return { saved };
}

const slider = () => screen.getByLabelText("Fragment threshold") as HTMLInputElement;
const toggleKey = defaultSettings().hotkeys["toggle_ai_filter"]!.primary;
const press = () => fireEvent.keyDown(document, { key: toggleKey, code: `Key${toggleKey}` });

describe("the control", () => {
  it("is reachable at all, which it was not", async () => {
    mount(30);

    await waitFor(() => expect(slider().value).toBe("30"));
  });

  it("writes the setting the AI tool reads", async () => {
    const { saved } = mount(0);
    await waitFor(() => expect(slider()).toBeTruthy());

    fireEvent.change(slider(), { target: { value: "40" } });

    await waitFor(() => expect(saved["fragment_threshold"]).toBe(40));
  });

  it("says what it does in legacy's words: a label, its tooltip and one line", async () => {
    // fragment_threshold_widget.py:36-63. A paragraph explaining the filter and its key was printed
    // here until the owner asked for legacy's panels without them (2026-09-26).
    mount(0);
    await waitFor(() => expect(slider()).toBeTruthy());

    const row = slider().closest("label")!;
    expect(row.textContent?.trim().startsWith("Filter:")).toBe(true);
    expect(row.title).toBe(
      "Filter out small AI segments. 0=no filtering, 50=drop <50% of largest, 100=only keep largest",
    );
    expect(screen.getByText("Filters small AI segments relative to the largest segment")).toBeTruthy();
  });
});

describe("the toggle key", () => {
  it("turns a set threshold off", async () => {
    const { saved } = mount(35);
    await waitFor(() => expect(slider().value).toBe("35"));

    press();

    await waitFor(() => expect(saved["fragment_threshold"]).toBe(0));
  });

  it("REMEMBERS the value and brings it back", async () => {
    // The point of the toggle: off, look, on. Without memory it would come back at zero and the
    // user would retype the number every time they checked a piece.
    const { saved } = mount(35);
    await waitFor(() => expect(slider().value).toBe("35"));

    press();
    await waitFor(() => expect(saved["fragment_threshold"]).toBe(0));
    press();

    await waitFor(() => expect(saved["fragment_threshold"]).toBe(35));
  });

  it("brings back the last value the SLIDER set, not only one it switched off itself", async () => {
    // Legacy remembers every non-zero set (main_window.py:1320-1324). Only Z did here, so a slider
    // dragged down to 0 and then Z came back at 100 (CONTROL_PARITY.md CP-24).
    const { saved } = mount(0);
    await waitFor(() => expect(slider().value).toBe("0"));

    fireEvent.change(slider(), { target: { value: "40" } });
    await waitFor(() => expect(slider().value).toBe("40"));
    fireEvent.change(slider(), { target: { value: "0" } });
    await waitFor(() => expect(slider().value).toBe("0"));
    press();

    await waitFor(() => expect(saved["fragment_threshold"]).toBe(40));
  });

  it("goes to the rule's default from a stored zero, rather than doing nothing", async () => {
    const { saved } = mount(0);
    await waitFor(() => expect(slider().value).toBe("0"));

    press();

    await waitFor(() => expect(saved["fragment_threshold"]).toBeGreaterThan(0));
  });
});

describe("the type-in box, legacy's (CP-51)", () => {
  it("applies a whole number, clamped to 0-100, and puts back anything else", async () => {
    // fragment_threshold_widget.py:80-88: int(text), clamped, else the slider's value again.
    const { saved } = mount(10);
    const box = (await screen.findByRole("textbox", { name: "Fragment threshold, typed" })) as HTMLInputElement;
    // The stored value first: the box is there before the settings are.
    await waitFor(() => expect(box.value).toBe("10"));

    fireEvent.change(box, { target: { value: "250" } });
    fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(saved["fragment_threshold"]).toBe(100));

    fireEvent.change(box, { target: { value: "12.5" } });
    fireEvent.blur(box);
    await waitFor(() => expect(box.value).toBe("100"));
  });
});
