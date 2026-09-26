/**
 * The hotkey editor -- C13's interface, RULE-049 as a user meets it, and legacy's hotkey dialog.
 *
 * Mounted the way `main.tsx` mounts the app: the bindings come FROM the stored settings, so a
 * rebinding saved here is the one the dispatcher uses on the next keystroke. That is the claim
 * worth testing end to end, because an editor whose saves never reached the key map would look
 * exactly like a working one.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyEditor } from "../../src/hotkeys/HotkeyEditor.jsx";
import { HotkeyProvider, useHotkey } from "../../src/hotkeys/HotkeyProvider.jsx";
import { SettingsProvider, useSettings } from "../../src/settings/SettingsProvider.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Legacy's dialog, row by row: what `HotkeyDialog` rendered for the default bindings when it was
 * built offscreen with the legacy venv and read back cell by cell. The tabs are
 * `hotkey_dialog.py:283-308`, the cells 233-271, and the actions `config/hotkeys.py:34-192`.
 * Each row is Action, Description, Primary Key, Secondary Key.
 */
const LEGACY_DIALOG: readonly (readonly [string, readonly (readonly [string, string, string, string])[]])[] = [
  [
    "Modes",
    [
      ["Sam Mode", "AI Mode (Points + Box)", "1", ""],
      ["Polygon Mode", "Polygon Mode", "2", ""],
      ["Bbox Mode", "Bounding Box Mode", "3", ""],
      ["Circle Mode", "Circle Mode", "4", ""],
      ["Selection Mode", "Selection Mode", "E", ""],
      ["Pan Mode", "Pan Mode", "Q", ""],
      ["Edit Mode", "Edit Mode", "R", ""],
    ],
  ],
  [
    "Actions",
    [
      ["Clear Points", "Clear Points/Vertices", "C", ""],
      ["Save Segment", "Save Current Segment", "Space", ""],
      ["Erase Segment", "Erase with Current Segment", "Shift+Space", ""],
      ["Save Output", "Save Output", "Return", ""],
      ["Save Output Alt", "Save Output (Alt)", "Enter", ""],
      ["Undo", "Undo Last Action", "Ctrl+Z", ""],
      ["Redo", "Redo Last Action", "Ctrl+Y", "Ctrl+Shift+Z"],
      ["Escape", "Cancel/Clear Selection", "Escape", ""],
      ["Toggle Ai Filter", "Toggle AI Filter", "Z", ""],
    ],
  ],
  [
    "Navigation",
    [
      ["Load Next Image", "Load Next Image", "Right", ""],
      ["Load Previous Image", "Load Previous Image", "Left", ""],
      ["Fit View", "Fit View", ".", ""],
    ],
  ],
  [
    "Segments",
    [
      ["Merge Segments", "Merge Selected Segments", "M", ""],
      ["Delete Segments", "Delete Selected Segments", "V", ""],
      ["Delete Segments Alt", "Delete Selected Segments (Alt)", "Backspace", ""],
      ["Select All", "Select All Segments", "Ctrl+A", ""],
      ["Convert To Polygons", "Toggle Auto-Convert AI to Polygon", "P", ""],
    ],
  ],
  [
    "View",
    [
      ["Zoom In", "Zoom In", "Ctrl+Plus", ""],
      ["Zoom Out", "Zoom Out", "Ctrl+Minus", ""],
    ],
  ],
  [
    "Movement",
    [
      ["Pan Up", "Pan Up", "W", ""],
      ["Pan Down", "Pan Down", "S", ""],
      ["Pan Left", "Pan Left", "A", ""],
      ["Pan Right", "Pan Right", "D", ""],
    ],
  ],
  [
    "Mouse",
    [
      ["Left Click", "AI: Point (click) / Box (drag) / Select", "Left Click", ""],
      ["Right Click", "Add Negative Point", "Right Click", ""],
      ["Mouse Drag", "Drag/Pan", "Mouse Drag", ""],
    ],
  ],
  ["Classes", [["Toggle Recent Class", "Toggle Recent Class", "X", ""]]],
  [
    "Sequence",
    [
      ["Add Reference Frame", "Add Current Frame as Reference", "G", ""],
      ["Next Flagged Frame", "Next Flagged Frame", "N", ""],
      ["Prev Flagged Frame", "Previous Flagged Frame", "Shift+N", ""],
      ["Next Reference Frame", "Next Reference Frame", "B", ""],
      ["Prev Reference Frame", "Previous Reference Frame", "Shift+B", ""],
      ["Next Suggested Frame", "Next Archetype Frame", "H", ""],
      ["Prev Suggested Frame", "Previous Archetype Frame", "Shift+H", ""],
      ["Find Archetypes", "Find Archetypes", "Ctrl+H", ""],
      ["Propagate", "Start Propagation", "Ctrl+P", ""],
    ],
  ],
];

