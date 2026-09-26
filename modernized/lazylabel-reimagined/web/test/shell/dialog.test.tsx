/**
 * The modal the hotkey editor opens in.
 *
 * What jsdom can check is checked here: the keyboard contract and the page going inert. What it
 * cannot -- inert actually blurring the opener, which is why the dialog reads its opener during the
 * first render -- was found and checked in the browser on 2026-09-23.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyEditor } from "../../src/hotkeys/HotkeyEditor.jsx";
import { HotkeyProvider, useHotkey } from "../../src/hotkeys/HotkeyProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { Dialog } from "../../src/shell/Dialog.jsx";

afterEach(cleanup);

function Listener({ action, onFire }: { readonly action: string; readonly onFire: () => void }): ReactNode {
  useHotkey(action, onFire);
  return null;
}

/**
 * A page with a button that opens the hotkey editor in the dialog, composed as `App` composes it:
 * the editor draws the Close, on one row with Reset to Defaults.
 */
function Page({ onFire }: { readonly onFire: () => void }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <main inert={open}>
        <button type="button" onClick={() => setOpen(true)}>
          Show hotkeys
        </button>
      </main>
      <Listener action="fit_view" onFire={onFire} />
      {open && (
        <Dialog title="Hotkey Configuration" onClose={() => setOpen(false)} closeButton={false}>
          <HotkeyEditor onClose={() => setOpen(false)} />
        </Dialog>
      )}
    </>
  );
}

function mount() {
  const onFire = vi.fn();
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
  } as unknown as ApiClient;
  render(
    <SettingsProvider client={client}>
      <HotkeyProvider bindings={defaultSettings().hotkeys}>
        <Page onFire={onFire} />
      </HotkeyProvider>
    </SettingsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show hotkeys" }));
  return { onFire };
}

describe("the hotkey dialog", () => {
  it("opens as a modal named as legacy's window is", async () => {
    mount();

    // `hotkey_dialog.py:149`.
    const dialog = await screen.findByRole("dialog", { name: "Hotkey Configuration" });

    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("draws one Close, on the row with Reset to Defaults", async () => {
    // Legacy's buttons share one row (`hotkey_dialog.py:182-206`). The dialog's own Close would
    // have been a second one, on a row of its own below.
    mount();
    await screen.findByRole("dialog");

    const closes = screen.getAllByRole("button", { name: "Close" });

    expect(closes).toHaveLength(1);
    expect(closes[0]!.parentElement!.textContent).toContain("Reset to Defaults");
  });

  it("takes focus when it opens", async () => {
    mount();

    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("makes the page behind it inert, and gives it back on close", async () => {
    // Inert is what stops Tab from walking out into a page that would then take the keystrokes.
    mount();
    await screen.findByRole("dialog");
    const page = document.querySelector("main")!;

    expect(page.hasAttribute("inert")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(page.hasAttribute("inert")).toBe(false);
  });

  it("closes on Escape", async () => {
    mount();
    const dialog = await screen.findByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does NOT close on the Escape that cancels a key capture", async () => {
    // Cancelling one key should not throw away the whole dialog.
    mount();
    fireEvent.click(await screen.findByRole("tab", { name: "Actions" }));
    const field = screen.getByLabelText("Primary key for Undo");

    fireEvent.click(field);
    fireEvent.keyDown(field, { key: "Escape", code: "Escape" });

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((field as HTMLInputElement).value).toBe("Ctrl+Z");
  });

  it("makes the page inert ITSELF when modal, for an owner that cannot reach the page's root", async () => {
    // The Rescale section's histogram dialog opens deep in a panel, as legacy's opens modal
    // (main_window.py:2807). Everything else in the body goes inert, and only what it made inert
    // comes back.
    function Deep(): ReactNode {
      const [open, setOpen] = useState(true);
      return open ? (
        <Dialog title="Rescale Histogram" onClose={() => setOpen(false)} modal>
          <p>inside</p>
        </Dialog>
      ) : null;
    }
    const already = document.createElement("div");
    already.setAttribute("inert", "");
    document.body.append(already);
    const { container } = render(<Deep />);

    const dialog = await screen.findByRole("dialog", { name: "Rescale Histogram" });
    expect(container.hasAttribute("inert")).toBe(true);
    expect(dialog.closest("[inert]")).toBeNull();

    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(container.hasAttribute("inert")).toBe(false);
    expect(already.hasAttribute("inert")).toBe(true);
    already.remove();
  });

  it("keeps its keystrokes from the page's hotkeys", async () => {
    // "." is fit_view's key. Pressed on the dialog -- on its Close button, say -- it must not fit the
    // view behind it.
    const { onFire } = mount();
    const close = await screen.findByRole("button", { name: "Close" });

    fireEvent.keyDown(close, { key: ".", code: "Period" });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onFire).not.toHaveBeenCalled();
  });
});
