/**
 * The adjustment sliders.
 *
 * What is worth pinning beyond "a slider changes a setting": that the units are LEGACY's, so a
 * stored settings file round-trips; and that the negative-brightness fold is announced, which is
 * the one thing legacy never does.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { AdjustmentsPanel } from "../../src/workspace/AdjustmentsPanel.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";

afterEach(cleanup);

function mount(values: Record<string, unknown> = {}) {
  const saved: Record<string, unknown>[] = [];
  const api = {
    getSettings: async () => {
      const base = defaultSettings();
      return { ...base, values: { ...base.values, ...values } };
    },
    putSettings: async (settings: { values: Record<string, unknown> }) => {
      saved.push(settings.values);
      return settings;
    },
  } as unknown as ApiClient;

  render(
    <SettingsProvider client={api}>
      <AdjustmentsPanel />
    </SettingsProvider>,
  );

  return { saved };
}

const slider = (name: string) => screen.getByRole("slider", { name });

describe("the sliders", () => {
  it("offers all four", async () => {
    mount();
    await waitFor(() => expect(slider("Brightness")).toBeTruthy());

    for (const name of ["Brightness", "Contrast", "Gamma", "Saturation"]) {
      expect(slider(name)).toBeTruthy();
    }
  });

  it("uses LEGACY's slider units, so a stored file round-trips", async () => {
    // Gamma's slider is 1..200 for 0.01..2.00 -- the range a user's settings were written in.
    // Presenting it as a 0.01..2.00 float would be friendlier and would not round-trip.
    mount({ gamma: 1.5 });
    await waitFor(() => expect(slider("Gamma")).toBeTruthy());

    expect((slider("Gamma") as HTMLInputElement).value).toBe("150");
    expect((slider("Gamma") as HTMLInputElement).max).toBe("200");
  });

  it("shows the real value beside the slider, not the slider's integer", async () => {
    mount({ gamma: 1.5 });
    await waitFor(() => expect(screen.getByText("1.50")).toBeTruthy());
  });

  it("stores gamma back in its own units, not the slider's", async () => {
    const { saved } = mount();
    await waitFor(() => expect(slider("Gamma")).toBeTruthy());

    fireEvent.change(slider("Gamma"), { target: { value: "50" } });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.["gamma"]).toBe(0.5);
  });

  it("stores brightness as the value it already is", async () => {
    const { saved } = mount();
    await waitFor(() => expect(slider("Brightness")).toBeTruthy());

    fireEvent.change(slider("Brightness"), { target: { value: "40" } });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.["brightness"]).toBe(40);
  });
});

describe("the fold warning", () => {
  it("appears for negative brightness", async () => {
    // The thing legacy never says: cv2.convertScaleAbs takes the absolute value, so darkening
    // makes the darkest pixels BRIGHT. A user who sees that untold concludes the slider is broken.
    mount({ brightness: -20 });

    expect(await screen.findByText(/folds instead of darkening/)).toBeTruthy();
  });

  it("does not appear for zero or positive brightness", async () => {
    mount({ brightness: 0 });
    await waitFor(() => expect(slider("Brightness")).toBeTruthy());

    expect(screen.queryByText(/folds instead/)).toBeNull();
  });
});

describe("resetting", () => {
  it("is offered only when something is applied", async () => {
    mount();
    await waitFor(() => expect(screen.getByRole("button")).toBeTruthy());

    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("puts every adjustment back at once", async () => {
    const { saved } = mount({ brightness: 40, gamma: 1.5 });
    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ brightness: 0, contrast: 0, gamma: 1, saturation: 1 });
  });
});

describe("a settings file that holds nonsense", () => {
  it("falls back rather than making the image vanish", async () => {
    // A hand-edited file can hold anything, and a NaN gamma would blank every pixel.
    mount({ gamma: "very bright" });
    await waitFor(() => expect(slider("Gamma")).toBeTruthy());

    expect((slider("Gamma") as HTMLInputElement).value).toBe("100");
  });
});

describe("what the adjustments do NOT do", () => {
  it("says whether they reach the AI, which is now a SETTING rather than a gap", async () => {
    // It used to say Operate On View was not built. It is, across all four packages -- so the
    // panel says what the setting does instead of apologising for its absence.
    mount();

    await waitFor(() => expect(screen.getByText(/never the file/)).toBeTruthy());
    expect(screen.getByText(/with it on, the API renders exactly what you can see/)).toBeTruthy();
  });
});
