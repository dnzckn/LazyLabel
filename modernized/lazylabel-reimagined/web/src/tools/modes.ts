/**
 * Which mode is in force, and which one Select (E), Pan (Q) and Edit (R) go back to -- RULE-070.
 *
 * Legacy SETS AI (1), Polygon (2), Box (3) and Circle (4), and TOGGLES Selection, Pan and Edit: the
 * key of the mode already in force goes back to the mode before it (mode_manager.py:43-53,
 * 171-184). The owner chose on 2026-09-26 to have that here too ("E/R toggle back"), reversing the
 * recorded decision that set them every time.
 *
 * WHAT LEGACY RECORDS AS "PREVIOUS" IS THE MODE JUST LEFT, whatever it was. ModeManager means
 * Selection and Edit never to be remembered (mode_manager.py:123-124, 182-183), but the mode is
 * written through the view model's setter, which records the mode it replaces on every change
 * (main_window.py:475-478; single_view_viewmodel.py:127-142). So with a polygon selected, from AI:
 * E is Selection, R is Edit, R is Selection again rather than AI, and E is Edit -- without the
 * "No editable shapes selected!" check, which only R makes. That is reproduced here, as the card's
 * example says it.
 *
 * Edit is the "none" tool in this app (ModeControls.tsx), and Selection is "select".
 */

import type { Tool } from "../workspace/WorkspaceProvider.jsx";

/** The mode in force, and legacy's `previous_mode`. */
export interface ModeState {
  readonly tool: Tool;
  readonly previous: Tool;
}

/** Legacy's Selection and Edit, the two ModeManager declines to remember. */
function isSelectionOrEdit(tool: Tool): boolean {
  return tool === "select" || tool === "none";
}

/**
 * Legacy's `set_mode(mode)`, what 1, 2, 3 and 4 do (mode_manager.py:114-126).
 *
 * A change records the mode left. Choosing the mode already in force changes nothing in the view
 * model (single_view_viewmodel.py:135-136), but ModeManager has already written the mode as
 * previous unless it is Selection or Edit (mode_manager.py:123-124).
 */
export function chooseMode(state: ModeState, tool: Tool): ModeState {
  if (tool !== state.tool) return { tool, previous: state.tool };
  if (isSelectionOrEdit(tool) || state.previous === tool) return state;
  return { tool, previous: tool };
}

/**
 * Legacy's `toggle_mode(mode)`, what E, Q and R do (mode_manager.py:171-184): the mode, or the one
 * before it when the mode is already in force. Going back records the mode left, so pressing the
 * key again returns to it.
 */
export function toggleMode(state: ModeState, tool: Tool): ModeState {
  if (tool !== state.tool) return { tool, previous: state.tool };
  // Back to a previous that is this very mode: the view model's setter changes nothing.
  if (state.previous === tool) return state;
  return { tool: state.previous, previous: tool };
}
