/**
 * The settings editor -- the twelve keys the app read and no control set (found 2026-09-23).
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
    const join = await field("Join threshold (pixels)");

    fireEvent.change(join, { target: { value: "25" } });
    fireEvent.blur(join);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["polygon_join_threshold"]).toBe(10);
  });

  it("holds pan speed to 0.1 at the bottom", async () => {
    const { saved } = mount();
    const pan = await field("Pan speed");

    fireEvent.change(pan, { target: { value: "0" } });
    fireEvent.blur(pan);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["pan_multiplier"]).toBe(0.1);
  });

  it("reverts non-numeric input and saves nothing", async () => {
    const { saved } = mount();
    const pan = await field("Pan speed");

    fireEvent.change(pan, { target: { value: "" } });
    fireEvent.blur(pan);

    expect(pan.value).toBe(String(defaultSettings().values["pan_multiplier"]));
    expect(saved).toHaveLength(0);
  });
});

describe("the switches a new user could not reach", () => {
  it("turns Operate On View on (RULE-089)", async () => {
    const { saved } = mount();

    fireEvent.click(await screen.findByLabelText(/Operate On View/));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["operate_on_view"]).toBe(true);
  });

  it("turns pixel priority on, and offers its direction only once it is (RULE-012)", async () => {
    const { saved } = mount();
    const direction = (await screen.findByLabelText("The lower class id wins")) as HTMLInputElement;
    expect(direction.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Give each pixel to one class"));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["pixel_priority_enabled"]).toBe(true);
    await waitFor(() => expect(direction.disabled).toBe(false));
  });

  it("hides a file-list column", async () => {
    const { saved } = mount();
    const coco = (await screen.findByLabelText("_coco.json")) as HTMLInputElement;
    const before = coco.checked;

    fireEvent.click(coco);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.values["file_manager_show_coco"]).toBe(!before);
  });
});
