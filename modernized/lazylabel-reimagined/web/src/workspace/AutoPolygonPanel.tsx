/**
 * Legacy's Auto-Convert: whether an accepted AI mask becomes an editable polygon, and how finely.
 *
 * Two settings that had no reader until now. The toggle is worth more than its name suggests — a
 * mask is a field of pixels you can erase into but cannot drag a corner of, and a polygon has
 * vertices the edit tool can move. So this decides whether a model's output is something you
 * accept or discard, or something you can FIX.
 *
 * OFF by default, as legacy has it. A conversion approximates, and approximating someone's
 * annotation without being asked is the sort of help that loses a boundary they cared about.
 *
 * LEGACY'S CONTROLS AND WORDS (control_panel.py:398-461): the "Auto-Convert: OFF" toggle button and
 * the "Polygon Resolution:" slider between "Simple" and "Detailed", each explained in its tooltip.
 * The paragraph printed under them until 2026-09-26 also said that only the largest piece of a mask
 * is converted, as legacy converts it; that is announced when it happens (`AiTool`).
 */

import { useCallback, type ReactNode } from "react";

import { decodeMask } from "@lazylabel/contracts";

import { useHotkey, useHotkeyContext } from "../hotkeys/HotkeyProvider.jsx";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import {
  RESOLUTION_DEFAULT,
  RESOLUTION_MAX,
  RESOLUTION_MIN,
  epsilonFactorFor,
  maskToPolygon,
} from "../tools/autoPolygon.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";

/** Flip Auto-Convert and say which way it went, as legacy does for its button and its key. */
function useAutoConvertToggle(): () => void {
  const { settings, save } = useSettings();
  const { notify } = useNotifications();
  return useCallback(() => {
    const next = settings.values["auto_polygon_enabled"] !== true;
    void save({ ...settings, values: { ...settings.values, auto_polygon_enabled: next } });
    // Legacy's words (main_window.py:1746-1753).
    notify({ severity: "info", message: `Auto-Convert AI to Polygon: ${next ? "ON" : "OFF"}` });
  }, [notify, save, settings]);
}

/**
 * Legacy's P, "Toggle Auto-Convert AI to Polygon" (hotkeys.py:97-102, main_window.py:1764-1766).
 *
 * It converted the masks already on the image here, a different action under legacy's key, until
 * 2026-09-25. Registered by the shell rather than by this panel, because the panel sits in a
 * section that can be collapsed, and a key has to work whether its section is open or not.
 */
export function useAutoConvertKey(): void {
  useHotkey("convert_to_polygons", useAutoConvertToggle());
}

function resolutionOf(value: unknown): number {
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.min(RESOLUTION_MAX, Math.max(RESOLUTION_MIN, raw)) : RESOLUTION_DEFAULT;
}

export function AutoPolygonPanel(): ReactNode {
  const { settings, save } = useSettings();
  const { notify } = useNotifications();
  const { segments, applySegments } = useWorkspace();
  const toggle = useAutoConvertToggle();
  // Legacy's tooltip names P; the key the user bound is the one named here.
  const toggleKey = useHotkeyContext().bindings["convert_to_polygons"]?.primary || "P";

  const enabled = settings.values["auto_polygon_enabled"] === true;
  const resolution = resolutionOf(settings.values["polygon_resolution"]);

  const set = useCallback(
    (key: string, value: unknown) => {
      void save({ ...settings, values: { ...settings.values, [key]: value } });
    },
    [save, settings],
  );

  /*
   * CONVERT THE MASKS ALREADY ON THIS IMAGE -- Auto-Convert applied after the fact. Not legacy's:
   * it was the web's P until 2026-09-25 and is kept as a button because it is useful, so a user who
   * forgot to switch Auto-Convert on before a session's work is not left re-drawing it
   * (`CONTROL_PARITY.md` CP-12). Masks that cannot become a polygon -- a sliver that approximates
   * to a line -- are LEFT AS MASKS rather than dropped: the point is to gain corners to drag.
   *
   * One recorded step for the lot, because the user performed one action. Undo puts every mask
   * back at once.
   */
  const convertable = segments.some((segment) => segment.mask !== undefined && segment.classId !== null);
  const convertMasks = useCallback(() => {
    const epsilon = epsilonFactorFor(resolution);
    let changed = 0;
    const next = segments.map((segment) => {
      if (segment.mask === undefined || segment.classId === null) return segment;
      const polygon = maskToPolygon(decodeMask(segment.mask), epsilon);
      if (polygon === null) return segment;
      changed += 1;
      return { type: "Polygon" as const, classId: segment.classId, vertices: polygon.vertices };
    });

    if (changed === 0) {
      notify({ severity: "info", message: "No masks on this image could become polygons" });
      return;
    }
    applySegments(next, `Convert ${changed} mask${changed === 1 ? "" : "s"} to polygons`);
  }, [applySegments, notify, resolution, segments]);

  return (
    <>
      {/* Legacy's checkable button, which says its state in its text (control_panel.py:406-418,
          889). */}
      <button
        type="button"
        className="auto-polygon__toggle"
        aria-pressed={enabled}
        title={
          "When enabled, AI segments are automatically converted to polygons\n"
          + `when you accept them (Spacebar). Toggle with ${toggleKey} key.`
        }
        onClick={toggle}
      >
        Auto-Convert: {enabled ? "ON" : "OFF"}
      </button>

      {/* Shown only when it does something. A resolution slider above a switched-off toggle is a
          control that looks live and changes nothing, which is the whole class of defect this
          setting was part of. */}
      {enabled && (
        <>
          <p className="auto-polygon__label">Polygon Resolution:</p>
          <label
            className="auto-polygon__resolution"
            title={
              "Adjust how closely the polygon follows the AI mask.\n"
              + "Simple = fewer points, Detailed = more points."
            }
          >
            <span>Simple</span>
            <input
              type="range"
              min={RESOLUTION_MIN}
              max={RESOLUTION_MAX}
              value={resolution}
              aria-label="Polygon resolution"
              onChange={(event) => set("polygon_resolution", Number(event.target.value))}
            />
            <span>Detailed</span>
          </label>
        </>
      )}

      {/* Not legacy's: see `convertMasks` above. */}
      <button
        type="button"
        onClick={convertMasks}
        disabled={!convertable}
        title="Convert this image's AI masks to polygons"
      >
        Convert Masks
      </button>
    </>
  );
}