/** The tab legacy's dialog shows each action on, so a test goes where a user would. */
const TAB_OF = new Map(LEGACY_DIALOG.flatMap(([tab, rows]) => rows.map(([name]) => [name, tab] as const)));

const PROMPT = "Press a key (Esc to cancel)";

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
  onClose?: () => void;
  putSettings?: (next: StoredSettings) => Promise<unknown>;
  listen?: { action: string; onFire: () => void };
  stored?: StoredSettings;
} = {}) {
  const saved: StoredSettings[] = [];
  const client = {
    getSettings: async () => options.stored ?? defaultSettings(),
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
        <HotkeyEditor
          {...(options.confirm ? { confirm: options.confirm } : {})}
          {...(options.onClose ? { onClose: options.onClose } : {})}
        />
      </Bound>
    </SettingsProvider>,
  );
  return { saved };
}

/** Choose a tab, as a user clicks it. */
async function openTab(name: string): Promise<void> {
  fireEvent.click(await screen.findByRole("tab", { name }));
}

/** The chosen tab's table. The other panels are hidden, so there is exactly one. */
function shownTable(): HTMLElement {
  return screen.getByRole("table");
}

/** An action's key field, found the way a user finds it: on its tab, by legacy's name for it. */
async function keyField(name: string, slot: "Primary" | "Secondary" = "Primary"): Promise<HTMLInputElement> {
  const tab = TAB_OF.get(name);
  if (tab === undefined) throw new Error(`legacy's dialog has no row called ${name}`);
  await openTab(tab);
  return within(screen.getByRole("tabpanel")).getByLabelText(`${slot} key for ${name}`) as HTMLInputElement;
}

/** Click a field, then press a key in it, the way a user rebinds. */
async function rebind(
  name: string,
  press: { code: string; key: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean },
  slot: "Primary" | "Secondary" = "Primary",
): Promise<HTMLInputElement> {
  const field = await keyField(name, slot);
  fireEvent.click(field);
  expect(field.value).toBe(PROMPT);
  fireEvent.keyDown(field, press);
  return field;
}

describe("legacy's tabs", () => {
  it("are legacy's categories, in legacy's order, opening on the first", async () => {
    mount();

    const list = await screen.findByRole("tablist", { name: "Hotkey categories" });

    expect(within(list).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(
      LEGACY_DIALOG.map(([tab]) => tab),
    );
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Modes");
  });

  it("each hold legacy's rows, in legacy's order, under legacy's columns", async () => {
    mount();

    for (const [tab, rows] of LEGACY_DIALOG) {
      await openTab(tab);
      const table = shownTable();

      expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
        "Action",
        "Description",
        "Primary Key",
        "Secondary Key",
      ]);
      const shown = within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => {
          const cells = row.querySelectorAll("th, td");
          const keys = row.querySelectorAll("input");
          return [cells[0]!.textContent, cells[1]!.textContent, keys[0]!.value, keys[1]!.value];
        });
      expect(shown, tab).toEqual(rows);
    }
  });

  it("never name an action by its id", async () => {
    // Legacy titles the id, so `toggle_ai_filter` reads "Toggle Ai Filter". An id with its
    // underscores is what the flat table showed.
    mount();

    for (const [tab] of LEGACY_DIALOG) {
      await openTab(tab);
      expect(shownTable().textContent, tab).not.toMatch(/[a-z]_[a-z]/);
    }
  });

  it("move with the arrow keys, Home and End, and only the chosen tab is in the Tab order", async () => {
    // The tab pattern (WAI-ARIA): the arrows move and select as they go, and wrap at the ends.
    mount();
    await screen.findByRole("tablist");
    const tab = (name: string) => screen.getByRole("tab", { name });
    tab("Modes").focus();

    const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });

    press("ArrowRight");
    expect(document.activeElement).toBe(tab("Actions"));
    expect(tab("Actions").getAttribute("aria-selected")).toBe("true");

    press("End");
    expect(document.activeElement).toBe(tab("Sequence"));

    press("ArrowRight");
    expect(document.activeElement).toBe(tab("Modes"));

    press("ArrowLeft");
    expect(document.activeElement).toBe(tab("Sequence"));

    press("Home");
    expect(document.activeElement).toBe(tab("Modes"));
    expect(screen.getAllByRole("tab").filter((each) => each.tabIndex === 0)).toEqual([tab("Modes")]);
  });

  it("put the shown panel in the Tab order, since its table's header cannot take focus", async () => {
    // And the Mouse tab has nothing focusable at all: its fields are greyed.
    mount();
    await openTab("Mouse");

    expect(screen.getByRole("tabpanel").tabIndex).toBe(0);
  });
});

