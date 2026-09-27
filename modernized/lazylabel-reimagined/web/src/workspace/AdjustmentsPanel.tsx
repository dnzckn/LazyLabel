/**
 * The sliders that drive RULE-028's display adjustments.
 *
 * The arithmetic is in `tools/adjustments.ts` and matches legacy, including its
 * negative-brightness fold.
 *
 * LEGACY'S WORDS, AND NOTHING MORE (the owner, 2026-09-26: "have you ever seen a gui with a
 * paragraph there written to it"). The rows are labelled as `adjustments_widget.py:65-110` labels
 * them, and what each does is in its tooltip, as there. Three notes this panel used to print are
 * decisions rather than labels, so they are kept here instead:
 *
 * - Negative brightness FOLDS: cv2.convertScaleAbs takes the absolute value, so the darkest pixels
 *   come back bright (RULE-028's recorded defect). It is kept because it is what legacy does.
 * - The adjustments change what is DISPLAYED and never the file. Whether they reach the model is
 *   legacy's Operate On View (RULE-089), a setting: off, the model sees the decoded image; on, the
 *   API renders what is on screen and a changed adjustment re-encodes.
 * - The annotation size scales the handles and outlines drawn over the picture, not the
 *   annotations, and unlike legacy's it holds its size on screen as the view zooms.
 *
 * THE SLIDERS ARE IN LEGACY'S UNITS, not the values the maths uses. Gamma's slider runs 1..200 for
 * 0.01..2.00 and saturation's 0..200 for 0.0..2.0, because those are the ranges a user's stored
 * settings were written in and the steps they are used to. Presenting gamma as a 0.01..2.00 float
 * input would be friendlier and would not round-trip the same values.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { DEFAULT_SETTINGS } from "@lazylabel/settings-schema";

import { NEUTRAL, adjustmentsFrom, isNeutral, type Adjustments } from "../tools/adjustments.js";
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
  // Legacy's Annotation Settings reset: size, pan speed and join threshold (annotation_settings_widget
  // .py:100-106, 196-200). The size lives here; the other two are in the settings dialog.
  const resetAnnotation = useCallback(() => {
    void save({
      ...settings,
      values: {
        ...settings.values,
        annotation_size_multiplier: DEFAULT_SETTINGS.annotation_size_multiplier,
        pan_multiplier: DEFAULT_SETTINGS.pan_multiplier,
        polygon_join_threshold: DEFAULT_SETTINGS.polygon_join_threshold,
      },
    });
  }, [save, settings]);

  return (
    <>
      {/* Legacy's rows and tooltips (adjustments_widget.py:65-97). */}
      <Slider
        label="Bright:"
        name="Brightness"
        tooltip="Adjust image brightness"
        min={-100}
        max={100}
        value={current.brightness}
        onChange={(v) => set("brightness", v)}
      />
      <Slider
        label="Contrast:"
        name="Contrast"
        tooltip="Adjust image contrast"
        min={-100}
        max={100}
        value={current.contrast}
        onChange={(v) => set("contrast", v)}
      />
      <Slider
        label="Gamma:"
        name="Gamma"
        tooltip="Adjust image gamma"
        min={GAMMA_SLIDER.min}
        max={GAMMA_SLIDER.max}
        value={Math.round(current.gamma * GAMMA_SLIDER.scale)}
        display={current.gamma.toFixed(2)}
        scale={GAMMA_SLIDER.scale}
        onChange={(v) => set("gamma", v / GAMMA_SLIDER.scale)}
      />
      <Slider
        label="Saturate:"
        name="Saturation"
        tooltip="Adjust image saturation (0 = grayscale)"
        min={SATURATION_SLIDER.min}
        max={SATURATION_SLIDER.max}
        value={Math.round(current.saturation * SATURATION_SLIDER.scale)}
        display={current.saturation.toFixed(2)}
        scale={SATURATION_SLIDER.scale}
        onChange={(v) => set("saturation", v / SATURATION_SLIDER.scale)}
      />

      {/* The drawing aids rather than the picture: legacy's Annotation Settings "Size:" row
          (annotation_settings_widget.py:69-77), whose slider is `value / 10`, so its 10 is this
          app's 1.0. Its "(Ctrl +/-)" is left out of the tooltip: those keys zoom the image here. */}
      <Slider
        label="Annotation size"
        name="Annotation size"
        tooltip="Adjusts the size of points and lines"
        min={ANNOTATION_SLIDER.min}
        max={ANNOTATION_SLIDER.max}
        value={Math.round(annotationSize * ANNOTATION_SLIDER.scale)}
        display={annotationSize.toFixed(1)}
        scale={ANNOTATION_SLIDER.scale}
        onChange={(v) => setValue("annotation_size_multiplier", v / ANNOTATION_SLIDER.scale)}
      />
      <button
        type="button"
        onClick={resetAnnotation}
        title="Reset annotation size, pan speed, and join threshold to defaults."
      >
        Reset Annotation Settings
      </button>

      <button
        type="button"
        onClick={reset}
        disabled={isNeutral(current)}
        title="Reset brightness, contrast, gamma, and saturation to defaults."
      >
        Reset Image Adjustments
      </button>
    </>
  );
}

function Slider({
  label,
  name,
  tooltip,
  min,
  max,
  value,
  display,
  scale,
  onChange,
}: {
  /** What the row shows, which is legacy's short label. */
  readonly label: string;
  /** What the slider is called to a screen reader, where "Bright:" would be a clipped word. */
  readonly name: string;
  readonly tooltip: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly display?: string;
  /** Slider steps per unit shown, for a value typed in: gamma 100, size 10. None: whole numbers. */
  readonly scale?: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  /*
   * LEGACY'S TYPE-IN BOX beside each slider (adjustments_widget.py:40-60, 150-205;
   * annotation_settings_widget.py:40-60, 125-140). On Enter or leaving it, the text is read as
   * legacy's does -- `int(text)`, or `int(float(text) * scale)`, which truncates -- clamped to the
   * slider's range and applied; text that is not a number goes back to the value (CP-51).
   */
  const shown = display ?? String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const trimmed = text.trim();
    const typed = scale === undefined ? (/^[+-]?\d+$/.test(trimmed) ? Number(trimmed) : NaN) : Number(trimmed);
    if (trimmed === "" || !Number.isFinite(typed)) {
      setText(shown);
      return;
    }
    const next = Math.max(min, Math.min(max, Math.trunc(scale === undefined ? typed : typed * scale)));
    if (next === value) setText(shown);
    else onChange(next);
  };
  return (
    <label className="adjustment" title={tooltip}>
      <span className="adjustment__label">
        {label}{" "}
        <input
          type="text"
          className="adjustment__value"
          size={4}
          value={text}
          aria-label={`${name}, typed`}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={name}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
