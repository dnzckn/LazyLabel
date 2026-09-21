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
/** Legacy's annotation-size slider is `value / 10`, so its 10 is a multiplier of 1.0. */
const ANNOTATION_SLIDER = { min: 1, max: 50, scale: 10 };

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

  /*
   * Not one of RULE-028's adjustments, so it does not go through `set`: that writes a key of
   * `Adjustments` and this is not one. Sizing changes what is DRAWN OVER the picture rather than
   * the picture, which is also why Reset above leaves it alone -- a user resetting the image does
   * not mean they want smaller handles.
   */
  // The MULTIPLIER itself, not `sizingFrom(...).point` -- that folds `point_radius` in, so the
  // slider would show a combined figure and writing it back would multiply the ratio a second
  // time. Every drag would make the handles grow.
  const rawSize = Number(settings.values["annotation_size_multiplier"]);
  const annotationSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 1;
  const setValue = useCallback(
    (key: string, value: number) => {
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

      {/* The drawing aids rather than the picture, which is why it sits below the reset above and
          carries its own note. Legacy's slider is `value / 10`, so its 10 is this app's 1.0. */}
      <Slider
        label="Annotation size"
        min={ANNOTATION_SLIDER.min}
        max={ANNOTATION_SLIDER.max}
        value={Math.round(annotationSize * ANNOTATION_SLIDER.scale)}
        display={`${annotationSize.toFixed(1)}x`}
        onChange={(v) => setValue("annotation_size_multiplier", v / ANNOTATION_SLIDER.scale)}
      />
      <p className="panel__missing">
        How big the vertex handles and outlines are drawn — not the annotations themselves, which
        are the pixels you drew and do not change. Unlike the desktop app these stay the same size
        on screen as you zoom, so a handle you can grab when looking at the whole image is still
        grabbable when you are in close.
      </p>

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
        These change what is DISPLAYED, and never the file. Whether they reach the AI is
        legacy&rsquo;s Operate On View (RULE-089), and it is a setting: with it OFF, which is the
        default, a model sees the image as it was decoded; with it on, the API renders exactly what
        you can see and hands the model that instead. Changing an adjustment then re-encodes,
        because a different view is a different encoding rather than a stale one.
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
