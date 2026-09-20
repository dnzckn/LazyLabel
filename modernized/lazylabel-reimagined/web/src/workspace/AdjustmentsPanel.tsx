/**
 * The sliders that drive RULE-028's display adjustments.
 *
 * The arithmetic is in `tools/adjustments.ts` and matches legacy, including its
 * negative-brightness fold. What this adds is the one thing legacy does not: SAYING that the fold
 * is about to happen.
 *
 * THE SLIDERS ARE IN LEGACY'S UNITS, not the values the maths uses. Gamma's slider runs 1..200 for
 * 0.01..2.00 and saturation's 0..200 for 0.0..2.0, because those are the ranges a user's stored
 * settings were written in and the steps they are used to. Presenting gamma as a 0.01..2.00 float
 * input would be friendlier and would not round-trip the same values.
 */

import { useCallback, type ReactNode } from "react";

import { NEUTRAL, adjustmentsFrom, folds, isNeutral, type Adjustments } from "../tools/adjustments.js";
import { useSettings } from "../settings/SettingsProvider.jsx";

/** Legacy's slider ranges (`adjustments_widget.py:65-97`). */
const GAMMA_SLIDER = { min: 1, max: 200, scale: 100 };
const SATURATION_SLIDER = { min: 0, max: 200, scale: 100 };

export function AdjustmentsPanel(): ReactNode {
  const { settings, save } = useSettings();

  // The same reader the canvas uses, so the slider position and the picture cannot disagree.
  const current: Adjustments = adjustmentsFrom(settings.values);

  const set = useCallback(
    (key: keyof Adjustments, value: number) => {
      void save({ ...settings, values: { ...settings.values, [key]: value } });
    },
    [save, settings],
  );

  const reset = useCallback(() => {
    void save({ ...settings, values: { ...settings.values, ...NEUTRAL } });
  }, [save, settings]);

  return (
    <>
      <Slider
        label="Brightness"
        min={-100}
        max={100}
        value={current.brightness}
        onChange={(v) => set("brightness", v)}
      />
      <Slider
        label="Contrast"
        min={-100}
        max={100}
        value={current.contrast}
        onChange={(v) => set("contrast", v)}
      />
      <Slider
        label="Gamma"
        min={GAMMA_SLIDER.min}
        max={GAMMA_SLIDER.max}
        value={Math.round(current.gamma * GAMMA_SLIDER.scale)}
        display={current.gamma.toFixed(2)}
        onChange={(v) => set("gamma", v / GAMMA_SLIDER.scale)}
      />
      <Slider
        label="Saturation"
        min={SATURATION_SLIDER.min}
        max={SATURATION_SLIDER.max}
        value={Math.round(current.saturation * SATURATION_SLIDER.scale)}
        display={current.saturation.toFixed(2)}
        onChange={(v) => set("saturation", v / SATURATION_SLIDER.scale)}
      />

      {folds(current) && (
        // The thing legacy never says. cv2.convertScaleAbs takes the absolute value, so darkening
        // makes the darkest pixels BRIGHT and a gradient folds back on itself. A user who sees
        // that without being told concludes the slider is broken.
        <p role="status" className="banner banner--warning">
          Negative brightness folds instead of darkening: the darkest pixels come back bright. That
          is what the desktop app does, so it is kept — but it is rarely what anyone wants.
        </p>
      )}

      <button type="button" onClick={reset} disabled={isNeutral(current)}>
        {isNeutral(current) ? "No adjustments applied" : "Reset adjustments"}
      </button>

      <p className="panel__missing">
        These change what is DISPLAYED, and nothing else. They do not reach the file, and — unlike
        the desktop app — they do not yet reach the AI either: legacy&rsquo;s Operate On View
        (RULE-089) would send these adjusted pixels to SAM, and it is not built. The setting exists
        and nothing reads it, so a model prompted here sees the image as it was decoded.
      </p>
    </>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  display,
  onChange,
}: {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly display?: string;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <label className="adjustment">
      <span className="adjustment__label">
        {label} <span className="adjustment__value">{display ?? value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
