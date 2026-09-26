/**
 * Rescale — the controls over RULE-032, and RULE-031's presets, as legacy's `RescaleWidget`
 * (`ui/widgets/rescale_widget.py:183-441`) lays them out: a title row with its buttons, the slider,
 * one line of status under it.
 *
 * THE RULES RUN ON THE SERVER, and this panel only asks. They belong before the 16-bit to 8-bit
 * conversion and the browser only ever receives what comes after it, so applying a rescale here
 * would quantise a 16-bit image to 256 levels and then stretch those. `workspace/processing.ts`
 * turns what is set here into the query the pixels URL carries.
 *
 * GRAYSCALE ONLY (RULE-032), where grayscale is decided from the pixels (RULE-024). The widget is
 * always there, as legacy's is; without a grayscale image its slider and buttons are disabled and
 * the status line says why (lines 248, 264-283). Reset is legacy's, clearing the window and any
 * preset (lines 229-235, 320-328).
 *
 * THE WINDOW IS ONE SLIDER WITH TWO HANDLES that cannot pass each other (`RescaleSlider.tsx`). A
 * window at the full range is no window at all, as legacy's `has_active_rescaling` says
 * (lines 330-339), so it is not sent.
 *
 * The presets are radios where legacy has a histogram dialog (`CONTROL_PARITY.md` CP-45).
 */

import { useCallback, type ReactNode } from "react";

import {
  MAX_16_BIT,
  MAX_8_BIT,
  PRESET_DEFAULTS,
  rescaleApplies,
  type Preset,
} from "./processing.js";
import { RescaleSlider } from "./RescaleSlider.jsx";
import type { Window } from "./rescaleSlider.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";

/** Legacy's status line under the slider, word for word (`rescale_widget.py:248, 282, 297-299`). */
export function rescaleInfo(sourceChannels: number | null, maximum: number): string {
  if (sourceChannels === null) return "Load a grayscale image to enable";
  if (!rescaleApplies(sourceChannels)) return "RGB image — rescale disabled";
  return `Range: 0–${maximum}  |  Drag handles to rescale`;
}

export function RescalePanel(): ReactNode {
  const { open, processing, setProcessing } = useWorkspace();
  const metadata = open?.metadata ?? null;
  const grayscale = metadata !== null && rescaleApplies(metadata.sourceChannels);
  const maximum = metadata?.sourceDepth === 16 ? MAX_16_BIT : MAX_8_BIT;

  const setWindow = useCallback(
    ({ min, max }: Window) => {
      // Moving a handle clears any preset (rescale_widget.py:305-314). Leaving both set would send
      // a request the API refuses. The full range is legacy's "no rescaling" (lines 330-339).
      const full = min === 0 && max === maximum;
      setProcessing({ ...processing, preset: null, rescale: full ? null : { min, max } });
    },
    [maximum, processing, setProcessing],
  );

  const setPreset = useCallback(
    (preset: Preset | null) => {
      // The other half of the same exclusivity: choosing a preset drops the manual window.
      setProcessing({ ...processing, preset, rescale: null });
    },
    [processing, setProcessing],
  );

  const window = grayscale ? (processing.rescale ?? { min: 0, max: maximum }) : { min: 0, max: maximum };

  return (
    <div className="rescale">
      <div className="rescale__title">
        <span className="rescale__name">Rescale (Min/Max)</span>
        <button
          type="button"
          className="rescale__reset"
          title="Reset rescale to full range"
          disabled={!grayscale}
          onClick={() => setProcessing({ ...processing, preset: null, rescale: null })}
        >
          Reset
        </button>
      </div>

      <RescaleSlider maximum={maximum} window={window} enabled={grayscale} onChange={setWindow} />

      <span className="processing__info">{rescaleInfo(metadata?.sourceChannels ?? null, maximum)}</span>

      {grayscale && (
        <fieldset className="split__link">
          <legend>Preset</legend>
          {([
            ["none", "None"],
            ["stretch", "Contrast stretch"],
            ["equalize", "Equalize"],
            ["clahe", "CLAHE"],
          ] as const).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="histogram-preset"
                checked={(processing.preset?.kind ?? "none") === value}
                aria-label={label}
                onChange={() => setPreset(value === "none" ? null : { ...PRESET_DEFAULTS[value] })}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
