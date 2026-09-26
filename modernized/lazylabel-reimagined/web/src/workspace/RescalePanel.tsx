/**
 * Rescale — the controls over RULE-032, and RULE-031's presets, in legacy's "Rescale" section.
 *
 * THE RULES RUN ON THE SERVER, and this panel only asks. They belong before the 16-bit to 8-bit
 * conversion and the browser only ever receives what comes after it, so applying a rescale here
 * would quantise a 16-bit image to 256 levels and then stretch those. `workspace/processing.ts`
 * turns what is set here into the query the pixels URL carries.
 *
 * GRAYSCALE ONLY (RULE-032), where grayscale is decided from the pixels (RULE-024). What it says
 * otherwise is legacy's own info line (`ui/widgets/rescale_widget.py:248, 269-287`), and Reset is
 * legacy's, clearing the window and any preset (lines 229-232, 320-328).
 *
 * The window is two sliders where legacy has one with two handles, and the presets are radios
 * where legacy has a histogram dialog (`CONTROL_PARITY.md` CP-29, CP-45).
 */

import { useCallback, type ReactNode } from "react";

import {
  MAX_16_BIT,
  MAX_8_BIT,
  PRESET_DEFAULTS,
  rescaleApplies,
  type Preset,
} from "./processing.js";
import { ProcessingSlider } from "./ProcessingSlider.jsx";
import { useWorkspace } from "./WorkspaceProvider.jsx";

export function RescalePanel(): ReactNode {
  const { open, processing, setProcessing } = useWorkspace();
  const metadata = open?.metadata ?? null;

  const setWindow = useCallback(
    (min: number, max: number) => {
      // RULE-031's edge case: "dragging the rescale handles clears any preset". Leaving both set
      // would send a request the API refuses.
      setProcessing({ ...processing, preset: null, rescale: { min, max } });
    },
    [processing, setProcessing],
  );

  const setPreset = useCallback(
    (preset: Preset | null) => {
      // The other half of the same exclusivity: choosing a preset drops the manual window.
      setProcessing({ ...processing, preset, rescale: null });
    },
    [processing, setProcessing],
  );

  if (metadata === null) return <p className="processing__info">Load a grayscale image to enable</p>;
  if (!rescaleApplies(metadata.sourceChannels)) {
    return <p className="processing__info">RGB image — rescale disabled</p>;
  }

  const maximum = metadata.sourceDepth === 16 ? MAX_16_BIT : MAX_8_BIT;
  const window = processing.rescale;

  return (
    <div className="rescale">
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

      <ProcessingSlider
        label="Rescale low"
        max={maximum}
        value={window?.min ?? 0}
        onChange={(value) => setWindow(value, window?.max ?? maximum)}
      />
      <ProcessingSlider
        label="Rescale high"
        max={maximum}
        value={window?.max ?? maximum}
        onChange={(value) => setWindow(window?.min ?? 0, value)}
      />

      <div className="rescale__foot">
        <span className="processing__info">{`Range: 0–${maximum}  |  Drag handles to rescale`}</span>
        <button
          type="button"
          title="Reset rescale to full range"
          onClick={() => setProcessing({ ...processing, preset: null, rescale: null })}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
