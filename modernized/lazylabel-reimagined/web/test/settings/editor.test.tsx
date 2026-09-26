/**
 * The settings editor -- the six keys the app read and no control set (found 2026-09-23).
 *
 * RULE-050 is the rule with a specification: "given the user types 25 into Join, when editing
 * finishes, then the join threshold becomes 10", and non-numeric input reverts.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { SettingsEditor } from "../../src/settings/SettingsEditor.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";

afterEach(cleanup);

function mount() {
  const saved: StoredSettings[] = [];
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: StoredSettings) => {
      saved.push(next);
      return next;
    },
  } as unknown as ApiClient;
  render(
    <SettingsProvider client={client}>
      <SettingsEditor />
    </SettingsProvider>,
  );
  return { saved };
}

async function field(label: string): Promise<HTMLInputElement> {
  return (await screen.findByLabelText(label)) as HTMLInputElement;
}

describe("RULE-050: typed values are clamped when editing finishes", () => {
  it("turns 25 in the join threshold into 10", async () => {
    const { saved } = mount();
    const join = await field("Join");

    fireEvent.change(join, { target: { value: "25" } });
    fireEvent.blur(join);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["polygon_join_threshold"]).toBe(10);
  });

  it("holds pan speed to 0.1 at the bottom", async () => {
    const { saved } = mount();
    const pan = await field("Pan");

    fireEvent.change(pan, { target: { value: "0" } });
    fireEvent.blur(pan);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["pan_multiplier"]).toBe(0.1);
  });

  it("reverts non-numeric input and saves nothing", async () => {
    const { saved } = mount();
    const pan = await field("Pan");

    fireEvent.change(pan, { target: { value: "" } });
    fireEvent.blur(pan);

    expect(pan.value).toBe(String(defaultSettings().values["pan_multiplier"]));
    expect(saved).toHaveLength(0);
  });
});

describe("RULE-026: the streaming window", () => {
  it("snaps to a multiple of 50 and stays within 50-1000", async () => {
    const { saved } = mount();
    const window = await field("Window");

    fireEvent.change(window, { target: { value: "1234" } });
    fireEvent.blur(window);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["stream_window_size"]).toBe(1000);

    // The same field, still focused: it holds the typing, not a remount keyed on the value.
    const again = await field("Window");
    fireEvent.change(again, { target: { value: "320" } });
    fireEvent.blur(again);
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]!.values["stream_window_size"]).toBe(300);
  });
});

describe("the switches a new user could not reach", () => {
  it("turns Operate On View on (RULE-089)", async () => {
    const { saved } = mount();

    fireEvent.click(await screen.findByLabelText("Operate On View"));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["operate_on_view"]).toBe(true);
  });

  it("turns pixel priority on, and offers its direction only once it is (RULE-012)", async () => {
    const { saved } = mount();
    const ascending = (await screen.findByLabelText("Ascending")) as HTMLInputElement;
    const descending = screen.getByLabelText("Descending") as HTMLInputElement;
    // Legacy's pair: Ascending by default, both greyed out until the switch is on.
    expect(ascending.checked).toBe(true);
    expect(ascending.disabled && descending.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Enable Pixel Priority"));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["pixel_priority_enabled"]).toBe(true);
    await waitFor(() => expect(descending.disabled).toBe(false));

    fireEvent.click(descending);

    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]!.values["pixel_priority_ascending"]).toBe(false);
  });

  it("holds no second switch for a file-list column; the Columns chooser beside the list has it", async () => {
    mount();
    await screen.findByLabelText("Pan");

    expect(screen.queryByLabelText("_coco.json")).toBeNull();
  });
});

describe("what the dialog shows (the owner, 2026-09-26)", () => {
  it("is legacy's labels and controls, with its tooltips, and no paragraph of explanation", async () => {
    // "have you ever seen a gui with a paragraph there written to it" -- legacy's widgets carry
    // their explanation in a tooltip, and so does this.
    mount();
    const pan = await field("Pan");
    const dialog = pan.closest("section")!;

    expect(dialog.querySelectorAll("p")).toHaveLength(0);
    expect(pan.closest("label")!.title).toBe("Adjusts the speed of WASD panning.");
    expect(screen.getByLabelText("Join").closest("label")!.title).toBe(
      "The pixel distance to 'snap' a polygon closed.",
    );
    expect(screen.getByLabelText("Operate On View").closest("label")!.title).toMatch(
      /^If checked, SAM model will operate on the currently displayed \(adjusted\) image\./,
    );
    expect(screen.getByLabelText("Enable Pixel Priority").closest("label")!.title).toBe(
      "Control pixel ownership when multiple classes overlap",
    );
  });

  it("applies a typed value on Enter, as legacy's editingFinished does, and keeps the field", async () => {
    const { saved } = mount();
    const join = await field("Join");
    join.focus();

    fireEvent.change(join, { target: { value: "4" } });
    fireEvent.keyDown(join, { key: "Enter" });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["polygon_join_threshold"]).toBe(4);
    // Still the field being typed in: it is not remounted by its own save.
    expect(document.activeElement).toBe(join);
    expect(join.value).toBe("4");
  });
});
