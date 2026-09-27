/**
 * The adjustment sliders.
 *
 * What is worth pinning beyond "a slider changes a setting": that the units are LEGACY's, so a
 * stored settings file round-trips; and that the panel reads as legacy's does -- its labels, its
 * tooltips, and no explanations printed under them (the owner, 2026-09-26).

 *
 * Names RULE-050, so the rule is traceable to the test that proves it: the setting inputs are clamped -- annotation size 0.1-5.0, pan speed 0.1-10.0 -- so a typed value out of range cannot reach the canvas.
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
    await waitFor(() => expect((screen.getByRole("textbox", { name: /^Gamma/ }) as HTMLInputElement).value).toBe("1.50"));
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

describe("legacy's words", () => {
  it("labels the rows as legacy does, keeping the sliders' full names for a screen reader", async () => {
    // adjustments_widget.py:71-95: "Bright:", "Contrast:", "Gamma:", "Saturate:".
    mount();
    await waitFor(() => expect(slider("Brightness")).toBeTruthy());

    const rows = ["Brightness", "Contrast", "Gamma", "Saturation"].map(
      (name) => slider(name).closest("label")?.textContent?.trim().split(/\s+/)[0],
    );
    expect(rows).toEqual(["Bright:", "Contrast:", "Gamma:", "Saturate:"]);
  });

  it("puts legacy's tooltips on the rows", async () => {
    mount();
    await waitFor(() => expect(slider("Brightness")).toBeTruthy());

    expect(slider("Brightness").closest("label")?.title).toBe("Adjust image brightness");
    expect(slider("Saturation").closest("label")?.title).toBe("Adjust image saturation (0 = grayscale)");
  });

  it("prints no explanation, not even for a negative brightness", async () => {
    // RULE-028's fold is legacy's and legacy says nothing about it; the banner this panel printed
    // was one of the paragraphs the owner asked to be rid of.
    mount({ brightness: -20 });
    await waitFor(() => expect(slider("Brightness")).toBeTruthy());

    expect(document.querySelector("p")).toBeNull();
  });
});

describe("resetting", () => {
  it("is legacy's button, offered only when something is applied", async () => {
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Reset Image Adjustments" })).toBeTruthy());

    const button = screen.getByRole("button", { name: "Reset Image Adjustments" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Reset brightness, contrast, gamma, and saturation to defaults.");
  });

  it("puts every adjustment back at once", async () => {
    const { saved } = mount({ brightness: 40, gamma: 1.5 });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Reset Image Adjustments" }) as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset Image Adjustments" }));

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

describe("Reset Annotation Settings, legacy's (CP-50)", () => {
  it("puts the annotation size, pan speed and join threshold back to their defaults", async () => {
    // annotation_settings_widget.py:100-106, 196-200: size 1.0, pan 1.0, join 2.
    const { saved } = mount({ annotation_size_multiplier: 2.5, pan_multiplier: 3, polygon_join_threshold: 9 });
    const button = await screen.findByRole("button", { name: "Reset Annotation Settings" });
    expect(button.title).toBe("Reset annotation size, pan speed, and join threshold to defaults.");

    fireEvent.click(button);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ annotation_size_multiplier: 1, pan_multiplier: 1, polygon_join_threshold: 2 });
  });
});

describe("the type-in box beside each slider, legacy's (CP-51)", () => {
  const typeInto = (name: RegExp, text: string) => {
    const box = screen.getByRole("textbox", { name }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    return box;
  };

  it("applies a typed value, clamped to the slider, as legacy's int() reads it", async () => {
    // adjustments_widget.py:150-157: int(text), clamped to -100..100.
    const { saved } = mount();
    await screen.findByRole("textbox", { name: /^Brightness/ });

    typeInto(/^Brightness/, "500");

    await waitFor(() => expect(saved.at(-1)?.["brightness"]).toBe(100));
  });

  it("reads gamma as int(float * 100), so 0.555 is 0.55", async () => {
    // adjustments_widget.py:179-187.
    const { saved } = mount();
    await screen.findByRole("textbox", { name: /^Gamma/ });

    typeInto(/^Gamma/, "0.555");

    await waitFor(() => expect(saved.at(-1)?.["gamma"]).toBe(0.55));
  });

  it("puts back the value when the text is not a number, and saves nothing", async () => {
    const { saved } = mount({ saturation: 1.2 });
    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: /^Saturation/ }) as HTMLInputElement).value).toBe("1.20"),
    );

    const box = typeInto(/^Saturation/, "lots");

    await waitFor(() => expect(box.value).toBe("1.20"));
    expect(saved).toHaveLength(0);
  });
});