describe("what the editor shows", () => {
  it("is legacy's title and one line of instructions, and no paragraph besides", async () => {
    // The owner: "have you ever seen a gui with a paragraph there written to it". Legacy's dialog
    // has a title, one instruction line, the tabs and the buttons.
    mount();
    await screen.findByRole("tablist");

    const title = screen.getByRole("heading", { name: "Hotkey Configuration" });
    const paragraphs = [...title.closest("section")!.querySelectorAll("p")].map((p) => p.textContent);

    expect(paragraphs).toEqual([
      "Click on a hotkey field and press the desired key combination. Mouse-related actions cannot be modified.",
    ]);
  });

  it("keeps legacy's other words in tooltips and placeholders", async () => {
    mount();

    const reset = await screen.findByRole("button", { name: "Reset to Defaults" });
    expect(reset.title).toBe("Reset all hotkeys to default values");

    // An empty field shows legacy's placeholder, as every unset Secondary Key does there.
    expect((await keyField("Merge Segments", "Secondary")).placeholder).toBe(
      "Click and press a key (Esc to cancel)",
    );

    expect((await keyField("Left Click")).title).toBe("Mouse-related actions cannot be modified");
  });

  it("greys the mouse gestures, which cannot be rebound", async () => {
    const { saved } = mount();

    const field = await keyField("Left Click");
    fireEvent.click(field);

    expect(field.disabled).toBe(true);
    expect(field.value).toBe("Left Click");
    expect(within(field.closest("tr")!).queryByRole("button")).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it("puts Close at the end of the button row when its dialog asks for one", async () => {
    // Legacy's row: Reset to Defaults, a stretch, Close (182-206). The web saves each change at
    // once, so there is no Save Hotkeys.
    const onClose = vi.fn();
    mount({ onClose });

    const reset = await screen.findByRole("button", { name: "Reset to Defaults" });
    const row = within(reset.parentElement!).getAllByRole("button").map((button) => button.textContent);
    expect(row).toEqual(["Reset to Defaults", "Close"]);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("draws no Close of its own when nothing can be closed", async () => {
    mount();

    await screen.findByRole("button", { name: "Reset to Defaults" });
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

describe("rebinding a key", () => {
  it("saves the new key, and the table shows it", async () => {
    const { saved } = mount();

    const field = await rebind("Merge Segments", { code: "F9", key: "F9" });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.hotkeys["merge_segments"]).toEqual({ primary: "F9", secondary: null });
    await waitFor(() => expect(field.value).toBe("F9"));
  });

  it("takes effect on the next keystroke, without a reload", async () => {
    // The end-to-end claim: the saved binding reaches the dispatcher. F9 did nothing before.
    const onFire = vi.fn();
    const { saved } = mount({ listen: { action: "fit_view", onFire } });

    const field = await rebind("Fit View", { code: "F9", key: "F9" });
    await waitFor(() => expect(saved).toHaveLength(1));
    // The field showing F9 means the STORED settings changed and re-rendered, which is what rebuilds
    // the dispatcher's key map. The API having been called is not enough to press the key yet.
    await waitFor(() => expect(field.value).toBe("F9"));

    document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "F9", key: "F9", bubbles: true }));
    await waitFor(() => expect(onFire).toHaveBeenCalledTimes(1));
  });

  it("records modifiers the way legacy writes them", async () => {
    const { saved } = mount();

    await rebind("Merge Segments", { code: "F9", key: "F9", ctrlKey: true, shiftKey: true });

    await waitFor(() => expect(saved[0]!.hotkeys["merge_segments"]!.primary).toBe("Ctrl+Shift+F9"));
  });

  it("records the modifiers in Qt's order, Meta first", async () => {
    // `QKeySequence(key | modifiers).toString()` (hotkey_dialog.py:102-108) writes Meta, Ctrl, Alt,
    // Shift, in that order (PyQt6 6.9.1). This wrote Meta last.
    const { saved } = mount();

    await rebind("Merge Segments", { code: "F9", key: "F9", ctrlKey: true, metaKey: true });

    await waitFor(() => expect(saved[0]!.hotkeys["merge_segments"]!.primary).toBe("Meta+Ctrl+F9"));
  });

  it("records a keypad key with Num, as legacy's dialog does", async () => {
    // Qt marks a keypad key with its keypad modifier, and the dialog writes it: "Num+1". Pressed on
    // the keypad, such a binding answers there before the plain 1 does (`keyEvent.ts`).
    const { saved } = mount();

    await rebind("Merge Segments", { code: "Numpad1", key: "1" });

    await waitFor(() => expect(saved[0]!.hotkeys["merge_segments"]!.primary).toBe("Num+1"));
  });

  it("records Ctrl+= as legacy's dialog does, not as the Ctrl+Plus it is not", async () => {
    const { saved } = mount();

    await rebind("Merge Segments", { code: "Equal", key: "=", ctrlKey: true });

    await waitFor(() => expect(saved[0]!.hotkeys["merge_segments"]!.primary).toBe("Ctrl+="));
  });

  it("records a Mac's Command key as Ctrl and its Control key as Meta, as legacy's dialog does there", async () => {
    // On a Mac, Qt's "Ctrl" is the Command key (`qapplekeymapper.mm`), so legacy records Command+F9
    // as "Ctrl+F9" -- the Ctrl+F9 the same binding means on Windows. This recorded "Meta+F9".
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const { saved } = mount();

    await rebind("Merge Segments", { code: "F9", key: "F9", metaKey: true });
    await waitFor(() => expect(saved[0]!.hotkeys["merge_segments"]!.primary).toBe("Ctrl+F9"));

    await rebind("Delete Segments", { code: "F8", key: "F8", ctrlKey: true });
    await waitFor(() => expect(saved[1]!.hotkeys["delete_segments"]!.primary).toBe("Meta+F8"));
  });

  it("keeps waiting when only a modifier is pressed", async () => {
    // A bare Ctrl is not a binding; it is the start of one.
    const { saved } = mount();

    const field = await rebind("Merge Segments", { code: "ControlLeft", key: "Control", ctrlKey: true });

    expect(field.value).toBe(PROMPT);
    expect(saved).toHaveLength(0);
  });

  it("cancels on Escape and changes nothing", async () => {
    const { saved } = mount();

    const field = await rebind("Merge Segments", { code: "Escape", key: "Escape" });

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

    await rebind("Merge Segments", { code: "Period", key: "." });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onFire).not.toHaveBeenCalled();
  });

  it("starts from the keyboard too: Enter or Space on a field, as a click does", async () => {
    // Legacy's field starts only on a mouse click, which leaves a keyboard user no way in.
    const { saved } = mount();

    const field = await keyField("Merge Segments");
    field.focus();
    fireEvent.keyDown(field, { code: "Enter", key: "Enter" });
    expect(field.value).toBe(PROMPT);

    // The Enter that started it, held long enough to repeat, is not the new key.
    fireEvent.keyDown(field, { code: "Enter", key: "Enter", repeat: true });
    expect(field.value).toBe(PROMPT);

    fireEvent.keyDown(field, { code: "F9", key: "F9" });
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.hotkeys["merge_segments"]!.primary).toBe("F9");

    const other = await keyField("Delete Segments");
    fireEvent.keyDown(other, { code: "Space", key: " " });
    expect(other.value).toBe(PROMPT);
  });
});

describe("the capture, as legacy's runs it", () => {
  it("gives up after 15 seconds and changes nothing", async () => {
    // `hotkey_dialog.py:36-40, 133-137`.
    const { saved } = mount();
    const field = await keyField("Merge Segments");

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(field);
      expect(field.value).toBe(PROMPT);

      act(() => {
        vi.advanceTimersByTime(14_999);
      });
      expect(field.value).toBe(PROMPT);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(field.value).toBe("M");
    } finally {
      vi.useRealTimers();
    }
    expect(saved).toHaveLength(0);
  });

  for (const lock of ["CapsLock", "NumLock", "ScrollLock"]) {
    it(`waits through ${lock}, which legacy never binds`, async () => {
      // `hotkey_dialog.py:81-83`: the lock keys are ignored, and the field keeps waiting.
      const { saved } = mount();

      const field = await rebind("Merge Segments", { code: lock, key: lock });

      expect(field.value).toBe(PROMPT);
      expect(saved).toHaveLength(0);
    });
  }

  it("waits through Ctrl+Tab, which legacy never binds", async () => {
    // Tab is in legacy's ignored keys whatever the modifiers (85-86). Legacy's dialog, run under
    // QTest, kept waiting on Ctrl+Tab.
    const { saved } = mount();

    const field = await rebind("Merge Segments", { code: "Tab", key: "Tab", ctrlKey: true });

    expect(field.value).toBe(PROMPT);
    expect(saved).toHaveLength(0);
  });

  it("ends on Tab, which moves focus on, as legacy's does", async () => {
    // Legacy lists Tab among its ignored keys, but Qt's focus chain takes a plain Tab first: its
    // dialog, run under QTest, moved focus to the next field and stopped capturing. Here Tab leaves
    // the field the same way, and the binding stands.
    const { saved } = mount();

    const field = await rebind("Merge Segments", { code: "Tab", key: "Tab" });

    expect(field.value).toBe("M");
    expect(saved).toHaveLength(0);
  });

  for (const [code, key] of [
    ["KeyW", "w"],
    ["KeyT", "t"],
    ["KeyN", "n"],
  ] as const) {
    it(`refuses Ctrl+${key.toUpperCase()}, which the browser keeps for itself (web-only)`, async () => {
      // A page is never sent these, so the binding could never fire. Legacy's desktop dialog binds
      // them; a browser tab closes, opens another, or opens a window instead.
      const { saved } = mount();

      const field = await rebind("Merge Segments", { code, key, ctrlKey: true });

      expect((await screen.findByRole("status")).textContent).toBe(
        `The key 'Ctrl+${key.toUpperCase()}' is reserved by the browser. Please choose a different key.`,
      );
      expect(field.value).toBe("M");
      expect(saved).toHaveLength(0);
    });
  }

  it("refuses the keys only a Mac's browser keeps, on every platform (web-only)", async () => {
    // CONTROL_PARITY.md CP-66. Command+Option+Right switches tabs on a Mac, where Qt calls it
    // Ctrl+Alt+Right; a binding made here follows its user there, and would never fire.
    const { saved } = mount();

    const field = await rebind("Merge Segments", { code: "ArrowRight", key: "ArrowRight", ctrlKey: true, altKey: true });

    expect((await screen.findByRole("status")).textContent).toBe(
      "The key 'Ctrl+Alt+Right' is reserved by the browser on a Mac. Please choose a different key.",
    );
    expect(field.value).toBe("M");
    expect(saved).toHaveLength(0);
  });

  it("refuses a Mac's Command+Q, which Qt there calls Ctrl+Q", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const { saved } = mount();

    await rebind("Merge Segments", { code: "KeyQ", key: "q", metaKey: true });

    expect((await screen.findByRole("status")).textContent).toBe(
      "The key 'Ctrl+Q' is reserved by the browser on a Mac. Please choose a different key.",
    );
    expect(saved).toHaveLength(0);
  });
});

