/**
 * Legacy's Application Settings group (`settings_widget.py:33-110`): its controls, in its order,
 * with its words, each saving its setting.
 *
 * Operate On View and pixel priority were reachable only through a Settings dialog from 2026-09-23
 * until 2026-09-29, when the owner did not find them. That each is HONOURED once set here is tested
 * through the shell: `test/acceptance/c13.settingsInPanels.test.tsx` for pixel priority, and
 * `c3.aiSegment.test.tsx` for Operate On View, whose effect is on the AI service's request.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { summaryOf } from "../../src/dataset/ExportFormats.jsx";
import { ApplicationSettings } from "../../src/settings/ApplicationSettings.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";

afterEach(cleanup);

function mount(values: Record<string, unknown> = {}) {
  const saved: StoredSettings[] = [];
  const client = {
    getSettings: async () => {
      const base = defaultSettings();
      return { ...base, values: { ...base.values, ...values } };
    },
    putSettings: async (next: StoredSettings) => {
      saved.push(next);
      return next;
    },
  } as unknown as ApiClient;
  render(
    <SettingsProvider client={client}>
      <ApplicationSettings />
    </SettingsProvider>,
  );
  return { saved };
}

const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("legacy's group", () => {
  it("holds legacy's controls in legacy's order", async () => {
    // settings_widget.py:38-110: the checkbox, the formats row, two checkboxes, the pair, the button.
    mount();
    await screen.findByLabelText("Operate On View");
    const group = document.querySelector(".app-settings")!;

    const order = [...group.children].flatMap((child) =>
      child.classList.contains("formats")
        ? [child.querySelector(".formats__label")?.textContent]
        : child.classList.contains("app-settings__indent")
          ? [...child.querySelectorAll("label")].map((label) => label.textContent?.trim())
          : [child.textContent?.trim()],
    );
    expect(order).toEqual([
      "Auto-Save on Navigate",
      "Export Formats:",
      "Operate On View",
      "Enable Pixel Priority",
      "Ascending",
      "Descending",
      "Reset to Default",
    ]);
  });

  it("uses legacy's control for each: checkboxes, a radio pair, a dropdown and a button", async () => {
    mount();
    await screen.findByLabelText("Operate On View");

    for (const label of ["Auto-Save on Navigate", "Operate On View", "Enable Pixel Priority"]) {
      expect(box(label).type, label).toBe("checkbox");
    }
    expect([box("Ascending").type, box("Descending").type]).toEqual(["radio", "radio"]);
    expect(box("Ascending").name).toBe(box("Descending").name);
    // A dropdown whose text sums up the choice (export_format_widget.py:16-44, 76-92).
    expect(document.querySelector(".formats details > summary")?.textContent).toBe("NPZ, YOLO Det");
    expect(screen.getByRole("button", { name: "Reset to Default" })).toBeTruthy();
  });

  it("puts legacy's tooltips on them, and prints no paragraph", async () => {
    // settings_widget.py:59-86. What each does is its tooltip (the owner, 2026-09-26).
    mount();
    await screen.findByLabelText("Operate On View");

    expect(box("Operate On View").closest("label")!.title).toBe(
      "If checked, SAM model will operate on the currently displayed (adjusted) image.\nOtherwise, it operates on the original image.",
    );
    expect(box("Enable Pixel Priority").closest("label")!.title).toBe(
      "Control pixel ownership when multiple classes overlap",
    );
    expect(box("Ascending").closest("label")!.title).toBe("Lower class indices take priority over higher ones");
    expect(box("Descending").closest("label")!.title).toBe("Higher class indices take priority over lower ones");
    expect(document.querySelector(".formats details")!.getAttribute("title")).toBe(
      "Select which annotation formats to save.\nAt least one format must be selected.",
    );
    expect(document.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("each saves its setting", () => {
  it("Auto-Save on Navigate", async () => {
    const { saved } = mount();
    await screen.findByLabelText("Auto-Save on Navigate");
    expect(box("Auto-Save on Navigate").checked).toBe(true);

    fireEvent.click(box("Auto-Save on Navigate"));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["auto_save"]).toBe(false);
  });

  it("Operate On View (RULE-089)", async () => {
    const { saved } = mount();

    fireEvent.click(await screen.findByLabelText("Operate On View"));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["operate_on_view"]).toBe(true);
  });

  it("pixel priority, whose direction is offered only once it is on (RULE-012)", async () => {
    const { saved } = mount();
    const ascending = (await screen.findByLabelText("Ascending")) as HTMLInputElement;
    const descending = box("Descending");
    // Legacy's pair: Ascending by default, both greyed out until the switch is on
    // (settings_widget.py:99-102, 142-146).
    expect(ascending.checked).toBe(true);
    expect(ascending.disabled && descending.disabled).toBe(true);

    fireEvent.click(box("Enable Pixel Priority"));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["pixel_priority_enabled"]).toBe(true);
    await waitFor(() => expect(descending.disabled).toBe(false));

    fireEvent.click(descending);

    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]!.values["pixel_priority_ascending"]).toBe(false);
    expect(descending.checked).toBe(true);
  });

  it("shows a stored Descending as chosen", async () => {
    mount({ pixel_priority_enabled: true, pixel_priority_ascending: false });

    await waitFor(() => expect(box("Descending").checked).toBe(true));
    expect(box("Ascending").checked).toBe(false);
    expect(box("Descending").disabled).toBe(false);
  });
});

describe("Export Formats, legacy's dropdown", () => {
  const summary = () => document.querySelector(".formats details > summary")?.textContent;

  it("sums up the choice as legacy's does, and changes with it", async () => {
    // export_format_widget.py:76-92, in the menu's order whatever order they were ticked in.
    const { saved } = mount({ export_formats: ["YOLO_DETECTION", "NPZ"] });
    await waitFor(() => expect(summary()).toBe("NPZ, YOLO Det"));

    fireEvent.click(screen.getByRole("checkbox", { name: "Pascal VOC" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["export_formats"]).toEqual(["YOLO_DETECTION", "NPZ", "PASCAL_VOC"]);
    await waitFor(() => expect(summary()).toBe("3 formats"));
  });

  it("words each count as legacy does", () => {
    expect(summaryOf(["NPZ"])).toBe("NPZ");
    expect(summaryOf(["CREATEML", "NPZ_CLASS_MAP"])).toBe("NPZ CM, CML");
    expect(summaryOf(["NPZ", "COCO_JSON", "PASCAL_VOC"])).toBe("3 formats");
    expect(
      summaryOf(["NPZ", "NPZ_CLASS_MAP", "YOLO_DETECTION", "YOLO_SEGMENTATION", "COCO_JSON", "PASCAL_VOC", "CREATEML"]),
    ).toBe("All formats");
    expect(summaryOf([])).toBe("(none)");
  });

  it("closes on a press elsewhere, as a menu does", async () => {
    mount();
    await waitFor(() => expect(summary()).toBe("NPZ, YOLO Det"));
    const dropdown = document.querySelector(".formats details") as HTMLDetailsElement;
    dropdown.open = true;

    // Inside it, it stays open: that is a format being ticked.
    fireEvent.pointerDown(screen.getByRole("checkbox", { name: "COCO JSON" }));
    expect(dropdown.open).toBe(true);

    fireEvent.pointerDown(box("Operate On View"));
    expect(dropdown.open).toBe(false);
  });
});
