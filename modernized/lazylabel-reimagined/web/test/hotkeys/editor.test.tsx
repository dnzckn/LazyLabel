/**
 * The hotkey editor -- C13's interface, and RULE-049 as a user meets it.
 *
 * Mounted the way `main.tsx` mounts the app: the bindings come FROM the stored settings, so a
 * rebinding saved here is the one the dispatcher uses on the next keystroke. That is the claim
 * worth testing end to end, because an editor whose saves never reached the key map would look
 * exactly like a working one.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyEditor } from "../../src/hotkeys/HotkeyEditor.jsx";
import { HotkeyProvider, useHotkey } from "../../src/hotkeys/HotkeyProvider.jsx";
import { SettingsProvider, useSettings } from "../../src/settings/SettingsProvider.jsx";

afterEach(cleanup);

/** Bindings from settings, exactly as `main.tsx` wires them. */
function Bound({ children }: { readonly children: ReactNode }): ReactNode {
  const { settings } = useSettings();
  return <HotkeyProvider bindings={settings.hotkeys}>{children}</HotkeyProvider>;
}

/** Something listening on an action, so a test can see which keys reach it. */
function Listener({ action, onFire }: { readonly action: string; readonly onFire: () => void }): ReactNode {
  useHotkey(action, onFire);
  return null;
}

function mount(options: {
  confirm?: (message: string) => boolean;
  putSettings?: (next: StoredSettings) => Promise<unknown>;
  listen?: { action: string; onFire: () => void };
} = {}) {
  const saved: StoredSettings[] = [];
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings:
      options.putSettings
      ?? (async (next: StoredSettings) => {
        saved.push(next);
        return next;
      }),
  } as unknown as ApiClient;

  render(
    <SettingsProvider client={client}>
      <Bound>
        {options.listen && <Listener action={options.listen.action} onFire={options.listen.onFire} />}
        <HotkeyEditor {...(options.confirm ? { confirm: options.confirm } : {})} />
      </Bound>
    </SettingsProvider>,
  );
  return { saved };
}

async function keyField(action: string, slot: "Key" | "Alternate key" = "Key"): Promise<HTMLInputElement> {
  return (await screen.findByLabelText(`${slot} for ${action}`)) as HTMLInputElement;
}

/** Click a field, then press a key in it, the way a user rebinds. */
async function rebind(
  action: string,
  press: { code: string; key: string; ctrlKey?: boolean; shiftKey?: boolean },
  slot: "Key" | "Alternate key" = "Key",
): Promise<HTMLInputElement> {
  const field = await keyField(action, slot);
  fireEvent.click(field);
  expect(field.value).toBe("Press a key (Esc to cancel)");
  fireEvent.keyDown(field, press);
  return field;
}

describe("rebinding a key", () => {
  it("saves the new key, and the table shows it", async () => {
    const { saved } = mount();

    const field = await rebind("merge_segments", { code: "F9", key: "F9" });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.hotkeys["merge_segments"]).toEqual({ primary: "F9", secondary: null });
    await waitFor(() => expect(field.value).toBe("F9"));
  });

  it("takes effect on the next keystroke, without a reload", async () => {
    // The end-to-end claim: the saved binding reaches the dispatcher. F9 did nothing before.
    const onFire = vi.fn();
    const { saved } = mount({ listen: { action: "fit_view", onFire } });

    const field = await rebind("fit_view", { code: "F9", key: "F9" });
    await waitFor(() => expect(saved).toHaveLength(1));
    // The field showing F9 means the STORED settings changed and re-rendered, which is what rebuilds
    // the dispatcher's key map. The API having been called is not enough to press the key yet.
    await waitFor(() => expect(field.value).toBe("F9"));

    document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "F9", key: "F9", bubbles: true }));
    await waitFor(() => expect(onFire).toHaveBeenCalledTimes(1));
  });

  it("records modifiers the way legacy writes them", async () => {
    const { saved } = mount();

    await rebind("merge_segments", { code: "F9", key: "F9", ctrlKey: true, shiftKey: true });

    await waitFor(() => expect(saved[0]!.hotkeys["merge_segments"]!.primary).toBe("Ctrl+Shift+F9"));
  });

  it("keeps waiting when only a modifier is pressed", async () => {
    // A bare Ctrl is not a binding; it is the start of one.
    const { saved } = mount();

    const field = await rebind("merge_segments", { code: "ControlLeft", key: "Control", ctrlKey: true });

    expect(field.value).toBe("Press a key (Esc to cancel)");
    expect(saved).toHaveLength(0);
  });

  it("cancels on Escape and changes nothing", async () => {
    const { saved } = mount();

    const field = await rebind("merge_segments", { code: "Escape", key: "Escape" });

    expect(field.value).toBe("M");
    expect(saved).toHaveLength(0);
    // Silently. Esc is bound to another action, so treating it as a KEY would also leave M in
    // place -- refused as a conflict, with a warning. Only a cancel says nothing.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not ALSO run the action whose key is being pressed", async () => {
    // Pressing "." to bind it somewhere must not fit the view. The field is a text input, which the
    // dispatcher ignores -- the same rule that lets a class name contain a V.
    const onFire = vi.fn();
    mount({ listen: { action: "fit_view", onFire } });

    await rebind("merge_segments", { code: "Period", key: "." });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onFire).not.toHaveBeenCalled();
  });
});