describe("RULE-049: a key another action holds is refused", () => {
  it("names the action that holds it, in legacy's words, and saves nothing", async () => {
    const { saved } = mount();

    // M is Merge Segments' key.
    await rebind("Delete Segments", { code: "KeyM", key: "m" });

    // `hotkey_dialog.py:318-319`.
    expect((await screen.findByRole("status")).textContent).toBe(
      "The key 'M' is already used by 'Merge Segments'. Please choose a different key.",
    );
    expect(saved).toHaveLength(0);
  });

  it("reverts the field to the binding that is still in force", async () => {
    mount();

    const field = await rebind("Delete Segments", { code: "KeyM", key: "m" });

    // RULE-049's "the field reverts": it shows V, the key that still deletes -- and still does
    // after a save would have landed, which is when a refusal that did not refuse would show.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(field.value).toBe("V");
  });

  it("allows an action its own current key", async () => {
    // Not a conflict with itself.
    const { saved } = mount();

    await rebind("Merge Segments", { code: "KeyM", key: "m" });

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the secondary key", () => {
  it("can be cleared, which legacy's dialog had no way to do", async () => {
    const { saved } = mount();
    await openTab("Actions");

    fireEvent.click(screen.getByRole("button", { name: "Clear the secondary key for Redo" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.hotkeys["redo"]).toEqual({ primary: "Ctrl+Y", secondary: null });
  });

  it("can be set, and is held to the same conflict rule", async () => {
    const { saved } = mount();

    await rebind("Redo", { code: "KeyZ", key: "z", ctrlKey: true }, "Secondary");

    // Ctrl+Z is Undo's.
    expect((await screen.findByRole("status")).textContent).toContain("already used by 'Undo'");
    expect(saved).toHaveLength(0);
  });

  it("offers no Clear when there is nothing to clear", async () => {
    mount();
    await openTab("Actions");

    const clear = screen.getByRole("button", { name: "Clear the secondary key for Undo" });

    expect((clear as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Reset to Defaults", () => {
  it("asks first, in legacy's words, and a No changes nothing", async () => {
    const confirm = vi.fn(() => false);
    const { saved } = mount({ confirm });

    fireEvent.click(await screen.findByRole("button", { name: "Reset to Defaults" }));

    // `hotkey_dialog.py:376-382`.
    expect(confirm).toHaveBeenCalledWith("Are you sure you want to reset all hotkeys to their default values?");
    expect(saved).toHaveLength(0);
  });

  it("saves the defaults on a Yes", async () => {
    const { saved } = mount({ confirm: () => true });

    fireEvent.click(await screen.findByRole("button", { name: "Reset to Defaults" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.hotkeys).toEqual(defaultSettings().hotkeys);
  });
});

describe("a problem that came in with an imported legacy file", () => {
  it("names a conflict, so it can be fixed", async () => {
    // The import keeps a hand-edited conflict (RULE-049's edge case) and only its log said so.
    const base = defaultSettings();
    mount({
      stored: { ...base, hotkeys: { ...base.hotkeys, delete_segments: { primary: "M", secondary: null } } },
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The key 'M' is used by both 'Delete Segments' and 'Merge Segments'. Please choose a different key.",
    );
  });

  it("names a key the browser keeps, which legacy could bind (web-only)", async () => {
    const base = defaultSettings();
    mount({
      stored: { ...base, hotkeys: { ...base.hotkeys, toggle_recent_class: { primary: "Ctrl+T", secondary: null } } },
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The key 'Ctrl+T' for 'Toggle Recent Class' is reserved by the browser. Please choose a different key.",
    );
  });

  it("names a key only a Mac's browser keeps, however legacy spelled it (web-only)", async () => {
    const base = defaultSettings();
    mount({
      stored: { ...base, hotkeys: { ...base.hotkeys, toggle_recent_class: { primary: "Meta+PgDown", secondary: null } } },
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The key 'Meta+PgDown' for 'Toggle Recent Class' is reserved by the browser on a Mac. Please choose a different key.",
    );
  });

  it("is not claimed when there is none", async () => {
    mount();

    await keyField("Merge Segments");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a stored binding the schema does not know", () => {
  it("is shown, read-only, on a General tab where legacy puts an action with no category", async () => {
    // Legacy's `HotkeyAction` defaults its category to General (`config/hotkeys.py:18`), and General
    // follows Mouse in its tab order (`hotkey_dialog.py:296`). Only a hand-written settings request
    // stores such a binding; hiding it would hide a key that is still taken.
    const base = defaultSettings();
    mount({ stored: { ...base, hotkeys: { ...base.hotkeys, old_action: { primary: "F12", secondary: null } } } });

    const tabs = within(await screen.findByRole("tablist")).getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs.slice(6, 9)).toEqual(["Mouse", "General", "Classes"]);

    await openTab("General");
    const field = within(shownTable()).getByLabelText("Primary key for Old Action") as HTMLInputElement;
    expect(field.value).toBe("F12");
    expect(field.disabled).toBe(true);
  });
});

describe("when the save fails", () => {
  it("says so in legacy's words, and the old key stays on screen and in force", async () => {
    mount({
      putSettings: async () => {
        throw new Error("the API is unreachable");
      },
    });

    const field = await rebind("Merge Segments", { code: "F9", key: "F9" });

    // `hotkey_dialog.py:370-372`.
    expect((await screen.findByRole("status")).textContent).toBe("Failed to save hotkeys: the API is unreachable");
    expect(field.value).toBe("M");
  });
});
