/**
 * Legacy's Annotation Settings group: Size, Pan and Join, each a slider with its type-in box, and
 * "Reset Annotation Settings" under them (`annotation_settings_widget.py:29-106`). Its own section
 * in the Image tab, between FFT Threshold and Image Adjustments, as legacy's is
 * (`control_panel.py:521-531`).
 *
 * UNTIL 2026-09-29 THE THREE WERE APART: the size under Image Adjustments, with the reset, and Pan
 * and Join as number fields in a Settings dialog, which the owner did not find ("ensure all the
 * settings that were in pyqt6 are implemented and avilable here too").
 *
 * LEGACY'S UNITS. Size and Pan are sliders of tenths, 1..50 and 1..100, so a slider's 10 is a
 * multiplier of 1.0; Join is whole pixels, 1..10 (`annotation_settings_widget.py:69-93, 123-167`).
 * A typed value is read and clamped as legacy's is, when editing finishes (RULE-050): 25 in Join is
 * 10, 0 in Pan is 0.1, and what is not a number goes back.
 *
 * What each changes: the size, what is drawn over the picture -- handles, points, outlines -- and
 * not the annotations (`canvas/sizing.ts`); Pan, the step the W, A, S and D keys move the zoomed
 * image by (`canvas/panStep.ts`); Join, how near the first vertex a click closes a polygon
 * (`tools/polygon.ts`).
 */

import { useCallback, type ReactNode } from "react";

import { DEFAULT_SETTINGS } from "@lazylabel/settings-schema";

import { useSettings } from "../settings/SettingsProvider.jsx";
import { SliderRow } from "./SliderRow.jsx";

/** Legacy's three sliders (`annotation_settings_widget.py:69-93`). */
const SIZE_SLIDER = { min: 1, max: 50, scale: 10 };
const PAN_SLIDER = { min: 1, max: 100, scale: 10 };
const JOIN_SLIDER = { min: 1, max: 10 };

/** A stored number, or the fallback when a hand-edited file holds nonsense or nothing. */
function positive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function AnnotationSettingsPanel(): ReactNode {
  const { settings, save } = useSettings();

  const setValue = useCallback(
    (key: string, value: number) => {
      void save({ ...settings, values: { ...settings.values, [key]: value } });
    },
    [save, settings],
  );

  // The MULTIPLIER itself, not `sizingFrom(...).point`, which folds in the point radius: the
  // slider would show a combined figure, and writing it back would multiply the ratio a second
  // time, so every drag would make the handles grow.
  const size = positive(settings.values["annotation_size_multiplier"], 1);
  const pan = positive(settings.values["pan_multiplier"], 1);
  const join = positive(settings.values["polygon_join_threshold"], 2);
  const tenths = (value: number, slider: { readonly min: number; readonly max: number }) =>
    Math.min(slider.max, Math.max(slider.min, Math.round(value * 10)));

  // Legacy's reset: size 1.0, pan 1.0, join 2 (annotation_settings_widget.py:100-106, 196-200).
  const reset = useCallback(() => {
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
      {/* Legacy's rows and tooltips. Size's "(Ctrl +/-)" is left out: those keys zoom the image
          here, by the owner's decision of 2026-09-26. Pan's second sentence, "Hold Shift for 5x
          boost.", is too: this app has no Shift boost. */}
      <SliderRow
        label="Size:"
        name="Annotation size"
        tooltip="Adjusts the size of points and lines"
        min={SIZE_SLIDER.min}
        max={SIZE_SLIDER.max}
        value={tenths(size, SIZE_SLIDER)}
        display={size.toFixed(1)}
        scale={SIZE_SLIDER.scale}
        onChange={(v) => setValue("annotation_size_multiplier", v / SIZE_SLIDER.scale)}
      />
      <SliderRow
        label="Pan:"
        name="Pan speed"
        tooltip="Adjusts the speed of WASD panning."
        min={PAN_SLIDER.min}
        max={PAN_SLIDER.max}
        value={tenths(pan, PAN_SLIDER)}
        display={pan.toFixed(1)}
        scale={PAN_SLIDER.scale}
        onChange={(v) => setValue("pan_multiplier", v / PAN_SLIDER.scale)}
      />
      <SliderRow
        label="Join:"
        name="Join threshold"
        tooltip="The pixel distance to 'snap' a polygon closed."
        min={JOIN_SLIDER.min}
        max={JOIN_SLIDER.max}
        value={Math.min(JOIN_SLIDER.max, Math.max(JOIN_SLIDER.min, Math.round(join)))}
        onChange={(v) => setValue("polygon_join_threshold", v)}
      />
      <button
        type="button"
        onClick={reset}
        title="Reset annotation size, pan speed, and join threshold to defaults."
      >
        Reset Annotation Settings
      </button>
    </>
  );
}
