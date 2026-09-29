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
 *
 * THE SLIDERS ARE IN LEGACY'S UNITS, not the values the maths uses. Gamma's slider runs 1..200 for
 * 0.01..2.00 and saturation's 0..200 for 0.0..2.0, because those are the ranges a user's stored
 * settings were written in and the steps they are used to. Presenting gamma as a 0.01..2.00 float
 * input would be friendlier and would not round-trip the same values.
 *
 * The annotation size and its reset were here too until 2026-09-29. They are legacy's Annotation
 * Settings group's, a section of its own above this one (`AnnotationSettingsPanel.tsx`).
 */

import { useCallback, type ReactNode } from "react";

import { NEUTRAL, adjustmentsFrom, isNeutral, type Adjustments } from "../tools/adjustments.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { SliderRow } from "./SliderRow.jsx";

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
      {/* Legacy's rows and tooltips (adjustments_widget.py:65-97). */}
      <SliderRow
        label="Bright:"
        name="Brightness"
        tooltip="Adjust image brightness"
        min={-100}
        max={100}
        value={current.brightness}
        onChange={(v) => set("brightness", v)}
      />
      <SliderRow
        label="Contrast:"
        name="Contrast"
        tooltip="Adjust image contrast"
        min={-100}
        max={100}
        value={current.contrast}
        onChange={(v) => set("contrast", v)}
      />
      <SliderRow
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
      <SliderRow
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