describe("RULE-049: a key another action holds is refused", () => {
  it("names the action that holds it, and saves nothing", async () => {
    const { saved } = mount();

    // M is Merge Selected Segments' key.
    await rebind("delete_segments", { code: "KeyM", key: "m" });

    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("M is already used by Merge Selected Segments");
    expect(saved).toHaveLength(0);
  });

  it("reverts the field to the binding that is still in force", async () => {
    mount();

    const field = await rebind("delete_segments", { code: "KeyM", key: "m" });

    // RULE-049's "the field reverts": it shows V, the key that still deletes -- and still does
    // after a save would have landed, which is when a refusal that did not refuse would show.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(field.value).toBe("V");
  });

  it("allows an action its own current key", async () => {
    // Not a conflict with itself.
    const { saved } = mount();

    await rebind("merge_segments", { code: "KeyM", key: "m" });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the alternate key", () => {
  it("can be cleared, which legacy's dialog had no way to do", async () => {
    const { saved } = mount();

    fireEvent.click(await screen.findByRole("button", { name: "Clear the alternate key for redo" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.hotkeys["redo"]).toEqual({ primary: "Ctrl+Y", secondary: null });
  });

  it("can be set, and is held to the same conflict rule", async () => {
    const { saved } = mount();

    await rebind("redo", { code: "KeyZ", key: "z", ctrlKey: true }, "Alternate key");

    // Ctrl+Z is Undo's.
    expect((await screen.findByRole("status")).textContent).toContain("already used by Undo Last Action");
    expect(saved).toHaveLength(0);
  });

  it("offers no Clear when there is nothing to clear", async () => {
    mount();

    const clear = await screen.findByRole("button", { name: "Clear the alternate key for undo" });

    expect((clear as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("what cannot be rebound", () => {
  it("shows mouse actions without a field to change them", async () => {
    mount();
    const table = await screen.findByRole("table");

    const row = within(table).getByRole("row", { name: /left_click/ });

    expect(within(row).queryByRole("textbox")).toBeNull();
    expect(row.textContent).toContain("Left Click");
  });
});

describe("Reset to defaults", () => {
  it("asks first, and a No changes nothing", async () => {
    const confirm = vi.fn(() => false);
    const { saved } = mount({ confirm });

    fireEvent.click(await screen.findByRole("button", { name: "Reset to defaults" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(0);
  });

  it("saves the defaults on a Yes", async () => {
    const { saved } = mount({ confirm: () => true });

    fireEvent.click(await screen.findByRole("button", { name: "Reset to defaults" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.hotkeys).toEqual(defaultSettings().hotkeys);
  });
});

describe("when the save fails", () => {
  it("says so, and the old key stays on screen and in force", async () => {
    mount({
      putSettings: async () => {
        throw new Error("the API is unreachable");
      },
    });

    const field = await rebind("merge_segments", { code: "F9", key: "F9" });

    expect((await screen.findByRole("status")).textContent).toContain(
      "could not be saved: the API is unreachable. Nothing changed.",
    );
    expect(field.value).toBe("M");
  });
});
