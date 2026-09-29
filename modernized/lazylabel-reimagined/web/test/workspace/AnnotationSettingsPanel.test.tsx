/**
 * Legacy's Annotation Settings group (`annotation_settings_widget.py:29-106`): Size, Pan and Join as
 * slider rows with their type-in boxes, in legacy's units, and its reset.
 *
 * Pan and Join were number fields in a Settings dialog until 2026-09-29, and the size a row under
 * Image Adjustments. That each is HONOURED once set here is tested through the shell, in
 * `test/acceptance/c13.settingsInPanels.test.tsx`: the pan step, the polygon's join, the size of
 * what is drawn.
 *
 * Names RULE-050, so the rule is traceable to the test that proves it: "given the user types 25
 * into Join, when editing finishes, then the join threshold becomes 10", and non-numeric input
 * reverts.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { AnnotationSettingsPanel } from "../../src/workspace/AnnotationSettingsPanel.jsx";
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
      <AnnotationSettingsPanel />
    </SettingsProvider>,
  );

  return { saved };
}

const slider = (name: string) => screen.getByRole("slider", { name }) as HTMLInputElement;
const typed = (name: string) => screen.getByRole("textbox", { name: `${name}, typed` }) as HTMLInputElement;
const NAMES = ["Annotation size", "Pan speed", "Join threshold"] as const;

describe("legacy's rows", () => {
  it("are Size, Pan and Join, in that order, each a slider with its box", async () => {
    mount();
    await screen.findByRole("slider", { name: "Annotation size" });

    const labels = [...document.querySelectorAll(".adjustment")].map(
      (row) => row.textContent?.trim().split(/\s+/)[0],
    );
    expect(labels).toEqual(["Size:", "Pan:", "Join:"]);
    for (const name of NAMES) expect(typed(name)).toBeTruthy();
  });

  it("have legacy's ranges and units: tenths for Size and Pan, whole pixels for Join", async () => {
    // annotation_settings_widget.py:69-93: 1..50 and 1..100 for value / 10, and 1..10.
    mount({ annotation_size_multiplier: 2.5, pan_multiplier: 3, polygon_join_threshold: 7 });
    await waitFor(() => expect(slider("Annotation size").value).toBe("25"));

    expect([slider("Annotation size").min, slider("Annotation size").max]).toEqual(["1", "50"]);
    expect([slider("Pan speed").min, slider("Pan speed").max, slider("Pan speed").value]).toEqual(["1", "100", "30"]);
    expect([slider("Join threshold").min, slider("Join threshold").max, slider("Join threshold").value]).toEqual([
      "1",
      "10",
      "7",
    ]);
    expect(NAMES.map((name) => typed(name).value)).toEqual(["2.5", "3.0", "7"]);
  });

  it("carry legacy's tooltips, and print no paragraph", async () => {
    mount();
    await screen.findByRole("slider", { name: "Annotation size" });

    expect(slider("Annotation size").closest("label")?.title).toBe("Adjusts the size of points and lines");
    expect(slider("Pan speed").closest("label")?.title).toBe("Adjusts the speed of WASD panning.");
    expect(slider("Join threshold").closest("label")?.title).toBe("The pixel distance to 'snap' a polygon closed.");
    expect(document.querySelector("p")).toBeNull();
  });
});

describe("each saves its setting", () => {
  it.each([
    ["Annotation size", "25", "annotation_size_multiplier", 2.5],
    ["Pan speed", "20", "pan_multiplier", 2],
    ["Join threshold", "5", "polygon_join_threshold", 5],
  ] as const)("from the %s slider", async (name, value, key, expected) => {
    const { saved } = mount();
    await screen.findByRole("slider", { name });

    fireEvent.change(slider(name), { target: { value } });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.[key]).toBe(expected);
  });
});

describe("RULE-050: a typed value is clamped when editing finishes", () => {
  const typeInto = (name: string, text: string, finish: "Enter" | "blur" = "blur") => {
    const box = typed(name);
    fireEvent.change(box, { target: { value: text } });
    if (finish === "Enter") fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    else fireEvent.blur(box);
    return box;
  };

  it("turns 25 in the join threshold into 10", async () => {
    const { saved } = mount();
    await screen.findByRole("slider", { name: "Join threshold" });

    typeInto("Join threshold", "25");

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.["polygon_join_threshold"]).toBe(10);
  });

  it("holds pan speed to 0.1 at the bottom, and the size to 5.0 at the top", async () => {
    // int(float(text) * 10), clamped to the slider (annotation_settings_widget.py:129-153).
    const { saved } = mount();
    await screen.findByRole("slider", { name: "Pan speed" });

    typeInto("Pan speed", "0");
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.["pan_multiplier"]).toBe(0.1);

    typeInto("Annotation size", "9", "Enter");
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]?.["annotation_size_multiplier"]).toBe(5);
  });

  it("turns 0.05 in Size into 0.1, the rule's own edge case", async () => {
    // int(0.05 * 10) is 0, and the slider's floor is 1 (annotation_settings_widget.py:129-137).
    const { saved } = mount({ annotation_size_multiplier: 2 });
    await waitFor(() => expect(typed("Annotation size").value).toBe("2.0"));

    typeInto("Annotation size", "0.05");

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.["annotation_size_multiplier"]).toBe(0.1);
  });

  it("reverts what is not a number, and a fraction in Join, saving nothing", async () => {
    // Legacy's int(text) refuses "2.5" for Join as it refuses "lots" (annotation_settings_widget
    // .py:160-167).
    const { saved } = mount();
    await screen.findByRole("slider", { name: "Pan speed" });

    const pan = typeInto("Pan speed", "lots");
    const join = typeInto("Join threshold", "2.5");

    await waitFor(() => expect([pan.value, join.value]).toEqual(["1.0", "2"]));
    expect(saved).toHaveLength(0);
  });

  it("applies a typed value on Enter, as legacy's editingFinished does, and keeps the field", async () => {
    const { saved } = mount();
    await screen.findByRole("slider", { name: "Join threshold" });
    const join = typed("Join threshold");
    join.focus();

    typeInto("Join threshold", "4", "Enter");

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.["polygon_join_threshold"]).toBe(4);
    expect(document.activeElement).toBe(join);
    expect(join.value).toBe("4");
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

describe("a settings file that holds nonsense", () => {
  it("shows the defaults rather than an empty or runaway slider", async () => {
    mount({ annotation_size_multiplier: "huge", pan_multiplier: -3, polygon_join_threshold: null });
    await screen.findByRole("slider", { name: "Annotation size" });

    expect(NAMES.map((name) => slider(name).value)).toEqual(["10", "10", "2"]);
  });
});
