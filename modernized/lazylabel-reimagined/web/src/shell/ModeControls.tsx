/**
 * Legacy's Mode Controls card (control_panel.py:242-338): a 3x2 grid of mode buttons -- AI (1),
 * Poly (2), Box (3) / Circle (4), Select (E), Edit (R) -- and the Hotkeys button under it.
 *
 * RADIOS DRAWN AS BUTTONS. The modes are exclusive, and a radio group says so to a screen reader and
 * to the keyboard without any code; each label is the button. The key in each label is read from
 * the user's bindings, so a remapped key is the one shown.
 *
 * WHERE REACT'S EXTRA TOOLS WENT. "Edit" is not a drawing tool here: the vertex editor appears when
 * exactly one annotation is selected and no drawing tool is active, so Edit (R) means "no tool" --
 * which is also the state the app starts in, so a first click on the canvas never draws. Pan has
 * no button in legacy; it sits beside Hotkeys, where the grid leaves room. Crop is drawn from the
 * Border Crop section, as legacy's is (control_panel.py:500).
 */

import type { ReactNode } from "react";

import { useHotkey, useHotkeyContext } from "../hotkeys/HotkeyProvider.jsx";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { enterEditMode } from "../tools/edit.js";
import { HistoryControls } from "../workspace/HistoryControls.jsx";
import { useWorkspace, type Tool } from "../workspace/WorkspaceProvider.jsx";

/** The grid, in legacy's order, with the action whose key each label shows. */
const MODES: readonly { readonly tool: Tool; readonly label: string; readonly action: string }[] = [
  { tool: "ai", label: "AI", action: "sam_mode" },
  { tool: "polygon", label: "Poly", action: "polygon_mode" },
  { tool: "box", label: "Box", action: "bbox_mode" },
  { tool: "circle", label: "Circle", action: "circle_mode" },
  { tool: "select", label: "Select", action: "selection_mode" },
  // Edit is "no drawing tool": see the module comment.
  { tool: "none", label: "Edit", action: "edit_mode" },
];

export function ModeControls({ onHotkeys }: { readonly onHotkeys: () => void }): ReactNode {
  const { activeTool, setActiveTool, segments, selected, toggleRecentClass } = useWorkspace();
  const { bindings } = useHotkeyContext();
  const { notify } = useNotifications();

  /*
   * EDIT SAYS WHY IT DID NOTHING. The vertex editor opens when exactly one editable annotation is
   * selected and no drawing tool is active, so Edit clears the tool -- and with nothing selected,
   * or with an AI mask selected, clearing the tool is all that visibly happens. `enterEditMode`
   * carries legacy's own words for that, and they are the only thing separating "the key is not
   * bound" from "this shape has no vertices to drag".
   *
   * The tool is still cleared on a refusal. Edit means "stop drawing and edit"; refusing the second
   * half is not a reason to ignore the first, and leaving the polygon tool armed would put the next
   * click into a new shape.
   */
  const edit = () => {
    setActiveTool("none");
    const outcome = enterEditMode(segments, selected);
    if (outcome.kind === "refused") notify({ severity: "info", message: outcome.reason });
  };

  /*
   * THE KEYS -- legacy's own bindings, imported with the settings so a remapping is honoured.
   *
   * SET DIRECTLY, NOT TOGGLED. RULE-070 is a defect card: legacy means Selection and Edit to toggle
   * back to the previous mode, and records the mode just left every time, so E R R E leaves you in
   * selection unable to get back to AI without pressing 1. A tool key that sometimes does something
   * else is worse than one that always does the same thing.
   */
  useHotkey("sam_mode", () => setActiveTool("ai"));
  useHotkey("polygon_mode", () => setActiveTool("polygon"));
  useHotkey("bbox_mode", () => setActiveTool("box"));
  useHotkey("circle_mode", () => setActiveTool("circle"));
  useHotkey("selection_mode", () => setActiveTool("select"));
  useHotkey("pan_mode", () => setActiveTool("pan"));
  /*
   * Legacy's X (RULE-086), with its words (main_window.py:2697-2738). It lives beside the tool keys
   * because it is the same kind of thing: what the next stroke will be, chosen without reaching for
   * a panel. With no recent class, legacy takes its class table's first row: the lowest id, or the
   * highest when pixel priority runs descending.
   */
  const { settings } = useSettings();
  useHotkey("toggle_recent_class", () => {
    const descending =
      settings.values["pixel_priority_enabled"] === true && settings.values["pixel_priority_ascending"] === false;
    const outcome = toggleRecentClass(descending ? "highest" : "lowest");
    notify({
      severity: "info",
      message:
        outcome === null
          ? "No classes available to toggle"
          : outcome.active
            ? `Class ${outcome.classId} activated for new segments`
            : "No active class - new segments will create new classes",
    });
  });
  useHotkey("edit_mode", edit);

  const keyOf = (action: string): string => {
    const key = bindings[action]?.primary;
    return key === undefined || key === null || key === "" ? "" : ` (${key})`;
  };

  return (
    <section className="mode-card">
      <fieldset className="mode-card__modes">
        <legend className="mode-card__title">Mode Controls</legend>
        {MODES.map((mode) => (
          <label
            key={mode.tool}
            className={`mode-button${activeTool === mode.tool ? " mode-button--on" : ""}`}
          >
            <input
              type="radio"
              name="tool"
              className="mode-button__input"
              checked={activeTool === mode.tool}
              onChange={() => (mode.tool === "none" ? edit() : setActiveTool(mode.tool))}
            />
            {mode.label}
            {keyOf(mode.action)}
          </label>
        ))}
      </fieldset>

      <div className="mode-card__row">
        <label className={`mode-button mode-button--small${activeTool === "pan" ? " mode-button--on" : ""}`}>
          <input
            type="radio"
            name="tool"
            className="mode-button__input"
            checked={activeTool === "pan"}
            onChange={() => setActiveTool("pan")}
          />
          Pan{keyOf("pan_mode")}
        </label>
        <button type="button" className="mode-card__hotkeys" aria-label="Show hotkeys" onClick={onHotkeys}>
          <span aria-hidden="true">⌨</span> Hotkeys
        </button>
      </div>

      <HistoryControls />

      {/* Shift erases with whichever shape is active, which is legacy's gesture and is not
          discoverable by looking at the buttons. It is read when the shape is FINISHED -- a box or
          circle released, a polygon closed. */}
      <p className="mode-card__hint">
        Hold Shift as you finish a shape to erase with it: release a box or circle with Shift held,
        or close a polygon with Shift+Enter.
      </p>
    </section>
  );
}
