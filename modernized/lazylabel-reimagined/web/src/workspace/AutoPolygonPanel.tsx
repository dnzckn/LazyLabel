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
 */

import { useCallback, type ReactNode } from "react";

import { useSettings } from "../settings/SettingsProvider.jsx";
import { RESOLUTION_DEFAULT, RESOLUTION_MAX, RESOLUTION_MIN } from "../tools/autoPolygon.js";

export function AutoPolygonPanel(): ReactNode {
  const { settings, save } = useSettings();

  const enabled = settings.values["auto_polygon_enabled"] === true;
  const rawResolution = Number(settings.values["polygon_resolution"]);
  const resolution = Number.isFinite(rawResolution)
    ? Math.min(RESOLUTION_MAX, Math.max(RESOLUTION_MIN, rawResolution))
    : RESOLUTION_DEFAULT;

  const set = useCallback(
    (key: string, value: unknown) => {
      void save({ ...settings, values: { ...settings.values, [key]: value } });
    },
    [save, settings],
  );

  return (
    <>
      <label className="split__link">
        <input
          type="checkbox"
          checked={enabled}
          aria-label="Convert AI masks to polygons"
          onChange={(event) => set("auto_polygon_enabled", event.target.checked)}
        />{" "}
        Auto-Convert to polygon
      </label>

      {/* Shown only when it does something. A resolution slider above a switched-off toggle is a
          control that looks live and changes nothing, which is the whole class of defect this
          setting was part of. */}
      {enabled && (
        <label className="crop__field">
          <span>Polygon resolution</span>
          <input
            type="range"
            min={RESOLUTION_MIN}
            max={RESOLUTION_MAX}
            value={resolution}
            aria-label="Polygon resolution"
            onChange={(event) => set("polygon_resolution", Number(event.target.value))}
          />
          <output>{resolution}</output>
        </label>
      )}

      <p className="panel__missing">
        {enabled
          ? "An accepted AI mask becomes a polygon whose corners you can drag. Higher resolution "
            + "keeps more corners and follows the mask more closely; lower gives a simpler shape. "
            + "Only the largest piece is converted, as the desktop app does, and you are told when "
            + "smaller ones are dropped."
          : "An accepted AI mask stays a mask: you can erase into it, but it has no corners to "
            + "drag. Turn this on to get an editable polygon instead."}
      </p>
    </>
  );
}
