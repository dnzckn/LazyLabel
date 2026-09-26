/**
 * Legacy's Mode Controls card (control_panel.py:242-338): a 3x2 grid of mode buttons -- AI (1),
 * Poly (2), Box (3) / Circle (4), Select (E), Edit (R) -- and the Hotkeys button under it.
 *
 * RADIOS DRAWN AS BUTTONS. The modes are exclusive, and a radio group says so to a screen reader and
 * to the keyboard without any code; each label is the button. The key in each label is read from
 * the user's bindings, so a remapped key is the one shown.
 *
 * WHERE REACT'S EXTRA TOOLS WENT. "Edit" is not a drawing tool here: the vertex handles appear on
 * the selected shapes while no drawing tool is active, so Edit (R) means "no tool" -- which is also
 * the state the app starts in, so a first click on the canvas never draws. Pan has
 * no button in legacy; it sits beside Hotkeys, where the grid leaves room. Crop is drawn from the
 * Border Crop section, as legacy's is (control_panel.py:500).
 *
 * TOOLTIPS, NOT HINTS. Each button carries legacy's tooltip with its key (control_panel.py:254-317,
 * 327-358), and nothing is printed under the card. It used to say that holding Shift as a shape
 * is finished erases with it -- releasing a box or circle, or closing a polygon with Shift+Enter
 * -- which is legacy's gesture and which legacy leaves to its hotkey list.
 */

import type { ReactNode } from "react";

import { useHotkey, useKeyHint } from "../hotkeys/HotkeyProvider.jsx";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { enterEditMode } from "../tools/edit.js";
import { HistoryControls } from "../workspace/HistoryControls.jsx";
import { useWorkspace, type Tool } from "../workspace/WorkspaceProvider.jsx";

/** The grid, in legacy's order, with the action whose key each label shows and legacy's tooltip. */
const MODES: readonly {
  readonly tool: Tool;
  readonly label: string;
  readonly action: string;
  readonly tooltip: string;
}[] = [
  { tool: "ai", label: "AI", action: "sam_mode", tooltip: "Switch to AI Mode for AI segmentation" },
  { tool: "polygon", label: "Poly", action: "polygon_mode", tooltip: "Switch to Polygon Drawing Mode" },
  { tool: "box", label: "Box", action: "bbox_mode", tooltip: "Switch to Bounding Box Drawing Mode" },
  { tool: "circle", label: "Circle", action: "circle_mode", tooltip: "Switch to Circle Drawing Mode" },
  { tool: "select", label: "Select", action: "selection_mode", tooltip: "Toggle segment selection" },
  // Edit is "no drawing tool": see the module comment.
  { tool: "none", label: "Edit", action: "edit_mode", tooltip: "Edit segments and polygons" },
];

export function ModeControls({ onHotkeys }: { readonly onHotkeys: () => void }): ReactNode {
  const { activeTool, setActiveTool, segments, selected, toggleRecentClass } = useWorkspace();
  const keyOf = useKeyHint();
  const { notify } = useNotifications();

  /*
   * EDIT SAYS WHY IT DID NOTHING, and does nothing. Edit mode needs a selected polygon or circle,
   * which then carry their vertex handles. With nothing selected, or only masks, legacy refuses in
   * its own words and STAYS IN THE MODE IT WAS IN (mode_manager.py:55-112) -- the words being the
   * only thing that separates "the key is not bound" from "this shape has no vertices to drag".
   *
   * Until 2026-09-26 the tool was cleared on a refusal anyway, so R on a mask left the user out of
   * the mode they were drawing in. Legacy keeps it (CONTROL_PARITY.md CP-16).
   */
  const edit = () => {
    const outcome = enterEditMode(segments, selected);
    if (outcome.kind === "refused") {
      notify({ severity: "info", message: outcome.reason });
      return;
    }
    setActiveTool("none");
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

  return (
    <section className="mode-card">
      <fieldset className="mode-card__modes">
        <legend className="mode-card__title">Mode Controls</legend>
        {MODES.map((mode) => (
          <label
            key={mode.tool}
            className={`mode-button${activeTool === mode.tool ? " mode-button--on" : ""}`}
            // Legacy's "{tooltip} ({key})" (control_panel.py:327-331).
            title={`${mode.tooltip}${keyOf(mode.action)}`}
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
        <label
          className={`mode-button mode-button--small${activeTool === "pan" ? " mode-button--on" : ""}`}
          // No button in legacy, so its hotkey's name, which is legacy's (hotkeys.py:52).
          title={`Pan Mode${keyOf("pan_mode")}`}
        >
          <input
            type="radio"
            name="tool"
            className="mode-button__input"
            checked={activeTool === "pan"}
            onChange={() => setActiveTool("pan")}
          />
          Pan{keyOf("pan_mode")}
        </label>
        <button
          type="button"
          className="mode-card__hotkeys"
          aria-label="Show hotkeys"
          title="Configure keyboard shortcuts"
          onClick={onHotkeys}
        >
          <span aria-hidden="true">⌨</span> Hotkeys
        </button>
      </div>

      <HistoryControls />
    </section>
  );
}
